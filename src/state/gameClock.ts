/**
 * Horloge de jeu.
 *
 * Le projet lisait `performance.now()` pour tous les délais de gameplay —
 * cooldowns, temps de préparation, i-frames, durées de vie — pendant que le
 * déplacement avançait en temps *simulé*, avec un `delta` clampé à 0,05 s.
 * Sous 20 fps le clamp mord et les deux horloges divergent : tout se déplace au
 * ralenti pendant que les ennemis continuent d'attaquer à cadence normale.
 *
 * Une seule horloge, donc, qui cumule exactement les mêmes deltas clampés que
 * le déplacement, et qui n'avance pas hors de la phase `playing`. La mise en
 * pause en découle sans code supplémentaire : le temps de jeu s'arrête, donc
 * aucun délai ne court.
 *
 * `performance.now()` ne reste légitime que pour ce qui doit suivre le temps
 * *réel* : les animations d'interface en CSS, et rien d'autre.
 */
let elapsedMs = 0

/** Temps de jeu écoulé. Ne recule jamais, ne saute jamais, s'arrête en pause. */
export function now() {
  return elapsedMs
}

/** Avancé une fois par frame, et une seule — voir `<GameClock />`. */
export function advance(deltaSeconds: number) {
  elapsedMs += deltaSeconds * 1000
}

/**
 * Gel du monde sur un coup fatal — le « hit-stop ».
 *
 * Chronométré en temps **réel** et non sur `now()`, et c'est le point à ne pas
 * rater : un gel qui arrête l'horloge de jeu et se mesurerait sur elle ne
 * finirait jamais. Même raisonnement que la fumée de changement de tenue, qui
 * joue pendant une pause et se chronomètre donc sur `performance.now()`.
 */
let hitStopUntil = -Infinity
/** Dernier état notifié. `useSyncExternalStore` exige un instantané stable. */
let hitStopped = false
const hitStopListeners = new Set<() => void>()

export function hitStop(durationMs: number) {
  // `max` et non affectation : deux morts dans la même frame prolongent le gel
  // jusqu'au plus tardif des deux, elles ne le raccourcissent pas — et elles ne
  // l'empilent pas non plus.
  hitStopUntil = Math.max(hitStopUntil, performance.now() + durationMs)
  notifyHitStop()
}

export function isHitStopped() {
  return performance.now() < hitStopUntil
}

function notifyHitStop() {
  const next = isHitStopped()
  if (next === hitStopped) return
  hitStopped = next
  for (const listener of hitStopListeners) listener()
}

/**
 * Sondage d'une frame. Retourne l'état du gel après notification.
 *
 * Le gel se mesure en temps réel : rien ne se produit à son expiration, il faut
 * donc venir la constater. Appelé une fois par frame depuis `<GameClock />`.
 */
export function pollHitStop() {
  notifyHitStop()
  return hitStopped
}

export function subscribeHitStop(listener: () => void) {
  hitStopListeners.add(listener)
  return () => {
    hitStopListeners.delete(listener)
  }
}

export function hitStopSnapshot() {
  return hitStopped
}

/** Remise à zéro au redémarrage d'une partie. */
export function resetClock() {
  elapsedMs = 0
  // Un gel en cours au moment d'un Game Over laisserait la physique en pause
  // sur la partie suivante, le temps qu'il expire.
  hitStopUntil = -Infinity
  notifyHitStop()
}

if (import.meta.env.DEV) {
  // Exposée pour vérifier depuis la page qu'elle se fige bien en pause : c'est
  // exactement le genre de chose qu'on ne peut pas juger à l'œil. Le gel s'y
  // ajoute pour la même raison — il dure 80 ms, aucune capture ne l'attrapera.
  ;(window as unknown as Record<string, unknown>).__gameClock = {
    now,
    resetClock,
    hitStop,
    isHitStopped,
  }
}
