import { beforeEach, describe, expect, it } from 'vitest'
import { DIFFICULTIES, difficultyById } from '../config/challenge'
import { ENEMIES } from '../config/enemies'
import { applyDifficulty, difficulty, resetDifficulty, scaledHp } from './difficulty'

/**
 * Les trois multiplicateurs de l'Outremonde.
 *
 * Le module est minuscule et le piège est ailleurs : il vit **hors de React**,
 * donc rien ne le remet à neutre tout seul. Un joueur qui repart du Sanctuaire
 * en difficile emporterait ses dégâts majorés sur le continent, et un jeu devenu
 * un peu plus dur ne ressemble pas à un bug — personne ne le signalerait jamais.
 */

beforeEach(() => {
  resetDifficulty()
})

describe('applyDifficulty', () => {
  it('pose les trois multiplicateurs de la difficulté nommée', () => {
    const hard = difficultyById('hard')

    applyDifficulty('hard')

    // Les trois valeurs, et **pas** l'identifiant : ce module porte des
    // multiplicateurs, pas le nom du réglage qui les a posés. Ses trois
    // lecteurs demandent « combien », jamais « lequel ».
    expect(difficulty).toEqual({ damage: hard.damage, hp: hard.hp, score: hard.score })
  })

  it('retombe sur normal pour un réglage inconnu', () => {
    applyDifficulty('nightmare' as never)

    expect(difficulty.damage).toBe(1)
    expect(difficulty.hp).toBe(1)
    expect(difficulty.score).toBe(1)
  })

  it('remplace la précédente au lieu de s y ajouter', () => {
    applyDifficulty('hard')
    applyDifficulty('easy')

    expect(difficulty.damage).toBe(0.5)
  })

  it('les trois leviers vont dans le même sens d une difficulté à l autre', () => {
    const easy = difficultyById('easy')
    const normal = difficultyById('normal')
    const hard = difficultyById('hard')

    expect(easy.damage).toBeLessThan(normal.damage)
    expect(normal.damage).toBeLessThan(hard.damage)
    expect(easy.hp).toBeLessThan(hard.hp)
    // Sans lui, la difficulté facile donnerait les meilleurs scores.
    expect(easy.score).toBeLessThan(hard.score)
  })

  it('ne touche ni à la vitesse ni aux temps de préparation', () => {
    // Un ennemi plus rapide ou qui télégraphie moins n'est pas plus difficile,
    // il est moins lisible. Les trois tables ne portent donc que ces leviers.
    for (const level of DIFFICULTIES) {
      expect(Object.keys(level).sort()).toEqual(['damage', 'hp', 'id', 'score'])
    }
  })
})

describe('resetDifficulty', () => {
  it('remet tout à neutre en quittant la carte', () => {
    applyDifficulty('hard')

    resetDifficulty()

    expect(difficulty).toEqual({ damage: 1, hp: 1, score: 1 })
  })
})

describe('scaledHp', () => {
  it('ne touche à rien en normal', () => {
    for (const stats of Object.values(ENEMIES)) {
      expect(scaledHp(stats.hp)).toBe(stats.hp)
    }
  })

  it('allonge les combats en difficile', () => {
    applyDifficulty('hard')

    expect(scaledHp(ENEMIES.octorok.hp)).toBe(3)
    expect(scaledHp(ENEMIES.moblin.hp)).toBe(5)
  })

  it('les raccourcit en facile', () => {
    applyDifficulty('easy')

    // Math.round(2 × 0,7) vaut 1, et c'est le comportement voulu.
    expect(scaledHp(ENEMIES.octorok.hp)).toBe(1)
  })

  it('plancher à un : un ennemi à zéro PV ne pourrait jamais mourir', () => {
    applyDifficulty('easy')

    // Les PV sont testés **après** le retrait des dégâts : à zéro, la
    // condition `hp <= 0` est déjà vraie a l apparition, et ne se franchit
    // donc jamais.
    expect(scaledHp(0)).toBe(1)
    expect(scaledHp(0.1)).toBe(1)
  })

  it('rend toujours un entier — les PV se comptent en coups', () => {
    applyDifficulty('easy')

    for (const stats of Object.values(ENEMIES)) {
      expect(Number.isInteger(scaledHp(stats.hp)), stats.kind).toBe(true)
    }
  })

  it('aucune bête ne devient increvable ni gratuite', () => {
    for (const level of DIFFICULTIES) {
      applyDifficulty(level.id)
      for (const stats of Object.values(ENEMIES)) {
        const hp = scaledHp(stats.hp)
        expect(hp, `${stats.kind}/${level.id}`).toBeGreaterThanOrEqual(1)
        expect(hp, `${stats.kind}/${level.id}`).toBeLessThanOrEqual(stats.hp * 2)
      }
    }
  })
})
