import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Outlines } from '@react-three/drei'
import {
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import type { BufferGeometry, Material } from 'three'
import { faceted } from '../environment/faceted'
import type { EnemyMaterials } from './models'
import { useLynelMaterials } from './lynelMaterials'
import type { LynelMaterials } from './lynelMaterials'

/* --- Cotes ---------------------------------------------------------------- */
/* Recopiées de la maquette, lignes 1014-1064. Tout le squelette en descend. */

/** Axe du tronc quadrupède. */
const BODY_Y = 1.52
/** Rayon du tronc. */
const BODY_R = 0.62
/** Demi-écartement des jambes. */
const HIP_X = 0.46
/** Antérieurs. */
const FORE_Z = 0.86
/** Postérieurs. */
const HIND_Z = -0.9
/** Naissance du buste, sur le garrot avant. */
const BUST: [number, number, number] = [0, 1.9, 0.78]
/** Inclinaison du buste : 6° vers l'arrière. */
const BUST_LEAN = -0.1
/** Épaules, dans le repère du buste. */
const SHOULDER_Y = 1.15
/** Tête, dans le repère du buste. */
const HEAD_Y = 1.58

/** Épaisseur du contour. Les ennemis ordinaires sont à 0,03 : le boss pèse plus. */
const OUTLINE = 0.045
const OUTLINE_THIN = 0.022
const OUTLINE_COLOR = '#20160f'

export type LynelPose = 'repos' | 'garde' | 'balayage' | 'charge' | 'cabre' | 'brise'

/**
 * Ce que `Lynel.tsx` peut demander au modèle.
 *
 * Deux méthodes et non quinze groupes : les articulations sont un détail du
 * modèle, et les exposer obligerait le composant de combat à connaître le
 * squelette. Il dit « garde », le modèle sait quels bras bougent.
 *
 * Par ref plutôt que par props : les poses changent dans un `useFrame`, et une
 * prop re-rendrait le boss soixante fois par seconde pour tourner un bras.
 */
export interface LynelRig {
  setPose: (pose: LynelPose) => void
  setRage: (on: boolean) => void
}

interface LynelModelProps {
  /** Pelage, marques et crinière — ceux qui flashent en blanc sous le coup. */
  materials: EnemyMaterials
}

type Vec3 = [number, number, number]

/* --- Pièces décrites par des données -------------------------------------- */

/**
 * La matière d'une pièce décrite en tableau, par son nom dans la maquette.
 *
 * Les tableaux mémoïsés (jambes, cornes, crinière) sont construits une fois au
 * chargement du module, avant qu'aucun jeu de matériaux n'existe : ils ne
 * peuvent donc porter qu'un nom, résolu au rendu. `fur`, `furDark` et `mane`
 * désignent les trois matériaux de `useEnemyMaterials` — ceux qui flashent.
 */
type MatKey = 'fur' | 'furDark' | 'mane' | keyof LynelMaterials

interface Piece {
  geometry: BufferGeometry
  material: MatKey
  position?: Vec3
  rotation?: Vec3
  quaternion?: Quaternion
  scale?: Vec3
  outline?: number
}

/*
  Les géométries facettées, les tubes et la lame vivent au niveau du module,
  comme l'éclat de `TreasureChest.tsx` : passées en prop, R3F ne les libère pas
  au démontage, et l'île se monte et se démonte à chaque franchissement du
  portail. Créées une fois, elles ne coûtent qu'une fois.
*/

/* --- Les jambes (maquette 1318-1378) --- */

const FETLOCK = faceted(new ConeGeometry(0.075, 0.26, 4))
const LEG_GEOMETRY = {
  thigh: new SphereGeometry(0.34, 11, 9),
  shank: new CapsuleGeometry(0.25, 0.4, 4, 10),
  knee: new SphereGeometry(0.21, 9, 7),
  cannon: new CapsuleGeometry(0.155, 0.42, 4, 9),
  pastern: new CylinderGeometry(0.13, 0.145, 0.16, 8),
  hoof: new CylinderGeometry(0.175, 0.205, 0.22, 8),
}

/*
  Antérieurs et postérieurs ne sont pas la même jambe : les antérieurs sont
  des colonnes droites, les postérieurs portent le jarret coudé du cheval —
  c'est cette articulation-là, et elle seule, qui fait lire la poussée vers
  l'avant, donc la charge.
*/
function legPieces(hind: boolean): { upper: Piece[]; lower: Piece[] } {
  return {
    upper: [
      {
        geometry: LEG_GEOMETRY.thigh,
        material: 'fur',
        scale: hind ? [0.95, 1.05, 1.15] : [0.92, 1.0, 1.0],
        outline: OUTLINE,
      },
      {
        geometry: LEG_GEOMETRY.shank,
        material: 'fur',
        position: [0, -0.34, 0],
        scale: hind ? [1.1, 1, 1.2] : [1, 1, 1],
        outline: OUTLINE,
      },
      { geometry: LEG_GEOMETRY.knee, material: 'furMid', position: [0, -0.66, 0] },
    ],
    lower: [
      { geometry: LEG_GEOMETRY.cannon, material: 'fur', position: [0, -0.34, 0] },
      { geometry: LEG_GEOMETRY.pastern, material: 'furDark', position: [0, -0.64, 0] },
      // Le fanon, la touffe de crinière au-dessus du sabot.
      ...[-0.6, 0, 0.6].map(
        (a): Piece => ({
          geometry: FETLOCK,
          material: 'mane',
          position: [Math.sin(a) * 0.12, -0.56, Math.cos(a) * 0.12 - 0.02],
          rotation: [2.5, a, 0],
        }),
      ),
      {
        geometry: LEG_GEOMETRY.hoof,
        material: 'hoof',
        position: [0, -0.75, 0],
        outline: OUTLINE_THIN,
      },
    ],
  }
}

const UPPER_ROTATION = { fore: 0.02, hind: 0.46 }
const LOWER_ROTATION = { fore: -0.02, hind: -0.48 }
const LOWER_Y = -0.66

function toMesh(piece: Piece): Mesh {
  const mesh = new Mesh(piece.geometry)
  if (piece.position) mesh.position.set(...piece.position)
  if (piece.rotation) mesh.rotation.set(...piece.rotation)
  if (piece.quaternion) mesh.quaternion.copy(piece.quaternion)
  if (piece.scale) mesh.scale.set(...piece.scale)
  return mesh
}

/**
 * Hauteur de la hanche qui pose le sabot à zéro.
 *
 * Mesurée sur la boîte englobante de la jambe, comme la maquette
 * (`hip.position.y -= box.min.y`), plutôt que calculée à la main : les angles
 * du jarret changeront, le sabot restera au sol. La jambe est bâtie une fois,
 * hors scène, dans des objets jetables — même boîte, même approximation par
 * les boîtes des géométries, donc au centième près la cote de la maquette.
 */
function measureHipY(hind: boolean): number {
  const pieces = legPieces(hind)
  const hip = new Group()
  const upper = new Group()
  upper.rotation.x = hind ? UPPER_ROTATION.hind : UPPER_ROTATION.fore
  hip.add(upper)
  const lower = new Group()
  lower.position.y = LOWER_Y
  lower.rotation.x = hind ? LOWER_ROTATION.hind : LOWER_ROTATION.fore
  upper.add(lower)
  for (const piece of pieces.upper) upper.add(toMesh(piece))
  for (const piece of pieces.lower) lower.add(toMesh(piece))
  hip.updateMatrixWorld(true)
  return -new Box3().setFromObject(hip).min.y
}

const LEGS = {
  fore: { ...legPieces(false), hipY: measureHipY(false) },
  hind: { ...legPieces(true), hipY: measureHipY(true) },
}

/* --- La queue (maquette 1379-1403) --- */

const TAIL = new TubeGeometry(
  new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(0.05, 0.14, -0.44),
    new Vector3(0.02, 0.02, -0.86),
    new Vector3(-0.05, -0.34, -1.14),
    new Vector3(-0.02, -0.72, -1.26),
  ]),
  16,
  0.1,
  6,
  false,
)
// La touffe, de la couleur de la crinière : c'est ce qui la relie à la tête.
const TAIL_TUFT_GEOMETRY = faceted(new ConeGeometry(0.11, 0.38, 5))
const TAIL_TUFT: Piece[] = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2
  return {
    geometry: TAIL_TUFT_GEOMETRY,
    material: i % 2 ? 'mane' : 'maneCool',
    position: [-0.02 + Math.cos(a) * 0.09, -0.8 + Math.sin(a) * 0.07, -1.3],
    rotation: [2.3, 0, a - Math.PI / 2],
  }
})

/* --- Buste, ceinture, harnais (maquette 1404-1457) --- */

const BELT_BUCKLE = faceted(new BoxGeometry(0.24, 0.21, 0.1))
const BELT_STRAP = faceted(new BoxGeometry(0.11, 1.05, 0.07))
const BELT_STUD = faceted(new SphereGeometry(0.042, 6, 5))

/* --- Épaulières (maquette 1458-1481) --- */

const PAULDRON_SPIKE = faceted(new ConeGeometry(0.06, 0.26, 5))

/* --- Épée (maquette 1515-1579) --- */

/*
  Le profil de la lame est un `Shape` extrudé : ce qui fait l'épée du Lynel,
  c'est le dos en dents de scie, et quatre dents taillées dans un contour 2D
  coûtent douze points là où des boîtes orientées à la main ne suivraient
  aucune correction de la silhouette.
*/
const BLADE = (() => {
  const shape = new Shape()
  shape.moveTo(-0.17, 0)
  shape.lineTo(-0.19, 0.55)
  shape.lineTo(-0.165, 1.35)
  shape.lineTo(-0.1, 2.0)
  shape.lineTo(0.0, 2.32) // la pointe
  shape.lineTo(0.17, 1.92) // le dos, dentelé
  shape.lineTo(0.1, 1.78)
  shape.lineTo(0.23, 1.52)
  shape.lineTo(0.12, 1.39)
  shape.lineTo(0.25, 1.1)
  shape.lineTo(0.13, 0.98)
  shape.lineTo(0.26, 0.68)
  shape.lineTo(0.14, 0.55)
  shape.lineTo(0.22, 0.26)
  shape.lineTo(0.19, 0)
  shape.closePath()
  return new ExtrudeGeometry(shape, {
    depth: 0.075,
    bevelEnabled: true,
    bevelSize: 0.018,
    bevelThickness: 0.014,
    bevelSegments: 1,
    curveSegments: 1,
  })
})()
const SWORD_FULLER = faceted(new BoxGeometry(0.075, 1.75, 0.09))
const SWORD_VEIN = faceted(new BoxGeometry(0.035, 1.55, 0.1))
const SWORD_GUARD = faceted(new BoxGeometry(0.52, 0.11, 0.17))
const SWORD_QUILLON = faceted(new ConeGeometry(0.055, 0.22, 5))
const SWORD_POMMEL = faceted(new OctahedronGeometry(0.1, 0))

/* --- Bouclier et arc (maquette 1580-1615) --- */

const SHIELD_PLATE = faceted(new CylinderGeometry(0.5, 0.5, 0.1, 7))
const SHIELD_BOSS_PLATE = faceted(new CylinderGeometry(0.32, 0.32, 0.12, 7))
const SHIELD_BOSS = faceted(new OctahedronGeometry(0.14, 0))
const SHIELD_SPIKE = faceted(new ConeGeometry(0.06, 0.24, 5))
const SHIELD_SPIKES: { position: Vec3; rotation: Vec3 }[] = Array.from({ length: 7 }, (_, i) => {
  const a = (i / 7) * Math.PI * 2 + 0.4
  return {
    position: [Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0],
    rotation: [Math.PI / 2, 0, -a + Math.PI / 2],
  }
})

const BOW = new TubeGeometry(
  new CatmullRomCurve3([
    new Vector3(0, -0.95, 0.06),
    new Vector3(0, -0.52, -0.16),
    new Vector3(0, 0, -0.24),
    new Vector3(0, 0.52, -0.16),
    new Vector3(0, 0.95, 0.06),
  ]),
  18,
  0.045,
  5,
  false,
)
const BOW_GRIP = faceted(new BoxGeometry(0.09, 0.3, 0.09))

/* --- Tête (maquette 1616-1694) --- */

const FANG = faceted(new ConeGeometry(0.038, 0.16, 5))
const EAR = faceted(new ConeGeometry(0.085, 0.22, 6))
const EAR_INNER = faceted(new ConeGeometry(0.052, 0.14, 5))

/* --- Cornes (maquette 1695-1741) --- */

/*
  Chaîne de tronçons plutôt qu'un tube : un `TubeGeometry` a un rayon constant,
  or une corne qui ne s'affine pas est un tuyau. La courbure s'accumule d'un
  tronçon au suivant — 0,30 radian par segment sur les six premiers, puis
  presque rien — ce qui donne l'enroulement du bélier : un grand arc vers
  l'arrière, et une pointe qui repart droit.

  Chaque tronçon dépend du précédent : la chaîne est déroulée ici, une fois,
  et le rendu ne fait plus que la parcourir.
*/
function hornPieces(sign: number): Piece[] {
  const pieces: Piece[] = []
  const pos = new Vector3(sign * 0.19, 0.24, -0.05)
  const dir = new Vector3(sign * 0.46, 0.89, -0.06).normalize()
  const up = new Vector3(0, 1, 0)
  const axisX = new Vector3(1, 0, 0)
  const axisZ = new Vector3(0, 0, 1)
  const SEG = 9
  const LEN = 0.155

  for (let i = 0; i < SEG; i++) {
    const t = i / SEG
    const t2 = (i + 1) / SEG
    const r0 = 0.118 * (1 - 0.86 * t)
    const r1 = 0.118 * (1 - 0.86 * t2)

    pieces.push({
      geometry: faceted(new CylinderGeometry(r1, r0, LEN, 7)),
      material: t > 0.6 ? 'horn' : 'hornDark',
      position: pos.clone().addScaledVector(dir, LEN / 2).toArray(),
      quaternion: new Quaternion().setFromUnitVectors(up, dir),
    })

    if (i % 2 === 0 && i < SEG - 2) {
      pieces.push({
        geometry: faceted(new TorusGeometry(r0 * 0.98, 0.03, 3, 9)),
        material: 'hornDark',
        position: pos.clone().addScaledVector(dir, LEN * 0.3).toArray(),
        quaternion: new Quaternion().setFromUnitVectors(axisZ, dir),
      })
    }

    pos.addScaledVector(dir, LEN)
    dir.applyAxisAngle(axisX, i < 6 ? -0.3 : -0.02)
    dir.applyAxisAngle(axisZ, -0.05 * sign)
    dir.normalize()
  }

  return pieces
}

const HORNS = [...hornPieces(-1), ...hornPieces(1)]

/* --- Crinière (maquette 1742-1812) --- */

/*
  Trois tronçons, un par pièce du corps, et c'est ce qui la fait *couler* :
  attachée à la seule tête, elle bouge comme une perruque ; distribuée du front
  à la croupe, elle relie les trois masses et donne à la bête sa ligne de dos.
*/
function shard(position: Vec3, rotation: Vec3, length: number, radius: number, i: number): Piece {
  return {
    geometry: faceted(new ConeGeometry(radius, length, 5)),
    material: i % 2 ? 'mane' : 'maneCool',
    position,
    rotation,
  }
}

/*
  Une collerette, et non des mèches semées autour du crâne : semées, elles se
  croisaient et la tête disparaissait dans un buisson. Toutes partent d'un
  même anneau derrière le crâne et s'écartent en corolle, inclinée de 0,62 rad
  vers l'arrière pour dégager la face.

  Le rayon de l'anneau — 0,345 pour un crâne de 0,32 — ne se négocie pas : en
  dessous, les mèches naissent sous la surface et n'en sortent jamais. Et des
  mèches de 0,175 de rayon se touchent et font masse, le seul état dans lequel
  une crinière se lit à la distance du combat.
*/
const RUFF: Piece[] = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2
  // Longue en haut et sur les côtés, courte sous la mâchoire.
  const len = 0.54 + 0.3 * Math.max(0, Math.sin(a + 0.4))
  return shard(
    [Math.cos(a) * 0.345, Math.sin(a) * 0.345 + 0.02, -0.1],
    [0.78, 0, a - Math.PI / 2],
    len,
    0.175,
    i,
  )
})

// Le long de la nuque et du dos du buste.
const NECK_MANE: Piece[] = Array.from({ length: 7 }, (_, i) => {
  const t = i / 6
  return shard([0, 1.3 - t * 1.04, -0.26 - t * 0.14], [-2.5 + t * 0.3, 0, 0], 0.62 - t * 0.18, 0.105, i)
})

// Et enfin sur l'échine du quadrupède, jusqu'à la croupe.
const SPINE_MANE: Piece[] = Array.from({ length: 5 }, (_, i) => {
  const t = i / 4
  return shard(
    [0, BODY_Y + 0.58 - t * 0.06, 0.32 - t * 1.16],
    [-2.7, 0, 0],
    0.54 - t * 0.18,
    0.115,
    i,
  )
})

/* --- Rendu ---------------------------------------------------------------- */

interface PartProps {
  material: Material
  geometry?: BufferGeometry
  position?: Vec3
  rotation?: Vec3
  quaternion?: Quaternion
  scale?: Vec3
  /** Épaisseur du contour ; aucun contour si absent. */
  outline?: number
  children?: ReactNode
}

/**
 * Une pièce, l'équivalent du `part()` + `outline()` de la maquette.
 *
 * Les yeux et les halos ne portent pas d'ombre : une lueur qui projette une
 * ombre est une contradiction qu'on verrait sur le dallage.
 */
function Part({ material, outline, children, ...placement }: PartProps) {
  return (
    <mesh castShadow={!(material instanceof MeshBasicMaterial)} material={material} {...placement}>
      {children}
      {/*
        `screenspace`, et le nom trompe : dans drei 10, c'est ce drapeau-là qui
        pousse les sommets le long de leur normale **dans le repère de l'objet**,
        comme le shader de la maquette. Sans lui, `thickness` se compte en
        *pixels* (`thickness / size * w * 2` dans le vertex shader) : 0,045 y
        vaut un vingtième de pixel, et le contour disparaît. Mesuré : à 0,3 sans
        le drapeau, le liseré ne faisait encore qu'un pixel autour du tronc.
      */}
      {outline !== undefined && <Outlines screenspace thickness={outline} color={OUTLINE_COLOR} />}
    </mesh>
  )
}

type MatPicker = (key: MatKey) => Material

function Pieces({ pieces, pick }: { pieces: Piece[]; pick: MatPicker }) {
  return pieces.map(({ material, ...rest }, i) => <Part key={i} material={pick(material)} {...rest} />)
}

interface LegProps {
  sign: number
  z: number
  hind: boolean
  pick: MatPicker
  upperRef: RefObject<Group | null>
  lowerRef: RefObject<Group | null>
}

function Leg({ sign, z, hind, pick, upperRef, lowerRef }: LegProps) {
  const leg = hind ? LEGS.hind : LEGS.fore
  return (
    <group position={[HIP_X * sign, leg.hipY, z]}>
      <group ref={upperRef} rotation-x={hind ? UPPER_ROTATION.hind : UPPER_ROTATION.fore}>
        <group
          ref={lowerRef}
          position-y={LOWER_Y}
          rotation-x={hind ? LOWER_ROTATION.hind : LOWER_ROTATION.fore}
        >
          <Pieces pieces={leg.lower} pick={pick} />
        </group>
        <Pieces pieces={leg.upper} pick={pick} />
      </group>
    </group>
  )
}

interface ArmProps {
  sign: number
  materials: EnemyMaterials
  mats: LynelMaterials
  rootRef: RefObject<Group | null>
  foreRef: RefObject<Group | null>
  /** Ce que tient la main : l'épée, à droite seulement. */
  children?: ReactNode
}

function Arm({ sign, materials, mats, rootRef, foreRef, children }: ArmProps) {
  return (
    <group
      ref={rootRef}
      position={[0.54 * sign, SHOULDER_Y - 0.09, 0.02]}
      rotation={[0.12, 0, 0.3 * -sign]}
    >
      <group ref={foreRef} position-y={-0.56} rotation-x={-0.72}>
        <Part material={materials.body} position={[0, -0.27, 0]}>
          <capsuleGeometry args={[0.15, 0.34, 4, 10]} />
        </Part>
        {/* Le brassard. */}
        <group>
          <Part material={mats.metal} position={[0, -0.23, 0]}>
            <cylinderGeometry args={[0.175, 0.19, 0.24, 12]} />
          </Part>
          <Part material={mats.gold} position={[0, -0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.185, 0.033, 3, 12]} />
          </Part>
        </group>
        <Part material={materials.dark} position={[0, -0.56, 0]} outline={OUTLINE_THIN}>
          <sphereGeometry args={[0.185, 9, 7]} />
        </Part>
        {children}
      </group>
      <Part material={materials.body} position={[0, -0.3, 0]} outline={OUTLINE}>
        <capsuleGeometry args={[0.17, 0.32, 4, 10]} />
      </Part>
      <Part material={mats.furMid} position={[0, -0.56, 0]}>
        <sphereGeometry args={[0.155, 9, 7]} />
      </Part>
    </group>
  )
}

/**
 * Une calotte, pas une boule : sphère pleine, l'épaulière descendait sous
 * l'épaule et couvrait le flanc du torse — précisément la masse qu'il faut
 * voir pour lire un centaure.
 */
function Pauldron({ sign, mats }: { sign: number; mats: LynelMaterials }) {
  return (
    <group position={[0.56 * sign, SHOULDER_Y + 0.08, -0.02]}>
      <Part material={mats.metal} scale={[1, 0.95, 1.05]} outline={OUTLINE_THIN}>
        <sphereGeometry args={[0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </Part>
      <Part material={mats.gold} position={[0, -0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.295, 0.048, 4, 14]} />
      </Part>
      {[0, 1, 2].map((i) => {
        const a = -0.45 + i * 0.45
        return (
          <Part
            key={i}
            geometry={PAULDRON_SPIKE}
            material={mats.goldBright}
            position={[sign * 0.19, 0.16, Math.sin(a) * 0.21]}
            rotation={[a * 0.5, 0, sign * -0.85]}
          />
        )
      })}
    </group>
  )
}

/**
 * Pas de contour sur la lame, et c'est volontaire : sur une géométrie
 * extrudée, dont les normales divergent brutalement aux arêtes, le trait se
 * fend à chaque coin. La gouttière sombre donne son épaisseur à la lame.
 */
function Sword({ mats }: { mats: LynelMaterials }) {
  return (
    <group position={[0, -0.58, 0.05]} rotation={[-0.25, 0, 0.1]}>
      <Part geometry={BLADE} material={mats.steel} position={[0, 0.16, -0.037]} />
      {/* La gouttière, et la veine violette qui la parcourt : c'est elle qui
          s'allume en phase III, le seul endroit où la lueur touche l'acier. */}
      <Part geometry={SWORD_FULLER} material={mats.steelDark} position={[-0.02, 1.05, 0]} />
      <Part geometry={SWORD_VEIN} material={mats.halo} position={[-0.02, 1.0, 0]} />
      {/* Garde, poignée, pommeau. */}
      <Part geometry={SWORD_GUARD} material={mats.gold} position={[0, 0.14, 0]} />
      {[-1, 1].map((s) => (
        <Part
          key={s}
          geometry={SWORD_QUILLON}
          material={mats.goldBright}
          position={[s * 0.24, 0.24, 0]}
          rotation={[0, 0, s * -0.5]}
        />
      ))}
      <Part material={mats.leather} position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.058, 0.064, 0.42, 10]} />
      </Part>
      <Part geometry={SWORD_POMMEL} material={mats.gold} position={[0, -0.34, 0]} />
    </group>
  )
}

/**
 * Le Lynel argenté.
 *
 * Géométrie originale, portée de `docs/maquettes/2026-09-19-lynel-argente.html`
 * — aucun asset sous licence. L'avant du modèle est **+Z**, comme le joueur et
 * comme les deux autres ennemis.
 *
 * Quatre masses, et c'est le rapport entre elles qui fait le Lynel plutôt que
 * le détail de chacune : un buste d'homme trop petit sur un corps de bête trop
 * gros. Le rapport qui compte tient en un nombre — **le buste vaut deux têtes
 * et demie**. La maquette l'a raté trois fois de suite en corrigeant la
 * crinière, le masque et le cou, alors que le défaut était là : un crâne de
 * 0,88 de haut pour un torse de 0,86 donne une figurine, et aucun détail ne
 * rattrape ça.
 */
export const LynelModel = forwardRef<LynelRig, LynelModelProps>(function LynelModel(
  { materials },
  ref,
) {
  const mats = useLynelMaterials()

  // Le rig : les articulations que la Task 3 posera, rotation de construction
  // comprise — une pose n'y exprimera que des écarts.
  const root = useRef<Group>(null)
  const bust = useRef<Group>(null)
  const head = useRef<Group>(null)
  const tail = useRef<Group>(null)
  const legFRu = useRef<Group>(null)
  const legFRl = useRef<Group>(null)
  const legFLu = useRef<Group>(null)
  const legFLl = useRef<Group>(null)
  const legHRu = useRef<Group>(null)
  const legHRl = useRef<Group>(null)
  const legHLu = useRef<Group>(null)
  const legHLl = useRef<Group>(null)
  const armRu = useRef<Group>(null)
  const armRf = useRef<Group>(null)
  const armLu = useRef<Group>(null)
  const armLf = useRef<Group>(null)

  // Vides à cette tâche : la Task 3 remplit `setPose`, la Task 6 `setRage`.
  // Elles existent déjà pour que l'interface ne change plus d'ici là.
  useImperativeHandle(ref, () => ({
    setPose: () => {},
    setRage: () => {},
  }))

  const pick: MatPicker = (key) =>
    key === 'fur'
      ? materials.body
      : key === 'furDark'
        ? materials.dark
        : key === 'mane'
          ? materials.accent
          : mats[key]

  return (
    <group ref={root}>
      {/* --- Le tronc quadrupède (maquette 1283-1317) --------------------- */}
      <group>
        <Part
          material={materials.body}
          position={[0, BODY_Y, -0.05]}
          rotation={[Math.PI / 2, 0, 0]}
          outline={OUTLINE}
        >
          <capsuleGeometry args={[BODY_R, 1.02, 5, 14]} />
        </Part>

        {/* Le ventre, plus clair et débordant par le bas : un tronc d'une seule
            teinte est un tube, et la ligne de ventre est ce qui fait un animal. */}
        <Part material={mats.furMid} position={[0, BODY_Y - 0.24, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.5, 0.84, 4, 10]} />
        </Part>

        {/* Poitrail et croupe. */}
        <Part material={materials.body} position={[0, BODY_Y + 0.04, 0.86]} scale={[1.04, 1.0, 0.82]} outline={OUTLINE}>
          <sphereGeometry args={[0.66, 14, 10]} />
        </Part>
        <Part material={materials.body} position={[0, BODY_Y + 0.02, -0.94]} scale={[1.08, 1.0, 0.86]} outline={OUTLINE}>
          <sphereGeometry args={[0.64, 14, 10]} />
        </Part>

        {/* Les rayures de la croupe, trois par flanc. Minces le long du corps et
            hautes en travers : une rayure de zèbre. L'inverse donne des taches
            de vache, et change l'animal qu'on regarde. */}
        {[-1, 1].flatMap((side) =>
          [-0.36, -0.68, -1.0].map((z) => (
            <Part
              key={`${side}:${z}`}
              material={materials.dark}
              position={[side * 0.5, BODY_Y + 0.16, z]}
              rotation={[0.15 * side, 0, 0]}
              scale={[0.62, 1.0, 0.11]}
            >
              <sphereGeometry args={[0.34, 10, 8]} />
            </Part>
          )),
        )}

        {/* --- Les jambes (maquette 1318-1378) ---------------------------- */}
        <Leg sign={-1} z={FORE_Z} hind={false} pick={pick} upperRef={legFRu} lowerRef={legFRl} />
        <Leg sign={1} z={FORE_Z} hind={false} pick={pick} upperRef={legFLu} lowerRef={legFLl} />
        <Leg sign={-1} z={HIND_Z} hind pick={pick} upperRef={legHRu} lowerRef={legHRl} />
        <Leg sign={1} z={HIND_Z} hind pick={pick} upperRef={legHLu} lowerRef={legHLl} />

        {/* --- La queue (maquette 1379-1403) ------------------------------ */}
        <group ref={tail} position={[0, BODY_Y + 0.38, -1.22]}>
          <Part geometry={TAIL} material={materials.body} />
          <Pieces pieces={TAIL_TUFT} pick={pick} />
        </group>

        {/* La crinière de l'échine (maquette 1800-1807), dernière fille du
            tronc comme dans la maquette. */}
        <Pieces pieces={SPINE_MANE} pick={pick} />
      </group>

      {/* --- Le buste (maquette 1404-1457) ------------------------------- */}
      <group ref={bust} position={BUST} rotation-x={BUST_LEAN}>
        <Part material={materials.body} position={[0, 0.3, 0]} outline={OUTLINE}>
          <capsuleGeometry args={[0.34, 0.24, 4, 12]} />
        </Part>
        {/* Le torse : deux têtes et demie, de la ceinture aux épaules. La hauteur
            totale n'a pas bougé quand on l'a réglé — ce qu'on a retiré au crâne,
            on l'a rendu au torse. */}
        <Part material={materials.body} position={[0, 0.82, 0]} scale={[1.25, 1, 0.78]} outline={OUTLINE}>
          <capsuleGeometry args={[0.42, 0.42, 5, 14]} />
        </Part>
        <Part material={mats.furMid} position={[0, 0.98, 0.26]} scale={[1.6, 0.74, 0.6]}>
          <sphereGeometry args={[0.28, 11, 8]} />
        </Part>

        {/* La ceinture : sans elle, le buste a l'air planté dans le dos ; avec
            elle, il a l'air sanglé dessus. */}
        <group>
          <Part material={mats.leather} position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.44, 0.47, 0.22, 14]} />
          </Part>
          <Part geometry={BELT_BUCKLE} material={mats.gold} position={[0, 0.06, 0.44]} />
          <Part material={mats.goldDim} position={[0, 0.06, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.3, 0.045, 3, 12]} />
          </Part>
          {/* Une seule sangle en diagonale : deux en croix font un X sombre, et
              à l'écran le torse devient la sangle. */}
          <Part geometry={BELT_STRAP} material={mats.leather} position={[0, 0.7, 0.36]} rotation={[0, 0, 0.55]} />
          {[0, 1, 2, 3].map((i) => (
            <Part
              key={i}
              geometry={BELT_STUD}
              material={mats.gold}
              position={[0.3 - i * 0.2, 1.0 - i * 0.28, 0.4]}
            />
          ))}
        </group>

        {/* --- Les bras (maquette 1482-1514), l'épée dans la main droite ---
            L'avant étant +Z, la main droite est côté -X. */}
        <Arm sign={-1} materials={materials} mats={mats} rootRef={armRu} foreRef={armRf}>
          <Sword mats={mats} />
        </Arm>
        <Arm sign={1} materials={materials} mats={mats} rootRef={armLu} foreRef={armLf} />

        {/* --- Les épaulières (maquette 1458-1481) ------------------------ */}
        <Pauldron sign={-1} mats={mats} />
        <Pauldron sign={1} mats={mats} />

        {/* --- Bouclier et arc, sur le dos (maquette 1580-1615) ----------- */}
        <group position={[0.2, 0.74, -0.36]} rotation={[0.28, -0.35, 0.2]}>
          <Part geometry={SHIELD_PLATE} material={mats.metal} rotation={[Math.PI / 2, 0, 0]} />
          <Part
            geometry={SHIELD_BOSS_PLATE}
            material={mats.steelDark}
            position={[0, 0, 0.01]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          <Part geometry={SHIELD_BOSS} material={mats.gold} position={[0, 0, 0.07]} />
          {SHIELD_SPIKES.map((spike, i) => (
            <Part key={i} geometry={SHIELD_SPIKE} material={mats.goldBright} {...spike} />
          ))}
        </group>
        <group position={[-0.26, 0.7, -0.4]} rotation={[0.2, 0.3, -0.7]}>
          <Part geometry={BOW} material={mats.hornDark} />
          <Part geometry={BOW_GRIP} material={mats.gold} position={[0, 0, -0.23]} />
          <Part material={mats.horn} position={[0, 0, 0.06]}>
            <cylinderGeometry args={[0.012, 0.012, 1.92, 5]} />
          </Part>
        </group>

        {/* --- La tête (maquette 1616-1694) ------------------------------- */}
        <group ref={head} position={[0, HEAD_Y, 0.06]}>
          {/* Le cou. */}
          <Part material={materials.body} position={[0, -0.36, -0.07]} rotation={[0.22, 0, 0]} outline={OUTLINE_THIN}>
            <capsuleGeometry args={[0.19, 0.34, 4, 10]} />
          </Part>
          <Part material={materials.body} scale={[1, 0.95, 1.14]} outline={OUTLINE}>
            <sphereGeometry args={[0.32, 14, 11]} />
          </Part>

          {/* Le masque : une bande et non une visière. Aplati à 0,38 et reculé
              derrière le museau, il ne fait qu'asseoir les yeux sur du sombre —
              plus grand, la tête devenait un casque et le Lynel un chevalier. */}
          <Part material={materials.dark} position={[0, 0.085, 0.1]} scale={[1.05, 0.4, 0.95]}>
            <sphereGeometry args={[0.29, 12, 10]} />
          </Part>

          {/* Le museau, court et large — un mufle de félin, pas un chanfrein de
              chèvre — et poussé à 0,55 pour dépasser du crâne de 0,185 : moins,
              la tête n'a pas de visage, elle a un front. */}
          <Part
            material={materials.body}
            position={[0, -0.075, 0.41]}
            rotation={[Math.PI / 2 + 0.1, 0, 0]}
            outline={OUTLINE_THIN}
          >
            <cylinderGeometry args={[0.175, 0.235, 0.28, 10]} />
          </Part>
          <Part material={mats.furMid} position={[0, -0.2, 0.36]} scale={[0.94, 0.56, 1.05]}>
            <sphereGeometry args={[0.21, 10, 8]} />
          </Part>
          <Part material={materials.dark} position={[0, -0.035, 0.545]} scale={[1.25, 0.8, 0.7]}>
            <sphereGeometry args={[0.1, 8, 6]} />
          </Part>
          {[-1, 1].map((s) => (
            <Part
              key={s}
              geometry={FANG}
              material={mats.horn}
              position={[s * 0.085, -0.215, 0.5]}
              rotation={[0.18, 0, Math.PI]}
            />
          ))}

          {/* Les yeux, à demi sortis du masque (z = 0,345 contre une surface à
              0,329) : plus en arrière, ils étaient dedans, donc invisibles sous
              tous les angles, et rien dans la scène ne le signalait. */}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.152, 0.082, 0.345]}>
              <Part material={mats.glow} scale={[1, 1.2, 0.9]}>
                <sphereGeometry args={[0.072, 10, 8]} />
              </Part>
              <Part material={mats.halo} position={[0, 0, -0.04]} scale={[1, 1.15, 0.6]}>
                <sphereGeometry args={[0.105, 10, 8]} />
              </Part>
            </group>
          ))}

          {/* Oreilles. */}
          {[-1, 1].map((s) => (
            <group key={s}>
              <Part
                geometry={EAR}
                material={materials.body}
                position={[s * 0.265, 0.13, -0.12]}
                rotation={[-0.5, 0, s * 1.15]}
              />
              <Part
                geometry={EAR_INNER}
                material={materials.dark}
                position={[s * 0.275, 0.14, -0.1]}
                rotation={[-0.5, 0, s * 1.15]}
              />
            </group>
          ))}

          {/* --- Les cornes (maquette 1695-1741) -------------------------- */}
          <Pieces pieces={HORNS} pick={pick} />

          {/* --- La collerette (maquette 1745-1789) ----------------------- */}
          <Pieces pieces={RUFF} pick={pick} />
        </group>

        {/* La crinière de la nuque (maquette 1791-1797). */}
        <Pieces pieces={NECK_MANE} pick={pick} />
      </group>
    </group>
  )
})
