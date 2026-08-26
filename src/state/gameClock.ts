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

/** Remise à zéro au redémarrage d'une partie. */
export function resetClock() {
  elapsedMs = 0
}

if (import.meta.env.DEV) {
  // Exposée pour vérifier depuis la page qu'elle se fige bien en pause : c'est
  // exactement le genre de chose qu'on ne peut pas juger à l'œil.
  ;(window as unknown as Record<string, unknown>).__gameClock = { now, resetClock }
}
