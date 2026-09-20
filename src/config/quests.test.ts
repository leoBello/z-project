import { describe, expect, it } from 'vitest'
import { TRIAL_COUNT, activeQuest, questBoard, type QuestFacts } from './quests'

/**
 * Le journal de quêtes.
 *
 * Aucun état stocké : le journal est une **lecture** de la partie, et c'est ce
 * qui garantit qu'aucune quête ne peut mentir — un chemin de code oublié, le
 * code de triche qui vide la carte, un voyage rapide qui dépose sur l'île,
 * coche la quête sans avoir à la connaître. Ce qu'on vérifie ici est donc la
 * chaîne : chaque quête ouvre la suivante, et il n'y en a jamais deux ouvertes
 * à la fois.
 */

const NOTHING_DONE: QuestFacts = {
  kills: 0,
  enemyTotal: 26,
  portalOpened: false,
  skyVisited: false,
  bossDefeated: false,
  trialSlain: 0,
  goldenSlain: false,
  maleniaSlain: false,
  challengeDone: false,
}

/** La partie, dans l'ordre où elle se joue. */
const PROGRESSION: QuestFacts[] = [
  NOTHING_DONE,
  { ...NOTHING_DONE, kills: 13 },
  { ...NOTHING_DONE, kills: 26, portalOpened: true },
  { ...NOTHING_DONE, kills: 26, portalOpened: true, skyVisited: true },
  { ...NOTHING_DONE, kills: 26, portalOpened: true, skyVisited: true, bossDefeated: true },
  {
    ...NOTHING_DONE,
    kills: 26,
    portalOpened: true,
    skyVisited: true,
    bossDefeated: true,
    trialSlain: TRIAL_COUNT,
  },
  {
    ...NOTHING_DONE,
    kills: 26,
    portalOpened: true,
    skyVisited: true,
    bossDefeated: true,
    trialSlain: TRIAL_COUNT,
    goldenSlain: true,
  },
  {
    ...NOTHING_DONE,
    kills: 26,
    portalOpened: true,
    skyVisited: true,
    bossDefeated: true,
    trialSlain: TRIAL_COUNT,
    goldenSlain: true,
    maleniaSlain: true,
  },
  {
    ...NOTHING_DONE,
    kills: 26,
    portalOpened: true,
    skyVisited: true,
    bossDefeated: true,
    trialSlain: TRIAL_COUNT,
    goldenSlain: true,
    maleniaSlain: true,
    challengeDone: true,
  },
]

const stateOf = (facts: QuestFacts, id: string) =>
  questBoard(facts).find((quest) => quest.id === id)!.state

describe('questBoard', () => {
  it('rend les six lignes dans l ordre de la partie', () => {
    expect(questBoard(NOTHING_DONE).map((quest) => quest.id)).toEqual([
      'clear-continent',
      'sky-portal',
      'lynel-trial',
      'golden-lynel',
      'aeonia',
      'beyond',
    ])
  })

  it('ne réordonne pas le journal quand une quête s accomplit', () => {
    const order = questBoard(NOTHING_DONE).map((quest) => quest.id)

    for (const facts of PROGRESSION) {
      expect(questBoard(facts).map((quest) => quest.id)).toEqual(order)
    }
  })

  it('ouvre la première quête tout de suite, et garde les autres fermées', () => {
    const board = questBoard(NOTHING_DONE)

    expect(board[0].state).toBe('active')
    expect(board.slice(1).every((quest) => quest.state === 'locked')).toBe(true)
  })

  it('n a jamais deux quêtes ouvertes à la fois', () => {
    // C'est ce que promet la signature d'`activeQuest`, qui n'en rend qu'une :
    // chaque quête ouvre la suivante.
    for (const facts of PROGRESSION) {
      const open = questBoard(facts).filter((quest) => quest.state === 'active')
      expect(open.length, JSON.stringify(facts)).toBeLessThanOrEqual(1)
    }
  })

  it('ne referme jamais une quête accomplie', () => {
    const done = new Set<string>()

    for (const facts of PROGRESSION) {
      for (const quest of questBoard(facts)) {
        if (done.has(quest.id)) expect(quest.state, quest.id).toBe('done')
        if (quest.state === 'done') done.add(quest.id)
      }
    }

    expect(done.size).toBe(6)
  })

  it('laisse l île se visiter sans rien proposer', () => {
    // Entre l'arrivée et la chute du gardien, le journal n'a rien à dire, et
    // c'est voulu : lui coller « battez le gardien » réduirait une découverte
    // à une consigne.
    const arrived = PROGRESSION[3]

    expect(activeQuest(questBoard(arrived))).toBeNull()
  })
})

describe('les déverrouillages', () => {
  it('le portail attend que la carte soit vide', () => {
    expect(stateOf(NOTHING_DONE, 'sky-portal')).toBe('locked')
    expect(stateOf({ ...NOTHING_DONE, portalOpened: true }, 'sky-portal')).toBe('active')
  })

  it('l épreuve attend la chute du gardien', () => {
    const arrived = { ...NOTHING_DONE, portalOpened: true, skyVisited: true }

    expect(stateOf(arrived, 'lynel-trial')).toBe('locked')
    expect(stateOf({ ...arrived, bossDefeated: true }, 'lynel-trial')).toBe('active')
  })

  it('la montagne attend les trois bêtes — la même condition que la herse', () => {
    const base = { ...NOTHING_DONE, bossDefeated: true }

    expect(stateOf({ ...base, trialSlain: TRIAL_COUNT - 1 }, 'golden-lynel')).toBe('locked')
    expect(stateOf({ ...base, trialSlain: TRIAL_COUNT }, 'golden-lynel')).toBe('active')
  })

  it('le Marais attend la chute du doré', () => {
    const base = { ...NOTHING_DONE, bossDefeated: true, trialSlain: TRIAL_COUNT }

    expect(stateOf(base, 'aeonia')).toBe('locked')
    expect(stateOf({ ...base, goldenSlain: true }, 'aeonia')).toBe('active')
  })

  it('l Outremonde attend la chute de Malenia', () => {
    const base = {
      ...NOTHING_DONE,
      bossDefeated: true,
      trialSlain: TRIAL_COUNT,
      goldenSlain: true,
    }

    expect(stateOf(base, 'beyond')).toBe('locked')
    expect(stateOf({ ...base, maleniaSlain: true }, 'beyond')).toBe('active')
  })
})

describe('les compteurs', () => {
  it('suit les bêtes du continent', () => {
    const board = questBoard({ ...NOTHING_DONE, kills: 7 })

    expect(board[0].current).toBe(7)
    expect(board[0].target).toBe(26)
  })

  it('plafonne le compte : le code de triche peut tuer deux fois', () => {
    const board = questBoard({ ...NOTHING_DONE, kills: 99 })

    expect(board[0].current).toBe(26)
  })

  it('plafonne aussi les bêtes de l épreuve', () => {
    const board = questBoard({ ...NOTHING_DONE, bossDefeated: true, trialSlain: 99 })

    expect(board[2].current).toBe(TRIAL_COUNT)
  })

  it('rend un but à un pour ce qui ne se compte pas', () => {
    for (const quest of questBoard(NOTHING_DONE)) {
      expect(quest.target, quest.id).toBeGreaterThanOrEqual(1)
      expect(quest.current, quest.id).toBeGreaterThanOrEqual(0)
      expect(quest.current, quest.id).toBeLessThanOrEqual(quest.target)
    }
  })

  it('ne dépasse jamais son but, à aucune étape', () => {
    for (const facts of PROGRESSION) {
      for (const quest of questBoard(facts)) {
        expect(quest.current, quest.id).toBeLessThanOrEqual(quest.target)
      }
    }
  })

  it('accomplit la dernière sur un défi mené à terme, fût-il nul', () => {
    // Ce qui était demandé était d'y aller, pas de gagner.
    const facts = {
      ...NOTHING_DONE,
      goldenSlain: true,
      maleniaSlain: true,
      challengeDone: true,
    }

    expect(stateOf(facts, 'beyond')).toBe('done')
  })
})

describe('activeQuest', () => {
  it('rend la seule quête ouverte', () => {
    expect(activeQuest(questBoard(NOTHING_DONE))?.id).toBe('clear-continent')
  })

  it('rend null quand tout est accompli', () => {
    expect(activeQuest(questBoard(PROGRESSION[PROGRESSION.length - 1]))).toBeNull()
  })

  it('avance avec la partie', () => {
    const seen = PROGRESSION.map((facts) => activeQuest(questBoard(facts))?.id ?? null)

    expect(seen).toEqual([
      'clear-continent',
      'clear-continent',
      'sky-portal',
      null,
      'lynel-trial',
      'golden-lynel',
      'aeonia',
      'beyond',
      null,
    ])
  })
})
