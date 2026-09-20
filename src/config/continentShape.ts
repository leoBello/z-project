import { underBridge } from './bridge'
import { PLAYER } from './gameplay'
import { LANDMARKS } from './landmarks'
import {
  WORLD,
  classifyBiome,
  islandMask,
  regionValue,
  sampleHeight,
  sampleSlope,
} from './world'
import type { WorldShape } from './worldShape'

/**
 * Le continent, vu comme une `WorldShape`.
 *
 * Il ne s'agit **pas** d'une seconde description du monde : chaque champ délègue
 * à `config/world.ts`, qui reste la seule source de vérité du relief. Ce fichier
 * ne fait qu'exposer ce monde-là sous la forme que `Terrain`, `Vegetation`,
 * `Water` et la minimap attendent désormais de n'importe quel monde.
 *
 * Il vit dans son propre module et non dans `world.ts`, pour une raison de
 * dépendances : les deux exclusions du semis — les parvis de monuments et le
 * dessous du pont — se lisent dans `landmarks.ts` et `bridge.ts`, qui tous deux
 * importent `world.ts`. Les y déclarer aurait bouclé.
 *
 * Le rayon dégagé autour du point d'apparition est celui que `Vegetation` posait
 * en dur (`SPAWN_CLEARANCE = 7`). Il n'a pas changé de valeur en changeant de
 * place : le jour de l'extraction, rien ne devait bouger à l'écran.
 */
export const CONTINENT_SHAPE: WorldShape = {
  id: 'continent',

  size: WORLD.size,
  half: WORLD.half,
  grid: WORLD.grid,

  waterLevel: WORLD.waterLevel,
  maxDepth: WORLD.maxDepth,
  mountainLevel: WORLD.mountainLevel,
  snowLevel: WORLD.snowLevel,

  height: sampleHeight,
  slope: (x, z) => sampleSlope(x, z),
  region: regionValue,
  islandMask,
  biome: classifyBiome,

  blocked: (x, z) =>
    LANDMARKS.some(
      (landmark) => Math.hypot(x - landmark.x, z - landmark.z) < landmark.clearRadius,
    ) || underBridge(x, z),

  clearing: { x: PLAYER.spawn[0], z: PLAYER.spawn[2], radius: 7 },

  scatterSeed: 0x5eed,
}
