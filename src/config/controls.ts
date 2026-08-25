import type { KeyboardControlsEntry } from '@react-three/drei'

/** Actions du joueur. Sert de clé typée pour `useKeyboardControls`. */
export type Control =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'jump'
  | 'attack'

/**
 * Mapping clavier.
 *
 * drei résout une touche via `keyMap[event.key] || keyMap[event.code]`.
 * On déclare donc des *codes physiques* (`KeyW`, `KeyA`...) plutôt que des
 * caractères : le code décrit la position de la touche sur un clavier US,
 * indépendamment de la disposition active. Résultat : la même config donne
 * WASD en QWERTY et ZQSD en AZERTY, sans configuration de la part du joueur.
 *
 * Pour re-binder : modifier les tableaux `keys` ci-dessous, rien d'autre.
 */
export const controlMap: KeyboardControlsEntry<Control>[] = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'attack', keys: ['KeyE'] },
]

/** Libellés affichés dans le HUD (disposition AZERTY par défaut). */
export const controlHints: { keys: string; label: string }[] = [
  { keys: 'ZQSD / WASD', label: 'se déplacer' },
  { keys: 'Espace', label: 'sauter' },
  { keys: 'E', label: 'attaquer' },
]
