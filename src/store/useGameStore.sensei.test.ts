import { beforeEach, describe, expect, it } from 'vitest'
import { COUNTDOWN_MS, categoryKey } from '../config/challenge'
import { formForMastery } from '../config/senseiForms'
import { advance, resetClock } from '../state/gameClock'
import { useGameStore } from './useGameStore'

/**
 * La montée en puissance du maître.
 *
 * Ce qui se teste ici n'est pas le modèle — il n'y a rien à vérifier sur des
 * cônes — mais **la règle qui coche les cases** : quelles courses comptent,
 * lesquelles non, et ce qui survit à quoi. C'est la seule mécanique du jeu dont
 * l'effet est censé traverser les parties, donc la seule où une remise à zéro
 * mal placée se voit à retardement.
 */

const store = () => useGameStore.getState()

/** Lance un défi sur l'Outremonde et le met en course. */
function run(duration: '2min' | '5min' | '10min' | 'endless' = '2min', difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  useGameStore.setState({ location: 'beyond' })
  // Referme le panneau de résultat d'une course précédente : `acceptChallenge`
  // refuse tant que l'état n'est pas revenu à `idle`, et sans ce passage une
  // seconde course ne partait pas du tout — le test passait alors pour la
  // mauvaise raison, en constatant l'absence d'un effet qu'on n'avait jamais
  // déclenché.
  if (store().challenge !== 'idle') store().dismissChallengeResult()
  store().setChallengeDuration(duration)
  store().setChallengeDifficulty(difficulty)
  store().acceptChallenge()
  store().beginChallenge()
  expect(store().challenge).toBe('running')
}

/**
 * Termine la course avec un score et une durée voulus.
 *
 * Le score est posé directement plutôt que gagné à coups de victimes : ce qui
 * est sous test est le seuil de rang, pas le barème, et fabriquer deux cents
 * points en tuant des octoroks n'aurait rien vérifié de plus.
 */
function finish({ score, seconds, failed = false }: { score: number; seconds: number; failed?: boolean }) {
  advance(COUNTDOWN_MS / 1000 + seconds)
  useGameStore.setState({ challengeScore: score })
  store().endChallenge(failed)
}

beforeEach(() => {
  store().reset()
  resetClock()
  // `reset` conserve la maîtrise — c'est le sujet d'un des tests plus bas — donc
  // chaque cas repart d'une ardoise posée à la main.
  useGameStore.setState({ senseiMastered: [] })
})

describe('ce qui coche une case', () => {
  it('coche la catégorie jouée quand le rythme atteint le rang Guerrier', () => {
    run('2min', 'normal')
    finish({ score: 300, seconds: 60 })

    expect(store().senseiMastered).toEqual([categoryKey('2min', 'normal')])
  })

  it('ne coche rien quand le rythme reste sous le seuil', () => {
    run('10min', 'easy')
    finish({ score: 30, seconds: 600 })

    expect(store().senseiMastered).toEqual([])
  })

  it('coche même une course perdue, si le rythme y était', () => {
    // Le record retient déjà les défis ratés : on garde ce qu'on a marqué avant
    // de tomber. Exiger de survivre ferait du palier une épreuve de prudence.
    run('2min', 'hard')
    finish({ score: 300, seconds: 60, failed: true })

    expect(store().senseiMastered).toEqual([categoryKey('2min', 'hard')])
  })

  it('ne coche pas deux fois la même catégorie', () => {
    run('2min', 'normal')
    finish({ score: 300, seconds: 60 })
    run('2min', 'normal')
    finish({ score: 900, seconds: 60 })

    expect(store().senseiMastered).toEqual([categoryKey('2min', 'normal')])
    // Preuve que la seconde course a bien compté par ailleurs : sans elle,
    // l'assertion ci-dessus serait vraie sans rien démontrer.
    expect(store().challengeBests[categoryKey('2min', 'normal')].score).toBe(900)
  })

  it('compte les catégories séparément', () => {
    run('2min', 'normal')
    finish({ score: 300, seconds: 60 })
    run('5min', 'hard')
    finish({ score: 900, seconds: 120 })

    expect(store().senseiMastered).toHaveLength(2)
    expect(store().senseiMastered).toContain(categoryKey('2min', 'normal'))
    expect(store().senseiMastered).toContain(categoryKey('5min', 'hard'))
  })

  it('coche sans exiger que le record soit battu', () => {
    // Une seconde course plus faible mais toujours au rythme du Guerrier ne
    // retire rien : ce qu'on demande est d'avoir su le faire.
    run('2min', 'normal')
    finish({ score: 900, seconds: 60 })
    useGameStore.setState({ senseiMastered: [] })

    run('2min', 'normal')
    finish({ score: 200, seconds: 60 })

    expect(store().senseiMastered).toEqual([categoryKey('2min', 'normal')])
  })
})

describe('la forme qui en découle', () => {
  it('reste à la base tant qu’aucune case n’est cochée', () => {
    expect(formForMastery(store().senseiMastered.length).id).toBe('base')
  })

  it('monte d’un palier dès la première catégorie maîtrisée', () => {
    run('2min', 'normal')
    finish({ score: 300, seconds: 60 })

    expect(formForMastery(store().senseiMastered.length).id).toBe('ss')
  })
})

describe('ce qui survit à quoi', () => {
  it('garde la maîtrise quand une nouvelle partie commence', () => {
    /*
      Le cas qui a failli passer à la trappe.

      `reset` réécrit l'état depuis `initialState`, où `senseiMastered` est
      l'instantané pris au chargement du module. Sans exception explicite, le
      maître régressait dès qu'on relançait une partie, puis retrouvait ses
      paliers au rechargement de page — une incohérence qu'on ne remarque
      qu'une fois livrée.
    */
    run('2min', 'normal')
    finish({ score: 300, seconds: 60 })
    const earned = store().senseiMastered

    store().reset()

    expect(store().senseiMastered).toEqual(earned)
  })

  it('remet en revanche les records à zéro, qui sont un acquis de partie', () => {
    run('2min', 'normal')
    finish({ score: 300, seconds: 60 })
    expect(Object.keys(store().challengeBests)).toHaveLength(1)

    store().reset()

    expect(store().challengeBests).toEqual({})
  })
})
