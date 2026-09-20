/**
 * Les dimensions de la capsule du joueur, **isolées de tout le reste**.
 *
 * Deux valeurs, et un fichier entier pour elles : c'est disproportionné à la
 * lecture, et c'est pourtant ce qui empêche la configuration de ne se charger
 * que dans un sens.
 *
 * Le cycle qu'elles cassent. `world` creuse les terrasses des monuments, donc
 * lit `landmarks` ; `landmarks` posait ses ancres d'arrivée à hauteur de
 * capsule, donc lisait `gameplay` ; `gameplay` calcule le point d'apparition
 * sur le relief réel, donc appelle `sampleHeight` **au moment du chargement**.
 * La boucle se refermait, et elle n'était pas bénigne : un cycle où l'un a
 * besoin du *résultat* d'un autre ne se résout que dans un sens. Entrer par
 * `gameplay` marchait ; entrer par `landmarks` donnait une table de monuments
 * vide au creusement des terrasses, et entrer par `world` un `WORLD` indéfini.
 *
 * Rien ne le signalait, parce que l'application entrait par le bon bout. Le
 * jour où un composant, un test ou un découpage de bundle en aurait choisi un
 * autre, c'est le chargement entier qui tombait — sur une erreur qui ne nomme
 * ni le cycle ni le coupable.
 *
 * `landmarks` lit donc ces deux nombres ici plutôt que dans `PLAYER`, et
 * redevient une feuille du graphe. `PLAYER` les reprend, et reste la seule
 * adresse où on va les chercher : aucun appelant ne change.
 */
export const CAPSULE = {
  /** Demi-hauteur de la capsule de collision (hors calottes). */
  halfHeight: 0.45,
  radius: 0.35,
} as const

/**
 * Du sol au centre de la capsule.
 *
 * La somme des deux, nommée une fois : c'est la relation qu'utilisent le
 * joueur, les arrivées de téléportation, le filet de chute et l'onde
 * d'annihilation pour passer des pieds au centre. Trois d'entre eux la
 * réécrivaient à la main.
 */
export const FEET_TO_CENTER = CAPSULE.halfHeight + CAPSULE.radius
