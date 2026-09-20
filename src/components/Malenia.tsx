import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { Color, MathUtils, Vector3, type Group } from 'three'
import { track } from '../analytics'
import { playDefeat, playHit, playImpact, playParrySuccess } from '../audio/sfx'
import { ATTACK } from '../config/gameplay'
import {
  CLOSE_ENOUGH,
  LEASH_R,
  LIFESTEAL,
  MALENIA_ATTACKS,
  MALENIA_HP,
  MALENIA_ID,
  MORPH_AT,
  MORPH_MS,
  PUNISH_MULTIPLIER,
  PUDDLES,
  PUDDLE_MS,
  PUDDLE_R,
  WALK_SPEED,
  attacksFor,
  strikeSpan,
  type MaleniaAttack,
  type MaleniaStrike,
} from '../config/malenia'
import { PARRY } from '../config/parry'
import { ARENA_CENTER, ARENA_R, ENGAGE_R, GROUND_Y } from '../config/rotMarsh'
import { ROT } from '../config/rotBlight'
import { shake } from '../state/cameraShake'
import { spawnDeathPuff, spawnDeathRing } from '../state/deathPuffs'
import { enemyRegistry, updateEnemyMarker } from '../state/enemyRegistry'
import { hitStop, isHitStopped, now as gameNow } from '../state/gameClock'
import { cancelParry, consumeParry, offerParry } from '../state/parry'
import { playerTransform } from '../state/playerTransform'
import { soakRot } from '../state/rot'
import { useGameStore } from '../store/useGameStore'
import type { MaleniaPhase } from '../types/game'
import { MaleniaModel } from './enemies/MaleniaModel'
import { applyBasePose, useMaleniaRig } from './enemies/maleniaRig'
import { ROT_COLORS } from '../config/rotPalette'

/**
 * Malenia — la machine à états du dernier combat du jeu.
 *
 * Elle ne réutilise pas `Lynel.tsx`, et il faut dire pourquoi plutôt que de le
 * laisser deviner : celle du Lynel résout **un** coup par attaque, à un instant
 * d'impact unique. Le vol de sarcelle en compte dix, répartis sur deux secondes
 * neuf, dont l'un replace la bête sur le joueur au milieu de la séquence. Ce
 * n'est pas une variante de la même machine, c'en est une autre — et tenter de
 * les fondre aurait rendu les deux illisibles.
 *
 * Ce qu'elle réutilise, en revanche, c'est tout le reste : le registre
 * d'ennemis, la parade, le gel du coup fatal, les fumées de mort, le calque de
 * combat. Aucune de ces pièces n'a eu à changer.
 *
 * **Toute attaque est une séquence de coups**, y compris celles qui n'en ont
 * qu'un. C'est la décision qui tient le fichier : sans elle, le vol de sarcelle
 * et les fantômes auraient été deux cas particuliers greffés sur une machine
 * conçue pour un coup unique, et le troisième cas particulier l'aurait cassée.
 */

/** Durée du flash blanc à l'impact. */
const HIT_FLASH_MS = 120
/** Les trois temps de sa mort, repris du Lynel : elle tombe comme ses semblables. */
const DEATH_SQUASH_MS = 120
const DEATH_POP_MS = 260
const DEATH_REMOVE_MS = 900

/** Rayon de son collider. Un peu plus large que le héros, pas beaucoup. */
const BODY_RADIUS = 0.55
/** Hauteur de sa capsule, à l'échelle du modèle. */
const BODY_HALF_HEIGHT = 0.75

/** Amortissement du cap. Plus vif que le Lynel : c'est une escrimeuse. */
const YAW_DAMPING = 12

const toPlayer = new Vector3()
const velocity = { x: 0, z: 0 }
/** Sa teinte de mort, construite une fois : les fumées veulent une `Color`. */
const DEATH_TINT = new Color(ROT_COLORS.rot)

interface Puddle {
  x: number
  z: number
  until: number
}

interface Runtime {
  hp: number
  phase: MaleniaPhase
  /** L'attaque en cours, ou `null`. */
  pending: MaleniaAttack | null
  /** Instant de fin du télégraphe : l'origine des décalages de `strikes`. */
  strikeOrigin: number
  /** Combien de coups de la séquence ont déjà été résolus. */
  struck: number
  /** Dernier lancement, par attaque. */
  lastUsedAt: Record<string, number>
  /** Fin de l'étourdissement — parade réussie. */
  staggerUntil: number
  /** Avant cet instant, aucun nouveau télégraphe ne s'ouvre. */
  nextAttackAt: number
  lastHitSwing: number
  deathAt: number
  popped: boolean
  yaw: number
  /** Instant du début de la métamorphose, ou `-Infinity`. */
  morphAt: number
  /** La métamorphose a-t-elle déjà eu lieu ? */
  morphed: boolean
  puddles: Puddle[]
  engaged: boolean
}

/**
 * Quelle attaque lancer, maintenant.
 *
 * Tirage pondéré parmi celles qui sont déchargées et à portée, comme celui du
 * Lynel et pour la même raison : un boss qui enchaîne toujours dans le même
 * ordre s'apprend par cœur en trois tentatives, et le combat devient une
 * récitation.
 */
function pickAttack(state: Runtime, now: number, distance: number): MaleniaAttack | null {
  let total = 0
  const eligible: MaleniaAttack[] = []
  for (const attack of attacksFor(state.phase)) {
    if (now - (state.lastUsedAt[attack.id] ?? -Infinity) < attack.cooldownMs) continue
    if (distance > attack.range) continue
    eligible.push(attack)
    total += attack.weight
  }
  if (eligible.length === 0) return null

  let roll = Math.random() * total
  for (const attack of eligible) {
    roll -= attack.weight
    if (roll <= 0) return attack
  }
  return eligible[eligible.length - 1]
}

/** Le coup touche-t-il, depuis cette position et ce cap ? */
function strikeHits(
  strike: MaleniaStrike,
  position: { x: number; z: number },
  yaw: number,
) {
  const dx = playerTransform.position.x - position.x
  const dz = playerTransform.position.z - position.z
  if (Math.hypot(dx, dz) > strike.reach) return false
  if (strike.arc >= Math.PI) return true
  // Écart angulaire ramené dans [-π, π] — sinon un joueur à 179° et un à −179°
  // seraient à 358° l'un de l'autre et le cône se replierait sur lui-même.
  let delta = Math.atan2(dx, dz) - yaw
  delta = ((delta + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return Math.abs(delta) <= strike.arc
}

/*
  Crochets de développement.

  Même raison que `__lynel` : les deux fonctions ci-dessus décident tout le
  combat et aucune n'est observable à l'œil — un tirage sous contrainte de
  recharge et un cône de 0,9 rad ne se jugent pas sur une capture. Ce sont des
  fonctions pures, donc elles se contrôlent sans qu'aucune Malenia n'existe.

  Elles ne sont pas `export` : les sortir ferait de ce fichier un module mixte,
  ce que `only-export-components` signale à juste titre — le rafraîchissement à
  chaud cesserait de fonctionner sur le boss.
*/
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__malenia = {
    pickAttack,
    strikeHits,
    attacksFor,
    attacks: MALENIA_ATTACKS,
    strikeSpan,
  }
}

export function Malenia() {
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<Group>(null)
  const rig = useMaleniaRig()
  const [removed, setRemoved] = useState(false)
  const [goddess, setGoddess] = useState(false)
  /*
    Le flash d'impact, dans une **référence** et non un état : un coup encaissé
    ne doit pas re-rendre les deux cents maillages du modèle. Le modèle la lit
    dans sa propre boucle — voir `MaleniaModel`.
  */
  const hit = useRef(-Infinity)

  /*
    Tout l'état de combat vit dans une **référence**, comme celui du Lynel.

    Il change soixante fois par seconde et ne conditionne aucun rendu : un
    `useState` en aurait fait un état React qu'on mute en douce, ce que la règle
    `react(immutability)` signale à juste titre. Les deux seules choses qui
    doivent vraiment re-rendre — la métamorphose et le retrait du corps — ont
    leur propre `useState`, et c'est exactement ce qui les distingue du reste.
  */
  const runtime = useRef<Runtime>({
    hp: MALENIA_HP,
    phase: 'blade',
    pending: null,
    strikeOrigin: -Infinity,
    struck: 0,
    lastUsedAt: {},
    staggerUntil: -Infinity,
    nextAttackAt: -Infinity,
    lastHitSwing: -1,
    deathAt: -Infinity,
    popped: false,
    yaw: Math.PI,
    morphAt: -Infinity,
    morphed: false,
    puddles: Array.from({ length: PUDDLES }, () => ({ x: 0, z: 0, until: -Infinity })),
    engaged: false,
  })

  // La pose de construction, une fois les groupes montés. Sans ça elle démarre
  // bras ballants, ce qui n'est la garde de personne.
  useEffect(() => {
    applyBasePose(rig)
  }, [rig])

  // Inscription au registre : la minimap y prend son point, le calque de combat
  // sa barre de vie. Le retrait au démontage est indispensable — sans lui, une
  // Malenia morte resterait affichée sur la carte.
  useEffect(() => {
    enemyRegistry.set(MALENIA_ID, {
      // `lynel` et non une espèce à elle : le registre indexe la couleur de
      // minimap et la barre du calque par espèce, et lui en donner une
      // quatrième aurait demandé une entrée dans `ENEMIES` — c'est-à-dire des
      // statistiques de patrouille, de détection et de tir qu'elle n'utilise
      // pas. Elle emprunte la famille des boss ; c'en est un.
      kind: 'lynel',
      x: ARENA_CENTER[0],
      y: ARENA_CENTER[1],
      z: ARENA_CENTER[2],
      state: 'idle',
      hp: MALENIA_HP,
      maxHp: MALENIA_HP,
      lastHitAt: -Infinity,
    })
    return () => {
      enemyRegistry.delete(MALENIA_ID)
    }
  }, [])

  useFrame((_, rawDelta) => {
    const rb = body.current
    const group = visual.current
    if (!rb || !group || removed) return
    /*
      Deux locales non nulles, et ce n'est pas une politesse envers TypeScript.

      Les fonctions imbriquées plus bas (`resolveStrike`, `wound`) sont des
      fermetures : le compilateur y perd le rétrécissement obtenu par la garde
      ci-dessus, parce que rien ne lui garantit qu'elles s'exécutent dans la
      même frame. Les capturer ici dit ce qui est vrai — elles ne sont appelées
      que d'ici, et jamais différées.
    */
    const rigid = rb
    const model = group

    const state = runtime.current
    const delta = Math.min(rawDelta, 0.05)
    const now = gameNow()
    const store = useGameStore.getState()
    const position = rb.translation()

    // --- Mort ---------------------------------------------------------------
    // Avant tout le reste, comme dans `Enemy.tsx` : un boss tué puis abandonné
    // resterait figé en pleine séquence.
    if (state.deathAt > -Infinity) {
      const age = now - state.deathAt
      if (age < DEATH_SQUASH_MS) {
        group.scale.set(1.3, 0.62, 1.3)
      } else if (age < DEATH_POP_MS) {
        const t = (age - DEATH_SQUASH_MS) / (DEATH_POP_MS - DEATH_SQUASH_MS)
        const ease = 1 - (1 - t) ** 3
        group.scale.set(1.3 - 0.7 * ease, 0.62 + 0.88 * ease, 1.3 - 0.7 * ease)
      } else if (!state.popped) {
        state.popped = true
        group.visible = false
        spawnDeathPuff(position.x, position.y, position.z, DEATH_TINT)
        spawnDeathRing(position.x, GROUND_Y, position.z, DEATH_TINT)
        enemyRegistry.delete(MALENIA_ID)
      }
      rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, false)
      if (age >= DEATH_REMOVE_MS) setRemoved(true)
      return
    }

    // Après la branche de mort et pas avant : à la frame du coup fatal, le corps
    // n'a pas encore pris sa pose écrasée — la hisser plus haut figerait le boss
    // debout, soit la seule pose que ce gel existe pour ne pas montrer.
    if (isHitStopped()) return

    toPlayer.set(
      playerTransform.position.x - position.x,
      0,
      playerTransform.position.z - position.z,
    )
    const distance = toPlayer.length()
    const frozen = store.phase !== 'playing'

    updateEnemyMarker(
      MALENIA_ID,
      position.x,
      position.y,
      position.z,
      state.pending !== null ? 'attack' : state.engaged ? 'chase' : 'idle',
      state.hp,
    )

    // --- Engagement ---------------------------------------------------------
    /*
      Elle se lève quand le joueur entre dans le bassin, pas quand il lui marche
      dessus : `ENGAGE_R` vaut 15 pour une arène de 12, donc il a le temps de la
      voir se lever. Un boss déjà debout à l'arrivée n'a pas d'entrée en scène,
      et une entrée en scène est la seule chose qui dise « c'est ici que ça se
      passe » sans une ligne de texte.

      La caméra d'arène et le verrou du combat passent par `startBossFight`,
      comme pour le Lynel : ce chemin-là existe, il est réglé, et en ouvrir un
      second aurait fait deux endroits où oublier de refermer.
    */
    const fromCenter = Math.hypot(
      playerTransform.position.x - ARENA_CENTER[0],
      playerTransform.position.z - ARENA_CENTER[2],
    )
    if (!state.engaged && fromCenter < ENGAGE_R && !frozen) {
      state.engaged = true
      store.startMaleniaFight()
      track('malenia_engaged', { phase: state.phase })
    }
    // Elle relâche si le joueur quitte franchement le bassin — même marge que le
    // Lynel, et pour la même raison : un pas de côté au bord ne doit pas couper
    // le combat en deux.
    if (state.engaged && fromCenter > ARENA_R * 2) {
      state.engaged = false
      store.endMaleniaFight(false)
      state.pending = null
      cancelParry(MALENIA_ID)
    }

    // --- Coup d'épée du joueur ---------------------------------------------
    // Repris mot pour mot d'`Enemy.tsx` et de `Lynel.tsx` : évalué **une seule
    // fois par swing**, dès la première frame qui suit l'ouverture de la
    // fenêtre, et le swing est marqué consommé qu'il touche ou non.
    const swing = playerTransform.attackStartedAt
    const windowOpened = now - swing >= ATTACK.hitWindow[0] * ATTACK.durationMs
    // L'invulnérabilité de la métamorphose se lit ici, et **seulement ici** :
    // encaisser un coup pendant les 2,2 s l'aurait interrompue ou, pire, l'aurait
    // tuée avant qu'elle n'ait déployé ses ailes.
    const invulnerable = now < state.morphAt + MORPH_MS
    if (windowOpened && state.lastHitSwing !== swing && !invulnerable) {
      state.lastHitSwing = swing
      const hitX = playerTransform.position.x + Math.sin(playerTransform.yaw) * ATTACK.reach
      const hitZ = playerTransform.position.z + Math.cos(playerTransform.yaw) * ATTACK.reach
      if (Math.hypot(position.x - hitX, position.z - hitZ) < ATTACK.radius + BODY_RADIUS) {
        playerTransform.lastLandedSwing = swing
        // Dégâts triplés pendant l'ouverture d'une parade réussie : c'est ce qui
        // fait que le combat se gagne en lisant plutôt qu'en frappant.
        const punishing = now < state.staggerUntil
        const amount = store.swordDamage() * (punishing ? PUNISH_MULTIPLIER : 1)
        if (wound(state, amount, now)) return
      }
    }

    // --- Métamorphose -------------------------------------------------------
    /*
      Elle est **invulnérable et immobile** pendant les 2,2 s : l'armure tombe,
      les ailes s'ouvrent. C'est la seule pause du combat, et elle est là pour
      que le joueur la regarde — un boss qui change de forme en continuant à
      frapper ne change pas de forme, il change de statistiques.

      Le test d'invulnérabilité est **au-dessus** dans la hitbox d'épée
      (`morphEndsAt`), et pas ici : encaisser un coup pendant la métamorphose
      l'aurait interrompue ou, pire, l'aurait tuée avant qu'elle n'ait déployé
      ses ailes.
    */
    if (!state.morphed && state.hp <= MORPH_AT) {
      state.morphed = true
      state.morphAt = now
      state.pending = null
      state.struck = 0
      cancelParry(MALENIA_ID)
      state.phase = 'goddess'
      setGoddess(true)
      shake(0.22, 520)
      playImpact()
      track('malenia_morph', { hearts: store.hearts })
    }
    const morphing = now < state.morphAt + MORPH_MS

    // --- Flaques ------------------------------------------------------------
    /*
      Elles versent de la pourriture au **temps passé dedans**, pas à l'entrée :
      une flaque qui pique une fois est un piège, une flaque qui pique tant qu'on
      y est est un terrain. C'est la différence entre une attaque et un obstacle,
      et c'est pour ça qu'elles rétrécissent l'arène.
    */
    for (const puddle of state.puddles) {
      if (now > puddle.until) continue
      const inside =
        Math.hypot(
          playerTransform.position.x - puddle.x,
          playerTransform.position.z - puddle.z,
        ) < PUDDLE_R
      if (inside && !frozen) soakRot(ROT.perSecondInPuddle * delta, now)
    }

    // --- Déplacement --------------------------------------------------------
    velocity.x = 0
    velocity.z = 0
    let targetYaw = state.yaw

    if (state.engaged && !frozen && !morphing && now > state.staggerUntil) {
      targetYaw = Math.atan2(toPlayer.x, toPlayer.z)
      /*
        Elle avance tant qu'elle n'est pas à portée de lame, et **pas pendant
        une séquence** : une bête qui marche en frappant traîne ses coups
        derrière elle, et les portées mesurées cessent de vouloir dire quelque
        chose. Les replacements se font au coup, explicitement (voir `relocate`).
      */
      if (state.pending === null && distance > CLOSE_ENOUGH) {
        velocity.x = (toPlayer.x / distance) * WALK_SPEED
        velocity.z = (toPlayer.z / distance) * WALK_SPEED
      }
    }

    // La laisse : le bassin. Elle n'en sort pas, et il n'y a pas de herse — le
    // lieu enferme, donc c'est le code qui doit tenir la promesse du lieu.
    const fromArena = Math.hypot(position.x - ARENA_CENTER[0], position.z - ARENA_CENTER[2])
    if (fromArena > LEASH_R) {
      const inward = {
        x: (ARENA_CENTER[0] - position.x) / fromArena,
        z: (ARENA_CENTER[2] - position.z) / fromArena,
      }
      // On annule la seule composante sortante, on ne la renverse pas : la
      // pousser vers le centre l'aurait fait rebondir sur sa propre laisse.
      const outward = velocity.x * -inward.x + velocity.z * -inward.z
      if (outward > 0) {
        velocity.x += inward.x * outward
        velocity.z += inward.z * outward
      }
    }

    rb.setLinvel({ x: velocity.x, y: rb.linvel().y, z: velocity.z }, true)
    state.yaw = MathUtils.damp(state.yaw, nearestAngle(state.yaw, targetYaw), YAW_DAMPING, delta)
    group.rotation.y = state.yaw

    // --- Ouverture d'une séquence ------------------------------------------
    if (
      state.pending === null &&
      state.engaged &&
      !frozen &&
      !morphing &&
      now > state.staggerUntil &&
      now > state.nextAttackAt
    ) {
      const choice = pickAttack(state, now, distance)
      if (choice) {
        state.pending = choice
        state.struck = 0
        state.strikeOrigin = now + choice.telegraphMs
        state.lastUsedAt[choice.id] = now
        /*
          L'offre de parade ne porte que sur le **premier** coup de la séquence.

          Les suivants la reposent au fur et à mesure (voir la résolution), et
          c'est ce qui fait qu'une garde ne couvre qu'un coup : poser les dix
          offres du vol de sarcelle d'un seul geste aurait laissé l'anneau
          allumé trois secondes durant, ce qui ne dit plus rien.
        */
        const first = choice.strikes[0]
        if (first.parryable) offerParry(MALENIA_ID, state.strikeOrigin + first.at)
      }
    }

    // --- Résolution des coups ----------------------------------------------
    if (state.pending !== null) {
      const attack = state.pending
      while (
        state.struck < attack.strikes.length &&
        now >= state.strikeOrigin + attack.strikes[state.struck].at
      ) {
        const strike = attack.strikes[state.struck]
        state.struck++
        resolveStrike(strike)

        // L'offre du coup suivant, dès que celui-ci est passé.
        const next = attack.strikes[state.struck]
        if (next?.parryable) offerParry(MALENIA_ID, state.strikeOrigin + next.at)
        else cancelParry(MALENIA_ID)
      }

      if (state.struck >= attack.strikes.length) {
        state.pending = null
        state.nextAttackAt = now + attack.recoveryMs
      }
    }

    /** Un coup : replacement, portée, parade, dégât, régénération, pourriture. */
    function resolveStrike(strike: MaleniaStrike) {
      /*
        Le replacement — ce qui rend le vol de sarcelle inesquivable.

        Elle se pose à portée du joueur juste avant le coup. Ce n'est pas une
        téléportation arbitraire : c'est le bond que la géométrie ne peut pas
        montrer, et c'est ce qui donne aux portées de la table leur valeur — voir
        la note sur `range`.
      */
      if (strike.relocate && !frozen) {
        const gap = Math.max(0.1, distance)
        const step = Math.min(gap - CLOSE_ENOUGH * 0.8, strike.reach * 0.7)
        if (step > 0) {
          rigid.setTranslation(
            {
              x: position.x + (toPlayer.x / gap) * step,
              y: position.y,
              z: position.z + (toPlayer.z / gap) * step,
            },
            true,
          )
        }
        state.yaw = Math.atan2(toPlayer.x, toPlayer.z)
        model.rotation.y = state.yaw
      }

      if (strike.puddle) openPuddle(playerTransform.position.x, playerTransform.position.z, now)

      const here = rigid.translation()
      if (!strikeHits(strike, here, state.yaw)) return

      if (strike.parryable && consumeParry(now)) {
        /*
          Parade réussie.

          Un spectre se dissipe mais **n'ouvre pas** : on ne peut pas punir une
          image. Sans ce départage, les fantômes seraient la meilleure source
          d'ouvertures du combat, ce qui est l'inverse de ce qu'ils doivent être.
        */
        if (!strike.phantom) state.staggerUntil = now + PARRY.punishMs
        hitStop(PARRY.hitStopMs)
        shake(0.12, 150)
        playParrySuccess()
        track('malenia_parry', { attack: state.pending?.id ?? '' })
        return
      }

      if (frozen) return

      /*
        Sans espèce déclarée, et c'est un choix.

        `damagePlayer` indexe les réductions de dégâts des tenues sur l'espèce de
        l'agresseur. Elle emprunte bien `kind: 'lynel'` au registre, mais c'est
        pour une **couleur de minimap** — un tarif n'est pas un pictogramme. Lui
        donner l'espèce du Lynel ferait bénéficier le joueur, contre le dernier
        boss du jeu, des protections gagnées contre l'avant-dernier.
      */
      store.damagePlayer(strike.damage)
      if (strike.rot) soakRot(strike.rot, now)

      /*
        La régénération — *la* mécanique du personnage.

        Elle ne se déclenche que sur un coup **qui a touché**, donc jamais sur
        une parade réussie : c'est le seul écart de fidélité assumé du combat
        (voir `LIFESTEAL`). Le soin remonte la barre du calque, et il faut qu'il
        se voie — c'est ce qui apprend au joueur ce qu'il vient de perdre.
      */
      heal(strike.lifesteal ?? LIFESTEAL, now)
    }

    /** Ouvre une flaque, en réutilisant la plus ancienne du pool. */
    function openPuddle(x: number, z: number, at: number) {
      let slot = state.puddles[0]
      for (const puddle of state.puddles) if (puddle.until < slot.until) slot = puddle
      slot.x = x
      slot.z = z
      slot.until = at + PUDDLE_MS
    }

    /** Elle se soigne. Plafonné à sa vie de départ, et jamais au-delà du seuil. */
    function heal(amount: number, at: number) {
      /*
        Le plafond est le **seuil de sa phase**, pas ses points de départ.

        Sans ça, une Malenia en phase II qui enchaîne quatre coups remonterait
        au-dessus de trente points de vie — donc en phase I d'après `phaseOf` —
        et le modèle repasserait casqué au milieu du combat, ailes comprises. Le
        défaut ne se serait vu qu'en jouant mal, c'est-à-dire exactement quand il
        aurait fait le plus de mal.
      */
      const ceiling = state.phase === 'goddess' ? MORPH_AT : MALENIA_HP
      state.hp = Math.min(ceiling, state.hp + amount)
      const marker = enemyRegistry.get(MALENIA_ID)
      if (marker) {
        marker.hp = state.hp
        marker.lastHitAt = at
      }
    }

    /** Elle encaisse. Rend `true` si elle en meurt. */
    function wound(runtime: Runtime, amount: number, at: number) {
      runtime.hp -= amount
      hit.current = at + HIT_FLASH_MS
      playHit()

      const marker = enemyRegistry.get(MALENIA_ID)
      if (marker) {
        marker.lastHitAt = at
        marker.hp = Math.max(0, runtime.hp)
      }

      if (runtime.hp > 0) return false

      runtime.deathAt = at
      runtime.popped = false
      runtime.pending = null
      // Sans ça, la tuer pendant un télégraphe laisse l'anneau de parade allumé
      // pour l'éternité, sous un joueur qui n'a plus rien à parer.
      cancelParry(MALENIA_ID)
      if (marker) {
        marker.state = 'dead'
        marker.hp = 0
      }
      hitStop(180)
      shake(0.3, 700)
      playDefeat()
      store.endMaleniaFight(true)
      track('malenia_defeated', { hearts: store.hearts })
      return true
    }
  })

  if (removed) return null

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={[ARENA_CENTER[0], ARENA_CENTER[1] + 1.4, ARENA_CENTER[2] - 4]}
      lockRotations
      mass={3}
      friction={0}
      linearDamping={0.4}
    >
      <CapsuleCollider args={[BODY_HALF_HEIGHT, BODY_RADIUS]} />
      <group ref={visual} position={[0, -(BODY_HALF_HEIGHT + BODY_RADIUS), 0]}>
        <MaleniaModel rig={rig} goddess={goddess} hit={hit} />
      </group>
    </RigidBody>
  )
}

/**
 * L'angle cible le plus proche, pour que l'amortissement ne fasse pas le tour.
 *
 * `MathUtils.damp` interpole linéairement ; sans ce recalage, passer de +3 rad à
 * −3 rad lui fait traverser six radians au lieu de deux dixièmes, et elle
 * pivote sur elle-même chaque fois que le joueur passe derrière son dos.
 */
function nearestAngle(from: number, to: number) {
  let delta = to - from
  delta = ((delta + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return from + delta
}
