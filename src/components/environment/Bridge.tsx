import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import { type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  BRIDGE,
  BRIDGE_LENGTH,
  BRIDGE_PITCH,
  BRIDGE_SLOPE,
  BRIDGE_YAW,
} from '../../config/bridge'
import { sampleHeight } from '../../config/world'
import { toonGradient } from '../models/toonGradient'
import { box, cyl, Z_FIGHT_LIFT } from './solids'

/**
 * Pont de Nakano.
 *
 * Une rampe droite de dix-sept unités, du sable des terres arides au flanc de
 * l'îlot. Trois décisions la structurent :
 *
 *  - **le tablier est une rampe unique, pas une volée de marches.** C'est le
 *    piège déjà payé sur l'escalier du Temple du Sommet : le personnage est
 *    piloté en vélocité et n'a pas d'autostep, donc l'arête d'une marche
 *    renvoie une normale de contact presque horizontale — elle repousse, elle
 *    ne soulève jamais. À 16,7° la rampe est deux fois plus raide que celle du
 *    temple et reste très en deçà du flanc de montagne que le joueur gravit
 *    déjà ;
 *  - **les deux ancrages sont lus dans le relief** (voir `config/bridge.ts`),
 *    pas écrits ici. Le tablier affleure le sol à ses deux extrémités, donc on
 *    entre sur le pont et on en sort sans marche ;
 *  - **les piles descendent jusqu'au fond**, chacune à la hauteur que
 *    `sampleHeight` lui donne. Des piles de longueur fixe auraient flotté
 *    au-dessus de la fosse et se seraient enfoncées sous le haut-fond : c'est
 *    ce qui trahit le plus vite un pont posé « à peu près ».
 *
 * Repère local : origine au pied du pont, **+Z vers l'îlot**, comme tout modèle
 * du projet. Le groupe porte le cap ; la pente, elle, est portée par chaque
 * pièce, ce qui permet aux piles de rester verticales.
 */

/** Vermillon des torii, et sa version ombrée. Rien d'autre sur la carte n'est de cette teinte. */
const VERMILION = '#c4402f'
const VERMILION_DARK = '#96291f'
/** Bois du tablier, plus gris que celui des coffres : c'est du bois de mer. */
const PLANK = '#8a7355'
const PLANK_DARK = '#5d4a34'
/** Pierre des semelles et des socles, accordée au calcaire blond des îles. */
const STONE = '#bfb193'

const HALF_W = BRIDGE.width / 2
/** Hauteur du garde-corps au-dessus du tablier. */
const RAIL_H = 1.05
/** Section des poteaux et de la lisse. */
const RAIL_T = 0.16
/** Entraxe des poteaux, le long de la pente. */
const POST_SPACING = 2.15
/** Entraxe des piles. Deux fois celui des poteaux : une pile est un ouvrage. */
const PIER_SPACING = 4.3
/** Demi-section d'une pile. */
const PIER_HALF = 0.34

/**
 * Cotes du portique d'entrée, planté au pied du pont.
 *
 * Il n'est pas décoratif : la plage des terres arides est une bande de sable
 * nue de quarante unités de long, et rien n'y disait où traverser. Le torii est
 * le seul volume vertical de la côte — c'est lui qui fait la promesse, le pont
 * ne fait que la tenir. Sa hauteur est calée sur le personnage (1,6) : à 4,2
 * sous le linteau, on passe dessous en le voyant passer au-dessus de soi.
 */
const TORII = { height: 4.2, halfSpan: 2.05, postR: 0.19 } as const

/** Point du tablier à l'abscisse `s` (distance horizontale depuis le pied). */
const deckY = (s: number) => s * BRIDGE_SLOPE

/**
 * Passe d'une abscisse le long du pont à la position monde correspondante.
 *
 * Le repère local est tourné de `BRIDGE_YAW` autour de +Y, l'axe local +Z valant
 * la direction du pont : un point (0, ·, s) tombe donc en
 * `pied + s · (sin yaw, cos yaw)`.
 */
function worldAt(s: number) {
  return {
    x: BRIDGE.foot.x + Math.sin(BRIDGE_YAW) * s,
    z: BRIDGE.foot.z + Math.cos(BRIDGE_YAW) * s,
  }
}

/** Sol local à l'abscisse `s`, relatif au pied du pont. */
function groundAt(s: number) {
  const { x, z } = worldAt(s)
  return sampleHeight(x, z) - BRIDGE.foot.y
}

/** Abscisse du portique : en avant du pied, sur le sable. */
const TORII_Z = -2
const TORII_GROUND = groundAt(TORII_Z)
/** Débord du linteau, de part et d'autre des fûts. */
const span = TORII.halfSpan * 2 + 1.5

/**
 * Charpente, fusionnée par teinte.
 *
 * Une soixantaine de solides — planches, poteaux, lisses, piles — coûteraient
 * autant de draw calls sur un budget déjà tenu par la végétation. Rien ne
 * bouge : on fusionne une fois pour toutes, comme les monuments.
 */
function buildBridge() {
  const plank: BufferGeometry[] = []
  const dark: BufferGeometry[] = []
  const red: BufferGeometry[] = []
  const redDark: BufferGeometry[] = []
  const stone: BufferGeometry[] = []

  // --- Tablier ---------------------------------------------------------------
  // Une dalle inclinée, puis les planches par-dessus. La dalle seule se lisait
  // comme une passerelle métallique ; ce sont les joints entre planches qui
  // donnent l'échelle et le sens de la traversée.
  const deck = box(BRIDGE.width, BRIDGE.thickness, BRIDGE_LENGTH, 0, 0, 0)
  deck.rotateX(-BRIDGE_PITCH)
  deck.translate(0, BRIDGE.rise / 2 - BRIDGE.thickness / 2, BRIDGE.run / 2)
  dark.push(deck)

  const plankCount = Math.round(BRIDGE_LENGTH / 0.62)
  for (let i = 0; i < plankCount; i++) {
    // Les planches mordent dans la dalle plutôt que d'affleurer avec elle :
    // deux faces horizontales à la même cote se battent dans le tampon de
    // profondeur (voir `Z_FIGHT_LIFT`).
    const s = ((i + 0.5) / plankCount) * BRIDGE.run
    const board = box(BRIDGE.width - 0.06, 0.09, 0.5, 0, 0, 0)
    board.rotateX(-BRIDGE_PITCH)
    board.translate(0, deckY(s) + 0.03, s)
    plank.push(board)
  }

  // --- Garde-corps ------------------------------------------------------------
  // Deux lisses vermillon portées par des poteaux, de chaque côté. La lisse
  // basse n'est pas un détail : sans elle, vu en plongée de 17°, le pont n'avait
  // qu'un trait rouge en l'air et le vide en dessous se lisait mal.
  const postCount = Math.floor(BRIDGE.run / POST_SPACING)
  for (let i = 0; i <= postCount; i++) {
    const s = (i / postCount) * BRIDGE.run
    for (const side of [-1, 1]) {
      red.push(box(RAIL_T, RAIL_H, RAIL_T, side * (HALF_W - RAIL_T / 2), deckY(s) + RAIL_H / 2, s))
    }
  }
  for (const side of [-1, 1]) {
    for (const [height, thickness] of [
      [RAIL_H, 0.14],
      [RAIL_H * 0.5, 0.09],
    ] as const) {
      const rail = box(0.13, thickness, BRIDGE_LENGTH, 0, 0, 0)
      rail.rotateX(-BRIDGE_PITCH)
      rail.translate(side * (HALF_W - RAIL_T / 2), BRIDGE.rise / 2 + height, BRIDGE.run / 2)
      red.push(rail)
    }
  }

  // --- Piles ------------------------------------------------------------------
  // Verticales, et de la longueur que le fond leur impose. Les premières et les
  // dernières sont omises : là le tablier frôle le sol, une pile n'aurait pas eu
  // la place d'exister.
  const pierCount = Math.floor(BRIDGE.run / PIER_SPACING)
  for (let i = 1; i < pierCount; i++) {
    const s = (i / pierCount) * BRIDGE.run
    const top = deckY(s) - BRIDGE.thickness
    const ground = groundAt(s)
    const height = top - ground
    if (height < 0.6) continue

    for (const side of [-1, 1]) {
      const x = side * (HALF_W - PIER_HALF - 0.15)
      redDark.push(box(PIER_HALF * 2, height, PIER_HALF * 2, x, ground + height / 2, s))
      // Semelle noyée dans le fond : une pile qui s'arrête pile au sol laisse
      // voir un jour dès que le maillage du terrain n'est pas exactement plan.
      stone.push(box(PIER_HALF * 2.6, 0.5, PIER_HALF * 2.6, x, ground - 0.1, s))
    }
    // Entretoise entre les deux fûts : c'est elle qui les fait lire comme une
    // pile et non comme deux pieux plantés côte à côte.
    dark.push(box(BRIDGE.width - 0.7, 0.18, 0.22, 0, top - 0.55, s))
  }

  // --- Torii du pied ----------------------------------------------------------
  //
  // Pas de culée maçonnée aux deux bouts, et c'est une conséquence directe du
  // choix des ancrages : le tablier *affleure* le sol à ses deux extrémités, il
  // n'y a donc aucune tranche à masquer — et un bloc de pierre posé là aurait
  // rendu au pont la marche d'entrée qu'on venait précisément d'éliminer.
  //
  // Le portique, lui, est planté deux unités en avant du pied, sur le sable, à
  // la hauteur que le relief lui donne : la plage remonte doucement vers les
  // terres, une cote locale figée l'aurait enterré ou suspendu.
  red.push(box(span, 0.22, 0.3, 0, TORII_GROUND + TORII.height - 0.11, TORII_Z))
  redDark.push(box(span + 0.4, 0.16, 0.42, 0, TORII_GROUND + TORII.height + 0.05, TORII_Z))
  // Traverse basse et cale centrale : c'est ce qui distingue un torii d'un
  // simple portique, avec le débord du linteau.
  red.push(box(TORII.halfSpan * 2 + 0.5, 0.17, 0.24, 0, TORII_GROUND + TORII.height - 0.85, TORII_Z))
  redDark.push(box(0.26, 0.62, 0.3, 0, TORII_GROUND + TORII.height - 0.5, TORII_Z))
  for (const side of [-1, 1]) {
    const x = side * TORII.halfSpan
    // Le fût descend un demi-mètre sous le sable : sans ça, le moindre écart
    // entre le maillage du terrain et `sampleHeight` laisse voir un jour sous
    // le poteau.
    red.push(cyl(TORII.postR * 0.86, TORII.postR, TORII.height + 0.5, x, TORII_GROUND - 0.5, TORII_Z, 8))
    stone.push(cyl(TORII.postR * 1.9, TORII.postR * 2.2, 0.4, x, TORII_GROUND - 0.22, TORII_Z, 8))
  }

  return {
    plank: mergeGeometries(plank)!,
    dark: mergeGeometries(dark)!,
    red: mergeGeometries(red)!,
    redDark: mergeGeometries(redDark)!,
    stone: mergeGeometries(stone)!,
  }
}

const geometry = buildBridge()

/**
 * Colliders du pont.
 *
 * Le tablier est **une seule rampe**, pour la raison dite en tête de fichier.
 * Les garde-corps en sont : sans eux, le joueur tombe du pont à la première
 * course en diagonale, et la chute de trois unités dans une fosse dont on ne
 * ressort que par le pont serait une punition pour avoir couru.
 */
function BridgeColliders() {
  const centerY = BRIDGE.rise / 2 - BRIDGE.thickness / 2
  const centerZ = BRIDGE.run / 2

  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider
        args={[HALF_W, BRIDGE.thickness / 2, BRIDGE_LENGTH / 2]}
        position={[0, centerY, centerZ]}
        rotation={[-BRIDGE_PITCH, 0, 0]}
      />
      {[-1, 1].map((side) => (
        <CuboidCollider
          key={`rail-${side}`}
          args={[RAIL_T / 2, RAIL_H / 2, BRIDGE_LENGTH / 2]}
          position={[side * (HALF_W - RAIL_T / 2), centerY + RAIL_H / 2, centerZ]}
          rotation={[-BRIDGE_PITCH, 0, 0]}
        />
      ))}
      {/* Les fûts du portique bloquent : on passe *entre* eux, on ne les
          traverse pas. Le linteau, lui, est à 4,2 — hors d'atteinte. */}
      {[-1, 1].map((side) => (
        <CylinderCollider
          key={`torii-${side}`}
          args={[TORII.height / 2, TORII.postR]}
          position={[side * TORII.halfSpan, TORII_GROUND + TORII.height / 2, TORII_Z]}
        />
      ))}
    </RigidBody>
  )
}

export function Bridge() {
  return (
    <group
      position={[BRIDGE.foot.x, BRIDGE.foot.y + Z_FIGHT_LIFT, BRIDGE.foot.z]}
      rotation={[0, BRIDGE_YAW, 0]}
    >
      <mesh geometry={geometry.plank} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={PLANK} />
      </mesh>
      <mesh geometry={geometry.dark} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={PLANK_DARK} />
      </mesh>
      <mesh geometry={geometry.red} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={VERMILION} />
      </mesh>
      <mesh geometry={geometry.redDark} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={VERMILION_DARK} />
      </mesh>
      <mesh geometry={geometry.stone} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={STONE} />
      </mesh>
      <BridgeColliders />
    </group>
  )
}
