import type { EnemyKind, EnemyState } from '../types/game'

/**
 * État des ennemis vivants, partagé **hors de React**.
 *
 * Même raison que `playerTransform` : la minimap et le calque de combat le
 * lisent à chaque frame dans leur propre boucle. Passer par un state React
 * re-rendrait tout le HUD soixante fois par seconde pour déplacer des points.
 *
 * Chaque ennemi s'inscrit à son montage et se retire à sa mort.
 */
export interface EnemyMarkerState {
  kind: EnemyKind
  x: number
  /** Hauteur monde du centre de la capsule — la barre de vie se pose au-dessus. */
  y: number
  z: number
  /** État d'IA courant : décide si l'ennemi est « engagé », donc s'il affiche sa vie. */
  state: EnemyState
  hp: number
  maxHp: number
  /** Timestamp du dernier coup encaissé : garde la barre visible après un coup. */
  lastHitAt: number
}

export const enemyRegistry = new Map<string, EnemyMarkerState>()

/**
 * Met à jour une entrée **en place**.
 *
 * Recréer l'objet à chaque frame allouerait 26 objets par frame pour rien —
 * exactement le genre de déchet qui finit par se voir sur les pauses GC.
 */
export function updateEnemyMarker(
  id: string,
  x: number,
  y: number,
  z: number,
  state: EnemyState,
  hp: number,
) {
  const marker = enemyRegistry.get(id)
  if (!marker) return
  marker.x = x
  marker.y = y
  marker.z = z
  marker.state = state
  marker.hp = hp
}

// Exposé en développement pour inspecter les ennemis vivants depuis la console
// ou un test navigateur.
if (import.meta.env.DEV) {
  const hooks = window as unknown as Record<string, unknown>
  hooks.__enemies = () =>
    [...enemyRegistry.entries()].map(([id, state]) => ({ id, ...state }))
  // Le registre lui-même, pour pouvoir injecter un ennemi factice depuis un
  // test navigateur et vérifier le calque de combat sans avoir à jouer.
  hooks.__enemyRegistry = enemyRegistry
}
