/**
 * Types partagés du jeu.
 * Ce fichier est volontairement le seul endroit où vivent les types "métier"
 * (état de partie, ennemis) : les futures features (quêtes, inventaire)
 * viendront s'ajouter ici sans toucher aux composants.
 */

/** Phase globale de la partie. Pilote le HUD et les écrans plein écran. */
export type GamePhase = 'playing' | 'gameover'

/** Machine à états de l'IA des ennemis (utilisée à l'étape "ennemis"). */
export type EnemyState = 'idle' | 'patrol' | 'chase' | 'attack' | 'dead'

/** Familles d'ennemis. Ajouter une variante ici suffit à l'enregistrer. */
export type EnemyKind = 'octorok' | 'moblin'

/** Description statique d'un ennemi, telle que posée dans un biome. */
export interface EnemySpawn {
  id: string
  kind: EnemyKind
  /** Position de spawn au sol. */
  position: [number, number, number]
  /** Rayon de patrouille / de détection, selon le type. */
  radius?: number
}

/** Identifiant de biome, sert au peuplement de la végétation. */
export type BiomeId = 'meadow' | 'badlands'
