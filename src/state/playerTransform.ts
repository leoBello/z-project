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
  /** Vitesse horizontale en unités/seconde — pilote le cycle de marche. */
  speed: 0,
  /** Timestamp du dernier coup lancé ; -Infinity = aucune attaque en cours. */
  attackStartedAt: -Infinity,
  /**
   * Identifiant (= `attackStartedAt`) du dernier coup qui a touché quelque chose.
   *
   * Chaque ennemi blessé y inscrit le swing en cours. Le retour visuel compare
   * ensuite cette valeur au swing courant pour savoir si le coup a porté — sans
   * avoir à refaire le test de hitbox, qui doit rester dans `Enemy.tsx`.
   */
  lastLandedSwing: -Infinity,
}

// Exposé en développement pour inspecter l'état du joueur depuis la console
// (ou depuis un test navigateur) sans avoir à instrumenter les composants.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).playerTransform = playerTransform
}
