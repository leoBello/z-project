import type { BiomeId } from '../types/game'
import { MAP_HALF } from './gameplay'

/**
 * Définition des biomes.
 *
 * La carte est coupée en deux par une frontière ondulante orientée sur X :
 * prairie à l'ouest, terres arides à l'est, avec un chemin de terre le long
 * de la couture. Tout — couleur du sol, densité de végétation, choix des
 * props — est dérivé de `sampleBiome`, donc changer la frontière suffit à
 * redessiner la carte.
 */

export interface BiomeStyle {
  id: BiomeId
  /** Couleur du sol au cœur du biome. */
  ground: string
  /** Teintes de la végétation, échantillonnées aléatoirement. */
  foliage: string[]
  trunk: string
  rock: string
  grass: string[]
}

export const BIOMES: Record<BiomeId, BiomeStyle> = {
  meadow: {
    id: 'meadow',
    ground: '#7cb85f',
    foliage: ['#4e9c4a', '#3f8a41', '#67b055'],
    trunk: '#7a5230',
    rock: '#8f9a92',
    grass: ['#589f45', '#69b053'],
  },
  badlands: {
    id: 'badlands',
    ground: '#c2a06a',
    foliage: ['#7d8a52', '#6d7a48'],
    trunk: '#6b4a30',
    rock: '#8d8479',
    grass: ['#a08d52', '#8f7d47'],
  },
}

/** Couleur du chemin de terre qui court le long de la frontière. */
export const PATH_COLOR = '#b8926a'
/** Demi-largeur du chemin, en unités monde. */
export const PATH_HALF_WIDTH = 3.5

/**
 * Frontière entre les deux biomes : une sinusoïde en Z, pour éviter la
 * ligne droite qui trahit immédiatement la génération procédurale.
 */
export function biomeBoundaryX(z: number) {
  return Math.sin(z * 0.055) * 14 + Math.sin(z * 0.017 + 1.3) * 7
}

/**
 * Échantillonne la carte en (x, z).
 *
 * `blend` vaut 0 en pleine prairie et 1 en plein désert, avec une transition
 * douce autour de la frontière — c'est lui qui pilote à la fois la couleur du
 * sol et la probabilité de faire pousser tel ou tel prop.
 * `onPath` marque le chemin de terre.
 */
export function sampleBiome(x: number, z: number) {
  const distance = x - biomeBoundaryX(z)
  // Transition étalée sur ~16 unités, centrée sur la frontière.
  const blend = Math.min(1, Math.max(0, distance / 16 + 0.5))
  return {
    blend,
    onPath: Math.abs(distance) < PATH_HALF_WIDTH,
    /** Biome dominant, pour choisir une famille de props. */
    id: (blend > 0.5 ? 'badlands' : 'meadow') as BiomeId,
  }
}

/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * Indispensable ici : sans graine fixe, la végétation se replacerait à chaque
 * rechargement — et à chaque re-render en développement.
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

/** Marge gardée libre sur les bords de la carte, pour ne pas planter dans les murs. */
export const SCATTER_HALF = MAP_HALF - 4
