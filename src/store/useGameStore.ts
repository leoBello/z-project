import { create } from 'zustand'
import type { GamePhase } from '../types/game'

/** Nombre de cœurs de départ (façon Zelda : 3 cœurs). */
export const MAX_HEARTS = 3
/** Durée d'invincibilité après un coup reçu, en millisecondes. */
export const INVULNERABILITY_MS = 1000

export interface GameState {
  phase: GamePhase
  hearts: number
  maxHearts: number
  /** Timestamp (performance.now) du dernier dégât subi. */
  lastHitAt: number
  /** Compteur d'ennemis tués — servira de base à un futur système de score/quêtes. */
  kills: number

  /** Inflige des dégâts au joueur ; ignoré pendant l'invincibilité. */
  damagePlayer: (amount?: number) => void
  /** Vrai tant que le joueur est en i-frames (sert au clignotement + hitbox). */
  isInvulnerable: () => boolean
  registerKill: () => void
  /** Relance une partie depuis zéro. */
  reset: () => void
}

const initialState = {
  phase: 'playing' as GamePhase,
  hearts: MAX_HEARTS,
  maxHearts: MAX_HEARTS,
  lastHitAt: -Infinity,
  kills: 0,
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

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

  registerKill: () => set((s) => ({ kills: s.kills + 1 })),

  reset: () => set({ ...initialState }),
}))
