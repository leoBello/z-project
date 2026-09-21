import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  type InstancedMesh,
  Matrix4,
  MeshToonMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { isHitStopped, now as gameNow } from '../state/gameClock'
import { playerTransform } from '../state/playerTransform'
import {
  PICKUP_GRAVITY,
  PICKUP_LIFETIME_MS,
  PICKUP_POOL_SIZE,
  PICKUP_RADIUS,
  PICKUP_REACH_Y,
  PICKUP_WARNING_MS,
  landingHeight,
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
    // continue de tomber, alors que tout le reste du monde est figé. Deux gels
    // le demandent, et non un seul. Le panneau ouvert d'abord, où seule l'image
    // trahissait la pause — `damagePlayer` et `healPlayer` refusent déjà hors de
    // `playing`. Le hit-stop du coup fatal ensuite, pendant lequel la phase vaut
    // toujours `playing` : un cœur qui tombe encore alors que le monde entier
    // tient sa pose devient le seul mouvement de l'écran, donc le seul qu'on voit.
    if (store.phase !== 'playing' || isHitStopped()) return

    for (let i = 0; i < pickups.length; i++) {
      const pickup = pickups[i]

      if (pickup.active) {
        const age = now - pickup.bornAt

        if (!pickup.landed) {
          pickup.velocityY += PICKUP_GRAVITY * delta
          pickup.position.y += pickup.velocityY * delta
          // Même échantillonneur que le terrain **de la carte où l'on est** : le
          // cœur se pose exactement sur la surface visible, jamais enfoncé ni
          // flottant. Ce composant est monté au-dessus des quatre cartes, donc
          // il ne peut pas nommer un relief ; c'est la carte qui pose le sien.
          const floor = landingHeight(pickup.position.x, pickup.position.z)
          if (pickup.position.y <= floor && pickup.velocityY <= 0) {
            pickup.position.y = floor
            pickup.velocityY = 0
            pickup.landed = true
          }
        }

        const dx = playerTransform.position.x - pickup.position.x
        const dz = playerTransform.position.z - pickup.position.z
        const dy = playerTransform.position.y - pickup.position.y
        if (
          Math.hypot(dx, dz) < PICKUP_RADIUS &&
          Math.abs(dy) < PICKUP_REACH_Y &&
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
