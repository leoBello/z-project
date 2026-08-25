import type { BiomeId } from '../types/game'

/**
 * Palettes des biomes.
 *
 * La géographie (où se trouve quel biome) vit dans `world.ts` ; ce fichier ne
 * décrit que l'apparence. Ajouter un biome = une entrée ici + une branche dans
 * `classifyBiome`, rien d'autre à toucher.
 */

export interface BiomeStyle {
  id: BiomeId
  /** Nom affiché, notamment dans la minimap. */
  label: string
  /** Couleur du sol. */
  ground: string
  /** Couleur montrée sur la minimap (souvent plus saturée pour la lisibilité). */
  minimap: string
  /** Teintes de feuillage, tirées au hasard par le semis. */
  foliage: string[]
  trunk: string
  rock: string
  grass: string[]
}

export const BIOMES: Record<BiomeId, BiomeStyle> = {
  shallows: {
    id: 'shallows',
    label: 'Haut-fond',
    ground: '#c9b98c',
    minimap: '#4f9dc4',
    foliage: ['#5e8f7a'],
    trunk: '#7a6a4a',
    rock: '#9aa39b',
    grass: ['#8fae86'],
  },
  beach: {
    id: 'beach',
    label: 'Plage',
    ground: '#e2d3a3',
    minimap: '#e8d9a8',
    foliage: ['#7fa86a', '#6f9a5c'],
    trunk: '#9a7c52',
    rock: '#b3ab97',
    grass: ['#c9c489', '#b7bd7c'],
  },
  meadow: {
    id: 'meadow',
    label: 'Prairie',
    ground: '#7cb85f',
    minimap: '#79bd5c',
    foliage: ['#4e9c4a', '#3f8a41', '#67b055'],
    trunk: '#7a5230',
    rock: '#8f9a92',
    grass: ['#589f45', '#69b053'],
  },
  jungle: {
    id: 'jungle',
    label: 'Jungle',
    ground: '#4e7f42',
    minimap: '#2f6b39',
    foliage: ['#2f7038', '#276030', '#3d8442'],
    trunk: '#5c422a',
    rock: '#6f7f6a',
    grass: ['#357a3c', '#2c6b34'],
  },
  badlands: {
    id: 'badlands',
    label: 'Terres arides',
    ground: '#c2a06a',
    minimap: '#c9a468',
    foliage: ['#7d8a52', '#6d7a48'],
    trunk: '#6b4a30',
    rock: '#8d8479',
    grass: ['#a08d52', '#8f7d47'],
  },
  mountain: {
    id: 'mountain',
    label: 'Montagne',
    ground: '#8b8b8f',
    minimap: '#9b9ba2',
    foliage: ['#4a6b52'],
    trunk: '#5a4a3c',
    rock: '#a3a3a8',
    grass: ['#7d8578'],
  },
  island: {
    id: 'island',
    label: 'Île',
    ground: '#d8c890',
    minimap: '#d9c98e',
    foliage: ['#3f9464', '#348556'],
    trunk: '#8a6b42',
    rock: '#b0a894',
    grass: ['#57a06a', '#4a8f5e'],
  },
}

/** Couleur de la mer sur la minimap. */
export const MINIMAP_WATER = '#3d86ad'
/** Couleur de la neige, appliquée au-dessus de `WORLD.snowLevel`. */
export const SNOW_COLOR = '#e8eef2'
/** Sable mouillé, juste au-dessus de la ligne de rivage. */
export const WET_SAND = '#c2ab77'
