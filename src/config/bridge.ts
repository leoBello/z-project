import { sampleHeight } from './world'

/**
 * Pont de Nakano : la plage des terres arides vers l'îlot du nord-est.
 *
 * Ce fichier ne décrit que **le tracé et l'assise** du pont — sa charpente vit
 * dans `components/environment/Bridge.tsx`. Deux systèmes qui ne se connaissent
 * pas le lisent : la charpente, et le semis de végétation, qui s'interdit de
 * pousser sous le tablier.
 *
 * Les altitudes ne sont pas écrites à la main : elles sont **lues dans le
 * relief** au chargement, comme le fait déjà la grille du terrain. Le monde
 * dérive d'une seule fonction pure, et un pont dont les culées seraient des
 * constantes flotterait au premier réglage de `sampleHeight`.
 */

/** Direction nord-est, unitaire. Le pont court exactement dessus. */
const DIAGONAL = { x: Math.SQRT1_2, z: -Math.SQRT1_2 } as const

/**
 * Distances au centre de la carte des deux culées, mesurées par balayage.
 *
 * **Pied (r = 78,5).** C'est la dernière cote de la diagonale nord-est où le
 * sable est encore à 0,64 au-dessus de la mer, adossé aux terres arides — la
 * valeur de région y vaut 0,80, largement au-delà du seuil de 0,66. Le tablier
 * y affleure le sol *exactement* : le joueur ne monte pas sur le pont, il y
 * entre. C'est volontaire, et c'est la même contrainte que l'escalier du Temple
 * du Sommet — le personnage n'a pas d'autostep, une marche de quinze
 * centimètres à l'entrée du pont aurait été un mur.
 *
 * **Tête (r = 93,3).** Ce n'est pas le bord du plateau mais le **point de
 * tangence** : depuis le pied, c'est la droite la plus raide qui touche encore
 * le flanc de l'îlot. Une culée posée plus haut — au bord du plateau, à 4,5 du
 * centre — aurait donné un tablier qui *s'enfonce* dans le flanc sur les deux
 * dernières unités, parce que ce flanc monte à 1,36 de pente et qu'aucune rampe
 * praticable ne peut le suivre. Mesuré : garde de −0,22 au point le pire. Ici la
 * garde reste positive sur toute la portée, et vaut 0 pile à la pose.
 */
const FOOT_R = 78.5
const HEAD_R = 93.3

const anchor = (r: number) => {
  const x = DIAGONAL.x * r
  const z = DIAGONAL.z * r
  return { x, z, y: sampleHeight(x, z) }
}

/** Pied du pont, sur la plage des terres arides. */
export const BRIDGE_FOOT = anchor(FOOT_R)
/** Tête du pont, sur le flanc de l'îlot. */
export const BRIDGE_HEAD = anchor(HEAD_R)

export const BRIDGE = {
  foot: BRIDGE_FOOT,
  head: BRIDGE_HEAD,
  /**
   * Largeur du tablier.
   *
   * Trois unités de large pour un personnage de 1,6 : assez pour qu'on n'ait
   * jamais l'impression de marcher sur une poutre, assez peu pour que les deux
   * garde-corps restent dans le cadre et donnent la perspective du franchissement.
   */
  width: 2.9,
  /** Épaisseur du tablier, garde-corps non compris. */
  thickness: 0.22,
  /** Portée horizontale et dénivelé, dérivés des culées. */
  run: Math.hypot(BRIDGE_HEAD.x - BRIDGE_FOOT.x, BRIDGE_HEAD.z - BRIDGE_FOOT.z),
  rise: BRIDGE_HEAD.y - BRIDGE_FOOT.y,
} as const

/**
 * Cap du pont. L'avant d'un modèle est +Z, comme partout dans le projet : le
 * tablier se construit donc dans un repère local qui part du pied et avance
 * vers l'îlot.
 */
export const BRIDGE_YAW = Math.atan2(
  BRIDGE_HEAD.x - BRIDGE_FOOT.x,
  BRIDGE_HEAD.z - BRIDGE_FOOT.z,
)

/** Pente du tablier, en hauteur par unité horizontale. */
export const BRIDGE_SLOPE = BRIDGE.rise / BRIDGE.run
/** Inclinaison du tablier, en radians (≈ 16,7°). */
export const BRIDGE_PITCH = Math.atan(BRIDGE_SLOPE)
/** Longueur du tablier le long de la pente. */
export const BRIDGE_LENGTH = Math.hypot(BRIDGE.run, BRIDGE.rise)

/**
 * Vrai si (x, z) tombe sous le pont ou sur son parvis.
 *
 * Sert au semis de végétation : le tablier touche le sable à ses deux
 * extrémités, et un palmier planté là aurait poussé au travers. Le rayon est
 * élargi d'une unité et demie au-delà du garde-corps pour dégager aussi les
 * abords immédiats — un pont qu'on aborde en écartant des buissons ne se lit
 * plus comme un passage.
 */
export function underBridge(x: number, z: number) {
  const abx = BRIDGE_HEAD.x - BRIDGE_FOOT.x
  const abz = BRIDGE_HEAD.z - BRIDGE_FOOT.z
  const lengthSq = abx * abx + abz * abz
  const t = Math.min(
    1,
    Math.max(0, ((x - BRIDGE_FOOT.x) * abx + (z - BRIDGE_FOOT.z) * abz) / lengthSq),
  )
  const distance = Math.hypot(
    x - (BRIDGE_FOOT.x + abx * t),
    z - (BRIDGE_FOOT.z + abz * t),
  )
  return distance < BRIDGE.width / 2 + 1.5
}
