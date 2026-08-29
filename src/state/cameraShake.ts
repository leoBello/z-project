import { Vector3 } from 'three'

/**
 * Secousse de caméra.
 *
 * Singleton mutable hors React, sur le modèle de `playerTransform` : elle est
 * armée depuis une boucle `useFrame` et lue depuis une autre, aucun rendu n'a
 * à en être averti.
 *
 * Chronométrée en temps **réel**, comme le hit-stop et pour la même raison :
 * elle doit trembler *pendant* le gel, qui est précisément le moment où elle
 * porte. Sur l'horloge de jeu, elle ne démarrerait qu'une fois le gel fini et
 * les deux effets se succéderaient au lieu de se superposer.
 */
let amplitude = 0
let durationMs = 0
let startedAt = -Infinity

/**
 * Deux fréquences distinctes, et volontairement non harmoniques : à fréquence
 * égale l'offset décrit une diagonale, et la secousse se lit comme un
 * glissement plutôt que comme un choc.
 */
const FREQUENCY_X = 38
const FREQUENCY_Y = 27

export function shake(nextAmplitude: number, nextDurationMs: number) {
  // Une secousse plus forte remplace celle en cours ; une plus faible ne
  // l'écrase pas. Deux ennemis tués dans la même frame ne doivent pas
  // s'additionner en une secousse deux fois trop violente.
  const running = performance.now() < startedAt + durationMs
  if (running && nextAmplitude < amplitude) return
  amplitude = nextAmplitude
  durationMs = nextDurationMs
  startedAt = performance.now()
}

/** Écrit l'offset courant dans `out`. Zéro quand aucune secousse ne court. */
export function sampleShake(out: Vector3) {
  const elapsed = (performance.now() - startedAt) / 1000
  const k = elapsed / (durationMs / 1000)
  // À l'état initial (`startedAt = -Infinity`, durée nulle), `elapsed` vaut
  // `Infinity` et `k` vaut `Infinity / 0 = Infinity` : c'est le `k >= 1`
  // qui l'attrape, pas le `!(k >= 0)`. Ce dernier ne sert que pour le vrai
  // `NaN`, qui ne peut survenir que si `sampleShake` est appelée dans le même
  // tick qu'un `shake(x, 0)` (soit `0 / 0`).
  if (!(k >= 0) || k >= 1) return out.set(0, 0, 0)

  // Enveloppe linéaire décroissante : une décroissance exponentielle laisse une
  // traîne qui, sur 120 ms, s'apparente à un flottement de caméra.
  const decay = amplitude * (1 - k)
  return out.set(
    Math.sin(elapsed * FREQUENCY_X * Math.PI * 2) * decay,
    Math.cos(elapsed * FREQUENCY_Y * Math.PI * 2) * decay,
    0,
  )
}

if (import.meta.env.DEV) {
  // La secousse dure 120 ms : impossible à juger sur une capture, il faut
  // pouvoir la déclencher à volonté et la regarder en direct.
  ;(window as unknown as Record<string, unknown>).__cameraShake = { shake, sampleShake }
}
