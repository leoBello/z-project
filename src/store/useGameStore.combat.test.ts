import { beforeEach, describe, expect, it } from 'vitest'
import type { ItemId } from '../types/game'
import type { EnemyKind } from '../types/game'
import { applyDifficulty, resetDifficulty } from '../state/difficulty'
import { advance, resetClock } from '../state/gameClock'
import { playerTransform } from '../state/playerTransform'
import { CRIT_MULTIPLIER, INVULNERABILITY_MS, MAX_HEARTS, useGameStore } from './useGameStore'

/**
 * Le combat, vu depuis le store.
 *
 * Tout ce qui décide de ce qu'un coup coûte et de ce qu'il rend vit ici :
 * `damageTaken`, `swordDamage`, `critChance` et `damagePlayer`. Les quatre sont
 * lus par les trois familles d'ennemis, donc une erreur ici ne se voit nulle
 * part en particulier et partout un peu.
 */

const store = () => useGameStore.getState()

/** Dote le joueur d'un objet et le lui fait porter, comme le ferait un coffre. */
function equip(...ids: ItemId[]) {
  useGameStore.setState({ items: [...store().items, ...ids] })
  for (const id of ids) store().equipItem(id)
}

/** Frappe le joueur en sortant d'abord de la fenêtre d'invulnérabilité. */
function hit(amount?: number, from?: EnemyKind) {
  advance(INVULNERABILITY_MS / 1000 + 0.1)
  store().damagePlayer(amount, from)
}

beforeEach(() => {
  store().reset()
  resetClock()
  resetDifficulty()
  playerTransform.critical = false
})

describe('damageTaken', () => {
  it('rend le coup nu tel quel', () => {
    expect(store().damageTaken(1)).toBe(1)
    expect(store().damageTaken(3)).toBe(3)
  })

  it("plancher d'un cœur : une égratignure ne devient jamais gratuite", () => {
    expect(store().damageTaken(0.5)).toBe(1)
    expect(store().damageTaken(0.01)).toBe(1)
  })

  it('compose les multiplicateurs de tout ce qui est porté', () => {
    equip('cursed-blade')

    expect(store().damageTaken(1)).toBe(2)
    expect(store().damageTaken(2)).toBe(4)
  })

  it("applique le tarif d'espèce par-dessus le tarif général", () => {
    equip('demon-armor')

    expect(store().damageTaken(2, 'lynel')).toBe(1)
    expect(store().damageTaken(2, 'moblin')).toBe(2)
  })

  it('lame maudite et armure du Dieu Démon se composent au lieu de s exclure', () => {
    equip('cursed-blade', 'demon-armor')

    // ×2 general, ÷2 contre le Lynel : tarif normal contre lui seul.
    expect(store().damageTaken(2, 'lynel')).toBe(2)
    // Et double contre tout le reste du monde.
    expect(store().damageTaken(2, 'moblin')).toBe(4)
  })
})

describe('swordDamage', () => {
  it('vaut un cœur à mains nues', () => {
    expect(store().swordDamage()).toBe(1)
  })

  it("multiplie sur tout l'équipement, tenue comprise", () => {
    equip('kusanagi')
    expect(store().swordDamage()).toBe(2)

    // Le manteau de l'Aube (×1,5) est une *tenue* et compte quand même.
    equip('dawn-cloak')
    expect(store().swordDamage()).toBe(3)
  })

  it('arrondit le produit fractionnaire', () => {
    equip('dawn-cloak')

    // 1 × 1,5 = 1,5 → 2.
    expect(store().swordDamage()).toBe(2)
  })

  it('double le coup quand le geste est parti critique', () => {
    equip('kusanagi')
    playerTransform.critical = true

    expect(store().swordDamage()).toBe(2 * CRIT_MULTIPLIER)
  })

  it('le critique est lu et non tiré — le même geste vaut pareil deux fois', () => {
    playerTransform.critical = true

    expect(store().swordDamage()).toBe(store().swordDamage())
  })
})

describe('critChance', () => {
  it('est nulle sans rien qui en donne', () => {
    expect(store().critChance()).toBe(0)
  })

  it("prend la valeur de l'objet qui en porte", () => {
    equip('kuroro-garb')

    expect(store().critChance()).toBeCloseTo(0.3)
  })

  it('reste une probabilité — jamais une somme qui dépasserait un', () => {
    equip('kuroro-garb', 'kusanagi', 'fishman-scales')

    expect(store().critChance()).toBeLessThanOrEqual(1)
    expect(store().critChance()).toBeGreaterThanOrEqual(0)
  })
})

describe('damagePlayer', () => {
  it('retire les cœurs annoncés', () => {
    hit(2)

    expect(store().hearts).toBe(MAX_HEARTS - 2)
  })

  it('ignore les coups reçus pendant les i-frames', () => {
    hit(1)
    const hearts = store().hearts

    store().damagePlayer(1)
    advance(INVULNERABILITY_MS / 1000 - 0.1)
    store().damagePlayer(1)

    expect(store().hearts).toBe(hearts)
  })

  it('rouvre la garde une fois les i-frames écoulées', () => {
    hit(1)
    hit(1)

    expect(store().hearts).toBe(MAX_HEARTS - 2)
  })

  it('ne frappe pas un joueur qui ne joue pas', () => {
    useGameStore.setState({ phase: 'paused' })

    store().damagePlayer(2)

    expect(store().hearts).toBe(MAX_HEARTS)
  })

  it('termine la partie à zéro cœur', () => {
    hit(MAX_HEARTS)

    expect(store().hearts).toBe(0)
    expect(store().phase).toBe('gameover')
  })

  it('ne descend jamais sous zéro', () => {
    hit(MAX_HEARTS + 10)

    expect(store().hearts).toBe(0)
  })

  it('range le combat de boss avec le joueur', () => {
    useGameStore.setState({ bossState: 'fighting' })

    hit(MAX_HEARTS)

    expect(store().bossState).toBe('idle')
  })

  it('applique la difficulté avant le tarif des objets', () => {
    applyDifficulty('hard')

    hit(1)

    // 1 × 1,6 = 1,6 → 2.
    expect(store().hearts).toBe(MAX_HEARTS - 2)
  })

  it('en facile, les gros coups sont divisés mais pas les égratignures', () => {
    applyDifficulty('easy')

    hit(1)
    expect(store().hearts).toBe(MAX_HEARTS - 1)

    hit(2)
    expect(store().hearts).toBe(MAX_HEARTS - 2)
  })
})

describe('damagePlayer — le second souffle', () => {
  beforeEach(() => {
    equip('dawn-cloak')
  })

  it('annule le coup fatal et rend les cœurs rouges', () => {
    hit(99)

    expect(store().hearts).toBe(MAX_HEARTS)
    expect(store().reviveUsed).toBe(true)
    expect(store().phase).toBe('playing')
  })

  it('ne rend pas les cœurs jaunes de la tenue', () => {
    hit(99)

    expect(store().hearts).toBeLessThan(store().heartCapacity())
  })

  it('couvre le relèvement par des i-frames', () => {
    hit(99)

    expect(store().isInvulnerable()).toBe(true)
  })

  it('ne sert qu une fois par partie', () => {
    hit(99)
    hit(99)

    expect(store().phase).toBe('gameover')
  })

  it('retirer et remettre la tenue ne recharge pas un souffle dépensé', () => {
    hit(99)
    store().unequipItem('dawn-cloak')
    store().equipItem('dawn-cloak')

    hit(99)

    expect(store().phase).toBe('gameover')
  })
})

describe('healPlayer', () => {
  it('rend un cœur et le dit', () => {
    hit(2)

    expect(store().healPlayer()).toBe(true)
    expect(store().hearts).toBe(MAX_HEARTS - 1)
  })

  it('refuse à pleine vie, pour que le cœur ne soit pas consommé', () => {
    expect(store().healPlayer()).toBe(false)
    expect(store().hearts).toBe(MAX_HEARTS)
  })

  it('ne dépasse jamais la capacité', () => {
    hit(1)

    store().healPlayer(10)

    expect(store().hearts).toBe(store().heartCapacity())
  })

  it('refuse hors de la phase de jeu', () => {
    hit(2)
    useGameStore.setState({ phase: 'paused' })

    expect(store().healPlayer()).toBe(false)
  })

  it('peut refaire une case jaune entamée', () => {
    equip('zoro-garb')
    hit(1)

    expect(store().healPlayer()).toBe(true)
    expect(store().hearts).toBe(MAX_HEARTS + 2)
  })
})
