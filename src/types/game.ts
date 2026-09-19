/**
 * Types partagés du jeu.
 * Ce fichier est volontairement le seul endroit où vivent les types "métier"
 * (état de partie, ennemis) : les futures features (quêtes, inventaire)
 * viendront s'ajouter ici sans toucher aux composants.
 */

/** Phase globale de la partie. Pilote le HUD, les écrans plein écran, et le gel. */
export type GamePhase = 'playing' | 'paused' | 'gameover'

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

/** Identifiant de point d'intérêt. La table vit dans `config/landmarks.ts`. */
export type LandmarkId = 'temple' | 'pyramid' | 'stele' | 'statue' | 'ruins' | 'nakano'

/**
 * Identifiant d'objet ramassable. La table vit dans `config/items.ts`, et les
 * libellés dans `src/i18n/*.json` sous `ui.items`.
 */
export type ItemId = 'zoro-garb' | 'kusanagi'

/** Identifiant de coffre au trésor. La table vit dans `config/chests.ts`. */
export type ChestId = 'temple-chest' | 'nakano-chest'

/** Identifiant de biome. Pilote le sol, la végétation et la minimap. */
export type BiomeId =
  | 'shallows'
  | 'beach'
  | 'meadow'
  | 'jungle'
  | 'badlands'
  | 'mountain'
  | 'island'
