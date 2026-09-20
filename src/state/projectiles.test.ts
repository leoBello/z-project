import { Vector3 } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { advance, resetClock } from './gameClock'
import {
  PROJECTILE_GRAVITY,
  PROJECTILE_POOL_SIZE,
  PROJECTILE_RETURN_SPEED,
  PROJECTILE_SPEED,
  clearProjectiles,
  deflectProjectile,
  fireProjectile,
  projectiles,
} from './projectiles'

/**
 * Le pool de projectiles.
 *
 * Pool de taille fixe, donc deux choses à vérifier qu'aucune scène ne montre :
 * qu'un tir de trop ne casse rien quand les trente-deux cases sont prises, et
 * qu'une case recyclée ne garde rien du tir précédent — une balle renvoyée puis
 * réutilisée repartirait « amie » et ne toucherait plus le joueur.
 */

const from = new Vector3(0, 1, 0)
const target = new Vector3(10, 1, 0)

beforeEach(() => {
  clearProjectiles()
  resetClock()
})

describe('le pool', () => {
  it('est alloué une fois pour toutes', () => {
    expect(projectiles).toHaveLength(PROJECTILE_POOL_SIZE)
  })

  it('ne partage aucun vecteur entre deux cases', () => {
    expect(projectiles[0].position).not.toBe(projectiles[1].position)
    expect(projectiles[0].velocity).not.toBe(projectiles[1].velocity)
  })

  it('démarre entièrement au repos', () => {
    expect(projectiles.every((slot) => !slot.active)).toBe(true)
  })
})

describe('fireProjectile', () => {
  it('prend une case et la met en vol', () => {
    fireProjectile(from, target)

    const live = projectiles.filter((slot) => slot.active)
    expect(live).toHaveLength(1)
    expect(live[0].position.x).toBe(from.x)
  })

  it('part à la vitesse annoncée, vers la cible', () => {
    fireProjectile(from, target)
    const shot = projectiles[0]

    expect(shot.velocity.x).toBeCloseTo(PROJECTILE_SPEED)
    expect(shot.velocity.z).toBeCloseTo(0)
  })

  it('relève le tir pour compenser la chute', () => {
    fireProjectile(from, target)

    expect(projectiles[0].velocity.y).toBeGreaterThan(0)
  })

  it('relève d autant plus que la cible est loin', () => {
    fireProjectile(from, target)
    const near = projectiles[0].velocity.y

    clearProjectiles()
    fireProjectile(from, new Vector3(40, 1, 0))

    expect(projectiles[0].velocity.y).toBeGreaterThan(near)
  })

  it('ne casse rien quand le pool est plein', () => {
    for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) fireProjectile(from, target)

    expect(() => fireProjectile(from, target)).not.toThrow()
    expect(projectiles.filter((slot) => slot.active)).toHaveLength(PROJECTILE_POOL_SIZE)
  })

  it('ne sort pas de NaN quand le tireur est sur sa cible', () => {
    fireProjectile(from, from.clone())
    const shot = projectiles[0]

    expect(Number.isFinite(shot.velocity.x)).toBe(true)
    expect(Number.isFinite(shot.velocity.y)).toBe(true)
    expect(Number.isFinite(shot.velocity.z)).toBe(true)
  })

  it('disperse dans le plan horizontal, et pas ailleurs', () => {
    fireProjectile(from, target, 0.3)
    const shot = projectiles[0]
    const speed = Math.hypot(shot.velocity.x, shot.velocity.z)

    expect(speed).toBeCloseTo(PROJECTILE_SPEED)
    // La dispersion fait tourner le tir, elle ne le ralentit pas.
    expect(Math.abs(shot.velocity.z)).toBeGreaterThan(0)
  })

  it('ne disperse pas quand on ne le lui demande pas', () => {
    for (let i = 0; i < 8; i++) {
      clearProjectiles()
      fireProjectile(from, target)
      expect(projectiles[0].velocity.z).toBeCloseTo(0)
    }
  })

  it('remet à neuf une case recyclée', () => {
    fireProjectile(from, target)
    const slot = projectiles[0]
    deflectProjectile(slot, 0, 1, -10)
    slot.lastSwingTested = 42
    slot.active = false

    fireProjectile(from, target)

    // Sans ça, la balle repart « amie » et ne touche plus le joueur.
    expect(slot.deflected).toBe(false)
    expect(slot.lastSwingTested).toBe(-Infinity)
  })

  it('date le tir sur l horloge de jeu', () => {
    advance(3)

    fireProjectile(from, target)

    expect(projectiles[0].bornAt).toBeCloseTo(3_000)
  })
})

describe('deflectProjectile', () => {
  it('retourne la balle contre les ennemis', () => {
    fireProjectile(from, target)
    const shot = projectiles[0]

    deflectProjectile(shot, -10, 1, 0)

    expect(shot.deflected).toBe(true)
    expect(shot.velocity.x).toBeLessThan(0)
  })

  it('renvoie plus vif qu à l aller — le renvoi doit payer', () => {
    fireProjectile(from, target)
    const shot = projectiles[0]

    deflectProjectile(shot, -10, 1, 0)

    expect(Math.hypot(shot.velocity.x, shot.velocity.z)).toBeCloseTo(
      PROJECTILE_RETURN_SPEED,
    )
    expect(PROJECTILE_RETURN_SPEED).toBeGreaterThan(PROJECTILE_SPEED)
  })

  it('remet la durée de vie à zéro', () => {
    fireProjectile(from, target)
    const shot = projectiles[0]
    advance(2)

    deflectProjectile(shot, -10, 1, 0)

    // Sans ça, une balle parée en fin de course s éteint au milieu du retour.
    expect(shot.bornAt).toBeCloseTo(2_000)
  })

  it('relève le renvoi pour compenser la chute', () => {
    fireProjectile(from, target)
    const shot = projectiles[0]

    deflectProjectile(shot, -30, 1, 0)

    expect(shot.velocity.y).toBeGreaterThan(0)
    expect(PROJECTILE_GRAVITY).toBeLessThan(0)
  })

  it('ne sort pas de NaN quand la cible est sur la balle', () => {
    fireProjectile(from, target)
    const shot = projectiles[0]

    deflectProjectile(shot, shot.position.x, shot.position.y, shot.position.z)

    expect(Number.isFinite(shot.velocity.x)).toBe(true)
    expect(Number.isFinite(shot.velocity.y)).toBe(true)
  })
})

describe('clearProjectiles', () => {
  it('éteint tout ce qui est en vol', () => {
    for (let i = 0; i < 5; i++) fireProjectile(from, target)

    clearProjectiles()

    expect(projectiles.every((slot) => !slot.active)).toBe(true)
  })

  it('rend les cases réutilisables tout de suite', () => {
    for (let i = 0; i < PROJECTILE_POOL_SIZE; i++) fireProjectile(from, target)
    clearProjectiles()

    fireProjectile(from, target)

    expect(projectiles.filter((slot) => slot.active)).toHaveLength(1)
  })

  it('efface le renvoi et le coup déjà jugé', () => {
    fireProjectile(from, target)
    deflectProjectile(projectiles[0], -10, 1, 0)
    projectiles[0].lastSwingTested = 42

    clearProjectiles()

    expect(projectiles[0].deflected).toBe(false)
    expect(projectiles[0].lastSwingTested).toBe(-Infinity)
  })
})
