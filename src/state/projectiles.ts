import { Vector3 } from 'three'
import { now as gameNow } from './gameClock'

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
  /**
   * Renvoyé par un coup d'épée : il ne blesse plus le joueur, il blesse les
   * ennemis. Porté par le projectile plutôt que par un second pool, pour que
   * l'intégration, le rendu et la collision avec le relief restent communs.
   */
  deflected: boolean
  /**
   * Identifiant du dernier coup d'épée déjà **confronté** à ce projectile.
   *
   * Même discipline que la hitbox d'épée : on ne demande jamais « sommes-nous
   * dans la fenêtre de renvoi ? », on demande « ce coup a-t-il déjà été jugé
   * contre ce projectile ? ». Sans ça, un swing sondé à cadence variable
   * renverrait la balle une frame sur deux.
   */
  lastSwingTested: number
}

export const PROJECTILE_POOL_SIZE = 32
/** Vitesse initiale, en unités/seconde. */
export const PROJECTILE_SPEED = 16
/** Gravité appliquée au projectile : donne une trajectoire en cloche lisible. */
export const PROJECTILE_GRAVITY = -6
/** Durée de vie maximale, en millisecondes. */
export const PROJECTILE_LIFETIME_MS = 2600
/**
 * Rayon de collision avec le joueur.
 *
 * Ramené de 0,85 à 0,62 : la capsule du joueur ne fait que 0,35 de rayon, et
 * 0,85 faisait toucher des tirs qui passaient visiblement à côté. Une esquive
 * qui a l'air réussie doit l'être.
 */
export const PROJECTILE_HIT_RADIUS = 0.62

/**
 * Rayon dans lequel un coup d'épée renvoie un projectile.
 *
 * Plus large que la hitbox anti-ennemi (`ATTACK.radius` = 0,9) : une balle est
 * un objet de 0,2 qui traverse la zone en deux frames, et il faut que le geste
 * reste faisable sans timing à la milliseconde près. C'est le seul endroit du
 * jeu où le joueur vise quelque chose de rapide.
 */
export const PROJECTILE_PARRY_RADIUS = 1.5
/** Vitesse du projectile renvoyé : plus vif qu'à l'aller, le renvoi doit payer. */
export const PROJECTILE_RETURN_SPEED = 20
/** Au-delà, on ne cherche pas de cible : le renvoi part droit devant. */
export const PROJECTILE_RETURN_SEEK_RANGE = 24

export const projectiles: Projectile[] = Array.from(
  { length: PROJECTILE_POOL_SIZE },
  () => ({
    active: false,
    position: new Vector3(),
    velocity: new Vector3(),
    bornAt: 0,
    deflected: false,
    lastSwingTested: -Infinity,
  }),
)

const direction = new Vector3()

/**
 * Tire un projectile depuis `from` vers `target`.
 *
 * Le tir est légèrement relevé pour compenser la gravité : sans ça l'Octorok
 * viserait systématiquement dans les pieds du joueur.
 *
 * `spread` est une **dispersion angulaire**, en radians. Elle est indispensable :
 * un tir parfaitement dirigé sur la position courante du joueur ne peut pas
 * être esquivé par quelqu'un qui avance vers le tireur — sur cet axe, se
 * déplacer ne change rien à l'interception. Mesuré sans dispersion : cinq
 * cœurs perdus sur cinq tirs, sans jamais atteindre l'ennemi. Une dispersion
 * angulaire s'ouvre avec la distance, ce qui donne au passage le bon dosage :
 * l'Octorok reste dangereux de près et devient harcelant de loin.
 */
export function fireProjectile(from: Vector3, target: Vector3, spread = 0) {
  const slot = projectiles.find((projectile) => !projectile.active)
  if (!slot) return

  direction.copy(target).sub(from)
  const distance = direction.length()
  direction.normalize()

  if (spread > 0) {
    const angle = (Math.random() * 2 - 1) * spread
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const x = direction.x
    const z = direction.z
    direction.x = x * cos - z * sin
    direction.z = x * sin + z * cos
  }

  slot.active = true
  slot.position.copy(from)
  slot.velocity.copy(direction).multiplyScalar(PROJECTILE_SPEED)
  // Compensation balistique approchée : la moitié de la chute sur le trajet.
  slot.velocity.y += (-PROJECTILE_GRAVITY * distance) / (2 * PROJECTILE_SPEED)
  slot.bornAt = gameNow()
  // Un slot réutilisé garde l'état du tir précédent : une balle renvoyée puis
  // recyclée repartirait « amie » et ne toucherait plus le joueur.
  slot.deflected = false
  slot.lastSwingTested = -Infinity
}

/**
 * Renvoie un projectile vers `towardX/Y/Z`.
 *
 * La durée de vie est **remise à zéro** : sans ça, une balle parée à la fin de
 * sa course s'éteindrait au milieu du chemin du retour, et le joueur verrait
 * son coup réussi ne rien produire.
 */
export function deflectProjectile(
  projectile: Projectile,
  towardX: number,
  towardY: number,
  towardZ: number,
) {
  direction.set(
    towardX - projectile.position.x,
    towardY - projectile.position.y,
    towardZ - projectile.position.z,
  )
  const distance = direction.length()
  direction.normalize()

  projectile.deflected = true
  projectile.velocity.copy(direction).multiplyScalar(PROJECTILE_RETURN_SPEED)
  projectile.velocity.y += (-PROJECTILE_GRAVITY * distance) / (2 * PROJECTILE_RETURN_SPEED)
  projectile.bornAt = gameNow()
}

/** Désactive tous les projectiles en vol. Appelé au redémarrage d'une partie. */
export function clearProjectiles() {
  for (const projectile of projectiles) {
    projectile.active = false
    projectile.deflected = false
    projectile.lastSwingTested = -Infinity
  }
}

// Exposé en développement pour la même raison que `__enemyRegistry` : pouvoir
// poser un projectile factice à un endroit choisi et vérifier la parade depuis
// un test navigateur, sans avoir à provoquer un vrai tir d'Octorok au bon
// moment — impossible à cadrer en rendu logiciel à 1 fps.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__projectiles = projectiles
}
