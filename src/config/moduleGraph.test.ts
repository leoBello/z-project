import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Le graphe de modules de la configuration, et l'ordre dans lequel il se charge.
 *
 * Trois fichiers se tiennent par la main : `world` creuse les terrasses des
 * monuments, donc lit `landmarks` ; `landmarks` pose ses ancres à hauteur de
 * capsule ; `gameplay` calcule le point d'apparition sur le relief réel, donc
 * appelle `sampleHeight` **au chargement**.
 *
 * Un cycle où l'un a besoin du *résultat* d'un autre ne se résout que dans un
 * sens. Tant qu'un seul chemin d'import existait, ça tenait par chance : le
 * premier `import` de l'application entrait par le bon bout. Le jour où un
 * fichier atteint `landmarks` en premier — un test, un composant nouveau, un
 * découpage de bundle qui change — la table n'est pas encore construite quand
 * `gameplay` l'interroge, et c'est toute l'application qui ne démarre plus.
 *
 * Ces tests entrent par chaque bout à tour de rôle. Ils ne vérifient pas une
 * valeur : ils vérifient qu'aucun ordre n'est privilégié.
 */

beforeEach(() => {
  vi.resetModules()
})

describe('le chargement de la configuration', () => {
  it('tient quand on entre par les monuments', async () => {
    await import('./landmarks')
    const { PLAYER } = await import('./gameplay')

    expect(Number.isFinite(PLAYER.spawn[1])).toBe(true)
  })

  it('tient quand on entre par le monde', async () => {
    await import('./world')
    const { PLAYER } = await import('./gameplay')

    expect(Number.isFinite(PLAYER.spawn[1])).toBe(true)
  })

  it('tient quand on entre par le gameplay', async () => {
    const { PLAYER } = await import('./gameplay')

    expect(Number.isFinite(PLAYER.spawn[1])).toBe(true)
  })

  it('pose le joueur au même endroit quel que soit le chemin d entrée', async () => {
    await import('./landmarks')
    const first = (await import('./gameplay')).PLAYER.spawn[1]

    vi.resetModules()
    await import('./world')
    const second = (await import('./gameplay')).PLAYER.spawn[1]

    vi.resetModules()
    const third = (await import('./gameplay')).PLAYER.spawn[1]

    // Le point d'apparition est posé sur le relief réel : s'il dépend du
    // chemin d'import, c'est que la terrasse du Sanctuaire n'était pas encore
    // creusée pour l'un des trois.
    expect(first).toBe(second)
    expect(second).toBe(third)
  })

  it('creuse bien la terrasse des monuments dans le relief', async () => {
    // La preuve que `LANDMARKS` était en place : sans elle, `sampleHeight`
    // rendrait le relief nu, et le point d'apparition ne serait plus assis sur
    // la terrasse du départ.
    const { LANDMARKS } = await import('./landmarks')
    const { sampleHeight } = await import('./world')

    const terraced = LANDMARKS.filter((landmark) => landmark.radius > 0)
    expect(terraced.length).toBeGreaterThan(0)

    for (const landmark of terraced) {
      expect(sampleHeight(landmark.x, landmark.z), landmark.id).toBeCloseTo(
        landmark.altitude,
        1,
      )
    }
  })
})
