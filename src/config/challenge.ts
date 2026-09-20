/**
 * Le défi du maître — deux minutes, un compteur, et rien d'autre.
 *
 * C'est la seule mécanique du jeu qui ne serve à aucune progression : elle ne
 * donne ni cœur, ni objet, ni accès. Elle donne un **nombre**, et la possibilité
 * de le battre. C'est exactement ce qu'on attend d'une carte d'après-partie, et
 * c'est pourquoi tout ici est réglé pour qu'un second essai soit plus court à
 * lancer que le premier : pas de dialogue à relire, pas de trajet à refaire, le
 * maître est à cinq pas du point de résurrection.
 *
 * **Tout se compte en temps de jeu**, jamais en temps réel. C'est une règle du
 * projet et elle a ici sa conséquence la plus visible : ouvrir l'inventaire ou
 * le journal met la partie en pause, donc arrête l'horloge, donc **arrête le
 * chronomètre**. On ne peut pas gagner du temps en lisant ses objets, et on ne
 * perd pas son défi parce qu'on a répondu au téléphone.
 */

/**
 * Durée du défi, en millisecondes de temps de jeu.
 *
 * Deux minutes, et le nombre a été demandé tel quel. Il se trouve qu'il tombe
 * juste : la carte fait deux cents unités de côté, le joueur en parcourt sept
 * par seconde, et les bêtes les plus denses sont à une quarantaine d'unités du
 * sanctuaire. Deux minutes, c'est donc **un aller, une boucle et un retour** —
 * assez pour choisir un itinéraire, trop peu pour tout ramasser.
 */
export const CHALLENGE_MS = 120_000

/**
 * Compte à rebours avant le départ, en millisecondes de temps de jeu.
 *
 * Trois secondes, plus deux dixièmes pour que le « GO ! » ait le temps d'exister
 * à l'écran avant que le chronomètre ne parte. Sans ce décompte, le défi
 * commençait à la frame où l'on fermait le dialogue : le joueur perdait ses deux
 * premières secondes à comprendre qu'il avait commencé, et elles comptent.
 *
 * Il court sur l'horloge de jeu comme le reste, mais la partie n'est **pas** en
 * pause pendant ce temps : on peut courir vers sa première cible pendant le
 * décompte. C'est voulu — le départ se prépare, et un joueur qui connaît la
 * carte doit pouvoir en tirer parti.
 */
export const COUNTDOWN_MS = 3_200

/**
 * Le seuil des cinq dernières secondes, où l'affichage passe au rouge.
 *
 * Un seul seuil, et tardif. Un chronomètre qui s'affole pendant vingt secondes
 * n'alarme plus personne au bout de trois essais ; un qui change de couleur cinq
 * secondes avant la fin fait lever les yeux.
 */
export const CHALLENGE_URGENT_MS = 5_000

/**
 * Les rangs, du plus bas au plus haut, avec le score qui les ouvre.
 *
 * Quatre paliers pour un compteur qui, en pratique, va de cinq à une quarantaine.
 * Ils ne changent rien au jeu : leur seul rôle est de donner au nombre affiché à
 * la fin une **échelle** — « dix-huit » ne veut rien dire tant qu'on ne sait pas
 * si c'est bien. Le premier palier est à zéro et n'est donc jamais raté : on ne
 * finit pas un défi de deux minutes sur un échec, même à deux bêtes.
 *
 * L'ordre est décroissant parce que la recherche l'est aussi — voir `rankFor`.
 * Les libellés vivent dans `src/i18n/*.json`, sous `ui.challenge.ranks`.
 */
export const CHALLENGE_RANKS = [
  { id: 'legend', at: 30 },
  { id: 'master', at: 20 },
  { id: 'warrior', at: 10 },
  { id: 'novice', at: 0 },
] as const

export type ChallengeRank = (typeof CHALLENGE_RANKS)[number]['id']

/** Le rang atteint pour un score donné. Le premier palier franchi, en descendant. */
export function rankFor(kills: number): ChallengeRank {
  return (CHALLENGE_RANKS.find((rank) => kills >= rank.at) ?? CHALLENGE_RANKS[3]).id
}

/**
 * Le chronomètre restant, formaté `M:SS`.
 *
 * Ici plutôt que dans le composant qui l'affiche, parce que deux endroits le
 * lisent — le bandeau du HUD et le panneau de résultat — et qu'un chronomètre
 * qui s'arrondirait différemment aux deux endroits afficherait « 0:00 » d'un
 * côté et « 1 » de l'autre sur la même frame.
 *
 * Arrondi **au supérieur**, et c'est la seule décision de la fonction : à
 * l'arrondi inférieur, l'affichage tombe à zéro une seconde entière avant la fin
 * du défi, et le joueur croit avoir été volé. Il vaut donc « 0:00 » uniquement
 * quand il ne reste vraiment rien.
 */
export function formatRemaining(remainingMs: number) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
