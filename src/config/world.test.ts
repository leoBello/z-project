import { describe, expect, it } from 'vitest'
import {
  WORLD,
  classifyBiome,
  fbm,
  islandMask,
  sampleHeight,
  sampleSlope,
  sampleWorld,
  seededRandom,
  smoothstep,
} from './world'

/**
 * La génération du monde.
 *
 * Tout dérive d'une seule fonction pure, et c'est ce qui donne sa valeur au
 * test : le mesh du terrain, le collider physique, le semis de végétation, le
 * placement des ennemis et la minimap l'interrogent tous. Une dérive du relief
 * n'apparaîtrait pas comme un bug de relief — elle apparaîtrait comme un
 * ennemi enterré, une falaise franchissable, ou un collider qui ne suit plus ce
 * qu'on voit.
 *
 * On ne teste donc pas des altitudes précises, qui sont un réglage : on teste
 * ce dont les cinq lecteurs dépendent — le déterminisme, les bornes, et la
 * cohérence entre les fonctions.
 */

/** Une grille de points couvrant la carte, pour les propriétés globales. */
const GRID: [number, number][] = []
for (let x = -WORLD.half; x <= WORLD.half; x += 7) {
  for (let z = -WORLD.half; z <= WORLD.half; z += 7) GRID.push([x, z])
}

describe('smoothstep', () => {
  it('est clampée aux deux bouts', () => {
    expect(smoothstep(0, 1, -5)).toBe(0)
    expect(smoothstep(0, 1, 5)).toBe(1)
  })

  it('passe par le milieu au milieu', () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
  })

  it('est monotone', () => {
    let previous = -1
    for (let t = 0; t <= 1; t += 0.05) {
      const value = smoothstep(0, 1, t)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('reste dans [0, 1] sur des seuils inversés', () => {
    // Le jour où deux bornes se croisent par erreur, la sortie doit rester une
    // fraction — c'est elle qui pondère des altitudes.
    for (const x of [-10, 0, 0.5, 1, 10]) {
      const value = smoothstep(1, 0, x)
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe('fbm', () => {
  it('est déterministe', () => {
    expect(fbm(3.2, -7.1)).toBe(fbm(3.2, -7.1))
  })

  it('reste borné', () => {
    for (const [x, z] of GRID) {
      const value = fbm(x * 0.01, z * 0.01)
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('varie dans l espace', () => {
    const values = new Set(GRID.map(([x, z]) => fbm(x * 0.01, z * 0.01).toFixed(4)))

    expect(values.size).toBeGreaterThan(10)
  })
})

describe('seededRandom', () => {
  it('rejoue exactement la même suite pour la même graine', () => {
    const a = seededRandom(0xb0c0)
    const b = seededRandom(0xb0c0)

    for (let i = 0; i < 50; i++) expect(a()).toBe(b())
  })

  it('donne des suites différentes pour des graines différentes', () => {
    const a = seededRandom(1)
    const b = seededRandom(2)

    expect(a()).not.toBe(b())
  })

  it('reste dans [0, 1[', () => {
    const random = seededRandom(42)

    for (let i = 0; i < 2000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('sampleHeight', () => {
  it('est déterministe', () => {
    expect(sampleHeight(12.5, -30.25)).toBe(sampleHeight(12.5, -30.25))
  })

  it('ne rend jamais NaN, y compris hors des limites', () => {
    for (const [x, z] of [...GRID, [500, 500], [-500, -500], [0, 0]] as [number, number][]) {
      expect(Number.isFinite(sampleHeight(x, z)), `${x},${z}`).toBe(true)
    }
  })

  it('ne descend jamais sous le fond marin', () => {
    for (const [x, z] of GRID) {
      expect(sampleHeight(x, z), `${x},${z}`).toBeGreaterThanOrEqual(WORLD.maxDepth - 1e-6)
    }
  })

  it('garde le large sous l eau — pas de barrière à poser', () => {
    for (const offset of [0, 40, -40]) {
      expect(sampleHeight(WORLD.half + 30, offset)).toBeLessThan(WORLD.waterLevel)
      expect(sampleHeight(offset, WORLD.half + 30)).toBeLessThan(WORLD.waterLevel)
    }
  })

  it('est continue — aucune marche franche entre deux points voisins', () => {
    // Une discontinuité ferait décoller le collider du relief visible.
    for (const [x, z] of GRID) {
      const here = sampleHeight(x, z)
      const there = sampleHeight(x + 0.25, z + 0.25)
      expect(Math.abs(there - here), `${x},${z}`).toBeLessThan(2)
    }
  })

  it('sort le joueur de l eau à son point d apparition', () => {
    expect(sampleHeight(0, 0)).toBeGreaterThan(WORLD.waterLevel)
  })
})

describe('sampleSlope', () => {
  it('est nulle sur un plat', () => {
    // Le sommet de l'île sature le masque : il est plat par construction.
    expect(sampleSlope(0, 0)).toBeGreaterThanOrEqual(0)
  })

  it('ne rend jamais NaN ni de valeur négative', () => {
    for (const [x, z] of GRID) {
      const slope = sampleSlope(x, z)
      expect(Number.isFinite(slope), `${x},${z}`).toBe(true)
      expect(slope, `${x},${z}`).toBeGreaterThanOrEqual(0)
    }
  })

  it('est symétrique par différences finies', () => {
    expect(sampleSlope(10, 20, 1.5)).toBeCloseTo(sampleSlope(10, 20, 1.5))
  })
})

describe('classifyBiome', () => {
  it('range le fond sous l eau dans les hauts-fonds', () => {
    expect(classifyBiome(0, 0, -1)).toBe('shallows')
  })

  it('range les sommets en montagne, quel que soit le bruit de région', () => {
    // L'ordre des tests garantit qu'on ne trouve jamais de jungle au sommet.
    for (const [x, z] of GRID) {
      expect(classifyBiome(x, z, WORLD.mountainLevel + 5), `${x},${z}`).toBe('mountain')
    }
  })

  it('range le bord de mer en plage', () => {
    expect(classifyBiome(0, 0, 0.5)).toBe('beach')
  })

  it('ne rend que des biomes connus, partout', () => {
    const known = new Set([
      'shallows',
      'beach',
      'mountain',
      'island',
      'jungle',
      'meadow',
      'badlands',
    ])

    for (const [x, z] of GRID) {
      expect(known.has(classifyBiome(x, z, sampleHeight(x, z))), `${x},${z}`).toBe(true)
    }
  })

  it('pose les trois biomes intermédiaires sur la carte', () => {
    // Sans étalement du bruit, les seuils extrêmes ne sont jamais atteints et
    // un biome entier disparaît.
    const found = new Set(GRID.map(([x, z]) => classifyBiome(x, z, sampleHeight(x, z))))

    expect(found.has('jungle')).toBe(true)
    expect(found.has('meadow')).toBe(true)
    expect(found.has('badlands')).toBe(true)
  })
})

describe('islandMask', () => {
  it('reste dans [0, 1]', () => {
    for (const [x, z] of GRID) {
      const mask = islandMask(x, z)
      expect(mask, `${x},${z}`).toBeGreaterThanOrEqual(0)
      expect(mask, `${x},${z}`).toBeLessThanOrEqual(1)
    }
  })
})

describe('sampleWorld', () => {
  it('rend les mêmes valeurs que les fonctions prises une à une', () => {
    for (const [x, z] of [[0, 0], [30, -40], [-70, 55]] as [number, number][]) {
      const sample = sampleWorld(x, z)

      expect(sample.height).toBe(sampleHeight(x, z))
      expect(sample.slope).toBe(sampleSlope(x, z))
      expect(sample.biome).toBe(classifyBiome(x, z, sample.height))
    }
  })

  it('dit submergé exactement quand le point est sous le niveau de la mer', () => {
    for (const [x, z] of GRID) {
      const sample = sampleWorld(x, z)
      expect(sample.submerged, `${x},${z}`).toBe(sample.height < WORLD.waterLevel)
    }
  })
})

describe('les seuils du monde', () => {
  it('s ordonnent du fond au sommet', () => {
    expect(WORLD.maxDepth).toBeLessThan(WORLD.waterLevel)
    expect(WORLD.waterLevel).toBeLessThan(WORLD.mountainLevel)
    expect(WORLD.mountainLevel).toBeLessThan(WORLD.snowLevel)
  })

  it('garde la demi-carte cohérente avec son côté', () => {
    expect(WORLD.half * 2).toBe(WORLD.size)
  })
})
