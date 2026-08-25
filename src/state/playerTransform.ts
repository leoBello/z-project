import { Vector3 } from 'three'

/**
 * Transform du joueur partagé **hors de React**.
 *
 * Volontairement mutable et non réactif : ces valeurs sont écrites et lues à
 * chaque frame (caméra, IA des ennemis, projectiles). Les passer par un state
 * React ou zustand provoquerait un re-render par frame — ici on ne fait que
 * muter un objet, et les consommateurs le lisent dans leur propre `useFrame`.
 */
export const playerTransform = {
  /** Position monde du centre de la capsule. */
  position: new Vector3(0, 2, 0),
  /** Orientation du modèle (radians, axe Y). */
  yaw: 0,
  /** Vrai quand le raycast sol touche quelque chose sous le joueur. */
  grounded: false,
}
