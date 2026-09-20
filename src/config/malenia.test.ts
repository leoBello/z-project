import { describe, expect, it } from 'vitest'
import { PARRY } from './parry'
import {
  BREATH_MS,
  MALENIA_ATTACKS,
  MALENIA_HP,
  MORPH_AT,
  WALK_SPEED,
  attacksFor,
  strikeSpan,
  type MaleniaAttack,
} from './malenia'
import { PLAYER } from './gameplay'

/**
 * Les invariants de la table des dix, et rien d'autre.
 *
 * Ce fichier n'est pas là pour figer un équilibrage — les nombres de
 * `malenia.ts` ont bougé deux fois et bougeront encore, c'est leur métier. Il
 * est là pour figer les **règles** que ces nombres doivent respecter, parce que
 * chacune d'elles a déjà été vérifiée une fois à la main, sous Node, au moment
 * d'un rééquilibrage — et une vérification qu'on refait à la main est une
 * vérification qu'on finit par ne plus refaire.
 *
 * Les trois qui suivent ont chacune un mode de défaillance qu'aucune partie
 * jouée ne montrerait clairement : une attaque qui se relance avant d'avoir
 * fini, un coup parable plus rapide que l'œil, une fuite gratuite.
 */

const ALL = Object.values(MALENIA_ATTACKS)

/** Le temps total qu'une attaque occupe, de son télégraphe à sa respiration. */
function occupancy(attack: MaleniaAttack) {
  return attack.telegraphMs + strikeSpan(attack) + attack.recoveryMs + BREATH_MS
}

describe('la table des attaques', () => {
  /*
    Le défaut que ça attrape : une recharge plus courte que la séquence qu'elle
    garde. La machine à états n'en planterait pas — elle relancerait simplement
    l'attaque à la frame où la précédente se termine, sans jamais rendre la main.
    À l'écran, ça ne se lit pas comme un bug de recharge, ça se lit comme un boss
    qui « s'acharne parfois », ce qu'on met beaucoup trop longtemps à soupçonner.
  */
  it.each(ALL.map((attack) => [attack.id, attack] as const))(
    'la recharge de %s couvre sa propre séquence, respiration comprise',
    (_id, attack) => {
      expect(attack.cooldownMs).toBeGreaterThanOrEqual(occupancy(attack))
    },
  )

  /*
    La règle de lisibilité du rehaussement, écrite ici parce que c'est la seule
    qu'on peut casser sans s'en rendre compte : on raccourcit un télégraphe pour
    « la rendre plus nerveuse », et on rend en fait un coup imparable.

    Le seuil n'est pas arbitraire — c'est celui de `thrust`, ramené de 380 à 460+
    après la première partie jouée pour cette raison exacte. Il ne vaut que pour
    les coups **parables** : le coup de pied, la saisie et les ailes n'appellent
    jamais `offerParry`, donc leur télégraphe ne promet rien à personne.
  */
  const PARRYABLE_FLOOR_MS = 460
  it.each(ALL.filter((attack) => attack.strikes[0].parryable).map((a) => [a.id, a] as const))(
    "le télégraphe parable de %s laisse le temps de le lire",
    (_id, attack) => {
      expect(attack.telegraphMs).toBeGreaterThanOrEqual(PARRYABLE_FLOOR_MS)
    },
  )

  /*
    L'anneau de parade s'allume `cueLeadMs` avant l'impact. Sur un coup dont le
    télégraphe est plus court que cette avance, il s'allume au premier
    frémissement — c'est assumé et documenté dans `parry.ts`. Ce qui ne l'est
    pas, c'est qu'un coup **suivant** dans une séquence arrive si vite que son
    offre naît déjà expirée : la garde ne pourrait alors jamais le couvrir.
  */
  it('aucun coup parable ne suit le précédent plus vite que la garde', () => {
    for (const attack of ALL) {
      for (let i = 1; i < attack.strikes.length; i++) {
        if (!attack.strikes[i].parryable) continue
        const gap = attack.strikes[i].at - attack.strikes[i - 1].at
        expect(gap, `${attack.id}, coup ${i + 1}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('ses deux formes', () => {
  it('la métamorphose tombe à mi-vie', () => {
    expect(MORPH_AT).toBe(MALENIA_HP / 2)
  })

  /*
    La phase II garde tout ce que la phase I savait faire. C'est ce qui fait que
    la métamorphose ne remet pas le joueur à zéro — et c'est une propriété de la
    construction de `BY_PHASE`, donc exactement le genre de chose qu'un filtre
    mal recopié casserait en silence.
  */
  it('la déesse garde tout ce que la lame savait faire', () => {
    const blade = attacksFor('blade')
    const goddess = attacksFor('goddess')
    expect(goddess.length).toBe(ALL.length)
    for (const attack of blade) expect(goddess).toContain(attack)
    expect(goddess.length).toBeGreaterThan(blade.length)
  })
})

describe('sa vitesse', () => {
  /*
    Les deux bornes du même réglage, et elles tiennent ensemble le seul choix
    tactique de déplacement du combat : plus rapide que le joueur, la course
    cesse d'être une option et le combat perd sa respiration ; trop lente, la
    fuite devient une stratégie gagnante qui n'exige ni lecture ni parade.

    Le plancher est à 85 % de la vitesse du joueur pour une raison que la
    constante seule ne montre pas — elle est **immobile pendant ses séquences**,
    donc sa poursuite utile vaut `WALK_SPEED` multiplié par sa fraction de temps
    libre, laquelle tourne autour de la moitié. En dessous de ce plancher, un
    resserrement de `BREATH_MS` la rendrait plus agressive *et* plus facile à
    semer, ce qui est le contresens exact qu'un rééquilibrage peut produire sans
    que rien ne le signale.
  */
  it('reste fuyable à pied, mais de peu', () => {
    expect(WALK_SPEED).toBeLessThan(PLAYER.speed)
    expect(WALK_SPEED).toBeGreaterThan(PLAYER.speed * 0.85)
  })
})

describe('la parade', () => {
  /*
    Ce qui n'est **pas** testé ici, et pourquoi : la règle anti-anticipation de
    `parry.ts` — 320 ms de garde plus 450 de récupération dépassent le plus long
    télégraphe — est mesurée sur le Lynel et n'a jamais valu pour elle. Le vol de
    sarcelle, les fantômes et Aeonia se préparent plus longtemps que 770 ms, donc
    un appui parti au tout début du télégraphe a le temps de se purger avant
    l'impact. C'est sans effet : l'anneau ne s'allume que 500 ms avant le coup,
    et c'est lui que le joueur suit.

    Ce qui compte, en revanche, c'est que la fenêtre soit atteignable — un coup
    dont le télégraphe serait plus court que le temps de réaction utile promet
    une parade qu'il ne rend pas. C'est le plancher de 460 ms plus haut.
  */
  it("chaque coup parable laisse l'anneau s'allumer avant l'impact", () => {
    for (const attack of ALL) {
      if (!attack.strikes[0].parryable) continue
      expect(attack.telegraphMs, attack.id).toBeGreaterThan(PARRY.windowMs)
    }
  })
})
