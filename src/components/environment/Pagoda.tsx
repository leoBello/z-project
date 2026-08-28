import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { ConeGeometry, type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { NAKANO } from '../../config/landmarks'
import { toonGradient } from '../models/toonGradient'
import { faceted } from './faceted'
import { box, cyl, Z_FIGHT_LIFT } from './solids'

/**
 * Temple de Nakano — la pagode de l'îlot du nord-est.
 *
 * Quatre toits empilés, un fût rouge, une flèche. C'est le seul monument de la
 * carte qui se lise de loin par sa **silhouette découpée** plutôt que par sa
 * masse : les quatre autres sont des blocs (temple, pyramide, stèle, idole), et
 * une cinquième masse aurait fait doublon depuis le continent. Les débords de
 * toiture successifs donnent au contraire une découpe en escalier, reconnaissable
 * à trente unités par-dessus la mer.
 *
 * Trois cotes commandent tout le reste :
 *
 *  - **le socle fait 5,9 de côté**, soit 4,17 aux angles. Le plateau de l'îlot
 *    est plat à la valeur près jusqu'à 4,7 de rayon (mesuré par balayage, voir
 *    la terrasse de `NAKANO`) : le monument tient donc entièrement sur du plan,
 *    angles compris, ce qu'un socle plus large n'aurait pas permis ;
 *  - **chaque étage naît sous le toit qui le précède**, jamais à son sommet. Un
 *    étage posé sur l'arête laisserait un jour triangulaire à chaque coin, et
 *    c'est exactement ce qu'on voit sur les pagodes mal modélisées ;
 *  - **le toit du sommet est le plus haut des quatre**, alors que les
 *    précédents s'aplatissent. C'est ce qui fait monter le regard jusqu'à la
 *    flèche au lieu de le laisser s'arrêter au premier débord.
 */

// --- Palette ----------------------------------------------------------------

/** Ardoise bleu-vert des toitures. Elle reprend le bleu-parme de la brume. */
const ROOF = '#2f4d5e'
/** Sous-face et arêtes des toits : la valeur qui détache chaque débord du suivant. */
const ROOF_DARK = '#20394a'
/** Laque vermillon des fûts et des parois. */
const RED = '#c4402f'
/** Bois laqué sombre : socle, poutraison, garde-corps. */
const RED_DARK = '#8e2620'
/** Papier des fenêtres. Cassé, jamais blanc pur : le blanc pur brille plus que la neige. */
const PAPER = '#f0e8d8'
/** Dallage de l'îlot, accordé au calcaire blond des ruines de l'autre île. */
const STONE = '#c6b995'
/** Or de la flèche. */
const GOLD = '#d9a441'

// --- Cotes ------------------------------------------------------------------

/** Rayon du dallage. Sous le rayon plat de la terrasse, angles du socle compris. */
const PAVING_R = 4.5
/** Demi-côté du socle, du fût, et emprise des colliders. */
const PODIUM_HALF = 2.95
const BODY_HALF = 2.25

/**
 * Étages, du bas vers le haut.
 *
 * `wall` est le côté de la paroi, `eave` celui du débord de toit, `pitch` la
 * hauteur du toit. Une table plutôt que quatre blocs recopiés : les quatre
 * étages ne diffèrent que par leurs cotes, et les recopier aurait garanti qu'un
 * réglage sur l'un ne soit pas reporté sur les autres.
 */
const TIERS = [
  { wallHeight: 0.42, wall: 4.5, eave: 7.0, pitch: 1.25, windows: 0 },
  { wallHeight: 0.85, wall: 3.7, eave: 6.0, pitch: 1.1, windows: 5 },
  { wallHeight: 0.78, wall: 3.1, eave: 5.1, pitch: 1.0, windows: 5 },
  { wallHeight: 0.72, wall: 2.5, eave: 4.2, pitch: 1.5, windows: 3 },
] as const

/** Épaisseur de la planche de rive, sous chaque pan. */
const EAVE_H = 0.17

/**
 * Toit à quatre pans.
 *
 * Un cône à quatre segments, tourné d'un huitième de tour pour que ses faces
 * regardent les axes et non les diagonales. Le rayon d'un cône est celui du
 * cercle **circonscrit** à sa base : pour un débord de côté `eave`, il vaut
 * donc `eave · √2 / 2`. L'écrire ainsi plutôt qu'en dur évite l'erreur
 * classique du toit trop étroit d'un facteur 1,41.
 */
function roof(eave: number, pitch: number, y: number) {
  const geometry = faceted(new ConeGeometry((eave * Math.SQRT2) / 2, pitch, 4))
  geometry.rotateY(Math.PI / 4)
  return geometry.translate(0, y + pitch / 2, 0)
}

/**
 * Rangée de fenêtres sur les quatre faces d'un étage.
 *
 * Les quatre faces et pas seulement celle du sud : la caméra est fixe mais le
 * joueur tourne autour du monument, et une pagode aveugle de trois côtés se
 * remarque au premier tour. Le coût est nul — tout est fusionné en amont.
 */
function windowRow(count: number, half: number, y: number, height: number) {
  const frames: BufferGeometry[] = []
  const panes: BufferGeometry[] = []
  const width = ((half * 2) / (count + 1)) * 0.72
  const paneH = height * 0.62

  for (let i = 0; i < count; i++) {
    const offset = ((i + 1) / (count + 1) - 0.5) * half * 2
    for (const rotated of [false, true]) {
      for (const side of [1, -1]) {
        const x = rotated ? side * half : offset
        const z = rotated ? offset : side * half
        // Cadre et papier sont tous deux **centrés sur le plan de la paroi** et
        // mordent dedans : rien n'affleure, donc rien ne clignote. Le papier est
        // plus étroit mais **ressort davantage** que le cadre — c'est ce
        // renversement, et non une différence de position, qui fait que le cadre
        // se lit comme une bordure et non comme une plaque posée par-dessus.
        frames.push(
          rotated
            ? box(0.18, paneH + 0.14, width + 0.12, x, y, z)
            : box(width + 0.12, paneH + 0.14, 0.18, x, y, z),
        )
        panes.push(
          rotated ? box(0.26, paneH, width, x, y, z) : box(width, paneH, 0.26, x, y, z),
        )
      }
    }
  }
  return { frames, panes }
}

function buildPagoda() {
  const stone: BufferGeometry[] = []
  const red: BufferGeometry[] = []
  const redDark: BufferGeometry[] = []
  const roofs: BufferGeometry[] = []
  const roofDark: BufferGeometry[] = []
  const paper: BufferGeometry[] = []
  const gold: BufferGeometry[] = []

  // --- Dallage ---------------------------------------------------------------
  // Un disque à peine proéminent, enfoncé dans le plateau : il pave, il ne
  // surélève pas. Cinq centimètres de relief n'ont pas besoin de collider, et
  // n'en méritent pas — une marche, même basse, est un mur pour un personnage
  // sans autostep.
  stone.push(cyl(PAVING_R, PAVING_R + 0.15, 0.16, 0, -0.11, 0, 16))

  // --- Socle -----------------------------------------------------------------
  redDark.push(box(PODIUM_HALF * 2, 0.3, PODIUM_HALF * 2, 0, 0.15, 0))
  redDark.push(box(5.3, 0.28, 5.3, 0, 0.44, 0))
  red.push(box(4.8, 0.22, 4.8, 0, 0.69, 0))

  // --- Rez-de-chaussée : colonnade ouverte -----------------------------------
  // Huit fûts, angles et milieux. C'est le vide entre eux qui fait lire un
  // bâtiment posé sur pilotis plutôt qu'un bloc peint en rouge.
  const PILLAR_TOP = 1.95
  for (const px of [-2.1, 0, 2.1]) {
    for (const pz of [-2.1, 0, 2.1]) {
      if (px === 0 && pz === 0) continue
      red.push(box(0.3, PILLAR_TOP - 0.8, 0.3, px, (PILLAR_TOP + 0.8) / 2, pz))
    }
  }

  // --- Étages ----------------------------------------------------------------
  // `y` suit le dessus de la dernière planche de rive posée. Chaque paroi
  // *redescend* sous le toit précédent (voir l'en-tête) : son pied est calé sur
  // la cote du pan à l'aplomb de sa propre demi-largeur.
  let y = PILLAR_TOP
  TIERS.forEach((tier, index) => {
    const half = tier.wall / 2
    let base = y
    if (index > 0) {
      const previous = TIERS[index - 1]
      // Cote du pan précédent à l'aplomb de cette paroi. `y` est le **faîte** du
      // toit ; on redescend donc le long du pan proportionnellement à la
      // distance à l'axe, le cercle inscrit de la base du cône valant la moitié
      // du débord. Les cinq centimètres de plus enfoncent le pied de la paroi
      // sous la toiture : sans eux, un jour triangulaire s'ouvre à chaque coin.
      base = y - previous.pitch * (half / (previous.eave / 2)) - 0.05
    }
    const top = base + tier.wallHeight

    ;(index === 0 ? redDark : red).push(box(tier.wall, top - base, tier.wall, 0, (base + top) / 2, 0))

    if (tier.windows > 0) {
      const row = windowRow(tier.windows, half, (base + top) / 2, tier.wallHeight)
      redDark.push(...row.frames)
      paper.push(...row.panes)
    }

    // Balcon du dernier étage : une plate-forme débordante et sa balustrade.
    // C'est le détail qui donne l'échelle du sommet — sans lui, le quatrième
    // étage se lit comme une lanterne et non comme un étage habité.
    if (index === TIERS.length - 1) {
      // Débord du balcon : il doit rester **sous** le pan du toit inférieur à
      // son propre rayon, sinon sa rive flotte au-dessus de l'ardoise. À 0,42 le
      // dessous de la plate-forme passe huit centimètres sous le pan.
      const deckHalf = half + 0.42
      redDark.push(box(deckHalf * 2, 0.13, deckHalf * 2, 0, base - 0.065, 0))
      for (const side of [-1, 1]) {
        redDark.push(box(deckHalf * 2, 0.1, 0.1, 0, base + 0.4, side * deckHalf))
        redDark.push(box(0.1, 0.1, deckHalf * 2, side * deckHalf, base + 0.4, 0))
      }
      for (let i = 0; i <= 6; i++) {
        const offset = (i / 6 - 0.5) * deckHalf * 2
        for (const side of [-1, 1]) {
          redDark.push(box(0.07, 0.42, 0.07, offset, base + 0.21, side * deckHalf))
          redDark.push(box(0.07, 0.42, 0.07, side * deckHalf, base + 0.21, offset))
        }
      }
    }

    roofDark.push(box(tier.eave, EAVE_H, tier.eave, 0, top + EAVE_H / 2, 0))
    roofs.push(roof(tier.eave, tier.pitch, top + EAVE_H - Z_FIGHT_LIFT))
    y = top + EAVE_H + tier.pitch
  })

  // --- Flèche ----------------------------------------------------------------
  // Le *sōrin* : une base évasée, trois anneaux, une aiguille. Les anneaux ne
  // sont pas un ornement gratuit — c'est le seul endroit du monument où l'or
  // apparaît, et c'est lui qui fait le point d'exclamation dans le ciel.
  redDark.push(cyl(0.13, 0.24, 0.3, 0, y - 0.12, 0, 8))
  for (let i = 0; i < 3; i++) {
    gold.push(cyl(0.17 - i * 0.03, 0.19 - i * 0.03, 0.06, 0, y + 0.24 + i * 0.2, 0, 8))
  }
  gold.push(cyl(0.02, 0.07, 1.05, 0, y + 0.2, 0, 6))

  return {
    stone: mergeGeometries(stone)!,
    red: mergeGeometries(red)!,
    redDark: mergeGeometries(redDark)!,
    roofs: mergeGeometries(roofs)!,
    roofDark: mergeGeometries(roofDark)!,
    paper: mergeGeometries(paper)!,
    gold: mergeGeometries(gold)!,
  }
}

const geometry = buildPagoda()

export function Pagoda() {
  return (
    <group position={[NAKANO.x, NAKANO.altitude, NAKANO.z]} rotation={[0, NAKANO.yaw, 0]}>
      <mesh geometry={geometry.stone} receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={STONE} />
      </mesh>
      <mesh geometry={geometry.redDark} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={RED_DARK} />
      </mesh>
      <mesh geometry={geometry.red} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={RED} />
      </mesh>
      <mesh geometry={geometry.roofDark} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={ROOF_DARK} />
      </mesh>
      <mesh geometry={geometry.roofs} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={ROOF} />
      </mesh>
      {/*
        Le papier est légèrement émissif, et c'est ce qui fait vivre le monument
        sous le ciel violet : sans lui, les fenêtres deviennent des taches grises
        dès que le soleil passe derrière la pagode. L'intensité reste basse — on
        veut des fenêtres éclairées, pas des lampes.
      */}
      <mesh geometry={geometry.paper}>
        <meshToonMaterial
          gradientMap={toonGradient}
          color={PAPER}
          emissive="#ffdca6"
          emissiveIntensity={0.55}
        />
      </mesh>
      <mesh geometry={geometry.gold} castShadow>
        <meshToonMaterial
          gradientMap={toonGradient}
          color={GOLD}
          emissive={GOLD}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/*
        Deux pavés, et rien au-dessus : le socle et le fût. Les étages supérieurs
        commencent à 2,37 et sont hors d'atteinte d'un personnage qui saute d'une
        unité — leur donner des colliders aurait coûté sans jamais servir.
      */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[PODIUM_HALF, 0.4, PODIUM_HALF]} position={[0, 0.4, 0]} />
        <CuboidCollider args={[BODY_HALF, 0.785, BODY_HALF]} position={[0, 1.585, 0]} />
      </RigidBody>
    </group>
  )
}
