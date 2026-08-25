import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { IcosahedronGeometry, Matrix4, MeshToonMaterial, Vector3, type InstancedMesh } from 'three'
import { sampleHeight } from '../config/world'
import { playerTransform } from '../state/playerTransform'
import {
  PROJECTILE_GRAVITY,
  PROJECTILE_HIT_RADIUS,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_POOL_SIZE,
  projectiles,
} from '../state/projectiles'
import { useGameStore } from '../store/useGameStore'
import { toonGradient } from './models/toonGradient'

const HIDDEN = new Matrix4().makeScale(0, 0, 0)
const matrix = new Matrix4()
const scratch = new Vector3()

/**
 * Rendu et simulation des projectiles.
 *
 * Un seul `InstancedMesh` pour tout le pool : quel que soit le nombre de tirs à
 * l'écran, ça reste un draw call. Les projectiles inactifs sont mis à l'échelle
 * zéro plutôt que retirés — réécrire la géométrie coûterait plus cher que de
 * dessiner un point invisible.
 */
export function Projectiles() {
  const mesh = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new IcosahedronGeometry(0.2, 0), [])
  const material = useMemo(
    () => new MeshToonMaterial({ color: '#2f3b46', gradientMap: toonGradient }),
    [],
  )

  useFrame((_, rawDelta) => {
    const instanced = mesh.current
    if (!instanced) return

    const delta = Math.min(rawDelta, 0.05)
    const now = performance.now()
    const store = useGameStore.getState()

    for (let i = 0; i < projectiles.length; i++) {
      const projectile = projectiles[i]

      if (projectile.active) {
        projectile.velocity.y += PROJECTILE_GRAVITY * delta
        projectile.position.addScaledVector(projectile.velocity, delta)

        // Impact sur le joueur.
        scratch.copy(playerTransform.position)
        if (projectile.position.distanceTo(scratch) < PROJECTILE_HIT_RADIUS) {
          projectile.active = false
          store.damagePlayer()
        } else if (now - projectile.bornAt > PROJECTILE_LIFETIME_MS) {
          projectile.active = false
        } else if (
          // Impact sur le sol : on interroge le même échantillonneur de relief
          // que le terrain, donc l'impact tombe pile sur la surface visible.
          projectile.position.y <
          sampleHeight(projectile.position.x, projectile.position.z)
        ) {
          projectile.active = false
        }
      }

      if (projectile.active) {
        matrix.makeTranslation(
          projectile.position.x,
          projectile.position.y,
          projectile.position.z,
        )
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
      args={[geometry, material, PROJECTILE_POOL_SIZE]}
      castShadow
      // Le volume englobant serait recalculé en permanence pour des objets qui
      // traversent la carte : moins cher de désactiver le culling.
      frustumCulled={false}
    />
  )
}
