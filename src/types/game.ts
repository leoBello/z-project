/**
 * Types partagés du jeu.
 * Ce fichier est volontairement le seul endroit où vivent les types "métier"
 * (état de partie, ennemis) : les futures features (quêtes, inventaire)
 * viendront s'ajouter ici sans toucher aux composants.
 */

/** Phase globale de la partie. Pilote le HUD, les écrans plein écran, et le gel. */
export type GamePhase = 'playing' | 'paused' | 'gameover'

/**
 * Carte sur laquelle se joue la partie.
 *
 * Deux, et c'est volontairement un type fermé plutôt qu'une table extensible :
 * chaque carte apporte son propre terrain, son propre collider et son propre
 * fond de minimap — en ajouter une n'est pas une ligne de configuration mais un
 * module. Le type fermé oblige à traiter le cas là où il faut, au lieu de
 * laisser une troisième carte se glisser dans un `default` silencieux.
 */
export type MapId = 'continent' | 'sky'

/** Machine à états de l'IA des ennemis (utilisée à l'étape "ennemis"). */
export type EnemyState = 'idle' | 'patrol' | 'chase' | 'attack' | 'dead'

/** Familles d'ennemis. Ajouter une variante ici suffit à l'enregistrer. */
export type EnemyKind = 'octorok' | 'moblin' | 'lynel'

/**
 * Les trois phases du Lynel.
 *
 * Elles ne changent pas ses statistiques, elles changent la *liste* de ce qu'il
 * peut faire. Un boss qui devient plus rapide est le même boss en moins
 * lisible ; un boss qui apprend une attaque de plus est un autre combat.
 */
export type LynelPhase = 'sword' | 'arena' | 'rage'

/** Les six attaques. La table vit dans `config/lynel.ts`. */
export type LynelAttackId =
  | 'sweep'
  | 'thrust'
  | 'stomp'
  | 'charge'
  | 'volley'
  | 'breath'

/** Description statique d'un ennemi, telle que posée dans un biome. */
export interface EnemySpawn {
  id: string
  kind: EnemyKind
  /** Position de spawn au sol. */
  position: [number, number, number]
  /** Rayon de patrouille / de détection, selon le type. */
  radius?: number
}

/**
 * Frappe d'annihilation en cours — le code de triche, une fois tapé.
 *
 * Un seul objet pour toute la séquence, et rien de plus qu'un instant et un
 * point : la chute, l'explosion, l'onde qui tue et le champignon s'en déduisent
 * tous (voir `config/annihilation.ts`). Le point d'impact est figé au
 * déclenchement plutôt que suivi sur le joueur — une bombe déjà larguée ne
 * change pas de cible parce que sa cible a marché.
 */
export interface Annihilation {
  /** Horodatage du déclenchement, sur l'horloge de jeu. */
  at: number
  /** Point d'impact au sol, en coordonnées monde. */
  x: number
  y: number
  z: number
}

/** Identifiant de point d'intérêt. La table vit dans `config/landmarks.ts`. */
export type LandmarkId = 'temple' | 'pyramid' | 'stele' | 'statue' | 'ruins' | 'nakano'

/**
 * Identifiant d'objet ramassable. La table vit dans `config/items.ts`, et les
 * libellés dans `src/i18n/*.json` sous `ui.items`.
 */
export type ItemId =
  | 'zoro-garb'
  | 'madara-garb'
  | 'kusanagi'
  | 'cursed-blade'
  | 'fishman-scales'

/** Identifiant de coffre au trésor. La table vit dans `config/chests.ts`. */
export type ChestId =
  | 'temple-chest'
  | 'pyramid-chest'
  | 'nakano-chest'
  | 'stele-chest'
  | 'ruins-chest'

/** Identifiant de biome. Pilote le sol, la végétation et la minimap. */
export type BiomeId =
  | 'shallows'
  | 'beach'
  | 'meadow'
  | 'jungle'
  | 'badlands'
  | 'mountain'
  | 'island'
