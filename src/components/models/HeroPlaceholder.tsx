import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Outlines } from '@react-three/drei'
import { DoubleSide, Group, MathUtils } from 'three'
import { skinTraits, type OutfitId, type WeaponId } from '../../config/items'
import { ATTACK, PLAYER } from '../../config/gameplay'
import { isHitStopped, now as gameNow } from '../../state/gameClock'
import { playerTransform } from '../../state/playerTransform'
import { toonGradient } from './toonGradient'

/**
 * Personnage du joueur, entièrement procédural.
 *
 * Aucun asset externe : la silhouette est construite en primitives et animée
 * à la main (cycle de marche, pose aérienne, coup d'épée). Les proportions
 * sont volontairement "chibi" — grosse tête, petit corps — comme dans
 * Wind Waker : c'est ce qui fait lire la silhouette, pas le nombre de polygones.
 *
 * Convention : l'avant du modèle est +Z, la main droite du personnage est
 * donc du côté -X (right = forward × up en repère main droite).
 *
 * **Les deux skins sont des habillages d'un rig unique.** Quand le second est
 * arrivé, la tentation était d'écrire un second personnage à côté ; ça aurait
 * fait deux cycles de marche à régler, deux animations d'attaque à garder
 * synchrones, et la garantie qu'elles divergent au premier ajustement. Ce qui
 * change de l'un à l'autre est donc strictement : la palette, la pièce de tête,
 * le vêtement de buste, l'habillage des membres et le visage ; d'une arme à
 * l'autre, seule la géométrie tenue en main droite — et à mains nues, il n'y en
 * a aucune. Le squelette et toutes les animations sont partagés, y compris le
 * coup porté : le bras qui frappe suit la même courbe qu'il tienne une lame ou
 * un poing, seule la traînée de `StrikeArc` change de forme.
 */

/** Palette d'un skin. Tous les skins déclarent exactement ces teintes. */
interface Palette {
  /** Vêtement de buste : gilet ouvert, ou manteau long. */
  garment: string
  /** Bas du corps : short, ou pantalon. */
  trouser: string
  /** Ceinture ventrale : écharpe nouée, ou haramaki. */
  belt: string
  skin: string
  /** Peau assombrie. Les cicatrices, et elles seules. */
  scar: string
  hair: string
  boot: string
  blade: string
  guard: string
  grip: string
  /** Ligature du katana : la seule teinte que l'épée de base n'utilise pas. */
  cord: string
  eye: string
  outline: string
  /** Teinte d'appoint : paille du chapeau, ou laque des fourreaux. */
  gear: string
  /** Liseré de la pièce d'appoint : ruban du chapeau, ou tsuba des fourreaux. */
  gearTrim: string
}

/**
 * Palettes des skins.
 *
 * Chacune reprend exactement les teintes de son `ItemIllustration` quand il en
 * existe un : la carte de l'objet doit montrer ce qu'on va voir courir dans
 * l'herbe.
 *
 * Les deux skins doivent surtout se distinguer **l'un de l'autre** en un coup
 * d'œil, à 21 unités de recul. Ils le font par la valeur autant que par la
 * teinte : le premier est clair et chaud sur un buste nu, le second sombre et
 * froid sous un manteau long qui double la largeur de la silhouette.
 */
const OUTFITS: Record<OutfitId, Palette> = {
  luffy: {
    garment: '#d23a33',
    trouser: '#2f62b5',
    belt: '#e5b13c',
    skin: '#f0bd88',
    scar: '#c98a5e',
    hair: '#181520',
    boot: '#8a5a2b',
    blade: '#dde6ef',
    guard: '#d0a53c',
    grip: '#5b3a1e',
    cord: '#2f4f66',
    eye: '#231d1c',
    // Contour prune plutôt que noir : un cerne noir sur du rouge vif fait une
    // découpe d'autocollant, alors que le prune se raccorde au contre-jour
    // parme de la scène.
    outline: '#2a1720',
    gear: '#e8cf8a',
    gearTrim: '#a8332c',
  },
  zoro: {
    garment: '#1f6b3c',
    trouser: '#2b2733',
    // Le haramaki est deux tons au-dessus du manteau, et c'est délibéré : c'est
    // la seule pièce claire du bas du corps, donc la seule qui marque la taille
    // d'une silhouette autrement uniformément sombre.
    belt: '#57a544',
    skin: '#efbb86',
    scar: '#c98a5e',
    hair: '#6fa83c',
    boot: '#1d1a24',
    blade: '#dde6ef',
    guard: '#c9a227',
    // Poignée claire : c'est la seule chose qui distingue la lame tenue en main
    // des deux fourreaux sombres accrochés à la hanche.
    grip: '#f4efe2',
    cord: '#7c1f22',
    eye: '#241d2c',
    outline: '#171226',
    gear: '#1b1822',
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
 * Demi-ouverture du vêtement de buste, en radians.
 *
 * Gilet comme manteau sont **un seul cylindre ouvert** plutôt qu'un assemblage
 * de pans : `cylinderGeometry` sait déjà ne décrire qu'un secteur d'angle, et
 * deux plaques posées côte à côte auraient laissé voir le buste par la tranche
 * dès le moindre pivot du torse.
 *
 * L'ouverture donne sur +Z, donc sur la face du personnage. Elle vaut deux fois
 * cette valeur : à moins de 60° d'ouverture totale, le torse nu disparaissait
 * derrière le vêtement en plongée à 17°, et avec lui les cicatrices — qui sont
 * le seul détail de buste qui survive au recul.
 */
const OPEN_HALF = 0.62
const COAT_OPEN_HALF = 0.5

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

export function HeroPlaceholder({ outfit = 'luffy', weapon = 'fists' }: HeroProps) {
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
  const isZoro = outfit === 'zoro'
  /** Mains nues : la main droite ne porte rien, et les deux poings grossissent. */
  const barehanded = weapon === 'fists'
  /** Inclinaison au repos de la pièce de tête. Chapeau posé plat, cheveux non. */
  const headwearRest = isZoro ? -0.1 : -0.05
  /** Vitesse de pointe du skin : référence de l'intensité du cycle de marche. */
  const topSpeed = PLAYER.speed * skinTraits(outfit).speed

  useFrame((state, rawDelta) => {
    if (!torso.current || !legL.current || !legR.current) return
    if (!armL.current || !armR.current || !head.current || !headwear.current) return

    // Même gel que dans `Player.tsx` : pendant les 80 ms du coup fatal, le
    // reste du monde tient sa pose, et le cycle de marche ne doit pas
    // continuer sur une vitesse Rapier qui reste figée à sa dernière valeur
    // non nulle. Ce composant ne fait que *lire* `playerTransform` et lisser
    // des refs locales — aucun drapeau ponctuel à consommer, aucun singleton à
    // publier — la garde peut donc se poser juste après les gardes de refs
    // habituelles, sans rien à préserver de plus.
    if (isHitStopped()) return

    const delta = Math.min(rawDelta, 0.05)
    const time = state.clock.elapsedTime

    // Intensité de la marche : 0 à l'arrêt, 1 à pleine vitesse. La référence
    // est la vitesse **du skin porté**, pas celle de `PLAYER` : sinon le skin
    // le plus rapide passerait tout son temps à saturer le clamp, et son
    // ralenti dans l'eau se lirait comme une course à plein régime.
    const run = MathUtils.clamp(playerTransform.speed / topSpeed, 0, 1)

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
    // l'animation. Le chapeau et la coupe partagent ce ressort à un pas de
    // retard ; seules leurs amplitudes diffèrent. Le chapeau est de loin le
    // plus ample des deux : c'est une masse posée sur le crâne, rien ne la
    // retient, alors que des cheveux courts ne font que frémir.
    const lag = Math.sin(stridePhase.current - 0.6)
    headwear.current.rotation.x = isZoro
      ? headwearRest - lag * 0.1 * run - air * 0.22
      : headwearRest - lag * 0.14 * run - air * 0.3
    // Le balancement latéral n'existe que pour le chapeau : une coupe courte
    // qui roule sur l'axe Z se lit comme un défaut, un bord de paille qui suit
    // les épaules se lit comme du poids.
    if (!isZoro) headwear.current.rotation.z = lag * 0.05 * run
  })

  return (
    <group>
      {/* --- Jambes : pivot à la hauteur des hanches --- */}
      <group ref={legL} position={[0.12, HIP_Y, 0]}>
        <Leg palette={palette} zoro={isZoro} />
      </group>
      <group ref={legR} position={[-0.12, HIP_Y, 0]}>
        <Leg palette={palette} zoro={isZoro} />
      </group>

      {/* --- Buste : porte les bras et la tête --- */}
      <group ref={torso} position={[0, HIP_Y, 0]}>
        {isZoro ? <SwordsmanTorso palette={palette} /> : <StrawHatTorso palette={palette} />}

        {/* --- Bras : pivot à l'épaule --- */}
        <group ref={armL} position={[0.24, SHOULDER_Y - HIP_Y, 0]}>
          <Arm palette={palette} zoro={isZoro} fist={barehanded} side={1} />
        </group>
        <group ref={armR} position={[-0.24, SHOULDER_Y - HIP_Y, 0]}>
          <Arm palette={palette} zoro={isZoro} fist={barehanded} side={-1} />
          {weapon === 'katana' && <Katana palette={palette} />}
          {weapon === 'sword' && <Sword palette={palette} />}
        </group>

        {/* --- Tête --- */}
        <group ref={head} position={[0, HEAD_Y - HIP_Y, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.26, 18, 16]} />
            <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={palette.outline} />
          </mesh>

          {/* Oreilles rondes, aplaties contre le crâne. */}
          {[0.245, -0.245].map((x) => (
            <mesh key={x} castShadow position={[x, 0, 0]} scale={[0.6, 1, 0.8]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
            </mesh>
          ))}

          {isZoro ? <SwordsmanFace palette={palette} /> : <StrawHatFace palette={palette} />}

          {/* Pièce de tête, animée séparément : chapeau ou coupe. */}
          <group ref={headwear} position={[0, 0.16, 0]} rotation={[headwearRest, 0, 0]}>
            {isZoro ? <CroppedHair palette={palette} /> : <StrawHat palette={palette} />}
          </group>
        </group>
      </group>
    </group>
  )
}

/** Jambe : mollet nu sous un short, ou pantalon sombre dans une botte. */
function Leg({ palette, zoro }: { palette: Palette; zoro: boolean }) {
  if (zoro) {
    return (
      <group>
        <mesh castShadow position={[0, -0.17, 0]}>
          <capsuleGeometry args={[0.085, 0.17, 4, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
        {/* Bas de pantalon, qui déborde sur la tige de la botte. */}
        <mesh castShadow position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.1, 0.095, 0.1, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
        </mesh>
        <mesh castShadow position={[0, -0.37, 0.02]}>
          <boxGeometry args={[0.17, 0.13, 0.22]} />
          <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      {/*
        Le short est posé sur le **groupe de jambe**, pas sur le buste.

        C'est ce qui le fait balancer avec le pas. Rattaché au torse comme
        l'était la tunique, il serait resté rigide au-dessus de deux jambes en
        mouvement, et la démarche aurait perdu la moitié de sa lisibilité.
      */}
      <mesh castShadow position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.115, 0.125, 0.19, 12]} />
        <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, -0.2, 0]}>
        <capsuleGeometry args={[0.072, 0.15, 4, 10]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
      </mesh>

      {/* Sandale : trois fois plus plate que la botte de cuir (0,055 contre
          0,13). Le personnage y gagne en légèreté, et le mollet nu reste
          visible jusqu'au sol. */}
      <mesh castShadow position={[0, -0.36, 0.02]}>
        <boxGeometry args={[0.17, 0.055, 0.23]} />
        <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, -0.325, 0.04]}>
        <boxGeometry args={[0.15, 0.035, 0.06]} />
        <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/** Bras et main, suspendus sous le pivot d'épaule. Nus dans les deux skins. */
function Arm({
  palette,
  zoro,
  fist,
  side,
}: {
  palette: Palette
  zoro: boolean
  /** Main nue et fermée : la main grossit, parce qu'elle est l'arme. */
  fist: boolean
  /** +1 pour le bras gauche du modèle, -1 pour le droit. Oriente le bandana. */
  side: number
}) {
  return (
    <group>
      <mesh castShadow position={[0, -0.14, 0]}>
        <capsuleGeometry args={[zoro ? 0.06 : 0.058, 0.17, 4, 10]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Bandana noué au biceps gauche, donc du côté qui balance librement
          pendant l'attaque : le seul détail de la tenue qui s'anime sans un
          ressort de plus. */}
      {zoro && side > 0 && (
        <>
          <mesh castShadow position={[0, -0.08, 0]}>
            <cylinderGeometry args={[0.073, 0.073, 0.09, 10]} />
            <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={palette.outline} />
          </mesh>
          <mesh castShadow position={[0.06, -0.15, -0.03]} rotation={[0, 0, 0.3]}>
            <boxGeometry args={[0.05, 0.19, 0.03]} />
            <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
          </mesh>
        </>
      )}

      {/* La main. Un tiers plus grosse quand elle est l'arme (0,085 contre
          0,065) : c'est tout ce qu'il faut pour dire qu'on se bat avec, et le
          contour ne se pose que dans ce cas — sur une main qui ne fait que
          tenir un manche, il ajoute un pâté noir au bout du bras. */}
      <mesh castShadow position={[0, -0.28, 0]}>
        <sphereGeometry args={[fist ? 0.085 : 0.065, 10, 10]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
        {fist && <Outlines thickness={OUTLINE} color={palette.outline} />}
      </mesh>
    </group>
  )
}

/**
 * Buste du premier skin : torse nu, gilet ouvert, écharpe nouée.
 *
 * Le gilet ne se referme jamais : c'est lui qui laisse voir la cicatrice en
 * croix, et cette croix est le seul détail de buste encore lisible à distance
 * de jeu une fois le chapeau reconnu.
 */
function StrawHatTorso({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Buste nu. */}
      <mesh castShadow position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.195, 0.27, 0.5, 14]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
      </mesh>

      {/* Cicatrice en croix. Teintée dans la peau assombrie, jamais en rouge :
          une balafre rouge se lit comme une blessure fraîche, donc comme un
          état de santé — et le jeu a déjà des cœurs pour ça. */}
      {[0.72, -0.72].map((tilt) => (
        <mesh key={tilt} position={[0, 0.3, 0.2]} rotation={[0, 0, tilt]}>
          <boxGeometry args={[0.03, 0.34, 0.02]} />
          <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Gilet : un seul cylindre ouvert sur l'avant. `DoubleSide` est
          obligatoire — sans lui on voit à travers le dos dès que le personnage
          se présente de trois quarts arrière. */}
      <mesh castShadow position={[0, 0.28, 0]}>
        <cylinderGeometry
          args={[0.215, 0.3, 0.54, 18, 1, true, OPEN_HALF, Math.PI * 2 - 2 * OPEN_HALF]}
        />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} side={DoubleSide} />
      </mesh>

      {/* Ourlets : ils referment la tranche du cylindre, qui est d'épaisseur
          nulle. Sans eux le bord du gilet disparaît sous tout angle rasant. */}
      {[OPEN_HALF, -OPEN_HALF].map((a) => (
        <mesh
          key={a}
          castShadow
          position={[Math.sin(a) * 0.26, 0.28, Math.cos(a) * 0.26]}
          rotation={[0, a, 0]}
        >
          <boxGeometry args={[0.03, 0.54, 0.055]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}

      {/* Écharpe nouée à la taille, et son nœud sur l'avant. */}
      <mesh castShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.26, 0.27, 0.1, 14]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, 0.13, 0.25]}>
        <boxGeometry args={[0.12, 0.11, 0.06]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
      </mesh>
    </>
  )
}

/**
 * Fourreaux du second skin, accrochés au haramaki.
 *
 * Deux, pas trois : la troisième lame est celle que le rig tient déjà en main
 * droite. Le compte tombe juste quelle que soit l'arme équipée.
 *
 * Ils pendent à la hanche **gauche** (+X), donc du côté opposé à la main armée.
 * C'est la seule asymétrie franche de la silhouette, et c'est elle qui la rend
 * reconnaissable de dos — où ni le visage ni le haramaki ne se voient.
 */
const SHEATHS: ReadonlyArray<{ x: number; y: number; tilt: number; pale: boolean }> = [
  { x: -0.03, y: 0, tilt: -0.07, pale: true },
  { x: 0.05, y: -0.05, tilt: 0.1, pale: false },
]

/** Buste du second skin : torse nu balafré, manteau long, haramaki, fourreaux. */
function SwordsmanTorso({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh castShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.19, 0.25, 0.46, 14]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
      </mesh>

      {/*
        La grande balafre, épaule gauche vers hanche droite.

        Posée à `z = 0,185`, donc **devant** le buste et non centrée sur lui.
        C'est le même piège que les anciennes lamelles du plastron : une pièce
        centrée sur le volume qu'elle habille est intégralement enfouie dedans.
        Il faut sortir du volume qu'on décore.
      */}
      <mesh position={[0, 0.3, 0.185]} rotation={[0, 0, 0.62]}>
        <boxGeometry args={[0.046, 0.52, 0.02]} />
        <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
      </mesh>

      {/* Manteau : plus long et bien plus évasé que le gilet (0,37 contre 0,30
          en bas, sur 0,64 de haut contre 0,54). C'est cette silhouette en
          cloche qui distingue les deux skins de loin, avant toute couleur. */}
      <mesh castShadow position={[0, 0.24, 0]}>
        <cylinderGeometry
          args={[0.225, 0.37, 0.64, 18, 1, true, COAT_OPEN_HALF, Math.PI * 2 - 2 * COAT_OPEN_HALF]}
        />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} side={DoubleSide} />
      </mesh>
      {[COAT_OPEN_HALF, -COAT_OPEN_HALF].map((a) => (
        <mesh
          key={a}
          castShadow
          position={[Math.sin(a) * 0.3, 0.24, Math.cos(a) * 0.3]}
          rotation={[0, a, 0]}
        >
          <boxGeometry args={[0.035, 0.64, 0.07]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}

      {/* Haramaki : presque trois fois l'épaisseur d'une ceinture (0,19 contre
          0,07), et il déborde du manteau. C'est la pièce qui dit « bretteur »,
          parce qu'on voit qu'elle porte les lames. */}
      <mesh castShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.3, 0.31, 0.19, 16]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.305, 0.305, 0.022, 16]} />
        <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
      </mesh>

      <group position={[0.3, 0.14, -0.04]} rotation={[0.48, 0, -0.28]}>
        {SHEATHS.map((sheath) => (
          <group key={sheath.x} position={[sheath.x, sheath.y, 0]} rotation={[0, 0, sheath.tilt]}>
            <mesh castShadow position={[0, -0.32, 0]}>
              <cylinderGeometry args={[0.043, 0.036, 0.86, 10]} />
              <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
              <Outlines thickness={OUTLINE} color={palette.outline} />
            </mesh>
            <mesh castShadow position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.085, 0.085, 0.028, 12]} />
              <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
            </mesh>
            <mesh castShadow position={[0, 0.25, 0]}>
              <boxGeometry args={[0.048, 0.24, 0.048]} />
              <meshToonMaterial
                color={sheath.pale ? palette.grip : palette.cord}
                gradientMap={toonGradient}
              />
            </mesh>
          </group>
        ))}
      </group>
    </>
  )
}

/**
 * Visage du premier skin.
 *
 * Le sourire est un **arc de tore**, pas une texture : trois primitives pour la
 * chose la plus reconnaissable du personnage. Il est tracé en `meshBasicMaterial`
 * comme les yeux — le cel-shading sur un trait de deux centimètres ne produit
 * qu'une bande d'ombre qui le fait disparaître d'un côté.
 */
function StrawHatFace({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Cheveux noirs en bataille, sous le chapeau. */}
      <mesh castShadow position={[0, 0.07, 0]} scale={[1.01, 0.78, 1.01]}>
        <sphereGeometry args={[0.262, 16, 14]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>
      {[
        [0.14, 0.2, 0.13, 0.5],
        [-0.1, 0.22, 0.08, 0.7],
        [0.02, 0.24, 0.03, 0.9],
      ].map(([x, y, z, tilt]) => (
        <mesh key={x} castShadow position={[x, y, z]} rotation={[tilt, 0, x * 1.6]}>
          <coneGeometry args={[0.06, 0.16, 5]} />
          <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* yeux : la face regarde +Z */}
      {[0.09, -0.09].map((x) => (
        <mesh key={x} position={[x, 0.01, 0.235]} scale={[0.52, 1, 0.4]}>
          <sphereGeometry args={[0.048, 10, 10]} />
          <meshBasicMaterial color={palette.eye} />
        </mesh>
      ))}

      {/* Cicatrice sous l'œil gauche du modèle (+X) : un trait et ses deux
          points de suture. À trois box plates, elle survit à la plongée. */}
      <mesh position={[0.1, -0.07, 0.229]}>
        <boxGeometry args={[0.075, 0.016, 0.01]} />
        <meshBasicMaterial color={palette.scar} />
      </mesh>
      {[-0.02, 0.025].map((dx) => (
        <mesh key={dx} position={[0.1 + dx, -0.07, 0.229]}>
          <boxGeometry args={[0.014, 0.05, 0.01]} />
          <meshBasicMaterial color={palette.scar} />
        </mesh>
      ))}

      <mesh position={[0, -0.06, 0.212]} rotation={[0, 0, -Math.PI * 0.91]}>
        <torusGeometry args={[0.115, 0.02, 6, 14, Math.PI * 0.82]} />
        <meshBasicMaterial color={palette.eye} />
      </mesh>
      <mesh position={[0, -0.085, 0.222]}>
        <boxGeometry args={[0.15, 0.03, 0.01]} />
        <meshBasicMaterial color="#fdf6ea" />
      </mesh>
    </>
  )
}

/**
 * Visage du second skin : un œil clos barré d'une cicatrice, trois anneaux.
 *
 * L'œil gauche devient une simple ligne horizontale. C'est plus lisible qu'une
 * paupière modelée : à cette échelle, ce qu'on lit c'est le *contraste* entre un
 * œil rond et un trait, pas le relief.
 */
function SwordsmanFace({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Trois anneaux à l'oreille gauche. Trois sphères de 0,023, et ils se
          voient encore en plongée à 17° — l'or est la seule teinte franchement
          claire du haut de la silhouette. */}
      {[0.05, 0, -0.05].map((z) => (
        <mesh key={z} castShadow position={[0.255, -0.07, z]}>
          <sphereGeometry args={[0.023, 8, 8]} />
          <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Œil droit ouvert. */}
      <mesh position={[-0.09, 0.01, 0.235]} scale={[0.52, 1, 0.4]}>
        <sphereGeometry args={[0.048, 10, 10]} />
        <meshBasicMaterial color={palette.eye} />
      </mesh>

      {/* Œil gauche clos, et la balafre verticale qui le traverse. */}
      <mesh position={[0.09, 0, 0.232]}>
        <boxGeometry args={[0.085, 0.016, 0.01]} />
        <meshBasicMaterial color={palette.eye} />
      </mesh>
      <mesh position={[0.098, 0.01, 0.232]} rotation={[0, 0, 0.06]}>
        <boxGeometry args={[0.02, 0.22, 0.012]} />
        <meshBasicMaterial color={palette.scar} />
      </mesh>

      {/* Bouche : une ligne droite. Le contraste avec le sourire de l'autre
          skin fait plus pour distinguer les deux visages que la couleur des
          cheveux. */}
      <mesh position={[0, -0.1, 0.222]}>
        <boxGeometry args={[0.1, 0.018, 0.01]} />
        <meshBasicMaterial color={palette.eye} />
      </mesh>
    </>
  )
}

/**
 * Chapeau de paille.
 *
 * La pièce qui porte tout le skin. Son bord fait **0,44 de rayon contre 0,26
 * pour la tête** : c'est le seul élément qui déborde franchement de la
 * silhouette, donc le seul qui se lise en plongée à 17°, là où une coupe de
 * cheveux ne se distingue plus du crâne.
 *
 * Il vit dans le groupe animé, et hérite donc tel quel du ressort à un pas de
 * retard : c'est une masse posée en équilibre sur un crâne, elle a toutes les
 * raisons de rebondir au pas de course.
 */
function StrawHat({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh castShadow position={[0, 0.06, -0.01]} rotation={[-0.06, 0, 0]}>
        <cylinderGeometry args={[0.44, 0.46, 0.022, 22]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, 0.15, -0.01]}>
        <cylinderGeometry args={[0.235, 0.255, 0.17, 16]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh position={[0, 0.09, -0.01]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.248, 0.028, 6, 18]} />
        <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
      </mesh>
    </>
  )
}

/**
 * Coupe courte du second skin.
 *
 * Une calotte et cinq pointes ramenées en arrière, et rien qui descende sous la
 * nuque : c'est exactement l'inverse de la crinière qui vivait ici avant. Les
 * pointes ont des longueurs inégales — une couronne régulière se lit comme un
 * oursin, c'est le même raisonnement que les plaques de mousse de la pyramide.
 */
const HAIR_SPIKES: ReadonlyArray<{ x: number; y: number; tilt: number; long: boolean }> = [
  { x: 0.2, y: -0.12, tilt: 0.9, long: false },
  { x: -0.2, y: -0.1, tilt: 0.95, long: true },
  { x: 0.1, y: 0.05, tilt: 0.6, long: false },
  { x: -0.09, y: 0.07, tilt: 0.62, long: true },
  { x: 0, y: -0.02, tilt: 0.4, long: false },
]

function CroppedHair({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh castShadow position={[0, -0.05, -0.02]} scale={[1.02, 0.86, 1.05]}>
        <sphereGeometry args={[0.268, 16, 14]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {HAIR_SPIKES.map((spike) => (
        <mesh
          key={spike.x}
          castShadow
          position={[spike.x, spike.y, -0.2]}
          rotation={[spike.tilt + 0.5, 0, spike.x * 1.2]}
        >
          <coneGeometry args={[0.075, spike.long ? 0.33 : 0.26, 5]} />
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
 * hitbox reste celle d'`ATTACK` — la traînée de `StrikeArc` est une géométrie
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
