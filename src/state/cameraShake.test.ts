import { Vector3 } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleShake, shake } from './cameraShake'

/**
 * La secousse de caméra.
 *
 * Chronométrée en temps **réel**, comme le hit-stop : elle doit trembler
 * *pendant* le gel, qui est précisément le moment où elle porte. Deux cas
 * limites valent un test — l'état initial, où la durée nulle produit une
 * division par zéro, et la superposition de deux secousses, où la plus faible
 * ne doit pas écraser la plus forte.
 */

let realTime = 0
const out = new Vector3()

beforeEach(() => {
  vi.spyOn(performance, 'now').mockImplementation(() => realTime)
  /*
    L'horloge **avance** entre deux tests au lieu de repartir de zéro, et c'est
    le module qui l'impose : `shake` refuse une secousse plus faible que celle
    qui court encore. Une remise à plat par `shake(0, 0)` faite pendant la
    secousse du test précédent est donc purement et simplement ignorée — le
    test suivant échantillonnait l'amplitude du précédent.

    On saute donc au-delà de toute secousse en cours avant de remettre à plat.
  */
  realTime += 100_000
  shake(0, 0)
  realTime += 1
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sampleShake', () => {
  it('ne secoue rien au repos', () => {
    sampleShake(out)

    expect(out.toArray()).toEqual([0, 0, 0])
  })

  it('ne sort pas de NaN sur une division par zéro', () => {
    // `shake(x, 0)` dans le même tick donne `0 / 0`. C'est le `!(k >= 0)` qui
    // l'attrape, et lui seul.
    shake(0.5, 0)

    sampleShake(out)

    expect(out.toArray()).toEqual([0, 0, 0])
  })

  it('secoue pendant la durée demandée', () => {
    shake(0.2, 120)

    realTime += 20
    sampleShake(out)

    expect(out.length()).toBeGreaterThan(0)
  })

  it('s arrête net à la fin', () => {
    shake(0.2, 120)

    realTime += 120
    sampleShake(out)

    expect(out.toArray()).toEqual([0, 0, 0])
  })

  it('décroît au lieu de traîner', () => {
    const start = realTime
    shake(0.2, 400)

    /*
      L'enveloppe se mesure sur les **sommets** de l'oscillation et non sur un
      échantillon quelconque : le signal change de signe soixante fois par
      seconde, donc deux points pris au hasard ne disent rien de la
      décroissance. On prend donc le maximum atteint sur chaque quart.
    */
    const peaks = [0, 1, 2, 3].map((quarter) => {
      let peak = 0
      for (let step = 0; step < 100; step++) {
        realTime = start + quarter * 100 + step
        sampleShake(out)
        peak = Math.max(peak, Math.abs(out.x))
      }
      return peak
    })

    expect([...peaks].sort((a, b) => b - a)).toEqual(peaks)
    expect(peaks[0]).toBeGreaterThan(peaks[3])
  })

  it('ne bouge pas la caméra en profondeur', () => {
    shake(0.5, 120)

    realTime += 30
    sampleShake(out)

    expect(out.z).toBe(0)
  })

  it('ne décrit pas une diagonale — les deux fréquences diffèrent', () => {
    const start = realTime
    shake(0.5, 400)

    const ratios: number[] = []
    for (const elapsed of [15, 35, 55, 75]) {
      realTime = start + elapsed
      sampleShake(out)
      if (Math.abs(out.y) > 1e-6) ratios.push(out.x / out.y)
    }

    expect(ratios.length).toBeGreaterThan(1)

    // À fréquence égale, le rapport serait constant et la secousse se lirait
    // comme un glissement plutôt que comme un choc.
    expect(new Set(ratios.map((r) => r.toFixed(3))).size).toBeGreaterThan(1)
  })

  it('reste dans son amplitude', () => {
    const start = realTime
    shake(0.2, 120)

    let moved = false
    for (let elapsed = 0; elapsed < 120; elapsed += 3) {
      realTime = start + elapsed
      sampleShake(out)
      expect(Math.abs(out.x)).toBeLessThanOrEqual(0.2)
      expect(Math.abs(out.y)).toBeLessThanOrEqual(0.2)
      if (out.length() > 0) moved = true
    }

    // Sans ce témoin, une secousse restée muette passerait le test.
    expect(moved).toBe(true)
  })

  it('écrit dans le vecteur qu on lui donne, sans allouer', () => {
    shake(0.2, 120)

    expect(sampleShake(out)).toBe(out)
  })
})

describe('la superposition', () => {
  it('une secousse plus forte remplace celle en cours', () => {
    shake(0.1, 400)
    realTime += 10

    shake(0.5, 400)
    realTime += 10
    sampleShake(out)

    expect(out.length()).toBeGreaterThan(0.1)
  })

  it('une plus faible ne l écrase pas', () => {
    shake(0.5, 400)
    realTime += 10
    sampleShake(out)
    const strong = out.length()

    shake(0.05, 400)
    realTime += 10
    sampleShake(out)

    // Deux ennemis tués dans la même frame ne doivent pas s additionner, et le
    // second ne doit pas non plus voler la secousse du premier.
    expect(out.length()).toBeGreaterThan(0.05)
    expect(strong).toBeGreaterThan(0)
  })

  it('une secousse expirée ne protège plus rien', () => {
    shake(0.5, 100)
    realTime += 200

    shake(0.05, 100)
    realTime += 10
    sampleShake(out)

    expect(out.length()).toBeGreaterThan(0)
    expect(out.length()).toBeLessThanOrEqual(0.05 * Math.SQRT2)
  })
})
