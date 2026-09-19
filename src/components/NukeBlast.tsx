import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  RingGeometry,
  type BufferGeometry,
} from 'three'
import { playNuke } from '../audio/sfx'
import {
  CAP_RADIUS,
  CLOUD_MS,
  EMBER_COLOR,
  FALL_HEIGHT,
  FALL_MS,
  FIREBALL_RADIUS,
  FIRE_COLOR,
  FLASH_COLOR,
  FLASH_MS,
  RING_RADIUS,
  SMOKE_COLOR,
  STEM_HEIGHT,
  SWEEP_MS,
  TOTAL_MS,
} from '../config/annihilation'
import { shake } from '../state/cameraShake'
import { now as gameNow } from '../state/gameClock'
import { useGameStore } from '../store/useGameStore'
import { faceted } from './environment/faceted'
import { toonGradient } from './models/toonGradient'

/**
 * Le champignon — ce que le code de triche donne à voir.
 *
 * Monté en permanence et invisible par défaut, comme la traînée de lame : la
 * séquence dure cinq secondes, se joue au plus une fois par partie, et la
 * monter à la demande obligerait à compiler ses cinq matériaux au pire moment
 * possible — la frame de l'explosion.
 *
 * **Rien ici n'est piloté par React.** Le composant ne s'abonne à aucun champ
 * du store : il relit `annihilation` à chaque frame et en déduit tout. C'est la
 * discipline de `StrikeArc` et des ennemis, pour la même raison — une séquence
 * de cinq secondes qui re-rendrait l'arbre à chaque étape rendrait les étapes
 * responsables les unes des autres.
 *
 * Les six pièces, dans leur ordre d'apparition :
 *
 *  1. **l'ogive**, qui tombe en accélérant ;
 *  2. **l'éclair**, une sphère blanche qui avale l'écran un tiers de seconde ;
 *  3. **la boule de feu**, qui gonfle, monte et refroidit du jaune au rouge ;
 *  4. **l'anneau de souffle**, plaqué au sol, qui part vers l'horizon ;
 *  5. **le pied** du champignon, qui monte pendant que la boule s'éteint ;
 *  6. **la coiffe**, qui s'ouvre au sommet du pied et retombe en fumée.
 *
 * Aucune n'a de collider et aucune n'appartient à la physique : ce qui tue les
 * ennemis, c'est le rayon calculé par `killRadius`, lu de leur côté. Le
 * spectacle et l'effet sont volontairement séparés — un champignon qui
 * *pousserait* des corps dépendrait du framerate.
 */

// --- Géométries, construites une fois pour toutes ---------------------------

/**
 * Sphère grossière et facettée pour tout ce qui est « masse » — l'éclair, la
 * boule de feu, la coiffe. Subdivision 1 et non 2 : à 1, un icosaèdre a
 * quatre-vingts faces, assez pour lire comme une boule et assez peu pour garder
 * la découpe anguleuse de tout le reste du décor.
 */
const blobGeometry = faceted(new IcosahedronGeometry(1, 1))

/**
 * Pied du champignon : un tronc de cône, plus large en bas.
 *
 * Ouvert aux deux bouts (`openEnded`), et ce n'est pas une économie de faces :
 * le bas est enfoui dans la boule de feu et le haut dans la coiffe, donc les
 * deux disques ne seraient jamais visibles — mais ils *seraient* traversés par
 * la caméra si le joueur s'approchait, ce qui laisse voir l'intérieur du cône.
 */
const stemGeometry = faceted(
  new CylinderGeometry(0.62, 1, 1, 10, 1, true),
).translate(0, 0.5, 0)

/**
 * Anneau de souffle, couché au sol.
 *
 * Rayon unitaire de 0,86 à 1 : l'épaisseur est **relative**, donc l'anneau
 * s'élargit en même temps qu'il s'étend. Un anneau d'épaisseur fixe mis à
 * l'échelle 120 deviendrait un trait d'un pixel avant d'avoir quitté l'écran.
 */
const ringGeometry = new RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2)

/** Corps de l'ogive : un fuseau sombre, plus une empennage en croix. */
const shellGeometry = faceted(new IcosahedronGeometry(0.42, 0)).scale(1, 2.6, 1)
const finGeometry = faceted(new CylinderGeometry(0.06, 0.06, 1.5, 4)).rotateZ(
  Math.PI / 2,
)

/** Maillage dont on pilote le matériau à chaque frame. */
type BasicMesh = Mesh<BufferGeometry, MeshBasicMaterial>
type ToonMesh = Mesh<BufferGeometry, MeshToonMaterial>

// Couleurs de travail : la boule de feu interpole entre deux teintes à chaque
// frame, et allouer un `Color` par frame ferait travailler le GC pour rien.
const fire = new Color(FIRE_COLOR)
const ember = new Color(EMBER_COLOR)

/** Interpolation lissée entre 0 et 1, bornes comprises. */
function ramp(value: number, from: number, to: number) {
  return Math.min(1, Math.max(0, (value - from) / (to - from)))
}

export function NukeBlast() {
  const root = useRef<Group>(null)
  const shell = useRef<Group>(null)
  const flash = useRef<BasicMesh>(null)
  const fireball = useRef<BasicMesh>(null)
  const ring = useRef<BasicMesh>(null)
  const stem = useRef<ToonMesh>(null)
  const cap = useRef<ToonMesh>(null)

  /**
   * Horodatage de la frappe dont le souffle a déjà été joué.
   *
   * Un drapeau consommé, et non un test d'appartenance à un intervalle : la
   * frame qui franchit l'impact peut tomber n'importe où, et « sommes-nous
   * entre 900 et 950 ms ? » sauterait l'explosion sur une machine lente. C'est
   * le même piège que la fenêtre de dégâts de l'épée, et il ne coûte rien de ne
   * pas le repayer. L'horodatage plutôt qu'un booléen pour que deux frappes
   * successives — deux parties de suite — ne se gênent pas.
   */
  const boomed = useRef(-Infinity)

  useFrame(() => {
    const group = root.current
    if (!group) return

    const store = useGameStore.getState()
    const blast = store.annihilation
    if (!blast) {
      group.visible = false
      return
    }

    const elapsed = gameNow() - blast.at
    if (elapsed >= TOTAL_MS) {
      group.visible = false
      store.finishAnnihilation()
      return
    }

    group.visible = true
    group.position.set(blast.x, blast.y, blast.z)

    // --- L'ogive ------------------------------------------------------------
    // Chute en t² : une descente linéaire se lit comme un objet posé sur un
    // câble. L'accélération est ce qui fait une chute.
    const falling = elapsed < FALL_MS
    if (shell.current) {
      shell.current.visible = falling
      if (falling) {
        const t = elapsed / FALL_MS
        shell.current.position.y = FALL_HEIGHT * (1 - t * t)
        // Une rotation lente sur l'axe vertical : l'ogive est un fuseau, sans
        // ce mouvement rien ne dit qu'elle tombe plutôt qu'elle ne grossit.
        shell.current.rotation.y = t * 3.4
      }
    }

    const since = elapsed - FALL_MS
    if (since < 0) {
      // Rien d'autre n'existe encore. Sortir ici plutôt que de laisser chaque
      // pièce se calculer une échelle nulle : c'est aussi ce qui garantit que
      // le souffle ne peut pas être joué avant l'impact.
      hideAfterFall(flash, fireball, ring, stem, cap)
      return
    }

    // --- Le souffle, une fois ----------------------------------------------
    if (boomed.current !== blast.at) {
      boomed.current = blast.at
      playNuke()
      // Chronométrée en temps réel comme toutes les secousses (voir
      // `state/cameraShake.ts`). Sept fois l'amplitude d'une mort d'ennemi et
      // sept fois sa durée : c'est le seul événement du jeu qui a le droit de
      // secouer l'image aussi longtemps.
      shake(0.55, 900)
    }

    // --- L'éclair -----------------------------------------------------------
    if (flash.current) {
      const t = ramp(since, 0, FLASH_MS)
      flash.current.visible = t < 1
      // Sortie cubique : le cœur blanc s'ouvre d'un coup puis ralentit, ce que
      // fait une détonation. Une rampe linéaire donne un ballon qu'on gonfle.
      const ease = 1 - (1 - t) ** 3
      flash.current.scale.setScalar(FIREBALL_RADIUS * (0.4 + 1.5 * ease))
      flash.current.material.opacity = 1 - t
    }

    // --- La boule de feu ----------------------------------------------------
    if (fireball.current) {
      const grow = ramp(since, 0, 620)
      const fade = ramp(since, 900, 2200)
      fireball.current.visible = fade < 1
      fireball.current.scale.setScalar(FIREBALL_RADIUS * (1 - (1 - grow) ** 3))
      // Elle monte en s'éteignant : c'est ce mouvement qui la transforme en
      // tête de champignon plutôt qu'en flaque de feu.
      fireball.current.position.y = FIREBALL_RADIUS * 0.55 + fade * STEM_HEIGHT * 0.35
      fireball.current.material.color.copy(fire).lerp(ember, fade)
      fireball.current.material.opacity = 1 - fade
    }

    // --- L'anneau de souffle ------------------------------------------------
    if (ring.current) {
      const t = ramp(since, 0, SWEEP_MS)
      ring.current.visible = t < 1
      // Sortie quadratique : l'onde part vite et ralentit. Elle n'est pas
      // *exactement* le rayon mortel de `killRadius`, qui est linéaire — et
      // c'est assumé. L'anneau est du décor, il doit être lisible ; le rayon qui
      // tue est une règle, il doit être prévisible. Les deux se croisent au
      // milieu du balayage, ce qui suffit à ce que l'un raconte l'autre.
      ring.current.scale.setScalar(Math.max(0.001, RING_RADIUS * (1 - (1 - t) ** 2)))
      ring.current.material.opacity = 0.75 * (1 - t) ** 1.5
    }

    // --- Le pied ------------------------------------------------------------
    if (stem.current) {
      const rise = ramp(since, 320, 2400)
      const fade = ramp(since, CLOUD_MS - 1400, CLOUD_MS)
      stem.current.visible = rise > 0 && fade < 1
      // Le pied monte plus vite qu'il ne s'élargit : la colonne doit rester
      // élancée, sinon le champignon se lit comme un nuage rond.
      stem.current.scale.set(
        2.4 + rise * 1.1,
        STEM_HEIGHT * (1 - (1 - rise) ** 2),
        2.4 + rise * 1.1,
      )
      stem.current.material.opacity = 0.9 * (1 - fade)
      // Il refroidit du bas vers le haut comme la boule : la braise reste dans
      // la colonne bien après que la boule de feu a disparu.
      stem.current.material.emissiveIntensity = 0.9 * (1 - ramp(since, 400, 2600))
    }

    // --- La coiffe ----------------------------------------------------------
    if (cap.current) {
      const bloom = ramp(since, 900, 2900)
      const fade = ramp(since, CLOUD_MS - 1600, CLOUD_MS)
      cap.current.visible = bloom > 0 && fade < 1
      const spread = CAP_RADIUS * (1 - (1 - bloom) ** 3)
      // Aplatie de moitié, et c'est ce qui fait la silhouette : une sphère
      // pleine au bout d'une colonne donne un champignon de dessin animé, un
      // disque épais donne l'enclume des photos d'essais.
      cap.current.scale.set(spread, spread * 0.5, spread)
      cap.current.position.y = STEM_HEIGHT * (0.72 + bloom * 0.28)
      cap.current.rotation.y = since * 0.00016
      cap.current.material.opacity = 0.92 * (1 - fade)
      cap.current.material.emissiveIntensity = 0.7 * (1 - ramp(since, 1200, 3200))
    }
  })

  return (
    <group ref={root} visible={false}>
      {/* L'ogive : un fuseau sombre et son empennage en croix. Volontairement
          mate et sans émissif — c'est la seule pièce de la séquence qui doit
          se lire comme un objet et non comme de la lumière. */}
      <group ref={shell}>
        <mesh geometry={shellGeometry}>
          <meshToonMaterial gradientMap={toonGradient} color="#3d4147" />
        </mesh>
        <mesh geometry={finGeometry} position={[0, -0.9, 0]}>
          <meshToonMaterial gradientMap={toonGradient} color="#2a2d31" />
        </mesh>
        <mesh geometry={finGeometry} position={[0, -0.9, 0]} rotation-y={Math.PI / 2}>
          <meshToonMaterial gradientMap={toonGradient} color="#2a2d31" />
        </mesh>
      </group>

      {/*
        Éclair et boule de feu sont en `meshBasicMaterial` : ils ne sont pas
        éclairés, ils *sont* la lumière. Un matériau toon les aurait assombris
        du côté opposé au soleil, ce qui n'a aucun sens pour une explosion — et
        c'est leur couleur pure qui franchit le seuil du bloom.

        `depthWrite` désactivé sur les trois calques transparents : sans ça, le
        premier dessiné masque les suivants dans le tampon de profondeur, et la
        boule de feu disparaît derrière son propre éclair.
      */}
      <mesh ref={flash} geometry={blobGeometry}>
        <meshBasicMaterial color={FLASH_COLOR} transparent depthWrite={false} />
      </mesh>

      <mesh ref={fireball} geometry={blobGeometry}>
        <meshBasicMaterial color={FIRE_COLOR} transparent depthWrite={false} />
      </mesh>

      {/* `DoubleSide` : l'anneau est couché au sol et le joueur peut se
          retrouver dessous, en contrebas d'une falaise. */}
      <mesh ref={ring} geometry={ringGeometry} position={[0, 0.35, 0]}>
        <meshBasicMaterial
          color={FLASH_COLOR}
          transparent
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/*
        Le pied et la coiffe, eux, sont de la **matière** : de la fumée, éclairée
        par le même soleil que le reste du décor, avec le même dégradé toon. Leur
        émissif décroissant est la braise qui refroidit dedans.

        `DoubleSide` sur le pied, qui est un cône creux : les deux parois sont
        dessinées, donc leurs opacités se cumulent là où le regard traverse le
        plus de matière — au centre de la colonne. C'est ce cumul, gratuit, qui
        donne l'épaisseur ; une seule paroi rendrait une silhouette plate.
      */}
      <mesh ref={stem} geometry={stemGeometry}>
        <meshToonMaterial
          gradientMap={toonGradient}
          color={SMOKE_COLOR}
          emissive={EMBER_COLOR}
          emissiveIntensity={0.9}
          transparent
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      <mesh ref={cap} geometry={blobGeometry}>
        <meshToonMaterial
          gradientMap={toonGradient}
          color={SMOKE_COLOR}
          emissive={EMBER_COLOR}
          emissiveIntensity={0.7}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/**
 * Range tout ce qui naît de l'explosion, tant que l'ogive tombe encore.
 *
 * Une fonction et non cinq lignes en ligne : c'est exactement le genre de liste
 * à laquelle on oublie d'ajouter la sixième pièce, et l'oubli ne se voit qu'une
 * seconde avant l'impact, pendant une frappe qu'on ne rejoue pas facilement.
 */
function hideAfterFall(
  ...parts: Array<{ current: { visible: boolean } | null }>
) {
  for (const part of parts) {
    if (part.current) part.current.visible = false
  }
}
