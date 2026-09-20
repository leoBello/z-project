import { beforeEach, describe, expect, it } from 'vitest'
import { PARRY } from '../config/parry'
import {
  cancelParry,
  consumeParry,
  offerParry,
  parry,
  parryOffered,
  pressParry,
  resetParry,
} from './parry'

/**
 * La parade est la mécanique la plus dense du jeu : cinq horodatages, trois
 * boucles qui y touchent, et un ordre de tests dont l'en-tête de `pressParry`
 * dit lui-même qu'il est piégeux. Tout se joue sur des comparaisons de temps,
 * donc tout est testable sans monde 3D ni partie en cours — il suffit de passer
 * l'instant en paramètre, ce que l'API fait déjà partout.
 */
beforeEach(() => {
  resetParry()
})

describe('offerParry / parryOffered', () => {
  it("allume le signal cueLeadMs avant l'impact, et pas avant", () => {
    offerParry('lynel', 10_000)
    const from = 10_000 - PARRY.cueLeadMs

    expect(parryOffered(from - 1)).toBe(false)
    expect(parryOffered(from)).toBe(true)
    expect(parryOffered(10_000)).toBe(true)
    expect(parryOffered(10_001)).toBe(false)
  })

  it("n'offre rien tant qu'aucun ennemi n'a annoncé de coup", () => {
    expect(parryOffered(0)).toBe(false)
    expect(parryOffered(1_000_000)).toBe(false)
  })

  it('une seconde offre remplace la première', () => {
    offerParry('lynel', 10_000)
    offerParry('moblin', 20_000)

    expect(parry.offerBy).toBe('moblin')
    expect(parryOffered(10_000)).toBe(false)
    expect(parryOffered(20_000)).toBe(true)
  })
})

describe('cancelParry', () => {
  it("retire l'offre de celui qui l'avait faite", () => {
    offerParry('lynel', 10_000)
    cancelParry('lynel')

    expect(parryOffered(9_900)).toBe(false)
    expect(parry.offerBy).toBe('')
  })

  it("ignore l'annulation d'un ennemi qui n'a pas la parole", () => {
    offerParry('lynel', 10_000)
    cancelParry('moblin')

    expect(parryOffered(9_900)).toBe(true)
    expect(parry.offerBy).toBe('lynel')
  })
})

describe('pressParry', () => {
  it('ouvre une garde de windowMs suivie de sa récupération', () => {
    expect(pressParry(1_000)).toBe('guard')

    expect(parry.guardUntil).toBe(1_000 + PARRY.windowMs)
    expect(parry.recoveryUntil).toBe(1_000 + PARRY.windowMs + PARRY.recoveryMs)
  })

  it("un second appui pendant la garde ne la prolonge pas et n'allume pas le flash raté", () => {
    pressParry(1_000)
    const guardUntil = parry.guardUntil
    const recoveryUntil = parry.recoveryUntil

    expect(pressParry(1_100)).toBe('guarding')

    expect(parry.guardUntil).toBe(guardUntil)
    expect(parry.recoveryUntil).toBe(recoveryUntil)
    expect(parry.whiffedAt).toBe(-Infinity)
  })

  it('un appui pendant la récupération la relance depuis cet instant', () => {
    pressParry(1_000)
    const during = parry.guardUntil + 100

    expect(pressParry(during)).toBe('locked')

    expect(parry.recoveryUntil).toBe(during + PARRY.recoveryMs)
    expect(parry.whiffedAt).toBe(during)
  })

  it("marteler à 4 Hz ne laisse jamais ressortir de la récupération", () => {
    let now = 1_000
    expect(pressParry(now)).toBe('guard')

    // Un appui toutes les 250 ms, comme un joueur qui martèle la touche.
    const verdicts: string[] = []
    for (let i = 0; i < 12; i++) {
      now += 250
      verdicts.push(pressParry(now))
    }

    expect(verdicts).not.toContain('guard')
  })

  it('rouvre une garde une fois la récupération écoulée', () => {
    pressParry(1_000)
    const free = parry.recoveryUntil

    expect(pressParry(free)).toBe('guard')
  })
})

describe('consumeParry', () => {
  it('couvre un coup qui arrive pendant la garde', () => {
    pressParry(1_000)

    expect(consumeParry(1_100)).toBe(true)
    expect(parry.succeededAt).toBe(1_100)
  })

  it('ne couvre rien sans appui', () => {
    expect(consumeParry(1_000)).toBe(false)
  })

  it('ne couvre pas un coup arrivé après la fenêtre', () => {
    pressParry(1_000)

    expect(consumeParry(1_000 + PARRY.windowMs + 1)).toBe(false)
  })

  it("une garde ne pare qu'un seul coup — le triple tir ne passe pas en entier", () => {
    pressParry(1_000)

    expect(consumeParry(1_050)).toBe(true)
    expect(consumeParry(1_060)).toBe(false)
    expect(consumeParry(1_070)).toBe(false)
  })

  it('une parade réussie libère immédiatement la récupération', () => {
    pressParry(1_000)
    consumeParry(1_050)

    expect(pressParry(1_060)).toBe('guard')
  })
})

describe('resetParry', () => {
  it("remet chaque horodatage à -Infinity, garde ouverte comprise", () => {
    offerParry('lynel', 10_000)
    pressParry(9_800)
    consumeParry(9_900)

    resetParry()

    expect(parry).toEqual({
      offerBy: '',
      offerFrom: -Infinity,
      offerUntil: -Infinity,
      guardUntil: -Infinity,
      recoveryUntil: -Infinity,
      succeededAt: -Infinity,
      whiffedAt: -Infinity,
    })
  })

  it("une partie repartie de zéro n'hérite pas d'une garde du futur", () => {
    // L'horloge de jeu repart à 0 à chaque partie. Une garde ouverte à la
    // dixième seconde de la partie précédente serait encore « en cours » à
    // l'instant 0 de la suivante, et verrouillerait la parade.
    pressParry(10_000)
    resetParry()

    expect(pressParry(0)).toBe('guard')
  })
})
