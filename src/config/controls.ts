import type { KeyboardControlsEntry } from '@react-three/drei'
import type { Dictionary } from '../i18n'

/** Actions du joueur. Sert de clé typée pour `useKeyboardControls`. */
export type Control =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'jump'
  | 'attack'
  | 'interact'

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
  // `KeyF` et non `KeyE`, déjà pris par l'attaque. `Enter` en second parce que
  // c'est la touche que tout le monde essaie devant un panneau.
  { name: 'interact', keys: ['KeyF', 'Enter'] },
]

/**
 * Rappels de touches du HUD.
 *
 * Une fonction et non une constante : les libellés sont traduits, les codes de
 * touche ne le sont pas. Ces derniers restent en dur — ce sont des positions
 * physiques sur le clavier, pas du texte.
 */
export function getControlHints(dict: Dictionary): { keys: string; label: string }[] {
  return [
    { keys: 'ZQSD / WASD', label: dict.ui.hud.move },
    { keys: 'Espace', label: dict.ui.hud.jump },
    { keys: 'E', label: dict.ui.hud.attack },
    { keys: 'F', label: dict.ui.hud.interact },
  ]
}
