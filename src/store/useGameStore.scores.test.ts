import { beforeEach, describe, expect, it } from 'vitest'
import { resetClock } from '../state/gameClock'
import { useGameStore } from './useGameStore'
import { useScoresStore } from './useScoresStore'

/**
 * Ce que la fin d'un défi laisse au classement.
 *
 * Deux choses seulement, et elles échouent silencieusement toutes les deux :
 *
 *  - **l'équipement de la course**, figé à l'arrêt du chronomètre. S'il se
 *    remettait à lire l'équipement courant, personne ne le verrait — sauf le
 *    classement par tenue, qui rangerait des courses sous la mauvaise, des
 *    semaines plus tard ;
 *  - **l'oubli de l'envoi précédent**. Sans lui, le panneau de résultat du
 *    deuxième défi rouvre sur la place obtenue au premier, et annonce un rang
 *    que le joueur vient de lire pour une course qu'il vient de finir.
 */

const store = () => useGameStore.getState()
const scores = () => useScoresStore.getState()

/** Pose le joueur sur l'Outremonde, comme le ferait le voyage par l'anneau. */
function goBeyond() {
  useGameStore.setState({ location: 'beyond' })
}

beforeEach(() => {
  store().reset()
  resetClock()
  scores().forgetSave()
})

describe("l'équipement du dernier défi", () => {
  it('retient la tenue de départ et ses poings quand rien n est porté', () => {
    goBeyond()
    store().acceptChallenge()
    store().beginChallenge()

    store().endChallenge(false)

    expect(store().challengeResultOutfit).toBe('luffy')
    expect(store().challengeResultWeapon).toBe('fists')
  })

  it('retient ce qui était porté au moment où le chronomètre s est arrêté', () => {
    goBeyond()
    useGameStore.setState({
      items: ['madara-garb', 'kusanagi'],
      equipped: { outfit: 'madara-garb', weapon: 'kusanagi' },
    })
    store().acceptChallenge()
    store().beginChallenge()

    store().endChallenge(false)

    expect(store().challengeResultOutfit).toBe('madara')
    expect(store().challengeResultWeapon).toBe('katana')
  })

  /*
    Le score reste affiché jusqu'au défi suivant, et le joueur peut ouvrir un
    coffre entre-temps. C'est le cas qui a motivé l'instantané : sans lui, la
    ligne enregistrée aurait porté la tenue trouvée **après** la course.
  */
  it('ne bouge plus quand le joueur se rééquipe après sa course', () => {
    goBeyond()
    store().acceptChallenge()
    store().beginChallenge()
    store().endChallenge(false)

    useGameStore.setState({ items: ['zoro-garb'] })
    store().equipItem('zoro-garb')

    expect(store().challengeResultOutfit).toBe('luffy')
  })
})

describe("l'envoi précédent", () => {
  it('est oublié quand un nouveau défi commence', () => {
    goBeyond()
    useScoresStore.setState({
      saveStatus: 'saved',
      mine: 'une-ligne',
      saved: {
        entry: {
          id: 'une-ligne',
          pseudo: 'Sangoku',
          score: 410,
          kills: 6,
          ranMs: 120_000,
          duration: '2min',
          difficulty: 'normal',
          outfit: 'luffy',
          weapon: 'fists',
          at: 1_800_000_000_000,
        },
        overall: { rank: 4, total: 37 },
        loadout: { rank: 1, total: 5 },
      },
    })

    store().acceptChallenge()

    expect(scores().saveStatus).toBe('idle')
    expect(scores().saved).toBeNull()
    expect(scores().mine).toBeNull()
  })

  it('survit à la fin de la course, qui ne le touche pas', () => {
    goBeyond()
    store().acceptChallenge()
    store().beginChallenge()
    useScoresStore.setState({ saveStatus: 'saving' })

    store().endChallenge(false)

    expect(scores().saveStatus).toBe('saving')
  })
})

describe('la règle du classement', () => {
  /*
    « Seuls les joueurs encore en vie peuvent enregistrer. » La règle est
    appliquée par `ScoreSubmit`, qui lit ce drapeau — c'est donc lui qui doit
    dire la vérité, et c'est la seule chose vérifiable sans monter de composant.
  */
  it('marque comme échouée la course qu une mort a interrompue', () => {
    goBeyond()
    store().acceptChallenge()
    store().beginChallenge()

    store().endChallenge(true)

    expect(store().challengeFailed).toBe(true)
  })

  it('ne marque pas comme échouée la course que le temps a arrêtée', () => {
    goBeyond()
    store().acceptChallenge()
    store().beginChallenge()

    store().endChallenge(false)

    expect(store().challengeFailed).toBe(false)
  })
})
