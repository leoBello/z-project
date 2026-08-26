import { LANDMARKS } from './landmarks'
import type { BiomeId } from '../types/game'

/**
 * Génération du monde : relief, mer et répartition des biomes.
 *
 * Tout le monde dérive d'une seule fonction pure `sampleWorld(x, z)`. Le mesh
 * du terrain, le collider physique, le semis de végétation et la minimap
 * l'interrogent tous — impossible qu'ils se désynchronisent, et modifier le
 * relief ici met tout à jour d'un coup.
 */

export const WORLD = {
  /** Côté de la carte, en unités monde. */
  size: 200,
  half: 100,
  /** Cellules de la grille de hauteurs (le maillage a grid + 1 points de côté). */
  grid: 160,
  /** Niveau de la mer. */
  waterLevel: 0,
  /**
   * Profondeur maximale du fond marin.
   *
   * Calibré sur la taille du personnage (1,6 unité) : à -0,85 l'eau lui arrive
   * à la taille, il reste parfaitement visible et on ne peut jamais le perdre
   * sous la surface. C'est aussi ce qui rend l'île atteignable à pied sans
   * système de nage, et qui évite d'avoir à poser une barrière au large.
   */
  maxDepth: -0.85,
  /** Au-dessus de cette altitude, on est en montagne. */
  mountainLevel: 9.5,
  /** Au-dessus de celle-ci, la roche est enneigée. */
  snowLevel: 13.5,
} as const

// --- Bruit déterministe -----------------------------------------------------

/** Hash entier vers [0, 1[. Déterministe, sans allocation. */
function hash2(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Interpolation lisse entre deux seuils, clampée. */
export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Bruit de valeur 2D : quatre coins hachés, interpolés en smoothstep. */
function valueNoise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  return lerp(
    lerp(hash2(xi, yi), hash2(xi + 1, yi), u),
    lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u),
    v,
  )
}

/** Somme d'octaves : donne un relief lisible à grande échelle et détaillé de près. */
function fbm(x: number, y: number, octaves = 4) {
  let sum = 0
  let amplitude = 0.5
  let total = 0
  let frequency = 1
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, y * frequency) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2.07
  }
  return sum / total
}

/** Distance d'un point à un segment, dans le plan XZ. */
function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
) {
  const abx = bx - ax
  const abz = bz - az
  const lengthSq = abx * abx + abz * abz
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (pz - az) * abz) / lengthSq))
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t))
}

// --- Géographie -------------------------------------------------------------

/** Crête montagneuse, au nord-ouest du continent. */
const RIDGE = { ax: -52, az: -28, bx: -14, bz: -58, sigma: 20, height: 16 } as const
/** Île mystérieuse, au large du sud-est. */
const ISLAND = { x: 74, z: 74, radius: 15, height: 6.5 } as const
/** Haut-fond guéable reliant la plage du continent à l'île. */
const CAUSEWAY = { ax: 53, az: 53, bx: 66, bz: 66, halfWidth: 9 } as const

/** Vaut 1 au cœur de l'île, 0 au large. Sert aussi à choisir ses props. */
export function islandMask(x: number, z: number) {
  return 1 - smoothstep(ISLAND.radius * 0.35, ISLAND.radius, Math.hypot(x - ISLAND.x, z - ISLAND.z))
}

/**
 * Altitude du terrain en (x, z).
 *
 * Composition : un dôme continental qui plonge sous la mer avant les bords de
 * carte (l'océan sert de limite naturelle, bien plus élégante qu'un mur), une
 * crête montagneuse, une île, un haut-fond, et du bruit pour casser les
 * courbes trop propres.
 */
export function sampleHeight(x: number, z: number) {
  const distance = Math.hypot(x, z)

  // Dôme continental : +4 au centre, -6 au large. Il croise le niveau de la
  // mer vers r = 79, soit un continent qui occupe l'essentiel de la carte et
  // un océan réduit à une ceinture — la terre est le sujet, pas la mer.
  const falloff = smoothstep(40, 130, distance)
  let height = lerp(4, -6, falloff)

  // Le masque terrestre empêche montagnes et bruit de surgir en pleine mer.
  const landMask = 1 - falloff

  // Crête montagneuse : gaussienne le long d'un segment.
  const ridgeDistance = distanceToSegment(x, z, RIDGE.ax, RIDGE.az, RIDGE.bx, RIDGE.bz)
  height +=
    RIDGE.height *
    Math.exp(-(ridgeDistance * ridgeDistance) / (2 * RIDGE.sigma * RIDGE.sigma)) *
    landMask

  // Relief de détail, atténué sous l'eau pour garder un fond marin lisible.
  height += (fbm(x * 0.021, z * 0.021) - 0.5) * 3.4 * (0.25 + landMask * 0.75)
  height += (fbm(x * 0.075 + 11, z * 0.075 - 5) - 0.5) * 0.9

  // Île : posée par-dessus le fond marin, pas ajoutée (sinon elle s'enfonce).
  const island = ISLAND.height * islandMask(x, z)
  if (island > 0) height = Math.max(height, island - 0.4)

  // Haut-fond : remonte le fond juste sous la surface, en gué.
  const causewayDistance = distanceToSegment(
    x,
    z,
    CAUSEWAY.ax,
    CAUSEWAY.az,
    CAUSEWAY.bx,
    CAUSEWAY.bz,
  )
  if (causewayDistance < CAUSEWAY.halfWidth) {
    const shelf = lerp(-0.3, -1.2, smoothstep(2, CAUSEWAY.halfWidth, causewayDistance))
    height = Math.max(height, shelf)
  }

  // Terrasses des points d'intérêt, appliquées en dernier : un monument doit
  // effacer le relief qu'il occupe, pas s'y ajouter. Le fondu par smoothstep
  // raccorde la plate-forme à la pente naturelle sans marche visible.
  for (const landmark of LANDMARKS) {
    const weight =
      1 -
      smoothstep(
        landmark.radius,
        landmark.radius + landmark.blend,
        Math.hypot(x - landmark.x, z - landmark.z),
      )
    if (weight > 0) height = lerp(height, landmark.altitude, weight)
  }

  // Plancher : l'océan reste guéable, le joueur n'est jamais submergé.
  return Math.max(height, WORLD.maxDepth)
}

export interface WorldSample {
  height: number
  biome: BiomeId
  /** Pente approximée, en unités de hauteur par unité horizontale. */
  slope: number
  /** Vrai si le point est sous le niveau de la mer. */
  submerged: boolean
}

/** Pente locale, par différences finies. Sert à ne rien planter sur une falaise. */
export function sampleSlope(x: number, z: number, step = 1.5) {
  const dx = sampleHeight(x + step, z) - sampleHeight(x - step, z)
  const dz = sampleHeight(x, z + step) - sampleHeight(x, z - step)
  return Math.hypot(dx, dz) / (2 * step)
}

/**
 * Valeur de région : décide entre jungle, prairie et terres arides.
 *
 * Exportée parce que le sol s'en sert pour *fondre* les trois biomes plutôt
 * que de recopier la classification — sinon les frontières seraient nettes et
 * la carte ressemblerait à une carte politique.
 * Le biais en x et z évite que les trois biomes se mélangent au hasard : la
 * jungle penche au sud-ouest, les terres arides à l'est.
 */
export function regionValue(x: number, z: number) {
  // Le fbm se concentre autour de 0,5 (c'est une moyenne d'octaves) : sans
  // étalement, les seuils extrêmes ne sont jamais atteints et un biome entier
  // disparaît de la carte. Le facteur 1,8 redonne de l'amplitude.
  const noise = (fbm(x * 0.011 + 3.1, z * 0.011 - 7.7) - 0.5) * 1.8 + 0.5
  return noise + x / 300 - z / 600
}

/**
 * Classe un point en biome.
 *
 * L'ordre des tests compte : l'altitude décide en premier (mer, plage,
 * montagne), l'île ensuite, et le bruit de région ne tranche que pour les
 * terres intermédiaires. C'est ce qui garantit qu'on ne trouve jamais de
 * jungle au sommet d'une montagne.
 */
export function classifyBiome(x: number, z: number, height: number): BiomeId {
  if (height < WORLD.waterLevel - 0.12) return 'shallows'
  if (height < 1.1) return 'beach'
  if (height > WORLD.mountainLevel) return 'mountain'
  if (islandMask(x, z) > 0.35) return 'island'

  const region = regionValue(x, z)
  if (region < 0.42) return 'jungle'
  if (region < 0.66) return 'meadow'
  return 'badlands'
}

export function sampleWorld(x: number, z: number): WorldSample {
  const height = sampleHeight(x, z)
  return {
    height,
    biome: classifyBiome(x, z, height),
    slope: sampleSlope(x, z),
    submerged: height < WORLD.waterLevel,
  }
}

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * Indispensable pour le semis : sans graine fixe, la végétation se replacerait
 * à chaque rechargement — et à chaque re-render en développement.
 */
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Exposé en développement pour vérifier depuis la console (ou un test
// navigateur) que le collider physique correspond bien au relief calculé.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).gameWorld = {
    WORLD,
    sampleHeight,
    sampleSlope,
    classifyBiome,
  }
}
