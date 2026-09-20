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
 * Volontairement un type fermé plutôt qu'une table extensible : chaque carte
 * apporte son propre terrain, son propre collider et son propre fond de
 * minimap — en ajouter une n'est pas une ligne de configuration mais un module.
 * Le type fermé oblige à traiter le cas là où il faut, au lieu de laisser une
 * carte se glisser dans un `default` silencieux.
 *
 * **Le pari n'a tenu qu'à moitié, et il faut le dire.** L'ajout de `rot` n'a
 * sorti du compilateur qu'une seule erreur — la table d'`atmosphere.ts`, qui est
 * un `Record<MapId, …>`. Les six autres endroits à traiter écrivaient
 * `map === 'sky' ? … : …`, c'est-à-dire un `default` silencieux : le Marais y
 * était traité comme le continent, sans un mot.
 *
 * Ce sont donc les `Record<MapId, …>` qui protègent, pas le type fermé tout
 * seul. Les trois fonctions de `config/portal.ts` en sont devenues des tables
 * pour cette raison, et c'est la règle à suivre pour la quatrième carte : **une
 * table indexée par `MapId`, jamais un ternaire.**
 *
 * `rot` est le Marais d'Aeonia : on n'y accède que par le portail du sommet,
 * une fois le Lynel doré tombé.
 */
export type MapId = 'continent' | 'sky' | 'rot'

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

/**
 * Les deux formes de Malenia.
 *
 * Elles ne changent pas ses statistiques, elles changent la *liste* de ce qu'elle
 * peut faire — même règle que les trois phases du Lynel. `blade` est la Lame de
 * Miquella : au sol, casquée, six attaques. `goddess` est la Déesse de la
 * Pourriture : en vol, sans armure, dix.
 *
 * Deux et non trois, parce qu'il n'y a pas de tiers d'apprentissage à ménager :
 * le joueur qui arrive ici a déjà tué cinq Lynels et connaît la parade.
 */
export type MaleniaPhase = 'blade' | 'goddess'

/** Les dix attaques. La table vit dans `config/malenia.ts`. */
export type MaleniaAttackId =
  | 'slash'
  | 'flurry'
  | 'thrust'
  | 'kick'
  | 'grab'
  | 'waterfowl'
  | 'aeonia'
  | 'plunge'
  | 'flying'
  | 'phantoms'

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
 * D'où peut venir un réceptacle de cœur.
 *
 * Les monuments, et la rotonde — qui n'est **pas** un monument et ne doit pas en
 * devenir un : une entrée dans `LANDMARKS` creuse une terrasse, interdit la
 * végétation, paraît sur la minimap dès la première frame et entre dans le menu
 * de téléportation. Le réceptacle de la rotonde n'existe qu'après la mort du
 * Lynel ; l'annoncer sur la carte dès le départ le déflorerait. Même
 * raisonnement que le portail de l'île, qui n'est pas un monument non plus.
 *
 * `trial`, `golden` et `malenia` ne sont des lieux d'aucune sorte : ce sont les
 * récompenses de l'épreuve des trois Lynels, du Lynel doré et du Marais, qui
 * n'ont pas de socle à ramasser.

 * `malenia` fait exception dans l'exception : contrairement aux deux autres,
 * elle **se ramasse** — un réceptacle posé là où le corps est tombé, comme celui
 * de la rotonde. Elle passe par cette liste parce que c'est la même chose qu'un
 * réceptacle de monument, pas parce qu'elle se donne toute seule. Elles passent quand même par ici plutôt que par un chemin à
 * elles, parce que le réceptacle *est* la chose — même cœur maximal, même soin
 * complet, même bandeau — et qu'un second chemin vers `maxHearts` serait un
 * second endroit où l'oublier.
 */
export type HeartSourceId = LandmarkId | 'rotunda' | 'trial' | 'golden' | 'malenia'

/**
 * Identifiant de quête. La table vit dans `config/quests.ts`, et les libellés
 * dans `src/i18n/*.json` sous `ui.quests.entries`.
 *
 * Un type fermé et non une table extensible, pour la même raison que `MapId` :
 * aucune de ces cinq quêtes n'est une ligne de configuration. Chacune se termine
 * sur un état de partie qui lui est propre — la carte vidée, l'île atteinte,
 * trois bêtes abattues, la montagne gravie, le Marais traversé — et en ajouter
 * une demandera de dire *où* elle s'achève, pas seulement comment elle
 * s'intitule.
 */
export type QuestId =
  | 'clear-continent'
  | 'sky-portal'
  | 'lynel-trial'
  | 'golden-lynel'
  | 'aeonia'

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
  | 'dawn-cloak'
  | 'demon-armor'
  | 'vader-armor'
  | 'vader-saber'
  | 'meruem-garb'
  | 'kuroro-garb'

/** Identifiant de coffre au trésor. La table vit dans `config/chests.ts`. */
export type ChestId =
  | 'temple-chest'
  | 'pyramid-chest'
  | 'nakano-chest'
  | 'stele-chest'
  | 'ruins-chest'
  | 'rotunda-chest'
  | 'road-chest'
  | 'summit-armor-chest'
  | 'summit-saber-chest'
  | 'aeonia-king-chest'
  | 'aeonia-thief-chest'

/** Identifiant de biome. Pilote le sol, la végétation et la minimap. */
export type BiomeId =
  | 'shallows'
  | 'beach'
  | 'meadow'
  | 'jungle'
  | 'badlands'
  | 'mountain'
  | 'island'
