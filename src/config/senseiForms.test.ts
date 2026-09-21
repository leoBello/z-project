import { describe, expect, it } from 'vitest'
import {
  formById,
  formForMastery,
  isMasteringRank,
  isMasteringRun,
  MASTERY_RANK,
  SENSEI_FORMS,
} from './senseiForms'
import { CHALLENGE_RANKS, rankFor } from './challenge'

describe('les paliers', () => {
  it('part de la forme de base tant que rien n’est maîtrisé', () => {
    expect(formForMastery(0).id).toBe('base')
  })

  it('franchit un palier à sa borne exacte, et pas un cran avant', () => {
    for (const form of SENSEI_FORMS) {
      if (form.gate === 0) continue
      expect(formForMastery(form.gate).id).toBe(form.id)
      expect(formForMastery(form.gate - 1).id).not.toBe(form.id)
    }
  })

  it('reste à la dernière forme au-delà du dernier palier', () => {
    const last = SENSEI_FORMS[SENSEI_FORMS.length - 1]
    expect(formForMastery(last.gate).id).toBe(last.id)
    expect(formForMastery(last.gate + 50).id).toBe(last.id)
  })

  it('ramène les comptes aberrants à la forme de départ plutôt que de casser', () => {
    // Le seul producteur plausible est un `localStorage` trafiqué : la bonne
    // réponse est la forme de base, pas une exception au chargement de carte.
    expect(formForMastery(-3).id).toBe('base')
    expect(formForMastery(Number.NaN).id).toBe('base')
  })

  it('a des paliers strictement croissants', () => {
    const gates = SENSEI_FORMS.map((form) => form.gate)
    expect(gates).toEqual([...gates].sort((a, b) => a - b))
    expect(new Set(gates).size).toBe(gates.length)
  })
})

describe('la règle des trois coupes', () => {
  it('donne exactement la même chevelure à la base, à la forme divine et à la dernière', () => {
    // Ce n'est pas une coïncidence de données : dans l'animé ces trois formes
    // partagent la coupe, seule la teinte change. Le test existe pour qu'un
    // réglage de la coupe de base ne les désolidarise pas par inadvertance.
    const [base, , , , ssg, ssb] = SENSEI_FORMS
    expect(ssg.hair).toEqual(base.hair)
    expect(ssb.hair).toEqual(base.hair)
  })

  it('donne une chevelure dressée aux seules trois formes intermédiaires', () => {
    const risen = SENSEI_FORMS.filter((form) => form.hair.rise > 0.2).map((form) => form.id)
    expect(risen).toEqual(['ss', 'ss2', 'ss3'])
  })

  it('n’ôte les sourcils qu’à la troisième forme', () => {
    const browless = SENSEI_FORMS.filter((form) => form.brow === 'none').map((form) => form.id)
    expect(browless).toEqual(['ss3'])
  })

  it('ne donne la crinière longue qu’à la troisième forme', () => {
    const maned = SENSEI_FORMS.filter((form) => form.hair.mane).map((form) => form.id)
    expect(maned).toEqual(['ss3'])
  })
})

describe('la maîtrise d’une catégorie', () => {
  it('accepte le rang seuil et tout ce qui est au-dessus', () => {
    expect(isMasteringRank(MASTERY_RANK)).toBe(true)
    expect(isMasteringRank('master')).toBe(true)
    expect(isMasteringRank('legend')).toBe(true)
  })

  it('refuse le rang de plancher, qui n’est jamais raté', () => {
    // `novice` est à zéro point par minute : le prendre rendrait la progression
    // automatique, donc nulle.
    expect(isMasteringRank('novice')).toBe(false)
  })

  it('classe chaque rang de la table du même côté que son barème', () => {
    for (const rank of CHALLENGE_RANKS) {
      expect(isMasteringRank(rank.id)).toBe(rank.perMinute > 0)
    }
  })

  it('juge une course sur son rythme et non sur son score brut', () => {
    // Même score, deux durées : seule la plus courte tient le rythme.
    expect(isMasteringRun(200, 60_000)).toBe(true)
    expect(isMasteringRun(200, 600_000)).toBe(false)
    expect(rankFor(200, 60_000)).toBe('master')
  })

  it('ne maîtrise rien avec un score nul', () => {
    expect(isMasteringRun(0, 120_000)).toBe(false)
  })
})

describe('formById', () => {
  it('retrouve chaque forme de la table', () => {
    for (const form of SENSEI_FORMS) {
      expect(formById(form.id).id).toBe(form.id)
    }
  })

  it('retombe sur la forme de base pour un identifiant inconnu', () => {
    expect(formById('inexistant' as never).id).toBe('base')
  })
})
