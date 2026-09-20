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
 * Le saut du joueur n'y sert à rien, sauf sur les racines. C'est assumé — ce
 * n'est pas une carte d'exploration, c'est un chemin vers un combat.
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
 * Les trois racines, décrites par leurs points de contrôle.
 *
 * C'est la géométrie de la Voie de l'île, reprise telle quelle : une courbe, un
 * tube, un collider de boîte par tronçon. Rien de neuf à écrire, et c'est
 * l'essentiel de l'économie de cette carte.
 *
 * Elles s'enchaînent — le dernier point de l'une est le premier de la suivante —
 * pour qu'il n'y ait aucun saut à faire entre deux. Un trou dans le chemin
 * transformerait une traversée en épreuve d'adresse, ce qu'elle n'est pas.
 */
export const SPANS: readonly (readonly (readonly [number, number, number])[])[] = [
  [[2, -0.2, 118], [6, 0.8, 96], [4, 0.5, 74], [1, 0.2, 58]],
  [[1, 0.2, 58], [-7, 1.0, 46], [-9, 0.7, 32], [-4, 0.1, 22]],
  [[-4, 0.1, 22], [1, 0.6, 18], [4, 0.3, 15], [0, -0.1, 12.2]],
]

/**
 * Rayon du tube d'une racine.
 *
 * **Élargi de 1,15 à 1,9 après la première partie jouée**, et la raison est
 * mesurable : le joueur fait 0,70 de large (capsule de rayon 0,35). À 1,15 de
 * rayon pour un collider à 82 %, le chemin faisait 1,89 — soit deux largeurs et
 * demie de personnage, sur un tracé courbe vu de trois quarts en plongée. On en
 * tombait sans comprendre pourquoi.
 *
 * À 1,9, la surface praticable fait 3,42, soit près de cinq largeurs. C'est
 * généreux, et ça doit l'être : cette traversée n'est pas une épreuve d'adresse,
 * c'est un chemin vers un combat. Tout ce qu'elle doit produire, c'est le
 * sentiment de ne pas pouvoir couper par le marais.
 *
 * Les altitudes des points de contrôle ont baissé d'autant : la surface de
 * marche est le sommet du tube, donc l'élargir l'aurait relevée de trois quarts
 * d'unité sur toute la longueur. Elles culminent maintenant à 2,9 au-dessus de
 * la nappe — assez pour lire une passerelle, assez peu pour qu'une chute soit un
 * pas de côté et non une punition.
 */
export const SPAN_RADIUS = 1.9

/* --- Les deux bouts --------------------------------------------------------- */

/**
 * Le portail d'arrivée, à cent vingt unités de l'arène.
 *
 * Son cap est zéro : sa normale regarde le nord, donc le joueur qui en sort lui
 * tourne le dos et fait face au sud — c'est-à-dire à l'arbre, qu'il voit
 * immédiatement. Toute la mise en scène de cette carte tient dans ce cap.
 */
export const MARSH_PORTAL = {
  x: 2,
  /**
   * Posé **sur** la racine, et l'altitude en est déduite.
   *
   * La première version le mettait à 0,4, c'est-à-dire à peu près au niveau de
   * l'eau — et le joueur y apparaissait donc enfoncé jusqu'à la taille dans la
   * première racine, dont la surface est à 1,7. Écrire la cote à la main était
   * l'erreur : elle dépend de deux nombres qui ont bougé depuis (l'altitude du
   * premier point de contrôle, et le rayon des racines).
   */
  y: SPANS[0][0][1] + SPAN_RADIUS,
  z: 117,
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
