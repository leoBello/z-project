import { describe, expect, it } from 'vitest'
import {
  CHALLENGE_RANKS,
  DEFAULT_DIFFICULTY,
  DEFAULT_DURATION,
  DIFFICULTIES,
  DURATIONS,
  KILL_POINTS,
  categoryKey,
  difficultyById,
  durationById,
  formatElapsed,
  formatRemaining,
  pointsFor,
  rankFor,
  type DifficultyId,
  type DurationId,
} from './challenge'

/**
 * Le barème, les rangs et les deux chronomètres.
 *
 * Tout est pur ici, et tout est lu par l'interface : un arrondi qui diverge
 * entre le bandeau du HUD et le panneau de résultat affiche deux nombres
 * différents pour la même frame, et c'est le genre de défaut qu'on met des mois
 * à croire.
 */

describe('difficultyById / durationById', () => {
  it('rend la table demandée', () => {
    expect(difficultyById('hard').damage).toBe(1.6)
    expect(durationById('5min').ms).toBe(300_000)
  })

  it('retombe sur un réglage jouable pour un identifiant inconnu', () => {
    expect(difficultyById('impossible' as DifficultyId)).toEqual(
      DIFFICULTIES.find((entry) => entry.id === 'normal'),
    )
    expect(durationById('forever' as DurationId)).toEqual(DURATIONS[0])
  })

  it('les défauts désignent des entrées qui existent', () => {
    expect(difficultyById(DEFAULT_DIFFICULTY).id).toBe(DEFAULT_DIFFICULTY)
    expect(durationById(DEFAULT_DURATION).id).toBe(DEFAULT_DURATION)
  })

  it('le mode illimité est le seul sans terme', () => {
    const endless = DURATIONS.filter((entry) => entry.ms === null)

    expect(endless).toHaveLength(1)
    expect(endless[0].id).toBe('endless')
  })
})

describe('pointsFor', () => {
  it('rend le barème de chaque espèce', () => {
    expect(pointsFor('octorok')).toBe(KILL_POINTS.octorok)
    expect(pointsFor('malenia')).toBe(KILL_POINTS.malenia)
  })

  it('suit la difficulté réelle du combat et non les points de vie', () => {
    expect(pointsFor('moblin')).toBeGreaterThan(pointsFor('octorok'))
    expect(pointsFor('lynel')).toBeGreaterThan(pointsFor('moblin'))
    expect(pointsFor('golden')).toBeGreaterThan(pointsFor('lynel'))
    expect(pointsFor('malenia')).toBeGreaterThan(pointsFor('golden'))
  })

  it('ne rend jamais undefined sur une cible inconnue', () => {
    expect(pointsFor('dragon' as never)).toBe(0)
  })
})

describe('rankFor', () => {
  it('mesure un rythme et non un total', () => {
    // Le même score étalé sur cinq fois plus de temps ne vaut pas le même
    // rang : 300 points/minute d'un côté, 60 de l'autre.
    expect(rankFor(600, 120_000)).toBe('legend')
    expect(rankFor(600, 600_000)).toBe('novice')
  })

  it('ne promeut personne sur un défi trop court pour vouloir dire quelque chose', () => {
    // Un Lynel abattu en huit secondes ferait 750 points/minute sans plancher.
    expect(rankFor(100, 8_000)).not.toBe('legend')
  })

  it('ne rate jamais le premier palier, même à zéro', () => {
    expect(rankFor(0, 120_000)).toBe('novice')
  })

  it('ne casse pas sur une durée nulle', () => {
    expect(CHALLENGE_RANKS.map((rank) => rank.id)).toContain(rankFor(0, 0))
  })

  it('les paliers sont ordonnés du plus haut au plus bas', () => {
    const rates = CHALLENGE_RANKS.map((rank) => rank.perMinute)

    expect([...rates].sort((a, b) => b - a)).toEqual([...rates])
    expect(rates[rates.length - 1]).toBe(0)
  })

  it('chaque palier est atteignable à son seuil exact', () => {
    for (const rank of CHALLENGE_RANKS) {
      expect(rankFor(rank.perMinute, 60_000)).toBe(rank.id)
    }
  })
})

describe('categoryKey', () => {
  it('donne une clé par couple durée/difficulté', () => {
    expect(categoryKey('2min', 'hard')).toBe('2min/hard')
  })

  it('ne fait jamais tomber deux catégories dans la même case', () => {
    const keys = new Set<string>()
    for (const duration of DURATIONS) {
      for (const level of DIFFICULTIES) keys.add(categoryKey(duration.id, level.id))
    }

    expect(keys.size).toBe(DURATIONS.length * DIFFICULTIES.length)
  })
})

describe('formatRemaining', () => {
  it('formate en M:SS', () => {
    expect(formatRemaining(125_000)).toBe('2:05')
    expect(formatRemaining(600_000)).toBe('10:00')
  })

  it('arrondit au supérieur : le zéro ne tombe pas avant la fin', () => {
    expect(formatRemaining(1)).toBe('0:01')
    expect(formatRemaining(999)).toBe('0:01')
  })

  it('ne vaut 0:00 que quand il ne reste vraiment rien', () => {
    expect(formatRemaining(0)).toBe('0:00')
  })

  it('ne part pas en négatif si le chronomètre est dépassé', () => {
    expect(formatRemaining(-5_000)).toBe('0:00')
  })

  it('garde deux chiffres aux secondes', () => {
    expect(formatRemaining(61_000)).toBe('1:01')
    expect(formatRemaining(60_000)).toBe('1:00')
  })
})

describe('formatElapsed', () => {
  it('arrondit à l inférieur : un compteur qui monte affiche la seconde finie', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(999)).toBe('0:00')
    expect(formatElapsed(1_000)).toBe('0:01')
  })

  it('ne part pas en négatif', () => {
    expect(formatElapsed(-1)).toBe('0:00')
  })

  it('les deux chronomètres ne sautent pas d une seconde au démarrage', () => {
    // Le décompte affiche la durée pleine, le compteur affiche zéro : c'est le
    // même instant, vu des deux côtés.
    expect(formatRemaining(120_000)).toBe('2:00')
    expect(formatElapsed(0)).toBe('0:00')
  })
})
