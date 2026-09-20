import { firebaseApp, isConfigured } from '../firebase/app'
import {
  ANY,
  FILTER_DIFFICULTIES,
  FILTER_DURATIONS,
  FILTER_OUTFITS,
  FILTER_WEAPONS,
  cleanPseudo,
  scoreCategory,
  type ScoreDraft,
  type ScoreEntry,
} from './entry'

/**
 * Les deux seuls échanges du classement avec le réseau : **lire une catégorie**,
 * et **y ajouter une ligne**.
 *
 * Rien d'autre ne sort d'ici. Le tri, le rang et les tamis de tenue et d'arme
 * sont faits en mémoire par `scores/entry.ts`, et ce partage est le sujet du
 * fichier :
 *
 * **Une seule requête, sans index à créer.** La lecture filtre sur un seul
 * champ — la catégorie — et rien d'autre. Firestore indexe automatiquement les
 * champs pris isolément, donc cette requête fonctionne sur un projet vierge, le
 * jour où on clone le dépôt, sans passer par la console. Y ajouter un
 * `orderBy('score')` aurait été plus élégant et aurait exigé un index composite,
 * c'est-à-dire une manipulation manuelle sans laquelle le tableau reste vide en
 * affichant une erreur que personne ne sait lire.
 *
 * Le tri en mémoire n'est pas un pis-aller : il est ce qui rend les filtres de
 * tenue et d'arme instantanés. Une catégorie tient dans `PAGE`, on la charge une
 * fois, et les huit tenues et six armes se parcourent ensuite sans un octet de
 * plus.
 *
 * **Le SDK arrive par `import()`.** Voir `firebase/app.ts` : Firestore ne doit
 * pas peser sur le démarrage d'un jeu que la plupart des visiteurs quitteront
 * avant d'avoir vu l'Outremonde.
 */

/** La collection. Au singulier de ce qu'elle contient : une ligne, un défi couru. */
const COLLECTION = 'challenge-scores'

/**
 * Nombre maximal de lignes lues pour une catégorie.
 *
 * C'est un garde-fou de coût, pas une pagination : au-delà, les lignes
 * excédentaires ne sont pas les moins bonnes mais les arbitraires, puisque la
 * requête ne trie pas. Deux cents courses dans une même case de douze est un
 * volume que ce jeu n'atteindra pas, et le jour où il l'atteint, c'est l'index
 * composite et un `orderBy('score', 'desc')` qu'il faudra — pas un plus grand
 * nombre ici.
 */
const PAGE = 200

/* --- Le document ------------------------------------------------------------- */

/**
 * La ligne telle qu'elle est écrite, et telle qu'elle est relue.
 *
 * Séparée de `ScoreEntry` parce que les deux ne coïncident pas : la base porte
 * une `category` dénormalisée dont l'application n'a que faire, et ses champs
 * d'énumération y sont de simples chaînes — ce qui revient du réseau n'a aucune
 * raison d'appartenir à l'un de nos types, et le déclarer ainsi aurait fait
 * mentir le compilateur sur la seule frontière du jeu qu'il ne contrôle pas.
 */
interface ScoreDoc {
  pseudo: string
  score: number
  kills: number
  ranMs: number
  duration: string
  difficulty: string
  outfit: string
  weapon: string
  category: string
  at: number
}

/**
 * La valeur si elle fait partie des attendues, `undefined` sinon.
 *
 * Écrit à la main plutôt que casté : un `as` aurait fait entrer dans les types
 * du jeu une chaîne venue du réseau, et c'est précisément ce qu'on ne veut pas
 * sur la seule frontière que le compilateur ne surveille pas.
 */
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.find((candidate) => candidate === value)
}

/** Un entier positif, ou zéro. Les `NaN` et les `Infinity` d'un document forgé finissent ici. */
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

/**
 * Relit un document, en se méfiant de tout.
 *
 * Le classement est **ouvert en écriture** — voir `firestore.rules` : il n'y a
 * pas de comptes, donc pas d'auteur à qui restreindre l'accès, et les règles ne
 * peuvent valider que la forme. Ce qui revient d'ici n'est donc pas une donnée
 * de confiance mais une saisie de provenance inconnue, au même titre qu'un champ
 * de formulaire. Une ligne malformée est écartée plutôt que de faire tomber le
 * tableau entier, et le pseudo repasse par `cleanPseudo` à la lecture, pas
 * seulement à l'écriture.
 *
 * Elle rend `null` et non une ligne par défaut : un score inventé pour réparer
 * un document cassé irait se classer parmi les vrais.
 */
function readDoc(id: string, raw: unknown): ScoreEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const doc = raw as Partial<ScoreDoc>

  if (typeof doc.pseudo !== 'string') return null
  const pseudo = cleanPseudo(doc.pseudo)
  if (!pseudo) return null

  const duration = oneOf(doc.duration, FILTER_DURATIONS)
  const difficulty = oneOf(doc.difficulty, FILTER_DIFFICULTIES)
  const outfit = oneOf(doc.outfit, FILTER_OUTFITS)
  const weapon = oneOf(doc.weapon, FILTER_WEAPONS)
  if (!duration || !difficulty || !outfit || !weapon) return null
  // `FILTER_*` portent aussi la valeur « toutes », qui n'est pas une tenue : une
  // ligne qui la déclarerait serait un document forgé, pas une course.
  if (outfit === ANY || weapon === ANY) return null

  return {
    id,
    pseudo,
    score: count(doc.score),
    kills: count(doc.kills),
    ranMs: count(doc.ranMs),
    duration,
    difficulty,
    outfit,
    weapon,
    at: count(doc.at),
  }
}

/* --- Les deux appels --------------------------------------------------------- */

/** Levée quand le `.env` ne porte pas de projet : l'interface en fait un silence. */
export class ScoresUnavailable extends Error {
  constructor() {
    super("Firebase n'est pas configuré")
    this.name = 'ScoresUnavailable'
  }
}

/** Vrai si le classement peut fonctionner du tout. Voir `firebase/app.ts`. */
export { isConfigured as scoresAvailable }

/**
 * Toutes les lignes d'une catégorie, dans l'ordre où Firestore les rend.
 *
 * Non triées : c'est `sortEntries` qui s'en charge, et le faire ici aurait
 * laissé croire à l'appelant qu'il peut se fier à l'ordre reçu.
 */
export async function fetchCategory(
  duration: ScoreEntry['duration'],
  difficulty: ScoreEntry['difficulty'],
): Promise<ScoreEntry[]> {
  if (!isConfigured()) throw new ScoresUnavailable()

  const [app, firestore] = await Promise.all([firebaseApp(), import('firebase/firestore')])
  const { collection, getDocs, getFirestore, limit, query, where } = firestore

  const snapshot = await getDocs(
    query(
      collection(getFirestore(app), COLLECTION),
      where('category', '==', scoreCategory(duration, difficulty)),
      limit(PAGE),
    ),
  )

  const entries: ScoreEntry[] = []
  for (const doc of snapshot.docs) {
    const entry = readDoc(doc.id, doc.data())
    if (entry) entries.push(entry)
  }
  return entries
}

/**
 * Écrit une ligne et rend celle qui a été écrite, avec son identifiant.
 *
 * La date est posée **par le client**, en millisecondes, et non par
 * `serverTimestamp()`. C'est le choix le moins évident du fichier, et il tient à
 * ce que la date sert ici : elle départage les ex æquo et s'affiche dans une
 * colonne. Un horodatage serveur revient `null` dans l'instantané local qui suit
 * immédiatement l'écriture — le temps d'un aller-retour — donc le joueur verrait
 * sa propre ligne sans date au seul moment où il la cherche. Une horloge de
 * client mal réglée déplace une ligne dans un départage d'égalité ; un `null`
 * casse l'affichage pour tout le monde.
 */
export async function submitScore(draft: ScoreDraft): Promise<ScoreEntry> {
  if (!isConfigured()) throw new ScoresUnavailable()

  const pseudo = cleanPseudo(draft.pseudo)
  if (!pseudo) throw new Error('Pseudo vide')

  const [app, firestore] = await Promise.all([firebaseApp(), import('firebase/firestore')])
  const { addDoc, collection, getFirestore } = firestore

  const doc: ScoreDoc = {
    pseudo,
    score: Math.max(0, Math.round(draft.score)),
    kills: Math.max(0, Math.round(draft.kills)),
    ranMs: Math.max(0, Math.round(draft.ranMs)),
    duration: draft.duration,
    difficulty: draft.difficulty,
    outfit: draft.outfit,
    weapon: draft.weapon,
    category: scoreCategory(draft.duration, draft.difficulty),
    at: draft.at,
  }

  const written = await addDoc(collection(getFirestore(app), COLLECTION), doc)
  return { ...draft, pseudo, id: written.id }
}
