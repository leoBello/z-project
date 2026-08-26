import { create } from 'zustand'
import type { GamePhase, LandmarkId } from '../types/game'

/**
 * Nombre de cœurs de départ.
 *
 * Zelda commence à trois cœurs, mais son héros dispose d'un bouclier, d'une
 * roulade et d'une caméra libre pour voir venir les coups. Ici on n'a que le
 * déplacement : à trois cœurs, la carte n'était pas traversable, et une partie
 * pouvait se terminer sans que le joueur ait bougé. Cinq cœurs laissent le
 * temps d'apprendre les deux espèces d'ennemis.
 */
export const MAX_HEARTS = 5
/** Durée d'invincibilité après un coup reçu, en millisecondes. */
export const INVULNERABILITY_MS = 1100

export interface GameState {
  phase: GamePhase
  hearts: number
  maxHearts: number
  /** Timestamp (performance.now) du dernier dégât subi. */
  lastHitAt: number
  /** Ennemis tués sur la partie en cours. */
  kills: number
  /**
   * Lieux déjà trouvés, dans l'ordre de découverte. Le dernier élément pilote
   * le bandeau du HUD ; l'ordre est donc porteur d'information, pas décoratif.
   */
  discovered: LandmarkId[]
  /**
   * Identifiant de la partie. Sert de `key` React sur le joueur et les ennemis :
   * l'incrémenter démonte et remonte tout le monde, ce qui remet positions,
   * points de vie et machines à états à zéro sans logique de réinitialisation
   * à écrire dans chaque composant.
   */
  runId: number

  /** Inflige des dégâts au joueur ; ignoré pendant l'invincibilité. */
  damagePlayer: (amount?: number) => void
  /** Vrai tant que le joueur est en i-frames (clignotement + immunité). */
  isInvulnerable: () => boolean
  /** Rend des cœurs au joueur. Ignoré si la barre est déjà pleine. */
  healPlayer: (amount?: number) => boolean
  registerKill: () => void
  /** Marque un lieu comme trouvé. Sans effet s'il l'était déjà. */
  discoverLandmark: (id: LandmarkId) => void
  /** Relance une partie depuis zéro. */
  reset: () => void
}

const initialState = {
  phase: 'playing' as GamePhase,
  hearts: MAX_HEARTS,
  maxHearts: MAX_HEARTS,
  lastHitAt: -Infinity,
  kills: 0,
  discovered: [] as LandmarkId[],
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,
  runId: 0,

  damagePlayer: (amount = 1) => {
    const { phase, hearts, isInvulnerable } = get()
    if (phase !== 'playing' || isInvulnerable()) return

    const next = Math.max(0, hearts - amount)
    set({
      hearts: next,
      lastHitAt: performance.now(),
      phase: next === 0 ? 'gameover' : 'playing',
    })
  },

  isInvulnerable: () => performance.now() - get().lastHitAt < INVULNERABILITY_MS,

  healPlayer: (amount = 1) => {
    const { phase, hearts, maxHearts } = get()
    // Le booléen de retour évite au ramassage de refaire le test de son côté :
    // c'est le store qui sait si le soin a servi, donc si le cœur est consommé.
    if (phase !== 'playing' || hearts >= maxHearts) return false
    set({ hearts: Math.min(maxHearts, hearts + amount) })
    return true
  },

  registerKill: () => set((state) => ({ kills: state.kills + 1 })),

  discoverLandmark: (id) =>
    set((state) =>
      state.discovered.includes(id)
        ? state
        : { discovered: [...state.discovered, id] },
    ),

  // `discovered` est réécrit explicitement : `initialState` est un objet unique
  // partagé par toutes les parties, et en réutiliser le tableau ferait qu'une
  // mutation en place fuiterait d'une partie à l'autre.
  reset: () =>
    set((state) => ({ ...initialState, discovered: [], runId: state.runId + 1 })),
}))

// Exposé en développement pour piloter et inspecter une partie depuis la
// console ou un test navigateur.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__store = useGameStore
}
