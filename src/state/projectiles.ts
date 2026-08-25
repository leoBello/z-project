import { Vector3 } from 'three'

/**
 * Projectiles des Octoroks, gérés en **pool de taille fixe**.
 *
 * Ni entités React ni rigid bodies Rapier : un projectile vit une seconde et
 * demie, un corps physique complet coûterait bien plus cher que l'intégration
 * à la main faite ici, et on éviterait mal les réveils en cascade du solveur.
 * Le pool évite en prime toute allocation en cours de partie.
 */
export interface Projectile {
  active: boolean
  position: Vector3
  velocity: Vector3
  /** Timestamp de tir, pour la durée de vie. */
  bornAt: number
}

export const PROJECTILE_POOL_SIZE = 32
/** Vitesse initiale, en unités/seconde. */
export const PROJECTILE_SPEED = 16
/** Gravité appliquée au projectile : donne une trajectoire en cloche lisible. */
export const PROJECTILE_GRAVITY = -6
/** Durée de vie maximale, en millisecondes. */
export const PROJECTILE_LIFETIME_MS = 2600
/** Rayon de collision avec le joueur. */
export const PROJECTILE_HIT_RADIUS = 0.85

export const projectiles: Projectile[] = Array.from(
  { length: PROJECTILE_POOL_SIZE },
  () => ({
    active: false,
    position: new Vector3(),
    velocity: new Vector3(),
    bornAt: 0,
  }),
)

const direction = new Vector3()

/**
 * Tire un projectile depuis `from` vers `target`.
 * Le tir est légèrement relevé pour compenser la gravité : sans ça l'Octorok
 * viserait systématiquement dans les pieds du joueur.
 */
export function fireProjectile(from: Vector3, target: Vector3) {
  const slot = projectiles.find((projectile) => !projectile.active)
  if (!slot) return

  direction.copy(target).sub(from)
  const distance = direction.length()
  direction.normalize()

  slot.active = true
  slot.position.copy(from)
  slot.velocity.copy(direction).multiplyScalar(PROJECTILE_SPEED)
  // Compensation balistique approchée : la moitié de la chute sur le trajet.
  slot.velocity.y += (-PROJECTILE_GRAVITY * distance) / (2 * PROJECTILE_SPEED)
  slot.bornAt = performance.now()
}

/** Désactive tous les projectiles en vol. Appelé au redémarrage d'une partie. */
export function clearProjectiles() {
  for (const projectile of projectiles) projectile.active = false
}
