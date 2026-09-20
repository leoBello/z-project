import {
  BoxGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import type { BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { faceted } from '../environment/faceted'
import type { MaleniaMaterials } from './maleniaMaterials'
import { OUTLINE, OUTLINE_THIN } from './maleniaMaterials'

/**
 * La géométrie de Malenia : cotes, pièces et tableaux, construits une fois au
 * chargement du module.
 *
 * À part de `MaleniaModel.tsx` pour que celui-ci ne garde que le rig et le JSX —
 * même découpage que le Lynel, qui a fait ses preuves : c'est là que les poses
 * viendront s'écrire, et elles n'ont rien à faire au milieu de trois cents
 * lignes de capsules.
 *
 * **Les cotes sont celles de la maquette, au chiffre près**, et elles y ont été
 * validées. Ce fichier ne les réinvente pas : il les recopie et applique un
 * facteur d'échelle unique (voir `MODEL_SCALE`). C'est la seule façon de
 * garantir que ce qui a été validé est ce qui est joué.
 */

/* --- Cotes ---------------------------------------------------------------- */
/* Recopiées de docs/maquettes/2026-09-20-malenia.html. */

/** Hauteur des hanches. */
export const HIP_Y = 1.18
/** Genou. */
export const KNEE_Y = 0.66
/** Cheville. */
export const ANKLE_Y = 0.13
/** Centre de la cage thoracique. */
export const CHEST_Y = 1.62
/** Axe des épaules. */
export const SHOULDER_Y = 1.82
/** Demi-écartement des épaules. */
export const SHOULDER_X = 0.245
/** Demi-écartement des hanches. */
export const HIP_X = 0.115
export const NECK_Y = 1.93
/** Centre de la tête. */
export const HEAD_Y = 2.09
export const UPPER_ARM = 0.32
export const FOREARM = 0.30
/** La Main de Malenia, lame seule. Le katana du joueur fait 0,82. */
export const BLADE_L = 1.45
/** Demi-envergure des ailes, phase II. */
export const WING_SPAN = 2.8
/** Hauteur de vol, phase II. */
export const HOVER = 0.55

/**
 * Hauteur du modèle tel que les cotes ci-dessus le construisent.
 *
 * **Mesurée sur le modèle, pas choisie** : c'est ce qu'affichait le tableau de
 * la maquette, sommet des ailes du heaume compris. Si la géométrie change, ce
 * nombre doit être remesuré — sans quoi `MODEL_SCALE` ment, et elle ne fera plus
 * la taille annoncée.
 */
const BUILT_HEIGHT = 2.37

/**
 * Hauteur voulue dans le jeu.
 *
 * C'était la question 02 de la maquette, et la seule dont la réponse change ce
 * qu'on voit. À 2,37 — la taille fidèle au personnage — elle occupait une
 * fraction de l'image bien plus faible que le Lynel, qui en prenait un quart
 * dans la caméra d'arène. Un boss humanoïde *est* petit, et aucune qualité de
 * modèle ne rattrape ça.
 *
 * Trois sorties possibles : la grandir, rapprocher encore la caméra pour cette
 * arène-là, ou accepter. C'est la première qui a été retenue — elle ne coûte
 * rien au reste du jeu, là où un quatrième réglage de `CAMERA` aurait dégradé la
 * lecture des distances au sol, qui est ce dont ce combat a le plus besoin.
 *
 * Trois unités, soit 1,9 fois le héros : elle reste franchement humanoïde. Le
 * Lynel doré, à 4,3, garde son avantage de masse — ce qui est juste, puisqu'elle
 * ne gagne pas par là.
 */
export const MALENIA_HEIGHT = 3

/**
 * Le facteur appliqué au groupe racine.
 *
 * **Dérivé, jamais écrit à la main.** Recopier 1,266 aurait été une quatrième
 * occasion de se tromper, et surtout un nombre que plus personne n'aurait su
 * rattacher aux deux hauteurs dont il sort.
 */
export const MODEL_SCALE = MALENIA_HEIGHT / BUILT_HEIGHT

/**
 * Son côté droit, en −X.
 *
 * Elle regarde +Z, donc le joueur qui lui fait face voit son bras d'or à sa
 * propre gauche. Nommé plutôt que recopié, parce que ce signe se glisse dans une
 * trentaine de positions et qu'une erreur de signe donne une gauchère armée
 * d'une prothèse de droite.
 */
export const RIGHT = -1
export const LEFT = 1

export type Vec3 = [number, number, number]

/** La matière d'une pièce, par son nom dans le jeu de matériaux. */
export type MatKey = keyof MaleniaMaterials

export interface Piece {
  geometry: BufferGeometry
  material: MatKey
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  outline?: number
}

/*
  Les géométries vivent au niveau du module, comme celles du Lynel : passées en
  prop, R3F ne les libère pas au démontage, et le Marais se monte et se démonte
  à chaque franchissement du portail. Créées une fois, elles ne coûtent qu'une
  fois.
*/

/* --- Un utilitaire : la mèche effilée -------------------------------------- */

/**
 * Un tube le long d'une courbe, **effilé** vers la pointe.
 *
 * `TubeGeometry` a un rayon constant, et un cheveu de rayon constant est une
 * corde. Le fuselage se fait donc après coup, en rapprochant chaque anneau de
 * son centre : `getPointAt` redonne exactement le point que `TubeGeometry` a
 * utilisé pour construire l'anneau — même paramétrage par longueur d'arc — donc
 * le centre est le bon, et non une approximation qui tordrait la mèche.
 *
 * Sert aux cheveux et aux nervures des ailes, qui sont les mêmes cheveux.
 */
export function strandGeometry(
  curve: CatmullRomCurve3,
  radius: number,
  taper: number,
  tubular = 14,
  radial = 6,
) {
  const geometry = new TubeGeometry(curve, tubular, radius, radial, false)
  const position = geometry.attributes.position
  const ring = radial + 1
  const center = new Vector3()
  for (let j = 0; j <= tubular; j++) {
    curve.getPointAt(j / tubular, center)
    const k = 1 - taper * (j / tubular)
    for (let r = 0; r < ring; r++) {
      const index = j * ring + r
      position.setXYZ(
        index,
        center.x + (position.getX(index) - center.x) * k,
        center.y + (position.getY(index) - center.y) * k,
        center.z + (position.getZ(index) - center.z) * k,
      )
    }
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/* --- Les jambes ------------------------------------------------------------ */

const THIGH_LEN = HIP_Y - KNEE_Y
const SHIN_LEN = KNEE_Y - ANKLE_Y

const LEG_GEOMETRY = {
  thighFull: new CapsuleGeometry(0.098, THIGH_LEN * 0.72, 4, 10),
  thighStump: new CapsuleGeometry(0.098, THIGH_LEN * 0.42, 4, 10),
  socket: new CylinderGeometry(0.105, 0.088, 0.14, 10),
  goldThigh: new CylinderGeometry(0.082, 0.07, THIGH_LEN * 0.34, 8),
  pivot: new TorusGeometry(0.068, 0.026, 8, 14),
  strut: new CylinderGeometry(0.021, 0.026, SHIN_LEN * 0.88, 6),
  cuff: new CylinderGeometry(0.034, 0.028, 0.07, 8),
  knee: new SphereGeometry(0.072, 9, 7),
  shin: new CapsuleGeometry(0.072, SHIN_LEN * 0.6, 4, 9),
  greave: new CylinderGeometry(0.082, 0.062, SHIN_LEN * 0.55, 8),
  foot: faceted(new BoxGeometry(0.115, 0.075, 0.27)),
  toe: new ConeGeometry(0.052, 0.12, 6),
}

/**
 * Le haut d'une jambe : cuisse, ou moignon et emboîture.
 *
 * Elles ne sont pas la même jambe, et c'est le premier trait du personnage qu'on
 * voit avant même le heaume : il lui manque un bras, une jambe et un pied. C'est
 * aussi ce qui explique sa démarche — elle ne marche pas dans ce jeu, elle glisse
 * et elle bondit.
 *
 * La prothèse est à claire-voie : deux montants d'or et un pivot visible au
 * genou, sans mollet. C'est ce **vide** qui la fait lire comme une pièce
 * mécanique à quatorze unités de recul, et non comme une botte dorée.
 */
export function thighPieces(prosthetic: boolean): Piece[] {
  if (!prosthetic) {
    return [
      {
        geometry: LEG_GEOMETRY.thighFull,
        material: 'skin',
        position: [0, -THIGH_LEN * 0.5, 0],
        outline: OUTLINE,
      },
    ]
  }
  return [
    // L'amputation est au-dessus du genou et non à la hanche : le raccord doit
    // se voir, sinon la prothèse n'est qu'une jambe d'une autre couleur.
    {
      geometry: LEG_GEOMETRY.thighStump,
      material: 'skin',
      position: [0, -THIGH_LEN * 0.26, 0],
      outline: OUTLINE,
    },
    {
      geometry: LEG_GEOMETRY.socket,
      material: 'leather',
      position: [0, -THIGH_LEN * 0.58, 0],
      outline: OUTLINE,
    },
    {
      geometry: LEG_GEOMETRY.goldThigh,
      material: 'gold',
      position: [0, -THIGH_LEN * 0.82, 0],
      outline: OUTLINE,
    },
  ]
}

/** Le bas d'une jambe, sous le genou. */
export function shinPieces(prosthetic: boolean): Piece[] {
  if (prosthetic) {
    return [
      // Le pivot à nu : un tore, et c'est lui qui dit « mécanique ».
      {
        geometry: LEG_GEOMETRY.pivot,
        material: 'goldBright',
        rotation: [0, Math.PI / 2, 0],
        outline: OUTLINE_THIN,
      },
      ...[-1, 1].map<Piece>((s) => ({
        geometry: LEG_GEOMETRY.strut,
        material: 'gold',
        position: [0, -SHIN_LEN * 0.46, s * 0.045],
        outline: OUTLINE_THIN,
      })),
      {
        geometry: LEG_GEOMETRY.cuff,
        material: 'goldDim',
        position: [0, -SHIN_LEN * 0.9, 0],
        outline: OUTLINE_THIN,
      },
    ]
  }
  return [
    { geometry: LEG_GEOMETRY.knee, material: 'skin', outline: OUTLINE },
    {
      geometry: LEG_GEOMETRY.shin,
      material: 'skin',
      position: [0, -SHIN_LEN * 0.48, 0],
      outline: OUTLINE,
    },
    // La grève d'or sur le tibia de chair : elle est en armure, après tout.
    {
      geometry: LEG_GEOMETRY.greave,
      material: 'gold',
      position: [0, -SHIN_LEN * 0.42, 0.006],
      scale: [1, 1, 0.78],
      outline: OUTLINE,
    },
  ]
}

/**
 * Le pied. Toujours d'or, mais pour deux raisons différentes.
 *
 * Le gauche appartient à la prothèse de jambe ; le droit est une prothèse à lui
 * seul. Le seul pied de chair du personnage n'existe pas, et c'est exact.
 */
export const FOOT_PIECES: Piece[] = [
  {
    geometry: LEG_GEOMETRY.foot,
    material: 'gold',
    position: [0, 0.038, 0.055],
    outline: OUTLINE,
  },
  {
    geometry: LEG_GEOMETRY.toe,
    material: 'goldBright',
    position: [0, 0.03, 0.2],
    rotation: [Math.PI / 2, 0, 0],
    outline: OUTLINE_THIN,
  },
]

/* --- Le bassin, les tassettes, le pan -------------------------------------- */

export const PELVIS_PIECES: Piece[] = [
  {
    geometry: new CapsuleGeometry(0.155, 0.14, 4, 10),
    material: 'bronze',
    position: [0, 0.02, 0],
    rotation: [Math.PI / 2, 0, 0],
    scale: [1, 1, 0.82],
    outline: OUTLINE,
  },
  {
    geometry: new CylinderGeometry(0.162, 0.148, 0.1, 12),
    material: 'gold',
    position: [0, 0.09, 0],
    outline: OUTLINE,
  },
]

/**
 * Les tassettes : six lames d'or autour des hanches.
 *
 * Elles appartiennent à l'armure — elles tombent à la métamorphose. Ce sont
 * elles, avec les spallières, qui font la différence de silhouette entre les
 * deux phases : sans elles, la taille paraît d'un coup deux fois plus fine.
 */
const FAULD = faceted(new BoxGeometry(0.13, 0.2, 0.05))
export const FAULD_PIECES: Piece[] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6
  return {
    geometry: FAULD,
    material: 'gold',
    position: [Math.sin(a) * 0.155, -0.08, Math.cos(a) * 0.13],
    rotation: [0.12, a, 0],
    outline: OUTLINE_THIN,
  }
})

/**
 * Le pan écarlate — le seul rouge de la phase I avec les cheveux.
 *
 * Il est là pour une raison de lecture, pas d'ornement : sur un modèle d'or, à
 * quatorze unités de recul, le tissu est la seule chose qui dise la **vitesse**.
 * Une esquive sans tissu se lit comme une téléportation.
 */
export const SASH_PIECES: Piece[] = Array.from({ length: 5 }, (_, i) => {
  const x = (i - 2) * 0.072
  const len = 0.62 + Math.cos(i - 2) * 0.16
  return {
    geometry: faceted(new BoxGeometry(0.082, len, 0.022)),
    material: i % 2 ? 'cloth' : 'clothDark',
    position: [x, -len / 2 - 0.06, -0.13],
    rotation: [0.06, 0, (i - 2) * 0.05],
  }
})

/* --- Le torse -------------------------------------------------------------- */

export const TORSO_PIECES: Piece[] = [
  // La taille, puis la cage — aplatie en Z. Un torse de révolution est un tube ;
  // c'est l'écrasement avant-arrière qui fait une cage thoracique.
  {
    geometry: new CapsuleGeometry(0.135, 0.16, 4, 10),
    material: 'skin',
    position: [0, 0.16, 0],
    scale: [1, 1, 0.8],
    outline: OUTLINE,
  },
  {
    geometry: new CapsuleGeometry(0.2, 0.2, 5, 12),
    material: 'skin',
    position: [0, CHEST_Y - HIP_Y - 0.02, 0],
    rotation: [Math.PI / 2, 0, 0],
    scale: [1, 1, 0.74],
    outline: OUTLINE,
  },
  {
    geometry: new SphereGeometry(0.2, 12, 9),
    material: 'skin',
    position: [0, SHOULDER_Y - HIP_Y - 0.09, 0],
    scale: [1.12, 0.86, 0.78],
    outline: OUTLINE,
  },
  // La ceinture de cuir, sous le plastron : elle reste, elle n'est pas de
  // l'armure — c'est ce qui tient le pan de tissu, qui ne tombe pas non plus.
  {
    geometry: new CylinderGeometry(0.15, 0.152, 0.07, 12),
    material: 'leather',
    position: [0, 0.06, 0],
    scale: [1, 1, 0.84],
    outline: OUTLINE,
  },
]

/**
 * Les veines de pourriture, éteintes en phase I.
 *
 * Des sphères très aplaties, non éclairées, posées sur la peau — la même
 * technique que la gouttière du Lynel. Elles partent du flanc droit, **là où la
 * prothèse s'ancre**, et remontent vers le cou : la pourriture vient de la
 * blessure, pas de partout à la fois. C'est le genre de détail que personne ne
 * formule et que tout le monde lit.
 */
const VEIN = new SphereGeometry(0.055, 7, 6)
const VEIN_PATH: Vec3[] = [
  [RIGHT * 0.16, 0.30, 0.10],
  [RIGHT * 0.13, 0.42, 0.14],
  [RIGHT * 0.08, 0.52, 0.15],
  [RIGHT * 0.03, 0.60, 0.15],
  [RIGHT * 0.09, 0.62, 0.12],
  [LEFT * 0.06, 0.66, 0.14],
  [RIGHT * 0.19, 0.20, 0.04],
  [LEFT * 0.14, 0.34, 0.12],
  [LEFT * 0.10, 0.48, 0.14],
]
export const VEIN_PIECES: Piece[] = VEIN_PATH.map(([x, y, z]) => ({
  geometry: VEIN,
  material: 'vein',
  position: [x, y, z],
  rotation: [0, 0, x * 2],
  scale: [0.34, 1.35, 0.3],
}))

/**
 * La cuirasse : plastron d'or, collier, crête sternale.
 *
 * Elle est **sur** le torse et non à sa place — c'est ce qui permet de l'éteindre
 * d'un coup à la métamorphose sans laisser un trou dans le corps. La règle vaut
 * pour toute l'armure du modèle, et c'est elle qui rend la chute d'armure
 * possible sans second modèle.
 */
export const CUIRASS_PIECES: Piece[] = [
  {
    geometry: new SphereGeometry(0.225, 14, 10),
    material: 'gold',
    position: [0, CHEST_Y - HIP_Y - 0.04, 0.012],
    scale: [1.06, 1.18, 0.84],
    outline: OUTLINE,
  },
  {
    geometry: new CylinderGeometry(0.135, 0.165, 0.1, 12),
    material: 'goldBright',
    position: [0, NECK_Y - HIP_Y - 0.13, 0],
    scale: [1, 1, 0.86],
    outline: OUTLINE_THIN,
  },
  {
    geometry: faceted(new BoxGeometry(0.05, 0.42, 0.05)),
    material: 'goldBright',
    position: [0, CHEST_Y - HIP_Y - 0.06, 0.185],
    rotation: [0.06, 0, 0],
  },
]

/* --- Les bras -------------------------------------------------------------- */

const ARM_GEOMETRY = {
  socket: new SphereGeometry(0.115, 11, 9),
  goldUpper: new CylinderGeometry(0.075, 0.062, UPPER_ARM * 0.44, 8),
  goldRing: new TorusGeometry(0.052, 0.018, 7, 12),
  goldUpperLow: new CylinderGeometry(0.058, 0.052, UPPER_ARM * 0.34, 8),
  shoulder: new SphereGeometry(0.105, 10, 8),
  upper: new CapsuleGeometry(0.068, UPPER_ARM * 0.66, 4, 9),
  elbowGold: new SphereGeometry(0.062, 9, 7),
  goldFore: new CylinderGeometry(0.05, 0.044, FOREARM * 0.86, 8),
  vane: faceted(new BoxGeometry(0.022, FOREARM * 0.8, 0.09)),
  fore: new CapsuleGeometry(0.056, FOREARM * 0.64, 4, 9),
  vambrace: new CylinderGeometry(0.07, 0.058, FOREARM * 0.5, 8),
  palm: faceted(new BoxGeometry(0.075, 0.13, 0.055)),
  fingers: faceted(new BoxGeometry(0.07, 0.085, 0.048)),
  pauldron: faceted(new SphereGeometry(0.155, 10, 7)),
}

/**
 * Le haut d'un bras.
 *
 * Deux bras qui n'ont rien en commun. Le droit est une prothèse entière :
 * segmenté, articulations à nu, une carène à l'avant-bras. **C'est lui qui tient
 * la lame, donc c'est lui que le joueur doit apprendre à regarder** — dans ce
 * jeu la parade se lit sur l'arme, et l'arme ne bouge jamais sans lui. Le rendre
 * franchement mécanique n'est pas un caprice de fidélité : c'est le télégraphe.
 *
 * Le gauche est de chair, en manche sombre. Il ne sert qu'à une chose — la
 * saisie — et il doit donc être *calme* : tout ce qu'il fait compte.
 */
export function upperArmPieces(prosthetic: boolean): Piece[] {
  if (!prosthetic) {
    return [
      { geometry: ARM_GEOMETRY.shoulder, material: 'bronze', outline: OUTLINE },
      {
        geometry: ARM_GEOMETRY.upper,
        material: 'bronze',
        position: [0, -UPPER_ARM * 0.5, 0],
        outline: OUTLINE,
      },
    ]
  }
  return [
    // L'emboîture d'épaule : la prothèse ne commence pas au bras mais à la
    // clavicule, et ce raccord d'or sur la peau est le premier signe.
    { geometry: ARM_GEOMETRY.socket, material: 'goldDim', outline: OUTLINE },
    {
      geometry: ARM_GEOMETRY.goldUpper,
      material: 'gold',
      position: [0, -UPPER_ARM * 0.28, 0],
      outline: OUTLINE,
    },
    {
      geometry: ARM_GEOMETRY.goldRing,
      material: 'goldBright',
      position: [0, -UPPER_ARM * 0.58, 0],
      rotation: [Math.PI / 2, 0, 0],
      outline: OUTLINE_THIN,
    },
    {
      geometry: ARM_GEOMETRY.goldUpperLow,
      material: 'gold',
      position: [0, -UPPER_ARM * 0.8, 0],
      outline: OUTLINE,
    },
  ]
}

/** La spallière : deux lames superposées, plus grande du côté de la lame. */
export function pauldronPieces(side: number, prosthetic: boolean): Piece[] {
  const width = prosthetic ? 1.18 : 1.0
  return [0, 1].map<Piece>((i) => ({
    geometry: ARM_GEOMETRY.pauldron,
    material: i ? 'goldDim' : 'gold',
    position: [side * 0.02, 0.03 - i * 0.085, 0],
    rotation: [0, 0, side * -0.18],
    scale: [width * (1 - i * 0.12), 0.58 - i * 0.06, 1 - i * 0.1],
    outline: OUTLINE_THIN,
  }))
}

/** L'avant-bras. */
export function forearmPieces(prosthetic: boolean): Piece[] {
  if (prosthetic) {
    return [
      { geometry: ARM_GEOMETRY.elbowGold, material: 'goldBright', outline: OUTLINE_THIN },
      {
        geometry: ARM_GEOMETRY.goldFore,
        material: 'gold',
        position: [0, -FOREARM * 0.45, 0],
        outline: OUTLINE,
      },
      // La carène : la lame d'avant-bras, purement silhouette. C'est ce qui rend
      // le bras reconnaissable **de dos**, quand la lame est masquée par le corps.
      {
        geometry: ARM_GEOMETRY.vane,
        material: 'goldBright',
        position: [0, -FOREARM * 0.46, -0.058],
        rotation: [0.1, 0, 0],
        outline: OUTLINE_THIN,
      },
    ]
  }
  return [
    {
      geometry: ARM_GEOMETRY.fore,
      material: 'bronze',
      position: [0, -FOREARM * 0.46, 0],
      outline: OUTLINE,
    },
  ]
}

/** Le brassard du bras de chair. Il tombe avec le reste de l'armure. */
export const VAMBRACE_PIECES: Piece[] = [
  {
    geometry: ARM_GEOMETRY.vambrace,
    material: 'gold',
    position: [0, -FOREARM * 0.3, 0],
    outline: OUTLINE_THIN,
  },
]

/**
 * La main.
 *
 * Les doigts sont en bloc : à cette échelle, cinq cylindres ne se distinguent
 * pas d'un seul — et ils coûtent cinq fois plus cher.
 */
export function handPieces(prosthetic: boolean): Piece[] {
  return [
    {
      geometry: ARM_GEOMETRY.palm,
      material: prosthetic ? 'goldDim' : 'skin',
      position: [0, -0.055, 0],
      outline: OUTLINE,
    },
    {
      geometry: ARM_GEOMETRY.fingers,
      material: prosthetic ? 'gold' : 'skinShade',
      position: [0, -0.14, 0.012],
      rotation: [0.35, 0, 0],
      outline: OUTLINE,
    },
  ]
}

/* --- La tête, le heaume, les cheveux --------------------------------------- */

export const NECK_PIECES: Piece[] = [
  {
    geometry: new CylinderGeometry(0.058, 0.07, 0.1, 9),
    material: 'skin',
    position: [0, 0.03, 0],
    outline: OUTLINE_THIN,
  },
]

const EYELID = faceted(new BoxGeometry(0.042, 0.011, 0.02))
const EYE_ROT = new SphereGeometry(0.03, 7, 6)

export const HEAD_PIECES: Piece[] = [
  // Le crâne, légèrement allongé : une sphère parfaite donne un visage d'enfant.
  {
    geometry: new SphereGeometry(0.132, 14, 11),
    material: 'skin',
    scale: [0.92, 1.06, 1],
    outline: OUTLINE,
  },
  // La mâchoire — la seule chair visible sous le heaume.
  {
    geometry: faceted(new SphereGeometry(0.105, 10, 8)),
    material: 'skin',
    position: [0, -0.045, 0.04],
    scale: [0.86, 0.8, 1.0],
    outline: OUTLINE,
  },
  /*
    Les yeux clos.

    Deux paupières sombres et **pas une lueur**. C'est le seul boss du jeu dont
    les yeux ne brillent pas, et c'est délibéré : le Lynel annonce ses attaques
    par le regard, elle est aveugle, elle ne regarde rien. Le joueur ne trouvera
    jamais sur son visage l'information qu'il a appris à y chercher, et devra
    aller la prendre sur la lame.
  */
  ...[-1, 1].map<Piece>((s) => ({
    geometry: EYELID,
    material: 'skinShade',
    position: [s * 0.055, 0.008, 0.118],
    rotation: [0, 0, s * 0.08],
  })),
  // La calotte de cheveux, d'où partent les mèches. Sous le heaume en phase I,
  // à nu en phase II — elle ne bouge pas plus que les mèches.
  {
    geometry: faceted(new SphereGeometry(0.129, 11, 9)),
    material: 'hair',
    position: [0, -0.008, -0.048],
    scale: [0.97, 0.94, 0.92],
    outline: OUTLINE,
  },
]

/** La pourriture au coin des yeux. Éteinte en phase I, allumée en phase II. */
export const EYE_ROT_PIECES: Piece[] = [-1, 1].map((s) => ({
  geometry: EYE_ROT,
  material: 'vein',
  position: [s * 0.082, -0.005, 0.1],
  rotation: [0, 0, s * 0.5],
  scale: [0.9, 0.5, 0.5],
}))

/**
 * Le heaume ailé, d'or pur.
 *
 * La calotte couvre le crâne du front à la nuque ; les ailes partent des tempes
 * et balaient vers l'arrière et vers le haut. Quatre lames par aile, de plus en
 * plus courtes — c'est cet étagement, pas la taille, qui les fait lire comme des
 * plumes plutôt que comme des cornes.
 *
 * **L'envergure dépasse celle des épaules**, et c'est une cote qu'il a fallu
 * corriger : le premier jet inclinait les ailes de 0,3 rad et donnait 0,41,
 * c'est-à-dire plus étroit que les épaules (0,70) — l'inverse exact de ce que le
 * heaume est censé faire. À 0,95 rad pour une lame maîtresse de 0,38, on est à
 * 0,78. C'est le détail par lequel on la reconnaît de dos.
 */
export const HELM_PIECES: Piece[] = [
  {
    geometry: new SphereGeometry(0.146, 14, 11),
    material: 'gold',
    position: [0, 0.028, -0.008],
    scale: [0.98, 1.04, 1.02],
    outline: OUTLINE,
  },
  // La visière descend sur le front et s'arrête au-dessus des yeux. Elle ne les
  // couvre pas — c'est ce qui laisse voir qu'ils sont clos.
  {
    geometry: faceted(new BoxGeometry(0.055, 0.115, 0.075)),
    material: 'goldBright',
    position: [0, 0.057, 0.108],
    rotation: [0.28, 0, 0],
    outline: OUTLINE_THIN,
  },
  {
    geometry: new TorusGeometry(0.128, 0.017, 7, 16, Math.PI),
    material: 'goldDim',
    position: [0, 0.054, 0.012],
    rotation: [1.45, 0, 0],
  },
  ...[-1, 1].flatMap((s) =>
    Array.from({ length: 4 }, (_, i): Piece => {
      const len = 0.38 - i * 0.06
      return {
        geometry: faceted(new BoxGeometry(0.03, len, 0.016)),
        material: i % 2 ? 'goldDim' : 'goldBright',
        // Composée à la main plutôt qu'imbriquée dans un groupe : la racine de
        // l'aile est à (±0,1 ; 0,03) et tourne de (−0,32·s ; −0,95·s), et chaque
        // lame s'y ajoute son propre étagement. Un groupe par aile aurait été
        // deux objets de plus dans la scène pour huit boîtes immobiles.
        position: [s * 0.1, 0.042, -0.01],
        rotation: [-i * 0.13, s * -0.32, s * (-0.95 + i * 0.07)],
        outline: OUTLINE_THIN,
      }
    }),
  ),
]

/**
 * Les cheveux — **lâchés, et dans les deux phases.**
 *
 * Neuf mèches libres qui sortent de la nuque, s'écartent vers l'arrière et
 * retombent. Pas de tresse : elle n'en porte pas, ni casquée ni découverte.
 *
 * Ce n'est pas un détail d'exactitude. La chevelure libre est ce qui **relie**
 * les deux phases : le heaume tombe, l'armure tombe, mais les cheveux ne
 * changent pas — et comme les ailes sont des papillons cousus par ces
 * cheveux-là, la phase II ne sort pas de nulle part. Elle était déjà sur sa
 * nuque pendant tout le premier combat.
 *
 * Les mèches du milieu sont les plus longues et les plus épaisses ; celles des
 * bords s'écartent et s'écourtent. Une chevelure de mèches égales fait une
 * perruque — c'est l'inégalité qui fait la masse.
 */
export const HAIR_PIECES: Piece[] = Array.from({ length: 9 }, (_, i): Piece => {
  const t = i / 8 - 0.5
  const len = 0.96 - Math.abs(t) * 0.46
  const out = t * 0.36
  const curve = new CatmullRomCurve3([
    new Vector3(t * 0.12, 0, -0.01),
    new Vector3(t * 0.21, -len * 0.3, -0.075 - Math.abs(t) * 0.03),
    new Vector3(out, -len * 0.67, -0.055),
    new Vector3(out * 1.3, -len, 0.03 + t * 0.04),
  ])
  return {
    geometry: strandGeometry(curve, 0.05 - Math.abs(t) * 0.022, 0.72),
    material: i % 2 ? 'hair' : 'hairDark',
    outline: OUTLINE_THIN,
  }
})

/* --- La Main de Malenia ---------------------------------------------------- */

/**
 * La silhouette de la lame.
 *
 * La courbure (le *sori*) est **construite** plutôt que dessinée : la ligne de
 * dos s'écarte en t², la tranche suit à distance constante, et la largeur
 * s'annule sur les derniers centimètres. Une lame droite avec un bout pointu
 * n'est pas un katana, c'est une épée — et la silhouette est tout ce qu'on en
 * verra à quatorze unités.
 */
export function bladeShape(length: number, width: number) {
  const shape = new Shape()
  const N = 20
  const bend = (t: number) => -0.085 * t * t
  const halfWidth = (t: number) => width * Math.min(1, (1 - t) / 0.085)
  shape.moveTo(bend(0), 0)
  for (let i = 1; i <= N; i++) {
    const t = i / N
    shape.lineTo(bend(t), t * length)
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N
    shape.lineTo(bend(t) + halfWidth(t), t * length)
  }
  shape.lineTo(bend(0), 0)
  return shape
}

const SWORD_GEOMETRY = {
  blade: new ExtrudeGeometry(bladeShape(BLADE_L, 0.058), {
    depth: 0.016,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.003,
    bevelSegments: 1,
  }),
  // La ligne de trempe (*hamon*) : une seconde lame plus étroite, posée sur la
  // tranche et décalée d'un demi-millimètre vers l'avant. Une géométrie de plus,
  // et c'est ce qui empêche la lame de lire comme une planche grise.
  hamon: new ExtrudeGeometry(bladeShape(BLADE_L * 0.97, 0.021), {
    depth: 0.004,
    bevelEnabled: false,
  }),
  guard: new CylinderGeometry(0.076, 0.076, 0.016, 12),
  grip: new CylinderGeometry(0.031, 0.034, 0.27, 9),
  wrap: faceted(new BoxGeometry(0.072, 0.022, 0.072)),
  pommel: new CylinderGeometry(0.038, 0.032, 0.03, 9),
}

export const SWORD_PIECES: Piece[] = [
  {
    geometry: SWORD_GEOMETRY.blade,
    material: 'steel',
    position: [0, 0.16, -0.008],
    outline: OUTLINE_THIN,
  },
  { geometry: SWORD_GEOMETRY.hamon, material: 'steelDark', position: [0.032, 0.17, 0.0125] },
  {
    geometry: SWORD_GEOMETRY.guard,
    material: 'gold',
    position: [0, 0.155, 0],
    outline: OUTLINE_THIN,
  },
  {
    geometry: SWORD_GEOMETRY.grip,
    material: 'clothDark',
    position: [0, 0.02, 0],
    outline: OUTLINE_THIN,
  },
  ...Array.from({ length: 5 }, (_, i): Piece => ({
    geometry: SWORD_GEOMETRY.wrap,
    material: 'goldDim',
    position: [0, -0.085 + i * 0.05, 0],
    rotation: [0, Math.PI / 4, 0.3],
  })),
  {
    geometry: SWORD_GEOMETRY.pommel,
    material: 'gold',
    position: [0, -0.128, 0],
    outline: OUTLINE_THIN,
  },
]

/* --- Les ailes de la phase II ---------------------------------------------- */

/**
 * Un papillon : deux demi-ailes en dièdre, fusionnées en **une** géométrie.
 *
 * Le dièdre n'est pas de la coquetterie. Deux plans coplanaires disparaissent
 * quand on les regarde par la tranche, et une aile qui s'évanouit à certains
 * angles de caméra est pire que pas d'aile. À ±0,35 rad, il y en a toujours un
 * des deux qui prend la lumière.
 *
 * Les deux moitiés sont fusionnées ici, et pas rendues comme deux maillages :
 * c'est ce qui permet d'en faire un `InstancedMesh`. Voir `WING_INSTANCES`.
 */
const BUTTERFLY = (() => {
  const halfWing = (s: number) => {
    const shape = new Shape()
    shape.moveTo(0, 0)
    shape.bezierCurveTo(s * 0.04, 0.085, s * 0.15, 0.105, s * 0.155, 0.022)
    shape.bezierCurveTo(s * 0.168, -0.042, s * 0.088, -0.078, s * 0.024, -0.03)
    shape.lineTo(0, 0)
    const geometry = new ShapeGeometry(shape, 6)
    geometry.rotateY(s * 0.35)
    return geometry
  }
  return mergeGeometries([halfWing(1), halfWing(-1)])!
})()

export interface WingInstance {
  position: Vec3
  rotation: Vec3
  scale: number
  pale: boolean
}

export interface Wing {
  /** Les cinq nervures d'une aile, fusionnées en une géométrie. */
  strands: BufferGeometry
  /** Les papillons, posés le long des nervures. */
  butterflies: WingInstance[]
  /** Le disque de fond. */
  halo: { geometry: BufferGeometry; position: Vec3; rotation: Vec3 }
}

/**
 * Une aile : cinq nervures en éventail, du haut (longue, tendue vers l'arrière
 * et le haut) vers le bas (courte, retombante).
 *
 * Chaque nervure est une **courbe** et non un segment — c'est la courbure qui
 * fait la différence entre une aile et un râteau. Le tube qui la matérialise est
 * le cheveu ; les papillons sont enfilés le long de la même courbe, avec une
 * taille qui décroît vers la pointe.
 *
 * **Les papillons sont des instances, pas des maillages.** Quarante par aile
 * feraient quatre-vingts objets dans la scène pour un modèle qu'on monte et
 * démonte à chaque voyage. Une seule géométrie et une matrice par papillon
 * donnent un seul appel de dessin par aile — c'est déjà ce que fait la
 * végétation du continent.
 */
export function buildWing(side: number): Wing {
  const strands: BufferGeometry[] = []
  const butterflies: WingInstance[] = []

  for (let n = 0; n < 5; n++) {
    const t = n / 4
    const len = WING_SPAN * (1 - t * 0.38)
    const rise = 1.5 - t * 1.9
    const curve = new CatmullRomCurve3([
      new Vector3(0, 0, 0),
      new Vector3(side * len * 0.3, rise * 0.34 + 0.24, -len * 0.16),
      new Vector3(side * len * 0.66, rise * 0.72 + 0.18, -len * 0.3),
      new Vector3(side * len, rise, -len * 0.42),
    ])

    strands.push(strandGeometry(curve, 0.016, 0.55, 16, 5))

    const count = 11 - n
    const at = new Vector3()
    for (let i = 1; i <= count; i++) {
      const u = i / (count + 1)
      curve.getPointAt(u, at)
      butterflies.push({
        position: [at.x, at.y, at.z],
        rotation: [(i % 3) * 0.3 - 0.3, side * (0.4 + u * 0.7), side * (u * 0.5 - 0.25)],
        scale: 1.25 - u * 0.55,
        pale: i % 3 === 0,
      })
    }
  }

  return {
    strands: mergeGeometries(strands)!,
    butterflies,
    halo: {
      geometry: new CircleGeometry(WING_SPAN * 0.62, 20),
      position: [side * WING_SPAN * 0.45, 0.45, -WING_SPAN * 0.3],
      rotation: [0, side * 0.9, 0],
    },
  }
}

export const BUTTERFLY_GEOMETRY = BUTTERFLY
export const WINGS = { left: buildWing(LEFT), right: buildWing(RIGHT) }
