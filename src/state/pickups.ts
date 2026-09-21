import { Vector3 } from 'three'
import { now as gameNow } from './gameClock'
import { ground } from './ground'

/**
 * Cœurs lâchés par les ennemis, gérés en **pool de taille fixe**.
 *
 * Même raison que les projectiles : un ramassage vit une quinzaine de secondes
 * et n'a besoin ni de React, ni d'un rigid body Rapier. La chute est intégrée à
 * la main et l'atterrissage interroge le sol de la carte courante, donc le cœur
 * se pose exactement sur la surface visible du terrain — voir `landingHeight`.
 */
export interface Pickup {
  active: boolean
  position: Vector3
  /** Vitesse verticale pendant le rebond initial ; nulle une fois posé. */
  velocityY: number
  /** Vrai quand le cœur a touché le sol et se contente de flotter. */
  landed: boolean
  bornAt: number
  /** Décalage de phase, pour que deux cœurs voisins ne flottent pas à l'unisson. */
  phase: number
}

export const PICKUP_POOL_SIZE = 12
/** Durée de vie avant disparition. */
export const PICKUP_LIFETIME_MS = 15000
/** Durée du clignotement d'avertissement, en fin de vie. */
export const PICKUP_WARNING_MS = 3500
/** Impulsion verticale au moment du lâcher : le cœur « saute » du corps. */
export const PICKUP_POP_SPEED = 3.6
export const PICKUP_GRAVITY = -11
/** Distance de ramassage, en unités monde. */
export const PICKUP_RADIUS = 1.25
/**
 * Écart vertical toléré au ramassage, entre le centre de la capsule et le cœur.
 *
 * Il est large — le cœur flotte à `PICKUP_HOVER` du sol, le centre du joueur à
 * `FEET_TO_CENTER`, donc à plat il ne reste qu'un quart d'unité d'écart — et
 * c'est voulu : un joueur en saut ou sur la marche d'à côté doit ramasser ce
 * qu'il touche. Ce qu'il empêche, c'est de rafler par le dessus un cœur tombé au
 * pied d'une falaise.
 *
 * Nommé ici et non écrit en dur dans la boucle parce qu'il est la moitié du
 * contrat : un cœur ne se ramasse que si le sol sous lui est **celui sur lequel
 * le joueur marche**. Voir `state/ground.ts`.
 */
export const PICKUP_REACH_Y = 2
/** Hauteur de flottement au-dessus du sol. */
export const PICKUP_HOVER = 0.55

export const pickups: Pickup[] = Array.from({ length: PICKUP_POOL_SIZE }, () => ({
  active: false,
  position: new Vector3(),
  velocityY: 0,
  landed: false,
  bornAt: 0,
  phase: 0,
}))

/**
 * Fait apparaître un cœur.
 *
 * Si le pool est plein, on remplace le plus ancien plutôt que d'ignorer le
 * lâcher : un joueur qui vient d'enchaîner douze ennemis mérite le douzième
 * cœur plus que le premier, qu'il a de toute façon laissé derrière lui.
 */
export function dropPickup(x: number, y: number, z: number) {
  let slot = pickups.find((pickup) => !pickup.active)
  if (!slot) {
    slot = pickups.reduce((oldest, pickup) =>
      pickup.bornAt < oldest.bornAt ? pickup : oldest,
    )
  }

  slot.active = true
  slot.landed = false
  slot.position.set(x, y, z)
  slot.velocityY = PICKUP_POP_SPEED
  slot.bornAt = gameNow()
  slot.phase = Math.random() * Math.PI * 2
}

/**
 * L'altitude à laquelle un cœur lâché en (x, z) finit par se poser.
 *
 * Nommée ici plutôt qu'écrite dans la boucle de `Pickups`, parce que c'est elle
 * qui décide si le cœur soigne : le ramassage compare la hauteur du joueur à
 * celle du cœur, et un cœur posé sur le relief d'une **autre** carte est hors de
 * portée du joueur qui marche sur celle-ci. Le sol interrogé est donc celui de
 * la carte courante, jamais le continent en dur — voir `state/ground.ts`.
 */
export function landingHeight(x: number, z: number) {
  return ground.height(x, z) + PICKUP_HOVER
}

/** Vide le pool. Appelé au redémarrage d'une partie. */
export function clearPickups() {
  for (const pickup of pickups) pickup.active = false
}
