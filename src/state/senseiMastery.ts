import { categoryKey, DIFFICULTIES, DURATIONS } from '../config/challenge'

/**
 * Les catégories déjà maîtrisées, et leur survie d'une visite à l'autre.
 *
 * **Pourquoi un stockage à part plutôt que les records du store.**
 * `challengeBests` ne vit qu'en mémoire : `useGameStore` n'a pas de middleware
 * de persistance, et lui en ajouter un aurait fait franchir le pas à *tout* le
 * store — l'inventaire, la position, la phase de partie — c'est-à-dire changer
 * la nature du jeu, qui est une partie par visite. Or la forme du maître est la
 * seule chose de l'Outremonde qui doive traverser les visites : elle récompense
 * ce qu'on a accompli, pas où on en est.
 *
 * On ne garde donc que **les clés de catégorie**, pas les scores. Le maître
 * n'affiche aucun chiffre : il lui suffit de savoir combien de cases sont
 * cochées, et une liste de douze chaînes au maximum est ce qu'il y a de plus
 * petit à écrire, de plus simple à valider et de plus anodin à perdre.
 *
 * Les accès à `localStorage` sont sous `try` parce qu'ils **lèvent** — navigation
 * privée, stockage désactivé, quota plein — et non parce qu'ils renverraient
 * `null`. C'est la discipline de `useLocaleStore` et `useQualityStore`.
 */

export const STORAGE_KEY = 'z-project:sensei-mastery'

/**
 * Les douze clés de catégorie réellement existantes.
 *
 * Elle sert à **filtrer** ce qui revient du stockage. Sans elle, un fichier
 * trafiqué à la main — ou une sauvegarde d'une version où les durées n'étaient
 * pas les mêmes — ferait compter des cases qui n'existent pas, et le maître
 * prendrait une forme que personne n'a gagnée. Le compte est plafonné par
 * construction plutôt que par un `Math.min` posé plus loin.
 */
const VALID_KEYS: ReadonlySet<string> = new Set(
  DURATIONS.flatMap((duration) =>
    DIFFICULTIES.map((difficulty) => categoryKey(duration.id, difficulty.id)),
  ),
)

/** Nombre total de catégories, donc le compte maximal atteignable. */
export const CATEGORY_COUNT = VALID_KEYS.size

/**
 * Ne garde que des clés connues, sans doublon, dans l'ordre d'arrivée.
 *
 * Pure et exportée : c'est elle qui porte la règle, et elle se teste sans
 * toucher au stockage.
 */
export function sanitizeMastery(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (typeof entry === 'string' && VALID_KEYS.has(entry)) seen.add(entry)
  }
  return [...seen]
}

/** La liste augmentée d'une clé, ou la liste telle quelle si elle y est déjà. */
export function withMastered(list: readonly string[], key: string): string[] {
  if (!VALID_KEYS.has(key) || list.includes(key)) return [...list]
  return [...list, key]
}

/** Ce qui est en mémoire du navigateur, nettoyé. Jamais d'exception. */
export function readMastery(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? sanitizeMastery(JSON.parse(stored)) : []
  } catch {
    // Stockage indisponible ou contenu illisible : on repart de zéro. Le maître
    // reprend sa forme de départ, ce qui est faux mais jouable — là où laisser
    // remonter l'exception casserait le chargement de la carte entière.
    return []
  }
}

/** Écrit la liste. L'échec est silencieux : le palier vaut pour cette visite. */
export function writeMastery(list: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Non persisté, mais appliqué : la forme change quand même.
  }
}
