import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  advance,
  hitStop,
  hitStopSnapshot,
  isHitStopped,
  now,
  pollHitStop,
  resetClock,
  subscribeHitStop,
} from './gameClock'

/**
 * L'horloge de jeu, et le gel qui se mesure à côté d'elle.
 *
 * Les deux ne tournent pas sur la même base, et c'est le sujet : le temps de
 * jeu cumule les deltas clampés de la boucle de rendu, le gel se chronomètre en
 * temps réel. Un gel qui arrêterait l'horloge de jeu et se mesurerait sur elle
 * ne finirait jamais.
 */

/** Pilote `performance.now()`, sur lequel le gel — et lui seul — se règle. */
let realTime = 0

beforeEach(() => {
  realTime = 0
  vi.spyOn(performance, 'now').mockImplementation(() => realTime)
  resetClock()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('le temps de jeu', () => {
  it('part de zéro', () => {
    expect(now()).toBe(0)
  })

  it('cumule les deltas en millisecondes', () => {
    advance(1 / 60)
    advance(1 / 60)

    expect(now()).toBeCloseTo(2 * (1000 / 60))
  })

  it('ne recule jamais', () => {
    let previous = now()
    for (let i = 0; i < 100; i++) {
      advance(1 / 60)
      expect(now()).toBeGreaterThanOrEqual(previous)
      previous = now()
    }
  })

  it('ne bouge pas tant que personne ne l avance', () => {
    advance(1)
    realTime += 10_000

    // Le temps réel a passé, pas le temps de jeu : c'est exactement ce qui met
    // la partie en pause sans une ligne de plus.
    expect(now()).toBe(1_000)
  })

  it('repart de zéro au redémarrage d une partie', () => {
    advance(120)

    resetClock()

    expect(now()).toBe(0)
  })
})

describe('le gel', () => {
  it('ne gèle rien par défaut', () => {
    expect(isHitStopped()).toBe(false)
  })

  it('gèle pour la durée demandée, en temps réel', () => {
    hitStop(80)

    expect(isHitStopped()).toBe(true)
    realTime = 79
    expect(isHitStopped()).toBe(true)
    realTime = 80
    expect(isHitStopped()).toBe(false)
  })

  it('finit même si le temps de jeu est arrêté', () => {
    hitStop(80)
    realTime = 200

    // Aucun `advance` : un gel qui se mesurerait sur l horloge de jeu, qu il
    // arrête lui-même, ne finirait jamais.
    expect(isHitStopped()).toBe(false)
  })

  it('deux morts dans la même frame prolongent sans empiler', () => {
    hitStop(80)
    hitStop(200)

    realTime = 199
    expect(isHitStopped()).toBe(true)
    realTime = 200
    expect(isHitStopped()).toBe(false)
  })

  it('un second gel plus court ne raccourcit pas le premier', () => {
    hitStop(200)
    hitStop(40)

    realTime = 100
    expect(isHitStopped()).toBe(true)
  })

  it('ne survit pas au redémarrage d une partie', () => {
    hitStop(5_000)

    resetClock()

    expect(isHitStopped()).toBe(false)
  })
})

describe('l abonnement au gel', () => {
  it('prévient au départ du gel', () => {
    const listener = vi.fn()
    subscribeHitStop(listener)

    hitStop(80)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(hitStopSnapshot()).toBe(true)
  })

  it('ne prévient pas deux fois pour le même état', () => {
    const listener = vi.fn()
    subscribeHitStop(listener)

    hitStop(80)
    hitStop(200)

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('prévient à la fin, qu il faut venir constater', () => {
    const listener = vi.fn()
    subscribeHitStop(listener)
    hitStop(80)
    listener.mockClear()

    realTime = 100
    // Rien ne se produit à l expiration : c est la boucle qui vient la voir.
    expect(pollHitStop()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('rend un instantané stable entre deux sondages', () => {
    hitStop(80)

    // `useSyncExternalStore` boucle à l infini si deux lectures successives ne
    // rendent pas la même référence.
    expect(hitStopSnapshot()).toBe(hitStopSnapshot())
  })

  it('se désabonne', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeHitStop(listener)

    unsubscribe()
    hitStop(80)

    expect(listener).not.toHaveBeenCalled()
  })

  it('prévient tous les abonnés', () => {
    const first = vi.fn()
    const second = vi.fn()
    subscribeHitStop(first)
    subscribeHitStop(second)

    hitStop(80)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })
})
