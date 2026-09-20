import { PLAYER } from './gameplay'

/**
 * Le Marais d'Aeonia — la troisième carte, et sa géographie.
 *
 * On y entre par le portail du sommet de la Montagne de l'Ouest, une fois le
 * Lynel doré tombé, et on n'y entre que par là. Le voyage rapide n'y mène pas :
 * le menu de téléportation ne liste que des monuments, et il n'y en a aucun ici.
 *
 * **Le terrain est plat, et c'est la décision structurante.** Le continent est
 * un champ de hauteurs sur grille carrée ; l'île est une surface radiale avec un
 * dessous. Ni l'un ni l'autre n'était nécessaire ici : un marais est une nappe.
 * Le sol se réduit donc à un disque, et tout le relief est fait d'objets posés
 * dessus — ce qui économise le collider de terrain, l'échantillonneur de
 * hauteur, et le fond de minimap dessiné à partir du relief.
 *
 * Le prix de ce choix est réel : il n'y a **rien à escalader** sur cette carte.
 * Le saut n'y sert qu'à deux choses — repasser un parapet de la chaussée, et
 * remonter dessus si l'on en est descendu. Ces deux usages ne sont pas une
 * consolation, ce sont des cotes : le tablier est posé à 0,90 précisément parce
 * que le saut culmine à 1,33 (v² / 2g = 64 / 48). Voir `CAUSEWAY`.
 */

/* --- La nappe --------------------------------------------------------------- */

/**
 * Rayon de la nappe de pourriture.
 *
 * Elle déborde largement de ce qu'on peut atteindre : le joueur est arrêté bien
 * avant par la brume, qui sature à 180. Un marais dont on voit le bord est un
 * plateau, et un plateau n'a pas l'air d'un monde.
 */
export const MARSH_R = 160

/**
 * Altitude de la surface de l'eau, et altitude du sol sec.
 *
 * L'écart — trente centimètres — est la seule cote de cette carte qui compte
 * vraiment : c'est la hauteur d'eau, donc ce que le joueur traverse quand il
 * choisit de couper au court plutôt que de suivre les racines. Plus profond, on
 * nagerait ; moins profond, on ne verrait pas qu'on est dedans.
 */
export const WATER_Y = 0.3
export const GROUND_Y = 0

/**
 * Au-delà de ce rayon, le joueur est ramené au portail.
 *
 * Il n'y a pas de bord physique — poser un mur invisible sur un marais qui
 * s'étend à perte de vue aurait démenti l'image. La laisse est donc une
 * téléportation silencieuse, comme le filet de sécurité de chute du continent,
 * et elle est posée assez loin pour qu'on ne la rencontre qu'en la cherchant.
 */
export const MARSH_LEASH_R = 148

/* --- L'Arbre blafard -------------------------------------------------------- */

/** Le tronc : sa position, son rayon au pied, au sommet, et sa hauteur. */
export const TREE = {
  x: 0,
  z: -34,
  baseRadius: 9.5,
  topRadius: 3.4,
  height: 120,
} as const

/* --- L'arène ---------------------------------------------------------------- */

/**
 * Le bassin de racines au pied du tronc, où elle attend.
 *
 * Un demi de plus que la rotonde du Lynel (11,5), et c'est voulu : le joueur
 * connaît déjà cette distance pour y avoir livré quatre combats. On ne la lui
 * réapprend pas, on la remplit autrement.
 */
export const ARENA_R = 12
export const ARENA_CENTER: readonly [number, number, number] = [0, GROUND_Y, 0]

/**
 * Rayon d'engagement du combat.
 *
 * Plus grand que l'arène : elle se lève quand on entre dans le bassin, pas quand
 * on lui marche dessus. Le joueur doit avoir le temps de la voir se lever.
 */
export const ENGAGE_R = 15

/**
 * L'anneau d'eau à la lèvre du bassin, en rayons intérieur et extérieur.
 *
 * C'est la règle graduée du combat, comme les trois anneaux d'or du dallage de
 * la rotonde — sauf que celui-ci pique : y rester fait monter la pourriture. Un
 * repère de distance qui coûte quelque chose est un repère qu'on regarde.
 */
export const ARENA_RING = [9.6, 11.6] as const

/* --- La traversée ----------------------------------------------------------- */

/**
 * La chaussée d'Elphaël — la traversée, et pourquoi ce n'est plus une racine.
 *
 * La première version était un tube de racine de 1,9 de rayon dont la crête
 * montait à 2,90 au-dessus du marais. Le saut du joueur culmine à **1,33**
 * (v² / 2g = 64 / 48) : une chute était donc **sans retour**. On atterrissait
 * dans la pourriture, la jauge montait, et il fallait patauger jusqu'au portail
 * pour reprendre le chemin depuis le début. Aucune largeur n'aurait rattrapé ça.
 *
 * Trois corrections, et elles tiennent ensemble :
 *
 *  - **plate et basse.** Le tablier est à 0,90, sous la hauteur de saut : on
 *    remonte dessus d'un bond depuis le marais. Une surface plane, aussi, plutôt
 *    que la crête d'un cylindre où l'on glissait sur les flancs ;
 *  - **bordée.** Deux parapets à colliders : on ne tombe plus par accident. On
 *    peut toujours descendre en sautant par-dessus, ce qui garde au marais son
 *    rôle — mais c'est alors un choix, pas une punition ;
 *  - **courte.** Cinquante-deux unités au lieu de cent trente, soit sept
 *    secondes et demie de marche. La traversée doit installer un lieu, pas
 *    occuper le joueur.
 *
 * Et c'est de la **pierre**, pas du bois mort : Elphaël est une ville, et la
 * beauté de ce monde vient de ce qu'il a été construit avant de pourrir. Une
 * passerelle de racines disait le contraire.
 */
export const CAUSEWAY: readonly (readonly [number, number])[] = [
  [1, 66],
  [3, 54],
  [2, 42],
  [-3, 30],
  [-1, 20],
  [0, 14],
]

/** Altitude du dessus du tablier. Sous les 1,33 du saut : on y remonte. */
export const DECK_Y = 0.9
/** Demi-largeur praticable. 5,2 de large, soit sept largeurs de personnage. */
export const DECK_HALF = 2.6
/** Épaisseur du tablier. */
export const DECK_THICK = 0.45
/** Parapets : hauteur au-dessus du tablier, et épaisseur. */
export const PARAPET_H = 0.8
export const PARAPET_W = 0.32

/* --- Les deux bouts --------------------------------------------------------- */

/**
 * Le portail d'arrivée, à cent vingt unités de l'arène.
 *
 * Son cap est zéro : sa normale regarde le nord, donc le joueur qui en sort lui
 * tourne le dos et fait face au sud — c'est-à-dire à l'arbre, qu'il voit
 * immédiatement. Toute la mise en scène de cette carte tient dans ce cap.
 */
export const MARSH_PORTAL = {
  x: CAUSEWAY[0][0],
  /**
   * Posé **sur** le tablier, et l'altitude en est déduite.
   *
   * Une première version l'écrivait à la main, et le joueur y naissait enfoncé
   * jusqu'à la taille dans le chemin. La cote dépend de la géométrie de la
   * chaussée ; elle se lit donc dans la chaussée.
   */
  y: DECK_Y,
  z: 63,
  yaw: 0,
} as const

/**
 * Où le joueur se pose en arrivant, et où le filet de sécurité le remet.
 *
 * Trois unités **en deçà** du portail sur son axe, donc du côté de l'arbre : on
 * en sort dos à l'anneau, face au chemin. La demi-hauteur de capsule plus son
 * rayon, comme partout ailleurs — c'est la relation qui pose le joueur ni
 * enfoncé ni flottant.
 */
export const MARSH_SPAWN = {
  x: MARSH_PORTAL.x,
  y: MARSH_PORTAL.y + PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius,
  z: MARSH_PORTAL.z - 3,
}

/** Cap à l'arrivée : face au sud, donc face à l'arbre. */
export const MARSH_ARRIVAL_YAW = Math.PI

/* --- Le cadrage de la minimap ----------------------------------------------- */

/**
 * Ce que la minimap doit tenir : du portail (z 121) au-delà de l'arbre (z -34).
 *
 * Centré sur le milieu de ce segment plutôt que sur l'origine, pour la même
 * raison que le cadre de l'île : un cadre centré sur l'arène devrait couvrir
 * deux cent quarante unités pour atteindre le portail, alors que le monde à
 * montrer n'en fait que cent soixante-dix. On aurait payé un tiers de vide au
 * sud en rapetissant le chemin d'autant sur une vignette de cent cinquante
 * pixels.
 */
export const MARSH_MAP_CENTER_Z = (MARSH_PORTAL.z + (TREE.z - 12)) / 2
export const MARSH_MAP_CENTER_X = 0
export const MARSH_MAP_SIZE = MARSH_PORTAL.z - (TREE.z - 12) + 24
