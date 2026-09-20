import { describe, expect, it } from 'vitest'
import { PLAYER } from './gameplay'
import { PARRY } from './parry'
import { WORLD, sampleHeight } from './world'
import { ENEMIES, HEART_DROP_CHANCE, enemySpawns, enemyTotal } from './enemies'
import { INVULNERABILITY_MS } from '../store/useGameStore'

/**
 * La table des bêtes, et le peuplement de la carte.
 *
 * Le tirage est **mémoïsé au module** et le store en dérive le compte qui ouvre
 * le portail. C'est la propriété à tenir : deux lectures qui divergeraient d'une
 * unité laisseraient le portail à jamais fermé, et rien à l'écran ne le dirait.
 */

describe('la table des bêtes', () => {
  it('indexe chaque espèce sous son propre nom', () => {
    for (const [key, stats] of Object.entries(ENEMIES)) {
      expect(stats.kind, key).toBe(key)
    }
  })

  it('donne à chacune des points de vie entiers et une vitesse', () => {
    for (const stats of Object.values(ENEMIES)) {
      expect(Number.isInteger(stats.hp), stats.kind).toBe(true)
      expect(stats.hp, stats.kind).toBeGreaterThan(0)
      expect(stats.speed, stats.kind).toBeGreaterThan(0)
    }
  })

  it('laisse voir la bête avant qu elle ne vise', () => {
    // L écart entre les deux valeurs est le temps pendant lequel on la voit
    // sans être visé. Sans lui, l Octorok tirait à la frame du repérage,
    // depuis une distance où il n était lui-même qu un point à l écran.
    for (const stats of Object.values(ENEMIES)) {
      expect(stats.detectRadius, stats.kind).toBeGreaterThan(stats.attackRange)
    }
  })

  it('poursuit plus vite qu elle ne patrouille', () => {
    for (const stats of Object.values(ENEMIES)) {
      expect(stats.speed, stats.kind).toBeGreaterThanOrEqual(stats.patrolSpeed)
    }
  })

  it('espace les coups au-delà des i-frames du joueur', () => {
    // En dessous, une bête collée touche à chaque fin d invulnérabilité et le
    // combat se réduit à une course de dégâts.
    for (const stats of Object.values(ENEMIES)) {
      if (stats.ranged) continue
      expect(stats.attackCooldownMs, stats.kind).toBeGreaterThan(INVULNERABILITY_MS)
    }
  })

  it('annonce chaque coup avant de le porter', () => {
    for (const stats of Object.values(ENEMIES)) {
      expect(stats.telegraphMs, stats.kind).toBeGreaterThan(0)
    }
  })

  it('ne récompense pas l anticipation — la garde ne tient pas jusqu à l impact', () => {
    /*
      La propriété que `pressParry` promet, vérifiée sur la table plutôt que sur
      un scénario : quelqu'un qui appuie au premier frémissement du télégraphe
      doit voir sa garde retombée quand le coup arrive. Elle tient tant que la
      fenêtre est plus courte que la préparation la plus brève du jeu.
    */
    for (const stats of Object.values(ENEMIES)) {
      if (!stats.parryable) continue
      expect(stats.telegraphMs, stats.kind).toBeGreaterThan(PARRY.windowMs)
    }
  })

  it('ne récompense pas non plus l appui au premier frémissement du signal', () => {
    // Même propriété, prise de l'autre bout : le signal s'allume `cueLeadMs`
    // avant l'impact, et la garde ouverte à cet instant-là doit elle aussi
    // être retombée. C'est ce qui oblige à lire le coup au lieu de réagir au
    // voyant.
    expect(PARRY.windowMs).toBeLessThan(PARRY.cueLeadMs)
  })

  it('marteler ne laisse jamais retomber sur une garde ouverte', () => {
    // 320 + 450 = 770 ms, au-delà du plus long télégraphe du jeu : un appui
    // anticipé enferme donc dans la récupération pour toute la préparation.
    const longest = Math.max(
      ...Object.values(ENEMIES).map((stats) => stats.telegraphMs),
    )

    expect(PARRY.windowMs + PARRY.recoveryMs).toBeGreaterThan(longest)
  })

  it('donne à chacune une couleur de minimap distincte', () => {
    const colors = Object.values(ENEMIES).map((stats) => stats.minimapColor)

    expect(new Set(colors).size).toBe(colors.length)
  })

  it('ne disperse que les tirs', () => {
    for (const stats of Object.values(ENEMIES)) {
      if (!stats.ranged) expect(stats.spread ?? 0, stats.kind).toBe(0)
    }
  })
})

describe('le peuplement', () => {
  it('est tiré une seule fois pour toute la session', () => {
    expect(enemySpawns()).toBe(enemySpawns())
  })

  it('compte ce qui a vraiment été posé', () => {
    // Le générateur abandonne au bout de 4 000 essais : c est la longueur du
    // tirage, et non le nombre demandé, qui dit quand la carte est vide.
    expect(enemyTotal()).toBe(enemySpawns().length)
    expect(enemyTotal()).toBeGreaterThan(0)
  })

  it('ne donne jamais deux fois le même identifiant', () => {
    const ids = enemySpawns().map((spawn) => spawn.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ne pose que des espèces connues', () => {
    for (const spawn of enemySpawns()) {
      expect(ENEMIES[spawn.kind], spawn.id).toBeDefined()
    }
  })

  it('ne noie ni n enterre personne', () => {
    for (const spawn of enemySpawns()) {
      const [x, y, z] = spawn.position
      expect(y, spawn.id).toBeGreaterThan(WORLD.waterLevel)
      expect(y, spawn.id).toBeCloseTo(sampleHeight(x, z), 5)
    }
  })

  it('laisse le point d apparition du joueur tranquille', () => {
    for (const spawn of enemySpawns()) {
      const distance = Math.hypot(
        spawn.position[0] - PLAYER.spawn[0],
        spawn.position[2] - PLAYER.spawn[2],
      )
      expect(distance, spawn.id).toBeGreaterThanOrEqual(26)
    }
  })

  it('ne colle pas deux bêtes l une contre l autre', () => {
    const spawns = enemySpawns()
    for (let i = 0; i < spawns.length; i++) {
      for (let j = i + 1; j < spawns.length; j++) {
        const distance = Math.hypot(
          spawns[i].position[0] - spawns[j].position[0],
          spawns[i].position[2] - spawns[j].position[2],
        )
        expect(distance, `${spawns[i].id}/${spawns[j].id}`).toBeGreaterThanOrEqual(14)
      }
    }
  })

  it('reste dans les limites du monde', () => {
    for (const spawn of enemySpawns()) {
      expect(Math.abs(spawn.position[0]), spawn.id).toBeLessThanOrEqual(WORLD.half)
      expect(Math.abs(spawn.position[2]), spawn.id).toBeLessThanOrEqual(WORLD.half)
    }
  })

  it('donne à chacune un rayon de patrouille', () => {
    for (const spawn of enemySpawns()) {
      expect(spawn.radius, spawn.id).toBeGreaterThan(0)
    }
  })
})

describe('le cœur lâché', () => {
  it('est une chance, ni jamais ni toujours', () => {
    expect(HEART_DROP_CHANCE).toBeGreaterThan(0)
    expect(HEART_DROP_CHANCE).toBeLessThan(1)
  })
})
