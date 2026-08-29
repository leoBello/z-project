import { Color, Vector3 } from 'three'
import { now as gameNow } from './gameClock'

/**
 * Nuages et anneaux de mort, gérés en **pools de taille fixe**.
 *
 * Même approche que les cœurs et les projectiles, et pour une raison qui est
 * ici la contrainte fondatrice : le nuage doit **survivre au démontage du
 * composant `Enemy`**. L'ennemi disparaît 150 ms après sa mort, la fumée en
 * vit 600. Tenir la fumée dans le composant obligerait à le garder monté
 * quatre fois trop longtemps pour une raison purement décorative.
 *
 * Rien ici ne connaît les ennemis : le pool reçoit une position et une
 * couleur, un point.
 */
export interface DeathPuff {
  active: boolean
  position: Vector3
  color: Color
  /** Taille finale du nuage, avant le facteur de gonflement. */
  scale: number
  /** Hauteur dont il monte sur sa durée de vie, en unités monde. */
  rise: number
  /** Vitesse de rotation propre. Le signe alterne d'un nuage à l'autre. */
  spin: number
  bornAt: number
}

export interface DeathRing {
  active: boolean
  position: Vector3
  color: Color
  bornAt: number
}

/**
 * Décalages locaux, tailles et rotations d'une bouffée.
 *
 * Les cinq premiers sont repris tels quels de la table `PUFFS` d'`OutfitSmoke`
 * — ils sont déjà réglés et le résultat est déjà validé à l'écran. Le sixième
 * comble le vide arrière-droit, plus visible ici : la fumée de tenue est vue
 * autour du joueur, celle-ci autour d'un corps qui vient de disparaître.
 */
const OFFSETS = [
  { x: 0, y: 0.45, z: 0, scale: 1.15, rise: 0.55, spin: 1.1 },
  { x: 0.36, y: 0.2, z: 0.1, scale: 0.8, rise: 0.4, spin: -1.5 },
  { x: -0.34, y: 0.28, z: -0.12, scale: 0.85, rise: 0.45, spin: 1.7 },
  { x: 0.1, y: 0.7, z: -0.25, scale: 0.6, rise: 0.6, spin: -0.9 },
  { x: -0.18, y: 0.6, z: 0.24, scale: 0.62, rise: 0.62, spin: 1.3 },
  { x: 0.24, y: 0.5, z: -0.3, scale: 0.55, rise: 0.5, spin: -1.8 },
] as const

export const PUFFS_PER_DEATH = OFFSETS.length
/** Huit morts simultanées avant que le pool ne recycle. */
export const DEATH_PUFF_POOL_SIZE = PUFFS_PER_DEATH * 8
export const DEATH_RING_POOL_SIZE = 8
/** Durée de vie d'un nuage, en millisecondes de temps de jeu. */
export const DEATH_PUFF_MS = 600
export const DEATH_RING_MS = 350
/** Rayon de la géométrie d'un nuage, avant mise à l'échelle par instance. */
export const DEATH_PUFF_SIZE = 0.4
/** Rayons de départ et d'arrivée de l'anneau, en unités monde. */
export const DEATH_RING_FROM = 0.2
export const DEATH_RING_TO = 1.4

export const deathPuffs: DeathPuff[] = Array.from(
  { length: DEATH_PUFF_POOL_SIZE },
  () => ({
    active: false,
    position: new Vector3(),
    color: new Color(),
    scale: 1,
    rise: 0,
    spin: 0,
    bornAt: 0,
  }),
)

export const deathRings: DeathRing[] = Array.from({ length: DEATH_RING_POOL_SIZE }, () => ({
  active: false,
  position: new Vector3(),
  color: new Color(),
  bornAt: 0,
}))

/** Blanc de référence pour l'éclaircissement de la teinte. */
const WHITE = new Color(1, 1, 1)

/**
 * Teinte de fumée tirée de la couleur de l'ennemi.
 *
 * Éclaircie de 45 % vers le blanc : à teinte pleine, le nuage d'un Octorok se
 * lit comme une gerbe de sang plutôt que comme de la fumée. Éclaircie
 * davantage, les deux espèces meurent dans le même gris et l'effet devient un
 * tampon générique posé sur tout.
 */
function smokeTint(target: Color, source: Color) {
  target.copy(source).lerp(WHITE, 0.45)
}

/**
 * Prend un emplacement libre, ou le plus ancien si le pool est plein.
 *
 * Même arbitrage que les cœurs : un joueur qui vient d'enchaîner huit ennemis
 * mérite la fumée du huitième plus que celle du premier, déjà dissipée aux
 * trois quarts.
 */
function claim<T extends { active: boolean; bornAt: number }>(pool: T[]) {
  return (
    pool.find((slot) => !slot.active) ??
    pool.reduce((oldest, slot) => (slot.bornAt < oldest.bornAt ? slot : oldest))
  )
}

/** Fait éclore une bouffée complète autour d'un point. */
export function spawnDeathPuff(x: number, y: number, z: number, source: Color) {
  const bornAt = gameNow()
  for (const offset of OFFSETS) {
    const slot = claim(deathPuffs)
    slot.active = true
    slot.position.set(x + offset.x, y + offset.y, z + offset.z)
    smokeTint(slot.color, source)
    slot.scale = offset.scale
    slot.rise = offset.rise
    slot.spin = offset.spin
    slot.bornAt = bornAt
  }
}

/** Pose l'anneau de choc. `y` est la hauteur du sol, pas celle du corps. */
export function spawnDeathRing(x: number, y: number, z: number, source: Color) {
  const slot = claim(deathRings)
  slot.active = true
  // Deux centimètres au-dessus du sol : posé dessus, l'anneau se bat avec le
  // terrain dans le tampon de profondeur et clignote par bandes.
  slot.position.set(x, y + 0.02, z)
  smokeTint(slot.color, source)
  slot.bornAt = gameNow()
}

/** Vide les deux pools. Appelé au redémarrage d'une partie. */
export function clearDeathPuffs() {
  for (const puff of deathPuffs) puff.active = false
  for (const ring of deathRings) ring.active = false
}

if (import.meta.env.DEV) {
  // Le pool est le seul moyen de vérifier l'effet sans tuer un ennemi : une
  // mort dure 210 ms, on ne la déclenche pas à la demande au bon moment.
  ;(window as unknown as Record<string, unknown>).__deathPuffs = {
    deathPuffs,
    deathRings,
    spawnDeathPuff,
    spawnDeathRing,
    clearDeathPuffs,
  }
}
