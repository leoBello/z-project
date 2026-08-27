/**
 * Entrées tactiles partagées **hors de React**, sur le modèle de
 * `playerTransform` : `TouchControls` (overlay HTML) écrit ici à chaque geste,
 * `Player` lit dans son `useFrame`. Passer par un state React re-rendrait le
 * joueur à chaque déplacement du pouce.
 *
 * Inerte sur desktop : `TouchControls` ne monte pas, donc personne n'écrit et
 * tout reste à zéro.
 */
export const touchInput = {
  /** Joystick, repère écran, -1..1. `moveY` positif = pouce vers le bas. */
  moveX: 0,
  moveY: 0,
  /**
   * Drapeaux ponctuels levés au toucher d'un bouton. `Player` les lit dans sa
   * boucle puis les remet à `false` — même protocole que ses refs clavier
   * `jumpRequested` / `attackRequested`, pour ne pas perdre un appui plus court
   * qu'une frame.
   */
  jumpRequested: false,
  attackRequested: false,
}

/** Remet le joystick au neutre (relâchement, annulation, démontage de l'overlay). */
export function resetTouchMove() {
  touchInput.moveX = 0
  touchInput.moveY = 0
}

// Exposé en développement pour piloter le joueur depuis la console sans
// émulateur tactile (ex. `touchInput.moveX = 1`, `touchInput.jumpRequested = true`).
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).touchInput = touchInput
}
