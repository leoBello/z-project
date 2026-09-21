import { beforeEach, describe, expect, it } from 'vitest'
import type { EnemyKind, ItemId } from '../types/game'
import { ROT } from '../config/rotBlight'
import { advance, resetClock } from '../state/gameClock'
import { rot, soakRot } from '../state/rot'
import { INVULNERABILITY_MS, MAX_HEARTS, useGameStore } from './useGameStore'

/**
 * Les cœurs jaunes, et la mémoire de ce qu'il en restait.
 *
 * C'est le coin du store où une erreur se monnaie : l'inventaire met le jeu en
 * pause, donc tout ce qui rend des cœurs en le fermant est un soin gratuit,
 * instantané et illimité. Trois règles tiennent ça debout — la barre est un pool
 * unique, `bonusCarry` se souvient par objet, et le second souffle se compte par
 * partie — et chacune a ici ses cas limites.
 */

const store = () => useGameStore.getState()

function give(...ids: ItemId[]) {
  useGameStore.setState({ items: [...store().items, ...ids] })
}

function equip(...ids: ItemId[]) {
  give(...ids)
  for (const id of ids) store().equipItem(id)
}

function hit(amount?: number, from?: EnemyKind) {
  advance(INVULNERABILITY_MS / 1000 + 0.1)
  store().damagePlayer(amount, from)
}

beforeEach(() => {
  store().reset()
  resetClock()
})

describe('equipItem', () => {
  it('pose les cœurs jaunes de la tenue, pleins au premier port', () => {
    equip('zoro-garb')

    expect(store().bonusHearts).toBe(2)
    expect(store().heartCapacity()).toBe(MAX_HEARTS + 2)
    expect(store().hearts).toBe(MAX_HEARTS + 2)
  })

  it('refuse un objet absent de l inventaire', () => {
    store().equipItem('zoro-garb')

    expect(store().equipped.outfit).toBeUndefined()
    expect(store().bonusHearts).toBe(0)
  })

  it('refuse de réequiper ce qui est déjà porté', () => {
    equip('zoro-garb')
    const hearts = store().hearts

    store().equipItem('zoro-garb')

    expect(store().hearts).toBe(hearts)
    expect(store().bonusHearts).toBe(2)
  })

  it('une arme ne touche ni à la barre ni aux cœurs jaunes de la tenue', () => {
    equip('zoro-garb')
    const hearts = store().hearts

    equip('kusanagi')

    expect(store().hearts).toBe(hearts)
    expect(store().bonusHearts).toBe(2)
  })
})

describe('unequipItem / bonusCarry', () => {
  it('retire les cœurs jaunes avec la tenue', () => {
    equip('zoro-garb')

    store().unequipItem('zoro-garb')

    expect(store().bonusHearts).toBe(0)
    expect(store().hearts).toBe(MAX_HEARTS)
    expect(store().heartCapacity()).toBe(MAX_HEARTS)
  })

  it('se souvient de ce qui restait de jaune', () => {
    equip('zoro-garb')
    hit(1)

    store().unequipItem('zoro-garb')

    expect(store().bonusCarry['zoro-garb']).toBe(1)
  })

  it('ne rend que ce qui restait au ré-équipement', () => {
    equip('zoro-garb')
    hit(1)
    store().unequipItem('zoro-garb')

    store().equipItem('zoro-garb')

    // Un jaune consommé reste consommé : le tour par le menu ne soigne pas.
    expect(store().hearts).toBe(MAX_HEARTS + 1)
    expect(store().heartCapacity()).toBe(MAX_HEARTS + 2)
  })

  it('le va-et-vient dans le menu ne soigne jamais, même répété', () => {
    equip('zoro-garb')
    hit(2)
    const hearts = store().hearts

    for (let i = 0; i < 5; i++) {
      store().unequipItem('zoro-garb')
      store().equipItem('zoro-garb')
    }

    expect(store().hearts).toBe(hearts)
  })

  it('ne rend rien quand les rouges aussi sont entamés', () => {
    equip('zoro-garb')
    hit(4)
    store().unequipItem('zoro-garb')

    expect(store().bonusCarry['zoro-garb']).toBe(0)
    expect(store().hearts).toBe(MAX_HEARTS + 2 - 4)
  })

  it('refuse de retirer ce qui n est pas porté', () => {
    equip('zoro-garb')

    store().unequipItem('madara-garb')

    expect(store().equipped.outfit).toBe('zoro-garb')
    expect(store().bonusHearts).toBe(2)
  })
})

describe('changer de tenue', () => {
  it('met de côté les jaunes de celle qui part', () => {
    equip('zoro-garb')
    hit(1)
    give('madara-garb')

    store().equipItem('madara-garb')

    expect(store().bonusCarry['zoro-garb']).toBe(1)
    expect(store().bonusHearts).toBe(3)
  })

  it('ne transfère pas les jaunes d une tenue à l autre', () => {
    equip('zoro-garb')
    hit(1)
    give('madara-garb')

    store().equipItem('madara-garb')
    store().equipItem('zoro-garb')

    // La tenue du bretteur retrouve son jaune entamé, pas celui du clan.
    expect(store().hearts).toBe(MAX_HEARTS + 1)
    expect(store().bonusHearts).toBe(2)
  })

  it('plafonne le report par la capacité jaune de la tenue d arrivée', () => {
    // L armure de Vador prête cinq jaunes, la tenue du bretteur deux.
    equip('vader-armor')
    give('zoro-garb')

    store().equipItem('zoro-garb')

    expect(store().bonusHearts).toBe(2)
    expect(store().hearts).toBeLessThanOrEqual(store().heartCapacity())
  })

  it('ne laisse jamais la barre dépasser sa capacité', () => {
    const outfits: ItemId[] = ['vader-armor', 'zoro-garb', 'madara-garb', 'dawn-cloak']
    give(...outfits)

    for (const id of outfits) {
      store().equipItem(id)
      expect(store().hearts).toBeLessThanOrEqual(store().heartCapacity())
    }
  })
})

describe('claimHeartContainer', () => {
  it('ajoute un cœur rouge et refait la vie en entier', () => {
    hit(3)

    expect(store().claimHeartContainer('rotunda')).toBe(true)
    expect(store().maxHearts).toBe(MAX_HEARTS + 1)
    expect(store().hearts).toBe(MAX_HEARTS + 1)
  })

  it('refait la vie cœurs jaunes compris', () => {
    equip('zoro-garb')
    hit(3)

    store().claimHeartContainer('rotunda')

    expect(store().hearts).toBe(store().heartCapacity())
  })

  it('ne se réclame qu une fois', () => {
    store().claimHeartContainer('rotunda')

    expect(store().claimHeartContainer('rotunda')).toBe(false)
    expect(store().maxHearts).toBe(MAX_HEARTS + 1)
  })

  it('refuse hors de la phase de jeu', () => {
    useGameStore.setState({ phase: 'paused' })

    expect(store().claimHeartContainer('rotunda')).toBe(false)
  })

  it('le réceptacle agrandit la réserve rouge sous les jaunes déjà posés', () => {
    equip('zoro-garb')

    store().claimHeartContainer('rotunda')
    store().unequipItem('zoro-garb')

    // Les deux jaunes partent, les six rouges restent pleins.
    expect(store().hearts).toBe(MAX_HEARTS + 1)
  })
})

describe('reset', () => {
  it('rend une partie neuve sans rien laisser de l ancienne', () => {
    equip('zoro-garb', 'kusanagi')
    hit(2)
    store().claimHeartContainer('rotunda')

    store().reset()

    expect(store().hearts).toBe(MAX_HEARTS)
    expect(store().maxHearts).toBe(MAX_HEARTS)
    expect(store().bonusHearts).toBe(0)
    expect(store().equipped).toEqual({})
    expect(store().items).toEqual([])
    expect(store().bonusCarry).toEqual({})
    expect(store().heartContainers).toEqual([])
    expect(store().reviveUsed).toBe(false)
    expect(store().phase).toBe('playing')
  })

  it('ne partage aucune collection entre deux parties', () => {
    store().reset()
    const first = store().items
    equip('kusanagi')

    store().reset()

    // `initialState` est un objet unique : réutiliser ses tableaux ferait
    // fuiter une partie dans la suivante.
    expect(first).toEqual([])
    expect(store().items).not.toBe(first)
  })

  it('incrémente le compteur de partie', () => {
    const before = store().runId

    store().reset()

    expect(store().runId).toBe(before + 1)
  })

  /*
    La jauge de pourriture vit hors de React, donc hors d'`initialState`, et
    c'était le trou : une partie relancée depuis le Marais rouvrait sur le
    continent avec le bandeau écarlate encore rempli sous les cœurs — où plus
    rien ne pouvait le vider, le reflux ne tournant que sur le Marais.
  */
  it('solde la jauge de pourriture, qui ne vit pas dans le store', () => {
    soakRot(ROT.max / 2)

    store().reset()

    expect(rot.level).toBe(0)
  })
})
