import { beforeEach, describe, expect, it } from 'vitest'
import { ROT } from '../config/rotBlight'
import { purgeRot, resetRot, rot, soakRot, tickRot } from './rot'

/**
 * La jauge de pourriture est une machine à trois phases — remplissage, reflux,
 * contamination — dont les transitions se font toutes sur des comparaisons de
 * temps. `tickRot` prend son instant en paramètre et ne connaît pas le store :
 * c'est exactement ce que son en-tête promet, et ça la rend testable telle
 * quelle.
 */
beforeEach(() => {
  resetRot()
})

describe('soakRot', () => {
  it('accumule sans jamais dépasser le plafond', () => {
    soakRot(30, 0)
    expect(rot.level).toBe(30)

    soakRot(30, 100)
    expect(rot.level).toBe(60)

    soakRot(1000, 200)
    expect(rot.level).toBe(ROT.max)
  })

  it('déclenche la contamination en atteignant le plafond', () => {
    soakRot(ROT.max, 5_000)

    expect(rot.contaminatedAt).toBe(5_000)
    expect(rot.contaminatedUntil).toBe(5_000 + ROT.contaminationMs)
  })

  it('ne verse plus rien pendant une contamination', () => {
    soakRot(ROT.max, 0)
    const until = rot.contaminatedUntil

    soakRot(50, 1_000)

    // Ni la jauge ni la fin de contamination ne bougent : sinon le joueur
    // contaminé dans l'eau enchaînerait deux contaminations d'affilée.
    expect(rot.level).toBe(ROT.max)
    expect(rot.contaminatedUntil).toBe(until)
  })
})

describe('tickRot — contamination', () => {
  it('prélève le premier cœur à la frame même du franchissement', () => {
    soakRot(ROT.max, 5_000)

    expect(tickRot(5_000, 1 / 60)).toBe(1)
  })

  it('espace les prélèvements suivants de tickMs', () => {
    soakRot(ROT.max, 0)
    tickRot(0, 1 / 60)

    expect(tickRot(ROT.tickMs - 1, 1 / 60)).toBe(0)
    expect(tickRot(ROT.tickMs, 1 / 60)).toBe(1)
  })

  it('remet la jauge à zéro à la fin de la contamination', () => {
    soakRot(ROT.max, 0)

    const drained = tickRot(ROT.contaminationMs, 1 / 60)

    expect(drained).toBe(0)
    expect(rot.level).toBe(0)
    expect(rot.contaminatedUntil).toBe(-Infinity)
  })

  it('prélève le compte annoncé sur toute la durée de la contamination', () => {
    soakRot(ROT.max, 0)
    let hearts = 0
    for (let now = 0; now < ROT.contaminationMs; now += 1000 / 60) {
      hearts += tickRot(now, 1 / 60)
    }

    // Le premier part tout de suite, puis un par intervalle.
    expect(hearts).toBe(1 + Math.floor((ROT.contaminationMs - 1) / ROT.tickMs))
  })
})

describe('tickRot — reflux', () => {
  it('ne reflue pas avant le délai sans versement', () => {
    soakRot(50, 0)

    tickRot(ROT.refluxDelayMs - 1, 1)

    expect(rot.level).toBe(50)
  })

  it('reflue au débit annoncé, une fois le délai passé', () => {
    soakRot(50, 0)

    tickRot(ROT.refluxDelayMs, 1)

    expect(rot.level).toBeCloseTo(50 - ROT.refluxPerSecond)
  })

  it('ne descend jamais sous zéro, même sur un delta énorme', () => {
    soakRot(10, 0)

    tickRot(ROT.refluxDelayMs, 100)

    expect(rot.level).toBe(0)
  })

  it('un versement en cours de reflux relance le délai', () => {
    soakRot(50, 0)
    tickRot(ROT.refluxDelayMs, 1)
    const level = rot.level

    soakRot(5, 10_000)
    tickRot(10_000 + ROT.refluxDelayMs - 1, 1)

    expect(rot.level).toBeCloseTo(level + 5)
  })
})

describe('purgeRot', () => {
  it('vide la jauge et coupe une contamination en cours', () => {
    soakRot(ROT.max, 0)

    purgeRot()

    expect(rot.level).toBe(0)
    expect(rot.contaminatedUntil).toBe(-Infinity)
    expect(tickRot(1_000, 1 / 60)).toBe(0)
  })

  it('laisse la jauge se remplir de nouveau juste après', () => {
    soakRot(ROT.max, 0)
    purgeRot()

    soakRot(40, 1_000)

    expect(rot.level).toBe(40)
  })

  it("une seconde contamination prélève elle aussi son premier cœur tout de suite", () => {
    soakRot(ROT.max, 0)
    tickRot(0, 1 / 60)
    purgeRot()

    soakRot(ROT.max, 1_000)

    expect(tickRot(1_000, 1 / 60)).toBe(1)
  })
})

describe('resetRot', () => {
  it('remet chaque champ à sa valeur de départ', () => {
    soakRot(ROT.max, 5_000)
    tickRot(5_000, 1 / 60)

    resetRot()

    expect(rot).toEqual({
      level: 0,
      lastSoakAt: -Infinity,
      contaminatedUntil: -Infinity,
      contaminatedAt: -Infinity,
      lastTickAt: -Infinity,
    })
  })
})

describe("fin de contamination pendant qu'on a encore les pieds dans l'eau", () => {
  /**
   * L'ordre est celui de `RotBlight.tsx` : le marais verse **avant** que la
   * jauge ne soit sondée, à chaque frame. C'est cet ordre-là qu'il faut
   * reproduire, parce que c'est le seul qui tourne pour de bon.
   */
  const frame = (now: number, delta: number, inWater: boolean) => {
    if (inWater) soakRot(ROT.perSecondInWater * delta, now)
    return tickRot(now, delta)
  }

  it('rend la main au joueur au lieu de rechaîner une contamination', () => {
    const step = 1000 / 60
    const delta = step / 1000
    let now = 0

    // On se contamine, et on reste dans l'eau tout du long.
    soakRot(ROT.max, 0)
    for (; now <= ROT.contaminationMs + step; now += step) {
      frame(now, delta, true)
    }

    // La contamination a été payée : elle doit être finie, même si les pieds
    // sont toujours dedans. La jauge remonte, et c'est normal — mais elle
    // repart d'en bas, et le joueur a le temps de sortir.
    expect(rot.contaminatedUntil).toBe(-Infinity)
    expect(rot.level).toBeLessThan(ROT.max)
  })

  it("ne prélève pas de cœurs sans fin tant qu'on patauge", () => {
    const step = 1000 / 60
    const delta = step / 1000
    let hearts = 0

    soakRot(ROT.max, 0)
    // Trois fois la durée d'une contamination : de quoi voir si elle s'arrête.
    for (let now = 0; now <= ROT.contaminationMs * 3; now += step) {
      hearts += frame(now, delta, true)
    }

    // Une contamination coûte cinq cœurs. Trois durées de suite ne doivent pas
    // en coûter quinze : la jauge doit avoir le temps de se vider et de se
    // remplir avant de repartir.
    const oneContamination = 1 + Math.floor((ROT.contaminationMs - 1) / ROT.tickMs)
    expect(hearts).toBeLessThan(oneContamination * 3)
  })
})
