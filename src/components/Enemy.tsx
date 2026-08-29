import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CapsuleCollider,
  CoefficientCombineRule,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier'
import { Color, Group, MathUtils, Vector3 } from 'three'
import {
  DEATH_POP_MS,
  DEATH_REMOVE_MS,
  DEATH_SHAKE_AMPLITUDE,
  DEATH_SHAKE_MS,
  DEATH_SQUASH_MS,
  ENEMIES,
  HEART_DROP_CHANCE,
  HIT_FLASH_MS,
  HIT_KNOCKBACK,
  HIT_STOP_MS,
} from '../config/enemies'
import { playDefeat, playHit } from '../audio/sfx'
import { ATTACK } from '../config/gameplay'
import { sampleHeight } from '../config/world'
import { playerTransform } from '../state/playerTransform'
import { shake } from '../state/cameraShake'
import { spawnDeathPuff, spawnDeathRing } from '../state/deathPuffs'
import { enemyRegistry, updateEnemyMarker } from '../state/enemyRegistry'
import { hitStop, now as gameNow } from '../state/gameClock'
import { dropPickup } from '../state/pickups'
import {
  fireProjectile,
  PROJECTILE_HIT_RADIUS,
  projectiles,
} from '../state/projectiles'
import { useGameStore } from '../store/useGameStore'
import type { EnemySpawn, EnemyState } from '../types/game'
import { MoblinModel, OctorokModel, useEnemyMaterials } from './enemies/models'

/** Au-delà de cette distance, l'ennemi n'est ni affiché ni mis à jour. */
const ACTIVE_RADIUS = 85

// Vecteurs de travail partagés : `useFrame` tourne pour chaque ennemi à chaque
// frame, allouer dedans ferait travailler le GC pour rien.
const toPlayer = new Vector3()
const knockback = new Vector3()
const muzzle = new Vector3()
const playerChest = new Vector3()
const WHITE = new Color(1, 1, 1)

/**
 * Dernière mort en date, pour vérification depuis la page.
 *
 * Même raison que `__lastSwing` : la séquence dure 210 ms, aucune capture ne
 * l'attrapera et le rendu headless tourne à 1 fps. Ce qui se mesure, ce sont
 * les horodatages et les drapeaux.
 */
const lastDeath = {
  spawnId: '',
  deathAt: -Infinity,
  poppedAt: -Infinity,
  dropsHeart: false,
}
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__lastDeath = lastDeath
}

interface EnemyRuntime {
  hp: number
  state: EnemyState
  /** Horodatage d'entrée dans l'état courant. */
  stateSince: number
  lastAttackAt: number
  /** Vrai entre le début d'une préparation d'attaque et sa résolution. */
  windupPending: boolean
  windupStartedAt: number
  /** Identifiant du coup d'épée déjà encaissé : un swing ne blesse qu'une fois. */
  lastHitSwing: number
  hitFlashUntil: number
  deathAt: number
  /**
   * Tiré à la mort, consommé au pic.
   *
   * Le tirage reste à l'instant de la mort — seul le lâcher est différé, pour
   * que le cœur se lise comme jaillissant de la fumée plutôt que du corps.
   */
  dropsHeart: boolean
  /** Vrai une fois la fumée émise : elle ne doit l'être qu'une fois. */
  popped: boolean
  /** Cap visuel, lissé. */
  yaw: number
  /** Cible de patrouille, relative au point d'apparition. */
  patrolAngle: number
  patrolUntil: number
}

/**
 * Applique des dégâts et tout ce qui va avec : flash, recul, mort.
 *
 * Deux sources y mènent — le coup d'épée et le projectile renvoyé — et elles
 * doivent produire *exactement* le même effet, cœur lâché compris. Le recul est
 * calculé depuis la source du coup, pas depuis le joueur : une balle parée qui
 * arrive de côté doit pousser de côté.
 *
 * Le montant, lui, dépend de l'appelant : l'arme portée multiplie le coup
 * d'épée, jamais le renvoi de projectile — celui-ci est une parade, pas une
 * frappe, et il n'y a aucune raison qu'une lame plus tranchante fasse un
 * projectile plus meurtrier.
 *
 * Retourne vrai si l'ennemi vient de mourir, pour que l'appelant s'arrête là.
 */
function damageEnemy(
  state: EnemyRuntime,
  rb: RapierRigidBody,
  x: number,
  z: number,
  spawnId: string,
  now: number,
  fromX: number,
  fromZ: number,
  amount: number,
) {
  state.hp -= amount
  state.hitFlashUntil = now + HIT_FLASH_MS
  playHit()

  const marker = enemyRegistry.get(spawnId)
  if (marker) marker.lastHitAt = now

  knockback.set(x - fromX, 0, z - fromZ)
  // Source confondue avec l'ennemi (tir à bout portant) : pas de direction de
  // recul exploitable, on ne pousse pas plutôt que de pousser n'importe où.
  if (knockback.lengthSq() > 1e-6) {
    knockback.normalize().multiplyScalar(HIT_KNOCKBACK)
    rb.setLinvel({ x: knockback.x, y: 3, z: knockback.z }, true)
  }

  if (state.hp > 0) return false

  state.state = 'dead'
  state.deathAt = now
  state.popped = false
  // Le tirage se fait ici, à l'instant de la mort, et avec `Math.random` et non
  // la graine du monde — une graine fixe rendrait les lâchers identiques à
  // chaque partie, et le joueur apprendrait quels ennemis « donnent » un cœur.
  // Seul le lâcher est différé, jusqu'au pic de la détente.
  state.dropsHeart = Math.random() < HEART_DROP_CHANCE
  useGameStore.getState().registerKill()

  // Les trois retours qui font la différence entre « l'ennemi a disparu » et
  // « je l'ai eu ». Tous trois chronométrés en temps réel : ils doivent jouer
  // pendant le gel, qui est le moment où ils portent.
  playDefeat()
  hitStop(HIT_STOP_MS)
  shake(DEATH_SHAKE_AMPLITUDE, DEATH_SHAKE_MS)

  if (import.meta.env.DEV) {
    lastDeath.spawnId = spawnId
    lastDeath.deathAt = now
    lastDeath.poppedAt = -Infinity
    lastDeath.dropsHeart = state.dropsHeart
  }

  return true
}

interface EnemyProps {
  spawn: EnemySpawn
}

/**
 * Ennemi générique.
 *
 * Une seule machine à états pour toutes les espèces : `idle → patrol → chase →
 * attack → dead`. Ce qui change d'une espèce à l'autre tient entièrement dans
 * `ENEMIES[kind]` et dans le modèle affiché — ajouter un troisième type ne
 * demandera pas de toucher à cette logique.
 */
export function Enemy({ spawn }: EnemyProps) {
  const stats = ENEMIES[spawn.kind]
  const materials = useEnemyMaterials(spawn.kind)

  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<Group>(null)
  const [removed, setRemoved] = useState(false)

  const runtime = useRef<EnemyRuntime>({
    hp: stats.hp,
    state: 'idle',
    stateSince: 0,
    lastAttackAt: -Infinity,
    windupPending: false,
    windupStartedAt: 0,
    lastHitSwing: -Infinity,
    hitFlashUntil: -Infinity,
    deathAt: -Infinity,
    dropsHeart: false,
    popped: false,
    yaw: 0,
    patrolAngle: Math.random() * Math.PI * 2,
    patrolUntil: 0,
  })

  // Inscription à la minimap. Le retrait au démontage est indispensable :
  // sans lui, les ennemis tués resteraient affichés sur la carte.
  useEffect(() => {
    enemyRegistry.set(spawn.id, {
      kind: spawn.kind,
      x: spawn.position[0],
      y: spawn.position[1],
      z: spawn.position[2],
      state: 'idle',
      hp: stats.hp,
      maxHp: stats.hp,
      lastHitAt: -Infinity,
    })
    return () => {
      enemyRegistry.delete(spawn.id)
    }
  }, [spawn])

  useFrame((_, rawDelta) => {
    const rb = body.current
    const group = visual.current
    if (!rb || !group || removed) return

    const delta = Math.min(rawDelta, 0.05)
    const now = gameNow()
    const state = runtime.current
    const store = useGameStore.getState()
    const position = rb.translation()

    // --- Mort ---------------------------------------------------------------
    // Placée **avant** le test de culling, et c'est une correction : un ennemi
    // tué puis quitté au-delà d'ACTIVE_RADIUS n'atteignait jamais cette
    // branche. Il restait figé en `dead` pour le reste de la partie, ne se
    // démontait jamais, et son entrée de registre restait en mémoire.
    if (state.state === 'dead') {
      const age = now - state.deathAt

      // Le corps reste blanc jusqu'au bout. L'affectation du flash est plus
      // bas, après ce `return` : sans ces deux lignes, un cadavre reprendrait
      // sa couleur d'origine au milieu de sa propre mort.
      materials.body.color.copy(WHITE)
      materials.dark.color.copy(WHITE)

      if (age < DEATH_SQUASH_MS) {
        // Anticipation : le corps se ramasse. C'est la pose que le gel tient,
        // donc la frame que le joueur regarde vraiment.
        group.scale.set(1.35, 0.6, 1.35)
        group.position.y = 0
        group.position.z = 0
      } else if (age < DEATH_POP_MS) {
        // Détente, en sortie cubique : une rampe linéaire donne un étirement
        // mou, qui se lit comme un objet qu'on tire et non comme un ressort
        // qu'on lâche.
        const t = (age - DEATH_SQUASH_MS) / (DEATH_POP_MS - DEATH_SQUASH_MS)
        const ease = 1 - (1 - t) ** 3
        group.scale.set(1.35 - 0.75 * ease, 0.6 + 0.9 * ease, 1.35 - 0.75 * ease)
        group.position.y = ease * 0.2
        group.position.z = 0
      } else if (!state.popped) {
        state.popped = true
        group.visible = false
        spawnDeathPuff(position.x, position.y, position.z, materials.base.body)
        // L'anneau se pose sur la surface **visible** du terrain, pas sous le
        // centre de la capsule : même échantillonneur que le mesh, le collider
        // et les cœurs, donc aucune seconde source de vérité.
        spawnDeathRing(
          position.x,
          sampleHeight(position.x, position.z),
          position.z,
          materials.base.body,
        )
        // Le cœur part de la poitrine, pas des pieds : le petit saut le rend
        // visible par-dessus les herbes hautes avant qu'il ne retombe.
        if (state.dropsHeart) dropPickup(position.x, position.y + 0.3, position.z)
        // Le point quitte la minimap au pic et non au démontage : la carte et
        // l'écran doivent dire la même chose au même moment.
        enemyRegistry.delete(spawn.id)
        if (import.meta.env.DEV) lastDeath.poppedAt = now
      }

      rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, false)
      if (age >= DEATH_REMOVE_MS) setRemoved(true)
      return
    }

    toPlayer.set(
      playerTransform.position.x - position.x,
      0,
      playerTransform.position.z - position.z,
    )
    const distance = toPlayer.length()

    // --- Culling : rien à faire pour un ennemi hors de portée de vue --------
    const active = distance < ACTIVE_RADIUS
    group.visible = active
    if (!active) {
      rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, false)
      return
    }

    updateEnemyMarker(spawn.id, position.x, position.y, position.z, state.state, state.hp)

    // --- Coup d'épée du joueur ---------------------------------------------
    // La hitbox est une simple sphère posée devant le joueur : pas de requête
    // physique, résultat prévisible, et le coût est négligeable.
    //
    // Point important : le coup est évalué **une seule fois par swing**, dès la
    // première frame qui suit l'ouverture de la fenêtre, et le swing est marqué
    // consommé qu'il touche ou non. Tester « sommes-nous à l'intérieur de la
    // fenêtre ? » reviendrait à échantillonner un intervalle de 135 ms dans une
    // boucle à cadence variable : sur une machine lente, une frame sur deux
    // tomberait à côté et les coups ne porteraient pas. Même piège que le
    // sondage clavier corrigé plus tôt.
    const swing = playerTransform.attackStartedAt
    const swingAge = now - swing
    const windowOpened = swingAge >= ATTACK.hitWindow[0] * ATTACK.durationMs

    if (windowOpened && state.lastHitSwing !== swing) {
      state.lastHitSwing = swing
      const hitX = playerTransform.position.x + Math.sin(playerTransform.yaw) * ATTACK.reach
      const hitZ = playerTransform.position.z + Math.cos(playerTransform.yaw) * ATTACK.reach
      const reach = ATTACK.radius + stats.radius
      if (Math.hypot(position.x - hitX, position.z - hitZ) < reach) {
        // Signale au reste du jeu que ce swing a porté : le retour visuel du
        // coup dans le vide s'en sert, et la barre de vie reste affichée un
        // moment après le dernier coup encaissé.
        playerTransform.lastLandedSwing = swing
        const died = damageEnemy(
          state,
          rb,
          position.x,
          position.z,
          spawn.id,
          now,
          playerTransform.position.x,
          playerTransform.position.z,
          // Lu au moment du coup et non mémorisé : l'inventaire met la partie en
          // pause, donc l'arme peut changer entre deux frappes sans que ce
          // composant en soit averti.
          store.swordDamage(),
        )
        if (died) return
      }
    }

    // --- Projectile renvoyé -------------------------------------------------
    // La collision est testée ici, et pas dans la boucle des projectiles, pour
    // la même raison que la hitbox d'épée : les PV vivent dans ce composant, et
    // les faire vivre ailleurs créerait une seconde source de vérité. Le
    // projectile, lui, n'a qu'à être désactivé.
    for (const projectile of projectiles) {
      if (!projectile.active || !projectile.deflected) continue
      const reach = stats.radius + PROJECTILE_HIT_RADIUS
      if (
        Math.hypot(
          projectile.position.x - position.x,
          projectile.position.y - position.y,
          projectile.position.z - position.z,
        ) > reach
      ) {
        continue
      }

      projectile.active = false
      const died = damageEnemy(
        state,
        rb,
        position.x,
        position.z,
        spawn.id,
        now,
        projectile.position.x,
        projectile.position.z,
        1,
      )
      if (died) return
      break
    }

    // Flash blanc à l'impact : le retour visuel qui rend le combat lisible.
    const flashing = now < state.hitFlashUntil
    materials.body.color.copy(flashing ? WHITE : materials.base.body)
    materials.dark.color.copy(flashing ? WHITE : materials.base.dark)

    // --- Machine à états ----------------------------------------------------
    const frozen = store.phase !== 'playing'
    let desired: EnemyState = 'idle'

    if (frozen) {
      desired = 'idle'
    } else if (distance < stats.attackRange) {
      desired = 'attack'
    } else if (distance < stats.detectRadius) {
      desired = 'chase'
    } else if (now > state.patrolUntil) {
      // Patrouille : nouvelle direction toutes les quelques secondes.
      state.patrolAngle = Math.random() * Math.PI * 2
      state.patrolUntil = now + 2500 + Math.random() * 2500
      desired = 'patrol'
    } else {
      desired = state.state === 'chase' || state.state === 'attack' ? 'idle' : state.state
    }

    if (desired !== state.state) {
      state.state = desired
      state.stateSince = now
    }

    // --- Déplacement --------------------------------------------------------
    let velocityX = 0
    let velocityZ = 0
    let targetYaw = state.yaw

    if (state.state === 'chase') {
      toPlayer.normalize()
      velocityX = toPlayer.x * stats.speed
      velocityZ = toPlayer.z * stats.speed
      targetYaw = Math.atan2(toPlayer.x, toPlayer.z)
    } else if (state.state === 'attack') {
      // À portée : on s'arrête et on fait face.
      targetYaw = Math.atan2(toPlayer.x, toPlayer.z)
    } else if (state.state === 'patrol') {
      // Les ennemis restent autour de leur point d'apparition : ça évite qu'ils
      // dérivent tous vers le joueur et vident le reste de la carte.
      const home = Math.hypot(position.x - spawn.position[0], position.z - spawn.position[2])
      const angle =
        home > (spawn.radius ?? 8)
          ? Math.atan2(spawn.position[0] - position.x, spawn.position[2] - position.z)
          : state.patrolAngle
      velocityX = Math.sin(angle) * stats.patrolSpeed
      velocityZ = Math.cos(angle) * stats.patrolSpeed
      targetYaw = angle
    }

    rb.setLinvel({ x: velocityX, y: rb.linvel().y, z: velocityZ }, true)

    state.yaw = dampAngle(state.yaw, targetYaw, 9, delta)
    group.rotation.y = state.yaw

    // --- Attaque : préparation, puis résolution ------------------------------
    // La préparation est un **drapeau consommé**, pas un intervalle testé à
    // chaque frame. Écrire « sommes-nous dans la fenêtre de préparation ? »
    // reviendrait à échantillonner quelques centaines de millisecondes dans une
    // boucle à cadence variable — le piège déjà payé trois fois sur ce projet.
    const ready =
      state.state === 'attack' && !frozen && now - state.lastAttackAt > stats.attackCooldownMs

    if (ready && !state.windupPending) {
      state.windupPending = true
      state.windupStartedAt = now
    }

    // Sortir de portée annule le coup en préparation. C'est tout l'intérêt du
    // temps de préparation : sans annulation, il ne ferait que retarder un coup
    // de toute façon inévitable.
    if (state.windupPending && (frozen || state.state !== 'attack')) {
      state.windupPending = false
    }

    if (state.windupPending && now - state.windupStartedAt >= stats.telegraphMs) {
      state.windupPending = false
      state.lastAttackAt = now
      if (stats.ranged) {
        muzzle.set(position.x, position.y + 0.45, position.z)
        playerChest.copy(playerTransform.position)
        fireProjectile(muzzle, playerChest, stats.spread)
      } else {
        useGameStore.getState().damagePlayer(stats.damage)
      }
    }

    // Anticipation puis détente sur l'attaque : suffit à lire le coup.
    const sinceAttack = now - state.lastAttackAt
    const lunge = sinceAttack < 260 ? Math.sin((sinceAttack / 260) * Math.PI) : 0
    // Le corps se ramasse pendant la préparation et se détend au moment du
    // coup : c'est ce mouvement, plus que la couleur, qui rend l'attaque
    // lisible à la périphérie du regard.
    const windup = state.windupPending
      ? Math.min(1, (now - state.windupStartedAt) / stats.telegraphMs)
      : 0
    group.position.z = lunge * 0.28 - windup * 0.2
    const bob = state.state === 'chase' ? Math.abs(Math.sin(now * 0.012)) * 0.08 : 0
    group.position.y = bob - windup * 0.1
    const puff = flashing ? 1.18 : 1 + windup * 0.22
    group.scale.setScalar(MathUtils.damp(group.scale.x, puff, 18, delta))
  })

  if (removed) return null

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={[spawn.position[0], spawn.position[1] + 1.5, spawn.position[2]]}
      lockRotations
      mass={1}
      ccd
    >
      {/* Même réglage que le joueur : friction nulle en règle `Min`, sinon le
          sol freine l'ennemi entre deux frames et sa vitesse dépend du framerate. */}
      <CapsuleCollider
        args={[stats.halfHeight, stats.radius]}
        friction={0}
        frictionCombineRule={CoefficientCombineRule.Min}
      />
      <group ref={visual} position={[0, -(stats.halfHeight + stats.radius), 0]}>
        {spawn.kind === 'octorok' ? (
          <OctorokModel materials={materials} />
        ) : (
          <MoblinModel materials={materials} />
        )}
      </group>
    </RigidBody>
  )
}

/** Rapproche un angle d'un autre par le chemin le plus court. */
function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = (target - current) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}
