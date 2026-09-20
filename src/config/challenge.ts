import type { EnemyKind } from '../types/game'

/**
 * Le défi du maître — ce qu'on choisit avant, et ce qu'on gagne pendant.
 *
 * C'est la seule mécanique du jeu qui ne serve à aucune progression : elle ne
 * donne ni cœur, ni objet, ni accès. Elle donne un **nombre**, et la possibilité
 * de le battre. C'est exactement ce qu'on attend d'une carte d'après-partie, et
 * c'est pourquoi tout ici est réglé pour qu'un second essai soit plus court à
 * lancer que le premier.
 *
 * **Le défi se paramètre, et ce n'est pas un menu d'options.** Trois difficultés
 * et quatre durées font douze catégories, chacune avec son record — et douze
 * façons différentes de jouer la même carte. Une course de deux minutes en
 * facile est un sprint entre deux clairières ; dix minutes en difficile est une
 * expédition qui demande de choisir ses combats et de rentrer se soigner. Le
 * même terrain, et deux jeux.
 *
 * **Tout se compte en temps de jeu**, jamais en temps réel. C'est une règle du
 * projet et elle a ici sa conséquence la plus visible : ouvrir l'inventaire ou
 * le journal met la partie en pause, donc arrête l'horloge, donc **arrête le
 * chronomètre**. On ne peut pas gagner du temps en lisant ses objets, et on ne
 * perd pas son défi parce qu'on a répondu au téléphone.
 */

/* --- Difficulté ------------------------------------------------------------- */

/**
 * Les trois difficultés, et ce que chacune multiplie.
 *
 * Trois leviers seulement, et le choix de ces trois-là est le sujet :
 *
 *  - `damage` — ce que le joueur **encaisse**. C'est le levier qui décide si une
 *    erreur coûte un cœur ou la course entière, donc celui qui change vraiment
 *    la façon de jouer. Les dégâts restent plancher à un cœur (voir
 *    `damageTaken`), donc en facile ce sont les gros coups qui sont divisés —
 *    une charge de Lynel à deux cœurs en rend un — pas les égratignures ;
 *  - `hp` — ce que les bêtes **encaissent**. Il allonge ou raccourcit chaque
 *    combat, donc le nombre de cibles qu'on peut abattre dans le temps imparti.
 *    C'est le levier du *rythme* ;
 *  - `score` — ce que la victoire **vaut**. Sans lui, la difficulté facile
 *    donnerait mécaniquement les meilleurs scores, puisqu'on y tue plus vite ;
 *    avec lui, les trois se défendent. Les records restent de toute façon
 *    séparés par catégorie, donc ce multiplicateur ne sert pas à les rendre
 *    comparables — il sert à ce que le rang, lui, le soit.
 *
 * Ce qui n'est **pas** touché : la vitesse des bêtes, leurs portées, leurs temps
 * de préparation. Un ennemi plus rapide ou qui télégraphie moins n'est pas plus
 * difficile, il est moins lisible — et la lisibilité du combat est ce que ce jeu
 * a passé le plus de temps à régler.
 */
export const DIFFICULTIES = [
  { id: 'easy', damage: 0.5, hp: 0.7, score: 0.7 },
  { id: 'normal', damage: 1, hp: 1, score: 1 },
  { id: 'hard', damage: 1.6, hp: 1.5, score: 1.6 },
] as const

export type DifficultyId = (typeof DIFFICULTIES)[number]['id']
export type Difficulty = (typeof DIFFICULTIES)[number]

/** La difficulté par défaut, et celle que le panneau propose en premier. */
export const DEFAULT_DIFFICULTY: DifficultyId = 'normal'

export function difficultyById(id: DifficultyId): Difficulty {
  return DIFFICULTIES.find((entry) => entry.id === id) ?? DIFFICULTIES[1]
}

/* --- Durée ------------------------------------------------------------------ */

/**
 * Les quatre durées, en millisecondes de temps de jeu. `null` vaut « illimité ».
 *
 * Deux minutes est la durée d'origine, et elle reste la première : c'est un
 * aller, une boucle et un retour — assez pour choisir un itinéraire, trop peu
 * pour tout ramasser. Cinq et dix ouvrent la carte entière, y compris les îles
 * du large et le contrefort du nord-est, qui sont à plus d'une minute de course
 * du Sanctuaire et n'avaient donc aucune raison d'exister dans une course de
 * deux minutes.
 *
 * **Illimité n'est pas une durée, c'est l'absence de fin.** Le chronomètre y
 * compte à l'endroit au lieu de compter à rebours, et c'est le joueur qui
 * décide de s'arrêter, en revenant parler au maître. Le mode existe pour une
 * raison simple : la carte est un terrain d'entraînement, et un terrain
 * d'entraînement où l'on est toujours chronométré n'en est pas un.
 */
export const DURATIONS = [
  { id: '2min', ms: 120_000 },
  { id: '5min', ms: 300_000 },
  { id: '10min', ms: 600_000 },
  { id: 'endless', ms: null },
] as const

export type DurationId = (typeof DURATIONS)[number]['id']
export type Duration = (typeof DURATIONS)[number]

export const DEFAULT_DURATION: DurationId = '2min'

export function durationById(id: DurationId): Duration {
  return DURATIONS.find((entry) => entry.id === id) ?? DURATIONS[0]
}

/* --- Points ----------------------------------------------------------------- */

/**
 * Ce que vaut chaque espèce, en points.
 *
 * **Le compte de victimes seul ne veut rien dire**, et c'était le défaut de la
 * première version : un Octorok abattu de loin en deux coups et un Lynel argenté
 * mené au bout de dix-huit points de vie comptaient tous les deux pour un. La
 * meilleure façon de gagner était donc d'éviter tout ce qui était intéressant à
 * combattre — ce qui est la définition d'un mauvais score.
 *
 * Les valeurs suivent la **difficulté réelle** du combat et non les points de
 * vie : le Moblin en a une de plus que l'Octorok mais charge au corps-à-corps et
 * se pare, le Lynel a six attaques et trois phases, la Déchue en a dix et deux
 * formes. D'où l'échelle : un Lynel vaut sept Moblins, la Déchue vaut cinq
 * Lynels. Un joueur qui traverse la carte pour aller chercher le Creuset gagne
 * plus qu'un joueur qui ratisse la plage, et c'est tout ce qu'on demande à un
 * barème.
 *
 * Le compte de victimes **reste affiché**, à côté du score. Les deux ne disent
 * pas la même chose et on veut les deux : le score dit ce qu'on a osé, le compte
 * dit ce qu'on a abattu.
 */
export type ScoreTarget = EnemyKind | 'golden' | 'malenia'

export const KILL_POINTS: Record<ScoreTarget, number> = {
  octorok: 10,
  moblin: 15,
  lynel: 100,
  /*
    Le Lynel doré du contrefort du nord-est.

    Deux fois et demie l'argenté, pour trois raisons qui se cumulent : il a
    cinquante-quatre points de vie contre dix-huit, il ajoute un cœur à chacun de
    ses coups, et il est posté à cent quatre unités du Sanctuaire — c'est-à-dire
    à une minute de course aller. Aller le chercher est un pari sur le temps
    autant que sur la vie, et il doit payer comme tel.
  */
  golden: 250,
  malenia: 500,
}

/** Ce que vaut une victime, avant multiplicateur de difficulté. */
export function pointsFor(target: ScoreTarget): number {
  return KILL_POINTS[target] ?? 0
}

/* --- Rangs ------------------------------------------------------------------ */

/**
 * Les rangs, du plus haut au plus bas, en **points par minute**.
 *
 * Par minute, et c'est la seule façon qui tienne : un défi de dix minutes
 * rapporte mécaniquement cinq fois plus qu'un défi de deux, et des seuils
 * absolus auraient donné « Légende » à quiconque choisit la durée la plus
 * longue. Le rang mesure donc un **rythme**, ce qui le rend comparable d'une
 * catégorie à l'autre — alors que les records, eux, restent séparés.
 *
 * Le premier palier est à zéro et n'est donc jamais raté : on ne finit pas un
 * défi sur un échec, même à deux bêtes.
 *
 * Les libellés vivent dans `src/i18n/*.json`, sous `ui.challenge.ranks`.
 */
export const CHALLENGE_RANKS = [
  { id: 'legend', perMinute: 260 },
  { id: 'master', perMinute: 160 },
  { id: 'warrior', perMinute: 75 },
  { id: 'novice', perMinute: 0 },
] as const

export type ChallengeRank = (typeof CHALLENGE_RANKS)[number]['id']

/**
 * Durée minimale prise en compte dans le calcul du rythme.
 *
 * Elle n'existe que pour le mode illimité : sans elle, un défi arrêté au bout de
 * huit secondes sur un Lynel chanceux afficherait sept cent cinquante points par
 * minute, c'est-à-dire « Légende » pour un combat. Trente secondes est la durée
 * en dessous de laquelle un rythme ne veut rien dire.
 */
const MIN_RATE_MS = 30_000

/** Le rang atteint pour un score donné sur une durée donnée. */
export function rankFor(score: number, elapsedMs: number): ChallengeRank {
  const minutes = Math.max(elapsedMs, MIN_RATE_MS) / 60_000
  const rate = score / minutes
  return (CHALLENGE_RANKS.find((rank) => rate >= rank.perMinute) ?? CHALLENGE_RANKS[3]).id
}

/* --- Catégories de record --------------------------------------------------- */

/**
 * La clé d'une catégorie de score : une durée, une difficulté.
 *
 * Douze catégories, douze records. Les mélanger n'aurait aucun sens — dix
 * minutes en facile et deux minutes en difficile ne se comparent pas — et la
 * seule façon de garder les records honnêtes est de ne jamais les faire tenir
 * dans la même case.
 *
 * Une chaîne et non un objet imbriqué : c'est une clé de `Record`, elle est
 * sérialisable, et elle se lit telle quelle en débogage.
 */
export function categoryKey(duration: DurationId, difficulty: DifficultyId): string {
  return `${duration}/${difficulty}`
}

/* --- Chronologie ------------------------------------------------------------ */

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
 * Le seuil des dernières secondes, où l'affichage passe au rouge.
 *
 * Un seul seuil, et tardif. Un chronomètre qui s'affole pendant vingt secondes
 * n'alarme plus personne au bout de trois essais ; un qui change de couleur dix
 * secondes avant la fin fait lever les yeux. Dix et non cinq depuis qu'il existe
 * des courses de dix minutes : à ce terme-là, cinq secondes ne laissent plus le
 * temps d'atteindre quoi que ce soit.
 */
export const CHALLENGE_URGENT_MS = 10_000

/**
 * Délai de réapparition d'une bête, en millisecondes de temps de jeu.
 *
 * **Sans réapparition, la carte se vide**, et c'est le défaut qu'une course de
 * dix minutes a révélé : soixante-sept petites bêtes pour six cents secondes,
 * c'est une cible toutes les neuf secondes dans le meilleur des cas, et la
 * seconde moitié de la course se passe à chercher. Pire, un second défi lancé
 * dans la foulée commençait sur un monde déjà moissonné.
 *
 * Vingt-cinq secondes est réglé sur la traversée : il faut une quinzaine de
 * secondes pour aller d'un groupe au suivant, donc une bête abattue est revenue
 * quand on repasse — mais jamais assez vite pour qu'on puisse camper au même
 * endroit et l'abattre en boucle. C'est la valeur qui rend la carte tournante
 * sans la rendre gratuite.
 *
 * Les cinq Lynels et la Déchue, eux, ne reviennent **qu'au défi suivant** : ils
 * sont l'enjeu de la course, pas son fond de tableau, et les voir se relever
 * trente secondes après les avoir abattus retirerait tout le sel de la décision
 * d'aller les chercher.
 */
export const RESPAWN_MS = 25_000

/**
 * Le chronomètre, formaté `M:SS`.
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

/**
 * Le temps **écoulé**, formaté `M:SS`, pour le mode illimité.
 *
 * Arrondi à l'inférieur, à l'inverse du précédent, et les deux ont raison : un
 * compteur qui monte affiche la seconde qu'on vient de finir, un compteur qui
 * descend affiche celle qu'il reste à vivre. Les arrondir pareil ferait sauter
 * l'un des deux d'une seconde au démarrage.
 */
export function formatElapsed(elapsedMs: number) {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
