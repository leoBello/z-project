/**
 * Constantes de gameplay, regroupées pour pouvoir régler le "feeling"
 * sans fouiller dans les composants.
 */

export const MAP_SIZE = 120
export const MAP_HALF = MAP_SIZE / 2

export const PLAYER = {
  /** Vitesse horizontale, en unités/seconde. */
  speed: 7,
  /** Vitesse verticale imprimée au saut. */
  jumpSpeed: 8,
  /** Gravité du monde (plus fort que la réalité = saut plus "jeu vidéo"). */
  gravity: -24,
  /** Demi-hauteur de la capsule de collision (hors calottes). */
  capsuleHalfHeight: 0.45,
  capsuleRadius: 0.35,
  /** Vitesse de rotation du modèle vers la direction de déplacement. */
  turnDamping: 12,
  /** Position de réapparition (et point de départ). */
  spawn: [0, 2, 0] as [number, number, number],
} as const

export const CAMERA = {
  /** Décalage de la caméra par rapport au joueur (vue 3e personne 3/4). */
  offset: [0, 9, 13] as [number, number, number],
  /** Hauteur visée sur le joueur (à peu près la tête). */
  lookAtHeight: 1.2,
  /** Réactivité du suivi ; plus haut = plus collé au joueur. */
  damping: 5,
} as const
