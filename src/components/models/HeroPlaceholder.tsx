import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Outlines } from '@react-three/drei'
import { DoubleSide, Group, MathUtils } from 'three'
import type { OutfitId, WeaponId } from '../../config/items'
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
 * **Les skins sont des habillages d'un rig unique.** Quand le second est
 * arrivé, la tentation était d'écrire un second personnage à côté ; ça aurait
 * fait deux cycles de marche à régler, deux animations d'attaque à garder
 * synchrones, et la garantie qu'elles divergent au premier ajustement. Ce qui
 * change de l'un à l'autre est donc strictement : la palette, la pièce de tête,
 * le vêtement de buste, l'habillage des membres et le visage ; d'une arme à
 * l'autre, seule la géométrie tenue en main droite — et à mains nues, il n'y en
 * a aucune. Le squelette et toutes les animations sont partagés, y compris le
 * coup porté : le bras qui frappe suit la même courbe qu'il tienne une lame ou
 * un poing, seule la traînée de `StrikeArc` change de forme.
 *
 * Les pièces propres à chaque skin sont réunies dans **une seule table**,
 * `SKINS` : buste, visage, pièce de tête et réglages de son ressort. Tant qu'il
 * n'y en avait que deux, elles se choisissaient par un booléen `isZoro` semé
 * dans le corps du composant ; le troisième skin transformait chacun de ces
 * points en « tout le monde sauf celui-là », et un skin ajouté aurait hérité en
 * silence de l'habillage du voisin.
 */

/** Palette d'un skin. Tous les skins déclarent exactement ces teintes. */
interface Palette {
  /** Vêtement de buste : gilet ouvert, ou manteau long. */
  garment: string
  /**
   * Bas du corps : short, pantalon, ou bandes de lin.
   *
   * Le lin du clan habille aussi ses avant-bras : c'est la même pièce de tissu
   * enroulée aux deux endroits, elle n'a donc pas de teinte à elle.
   */
  trouser: string
  /**
   * Ceinture ventrale : écharpe nouée, haramaki, ou ceinture du clan — qui
   * teinte aussi son col montant et un rang de lamelles sur deux.
   */
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
  /** Teinte d'appoint : paille du chapeau, laque des fourreaux, ou lamelles. */
  gear: string
  /**
   * Liseré de la pièce d'appoint : ruban du chapeau, tsuba des fourreaux, ou
   * ligature d'or des lamelles.
   */
  gearTrim: string
}

/**
 * Palettes des skins.
 *
 * Chacune reprend exactement les teintes de son `ItemIllustration` quand il en
 * existe un : la carte de l'objet doit montrer ce qu'on va voir courir dans
 * l'herbe.
 *
 * Les skins doivent surtout se distinguer **les uns des autres** en un coup
 * d'œil, à 21 unités de recul. Ils le font par la valeur autant que par la
 * teinte : le premier est clair et chaud sur un buste nu, le second sombre et
 * froid sous un manteau long qui double la largeur de la silhouette, le
 * troisième sombre et *chaud* — le seul dont la masse sombre soit coupée de
 * cramoisi et d'or, et le seul que sa chevelure prolonge jusqu'aux reins.
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
  // Le prune et le cramoisi n'existent nulle part ailleurs dans le jeu : le
  // rouge des cœurs est plus clair et ne vit qu'au HUD, aucune confusion n'est
  // possible, et le contre-jour parme de la scène détache cette silhouette-là
  // du décor mieux qu'aucune autre.
  madara: {
    garment: '#4b4062',
    // Les bandages de lin, qui tiennent lieu de bas et de manches. La teinte
    // est volontairement à peine cassée : du blanc pur aurait brillé plus que
    // la lame de l'épée.
    trouser: '#ece4d4',
    belt: '#7d1f22',
    skin: '#f0c39c',
    scar: '#c98a5e',
    hair: '#1a1723',
    boot: '#2f2a3d',
    blade: '#dde6ef',
    guard: '#d8a93f',
    grip: '#3a2a1e',
    cord: '#2f4f66',
    eye: '#1b1626',
    // Contour plus froid que celui des deux autres : un cerne brun sur du
    // prune vire au marron sale.
    outline: '#161226',
    gear: '#a8302f',
    gearTrim: '#d8a93f',
  },
}

/**
 * Habillage d'un skin : ce que le rig monte sur son squelette.
 *
 * Les quatre nombres décrivent le **ressort de la pièce de tête**, le détail
 * qui vend l'animation : elle traîne d'un pas derrière le mouvement. Ils sont
 * ici et pas dans les composants parce qu'ils vivent dans `useFrame`, sur un
 * groupe que le rig anime lui-même — un chapeau posé en équilibre, une coupe
 * courte et une crinière qui descend aux reins n'ont ni la même masse ni la
 * même liberté.
 */
interface Skin {
  torso: (props: { palette: Palette }) => React.JSX.Element
  face: (props: { palette: Palette }) => React.JSX.Element
  headwear: (props: { palette: Palette }) => React.JSX.Element
  /** Inclinaison au repos. Un chapeau est posé à plat, des cheveux non. */
  rest: number
  /** Retard au pas, puis basculement en l'air. */
  swing: number
  air: number
  /**
   * Roulis latéral, qui suit les épaules.
   *
   * Nul pour tout ce qui tient au crâne : une coupe courte qui roule sur l'axe
   * Z se lit comme un défaut, une masse posée ou pendante se lit comme du poids.
   */
  roll: number
}

const SKINS: Record<OutfitId, Skin> = {
  luffy: {
    torso: StrawHatTorso,
    face: StrawHatFace,
    headwear: StrawHat,
    rest: -0.05,
    swing: 0.14,
    air: 0.3,
    roll: 0.05,
  },
  zoro: {
    torso: SwordsmanTorso,
    face: SwordsmanFace,
    headwear: CroppedHair,
    rest: -0.1,
    swing: 0.1,
    air: 0.22,
    roll: 0,
  },
  // La crinière est de loin la plus ample des trois pièces de tête : c'est une
  // masse libre qui descend au bas du dos, alors que le chapeau ne fait que
  // rebondir sur un crâne et la coupe courte que frémir.
  madara: {
    torso: ClanTorso,
    face: ClanFace,
    headwear: Mane,
    rest: -0.06,
    swing: 0.16,
    air: 0.34,
    roll: 0.09,
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
  /**
   * Vitesse de pointe du personnage, en unités par seconde.
   *
   * Passée en prop et non recalculée ici : elle ne dépend plus du seul skin
   * depuis qu'une babiole peut la modifier, et ce composant ne reçoit pas
   * l'équipement complet qu'il faudrait pour la déduire. C'est `HeroModel`, qui
   * lit déjà le store, qui la calcule.
   *
   * Le défaut correspond au skin de départ, pour que le rig reste montable seul
   * — dans un banc d'essai ou une page de test, il n'y a pas de store.
   */
  topSpeed?: number
}

export function HeroPlaceholder({
  outfit = 'luffy',
  weapon = 'fists',
  topSpeed = PLAYER.speed,
}: HeroProps) {
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
  const skin = SKINS[outfit]
  /** Mains nues : la main droite ne porte rien, et les deux poings grossissent. */
  const barehanded = weapon === 'fists'
  // Majuscules : ce sont des composants, et JSX ne monte que ce qui commence
  // par une capitale — en minuscule, `<skin.torso />` partirait chercher une
  // balise HTML de ce nom.
  const Torso = skin.torso
  const Face = skin.face
  const Headwear = skin.headwear

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
    // l'animation. Toutes partagent ce ressort à un pas de retard ; seules
    // leurs amplitudes diffèrent, et elles sont déclarées par le skin.
    const lag = Math.sin(stridePhase.current - 0.6)
    headwear.current.rotation.x = skin.rest - lag * skin.swing * run - air * skin.air
    headwear.current.rotation.z = lag * skin.roll * run
  })

  return (
    <group>
      {/* --- Jambes : pivot à la hauteur des hanches --- */}
      <group ref={legL} position={[0.12, HIP_Y, 0]}>
        <Leg palette={palette} outfit={outfit} />
      </group>
      <group ref={legR} position={[-0.12, HIP_Y, 0]}>
        <Leg palette={palette} outfit={outfit} />
      </group>

      {/* --- Buste : porte les bras et la tête --- */}
      <group ref={torso} position={[0, HIP_Y, 0]}>
        <Torso palette={palette} />

        {/* --- Bras : pivot à l'épaule --- */}
        <group ref={armL} position={[0.24, SHOULDER_Y - HIP_Y, 0]}>
          <Arm palette={palette} outfit={outfit} fist={barehanded} side={1} />
        </group>
        <group ref={armR} position={[-0.24, SHOULDER_Y - HIP_Y, 0]}>
          <Arm palette={palette} outfit={outfit} fist={barehanded} side={-1} />
          {weapon === 'cursed' && <CursedBlade palette={palette} />}
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

          <Face palette={palette} />

          {/* Pièce de tête, animée séparément : chapeau, coupe ou crinière. */}
          <group ref={headwear} position={[0, 0.16, 0]} rotation={[skin.rest, 0, 0]}>
            <Headwear palette={palette} />
          </group>
        </group>
      </group>
    </group>
  )
}

/**
 * Jambe : mollet nu sous un short, pantalon sombre dans une botte, ou mollet
 * bandé de lin sur une sandale plate.
 */
function Leg({ palette, outfit }: { palette: Palette; outfit: OutfitId }) {
  if (outfit === 'madara') {
    return (
      <group>
        <mesh castShadow position={[0, -0.16, 0]}>
          <capsuleGeometry args={[0.075, 0.16, 4, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
        </mesh>

        {/* Bandages : trois anneaux qui débordent du mollet. Ce sont les
            interstices entre eux, et non les anneaux, qui font lire du tissu
            enroulé plutôt qu'une guêtre d'une seule pièce. */}
        {[-0.1, -0.18, -0.26].map((y) => (
          <mesh key={y} castShadow position={[0, y, 0]}>
            <cylinderGeometry args={[0.086, 0.086, 0.05, 10]} />
            <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
          </mesh>
        ))}

        <mesh castShadow position={[0, -0.35, 0.02]}>
          <boxGeometry args={[0.17, 0.1, 0.22]} />
          <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      </group>
    )
  }

  if (outfit === 'zoro') {
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

/**
 * Bras et main, suspendus sous le pivot d'épaule.
 *
 * Nus dans les deux premiers skins, pris dans le lin et les lamelles pour le
 * troisième — c'est le seul dont le bras porte quelque chose, et c'est ce qui
 * élargit sa silhouette vue de face.
 */
function Arm({
  palette,
  outfit,
  fist,
  side,
}: {
  palette: Palette
  outfit: OutfitId
  /** Main nue et fermée : la main grossit, parce qu'elle est l'arme. */
  fist: boolean
  /** +1 pour le bras gauche du modèle, -1 pour le droit. Oriente l'épaulière. */
  side: number
}) {
  const clan = outfit === 'madara'

  return (
    <group>
      <mesh castShadow position={[0, -0.14, 0]}>
        <capsuleGeometry args={[outfit === 'luffy' ? 0.058 : 0.06, 0.17, 4, 10]} />
        {/* Le bras du clan est pris dans le lin jusqu'au poignet : c'est le
            tissu qu'on voit, pas la peau. */}
        <meshToonMaterial
          color={clan ? palette.trouser : palette.skin}
          gradientMap={toonGradient}
        />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Épaulière à lamelles : trois plaques qui s'écartent vers l'extérieur.
          C'est la pièce la plus reconnaissable de la tenue du clan, et la seule
          qui élargisse vraiment la silhouette vue de face. */}
      {clan &&
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
      {clan && (
        <mesh castShadow position={[0, -0.2, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.11, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
        </mesh>
      )}

      {/* Bandana noué au biceps gauche, donc du côté qui balance librement
          pendant l'attaque : le seul détail de la tenue qui s'anime sans un
          ressort de plus. */}
      {outfit === 'zoro' && side > 0 && (
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
 * Buste du troisième skin : manteau long et fermé, plastron de lamelles.
 *
 * C'est le seul des trois dont le vêtement de buste ne s'ouvre pas. Les deux
 * autres montrent un torse nu entre deux pans, et c'est ce qui les fait lire
 * comme des combattants ; celui-ci montre une armure, et une armure ouverte sur
 * la poitrine n'en est plus une. La silhouette y gagne au passage la seule
 * forme en cloche des trois — 0,36 de rayon en bas contre 0,30 et 0,37 pour des
 * pans qui, eux, laissent voir au travers.
 */
function ClanTorso({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh castShadow position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.21, 0.36, 0.6, 14]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Ceinture, fine : le plastron occupe déjà toute la hauteur du buste, un
          haramaki de plus l'aurait coupé en deux. */}
      <mesh castShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.27, 0.28, 0.07, 14]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
      </mesh>

      <ClanArmor palette={palette} />
    </>
  )
}

/**
 * Plastron du clan : lamelles laquées, col montant et longs pans dans le dos.
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
        robe unie avec deux épaulières rouges. C'est le même piège que la
        balafre du bretteur : il faut sortir du volume qu'on habille, pas s'y
        loger.
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
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}
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
 * Visage du troisième skin : front mangé par la frange, bouche fermée.
 *
 * Les trois visages se distinguent par la **bouche** avant tout le reste, parce
 * que c'est le seul trait qui reste lisible une fois la pièce de tête
 * reconnue : un sourire en arc pour le premier, une ligne droite pour le
 * second, et pour celui-ci une ligne plus courte et plus basse — une bouche
 * qu'on ne voit pas parler.
 *
 * Les yeux restent haut et la frange descend jusqu'à eux : c'est ce qui donne
 * le regard couvert, et c'est un réglage à cinq centimètres près. Deux
 * centimètres plus bas, la frange mange les yeux et il ne reste qu'un casque
 * noir ; deux centimètres plus haut, le front se dégage et le personnage
 * redevient avenant.
 */
function ClanFace({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Frange, aplatie sur le crâne. */}
      <mesh castShadow position={[0, 0.11, 0.03]} scale={[1, 0.62, 1]}>
        <sphereGeometry args={[0.265, 16, 14]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>

      {/* Mèches qui retombent devant les tempes : c'est ce qui fait passer la
          coupe de « cheveux courts sombres » à « crinière », de face comme de
          profil — la masse arrière, elle, ne se voit pas de face. */}
      {[0.2, -0.2].map((x) => (
        <mesh key={x} castShadow position={[x, -0.06, 0.16]} rotation={[0.22, 0, 0]}>
          <boxGeometry args={[0.09, 0.34, 0.06]} />
          <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* yeux : la face regarde +Z */}
      {[0.09, -0.09].map((x) => (
        <mesh key={x} position={[x, 0.01, 0.235]} scale={[0.5, 1, 0.4]}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshBasicMaterial color={palette.eye} />
        </mesh>
      ))}

      <mesh position={[0, -0.1, 0.222]}>
        <boxGeometry args={[0.085, 0.016, 0.01]} />
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

/** Acier de la lame maudite : sombre et mat, il ne renvoie rien. */
const CURSED_STEEL = '#2e2630'
/** Le fil, et lui seul. C'est la seule chose qui brille sur cette arme. */
const CURSED_EDGE = '#b03a3a'

/**
 * Lame maudite.
 *
 * Elle doit se distinguer du katana **en une image**, parce que les deux se
 * portent au même emplacement et s'excluent : le joueur qui ouvre son
 * inventaire doit savoir laquelle il a au poing sans lire l'étiquette. Trois
 * écarts s'en chargent, et ils vont tous dans le même sens — celui d'une arme
 * plus courte et plus brutale :
 *
 *  - **la longueur.** 0,62 contre 1,06 pour le katana, poignée comprise. C'est
 *    une lame qu'on tient à une main, et la silhouette le dit de loin ;
 *  - **la teinte.** Un acier presque noir au lieu du blanc bleuté, avec le
 *    seul fil en rouge sourd. Une lame claire à ébréchures se serait lue comme
 *    un katana abîmé, pas comme une autre arme ;
 *  - **les ébréchures.** Trois encoches taillées dans le dos, à des hauteurs
 *    inégales : régulières, elles auraient fait une scie, donc un outil.
 *
 * Pas de tsuba : la garde est une simple barre droite. Le disque est la
 * signature du katana, et la lui reprendre aurait annulé les trois écarts
 * ci-dessus.
 */
function CursedBlade({ palette }: { palette: Palette }) {
  return (
    <group position={[-0.02, -0.28, 0.02]} rotation={[0.2, 0, -0.08]}>
      {/* Poignée courte, à une main, ligaturée serré. */}
      <mesh castShadow position={[0, 0.09, 0]}>
        <boxGeometry args={[0.052, 0.19, 0.052]} />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
      </mesh>
      {[0.03, 0.09, 0.15].map((y) => (
        <mesh key={y} castShadow position={[0, y, 0]}>
          <boxGeometry args={[0.064, 0.025, 0.064]} />
          <meshToonMaterial color={CURSED_STEEL} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Garde : une barre droite, pas un disque. */}
      <mesh castShadow position={[0, 0.2, 0]}>
        <boxGeometry args={[0.2, 0.035, 0.07]} />
        <meshToonMaterial color={CURSED_STEEL} gradientMap={toonGradient} />
      </mesh>

      {/* Lame, large et courte. Même discipline que le katana : le contour
          n'est posé que sur le tronçon principal, sinon deux contours se
          croisent au raccord et tracent une arête noire en travers. */}
      <mesh castShadow position={[0, 0.46, -0.01]} rotation={[0.03, 0, 0]}>
        <boxGeometry args={[0.078, 0.5, 0.03]} />
        <meshToonMaterial
          color={CURSED_STEEL}
          gradientMap={toonGradient}
          emissive={CURSED_EDGE}
          emissiveIntensity={0.18}
        />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Le fil, plaqué sur la tranche : une fine lamelle rouge, la seule chose
          qui accroche la lumière sur toute l'arme. */}
      <mesh position={[0.04, 0.46, -0.01]}>
        <boxGeometry args={[0.012, 0.5, 0.032]} />
        <meshToonMaterial
          color={CURSED_EDGE}
          gradientMap={toonGradient}
          emissive={CURSED_EDGE}
          emissiveIntensity={0.7}
        />
      </mesh>

      {/* Trois ébréchures, taillées dans le dos à hauteurs inégales. Ce sont
          des creux de la couleur du décor derrière : à cette échelle, un vrai
          trou dans la géométrie aurait coûté une découpe pour un pixel. */}
      {[0.3, 0.47, 0.63].map((y, index) => (
        <mesh key={y} position={[-0.038, y, -0.01]} rotation={[0, 0, 0.5 - index * 0.2]}>
          <boxGeometry args={[0.026, 0.038, 0.034]} />
          <meshToonMaterial color={palette.outline} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Pointe coupée droit, presque carrée : la lame est brisée net, pas
          effilée. */}
      <mesh castShadow position={[0, 0.73, -0.008]}>
        <boxGeometry args={[0.07, 0.06, 0.03]} />
        <meshToonMaterial color={CURSED_STEEL} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}
