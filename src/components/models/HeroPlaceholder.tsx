import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Outlines } from '@react-three/drei'
import { DoubleSide, Group, MathUtils } from 'three'
import type { OutfitId, WeaponId } from '../../config/items'
import { ATTACK, PLAYER } from '../../config/gameplay'
import { now as gameNow } from '../../state/gameClock'
import { playerTransform } from '../../state/playerTransform'
import { toonGradient } from './toonGradient'

/**
 * Personnage de remplacement, entièrement procédural.
 *
 * Aucun asset externe : la silhouette est construite en primitives et animée
 * à la main (cycle de marche, pose aérienne, coup d'épée). Les proportions
 * sont volontairement "chibi" — grosse tête, petit corps — comme dans
 * Wind Waker : c'est ce qui fait lire la silhouette, pas le nombre de polygones.
 *
 * Convention : l'avant du modèle est +Z, la main droite du personnage est
 * donc du côté -X (right = forward × up en repère main droite).
 *
 * **Les tenues et les armes sont des habillages d'un rig unique.** Quand la
 * tenue du clan est arrivée, la tentation était d'écrire un second personnage à
 * côté ; ça aurait fait deux cycles de marche à régler, deux animations
 * d'attaque à garder synchrones, et la garantie qu'elles divergent au premier
 * ajustement. Ce qui change d'une tenue à l'autre est donc strictement : la
 * palette, la pièce de tête, l'équipement de buste, et l'habillage des membres ;
 * d'une arme à l'autre, seule la géométrie tenue en main droite. Le squelette et
 * toutes les animations sont partagés.
 */

/** Palette d'une tenue. Toutes les tenues déclarent exactement ces teintes. */
interface Palette {
  /** Vêtement principal du buste. */
  tunic: string
  /** Manches et jambes. */
  sleeve: string
  skin: string
  hair: string
  belt: string
  boot: string
  blade: string
  guard: string
  grip: string
  /** Ligature du katana : la seule teinte que l'épée de base n'utilise pas. */
  cord: string
  eye: string
  outline: string
  /** Teinte d'appoint : bouclier ou lamelles d'armure, selon la tenue. */
  gear: string
  /** Liseré de la pièce d'appoint : jonc du bouclier, ligature de l'armure. */
  gearTrim: string
}

/**
 * Palettes des tenues.
 *
 * La tenue du clan reprend exactement les teintes de `ItemIllustration` : la
 * carte de l'objet doit montrer ce qu'on va voir courir dans l'herbe. Le prune
 * et le cramoisi sont absents du reste du jeu — le rouge des cœurs est plus
 * clair et n'existe qu'au HUD, donc aucune confusion possible — et le
 * contre-jour parme de la scène détache la silhouette sombre du décor.
 */
const OUTFITS: Record<OutfitId, Palette> = {
  default: {
    tunic: '#3f9a4b',
    sleeve: '#f2ecd5',
    skin: '#f4c9a0',
    hair: '#e8c86a',
    belt: '#6b4423',
    boot: '#7a4a24',
    blade: '#dde6ef',
    guard: '#d0a53c',
    grip: '#5b3a1e',
    cord: '#2f4f66',
    eye: '#26241f',
    outline: '#1c2b1e',
    gear: '#b4763a',
    gearTrim: '#c9a227',
  },
  ninja: {
    tunic: '#4b4062',
    // Les bandages de lin, qui remplacent les manches claires. La teinte est
    // volontairement à peine cassée : du blanc pur aurait brillé plus que la
    // lame de l'épée.
    sleeve: '#ece4d4',
    skin: '#f0c39c',
    hair: '#1a1723',
    belt: '#7d1f22',
    boot: '#2f2a3d',
    blade: '#dde6ef',
    guard: '#d8a93f',
    grip: '#3a2a1e',
    cord: '#2f4f66',
    eye: '#1b1626',
    // Contour plus froid que celui de la tenue verte : un cerne brun sur du
    // prune vire au marron sale.
    outline: '#161226',
    gear: '#a8302f',
    gearTrim: '#d8a93f',
  },
}

/** Épaisseur du contour cel-shading, en unités monde. */
const OUTLINE = 0.028

/** Hauteurs de référence du "squelette". */
const HIP_Y = 0.44
const SHOULDER_Y = 0.9
const HEAD_Y = 1.2

/**
 * Interpolation sur une suite de clés `[temps, valeur]` avec temps dans [0, 1].
 * Smoothstep entre deux clés : assez pour lire une attaque, et infiniment plus
 * léger qu'un vrai système d'animation.
 */
function keyframe(t: number, frames: readonly (readonly [number, number])[]) {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i]
    if (t <= t1) {
      const [t0, v0] = frames[i - 1]
      const k = (t - t0) / (t1 - t0)
      return v0 + (v1 - v0) * (k * k * (3 - 2 * k))
    }
  }
  return frames[frames.length - 1][1]
}

/** Bras qui frappe : recul, frappe rapide vers l'avant, retour. */
const SWING_ARM = [
  [0, 0],
  [0.22, 2.5],
  [0.5, -1.2],
  [1, 0],
] as const

/** Torsion du bras pendant le coup, pour un arc plutôt qu'un axe pur. */
const SWING_TWIST = [
  [0, 0],
  [0.22, -0.35],
  [0.5, 0.45],
  [1, 0],
] as const

/** Le buste pivote avec le coup — c'est ce qui donne du poids à la frappe. */
const SWING_TORSO = [
  [0, 0],
  [0.22, 0.55],
  [0.5, -0.7],
  [1, 0],
] as const

interface HeroProps {
  outfit?: OutfitId
  weapon?: WeaponId
}

export function HeroPlaceholder({ outfit = 'default', weapon = 'sword' }: HeroProps) {
  const torso = useRef<Group>(null)
  const head = useRef<Group>(null)
  const headwear = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)

  /** Avance du cycle de marche, en radians. */
  const stridePhase = useRef(0)
  /** Transition sol vers air, lissée pour éviter les sauts de pose. */
  const airBlend = useRef(0)

  const palette = OUTFITS[outfit]
  const isNinja = outfit === 'ninja'

  useFrame((state, rawDelta) => {
    if (!torso.current || !legL.current || !legR.current) return
    if (!armL.current || !armR.current || !head.current || !headwear.current) return

    const delta = Math.min(rawDelta, 0.05)
    const time = state.clock.elapsedTime

    // Intensité de la marche : 0 à l'arrêt, 1 à pleine vitesse.
    const run = MathUtils.clamp(playerTransform.speed / PLAYER.speed, 0, 1)

    // La phase avance avec la distance parcourue, pas avec le temps : les pas
    // restent synchronisés au déplacement réel, sans effet de patinage.
    stridePhase.current += playerTransform.speed * delta * 2.6
    const stride = Math.sin(stridePhase.current)

    airBlend.current = MathUtils.damp(
      airBlend.current,
      playerTransform.grounded ? 0 : 1,
      14,
      delta,
    )
    const air = airBlend.current
    const ground = 1 - air

    // --- Attaque ------------------------------------------------------------
    const elapsed = gameNow() - playerTransform.attackStartedAt
    const attackProgress = elapsed / ATTACK.durationMs
    const attacking = attackProgress >= 0 && attackProgress <= 1

    // --- Jambes -------------------------------------------------------------
    // Au sol : balancier. En l'air : jambe avant repliée, jambe arrière tendue.
    legL.current.rotation.x = ground * stride * 0.85 * run + air * -0.75
    legR.current.rotation.x = ground * -stride * 0.85 * run + air * 0.45

    // --- Bras ---------------------------------------------------------------
    // Chaque bras oppose la jambe du même côté (démarche naturelle).
    armL.current.rotation.x = ground * -stride * 0.65 * run + air * 0.7

    if (attacking) {
      // L'attaque écrase complètement le balancier sur le bras armé.
      armR.current.rotation.x = keyframe(attackProgress, SWING_ARM)
      armR.current.rotation.z = keyframe(attackProgress, SWING_TWIST)
      torso.current.rotation.y = keyframe(attackProgress, SWING_TORSO)
    } else {
      armR.current.rotation.x = ground * stride * 0.65 * run + air * 0.7
      armR.current.rotation.z = MathUtils.damp(armR.current.rotation.z, 0, 12, delta)
      torso.current.rotation.y = MathUtils.damp(torso.current.rotation.y, 0, 12, delta)
    }

    // --- Buste et tête ------------------------------------------------------
    // Rebond vertical à chaque pas, respiration lente à l'arrêt.
    const bounce = Math.abs(Math.sin(stridePhase.current)) * 0.035 * run
    const breathe = Math.sin(time * 1.8) * 0.012 * (1 - run)
    torso.current.position.y = HIP_Y + bounce + breathe
    torso.current.rotation.x = 0.14 * run * ground

    // La tête compense l'inclinaison du buste : le regard reste horizontal.
    head.current.rotation.x = -0.1 * run * ground

    // La pièce de tête traîne derrière le mouvement — le détail qui vend
    // l'animation. Le bonnet et la crinière partagent ce ressort à un pas de
    // retard ; seules leurs amplitudes diffèrent, la masse de cheveux étant
    // plus lourde et plus ample qu'un bout de tissu.
    const lag = Math.sin(stridePhase.current - 0.6)
    headwear.current.rotation.x = isNinja
      ? -0.06 - lag * 0.16 * run - air * 0.34
      : -0.32 - lag * 0.12 * run - air * 0.25
    // Le balancement latéral n'existe que pour la crinière : un bonnet conique
    // qui roule sur l'axe Z se lit comme un défaut, une masse de cheveux qui
    // suit les épaules se lit comme du poids.
    if (isNinja) headwear.current.rotation.z = lag * 0.09 * run
  })

  return (
    <group>
      {/* --- Jambes : pivot à la hauteur des hanches --- */}
      <group ref={legL} position={[0.12, HIP_Y, 0]}>
        <Leg palette={palette} ninja={isNinja} />
      </group>
      <group ref={legR} position={[-0.12, HIP_Y, 0]}>
        <Leg palette={palette} ninja={isNinja} />
      </group>

      {/* --- Buste : porte les bras et la tête --- */}
      <group ref={torso} position={[0, HIP_Y, 0]}>
        {/* tunique évasée — ou manteau, plus long et plus fermé */}
        <mesh castShadow position={[0, 0.26, 0]}>
          {/* Le manteau est plus long et plus évasé que la tunique : c'est ce
              qui donne au ninja sa silhouette en cloche, lisible de loin. */}
          <cylinderGeometry args={isNinja ? [0.21, 0.36, 0.6, 14] : [0.2, 0.32, 0.54, 14]} />
          <meshToonMaterial color={palette.tunic} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>

        {/* ceinture */}
        <mesh castShadow position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.27, 0.28, 0.07, 14]} />
          <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
        </mesh>

        {isNinja ? <ClanArmor palette={palette} /> : <Shield palette={palette} />}

        {/* --- Bras : pivot à l'épaule --- */}
        <group ref={armL} position={[0.24, SHOULDER_Y - HIP_Y, 0]}>
          <Arm palette={palette} ninja={isNinja} side={1} />
        </group>
        <group ref={armR} position={[-0.24, SHOULDER_Y - HIP_Y, 0]}>
          <Arm palette={palette} ninja={isNinja} side={-1} />
          {weapon === 'katana' ? <Katana palette={palette} /> : <Sword palette={palette} />}
        </group>

        {/* --- Tête --- */}
        <group ref={head} position={[0, HEAD_Y - HIP_Y, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.26, 18, 16]} />
            <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={palette.outline} />
          </mesh>

          {/* oreilles pointues */}
          <mesh castShadow position={[0.25, 0.02, 0]} rotation={[0, 0, -1.9]}>
            <coneGeometry args={[0.07, 0.17, 8]} />
            <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
          </mesh>
          <mesh castShadow position={[-0.25, 0.02, 0]} rotation={[0, 0, 1.9]}>
            <coneGeometry args={[0.07, 0.17, 8]} />
            <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
          </mesh>

          {/* frange */}
          <mesh castShadow position={[0, 0.11, 0.03]} scale={[1, 0.62, 1]}>
            <sphereGeometry args={[0.265, 16, 14]} />
            <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
          </mesh>

          {/* Mèches qui retombent devant les tempes : c'est ce qui fait passer
              la coupe de « cheveux courts sombres » à « crinière ». */}
          {isNinja &&
            [0.2, -0.2].map((x) => (
              <mesh key={x} castShadow position={[x, -0.06, 0.16]} rotation={[0.22, 0, 0]}>
                <boxGeometry args={[0.09, 0.34, 0.06]} />
                <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
              </mesh>
            ))}

          {/* yeux : la face regarde +Z */}
          <mesh position={[0.09, 0.01, 0.235]} scale={[0.5, 1, 0.4]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshBasicMaterial color={palette.eye} />
          </mesh>
          <mesh position={[-0.09, 0.01, 0.235]} scale={[0.5, 1, 0.4]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshBasicMaterial color={palette.eye} />
          </mesh>

          {/* Pièce de tête, animée séparément : bonnet ou crinière. */}
          <group ref={headwear} position={[0, 0.16, 0]} rotation={[isNinja ? -0.06 : -0.32, 0, 0]}>
            {isNinja ? <Mane palette={palette} /> : <Cap palette={palette} />}
          </group>
        </group>
      </group>
    </group>
  )
}

/** Jambe : botte de cuir, ou mollet bandé de lin sur une sandale sombre. */
function Leg({ palette, ninja }: { palette: Palette; ninja: boolean }) {
  return (
    <group>
      <mesh castShadow position={[0, -0.16, 0]}>
        <capsuleGeometry args={[0.075, 0.16, 4, 10]} />
        <meshToonMaterial color={palette.sleeve} gradientMap={toonGradient} />
      </mesh>

      {/* Bandages : trois anneaux qui débordent du mollet. Ce sont les
          interstices entre eux, et non les anneaux, qui font lire du tissu
          enroulé plutôt qu'une guêtre d'une seule pièce. */}
      {ninja &&
        [-0.1, -0.18, -0.26].map((y) => (
          <mesh key={y} castShadow position={[0, y, 0]}>
            <cylinderGeometry args={[0.086, 0.086, 0.05, 10]} />
            <meshToonMaterial color={palette.sleeve} gradientMap={toonGradient} />
          </mesh>
        ))}

      <mesh castShadow position={[0, -0.35, 0.02]}>
        <boxGeometry args={[0.17, ninja ? 0.1 : 0.14, 0.22]} />
        <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
    </group>
  )
}

/** Bras et main, suspendus sous le pivot d'épaule. */
function Arm({
  palette,
  ninja,
  side,
}: {
  palette: Palette
  ninja: boolean
  /** +1 pour le bras gauche du modèle, -1 pour le droit. Oriente l'épaulière. */
  side: number
}) {
  return (
    <group>
      <mesh castShadow position={[0, -0.14, 0]}>
        <capsuleGeometry args={[0.06, 0.16, 4, 10]} />
        <meshToonMaterial color={palette.sleeve} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Épaulière à lamelles : trois plaques qui s'écartent vers l'extérieur.
          C'est la pièce la plus reconnaissable de la tenue, et la seule qui
          élargisse vraiment la silhouette vue de face. */}
      {ninja &&
        [0, 1, 2].map((row) => (
          <mesh
            key={row}
            castShadow
            position={[side * (0.03 + row * 0.022), 0.02 - row * 0.062, 0]}
            rotation={[0, 0, side * -0.22]}
          >
            <boxGeometry args={[0.15, 0.055, 0.19]} />
            <meshToonMaterial
              color={row % 2 === 0 ? palette.gear : palette.belt}
              gradientMap={toonGradient}
            />
            {row === 0 && <Outlines thickness={OUTLINE} color={palette.outline} />}
          </mesh>
        ))}

      {/* Bandage d'avant-bras, sous l'épaulière. */}
      {ninja && (
        <mesh castShadow position={[0, -0.2, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.11, 10]} />
          <meshToonMaterial color={palette.sleeve} gradientMap={toonGradient} />
        </mesh>
      )}

      <mesh castShadow position={[0, -0.27, 0]}>
        <sphereGeometry args={[0.065, 10, 10]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/** Bouclier dans le dos (l'arrière du modèle est -Z). Tenue par défaut. */
function Shield({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh castShadow position={[0.03, 0.3, -0.21]} rotation={[0.1, 0, 0.15]}>
        <cylinderGeometry args={[0.19, 0.19, 0.045, 12]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh position={[0.03, 0.3, -0.235]} rotation={[0.1, 0, 0.15]}>
        <torusGeometry args={[0.17, 0.022, 6, 14]} />
        <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
      </mesh>
    </>
  )
}

/**
 * Plastron du clan : lamelles laquées et col montant.
 *
 * Trois rangs seulement, alternés clair et sombre, avec deux ligatures d'or
 * verticales. Un rang de plus et les lamelles devenaient des rayures : à cette
 * échelle, sous une caméra qui recule de 21 unités, c'est l'alternance qu'on
 * lit, pas le compte.
 */
function ClanArmor({ palette }: { palette: Palette }) {
  return (
    <>
      {/*
        Les lamelles sont **posées en avant du manteau**, pas centrées sur lui.

        C'est un correctif, et il vaut d'être noté : à `z = 0.02`, une plaque de
        0,30 d'épaisseur ne dépassait que de 0,17 vers l'avant, alors que le
        manteau fait déjà 0,24 à 0,27 de rayon à cette hauteur — l'armure était
        donc intégralement enfouie dedans, et le personnage se lisait comme une
        robe unie avec deux épaulières rouges. Il faut sortir du volume qu'on
        habille, pas s'y loger.
      */}
      {[0, 1, 2].map((row) => (
        <group key={row}>
          <mesh castShadow position={[0, 0.42 - row * 0.088, 0.1]}>
            <boxGeometry args={[0.44, 0.08, 0.34]} />
            <meshToonMaterial
              color={row % 2 === 0 ? palette.gear : palette.belt}
              gradientMap={toonGradient}
            />
            <Outlines thickness={OUTLINE} color={palette.outline} />
          </mesh>
          {/* Ligature : deux fils d'or qui traversent les lamelles. */}
          {[0.12, -0.12].map((x) => (
            <mesh key={x} position={[x, 0.42 - row * 0.088, 0.265]}>
              <boxGeometry args={[0.026, 0.082, 0.02]} />
              <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Col montant, ouvert vers l'arrière : c'est la pièce qui, plus que
          l'armure elle-même, dit « clan » d'un seul coup d'œil. */}
      <mesh castShadow position={[0, 0.5, -0.04]} rotation={[-0.24, 0, 0]}>
        <cylinderGeometry args={[0.29, 0.2, 0.24, 10, 1, true]} />
        {/* Cylindre ouvert : sans `DoubleSide`, on voit à travers le col dès
            que le personnage se présente de trois quarts arrière. */}
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} side={DoubleSide} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Deux longs pans dans le dos. Ils ne sont pas animés : à la vitesse de
          course, le rebond du buste les fait déjà bouger, et un ressort de plus
          n'apportait qu'un flottement mou. */}
      {[0.13, -0.13].map((x) => (
        <mesh key={x} castShadow position={[x, -0.02, -0.31]} rotation={[0.16, 0, 0]}>
          <boxGeometry args={[0.17, 0.56, 0.05]} />
          <meshToonMaterial color={palette.tunic} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}
    </>
  )
}

/** Bonnet de la tenue par défaut. */
function Cap({ palette }: { palette: Palette }) {
  return (
    <mesh castShadow position={[0, 0.16, -0.04]}>
      <coneGeometry args={[0.24, 0.46, 12]} />
      <meshToonMaterial color={palette.tunic} gradientMap={toonGradient} />
      <Outlines thickness={OUTLINE} color={palette.outline} />
    </mesh>
  )
}

/**
 * Crinière du clan.
 *
 * Trois pièces, et la répartition compte plus que le nombre :
 *
 *  - une **masse arrière**, poussée franchement derrière la tête. La première
 *    version la centrait sur le crâne : elle débordait alors jusque devant les
 *    yeux et le personnage portait un casque noir, visage compris. Une
 *    chevelure se voit *derrière* une tête, sinon c'est une cagoule ;
 *  - une **traîne** qui descend jusqu'au bas du dos. C'est elle qui fait la
 *    silhouette : sans elle, la coupe reste courte quel que soit le nombre de
 *    pointes qu'on ajoute autour. Elle vit dans le groupe animé, donc elle
 *    balaie avec un pas de retard sur la marche — le détail qui la fait lire
 *    comme des cheveux et non comme une cape ;
 *  - des **pointes** irrégulières qui découpent le contour. Leur longueur et
 *    leur écartement suivent une progression volontairement inégale : une
 *    couronne régulière se lit comme un oursin. C'est le même raisonnement que
 *    les plaques de mousse de la pyramide — ce qui fait vivant, c'est
 *    l'irrégularité du contour.
 */
const MANE_SPIKES: ReadonlyArray<{ x: number; y: number; z: number; len: number; tilt: number }> = [
  { x: 0.24, y: 0.02, z: -0.3, len: 0.6, tilt: 1.05 },
  { x: -0.24, y: 0.02, z: -0.3, len: 0.64, tilt: 1.05 },
  { x: 0.34, y: -0.16, z: -0.2, len: 0.5, tilt: 1.45 },
  { x: -0.34, y: -0.16, z: -0.2, len: 0.47, tilt: 1.45 },
  { x: 0.13, y: 0.16, z: -0.32, len: 0.52, tilt: 0.62 },
  { x: -0.15, y: 0.14, z: -0.32, len: 0.56, tilt: 0.64 },
  { x: 0, y: 0.22, z: -0.26, len: 0.42, tilt: 0.34 },
]

function Mane({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Masse arrière : elle donne le volume, les pointes ne font que le
          découper. Son centre est à `z = -0.24`, donc franchement en arrière
          du crâne — c'est ce décalage qui dégage le visage. */}
      <mesh castShadow position={[0, -0.04, -0.24]} scale={[1.15, 1.02, 1.25]}>
        <sphereGeometry args={[0.26, 14, 12]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Traîne, apex vers le bas : large aux épaules, effilée au creux des
          reins. Elle traverse le manteau, et c'est voulu — des cheveux
          retombent *sur* un vêtement, ils ne s'arrêtent pas à son bord. */}
      <mesh castShadow position={[0, -0.62, -0.3]} rotation={[0.1, 0, Math.PI]}>
        <coneGeometry args={[0.3, 1.05, 7]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {MANE_SPIKES.map((spike) => (
        <mesh
          key={`${spike.x}:${spike.y}`}
          castShadow
          position={[spike.x, spike.y, spike.z]}
          rotation={[spike.tilt, 0, spike.x * 1.1]}
        >
          <coneGeometry args={[0.1, spike.len, 5]} />
          <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        </mesh>
      ))}
    </>
  )
}

/**
 * Épée tenue dans la main droite.
 *
 * Au repos, la lame pointe vers le haut, légèrement inclinée vers l'arrière :
 * c'est la pose "dégainée" classique, et surtout c'est la seule qui reste
 * lisible de dos comme de face (pointée vers l'arrière, la lame disparaissait
 * dans le corps).
 *
 * L'épée vit dans le repère du bras : elle suit donc l'animation d'attaque
 * sans le moindre calcul supplémentaire.
 */
function Sword({ palette }: { palette: Palette }) {
  return (
    <group position={[-0.02, -0.28, 0.02]} rotation={[0.28, 0, -0.12]}>
      <mesh castShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[0.05, 0.16, 0.05]} />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
      </mesh>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[0.22, 0.04, 0.06]} />
        <meshToonMaterial color={palette.guard} gradientMap={toonGradient} />
      </mesh>
      <mesh castShadow position={[0, 0.48, 0]}>
        <boxGeometry args={[0.075, 0.58, 0.025]} />
        <meshToonMaterial color={palette.blade} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, 0.81, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.053, 0.1, 4]} />
        <meshToonMaterial color={palette.blade} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/**
 * Katana de Kusanagi.
 *
 * Même point d'attache et même repère que l'épée de base : il vit dans celui du
 * bras et suit donc l'animation d'attaque sans un calcul de plus. Trois choses
 * seulement le distinguent, et chacune sert la lecture à distance :
 *
 *  - **la lame fait 1,08 contre 0,68**, soit une demi-tête du personnage de plus
 *    au-dessus de l'épaule. C'est le minimum pour que la différence se voie en
 *    plongée de 17° — un allongement de vingt centimètres se lisait comme une
 *    erreur de proportion, pas comme une autre arme ;
 *  - **la garde est un disque et non une croix.** C'est elle qui dit « katana »
 *    d'un seul coup d'œil, avant même la longueur ;
 *  - **la lame est légèrement inclinée en arrière du manche.** Une courbure
 *    véritable demanderait une géométrie dédiée pour un gain nul à cette taille ;
 *    deux segments à peine désaxés suffisent à casser l'axe droit de l'épée.
 *
 * Attention à la portée : ce katana est plus long **à l'écran** seulement. La
 * hitbox reste celle d'`ATTACK` — la traînée de `SwordArc` est une géométrie
 * construite une fois pour toutes à partir de `ATTACK.reach`, et la faire varier
 * avec l'arme demanderait de la reconstruire à chaque équipement. Ce que l'objet
 * change, ce sont les dégâts.
 */
function Katana({ palette }: { palette: Palette }) {
  return (
    <group position={[-0.02, -0.3, 0.02]} rotation={[0.24, 0, -0.1]}>
      {/* Poignée longue, prise à deux mains, et sa ligature. */}
      <mesh castShadow position={[0, 0.11, 0]}>
        <boxGeometry args={[0.05, 0.26, 0.05]} />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
      </mesh>
      {[0.04, 0.11, 0.18].map((y) => (
        <mesh key={y} castShadow position={[0, y, 0]}>
          <boxGeometry args={[0.062, 0.03, 0.062]} />
          <meshToonMaterial color={palette.cord} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Tsuba : le disque de garde, à plat. */}
      <mesh castShadow position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.115, 0.115, 0.035, 12]} />
        <meshToonMaterial color={palette.guard} gradientMap={toonGradient} />
      </mesh>

      {/* Lame, en deux tronçons à peine désaxés. Le contour n'est posé que sur
          le premier : deux contours qui se croisent au raccord font une arête
          noire en travers de la lame. */}
      <mesh castShadow position={[0, 0.63, -0.015]} rotation={[0.045, 0, 0]}>
        <boxGeometry args={[0.055, 0.72, 0.028]} />
        <meshToonMaterial color={palette.blade} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, 1.15, -0.05]} rotation={[0.11, 0, 0]}>
        <boxGeometry args={[0.052, 0.34, 0.026]} />
        <meshToonMaterial color={palette.blade} gradientMap={toonGradient} />
      </mesh>
      {/* Kissaki : la pointe, coupée en biais comme celle d'un vrai katana. */}
      <mesh castShadow position={[0, 1.36, -0.073]} rotation={[0.11, 0, Math.PI]}>
        <coneGeometry args={[0.037, 0.13, 4]} />
        <meshToonMaterial color={palette.blade} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}
