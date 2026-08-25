import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import {
  BIOMES,
  PATH_COLOR,
  PATH_HALF_WIDTH,
  biomeBoundaryX,
  sampleBiome,
} from '../../config/biomes'
import { MAP_HALF, MAP_SIZE } from '../../config/gameplay'
import { toonGradient } from '../models/toonGradient'

/** Hauteur des murs invisibles qui ferment la carte. */
const WALL_HEIGHT = 12
/** Subdivisions du sol. Assez fin pour une transition de biome douce. */
const SEGMENTS = 110

/**
 * Sol des deux biomes.
 *
 * La couleur est peinte **par sommet** plutôt que par texture : pas d'asset à
 * charger, une transition parfaitement continue entre prairie et terres
 * arides, et le chemin de terre dessiné dans la foulée. Le coût est un
 * attribut `color` sur la géométrie, calculé une seule fois au montage.
 *
 * Le collider reste une simple boîte plate : le relief visuel est volontairement
 * inférieur à 7 cm, donc invisible sous les pieds du joueur, et la physique
 * n'a jamais à gérer un heightfield.
 */
function useTerrainGeometry() {
  return useMemo(() => {
    const geometry = new PlaneGeometry(MAP_SIZE, MAP_SIZE, SEGMENTS, SEGMENTS)
    const position = geometry.attributes.position
    const colors = new Float32Array(position.count * 3)

    const meadow = new Color(BIOMES.meadow.ground)
    const badlands = new Color(BIOMES.badlands.ground)
    const path = new Color(PATH_COLOR)
    const scratch = new Color()

    for (let i = 0; i < position.count; i++) {
      // Le plan est tourné de -90° sur X à l'affichage : le (x, y) local
      // devient (x, 0, -y) en coordonnées monde.
      const x = position.getX(i)
      const z = -position.getY(i)

      const { blend } = sampleBiome(x, z)
      scratch.copy(meadow).lerp(badlands, blend)

      // Chemin de terre : fondu sur les bords pour éviter la bordure nette.
      const distanceToPath = Math.abs(x - biomeBoundaryX(z))
      const pathMix = 1 - smoothstep(PATH_HALF_WIDTH * 0.45, PATH_HALF_WIDTH, distanceToPath)
      if (pathMix > 0) scratch.lerp(path, pathMix * 0.85)

      // Grain de couleur, pour casser les aplats uniformes.
      const grain = 1 + (Math.sin(x * 1.7) * Math.sin(z * 2.1)) * 0.04
      colors[i * 3] = scratch.r * grain
      colors[i * 3 + 1] = scratch.g * grain
      colors[i * 3 + 2] = scratch.b * grain

      // Relief cosmétique, sous le seuil de perception au niveau des pieds.
      position.setZ(i, Math.sin(x * 0.21) * Math.cos(z * 0.19) * 0.06)
    }

    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    return geometry
  }, [])
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function Terrain() {
  const geometry = useTerrainGeometry()

  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      {/* Collider du sol : sa face supérieure est exactement à y = 0. */}
      <CuboidCollider args={[MAP_HALF, 0.5, MAP_HALF]} position={[0, -0.5, 0]} />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} geometry={geometry}>
        <meshToonMaterial vertexColors gradientMap={toonGradient} />
      </mesh>

      {/* Murs invisibles : pas de mesh, uniquement des colliders. */}
      <CuboidCollider
        args={[MAP_HALF, WALL_HEIGHT, 0.5]}
        position={[0, WALL_HEIGHT, -MAP_HALF]}
      />
      <CuboidCollider
        args={[MAP_HALF, WALL_HEIGHT, 0.5]}
        position={[0, WALL_HEIGHT, MAP_HALF]}
      />
      <CuboidCollider
        args={[0.5, WALL_HEIGHT, MAP_HALF]}
        position={[-MAP_HALF, WALL_HEIGHT, 0]}
      />
      <CuboidCollider
        args={[0.5, WALL_HEIGHT, MAP_HALF]}
        position={[MAP_HALF, WALL_HEIGHT, 0]}
      />
    </RigidBody>
  )
}
