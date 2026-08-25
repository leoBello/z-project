import { useMemo } from 'react'
import { CuboidCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import { BIOMES, SNOW_COLOR, WET_SAND } from '../../config/biomes'
import {
  WORLD,
  islandMask,
  regionValue,
  sampleHeight,
  smoothstep,
} from '../../config/world'
import { toonGradient } from '../models/toonGradient'

/** Hauteur des murs invisibles qui ferment la carte. */
const WALL_HEIGHT = 30
/** Nombre de points par côté (une cellule de plus que de subdivisions). */
const POINTS = WORLD.grid + 1
const CELL = WORLD.size / WORLD.grid

/**
 * Grille de hauteurs, calculée une seule fois et partagée par le mesh visuel
 * et le collider physique. C'est le point clé : les deux lisent exactement le
 * même tableau, ils ne peuvent donc pas diverger.
 *
 * Indexation : `heights[ix + iz * POINTS]`, avec
 * `x = -half + ix * CELL` et `z = -half + iz * CELL`.
 */
function buildHeights() {
  const heights = new Float32Array(POINTS * POINTS)
  for (let iz = 0; iz < POINTS; iz++) {
    const z = -WORLD.half + iz * CELL
    for (let ix = 0; ix < POINTS; ix++) {
      const x = -WORLD.half + ix * CELL
      heights[ix + iz * POINTS] = sampleHeight(x, z)
    }
  }
  return heights
}

/**
 * Couleur du sol en un point.
 *
 * Volontairement construite par fondus successifs plutôt qu'en lisant le biome
 * classé : une couleur par biome donnerait des frontières nettes et un aspect
 * de carte politique. Ici chaque critère (altitude, pente, région, île) apporte
 * un fondu, et les transitions sont continues.
 */
function terrainColor(
  target: Color,
  scratch: Color,
  x: number,
  z: number,
  height: number,
  slope: number,
) {
  // 1. Terres intermédiaires : jungle → prairie → arides, mélangées en douceur.
  const region = regionValue(x, z)
  target.set(BIOMES.jungle.ground)
  target.lerp(scratch.set(BIOMES.meadow.ground), smoothstep(0.34, 0.5, region))
  target.lerp(scratch.set(BIOMES.badlands.ground), smoothstep(0.58, 0.74, region))

  // 2. Île : sable tropical, indépendant de la région.
  const island = islandMask(x, z)
  if (island > 0) target.lerp(scratch.set(BIOMES.island.ground), smoothstep(0.2, 0.6, island))

  // 3. Roche sur les pentes fortes : c'est ce qui fait lire les falaises.
  target.lerp(scratch.set(BIOMES.mountain.rock), smoothstep(0.45, 0.95, slope) * 0.85)

  // 4. Altitude : montagne puis neige.
  target.lerp(
    scratch.set(BIOMES.mountain.ground),
    smoothstep(WORLD.mountainLevel - 2.5, WORLD.mountainLevel + 1.5, height),
  )
  target.lerp(
    scratch.set(SNOW_COLOR),
    smoothstep(WORLD.snowLevel - 1.5, WORLD.snowLevel + 1.5, height),
  )

  // 5. Plage, puis sable mouillé juste avant la ligne d'eau, puis fond marin.
  target.lerp(scratch.set(BIOMES.beach.ground), 1 - smoothstep(0.4, 2.4, height))
  target.lerp(scratch.set(WET_SAND), 1 - smoothstep(-0.1, 0.55, height))
  target.lerp(scratch.set(BIOMES.shallows.ground), 1 - smoothstep(-0.9, -0.05, height))
}

function useTerrain() {
  return useMemo(() => {
    const heights = buildHeights()

    // Le plan est tourné de -90° sur X : le z local devient le y monde, et le
    // sommet d'indice (ix, iy) tombe exactement sur la case (ix, iy) de la grille.
    const geometry = new PlaneGeometry(WORLD.size, WORLD.size, WORLD.grid, WORLD.grid)
    const position = geometry.attributes.position
    const colors = new Float32Array(position.count * 3)

    const color = new Color()
    const scratch = new Color()

    for (let iz = 0; iz < POINTS; iz++) {
      for (let ix = 0; ix < POINTS; ix++) {
        const index = ix + iz * POINTS
        const height = heights[index]
        position.setZ(index, height)

        // Pente par différences finies sur la grille déjà calculée : bien moins
        // cher que de ré-échantillonner le bruit quatre fois par sommet.
        const left = heights[Math.max(ix - 1, 0) + iz * POINTS]
        const right = heights[Math.min(ix + 1, POINTS - 1) + iz * POINTS]
        const up = heights[ix + Math.max(iz - 1, 0) * POINTS]
        const down = heights[ix + Math.min(iz + 1, POINTS - 1) * POINTS]
        const slope = Math.hypot(right - left, down - up) / (2 * CELL)

        terrainColor(
          color,
          scratch,
          -WORLD.half + ix * CELL,
          -WORLD.half + iz * CELL,
          height,
          slope,
        )
        colors[index * 3] = color.r
        colors[index * 3 + 1] = color.g
        colors[index * 3 + 2] = color.b
      }
    }

    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    geometry.computeVertexNormals()

    /**
     * Rapier range le heightfield en **colonnes** : l'indice est
     * `ligne + colonne * (nrows + 1)`, la ligne parcourt Z et la colonne X.
     * Notre grille est rangée par lignes — d'où la transposition.
     */
    const colliderHeights = new Float32Array(POINTS * POINTS)
    for (let iz = 0; iz < POINTS; iz++) {
      for (let ix = 0; ix < POINTS; ix++) {
        colliderHeights[iz + ix * POINTS] = heights[ix + iz * POINTS]
      }
    }

    return { geometry, colliderHeights }
  }, [])
}

export function Terrain() {
  const { geometry, colliderHeights } = useTerrain()

  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      {/* Le collider épouse exactement le maillage visuel : mêmes hauteurs,
          même résolution, même origine. */}
      <HeightfieldCollider
        args={[
          WORLD.grid,
          WORLD.grid,
          // Rapier attend un Float32Array ; les typings de @react-three/rapier
          // annoncent number[]. On passe la bonne valeur et on corrige le type.
          colliderHeights as unknown as number[],
          { x: WORLD.size, y: 1, z: WORLD.size },
        ]}
      />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} geometry={geometry}>
        <meshToonMaterial vertexColors gradientMap={toonGradient} />
      </mesh>

      {/* Murs invisibles au bord de carte. L'océan décourage déjà d'aller
          jusque-là, mais rien ne doit permettre de tomber hors du monde. */}
      <CuboidCollider
        args={[WORLD.half, WALL_HEIGHT, 0.5]}
        position={[0, WALL_HEIGHT, -WORLD.half]}
      />
      <CuboidCollider
        args={[WORLD.half, WALL_HEIGHT, 0.5]}
        position={[0, WALL_HEIGHT, WORLD.half]}
      />
      <CuboidCollider
        args={[0.5, WALL_HEIGHT, WORLD.half]}
        position={[-WORLD.half, WALL_HEIGHT, 0]}
      />
      <CuboidCollider
        args={[0.5, WALL_HEIGHT, WORLD.half]}
        position={[WORLD.half, WALL_HEIGHT, 0]}
      />
    </RigidBody>
  )
}
