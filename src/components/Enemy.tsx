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
  DEATH_FADE_MS,
  ENEMIES,
  HEART_DROP_CHANCE,
  HIT_FLASH_MS,
  HIT_KNOCKBACK,
} from '../config/enemies'
import { ATTACK } from '../config/gameplay'
import { playerTransform } from '../state/playerTransform'
import { enemyRegistry, updateEnemyMarker } from '../state/enemyRegistry'
import { now as gameNow } from '../state/gameClock'
import { dropPickup } from '../state/pickups'
import { fireProjectile } from '../state/projectiles'
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
  /** Cap visuel, lissé. */
  yaw: number
  /** Cible de patrouille, relative au point d'apparition. */
  patrolAngle: number
  patrolUntil: number
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

    // --- Mort ---------------------------------------------------------------
    if (state.state === 'dead') {
      const progress = (now - state.deathAt) / DEATH_FADE_MS
      // Effondrement : l'ennemi s'aplatit et rétrécit avant de disparaître.
      const scale = Math.max(0, 1 - progress)
      group.scale.set(scale, scale * Math.max(0, 1 - progress * 1.6), scale)
      rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, false)
      if (progress >= 1) {
        enemyRegistry.delete(spawn.id)
        setRemoved(true)
      }
      return
    }

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
        state.hp -= 1
        state.hitFlashUntil = now + HIT_FLASH_MS
        // Signale au reste du jeu que ce swing a porté : le retour visuel du
        // coup dans le vide s'en sert, et la barre de vie reste affichée un
        // moment après le dernier coup encaissé.
        playerTransform.lastLandedSwing = swing
        const marker = enemyRegistry.get(spawn.id)
        if (marker) marker.lastHitAt = now

        // Recul : l'ennemi est projeté à l'opposé du joueur, avec un petit saut.
        knockback.copy(toPlayer).normalize().multiplyScalar(-HIT_KNOCKBACK)
        rb.setLinvel({ x: knockback.x, y: 3, z: knockback.z }, true)

        if (state.hp <= 0) {
          state.state = 'dead'
          state.deathAt = now
          useGameStore.getState().registerKill()
          // Le cœur part de la poitrine, pas des pieds : le petit saut le rend
          // visible par-dessus les herbes hautes avant qu'il ne retombe.
          if (Math.random() < HEART_DROP_CHANCE) {
            dropPickup(position.x, position.y + 0.3, position.z)
          }
          return
        }
      }
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
