import { create } from 'zustand'
import { DEFAULT_DIFFICULTY, DEFAULT_DURATION } from '../config/challenge'
import {
  ANY,
  matchesFilter,
  sortEntries,
  standingOf,
  type ScoreDraft,
  type ScoreEntry,
  type ScoreFilter,
  type Standing,
} from '../scores/entry'
import { fetchCategory, submitScore } from '../scores/firestore'

/**
 * Le classement en ligne : ce qui est chargé, ce qui est affiché, ce qui vient
 * d'être envoyé.
 *
 * **Un store à part, et non trois champs de plus dans `useGameStore`.** Celui-ci
 * porte déjà la partie entière — deux mille lignes, et chaque panneau du jeu y a
 * son état. Le classement n'en fait pas partie : il survit à une nouvelle
 * partie, il ne se remet pas à zéro avec le `reset`, et rien de ce qu'il contient
 * n'a d'effet sur le monde. Le précédent est celui de `useQualityStore` et de
 * `useLocaleStore`, qui sont là pour la même raison.
 *
 * **Il ne met rien en pause, et c'est une conséquence de l'endroit d'où on
 * l'ouvre.** Les deux portes du tableau — la proposition du maître et l'écran de
 * résultat — sont déjà des panneaux modaux, donc la partie est déjà arrêtée
 * quand on y arrive. Lui faire toucher à `phase` aurait créé un second
 * propriétaire de la pause, et c'est exactement ce qui finit par rendre la main
 * au joueur pendant qu'un panneau est encore ouvert.
 */

/** Où en est le chargement d'une catégorie. */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Où en est l'envoi du score de la course qui vient de finir. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** La clé sous laquelle on retient le dernier pseudo saisi. */
const PSEUDO_KEY = 'z-project:pseudo'

/**
 * Le dernier pseudo, relu au démarrage.
 *
 * C'est la seule chose du classement qui soit persistée, et elle l'est pour une
 * raison de confort mesurable : relever un défi est un geste qu'on répète — la
 * carte existe pour ça — et retaper son nom à chaque course aurait fait du
 * formulaire un péage. Le champ reste modifiable : c'est une valeur par défaut,
 * pas une identité.
 *
 * Sous `try`, comme les deux autres lectures de `localStorage` du projet : en
 * navigation privée, l'accès **lève** au lieu de rendre `null`.
 */
function storedPseudo(): string {
  try {
    return localStorage.getItem(PSEUDO_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Ce qu'on retient d'un envoi réussi : la ligne écrite, et les deux places qu'elle prend. */
export interface SavedStanding {
  entry: ScoreEntry
  /** Le rang dans la catégorie, **toutes tenues et toutes armes confondues**. */
  overall: Standing
  /** Le rang parmi les seules courses faites avec la même tenue et la même arme. */
  loadout: Standing
}

interface ScoresState {
  /** Le tableau est-il ouvert. */
  open: boolean
  filter: ScoreFilter
  /**
   * Les lignes de la catégorie chargée — **avant** les tamis de tenue et d'arme.
   *
   * C'est ce qui permet de changer de tenue dans les sélecteurs sans repasser
   * par le réseau, et c'est pour ça qu'elles sont gardées brutes ici plutôt que
   * filtrées à l'arrivée.
   */
  entries: ScoreEntry[]
  status: LoadStatus
  /** La catégorie que `entries` contient, pour ne pas la recharger deux fois. */
  loaded: string | null
  /** La ligne du joueur, à surligner dans le tableau. */
  mine: string | null

  pseudo: string
  saveStatus: SaveStatus
  saved: SavedStanding | null

  openBoard: (filter?: Partial<ScoreFilter>) => void
  closeBoard: () => void
  setFilter: (patch: Partial<ScoreFilter>) => void
  reload: () => Promise<void>
  setPseudo: (pseudo: string) => void
  save: (draft: ScoreDraft) => Promise<void>
  /** Oublie l'envoi précédent. Appelé quand un nouveau défi commence. */
  forgetSave: () => void
}

/** La catégorie ouverte par défaut : celle du panneau du maître au premier abord. */
const INITIAL_FILTER: ScoreFilter = {
  duration: DEFAULT_DURATION,
  difficulty: DEFAULT_DIFFICULTY,
  outfit: ANY,
  weapon: ANY,
}

export const useScoresStore = create<ScoresState>((set, get) => ({
  open: false,
  filter: INITIAL_FILTER,
  entries: [],
  status: 'idle',
  loaded: null,
  mine: null,
  pseudo: storedPseudo(),
  saveStatus: 'idle',
  saved: null,

  /**
   * Ouvre le tableau, en le posant d'emblée sur la bonne case.
   *
   * Le filtre est **poussé par l'appelant** : depuis l'écran de résultat, c'est
   * la catégorie qu'on vient de courir ; depuis la proposition du maître, celle
   * qu'on s'apprête à courir. Un tableau qui s'ouvrirait toujours sur « 2 min ·
   * Normal » aurait demandé deux clics pour montrer ce que le joueur regardait
   * déjà.
   */
  openBoard: (patch) => {
    set((state) => ({ open: true, filter: { ...state.filter, ...patch } }))
    void get().reload()
  },

  closeBoard: () => set({ open: false }),

  /**
   * Change un tamis, et ne recharge que si la **catégorie** a bougé.
   *
   * Tenue et arme se filtrent en mémoire — voir `scores/firestore.ts`, qui
   * explique pourquoi la lecture ne filtre que sur la catégorie. `reload` porte
   * la garde, ici on l'appelle sans se demander lequel des quatre a changé.
   */
  setFilter: (patch) => {
    set((state) => ({ filter: { ...state.filter, ...patch } }))
    void get().reload()
  },

  /**
   * Charge la catégorie courante, si elle n'est pas déjà là.
   *
   * L'écriture du résultat vérifie que **la catégorie demandée est toujours
   * celle qu'on affiche** : deux clics rapides sur les sélecteurs lancent deux
   * lectures, et rien ne garantit qu'elles reviennent dans l'ordre. Sans cette
   * garde, la plus lente des deux écrase la plus récente et le tableau montre
   * une catégorie que plus aucun sélecteur ne désigne.
   */
  reload: async () => {
    const { duration, difficulty } = get().filter
    const key = `${duration}/${difficulty}`
    if (get().loaded === key && get().status === 'ready') return

    set({ status: 'loading' })
    try {
      const entries = await fetchCategory(duration, difficulty)
      const current = get().filter
      if (current.duration !== duration || current.difficulty !== difficulty) return
      set({ entries, status: 'ready', loaded: key })
    } catch {
      const current = get().filter
      if (current.duration !== duration || current.difficulty !== difficulty) return
      // Le message n'est pas remonté : le réseau, les règles de sécurité et une
      // configuration absente échouent pour des raisons que le joueur ne peut
      // pas corriger, et trois libellés pour une seule action possible — réessayer
      // — n'auraient rien ajouté. La console garde la trace, elle.
      set({ entries: [], status: 'error', loaded: null })
    }
  },

  setPseudo: (pseudo) => {
    set({ pseudo })
    try {
      localStorage.setItem(PSEUDO_KEY, pseudo)
    } catch {
      // Non retenu d'une session à l'autre, mais utilisable maintenant.
    }
  },

  /**
   * Envoie le score, puis le classe.
   *
   * La lecture qui suit l'écriture est **refaite** et non déduite de ce qu'on
   * avait en mémoire : entre la fin d'une course de dix minutes et le clic sur
   * « enregistrer », d'autres lignes ont pu arriver, et annoncer une place
   * calculée sur un tableau périmé est le genre de chiffre qu'on ne peut pas
   * rattraper — le joueur l'a lu.
   *
   * L'échec de cette relecture n'annule pas l'envoi : le score **est** écrit. On
   * retombe alors sur le lot qu'on avait, qui donne une place approchée, plutôt
   * que de dire au joueur que son enregistrement a échoué alors qu'il a réussi.
   */
  save: async (draft) => {
    if (get().saveStatus === 'saving' || get().saveStatus === 'saved') return
    set({ saveStatus: 'saving' })

    let entry: ScoreEntry
    try {
      entry = await submitScore(draft)
    } catch {
      set({ saveStatus: 'error' })
      return
    }

    const key = `${entry.duration}/${entry.difficulty}`
    let around: ScoreEntry[]
    try {
      around = await fetchCategory(entry.duration, entry.difficulty)
    } catch {
      around = get().loaded === key ? [...get().entries, entry] : [entry]
    }

    const sameLoadout = around.filter((other) =>
      matchesFilter(other, {
        duration: entry.duration,
        difficulty: entry.difficulty,
        outfit: entry.outfit,
        weapon: entry.weapon,
      }),
    )

    set({
      saveStatus: 'saved',
      saved: {
        entry,
        overall: standingOf(entry, around),
        loadout: standingOf(entry, sameLoadout),
      },
      // Le tableau profite de la lecture qu'on vient de faire : l'ouvrir dans la
      // foulée ne redemandera rien.
      entries: around,
      status: 'ready',
      loaded: key,
      mine: entry.id,
      filter: {
        ...get().filter,
        duration: entry.duration,
        difficulty: entry.difficulty,
      },
    })
  },

  forgetSave: () => set({ saveStatus: 'idle', saved: null, mine: null }),
}))

/**
 * Les lignes à afficher : la catégorie chargée, tamisée et triée.
 *
 * Hors du store et non un champ de plus : c'est une **dérivée** de `entries` et
 * de `filter`, et la stocker aurait créé deux sources pour une seule vérité —
 * celle qu'on oublie de mettre à jour le jour où un troisième tamis apparaît.
 */
export function visibleScores(entries: readonly ScoreEntry[], filter: ScoreFilter): ScoreEntry[] {
  return sortEntries(entries.filter((entry) => matchesFilter(entry, filter)))
}

// Exposé en développement pour ouvrir le tableau sur des lignes de test, sans
// avoir à courir un défi ni à écrire dans la base. Même crochet que `__store`.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__scores = useScoresStore
}
