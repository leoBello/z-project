import { beforeEach, describe, expect, it } from 'vitest'
import { advance, resetClock } from './gameClock'
import {
  PICKUP_POOL_SIZE,
  PICKUP_POP_SPEED,
  clearPickups,
  dropPickup,
  pickups,
} from './pickups'

/**
 * Les cœurs lâchés, en pool de taille fixe.
 *
 * La règle qui mérite un test est celle du pool plein : on remplace le **plus
 * ancien** plutôt que d'ignorer le lâcher. Un joueur qui vient d'enchaîner
 * douze ennemis mérite le douzième cœur plus que le premier, qu'il a de toute
 * façon laissé derrière lui — et c'est le genre de règle qui s'inverse à la
 * première relecture distraite.
 */

const live = () => pickups.filter((pickup) => pickup.active)

beforeEach(() => {
  clearPickups()
  resetClock()
})

describe('dropPickup', () => {
  it('pose un cœur à l endroit demandé', () => {
    dropPickup(3, 2, -4)

    expect(live()).toHaveLength(1)
    expect(live()[0].position.toArray()).toEqual([3, 2, -4])
  })

  it('le fait sauter du corps', () => {
    dropPickup(0, 0, 0)

    expect(live()[0].velocityY).toBe(PICKUP_POP_SPEED)
    expect(live()[0].landed).toBe(false)
  })

  it('date le lâcher sur l horloge de jeu', () => {
    advance(4)

    dropPickup(0, 0, 0)

    expect(live()[0].bornAt).toBeCloseTo(4_000)
  })

  it('décale la phase pour que deux cœurs voisins ne flottent pas à l unisson', () => {
    const phases = new Set<number>()
    for (let i = 0; i < 8; i++) {
      dropPickup(i, 0, 0)
      phases.add(pickups[i].phase)
    }

    expect(phases.size).toBeGreaterThan(1)
  })

  it('remplit les cases libres avant d en reprendre une', () => {
    for (let i = 0; i < PICKUP_POOL_SIZE; i++) dropPickup(i, 0, 0)

    expect(live()).toHaveLength(PICKUP_POOL_SIZE)
  })

  it('remplace le plus ancien quand le pool est plein', () => {
    for (let i = 0; i < PICKUP_POOL_SIZE; i++) {
      advance(1)
      dropPickup(i, 0, 0)
    }
    const oldest = pickups.reduce((a, b) => (a.bornAt < b.bornAt ? a : b))

    advance(1)
    dropPickup(99, 0, 0)

    expect(oldest.position.x).toBe(99)
    expect(live()).toHaveLength(PICKUP_POOL_SIZE)
  })

  it('ne perd jamais le dernier lâcher', () => {
    for (let i = 0; i < PICKUP_POOL_SIZE * 2; i++) {
      advance(1)
      dropPickup(i, 0, 0)
      expect(live().some((pickup) => pickup.position.x === i)).toBe(true)
    }
  })

  it('remet la case reprise à neuf', () => {
    for (let i = 0; i < PICKUP_POOL_SIZE; i++) {
      advance(1)
      dropPickup(i, 0, 0)
    }
    const oldest = pickups.reduce((a, b) => (a.bornAt < b.bornAt ? a : b))
    oldest.landed = true
    oldest.velocityY = 0

    advance(1)
    dropPickup(99, 0, 0)

    // Un cœur repris doit ressauter, pas rester posé là où l ancien gisait.
    expect(oldest.landed).toBe(false)
    expect(oldest.velocityY).toBe(PICKUP_POP_SPEED)
  })
})

describe('le pool', () => {
  it('est alloué une fois pour toutes', () => {
    expect(pickups).toHaveLength(PICKUP_POOL_SIZE)
  })

  it('ne partage aucun vecteur entre deux cases', () => {
    expect(pickups[0].position).not.toBe(pickups[1].position)
  })
})

describe('clearPickups', () => {
  it('vide tout au redémarrage d une partie', () => {
    for (let i = 0; i < 5; i++) dropPickup(i, 0, 0)

    clearPickups()

    expect(live()).toHaveLength(0)
  })

  it('rend les cases réutilisables tout de suite', () => {
    for (let i = 0; i < PICKUP_POOL_SIZE; i++) dropPickup(i, 0, 0)
    clearPickups()

    dropPickup(0, 0, 0)

    expect(live()).toHaveLength(1)
  })
})
