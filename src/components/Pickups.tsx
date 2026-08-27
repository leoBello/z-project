import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  type InstancedMesh,
  Matrix4,
  MeshToonMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { sampleHeight } from '../config/world'
import { now as gameNow } from '../state/gameClock'
import { playerTransform } from '../state/playerTransform'
import {
  PICKUP_GRAVITY,
  PICKUP_HOVER,
  PICKUP_LIFETIME_MS,
  PICKUP_POOL_SIZE,
  PICKUP_RADIUS,
  PICKUP_WARNING_MS,
  pickups,
} from '../state/pickups'
import { useGameStore } from '../store/useGameStore'
import { heartGeometry } from './models/heartGeometry'
import { toonGradient } from './models/toonGradient'

const HIDDEN = new Matrix4().makeScale(0, 0, 0)
const matrix = new Matrix4()
const position = new Vector3()
const quaternion = new Quaternion()
const scale = new Vector3()
const UP = new Vector3(0, 1, 0)

/** Taille du cœur, en unités monde. */
const HEART_SIZE = 0.26

/**
 * Cœurs au sol.
 *
 * Un seul `InstancedMesh` pour tout le pool, comme les projectiles : le nombre
 * de cœurs à l'écran ne change rien au nombre de draw calls. Les emplacements
 * inactifs sont mis à l'échelle zéro plutôt que retirés.
 */
export function Pickups() {
  const mesh = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => heartGeometry(HEART_SIZE), [])
  const material = useMemo(
    () => new MeshToonMaterial({ color: '#e8443c', gradientMap: toonGradient }),
    [],
  )

  useFrame((_, rawDelta) => {
    const instanced = mesh.current
    if (!instanced) return

    const delta = Math.min(rawDelta, 0.05)
    const now = gameNow()
    const store = useGameStore.getState()

    // Ces deux pools intègrent leur mouvement à la main, hors de Rapier : le
    // `paused` du moteur physique ne les atteint pas. Sans ce garde, un
    // projectile continue de traverser l'écran derrière le panneau et un cœur
    // continue de tomber, alors que tout le reste du monde est figé. Aucune
    // conséquence de jeu — `damagePlayer` et `healPlayer` refusent déjà hors de
    // `playing` — mais l'image, elle, trahissait la pause.
    if (store.phase !== 'playing') return

    for (let i = 0; i < pickups.length; i++) {
      const pickup = pickups[i]

      if (pickup.active) {
        const age = now - pickup.bornAt

        if (!pickup.landed) {
          pickup.velocityY += PICKUP_GRAVITY * delta
          pickup.position.y += pickup.velocityY * delta
          // Même échantillonneur que le terrain : le cœur se pose exactement
          // sur la surface visible, jamais enfoncé ni flottant.
          const ground = sampleHeight(pickup.position.x, pickup.position.z) + PICKUP_HOVER
          if (pickup.position.y <= ground && pickup.velocityY <= 0) {
            pickup.position.y = ground
            pickup.velocityY = 0
            pickup.landed = true
          }
        }

        const dx = playerTransform.position.x - pickup.position.x
        const dz = playerTransform.position.z - pickup.position.z
        const dy = playerTransform.position.y - pickup.position.y
        if (
          Math.hypot(dx, dz) < PICKUP_RADIUS &&
          Math.abs(dy) < 2 &&
          // Le cœur n'est consommé que s'il a servi : à vie pleine il reste au
          // sol, et le joueur peut revenir le chercher après avoir pris un coup.
          store.healPlayer(1)
        ) {
          pickup.active = false
        } else if (age > PICKUP_LIFETIME_MS) {
          pickup.active = false
        }
      }

      if (pickup.active) {
        const age = now - pickup.bornAt
        const remaining = PICKUP_LIFETIME_MS - age
        // Fin de vie : le cœur palpite au lieu de clignoter. Tous les cœurs
        // partagent un matériau d'`InstancedMesh`, donc l'opacité ne peut pas
        // varier d'une instance à l'autre — l'échelle, elle, tient dans la
        // matrice d'instance et ne coûte rien.
        let visible = 1
        if (remaining < PICKUP_WARNING_MS) {
          visible = Math.floor(now / 130) % 2 === 0 ? 1 : 0.62
        }

        const bob = pickup.landed ? Math.sin(now * 0.004 + pickup.phase) * 0.09 : 0
        position.set(pickup.position.x, pickup.position.y + bob, pickup.position.z)
        quaternion.setFromAxisAngle(UP, now * 0.0018 + pickup.phase)
        scale.setScalar(visible)
        matrix.compose(position, quaternion, scale)
        instanced.setMatrixAt(i, matrix)
      } else {
        instanced.setMatrixAt(i, HIDDEN)
      }
    }

    instanced.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, PICKUP_POOL_SIZE]}
      castShadow
      // Les cœurs sont dispersés sur toute la carte : recalculer un volume
      // englobant commun à chaque frame coûterait plus cher que de les dessiner.
      frustumCulled={false}
    />
  )
}
