import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  ExtrudeGeometry,
  type InstancedMesh,
  Matrix4,
  MeshToonMaterial,
  Quaternion,
  Shape,
  Vector3,
} from 'three'
import { sampleHeight } from '../config/world'
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
 * Cœur en volume, tracé à la main puis extrudé.
 *
 * Pas de `.glb` : la silhouette d'un cœur tient en six courbes de Bézier, et le
 * générer ici garde la promesse du projet — aucun octet à télécharger, et la
 * couleur reste celle du HUD sans avoir à retoucher un fichier.
 */
function heartGeometry() {
  const shape = new Shape()
  shape.moveTo(0, -1)
  shape.bezierCurveTo(0.55, -0.45, 1.1, -0.05, 1.1, 0.4)
  shape.bezierCurveTo(1.1, 0.85, 0.75, 1.05, 0.45, 1.05)
  shape.bezierCurveTo(0.2, 1.05, 0.05, 0.9, 0, 0.72)
  shape.bezierCurveTo(-0.05, 0.9, -0.2, 1.05, -0.45, 1.05)
  shape.bezierCurveTo(-0.75, 1.05, -1.1, 0.85, -1.1, 0.4)
  shape.bezierCurveTo(-1.1, -0.05, -0.55, -0.45, 0, -1)

  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.55,
    bevelEnabled: true,
    bevelSize: 0.16,
    bevelThickness: 0.12,
    bevelSegments: 2,
    curveSegments: 8,
  })
  // Centrée puis mise à l'échelle : la forme est dessinée dans un repère
  // arbitraire, l'instance doit tourner autour de son propre centre.
  geometry.center()
  geometry.scale(HEART_SIZE, HEART_SIZE, HEART_SIZE)
  return geometry
}

/**
 * Cœurs au sol.
 *
 * Un seul `InstancedMesh` pour tout le pool, comme les projectiles : le nombre
 * de cœurs à l'écran ne change rien au nombre de draw calls. Les emplacements
 * inactifs sont mis à l'échelle zéro plutôt que retirés.
 */
export function Pickups() {
  const mesh = useRef<InstancedMesh>(null)
  const geometry = useMemo(heartGeometry, [])
  const material = useMemo(
    () => new MeshToonMaterial({ color: '#e8443c', gradientMap: toonGradient }),
    [],
  )

  useFrame((_, rawDelta) => {
    const instanced = mesh.current
    if (!instanced) return

    const delta = Math.min(rawDelta, 0.05)
    const now = performance.now()
    const store = useGameStore.getState()

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
