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
  | 'parry'

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
  /*
    `KeyR`, et le choix mérite ses deux refus.

    Pas `KeyE` : l'attaque y est déjà, et fusionner les deux supprimerait le
    seul vrai choix du combat — risquer un coup d'épée au lieu de parer. Une
    touche qui fait deux choses selon le contexte ne laisse plus arbitrer.

    Pas `ShiftLeft`, qui était le candidat évident : Windows ouvre la boîte de
    dialogue des touches rémanentes au bout de **cinq appuis rapprochés** sur
    Maj. Un combat de boss à la parade en produit cinq en dix secondes, et la
    boîte vole le focus — donc la partie. Aucun code ne peut l'empêcher depuis
    une page web.

    `KeyR` est un code physique : même emplacement en AZERTY et en QWERTY, sous
    l'index gauche qui tient déjà ZQSD, libre, et voisin immédiat de la touche
    d'attaque.
  */
  { name: 'parry', keys: ['KeyR'] },
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
    { keys: 'R', label: dict.ui.hud.parry },
    { keys: 'F', label: dict.ui.hud.interact },
  ]
}
