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

/**
 * Remet à zéro les compteurs de combat au redémarrage d'une partie.
 *
 * `attackStartedAt` et `lastLandedSwing` sont des timestamps de l'horloge de
 * jeu. Celle-ci repart de 0 à chaque `reset()` (voir `resetClock`), mais ces
 * deux champs, eux, vivent dans ce singleton et survivent au remontage du
 * joueur. Sans cette remise à zéro, une partie où l'on a déjà frappé laisse
 * `attackStartedAt` à plusieurs secondes dans le « futur » de la nouvelle
 * horloge : `gameNow() - attackStartedAt` devient négatif et la garde
 * anti-enchaînement de l'attaque ne repasse jamais — plus moyen d'attaquer
 * jusqu'à ce que l'horloge ait rattrapé l'ancienne valeur.
 *
 * `position`, `yaw`, `speed` et `grounded` n'ont pas besoin d'être touchés :
 * `Player` les réécrit dès sa première frame.
 */
export function resetCombat() {
  playerTransform.attackStartedAt = -Infinity
  playerTransform.lastLandedSwing = -Infinity
}

// Exposé en développement pour inspecter l'état du joueur depuis la console
// (ou depuis un test navigateur) sans avoir à instrumenter les composants.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).playerTransform = playerTransform
}
