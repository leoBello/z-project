import { beforeEach, describe, expect, it } from 'vitest'
import { COUNTDOWN_MS, KILL_POINTS, categoryKey } from '../config/challenge'
import { enemyTotal } from '../config/enemies'
import { difficulty } from '../state/difficulty'
import { advance, resetClock } from '../state/gameClock'
import { INVULNERABILITY_MS, MAX_HEARTS, useGameStore } from './useGameStore'

/**
 * Le défi du maître : le compteur, le barème, le record, et les deux façons
 * d'en sortir.
 *
 * C'est la seule mécanique du jeu dont le résultat est un **nombre conservé**,
 * donc la seule où une erreur laisse une trace que le joueur relit. Les cas qui
 * comptent sont les transitions : ce qui arrive quand le temps tombe à zéro et
 * qu'un coup fatal part la même frame, et ce qui arrive quand on quitte la carte
 * en cours de course.
 */

const store = () => useGameStore.getState()

/** Pose le joueur sur l'Outremonde, comme le ferait le voyage par l'anneau. */
function goBeyond() {
  useGameStore.setState({ location: 'beyond' })
}

/** Lance un défi et le met en course. */
function run() {
  goBeyond()
  store().acceptChallenge()
  store().beginChallenge()
}

function hit(amount?: number) {
  advance(INVULNERABILITY_MS / 1000 + 0.1)
  store().damagePlayer(amount)
}

beforeEach(() => {
  store().reset()
  resetClock()
})

describe('acceptChallenge', () => {
  it('part en décompte avec les compteurs à zéro', () => {
    goBeyond()
    useGameStore.setState({ challengeKills: 9, challengeScore: 999 })

    store().acceptChallenge()

    expect(store().challenge).toBe('countdown')
    expect(store().challengeKills).toBe(0)
    expect(store().challengeScore).toBe(0)
  })

  it('rend la main au joueur au lieu de le laisser en pause', () => {
    goBeyond()
    useGameStore.setState({ phase: 'paused', senseiOffer: true })

    store().acceptChallenge()

    expect(store().phase).toBe('playing')
    expect(store().senseiOffer).toBe(false)
  })

  it('relève le monde entier', () => {
    goBeyond()
    const before = store().populationId

    store().acceptChallenge()

    expect(store().populationId).toBe(before + 1)
  })

  it('réaffirme la difficulté choisie', () => {
    goBeyond()
    store().setChallengeDifficulty('hard')

    store().acceptChallenge()

    expect(difficulty.damage).toBe(1.6)
  })

  it('ne se relance pas par-dessus un défi en cours', () => {
    run()
    const started = store().challengeStartedAt

    store().acceptChallenge()

    expect(store().challenge).toBe('running')
    expect(store().challengeStartedAt).toBe(started)
  })
})

describe('beginChallenge', () => {
  it('ne part en course que depuis le décompte', () => {
    goBeyond()

    store().beginChallenge()

    expect(store().challenge).toBe('idle')
  })
})

describe('registerKill pendant un défi', () => {
  it('compte la victime et ses points', () => {
    run()

    store().registerKill('lynel')

    expect(store().challengeKills).toBe(1)
    expect(store().challengeScore).toBe(KILL_POINTS.lynel)
  })

  it('applique le multiplicateur de difficulté au barème', () => {
    goBeyond()
    store().setChallengeDifficulty('hard')
    store().acceptChallenge()
    store().beginChallenge()

    store().registerKill('octorok')

    expect(store().challengeScore).toBe(Math.round(KILL_POINTS.octorok * 1.6))
  })

  it('compte la victime même sans barème connu', () => {
    run()

    store().registerKill()

    expect(store().challengeKills).toBe(1)
    expect(store().challengeScore).toBe(0)
  })

  it('ne compte rien hors du continent quand aucun défi ne court', () => {
    goBeyond()

    store().registerKill('lynel')

    expect(store().challengeKills).toBe(0)
    expect(store().challengeScore).toBe(0)
  })

  it('ne compte rien pendant le décompte', () => {
    goBeyond()
    store().acceptChallenge()

    store().registerKill('lynel')

    expect(store().challengeKills).toBe(0)
  })

  it("une mort sur l'Outremonde ne touche pas au compteur du continent", () => {
    run()

    store().registerKill('lynel')

    expect(store().kills).toBe(0)
    expect(store().portalOpenedAt).toBeNull()
  })
})

describe('registerKill sur le continent', () => {
  it('ouvre le portail à la dernière bête, et à elle seule', () => {
    for (let i = 0; i < enemyTotal() - 1; i++) store().registerKill('octorok')

    expect(store().portalOpenedAt).toBeNull()

    store().registerKill('octorok')

    expect(store().portalOpenedAt).not.toBeNull()
  })

  it("ne rejoue pas l'ouverture au-delà du compte", () => {
    for (let i = 0; i < enemyTotal(); i++) store().registerKill('octorok')
    const opened = store().portalOpenedAt

    store().registerKill('octorok')

    expect(store().portalOpenedAt).toBe(opened)
  })
})

describe('endChallenge', () => {
  it('fige le score et met le panneau à l écran', () => {
    run()
    store().registerKill('lynel')

    store().endChallenge(false)

    expect(store().challenge).toBe('over')
    expect(store().challengeResult).toBe(KILL_POINTS.lynel)
    expect(store().challengeResultKills).toBe(1)
    expect(store().phase).toBe('paused')
  })

  it('est idempotent — le temps et un coup fatal peuvent tomber ensemble', () => {
    run()
    store().registerKill('lynel')

    store().endChallenge(false)
    store().endChallenge(true)

    expect(store().challengeFailed).toBe(false)
  })

  it('ne fait rien sur un défi qui ne court pas', () => {
    goBeyond()

    store().endChallenge(false)

    expect(store().challenge).toBe('idle')
    expect(store().challengeResult).toBeNull()
  })

  it('retire le décompte de la durée courue', () => {
    run()
    advance(COUNTDOWN_MS / 1000 + 10)

    store().endChallenge(false)

    expect(store().challengeResultMs).toBeCloseTo(10_000, 0)
  })

  it('ne rend jamais une durée négative', () => {
    run()

    store().endChallenge(false)

    expect(store().challengeResultMs).toBe(0)
  })

  it('garde le meilleur score de la catégorie', () => {
    const key = categoryKey(store().challengeDuration, store().challengeDifficulty)

    run()
    store().registerKill('lynel')
    store().endChallenge(false)
    store().dismissChallengeResult()

    run()
    store().registerKill('octorok')
    store().endChallenge(false)

    expect(store().challengeBests[key]).toEqual({
      score: KILL_POINTS.lynel,
      kills: 1,
    })
  })

  it('range chaque catégorie dans sa propre case', () => {
    run()
    store().registerKill('lynel')
    store().endChallenge(false)
    store().dismissChallengeResult()

    store().setChallengeDifficulty('hard')
    run()
    store().registerKill('octorok')
    store().endChallenge(false)

    expect(Object.keys(store().challengeBests)).toHaveLength(2)
  })

  it('retient aussi un défi mal fini — le score n est pas annulé', () => {
    const key = categoryKey(store().challengeDuration, store().challengeDifficulty)
    run()
    store().registerKill('lynel')

    store().endChallenge(true)

    expect(store().challengeFailed).toBe(true)
    expect(store().challengeBests[key].score).toBe(KILL_POINTS.lynel)
  })
})

describe('sorties du panneau de résultat', () => {
  it('la sortie sur place rend la main et remet les compteurs à zéro', () => {
    run()
    store().registerKill('lynel')
    store().endChallenge(false)

    store().dismissChallengeResult()

    expect(store().challenge).toBe('idle')
    expect(store().phase).toBe('playing')
    expect(store().challengeScore).toBe(0)
    // Le nombre reste affichable : c'est ce que le joueur vient de faire.
    expect(store().challengeResult).toBe(KILL_POINTS.lynel)
  })

  it('la sortie par le Sanctuaire fait la même chose', () => {
    run()
    store().endChallenge(false)

    store().returnToSanctuary()

    expect(store().challenge).toBe('idle')
    expect(store().phase).toBe('playing')
  })

  it('aucune des deux ne s applique à un défi encore en course', () => {
    run()

    store().dismissChallengeResult()
    store().returnToSanctuary()

    expect(store().challenge).toBe('running')
  })
})

describe('mourir sur l Outremonde', () => {
  it('relève au Sanctuaire au lieu de terminer la partie', () => {
    run()

    hit(MAX_HEARTS)

    // La partie reste en pause le temps du panneau de résultat — mais elle
    // n'est pas *finie*, et c'est toute la différence : il n'y a pas de Game
    // Over sur cette carte, elle vient après la partie.
    expect(store().phase).not.toBe('gameover')
    expect(store().hearts).toBe(store().heartCapacity())
  })

  it('arrête le défi en cours, et c est la seule conséquence', () => {
    run()
    store().registerKill('lynel')

    hit(MAX_HEARTS)

    expect(store().challenge).toBe('over')
    expect(store().challengeFailed).toBe(true)
    expect(store().challengeResult).toBe(KILL_POINTS.lynel)
  })

  it('refait la vie avant d ouvrir le panneau de résultat', () => {
    run()

    hit(MAX_HEARTS)

    // Le panneau met la partie en pause : la vie doit déjà être refaite,
    // sinon il s affiche sur une barre vide.
    expect(store().phase).toBe('paused')
    expect(store().hearts).toBe(store().heartCapacity())
  })

  it('ne touche à aucun défi quand il n y en a pas', () => {
    goBeyond()

    hit(MAX_HEARTS)

    expect(store().challenge).toBe('idle')
    expect(store().phase).toBe('playing')
  })
})

describe('quitter la carte en pleine course', () => {
  it('abandonne le défi sans panneau ni record', () => {
    const key = categoryKey(store().challengeDuration, store().challengeDifficulty)
    run()
    store().registerKill('lynel')

    store().enterMap('continent')

    expect(store().challenge).toBe('idle')
    expect(store().challengeKills).toBe(0)
    expect(store().challengeScore).toBe(0)
    expect(store().challengeBests[key]).toBeUndefined()
  })
})
