import { beforeEach, describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { TRIAL_COUNT } from '../config/quests'
import { chestById } from '../config/chests'
import { advance, now as gameNow, resetClock } from '../state/gameClock'
import { dropPickup, pickups } from '../state/pickups'
import { fireProjectile, projectiles } from '../state/projectiles'
import { MAX_HEARTS, SKY_BOON_HEARTS, useGameStore } from './useGameStore'

/**
 * La progression : les coffres, les cartes, et les deux boss.
 *
 * Trois endroits où une garde mal posée se paie en partie bloquée plutôt qu'en
 * cœur perdu — une herse qui ne se lève plus, un coffre qui se rouvre, un
 * combat qui reste « en cours » sur une carte qu'on a quittée. Ce sont les
 * défauts qu'on ne voit qu'en rejouant une partie entière.
 */

const store = () => useGameStore.getState()

/** Fait le voyage d'un bout à l'autre, comme le fait l'anneau. */
function travel(to: Parameters<ReturnType<typeof store>['enterMap']>[0]) {
  store().enterMap(to)
  store().arriveOnMap()
  store().finishTransit()
}

beforeEach(() => {
  store().reset()
  resetClock()
})

describe('les coffres', () => {
  it('s ouvre une fois et met la partie en pause', () => {
    expect(store().openChest('temple-chest')).toBe(true)
    expect(store().chestReveal).toBe('temple-chest')
    expect(store().phase).toBe('paused')
  })

  it('ne se rouvre pas', () => {
    store().openChest('temple-chest')
    store().finishChest()

    expect(store().openChest('temple-chest')).toBe(false)
  })

  it('reste marqué ouvert dès le premier instant', () => {
    // C'est cet état qui tient le couvercle relevé, y compris si le composant
    // remonte pendant la séquence.
    store().openChest('temple-chest')

    expect(store().openedChests).toContain('temple-chest')
  })

  it('range l invite en s ouvrant', () => {
    useGameStore.setState({ nearbyChest: 'temple-chest' })

    store().openChest('temple-chest')

    expect(store().nearbyChest).toBeNull()
  })

  it('refuse hors de la phase de jeu', () => {
    useGameStore.setState({ phase: 'gameover' })

    expect(store().openChest('temple-chest')).toBe(false)
  })

  it('révèle l objet du coffre', () => {
    store().openChest('temple-chest')

    store().resolveChest()

    expect(store().activeItem).toBe(chestById('temple-chest')!.item)
  })

  it('verse l objet à l inventaire et rend la main', () => {
    store().openChest('temple-chest')
    store().resolveChest()

    store().finishChest()

    expect(store().items).toContain('zoro-garb')
    expect(store().phase).toBe('playing')
    expect(store().chestReveal).toBeNull()
  })

  it('démarre la réserve de cœurs jaunes pleine', () => {
    store().openChest('temple-chest')

    store().finishChest()

    expect(store().bonusCarry['zoro-garb']).toBe(2)
  })

  it('équipe à la demande, et seulement après avoir versé', () => {
    store().openChest('temple-chest')

    store().finishChest(true)

    // `equipItem` relit le store et refuse un objet absent d'`items` : il n'y
    // entre qu'à la ligne du dessus.
    expect(store().equipped.outfit).toBe('zoro-garb')
    expect(store().hearts).toBe(MAX_HEARTS + 2)
  })

  it('ne verse pas deux fois le même objet', () => {
    store().openChest('temple-chest')
    store().finishChest()
    useGameStore.setState({ openedChests: [], chestReveal: 'temple-chest' })

    store().finishChest()

    expect(store().items.filter((id) => id === 'zoro-garb')).toHaveLength(1)
  })

  it('ne fait rien sans coffre ouvert', () => {
    store().resolveChest()
    store().finishChest()

    expect(store().activeItem).toBeNull()
    expect(store().items).toEqual([])
  })
})

describe('le voyage entre les cartes', () => {
  it('part en voyage et retient d où l on vient', () => {
    expect(store().enterMap('sky')).toBe(true)
    expect(store().transit).toBe('sky')
    expect(store().transitFrom).toBe('continent')
    expect(store().phase).toBe('paused')
  })

  it('ne part pas deux fois', () => {
    store().enterMap('sky')

    expect(store().enterMap('rot')).toBe(false)
    expect(store().transit).toBe('sky')
  })

  it('ne voyage pas vers la carte où l on est', () => {
    expect(store().enterMap('continent')).toBe(false)
  })

  it('refuse hors de la phase de jeu', () => {
    useGameStore.setState({ phase: 'gameover' })

    expect(store().enterMap('sky')).toBe(false)
  })

  it('n hérite pas du lieu d un autre voyage', () => {
    useGameStore.setState({ transitLandmark: 'temple' })

    store().enterMap('sky')

    expect(store().transitLandmark).toBeNull()
  })

  it('ne bascule la carte qu à l arrivée', () => {
    store().enterMap('sky')
    expect(store().location).toBe('continent')

    store().arriveOnMap()

    expect(store().location).toBe('sky')
  })

  it('laisse la partie en pause jusqu au retrait du voile', () => {
    store().enterMap('sky')
    store().arriveOnMap()

    // Sans ça la physique reprendrait derrière un écran encore opaque, et le
    // joueur pourrait tomber de l île avant d avoir vu où il a atterri.
    expect(store().phase).toBe('paused')

    store().finishTransit()

    expect(store().phase).toBe('playing')
  })

  it('ne fait rien sans voyage en cours', () => {
    store().arriveOnMap()

    expect(store().location).toBe('continent')
  })

  it('s abandonne sans changer de carte', () => {
    store().enterMap('sky')

    store().abortTransit()

    expect(store().transit).toBeNull()
    expect(store().location).toBe('continent')
  })
})

describe('la prime de l Île Céleste', () => {
  it('rend trois cœurs rouges à la première arrivée', () => {
    travel('sky')

    expect(store().maxHearts).toBe(MAX_HEARTS + SKY_BOON_HEARTS)
    expect(store().hearts).toBe(MAX_HEARTS + SKY_BOON_HEARTS)
    expect(store().skyBoonTaken).toBe(true)
  })

  it('refait la vie au passage', () => {
    useGameStore.setState({ hearts: 1 })

    travel('sky')

    expect(store().hearts).toBe(store().heartCapacity())
  })

  it('ne la rend qu une fois', () => {
    travel('sky')
    travel('continent')
    travel('sky')

    expect(store().maxHearts).toBe(MAX_HEARTS + SKY_BOON_HEARTS)
  })

  it('est un acquis définitif et non des cœurs jaunes', () => {
    useGameStore.setState({ items: ['zoro-garb'] })
    store().equipItem('zoro-garb')

    travel('sky')
    store().unequipItem('zoro-garb')

    // Changer de tenue sur l île effacerait des jaunes ; ceux-là restent.
    expect(store().maxHearts).toBe(MAX_HEARTS + SKY_BOON_HEARTS)
    expect(store().hearts).toBe(MAX_HEARTS + SKY_BOON_HEARTS)
  })

  it('marque la visite, et ne l efface pas au retour', () => {
    travel('sky')
    travel('continent')

    expect(store().skyVisited).toBe(true)
  })
})

describe('le gardien de la rotonde', () => {
  it('s engage une fois', () => {
    store().startBossFight()

    expect(store().bossState).toBe('fighting')
    expect(store().arenaFight).toBe('guardian')
  })

  it('est idempotent — le Lynel appelle depuis sa boucle', () => {
    store().startBossFight()
    store().endBossFight(true)

    store().startBossFight()

    expect(store().bossState).toBe('defeated')
  })

  it('enregistre la victoire même sans combat engagé', () => {
    // L onde d annihilation tue sans qu on ait affronté : un boss mort est
    // mort, et trois choses en dépendent — le coffre, le réceptacle et la
    // herse de l épreuve.
    store().endBossFight(true)

    expect(store().bossState).toBe('defeated')
  })

  it('ne se relève pas une fois vaincu', () => {
    store().endBossFight(true, [1, 2, 3])
    const fellAt = store().bossFellAt

    store().endBossFight(false)

    expect(store().bossState).toBe('defeated')
    expect(store().bossFellAt).toEqual(fellAt)
  })

  it('redevient disponible après un abandon', () => {
    store().startBossFight()

    store().endBossFight(false)

    expect(store().bossState).toBe('idle')
    expect(store().arenaFight).toBeNull()
  })

  it('ne renonce pas à un combat jamais commencé', () => {
    store().endBossFight(false)

    expect(store().bossState).toBe('idle')
  })

  it('se termine en quittant l île', () => {
    travel('sky')
    store().startBossFight()

    travel('continent')

    // Sa boucle est gardée par `phase === 'playing'`, que le voyage met en
    // pause : sans cette sortie, le continent se jouerait avec la caméra
    // serrée de l arène.
    expect(store().bossState).toBe('idle')
  })
})

describe('Malenia', () => {
  it('enregistre la victoire une fois pour la partie', () => {
    store().endMaleniaFight(true, [1, 2, 3])
    const slainAt = store().maleniaSlainAt

    store().endMaleniaFight(true, [9, 9, 9])

    expect(store().maleniaSlainAt).toBe(slainAt)
    expect(store().maleniaFellAt).toEqual([1, 2, 3])
  })

  it('redevient disponible tant qu elle n est pas tombée', () => {
    store().startMaleniaFight()

    store().endMaleniaFight(false)

    expect(store().arenaFight).toBeNull()
    expect(store().maleniaSlainAt).toBeNull()
  })

  it('ne s engage pas par-dessus un autre combat', () => {
    store().startBossFight()

    store().startMaleniaFight()

    expect(store().arenaFight).toBe('guardian')
  })
})

describe('l épreuve des trois bêtes', () => {
  it('compte chaque bête une seule fois', () => {
    store().registerTrialKill('trial-1')
    store().registerTrialKill('trial-1')

    expect(store().trialSlain).toEqual(['trial-1'])
  })

  it('verse le réceptacle à la troisième', () => {
    for (let i = 0; i < TRIAL_COUNT - 1; i++) store().registerTrialKill(`trial-${i}`)
    expect(store().maxHearts).toBe(MAX_HEARTS)

    store().registerTrialKill('trial-last')

    expect(store().maxHearts).toBe(MAX_HEARTS + 1)
    expect(store().heartContainers).toContain('trial')
  })

  it('ne verse pas deux fois', () => {
    for (let i = 0; i < TRIAL_COUNT + 2; i++) store().registerTrialKill(`trial-${i}`)

    expect(store().maxHearts).toBe(MAX_HEARTS + 1)
  })

  it('le doré verse le sien, une fois', () => {
    store().registerGoldenKill()
    const slainAt = store().goldenSlainAt

    store().registerGoldenKill()

    expect(store().goldenSlainAt).toBe(slainAt)
    expect(store().maxHearts).toBe(MAX_HEARTS + 1)
  })
})

describe('la remise à zéro d une nouvelle partie', () => {
  /*
    Les pools qui vivent hors de React, et qu'`initialState` ne peut pas voir.

    `reset` en nomme déjà quatre — l'horloge, les compteurs de combat, la
    pourriture, la difficulté — pour cette raison exacte : un objet de module ne
    revient pas à sa valeur de départ parce que le store, lui, y est revenu.
    Les cœurs au sol et les projectiles en vol sont de la même famille, et ils
    se voient plus que les autres : ce sont des objets à l'écran.

    À ne pas confondre avec le relèvement après une mort, qui garde les cœurs
    exprès — ils sont tombés d'ennemis vaincus et le monde continue. Ici le
    monde recommence.
  */
  it('vide les cœurs restés au sol', () => {
    dropPickup(4, 2, -7)
    expect(pickups.filter((pickup) => pickup.active)).toHaveLength(1)

    store().reset()

    expect(pickups.filter((pickup) => pickup.active)).toHaveLength(0)
  })

  it('vide les projectiles restés en vol', () => {
    fireProjectile(new Vector3(0, 1, 0), new Vector3(6, 1, 0))
    expect(projectiles.filter((projectile) => projectile.active)).toHaveLength(1)

    store().reset()

    expect(projectiles.filter((projectile) => projectile.active)).toHaveLength(0)
  })

  it('ne laisse pas un cœur de la partie précédente survivre à l horloge', () => {
    /*
      La raison pour laquelle le pool ne se vidait pas tout seul.

      `reset` remet l'horloge à zéro, donc l'âge d'un cœur lâché à la minute
      trois devient négatif. Le test d'expiration de `Pickups` — `age >
      PICKUP_LIFETIME_MS` — ne l'atteint jamais : sans ce nettoyage, il restait
      ramassable pour toute la partie suivante.
    */
    advance(180)
    dropPickup(4, 2, -7)
    const born = pickups.find((pickup) => pickup.active)?.bornAt ?? 0

    store().reset()

    // Le cœur est né trois minutes après un zéro que `reset` vient de rétablir :
    // son âge est désormais négatif, donc il n'expirerait jamais.
    expect(born).toBeGreaterThan(gameNow())
    expect(pickups.some((pickup) => pickup.active)).toBe(false)
  })
})
