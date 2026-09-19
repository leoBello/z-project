import { Vector3 } from 'three'
import { smoothstep } from './world'

/**
 * L'Île Céleste — ses cotes, et les quatre fonctions dont dérive tout le reste.
 *
 * Ce fichier est de l'arithmétique pure : aucun import de three hors du
 * `Vector3` de commodité, aucun état, aucune dépendance au reste du jeu. C'est
 * délibéré, et c'est ce qui permet à la silhouette lointaine — qui vit dans le
 * tronc commun et non dans le fragment de l'île — de s'en servir sans traîner
 * le module entier dans le bundle d'accueil.
 *
 * Il ne passe **pas** par `config/world.ts`, et ce n'est pas une omission. Le
 * continent est un champ de hauteurs sur une grille carrée : à chaque `(x, z)`
 * il associe une altitude et une seule. L'île a un **dessous** — un surplomb sur
 * toute sa surface — qu'aucun champ de hauteurs ne peut représenter, quel que
 * soit le degré d'abstraction qu'on lui donne. Généraliser `sampleHeight`
 * produirait une abstraction qui ne sert qu'une fois et qui mentirait sur la
 * seconde carte.
 */

// --- Cotes ------------------------------------------------------------------

/** Rayon nominal de l'île. Le contour réel ondule autour — voir `rimRadius`. */
export const ISLAND_R = 55
/** Profondeur du socle inversé, sous la lèvre. */
export const ISLAND_DEPTH = 46
/** La lèvre retombe un peu avant de basculer sous l'île. */
export const RIM_DROP = -1.2
/** Étendue du fond de minimap : l'île, plus une marge. */
export const ISLAND_MAP_SIZE = 130

/** Rayon de l'enceinte, et hauteur de son mur. */
export const WALL_R = 29.5
export const WALL_H = 5
/** Passage libre sous une arche. Le double du personnage, qui mesure 1,6. */
export const ARCH_CLEAR = 3.4
/** Altitude des deux plateaux supérieurs, comptée depuis la prairie. */
export const GARDEN_Y = 3.6
export const CORE_Y = 7.2
/** Cime de l'arbre. Voir la note de cadrage dans la spec. */
export const TREE_TOP = 26

/**
 * Rampes : trois par marche, décalées de 60° d'un étage à l'autre.
 *
 * Le décalage est ce qui transforme un empilement de disques en parcours : on ne
 * monte jamais en ligne droite, il faut faire un tiers de tour sur chaque
 * palier. Les rampes extérieures partent de zéro, c'est-à-dire plein sud, dans
 * l'axe du point d'arrivée — le joueur a donc une première montée évidente.
 */
export const RAMPS_OUTER = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]
export const RAMPS_INNER = [Math.PI / 3, Math.PI, (5 * Math.PI) / 3]
/** Demi-largeur angulaire d'une rampe. 0,21 rad ≈ 12°, soit 7 unités à r = 32. */
const RAMP_HALF = 0.21

/**
 * Altitude sous laquelle on est tombé de l'île.
 *
 * Sous la lèvre (−1,2) et bien au-dessus du cristal (−34) : on tombe assez
 * longtemps pour comprendre qu'on est tombé, jamais assez pour traverser le
 * socle et le voir de l'intérieur. Lu par le filet de sécurité de `Player.tsx`,
 * qui est le seul à traiter les chutes, sur les deux cartes.
 */
export const FALL_LIMIT = -20

// --- Palette ----------------------------------------------------------------

/**
 * Les couleurs de l'île.
 *
 * Elles vivent ici, dans le module d'arithmétique, et non à côté des matériaux
 * qui les consomment — parce que **deux mondes en ont besoin** : le fragment de
 * l'île, et la silhouette lointaine qui reste dans le tronc commun. Les laisser
 * dans `components/skyisland/palette.ts` obligerait le tronc à importer un
 * module du fragment, ce qui suffirait à tirer l'île entière dans le bundle
 * d'accueil et à annuler tout le découpage.
 *
 * **La pierre est grise, pas blonde**, et c'est le choix qui sépare cette île du
 * reste du monde. Le calcaire chaud est celui des ruines de l'île du continent ;
 * si la forteresse céleste partageait sa palette, elle aurait l'air d'avoir été
 * bâtie par les mêmes gens. Elle ne doit pas.
 */
export const SKY_COLORS = {
  lawn: 0x8fbf63,
  lawnDark: 0x5f9147,
  stone: 0xc2c1b2,
  stoneMid: 0x9d9d8e,
  stoneDark: 0x6c6d62,
  moss: 0x6f9a4e,
  /*
    L'or, en trois valeurs.

    `gold` est l'or lavé par la pluie, celui des arêtes et des saillies ;
    `goldDim` l'or terni des creux, qui a viré au brun-vert ; `goldBright` ne
    sert qu'aux quelques pièces que la lumière frappe de plein fouet. Trois
    valeurs et pas une, parce qu'un or uniforme se lit comme de la peinture
    jaune — ce qui fait l'or, c'est l'écart entre ce qui brille et ce qui ne
    brille plus.
  */
  gold: 0xd9a441,
  goldDim: 0x8a6c33,
  goldBright: 0xf3d789,
  rock: 0x7d7365,
  rockDeep: 0x3d3548,
  bark: 0x6b5540,
  leaf: 0x4f9a4a,
  leafDark: 0x36753f,
  water: 0xcfe6f5,
  foam: 0xf2fbff,
  /** Le violet du cristal. Le même que celui du portail, et pour cause. */
  crystal: 0x8b3ff0,
  crystalPale: 0xe6ccff,
  /**
   * Le bleu vers lequel la silhouette lointaine est fondue.
   *
   * C'est le `glow` d'horizon de `StarrySky` — la bande lumineuse juste
   * au-dessus de la ligne d'horizon. Une brume peinte vers une autre teinte que
   * celle du ciel qui l'entoure se verrait comme un décalque.
   */
  haze: 0x6a7cbd,
} as const

// --- Le relief --------------------------------------------------------------

/**
 * Bruit déterministe et bon marché : trois sinus non harmoniques.
 *
 * Volontairement pas celui de `config/world.ts`, qui est un fBm sur table de
 * hachage — bien plus riche, et bien plus cher. Ici on ne cherche pas un relief
 * crédible mais une irrégularité : un contour qui ne soit pas un cercle et une
 * roche qui ne soit pas lisse. Trois sinus suffisent, et se dérivent de tête.
 */
export function islandNoise(a: number, b: number) {
  return (
    Math.sin(a * 1.7 + b * 2.3) * 0.5 +
    Math.sin(a * 3.1 - b * 1.3) * 0.3 +
    Math.sin(a * 5.7 + b * 0.7 + 1.4) * 0.2
  )
}

/** 1 au milieu d'un couloir de rampe, 0 hors de tout couloir. */
export function rampFactor(theta: number, centers: readonly number[]) {
  let best = 0
  for (const center of centers) {
    const d = Math.abs(((theta - center + Math.PI * 3) % (Math.PI * 2)) - Math.PI)
    best = Math.max(best, 1 - smoothstep(RAMP_HALF * 0.5, RAMP_HALF, d))
  }
  return best
}

/**
 * Une marche : plateau intérieur, puis descente au plateau extérieur.
 *
 * **Toute la conception du terrain tient dans la ligne `width`.** La même
 * fonction produit la falaise et la rampe, elles ne peuvent donc pas diverger,
 * et il n'existe nulle part une seconde définition de « où peut-on monter » qui
 * finirait par contredire celle-ci.
 *
 * Douze unités pour la rampe, et le nombre est le fruit d'une erreur qu'il vaut
 * mieux écrire que refaire. Il était à huit, pour 3,6 de dénivelé — soit une
 * pente **moyenne** de 0,45, sous le seuil de 0,5 qui rend un terrain praticable
 * sur le continent. Mais on ne marche pas sur une moyenne : le raccord est un
 * `smoothstep`, dont la dérivée culmine à **1,5 fois** sa pente moyenne en son
 * milieu. La rampe passait donc 0,68 à mi-course, et le seuil était franchi là
 * où le joueur allait précisément poser les pieds.
 *
 * À douze, le maximum vaut 1,5 × 3,6 / 12 = 0,45 — cette fois pour de bon. Le
 * couloir n'occupe que ±12° d'arc, l'élargissement ne coûte donc presque rien
 * au plateau qu'il entame.
 *
 * La falaise garde ses deux unités : 2,7 au plus raide, quatre fois le seuil.
 * Elle n'a pas besoin d'être exacte, seulement d'être un mur.
 */
function step(
  r: number,
  theta: number,
  edge: number,
  rise: number,
  centers: readonly number[],
) {
  const width = 2 + 10 * rampFactor(theta, centers)
  return rise * (1 - smoothstep(edge, edge + width, r))
}

/** Profil complet du dessus, en un point polaire. */
export function topHeight(r: number, theta: number) {
  return (
    step(r, theta, 32, GARDEN_Y, RAMPS_OUTER) +
    step(r, theta, 14, CORE_Y - GARDEN_Y, RAMPS_INNER) +
    RIM_DROP * smoothstep(52, 55, r)
  )
}

/** Rayon réel du bord, pour un cap donné : le contour n'est pas un cercle. */
export function rimRadius(theta: number) {
  return ISLAND_R * (1 + 0.055 * islandNoise(Math.cos(theta) * 2.2, Math.sin(theta) * 2.2))
}

/**
 * Altitude du **bord** de l'île, en un cap donné.
 *
 * C'est la cote de couture entre le dessus et le socle, et elle doit être
 * calculée, jamais écrite. `RIM_DROP` décrit la profondeur *à laquelle la lèvre
 * finit de retomber*, c'est-à-dire à partir de r = 55 — mais le contour réel
 * ondule entre 52,6 et 57,6. Aux caps où il n'atteint que 52,6, le raccord de
 * lèvre n'est parcouru qu'au douzième : le bord du dessus s'y arrête à −0,09.
 *
 * Coudre le socle sur `RIM_DROP` en dur ouvrait donc une fente de plus d'un
 * mètre sur une bonne partie de la circonférence — et comme les deux surfaces
 * sont à simple épaisseur, on voyait le ciel au travers. C'est exactement le
 * genre de défaut qu'aucun calcul ne signale et qu'une capture montre tout de
 * suite.
 *
 * Le relief de surface en fait partie : il monte jusqu'à ±0,52 au bord, et
 * l'oublier rouvrirait la moitié de la fente.
 */
export function rimHeight(theta: number) {
  const r = rimRadius(theta)
  return topHeight(r, theta) + surfaceRelief(r, theta)
}

/**
 * Le socle, paramétré de 1 (la lèvre) à 0 (la pointe).
 *
 * Le profil `1 − t^0,55` est ce qui distingue Laputa d'un simple cône : la masse
 * reste large juste sous la lèvre, puis file en pointe sur toute la moitié
 * basse. Un cône droit donnerait une toupie.
 *
 * Le bruit de roche s'annule à `t = 1`, et c'est indispensable : c'est là que
 * cette surface doit coudre exactement avec le dessus, sans un interstice par
 * lequel on verrait le vide. À `t = 1`, le rayon vaut donc `rimRadius(θ)` et
 * l'altitude `rimHeight(θ)` — les deux cotes exactes du bord du dessus.
 */
export function underRadius(t: number, theta: number) {
  const crag = islandNoise(theta * 4.3, t * 7.7) * (1 - t) * 0.16
  return t * rimRadius(theta) * (1 + crag)
}

export function underHeight(t: number, theta: number) {
  const crag = islandNoise(theta * 4.3, t * 7.7) * (1 - t) * 0.16
  return rimHeight(theta) - ISLAND_DEPTH * (1 - Math.pow(t, 0.55)) + crag * 12
}

/**
 * Relief de surface : les bosses qui s'ajoutent au profil des terrasses.
 *
 * Extrait en fonction plutôt que laissé dans le constructeur du maillage, parce
 * que les vestiges et la végétation doivent se poser sur la surface **réelle**,
 * bosses comprises. Sans ça, une colonne posée sur `topHeight` seul flotterait
 * de quarante centimètres au creux d'une bosse, ou s'y enfoncerait d'autant.
 */
export function surfaceRelief(r: number, theta: number) {
  const grain = islandNoise(r * 0.09, theta * 3.1)
  // Nul sur le cœur — c'est une arène, elle doit être plate — et croissant vers
  // le bord, où la roche affleure.
  return grain * (0.1 + 0.42 * smoothstep(16, 46, r))
}

/**
 * Position au sol, en un point polaire de l'île.
 *
 * Le seul chemin par lequel les vestiges, la végétation et l'eau se posent sur
 * le terrain. Tout ce qui se poserait autrement flotterait ou s'enfoncerait au
 * premier réglage du relief.
 */
export function groundAt(r: number, theta: number) {
  return new Vector3(
    Math.sin(theta) * r,
    topHeight(r, theta) + surfaceRelief(r, theta),
    Math.cos(theta) * r,
  )
}

/**
 * Pente locale du dessus, mesurée par différences finies.
 *
 * Sert à colorer le terrain — pelouse sur les plateaux et les rampes, pierre nue
 * sur les falaises — et le pas de 0,8 n'est pas arbitraire : c'est un peu moins
 * que la demi-largeur d'une falaise (1 unité), donc l'échantillonnage la voit
 * sans déborder sur les plateaux qui l'encadrent.
 */
export function topSlope(r: number, theta: number) {
  return Math.abs(topHeight(r + 0.8, theta) - topHeight(r - 0.8, theta)) / 1.6
}

/*
  Exposé en développement, sur le modèle de `window.gameWorld` pour le continent.

  Ce n'est pas du confort : le relief de l'île est la source de vérité commune au
  maillage, au collider et à la silhouette lointaine, et c'est exactement le
  genre de chose qu'on ne peut pas juger à l'œil. Un talus trop raide d'un
  dixième reste invisible sur une capture et bloque le joueur à l'essai. Pouvoir
  interroger `topHeight` et `topSlope` depuis la console — ou depuis un test
  navigateur, qui tourne à une image par seconde en rendu logiciel et ne peut
  donc pas *jouer* une montée — est le seul moyen de vérifier une pente.
*/
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__skyIsland = {
    topHeight,
    topSlope,
    rimRadius,
    rimHeight,
    underRadius,
    underHeight,
    surfaceRelief,
    groundAt,
    RAMPS_INNER,
    RAMPS_OUTER,
  }
}
