import type { EnemyKind, EnemyState } from '../types/game'

/**
 * Position des ennemis vivants, partagée **hors de React**.
 *
 * Même raison que `playerTransform` : la minimap la lit à chaque frame dans sa
 * propre boucle. Passer par un state React re-rendrait tout le HUD soixante
 * fois par seconde pour déplacer quelques points.
 *
 * Chaque ennemi s'inscrit à son montage et se retire à sa mort.
 */
export interface EnemyMarkerState {
  kind: EnemyKind
  x: number
  z: number
  /** État d'IA courant, utile au diagnostic et à un futur indicateur d'alerte. */
  state: EnemyState
  /** Points de vie restants — servira à une barre de vie au-dessus de l'ennemi. */
  hp: number
}

export const enemyRegistry = new Map<string, EnemyMarkerState>()

// Exposé en développement pour inspecter les ennemis vivants depuis la console
// ou un test navigateur.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__enemies = () =>
    [...enemyRegistry.entries()].map(([id, state]) => ({ id, ...state }))
}
