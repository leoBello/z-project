import { DIFFICULTIES, DURATIONS, type DifficultyId, type DurationId } from '../config/challenge'
import type { OutfitId, WeaponId } from '../config/items'

/**
 * Ce qu'est une ligne de classement, et ce qui décide de sa place.
 *
 * Tout ce fichier est **pur** : pas un appel réseau, pas un import de Firebase.
 * C'est délibéré et c'est ce qui rend la mécanique vérifiable — le rang d'un
 * score, la validité d'un pseudo et le filtrage du tableau sont les trois
 * choses qui peuvent être fausses sans qu'aucune erreur ne remonte, donc les
 * trois qui doivent pouvoir être testées sans base de données. L'accès à
 * Firestore vit à côté, dans `scores/firestore.ts`, et n'a pas une ligne de
 * décision.
 */

/* --- La ligne ---------------------------------------------------------------- */

/**
 * Un score enregistré, tel qu'il revient de la base.
 *
 * `outfit` et `weapon` sont pris **à la fin de la course** et figés là : le
 * joueur peut changer de tenue entre deux défis, et un classement qui relirait
 * l'équipement courant réécrirait le passé à chaque fois qu'on ouvre un coffre.
 *
 * `ranMs` est la durée **réellement courue**, pas celle de la catégorie. Elle ne
 * sert à rien pour le classement — c'est le score qui classe — mais elle est la
 * seule chose qui distingue deux lignes d'un mode illimité, où la durée est le
 * choix du joueur et non la règle.
 */
export interface ScoreEntry {
  id: string
  pseudo: string
  score: number
  kills: number
  ranMs: number
  duration: DurationId
  difficulty: DifficultyId
  outfit: OutfitId
  weapon: WeaponId
  /** Date d'enregistrement, en millisecondes depuis l'époque. */
  at: number
}

/** Une ligne avant qu'elle n'ait un identifiant : ce que le jeu envoie. */
export type ScoreDraft = Omit<ScoreEntry, 'id'>

/* --- Le pseudo --------------------------------------------------------------- */

/**
 * Longueur maximale d'un pseudo, en caractères.
 *
 * Seize, et le chiffre vient de la colonne plutôt que de la base : le tableau
 * tient huit colonnes de front, et un pseudo plus long les ferait toutes
 * déborder sur téléphone pour le confort d'un seul joueur. La coupe se fait à
 * la saisie et non à l'affichage — un nom tronqué par des points de suspension
 * est un nom que son porteur ne reconnaît pas.
 */
export const PSEUDO_MAX = 16

/**
 * Nettoie un pseudo saisi, sans jamais le refuser.
 *
 * Trois passes, et chacune répare une saisie réelle plutôt qu'une saisie
 * imaginée : les caractères de contrôle (un copier-coller depuis un terminal),
 * les espaces en rafale (un nom « e s p a c é » qui casserait l'alignement de
 * la colonne), et les espaces de bord.
 *
 * **Les doublons sont autorisés**, et c'est une décision, pas un oubli : il n'y
 * a pas de compte, donc pas de propriétaire d'un nom. Deux « Sangoku » au
 * tableau sont deux courses, et c'est la seule lecture honnête qu'on puisse en
 * donner. Vouloir l'unicité aurait demandé d'identifier les joueurs, c'est-à-
 * dire de leur demander bien plus que six lettres.
 */
export function cleanPseudo(raw: string): string {
  return (
    raw
      // Des caractères de contrôle dans une expression régulière, et c'est tout
      // le sujet de la ligne : ils sont ce qu'on retire.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, PSEUDO_MAX)
  )
}

/** Un pseudo est valide dès qu'il reste quelque chose après le nettoyage. */
export function isPseudoValid(raw: string): boolean {
  return cleanPseudo(raw).length > 0
}

/* --- La catégorie ------------------------------------------------------------ */

/**
 * La clé de catégorie **stockée dans le document**, et pourquoi elle y est en
 * double.
 *
 * Elle répète `duration` et `difficulty`, qui sont déjà deux champs de la ligne.
 * C'est une dénormalisation assumée : Firestore indexe automatiquement les
 * champs pris un par un, mais pas leurs combinaisons — filtrer sur deux champs à
 * la fois aurait exigé un index composite créé à la main dans la console, et un
 * classement qui ne fonctionne qu'après une manipulation d'administration est un
 * classement cassé pour quiconque clone le dépôt.
 *
 * Elle reprend volontairement le format de `categoryKey` des records locaux :
 * les deux désignent la même chose, et deux formats pour une même notion
 * finissent toujours par se croiser.
 */
export function scoreCategory(duration: DurationId, difficulty: DifficultyId): string {
  return `${duration}/${difficulty}`
}

/* --- Le filtre du tableau ---------------------------------------------------- */

/** La valeur « toutes tenues » / « toutes armes » des sélecteurs du tableau. */
export const ANY = 'all'
export type Any = typeof ANY

/**
 * Ce que le tableau montre.
 *
 * La durée et la difficulté désignent **la catégorie**, donc ce qui est chargé
 * depuis la base ; la tenue et l'arme ne sont que des tamis posés par-dessus,
 * appliqués en mémoire. La distinction n'est pas cosmétique : elle est ce qui
 * permet de passer de « toutes tenues » à « Tenue du Clan » sans une requête, et
 * donc de comparer d'un clic deux façons de jouer la même minute.
 */
export interface ScoreFilter {
  duration: DurationId
  difficulty: DifficultyId
  outfit: OutfitId | Any
  weapon: WeaponId | Any
}

/** Vrai si la ligne passe les tamis de tenue et d'arme. */
export function matchesFilter(entry: ScoreEntry, filter: ScoreFilter): boolean {
  if (filter.outfit !== ANY && entry.outfit !== filter.outfit) return false
  if (filter.weapon !== ANY && entry.weapon !== filter.weapon) return false
  return true
}

/* --- Le classement ----------------------------------------------------------- */

/**
 * Vrai si `a` passe devant `b`.
 *
 * Le score d'abord, et **la date ensuite, à la plus ancienne l'avantage**. Ce
 * départage a une conséquence qu'il faut vouloir : celui qui égale un score ne
 * prend pas la place de celui qui l'a posé le premier. C'est la règle des
 * tableaux d'arcade, et c'est la seule qui ne punisse pas d'avoir joué tôt.
 */
function ahead(a: ScoreEntry, b: ScoreEntry): boolean {
  if (a.score !== b.score) return a.score > b.score
  return a.at < b.at
}

/** Les lignes triées pour l'affichage : meilleur score en tête. */
export function sortEntries(entries: readonly ScoreEntry[]): ScoreEntry[] {
  return [...entries].sort((a, b) => (ahead(a, b) ? -1 : ahead(b, a) ? 1 : 0))
}

/** Une place dans un classement : le rang, et sur combien. */
export interface Standing {
  rank: number
  total: number
}

/**
 * La place d'une ligne parmi celles qu'on lui oppose.
 *
 * Comptée et non cherchée par index : la ligne qu'on classe peut ne pas figurer
 * dans le tableau qu'on lui compare — c'est exactement le cas au moment de
 * l'enregistrement, où le score vient d'être écrit et où la lecture qui sert à
 * le classer date d'avant. Un `indexOf` aurait rendu -1 dans ce cas précis,
 * c'est-à-dire au seul moment où le chiffre est montré au joueur.
 *
 * La ligne elle-même est retirée du lot avant le compte : sans ça, un score
 * relu après coup — le tableau rouvert plus tard — se compterait comme son
 * propre concurrent et gagnerait une place sur deux.
 */
export function standingOf(entry: ScoreEntry, among: readonly ScoreEntry[]): Standing {
  const others = among.filter((other) => other.id !== entry.id)
  const better = others.filter((other) => ahead(other, entry)).length
  return { rank: better + 1, total: others.length + 1 }
}

/* --- Les listes des sélecteurs ----------------------------------------------- */

/** Les durées, dans l'ordre du panneau du maître. */
export const FILTER_DURATIONS = DURATIONS.map((entry) => entry.id)

/** Les difficultés, dans le même ordre qu'ailleurs. */
export const FILTER_DIFFICULTIES = DIFFICULTIES.map((entry) => entry.id)

/**
 * Les tenues proposées au filtre, « toutes » en tête.
 *
 * Écrites à la main et non dérivées de la table des objets : la première n'a
 * **pas d'objet** — c'est la silhouette de départ, celle qu'on est quand on n'a
 * rien trouvé — et une liste construite depuis `ITEMS` l'aurait donc oubliée,
 * en laissant hors du tableau tous les scores faits avant le premier coffre.
 */
export const FILTER_OUTFITS: readonly (OutfitId | Any)[] = [
  ANY,
  'luffy',
  'zoro',
  'madara',
  'pain',
  'demon',
  'vader',
  'meruem',
  'kuroro',
]

/** Les armes proposées au filtre. Même remarque : `fists` et `sword` n'ont pas d'objet. */
export const FILTER_WEAPONS: readonly (WeaponId | Any)[] = [
  ANY,
  'fists',
  'sword',
  'katana',
  'cursed',
  'saber',
]
