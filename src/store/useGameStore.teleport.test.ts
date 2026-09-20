import { beforeEach, describe, expect, it } from 'vitest'
import { WORLD, sampleHeight } from '../config/world'
import { advance, resetClock } from '../state/gameClock'
import { playerTransform } from '../state/playerTransform'
import { clearProjectiles, fireProjectile, projectiles } from '../state/projectiles'
import { Vector3 } from 'three'
import { useGameStore } from './useGameStore'

/**
 * La téléportation et l'onde d'annihilation.
 *
 * Deux séquences, et le même piège dans les deux : elles durent, et pendant
 * qu'elles durent le joueur garde la main sur son clavier. Ce qu'on vérifie
 * ici, ce sont donc les gardes — ce qui doit refuser de partir deux fois, ce
 * qui doit tenir la partie en pause, et ce qui doit être effacé avant que
 * l'écran ne s'allume.
 */

const store = () => useGameStore.getState()

beforeEach(() => {
  store().reset()
  resetClock()
  clearProjectiles()
  playerTransform.position.set(0, 2, 0)
})

describe('la téléportation depuis le continent', () => {
  it('part en vol et met la partie en pause', () => {
    store().teleportTo('temple')

    expect(store().teleporting).toBe('temple')
    expect(store().phase).toBe('paused')
  })

  it('referme le panneau du lieu qu on lisait', () => {
    store().openLandmark('pyramid')

    store().teleportTo('temple')

    expect(store().activeLandmark).toBeNull()
    expect(store().teleporting).toBe('temple')
  })

  it('refuse de rejouer le vol vers le lieu déjà affiché', () => {
    store().openLandmark('temple')

    store().teleportTo('temple')

    expect(store().teleporting).toBeNull()
    expect(store().activeLandmark).toBe('temple')
  })

  it('résiste au clic répété', () => {
    store().teleportTo('temple')

    store().teleportTo('pyramid')

    expect(store().teleporting).toBe('temple')
  })

  it('refuse pendant un voyage entre cartes', () => {
    store().enterMap('sky')

    store().teleportTo('temple')

    expect(store().teleporting).toBeNull()
  })

  it('refuse sur un écran de fin', () => {
    useGameStore.setState({ phase: 'gameover' })

    store().teleportTo('temple')

    expect(store().teleporting).toBeNull()
  })

  it('ouvre le panneau à l arrivée', () => {
    store().teleportTo('temple')

    store().resolveTeleport()

    expect(store().activeLandmark).toBe('temple')
    expect(store().phase).toBe('paused')
  })

  it('réaffirme la pause, qu un appui sur F aurait pu lever en vol', () => {
    store().teleportTo('temple')
    // `closeLandmark` ne mord pas ici, mais la phase peut avoir été remise à
    // `playing` par un autre chemin pendant le vol. L'invariant à tenir est
    // qu'un lieu affiché n'ouvre jamais sa modale sur une partie qui tourne.
    useGameStore.setState({ phase: 'playing' })

    store().resolveTeleport()

    expect(store().phase).toBe('paused')
  })

  it('ne résout rien sans vol en cours', () => {
    store().resolveTeleport()

    expect(store().activeLandmark).toBeNull()
  })

  it('range le vol une fois posé', () => {
    store().teleportTo('temple')
    store().resolveTeleport()

    store().finishTeleport()

    expect(store().teleporting).toBeNull()
    expect(store().activeLandmark).toBe('temple')
  })
})

describe('la téléportation depuis une autre carte', () => {
  beforeEach(() => {
    useGameStore.setState({ location: 'sky' })
  })

  it('passe par le voyage et non par les braises', () => {
    // Poser le joueur sur le continent sans ramener sa carte le déposait dans
    // le vide de l'Île Céleste, où il tombait dès la fin de la séquence.
    store().teleportTo('temple')

    expect(store().teleporting).toBeNull()
    expect(store().transit).toBe('continent')
    expect(store().transitLandmark).toBe('temple')
    expect(store().transitFrom).toBe('sky')
  })

  it('range l invite du portail qu on quitte', () => {
    useGameStore.setState({ nearbyPortal: 'continent' })

    store().teleportTo('temple')

    expect(store().nearbyPortal).toBeNull()
  })

  it('ouvre le lieu à l arrivée sur le continent', () => {
    store().teleportTo('temple')
    store().arriveOnMap()
    store().finishTransit()

    expect(store().location).toBe('continent')
    expect(store().activeLandmark).toBe('temple')
  })
})

describe('l onde d annihilation', () => {
  it('part une fois et note son point d impact', () => {
    expect(store().triggerAnnihilation()).toBe(true)
    expect(store().annihilation).not.toBeNull()
  })

  it('ne part pas deux fois', () => {
    store().triggerAnnihilation()

    expect(store().triggerAnnihilation()).toBe(false)
  })

  it('refuse hors de la phase de jeu', () => {
    useGameStore.setState({ phase: 'gameover' })

    expect(store().triggerAnnihilation()).toBe(false)
  })

  it('efface ce qui était déjà en vol', () => {
    // Une flèche partie une demi-seconde avant le code toucherait pendant
    // l'explosion censée tout balayer — le pire moment pour perdre un cœur,
    // puisque plus rien à l'écran ne l'explique.
    fireProjectile(new Vector3(0, 1, 0), new Vector3(10, 1, 0))
    expect(projectiles.some((slot) => slot.active)).toBe(true)

    store().triggerAnnihilation()

    expect(projectiles.some((slot) => slot.active)).toBe(false)
  })

  it('ne met pas la partie en pause — la bombe doit tomber', () => {
    // L'horloge de jeu s'arrête hors de `playing` : une pause figerait la
    // bombe en vol et l'onde ne partirait jamais.
    store().triggerAnnihilation()

    expect(store().phase).toBe('playing')
  })

  it('fige le point d impact au lieu de suivre le joueur', () => {
    playerTransform.position.set(10, 2, 10)
    store().triggerAnnihilation()
    const impact = { ...store().annihilation! }

    playerTransform.position.set(-40, 2, -40)

    expect(store().annihilation).toEqual(impact)
  })

  it('pose la boule de feu devant le joueur et sur le sol', () => {
    playerTransform.position.set(5, 3, 5)

    store().triggerAnnihilation()
    const blast = store().annihilation!

    expect(blast.x).toBe(5)
    // Devant, et non sur lui : cette caméra ne montre presque pas le ciel.
    expect(blast.z).toBeLessThan(5)
    expect(blast.y).toBeCloseTo(Math.max(sampleHeight(blast.x, blast.z), WORLD.waterLevel), 5)
  })

  it('ne laisse pas la boule de feu sous l eau au large', () => {
    playerTransform.position.set(WORLD.half - 5, 2, WORLD.half - 5)

    store().triggerAnnihilation()

    expect(store().annihilation!.y).toBeGreaterThanOrEqual(WORLD.waterLevel)
  })

  it('prend les pieds du joueur pour sol hors du continent', () => {
    // `sampleHeight` échantillonne le **continent** : l'interroger depuis
    // l'île rendrait une altitude qui n'y désigne rien.
    useGameStore.setState({ location: 'sky' })
    playerTransform.position.set(0, 40, 0)

    store().triggerAnnihilation()

    expect(store().annihilation!.y).toBeLessThan(40)
    expect(store().annihilation!.y).toBeGreaterThan(35)
  })

  it('date la frappe sur l horloge de jeu', () => {
    advance(5)

    store().triggerAnnihilation()

    expect(store().annihilation!.at).toBeCloseTo(5_000)
  })

  it('se range une fois jouée, et peut repartir', () => {
    store().triggerAnnihilation()

    store().finishAnnihilation()

    expect(store().annihilation).toBeNull()
    expect(store().triggerAnnihilation()).toBe(true)
  })
})
