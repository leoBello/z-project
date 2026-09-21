import { afterEach, describe, expect, it } from 'vitest'
import { BEYOND_SHAPE } from '../config/beyond'
import { beyondEnemySpawns } from '../config/beyondEnemies'
import { FEET_TO_CENTER } from '../config/capsule'
import { sampleHeight } from '../config/world'
import { applyGround, ground, resetGround } from './ground'
import { PICKUP_REACH_Y, landingHeight } from './pickups'

afterEach(resetGround)

/**
 * Un cœur lâché en (x, z) est-il à portée du joueur qui se tient là ?
 *
 * On compare les deux altitudes que la boucle de `Pickups` compare : celle où le
 * cœur se pose — `landingHeight`, donc le sol courant — et celle du centre de la
 * capsule, à `FEET_TO_CENTER` au-dessus du sol **réel** de la carte. Quand les
 * deux sols sont le même, l'écart vaut un quart d'unité et le ramassage est
 * acquis ; c'est quand ils divergent que le cœur devient décoratif.
 */
function withinReach(x: number, z: number) {
  const player = BEYOND_SHAPE.height(x, z) + FEET_TO_CENTER
  return Math.abs(player - landingHeight(x, z)) < PICKUP_REACH_Y
}

describe('le sol de la carte courante', () => {
  it('est celui du continent tant que personne ne le réclame', () => {
    expect(ground.height(12, -34)).toBe(sampleHeight(12, -34))
  })

  it('passe à la carte qui le pose', () => {
    applyGround(BEYOND_SHAPE.height)

    expect(ground.height(12, -34)).toBe(BEYOND_SHAPE.height(12, -34))
  })

  it('revient au continent quand cette carte se démonte', () => {
    applyGround(BEYOND_SHAPE.height)
    resetGround()

    expect(ground.height(12, -34)).toBe(sampleHeight(12, -34))
  })
})

describe('les cœurs lâchés sur l Outremonde', () => {
  /*
    La régression elle-même, et elle se mesure sur les postes réels.

    Le défi du maître se court ici, et ce sont ces bêtes-là qui lâchent les
    cœurs : le peuplement de l'Outremonde est le seul, avec celui du continent,
    à monter des `Enemy`. Un test sur trois coordonnées choisies à la main aurait
    pu tomber sur trois endroits où les deux reliefs se ressemblent.
  */
  const posts = beyondEnemySpawns().map((spawn) => spawn.position)

  it('se posent tous à portée du joueur quand la carte a posé son sol', () => {
    applyGround(BEYOND_SHAPE.height)

    const unreachable = posts.filter(([x, , z]) => !withinReach(x, z))

    expect(unreachable).toHaveLength(0)
  })

  it('en perdait près de la moitié quand le sol restait celui du continent', () => {
    /*
      Le défaut d'origine, gardé sous test plutôt que raconté en commentaire.

      Ce n'était pas un décalage de quelques centimètres qu'on aurait pu absorber
      en élargissant la portée : les deux champs de hauteurs n'ont aucune raison
      de se ressembler, et sur ces postes ils s'écartent jusqu'à onze unités. Si
      un jour ce compte tombe à zéro, ce sera que l'Outremonde a changé de
      relief — pas que le raccourci était acceptable.
    */
    const unreachable = posts.filter(([x, , z]) => !withinReach(x, z))

    expect(unreachable.length).toBeGreaterThan(posts.length / 3)
  })
})
