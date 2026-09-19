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
  OctahedronGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import type { BufferGeometry } from 'three'
import { faceted } from '../environment/faceted'
import type { LynelMaterials } from './lynelMaterials'

/**
 * La géométrie du Lynel : cotes, pièces et tableaux, construits une fois au
 * chargement du module.
 *
 * À part de `LynelModel.tsx` pour que celui-ci ne garde que le rig et le JSX :
 * c'est là que les poses viendront s'écrire, et elles n'ont rien à faire au
 * milieu de trois cents lignes de cônes.
 */

/* --- Cotes ---------------------------------------------------------------- */
/* Recopiées de la maquette, lignes 1014-1064. Tout le squelette en descend. */

/** Axe du tronc quadrupède. */
export const BODY_Y = 1.52
/** Rayon du tronc. */
export const BODY_R = 0.62
/** Demi-écartement des jambes. */
export const HIP_X = 0.46
/** Antérieurs. */
export const FORE_Z = 0.86
/** Postérieurs. */
export const HIND_Z = -0.9
/** Naissance du buste, sur le garrot avant. */
export const BUST: [number, number, number] = [0, 1.9, 0.78]
/** Inclinaison du buste : 6° vers l'arrière. */
export const BUST_LEAN = -0.1
/** Épaules, dans le repère du buste. */
export const SHOULDER_Y = 1.15
/** Tête, dans le repère du buste. */
export const HEAD_Y = 1.58

/**
 * Épaisseur du contour, en unités monde — c'est le drapeau `screenspace` de
 * `<Outlines>` qui la rend telle (voir `Part` dans `LynelModel.tsx`).
 *
 * Le Lynel est aujourd'hui le seul modèle dont le contour se dessine
 * réellement : les `<Outlines>` de `models.tsx` et de `HeroPlaceholder.tsx`
 * n'ont pas ce drapeau, si bien que leur 0,03 se compte en pixels et ne se voit
 * pas. C'est un défaut antérieur, à traiter à part ; le comparer à ce 0,045-ci
 * n'aurait donc aucun sens tant qu'il n'est pas corrigé.
 */
export const OUTLINE = 0.045
export const OUTLINE_THIN = 0.022
export const OUTLINE_COLOR = '#20160f'

export type Vec3 = [number, number, number]

/* --- Pièces décrites par des données -------------------------------------- */

/**
 * La matière d'une pièce décrite en tableau, par son nom dans la maquette.
 *
 * Les tableaux mémoïsés (jambes, cornes, crinière) sont construits une fois au
 * chargement du module, avant qu'aucun jeu de matériaux n'existe : ils ne
 * peuvent donc porter qu'un nom, résolu au rendu. `fur`, `furDark` et `mane`
 * désignent les trois matériaux de `useEnemyMaterials` — ceux qui flashent.
 */
export type MatKey = 'fur' | 'furDark' | 'mane' | keyof LynelMaterials

export interface Piece {
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

export const UPPER_ROTATION = { fore: 0.02, hind: 0.46 }
export const LOWER_ROTATION = { fore: -0.02, hind: -0.48 }
export const LOWER_Y = -0.66

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

export const LEGS = {
  fore: { ...legPieces(false), hipY: measureHipY(false) },
  hind: { ...legPieces(true), hipY: measureHipY(true) },
}

/* --- La queue (maquette 1379-1403) --- */

export const TAIL = new TubeGeometry(
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
export const TAIL_TUFT: Piece[] = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2
  return {
    geometry: TAIL_TUFT_GEOMETRY,
    material: i % 2 ? 'mane' : 'maneCool',
    position: [-0.02 + Math.cos(a) * 0.09, -0.8 + Math.sin(a) * 0.07, -1.3],
    rotation: [2.3, 0, a - Math.PI / 2],
  }
})

/* --- Buste, ceinture, harnais (maquette 1404-1457) --- */

export const BELT_BUCKLE = faceted(new BoxGeometry(0.24, 0.21, 0.1))
export const BELT_STRAP = faceted(new BoxGeometry(0.11, 1.05, 0.07))
export const BELT_STUD = faceted(new SphereGeometry(0.042, 6, 5))

/* --- Épaulières (maquette 1458-1481) --- */

export const PAULDRON_SPIKE = faceted(new ConeGeometry(0.06, 0.26, 5))

/* --- Épée (maquette 1515-1579) --- */

/*
  Le profil de la lame est un `Shape` extrudé : ce qui fait l'épée du Lynel,
  c'est le dos en dents de scie, et quatre dents taillées dans un contour 2D
  coûtent douze points là où des boîtes orientées à la main ne suivraient
  aucune correction de la silhouette.
*/
export const BLADE = (() => {
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
export const SWORD_FULLER = faceted(new BoxGeometry(0.075, 1.75, 0.09))
export const SWORD_VEIN = faceted(new BoxGeometry(0.035, 1.55, 0.1))
export const SWORD_GUARD = faceted(new BoxGeometry(0.52, 0.11, 0.17))
export const SWORD_QUILLON = faceted(new ConeGeometry(0.055, 0.22, 5))
export const SWORD_POMMEL = faceted(new OctahedronGeometry(0.1, 0))

/* --- Bouclier et arc (maquette 1580-1615) --- */

export const SHIELD_PLATE = faceted(new CylinderGeometry(0.5, 0.5, 0.1, 7))
export const SHIELD_BOSS_PLATE = faceted(new CylinderGeometry(0.32, 0.32, 0.12, 7))
export const SHIELD_BOSS = faceted(new OctahedronGeometry(0.14, 0))
export const SHIELD_SPIKE = faceted(new ConeGeometry(0.06, 0.24, 5))
export const SHIELD_SPIKES: { position: Vec3; rotation: Vec3 }[] = Array.from({ length: 7 }, (_, i) => {
  const a = (i / 7) * Math.PI * 2 + 0.4
  return {
    position: [Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0],
    rotation: [Math.PI / 2, 0, -a + Math.PI / 2],
  }
})

export const BOW = new TubeGeometry(
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
export const BOW_GRIP = faceted(new BoxGeometry(0.09, 0.3, 0.09))

/* --- Tête (maquette 1616-1694) --- */

export const FANG = faceted(new ConeGeometry(0.038, 0.16, 5))
export const EAR = faceted(new ConeGeometry(0.085, 0.22, 6))
export const EAR_INNER = faceted(new ConeGeometry(0.052, 0.14, 5))

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

export const HORNS = [...hornPieces(-1), ...hornPieces(1)]

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
  même anneau derrière le crâne et s'écartent en corolle, inclinée de 0,78 rad
  vers l'arrière pour dégager la face.

  Le rayon de l'anneau — 0,345 pour un crâne de 0,32 — ne se négocie pas : en
  dessous, les mèches naissent sous la surface et n'en sortent jamais. Et des
  mèches de 0,175 de rayon se touchent et font masse, le seul état dans lequel
  une crinière se lit à la distance du combat.
*/
export const RUFF: Piece[] = Array.from({ length: 14 }, (_, i) => {
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
export const NECK_MANE: Piece[] = Array.from({ length: 7 }, (_, i) => {
  const t = i / 6
  return shard([0, 1.3 - t * 1.04, -0.26 - t * 0.14], [-2.5 + t * 0.3, 0, 0], 0.62 - t * 0.18, 0.105, i)
})

// Et enfin sur l'échine du quadrupède, jusqu'à la croupe.
export const SPINE_MANE: Piece[] = Array.from({ length: 5 }, (_, i) => {
  const t = i / 4
  return shard(
    [0, BODY_Y + 0.58 - t * 0.06, 0.32 - t * 1.16],
    [-2.7, 0, 0],
    0.54 - t * 0.18,
    0.115,
    i,
  )
})
