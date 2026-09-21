import { describe, expect, it } from 'vitest'
import {
  INVENTORY_SLOTS,
  ITEMS,
  hasEffect,
  inkOn,
  itemById,
  outfitOf,
  slotOf,
  traitsOf,
  weaponOf,
} from './items'
import type { Equipment } from './items'

/**
 * La table des objets, et les quatre lectures qu'on en fait.
 *
 * C'est elle qui décide de ce qu'un objet *fait* — le store et le rig ne font
 * que la lire. Deux pièges vivent ici et se sont déjà présentés : un champ
 * numérique omis sort un `NaN` de vitesse ou de dégâts, et un effet ajouté sans
 * être déclaré à `hasEffect` donne une carte d'objet vide alors que son texte
 * est écrit et traduit.
 */

describe('la table elle-même', () => {
  it('ne déclare aucun identifiant deux fois', () => {
    const ids = ITEMS.map((item) => item.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('se retrouve entièrement par identifiant', () => {
    for (const item of ITEMS) expect(itemById(item.id)).toBe(item)
  })

  it('rend undefined sur un identifiant inconnu', () => {
    expect(itemById('anneau-unique' as never)).toBeUndefined()
  })

  it('déclare tous ses multiplicateurs — un champ absent sort un NaN', () => {
    for (const item of ITEMS) {
      expect(Number.isFinite(item.attackMultiplier), item.id).toBe(true)
      expect(Number.isFinite(item.damageMultiplier), item.id).toBe(true)
      expect(Number.isFinite(item.reachMultiplier), item.id).toBe(true)
      expect(Number.isFinite(item.critChance), item.id).toBe(true)
      expect(Number.isFinite(item.bonusHearts), item.id).toBe(true)
      expect(Number.isFinite(item.revives), item.id).toBe(true)
      expect(Number.isFinite(item.traits.speed), item.id).toBe(true)
      expect(Number.isFinite(item.traits.jump), item.id).toBe(true)
      expect(Number.isFinite(item.traits.water), item.id).toBe(true)
    }
  })

  it('garde ses probabilités dans [0, 1] et ses multiplicateurs positifs', () => {
    for (const item of ITEMS) {
      expect(item.critChance, item.id).toBeGreaterThanOrEqual(0)
      expect(item.critChance, item.id).toBeLessThanOrEqual(1)
      expect(item.attackMultiplier, item.id).toBeGreaterThan(0)
      expect(item.damageMultiplier, item.id).toBeGreaterThan(0)
      expect(item.reachMultiplier, item.id).toBeGreaterThan(0)
    }
  })

  it('ne prête de cœurs jaunes que par les tenues', () => {
    for (const item of ITEMS) {
      if (item.kind !== 'outfit') expect(item.bonusHearts, item.id).toBe(0)
    }
  })

  it('donne une silhouette à chaque tenue et une arme à chaque arme', () => {
    for (const item of ITEMS) {
      if (item.kind === 'outfit') expect(item.outfit, item.id).toBeTruthy()
      if (item.kind === 'weapon') expect(item.weapon, item.id).toBeTruthy()
    }
  })

  it('ne donne ni silhouette ni arme à ce qui ne se porte pas', () => {
    // Une relique qui déclarerait une tenue ou une arme serait équipable par
    // `outfitOf` ou `weaponOf` sans passer par un emplacement : le personnage
    // changerait d'apparence en portant un objet que le store refuse d'équiper.
    for (const item of ITEMS) {
      if (slotOf(item) !== null) continue
      expect(item.outfit, item.id).toBeUndefined()
      expect(item.weapon, item.id).toBeUndefined()
    }
  })
})

describe('slotOf', () => {
  it('rend la famille comme emplacement pour tout ce qui se porte', () => {
    expect(slotOf(itemById('zoro-garb')!)).toBe('outfit')
    expect(slotOf(itemById('kusanagi')!)).toBe('weapon')
    expect(slotOf(itemById('fishman-scales')!)).toBe('trinket')
  })

  it("ne donne aucun emplacement à une relique", () => {
    expect(slotOf(itemById('konami-papyrus')!)).toBeNull()
  })
})

describe('INVENTORY_SLOTS', () => {
  /**
   * La garde qui empêche un objet d'être ramassé puis invisible.
   *
   * La grille ne rend que ses `INVENTORY_SLOTS` premières cases : le jour où la
   * table dépasse ce compte, le dernier objet trouvé entre bien dans `items` et
   * ne s'affiche nulle part. Ce test est la seule chose qui s'en aperçoive
   * avant le joueur qui finit le jeu.
   */
  it('a toujours au moins une case par objet du jeu', () => {
    expect(INVENTORY_SLOTS).toBeGreaterThanOrEqual(ITEMS.length)
  })

  it('remplit des rangées entières de quatre', () => {
    expect(INVENTORY_SLOTS % 4).toBe(0)
  })
})

describe('hasEffect', () => {
  it('reconnaît un effet à chacun des objets qui se portent', () => {
    // Aucun objet équipable ne s'affiche sans effet : c'est le piège que
    // l'en-tête de `hasEffect` décrit, et il s'est déjà présenté deux fois.
    for (const item of ITEMS) {
      if (slotOf(item) === null) continue
      expect(hasEffect(item), item.id).toBe(true)
    }
  })

  it('ne trouve aucun effet à une relique', () => {
    // L'exception est nommée plutôt que la règle assouplie : une relique n'a
    // rien à annoncer, et sa carte n'affiche donc pas de ligne d'effet. Le jour
    // où l'une d'elles en gagne un, c'est ici qu'on s'en aperçoit.
    for (const item of ITEMS) {
      if (slotOf(item) !== null) continue
      expect(hasEffect(item), item.id).toBe(false)
    }
  })

  it('reconnaît un effet qui ne vise qu une espèce', () => {
    const demon = itemById('demon-armor')!

    // Elle ne touche ni aux cœurs ni à aucun multiplicateur général : seul le
    // tarif du Lynel la distingue.
    expect(demon.bonusHearts).toBe(0)
    expect(demon.attackMultiplier).toBe(1)
    expect(hasEffect(demon)).toBe(true)
  })

  it('ne trouve rien à un objet qui ne fait rien', () => {
    const inert = { ...itemById('zoro-garb')!, bonusHearts: 0 }

    expect(hasEffect(inert)).toBe(false)
  })
})

describe('outfitOf', () => {
  it('rend la silhouette de départ sans tenue portée', () => {
    expect(outfitOf({})).toBe('luffy')
  })

  it('rend la silhouette de la tenue portée', () => {
    expect(outfitOf({ outfit: 'madara-garb' })).toBe('madara')
  })

  it('retombe sur la silhouette de départ sur une tenue inconnue', () => {
    expect(outfitOf({ outfit: 'toge-de-mage' as never })).toBe('luffy')
  })
})

describe('weaponOf', () => {
  it('donne à chaque silhouette une arme par défaut', () => {
    // Une table et non une suite de ternaires : le skin ajouté ne doit pas
    // hériter silencieusement du défaut du voisin.
    for (const item of ITEMS) {
      if (item.kind !== 'outfit') continue
      expect(weaponOf({}, item.outfit!), item.id).toBeTruthy()
    }
  })

  it("l'arme trouvée l'emporte sur le défaut du skin", () => {
    expect(weaponOf({ weapon: 'kusanagi' }, 'luffy')).toBe('katana')
    expect(weaponOf({ weapon: 'vader-saber' }, 'zoro')).toBe('saber')
  })

  it('le bretteur dégaine, l homme-caoutchouc cogne', () => {
    expect(weaponOf({}, 'zoro')).toBe('sword')
    expect(weaponOf({}, 'luffy')).toBe('fists')
  })

  it('retombe sur le défaut du skin si l arme portée est inconnue', () => {
    expect(weaponOf({ weapon: 'excalibur' as never }, 'zoro')).toBe('sword')
  })
})

describe('traitsOf', () => {
  it('part des aptitudes du skin', () => {
    const traits = traitsOf({ outfit: 'zoro-garb' }, 'zoro')

    expect(traits.speed).toBeCloseTo(1.18)
    expect(traits.jump).toBeCloseTo(1)
  })

  it('multiplie par ce que chaque objet porté déclare', () => {
    const bare = traitsOf({}, 'luffy')
    const scaled = traitsOf({ trinket: 'fishman-scales' }, 'luffy')

    expect(scaled.speed).toBeCloseTo(bare.speed * 0.85)
    expect(scaled.water).toBeCloseTo(bare.water * 2)
  })

  it('compose sans que l ordre compte', () => {
    const a = traitsOf({ outfit: 'madara-garb', trinket: 'fishman-scales' }, 'madara')
    const b = traitsOf({ trinket: 'fishman-scales', outfit: 'madara-garb' }, 'madara')

    expect(a).toEqual(b)
  })

  it('ignore un objet inconnu au lieu de sortir un NaN', () => {
    const traits = traitsOf({ weapon: 'excalibur' as never }, 'luffy')

    expect(Number.isFinite(traits.speed)).toBe(true)
    expect(traits.speed).toBeCloseTo(1)
  })

  it('rend un objet neuf à chaque appel', () => {
    const equipment: Equipment = { outfit: 'zoro-garb' }

    expect(traitsOf(equipment, 'zoro')).not.toBe(traitsOf(equipment, 'zoro'))
  })

  it('ne rend jamais une aptitude nulle ou négative', () => {
    for (const item of ITEMS) {
      const slot = slotOf(item)
      const outfit = item.kind === 'outfit' ? item.outfit! : 'luffy'
      // Une relique ne s'équipe pas : on l'évalue sac vide, ce qui est
      // exactement l'état dans lequel elle laisse le personnage.
      const traits = traitsOf(slot ? { [slot]: item.id } : {}, outfit)

      expect(traits.speed, item.id).toBeGreaterThan(0)
      expect(traits.jump, item.id).toBeGreaterThan(0)
      expect(traits.water, item.id).toBeGreaterThan(0)
    }
  })
})

/**
 * L'encre du bouton « Équiper », sur l'aplat d'accent de chaque objet.
 *
 * Le piège que ce bloc garde est celui qui s'est déjà produit : le manteau de
 * Kuroro a pour accent le blanc cassé de sa fourrure, et le bouton écrivait
 * dessus en crème — texte invisible. Il se reproduira au prochain objet clair
 * si personne ne vérifie, parce que l'accent est choisi pour le glyphe de
 * l'inventaire, où toute teinte claire va bien.
 */
describe("l'encre lisible sur un accent", () => {
  /** Luminance relative WCAG — la même formule que l'implémentation. */
  const luminance = (hex: string) => {
    const channel = (offset: number) => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }

    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  }

  const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)]
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }

  it('atteint le seuil AA sur tous les accents de la table', () => {
    for (const item of ITEMS) {
      expect(contrast(item.accent, inkOn(item.accent)), item.id).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('écrit sombre sur un accent clair', () => {
    // Le manteau de Kuroro, justement : l'accent le plus clair de la table.
    expect(inkOn('#eceae3')).toBe(inkOn('#ffffff'))
    expect(contrast('#eceae3', inkOn('#eceae3'))).toBeGreaterThan(10)
  })

  it('écrit clair sur un accent sombre', () => {
    expect(inkOn('#000000')).toBe(inkOn('#b03a3a'))
    expect(contrast('#000000', inkOn('#000000'))).toBeGreaterThan(10)
  })
})
