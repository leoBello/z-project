import { useMemo } from 'react'
import { CuboidCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier'
import { BufferAttribute, Color, PlaneGeometry } from 'three'
import { BIOMES, SNOW_COLOR, WET_SAND } from '../../config/biomes'
import { CONTINENT_SHAPE } from '../../config/continentShape'
import { smoothstep } from '../../config/world'
import type { WorldShape } from '../../config/worldShape'
import { toonGradient } from '../models/toonGradient'

/** Hauteur des murs invisibles qui ferment la carte. */
const WALL_HEIGHT = 30

/**
 * Grille de hauteurs, calculée une seule fois et partagée par le mesh visuel
 * et le collider physique. C'est le point clé : les deux lisent exactement le
 * même tableau, ils ne peuvent donc pas diverger.
 *
 * Indexation : `heights[ix + iz * points]`, avec
 * `x = -half + ix * cell` et `z = -half + iz * cell`.
 *
 * Les cotes viennent de la `WorldShape` et non plus d'un module : deux mondes du
 * jeu sont des champs de hauteurs, le continent et l'Outremonde, et ils n'ont
 * pas la même origine ni forcément la même maille.
 */
function buildHeights(shape: WorldShape, points: number, cell: number) {
  const heights = new Float32Array(points * points)
  for (let iz = 0; iz < points; iz++) {
    const z = -shape.half + iz * cell
    for (let ix = 0; ix < points; ix++) {
      const x = -shape.half + ix * cell
      heights[ix + iz * points] = shape.height(x, z)
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
  shape: WorldShape,
  target: Color,
  scratch: Color,
  x: number,
  z: number,
  height: number,
  slope: number,
) {
  // 1. Terres intermédiaires : jungle → prairie → arides, mélangées en douceur.
  const region = shape.region(x, z)
  target.set(BIOMES.jungle.ground)
  target.lerp(scratch.set(BIOMES.meadow.ground), smoothstep(0.34, 0.5, region))
  target.lerp(scratch.set(BIOMES.badlands.ground), smoothstep(0.58, 0.74, region))

  // 2. Île : sable tropical, indépendant de la région.
  const island = shape.islandMask(x, z)
  if (island > 0) target.lerp(scratch.set(BIOMES.island.ground), smoothstep(0.2, 0.6, island))

  // 3. Roche sur les pentes fortes : c'est ce qui fait lire les falaises.
  target.lerp(scratch.set(BIOMES.mountain.rock), smoothstep(0.45, 0.95, slope) * 0.85)

  // 4. Altitude : montagne puis neige.
  target.lerp(
    scratch.set(BIOMES.mountain.ground),
    smoothstep(shape.mountainLevel - 2.5, shape.mountainLevel + 1.5, height),
  )
  target.lerp(
    scratch.set(SNOW_COLOR),
    smoothstep(shape.snowLevel - 1.5, shape.snowLevel + 1.5, height),
  )

  // 5. Plage, puis sable mouillé juste avant la ligne d'eau, puis fond marin.
  target.lerp(scratch.set(BIOMES.beach.ground), 1 - smoothstep(0.4, 2.4, height))
  target.lerp(scratch.set(WET_SAND), 1 - smoothstep(-0.1, 0.55, height))
  target.lerp(scratch.set(BIOMES.shallows.ground), 1 - smoothstep(-0.9, -0.05, height))
}

function useTerrain(shape: WorldShape) {
  return useMemo(() => {
    const points = shape.grid + 1
    const cell = shape.size / shape.grid
    const heights = buildHeights(shape, points, cell)

    // Le plan est tourné de -90° sur X : le z local devient le y monde, et le
    // sommet d'indice (ix, iy) tombe exactement sur la case (ix, iy) de la grille.
    const geometry = new PlaneGeometry(shape.size, shape.size, shape.grid, shape.grid)
    const position = geometry.attributes.position
    const colors = new Float32Array(position.count * 3)

    const color = new Color()
    const scratch = new Color()

    for (let iz = 0; iz < points; iz++) {
      for (let ix = 0; ix < points; ix++) {
        const index = ix + iz * points
        const height = heights[index]
        position.setZ(index, height)

        // Pente par différences finies sur la grille déjà calculée : bien moins
        // cher que de ré-échantillonner le bruit quatre fois par sommet.
        const left = heights[Math.max(ix - 1, 0) + iz * points]
        const right = heights[Math.min(ix + 1, points - 1) + iz * points]
        const up = heights[ix + Math.max(iz - 1, 0) * points]
        const down = heights[ix + Math.min(iz + 1, points - 1) * points]
        const slope = Math.hypot(right - left, down - up) / (2 * cell)

        terrainColor(
          shape,
          color,
          scratch,
          -shape.half + ix * cell,
          -shape.half + iz * cell,
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
    const colliderHeights = new Float32Array(points * points)
    for (let iz = 0; iz < points; iz++) {
      for (let ix = 0; ix < points; ix++) {
        colliderHeights[iz + ix * points] = heights[ix + iz * points]
      }
    }

    return { geometry, colliderHeights }
  }, [shape])
}

/**
 * Le relief d'un monde — le continent par défaut, l'Outremonde sur demande.
 *
 * Une prop avec valeur par défaut, et non un second composant : les deux mondes
 * partagent la grille, le collider, le fondu des palettes et les murs de bord,
 * c'est-à-dire tout ce fichier. Ce qui les distingue tient entièrement dans la
 * `WorldShape` qu'on lui passe.
 */
export function Terrain({ shape = CONTINENT_SHAPE }: { shape?: WorldShape } = {}) {
  const { geometry, colliderHeights } = useTerrain(shape)

  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      {/* Le collider épouse exactement le maillage visuel : mêmes hauteurs,
          même résolution, même origine. */}
      <HeightfieldCollider
        args={[
          shape.grid,
          shape.grid,
          // Rapier attend un Float32Array ; les typings de @react-three/rapier
          // annoncent number[]. On passe la bonne valeur et on corrige le type.
          colliderHeights as unknown as number[],
          { x: shape.size, y: 1, z: shape.size },
        ]}
      />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} geometry={geometry}>
        <meshToonMaterial vertexColors gradientMap={toonGradient} />
      </mesh>

      {/* Murs invisibles au bord de carte. L'océan décourage déjà d'aller
          jusque-là, mais rien ne doit permettre de tomber hors du monde. */}
      <CuboidCollider
        args={[shape.half, WALL_HEIGHT, 0.5]}
        position={[0, WALL_HEIGHT, -shape.half]}
      />
      <CuboidCollider
        args={[shape.half, WALL_HEIGHT, 0.5]}
        position={[0, WALL_HEIGHT, shape.half]}
      />
      <CuboidCollider
        args={[0.5, WALL_HEIGHT, shape.half]}
        position={[-shape.half, WALL_HEIGHT, 0]}
      />
      <CuboidCollider
        args={[0.5, WALL_HEIGHT, shape.half]}
        position={[shape.half, WALL_HEIGHT, 0]}
      />
    </RigidBody>
  )
}
