import { describe, expect, it } from 'vitest'
import { DIFFICULTIES, DURATIONS, categoryKey } from '../config/challenge'
import {
  ANY,
  FILTER_DIFFICULTIES,
  FILTER_DURATIONS,
  FILTER_OUTFITS,
  FILTER_WEAPONS,
  PSEUDO_MAX,
  cleanPseudo,
  isPseudoValid,
  matchesFilter,
  scoreCategory,
  sortEntries,
  standingOf,
  type ScoreEntry,
} from './entry'

/**
 * Le rang, le pseudo et les tamis du tableau.
 *
 * Ces trois-là partagent un défaut : ils peuvent être faux sans lever, sans
 * rougir, et sans qu'aucune requête n'échoue. Un départage inversé donne un
 * classement parfaitement plausible et parfaitement faux ; un pseudo mal
 * nettoyé casse une colonne chez les autres, jamais chez celui qui l'a saisi. Ce
 * fichier est donc le seul endroit qui vérifie ce que personne ne verra.
 */

/** Une ligne de tableau, avec ce qu'il faut de valeurs par défaut pour être lisible. */
function entry(over: Partial<ScoreEntry> & Pick<ScoreEntry, 'id' | 'score'>): ScoreEntry {
  return {
    pseudo: 'Anon',
    kills: 1,
    ranMs: 120_000,
    duration: '2min',
    difficulty: 'normal',
    outfit: 'luffy',
    weapon: 'fists',
    at: 1_800_000_000_000,
    ...over,
  }
}

describe('cleanPseudo', () => {
  it('rend un nom ordinaire intact', () => {
    expect(cleanPseudo('Sangoku')).toBe('Sangoku')
  })

  it('retire les espaces de bord et met les rafales à plat', () => {
    expect(cleanPseudo('  le   maitre  ')).toBe('le maitre')
  })

  it('retire les caractères de contrôle d un copier-coller', () => {
    expect(cleanPseudo('Zoro\n\t\u0007')).toBe('Zoro')
  })

  it('coupe à la longueur de la colonne', () => {
    const long = 'a'.repeat(PSEUDO_MAX + 12)

    expect(cleanPseudo(long)).toHaveLength(PSEUDO_MAX)
  })

  it('refuse ce qui ne contient rien, et rien d autre', () => {
    expect(isPseudoValid('   ')).toBe(false)
    expect(isPseudoValid('\n')).toBe(false)
    // Une seule lettre est un pseudo : il n'y a pas de compte à protéger, donc
    // pas de raison d'imposer une longueur minimale.
    expect(isPseudoValid('X')).toBe(true)
  })
})

describe('scoreCategory', () => {
  /*
    Le classement en ligne et les records locaux rangent les scores dans les
    mêmes douze cases. Deux formats de clé pour une même notion finiraient par se
    croiser — un panneau montrant le record d'une case et le tableau d'une
    autre — et la seule façon d'empêcher ça est de le vérifier.
  */
  it('donne la même clé que les records locaux, pour les douze catégories', () => {
    for (const duration of DURATIONS) {
      for (const difficulty of DIFFICULTIES) {
        expect(scoreCategory(duration.id, difficulty.id)).toBe(
          categoryKey(duration.id, difficulty.id),
        )
      }
    }
  })
})

describe('sortEntries', () => {
  it('met le meilleur score en tête', () => {
    const rows = sortEntries([entry({ id: 'b', score: 120 }), entry({ id: 'a', score: 300 })])

    expect(rows.map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('à score égal, garde devant celui qui l a posé le premier', () => {
    const rows = sortEntries([
      entry({ id: 'tard', score: 200, at: 2_000 }),
      entry({ id: 'tot', score: 200, at: 1_000 }),
    ])

    expect(rows.map((row) => row.id)).toEqual(['tot', 'tard'])
  })

  it('ne touche pas au tableau qu on lui donne', () => {
    const given = [entry({ id: 'b', score: 10 }), entry({ id: 'a', score: 90 })]
    sortEntries(given)

    expect(given.map((row) => row.id)).toEqual(['b', 'a'])
  })
})

describe('standingOf', () => {
  const others = [
    entry({ id: 'un', score: 500 }),
    entry({ id: 'deux', score: 300 }),
    entry({ id: 'trois', score: 100 }),
  ]

  it('compte ceux qui font mieux, et pas les autres', () => {
    expect(standingOf(entry({ id: 'moi', score: 200 }), others)).toEqual({ rank: 3, total: 4 })
  })

  it('donne la première place à qui fait mieux que tous', () => {
    expect(standingOf(entry({ id: 'moi', score: 900 }), others)).toEqual({ rank: 1, total: 4 })
  })

  /*
    Le cas qui comptait : au moment de l'enregistrement, la ligne vient d'être
    écrite et le lot qui sert à la classer est une relecture. Selon la vitesse
    du réseau, elle s'y trouve ou non — et le rang annoncé au joueur ne doit pas
    dépendre de ça.
  */
  it('donne le même rang que la ligne soit déjà dans le lot ou non', () => {
    const mine = entry({ id: 'moi', score: 200 })

    expect(standingOf(mine, [...others, mine])).toEqual(standingOf(mine, others))
  })

  it('ne se compte pas comme son propre concurrent', () => {
    const mine = entry({ id: 'moi', score: 200 })

    expect(standingOf(mine, [mine])).toEqual({ rank: 1, total: 1 })
  })

  it('départage une égalité par la date, comme le tri', () => {
    const tot = entry({ id: 'tot', score: 200, at: 1_000 })
    const tard = entry({ id: 'tard', score: 200, at: 2_000 })

    expect(standingOf(tard, [tot]).rank).toBe(2)
    expect(standingOf(tot, [tard]).rank).toBe(1)
  })

  it('classe un tableau vide en première place sur une', () => {
    expect(standingOf(entry({ id: 'seul', score: 10 }), [])).toEqual({ rank: 1, total: 1 })
  })
})

describe('matchesFilter', () => {
  const row = entry({ id: 'x', score: 100, outfit: 'madara', weapon: 'katana' })
  const base = { duration: '2min', difficulty: 'normal' } as const

  it('laisse tout passer quand les deux tamis sont ouverts', () => {
    expect(matchesFilter(row, { ...base, outfit: ANY, weapon: ANY })).toBe(true)
  })

  it('retient la tenue demandée', () => {
    expect(matchesFilter(row, { ...base, outfit: 'madara', weapon: ANY })).toBe(true)
    expect(matchesFilter(row, { ...base, outfit: 'zoro', weapon: ANY })).toBe(false)
  })

  it('retient l arme demandée', () => {
    expect(matchesFilter(row, { ...base, outfit: ANY, weapon: 'katana' })).toBe(true)
    expect(matchesFilter(row, { ...base, outfit: ANY, weapon: 'fists' })).toBe(false)
  })

  it('exige les deux quand les deux sont posés', () => {
    expect(matchesFilter(row, { ...base, outfit: 'madara', weapon: 'fists' })).toBe(false)
  })
})

describe('les listes des sélecteurs', () => {
  it('proposent toutes les durées et toutes les difficultés du défi', () => {
    expect(FILTER_DURATIONS).toEqual(DURATIONS.map((entry_) => entry_.id))
    expect(FILTER_DIFFICULTIES).toEqual(DIFFICULTIES.map((entry_) => entry_.id))
  })

  /*
    La tenue de départ et les deux armes sans objet sont celles qu'une liste
    dérivée de la table des objets aurait oubliées — c'est-à-dire exactement
    celles avec lesquelles on court ses premiers défis.
  */
  it('proposent la tenue et les armes qui ne viennent d aucun coffre', () => {
    expect(FILTER_OUTFITS).toContain('luffy')
    expect(FILTER_WEAPONS).toContain('fists')
    expect(FILTER_WEAPONS).toContain('sword')
  })

  it('ouvrent les deux tamis en tête de liste', () => {
    expect(FILTER_OUTFITS[0]).toBe(ANY)
    expect(FILTER_WEAPONS[0]).toBe(ANY)
  })
})
