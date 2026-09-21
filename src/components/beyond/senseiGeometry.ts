/**
 * Les cotes du maître : squelette, palette, et la table des mèches.
 *
 * Séparé de `Sensei.tsx` parce que ce sont des **nombres réglés à l'image** et
 * non du code de rendu. Ils ont chacun coûté un aller-retour devant le modèle,
 * et plusieurs encodent un piège dont rien, dans le fichier de composant, ne
 * rappellerait l'existence. Les commentaires ci-dessous sont ces pièges.
 */

/* --- Squelette : repris tel quel du héros ----------------------------------- */

export const HIP_Y = 0.44
export const SHOULDER_Y = 0.92
export const HEAD_Y = 1.22
/** Épaisseur du contour cel-shading, comme partout ailleurs. */
export const OUTLINE = 0.028

/* --- Palette ---------------------------------------------------------------- */

/**
 * La tenue ne change pas d'une forme à l'autre : c'est le personnage qui
 * change, pas ses vêtements. Seuls les cheveux, les yeux et l'aura sont
 * déclarés par forme, dans `config/senseiForms`.
 */
export const GI = '#ef6a1a'
export const BLUE = '#23408f'
/** Liseré de tige et semelle. */
export const BOOT_TRIM = '#e5b32a'
export const SKIN = '#f2c79b'
/**
 * Contour teinté chaud plutôt que noir.
 *
 * Un cerne noir sur de l'orange vif fait une découpe d'autocollant — c'est le
 * raisonnement du contour prune de la tenue du capitaine, transposé.
 */
export const OUTLINE_COLOR = '#331508'
export const POLE = '#9e2820'
export const POLE_CAP = '#c08a24'
/** Pastille de kanji, faute de texture dans le projet. */
export const KANJI = '#2a1a12'

/* --- Les mèches ------------------------------------------------------------- */

/** Azimut, élévation, longueur, largeur, réponse au redressement. */
export type Blade = readonly [number, number, number, number, number]

/**
 * La couronne, et les trois règles qu'elle applique.
 *
 *  1. **Trois calibres de largeur.** Toutes les mèches ont d'abord fait 0,15 de
 *     rayon, et une chevelure dont tous les paquets ont la même épaisseur se lit
 *     comme un oursin quelle que soit leur longueur. Les grosses (1,25) portent
 *     la silhouette, les moyennes (1,0) la remplissent, les petites (0,8)
 *     découpent le contour.
 *
 *  2. **Répartition frontale, pas radiale.** Rien ne part sur le côté à plat :
 *     le sommet monte, l'arrière part en arrière et c'est lui qui est le plus
 *     long. C'est ce débord de nuque qui fait le profil reconnaissable.
 *
 *  3. **Une réponse au redressement par mèche** (le cinquième nombre). Appliqué
 *     uniformément, le redressement fait converger toute la chevelure à la
 *     verticale et la silhouette devient une colonne étroite. Le sommet suit à
 *     fond, l'arrière à moitié, les tempes à peine : c'est ce qui garde de la
 *     largeur une fois transformé.
 */
export const CROWN: readonly Blade[] = [
  // Sommet
  [0.0, 1.34, 0.6, 1.25, 1.0],
  [0.4, 1.26, 0.55, 1.15, 0.95],
  [-0.44, 1.24, 0.57, 1.15, 0.95],
  [0.92, 1.12, 0.49, 1.0, 0.8],
  [-0.98, 1.1, 0.51, 1.0, 0.8],
  // Arrière : les plus longues
  [2.05, 0.96, 0.62, 1.1, 0.55],
  [-2.1, 0.98, 0.64, 1.1, 0.55],
  [2.6, 0.86, 0.7, 1.25, 0.45],
  [-2.55, 0.88, 0.73, 1.25, 0.45],
  [Math.PI, 0.8, 0.67, 1.15, 0.5],
  // Tempes
  [1.48, 0.86, 0.52, 0.95, 0.3],
  [-1.52, 0.88, 0.54, 0.95, 0.3],
  [1.15, 0.72, 0.48, 0.85, 0.25],
  [-1.18, 0.74, 0.5, 0.85, 0.25],
]

/**
 * Les mèches supplémentaires des formes dressées.
 *
 * Elles sont **toujours construites** et mises à l'échelle zéro tant que la
 * forme ne les demande pas. Les monter et démonter au franchissement de palier
 * les ferait apparaître d'un coup au milieu d'une transition par ailleurs
 * amortie, ce qui est précisément ce qu'on cherche à éviter.
 */
export const EXTRA_BLADES: readonly Blade[] = [
  [0.22, 1.4, 0.58, 1.2, 1.0],
  [-0.24, 1.38, 0.6, 1.2, 1.0],
  [1.32, 1.02, 0.56, 0.95, 0.35],
  [-1.36, 1.0, 0.58, 0.95, 0.35],
]

/**
 * Plancher d'élévation.
 *
 * Sous cette valeur une mèche part de côté, à plat, et la coiffure devient une
 * étoile de mer. C'est le défaut le plus visible de la première version du
 * modèle, et il ne se voyait pas du tout dans les nombres.
 */
export const MIN_ELEVATION = 0.58

/** Position, longueur, largeur, bascule, roulis. */
export type Bang = readonly [number, number, number, number, number, number, number]

/**
 * Les mèches de front, en M.
 *
 * Elles ne sont pas décrites en azimut/élévation comme les autres : une mèche
 * qui retombe part du **bord** du crâne et non de son sommet, et l'exprimer en
 * coordonnées polaires demandait des valeurs qui ne veulent rien dire. Position
 * et bascule directes, réglées à l'image.
 *
 * Deux longues au centre séparées d'un intervalle — c'est cet intervalle qui
 * fait le M — et deux courtes aux tempes. Leur pointe s'arrête **au-dessus des
 * sourcils** : deux centimètres plus bas elles mangent les yeux, et il ne reste
 * qu'un casque noir.
 */
export const BANGS: readonly Bang[] = [
  [0.075, 0.15, 0.212, 0.26, 1.25, 2.52, 0.1],
  [-0.095, 0.156, 0.205, 0.23, 1.1, 2.48, -0.12],
  [0.205, 0.128, 0.162, 0.19, 0.85, 2.38, 0.3],
  [-0.215, 0.124, 0.158, 0.17, 0.8, 2.42, -0.32],
]

/** x, y, z, longueur, bascule. */
export type ManeSpike = readonly [number, number, number, number, number]

/**
 * La crinière de la troisième forme : masse arrière, traîne, pointes.
 *
 * La traîne est **étroite et franchement en arrière**. Large, elle sortait en
 * ailerons de chaque côté de la tête au lieu de descendre dans le dos — un
 * défaut invisible de face, flagrant de trois quarts.
 */
export const MANE_SPIKES: readonly ManeSpike[] = [
  [0.19, -0.04, -0.38, 0.58, 1.15],
  [-0.19, -0.04, -0.38, 0.62, 1.15],
  [0.25, -0.24, -0.32, 0.48, 1.55],
  [-0.25, -0.24, -0.32, 0.45, 1.55],
  [0.1, 0.1, -0.4, 0.5, 0.72],
  [-0.12, 0.08, -0.4, 0.54, 0.74],
  [0, 0.18, -0.34, 0.42, 0.44],
]

/* --- Aura ------------------------------------------------------------------- */

/**
 * Les effectifs maximaux, alloués une fois pour toutes.
 *
 * Comme les mèches supplémentaires : tout est construit au montage et mis à
 * l'échelle zéro quand la forme courante n'en veut pas. Un `useMemo` qui
 * rebâtirait la liste à chaque palier ferait repartir toutes les langues de
 * leur phase initiale, c'est-à-dire un clignotement au moment précis où l'on
 * regarde le personnage.
 */
export const MAX_TONGUES = 13
export const MAX_MOTES = 11
export const MAX_BOLTS = 6
