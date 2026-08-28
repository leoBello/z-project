import type { ItemId } from '../types/game'

/**
 * Objets ramassables et leurs effets.
 *
 * Ce fichier ne décrit que ce qu'un objet **fait** et de quoi il a l'air. Son
 * nom, son type affiché et sa description vivent dans `src/i18n/*.json` sous
 * `ui.items`, comme les noms de monuments : le jeu est bilingue, et une chaîne
 * écrite ici ne pourrait pas l'être. Quatre systèmes lisent cette table sans se
 * connaître — l'inventaire, la carte d'objet, le store pour appliquer bonus de
 * cœurs et dégâts, et le rig du personnage pour choisir sa silhouette et sa lame.
 */

/**
 * Familles d'objets.
 *
 * Elles pilotent le libellé de type sur la carte **et servent d'emplacement
 * d'équipement** : on porte au plus un objet par famille. C'est ce qui permet
 * de porter le katana *et* la tenue du clan — les faire partager un
 * emplacement unique aurait obligé à choisir entre l'apparence et l'arme, et
 * transformé une trouvaille en renoncement.
 */
export type ItemKind = 'outfit' | 'trinket' | 'weapon'

/** Emplacement d'équipement. Une famille d'objet, un emplacement. */
export type ItemSlot = ItemKind

/** Silhouette du joueur associée à une tenue. Voir `HeroPlaceholder`. */
export type OutfitId = 'default' | 'ninja'

/** Lame tenue en main droite. Voir `Sword` dans `HeroPlaceholder`. */
export type WeaponId = 'sword' | 'katana'

export interface Item {
  id: ItemId
  kind: ItemKind
  /**
   * Cœurs **jaunes** accordés par le port de l'objet.
   *
   * Zéro pour tout ce qui n'est pas une tenue. Le store n'a donc pas à savoir
   * quels objets sont des armures : il additionne ce champ pour l'objet équipé.
   */
  bonusHearts: number
  /**
   * Multiplicateur appliqué aux dégâts du coup d'épée.
   *
   * Un pour tout ce qui n'est pas une arme, exactement pour la même raison que
   * `bonusHearts` vaut zéro ailleurs : le store multiplie sans avoir à
   * reconnaître les armes. Neutre par défaut plutôt qu'optionnel — un
   * multiplicateur absent vaudrait `undefined`, et c'est le genre de valeur qui
   * finit par sortir un `NaN` de dégâts.
   */
  attackMultiplier: number
  /**
   * Silhouette prise par le joueur quand l'objet est porté.
   *
   * `undefined` pour un objet qui ne change pas l'apparence — on ne veut pas
   * qu'une babiole ait à déclarer `outfit: 'default'` pour ne rien faire.
   */
  outfit?: OutfitId
  /** Lame prise par le joueur quand l'objet est porté. Même règle que `outfit`. */
  weapon?: WeaponId
  /** Teinte d'accent : carte, icône d'inventaire, éclat du coffre. */
  accent: string
}

/**
 * Tenue du Clan — la panoplie du ninja.
 *
 * Cramoisi et prune : deux teintes que rien d'autre ne porte dans le jeu. Le
 * rouge des cœurs est plus clair et n'apparaît qu'au HUD, le manteau ne peut
 * donc pas se confondre avec lui, et le prune répond au ciel violet sans s'y
 * fondre — le contre-jour parme de la scène détache la silhouette.
 */
export const NINJA_GARB: Item = {
  id: 'ninja-garb',
  kind: 'outfit',
  bonusHearts: 2,
  attackMultiplier: 1,
  outfit: 'ninja',
  accent: '#c8443f',
}

/**
 * Katana de Kusanagi — la lame du temple de Nakano.
 *
 * Le seul objet du jeu qui touche au combat, et son effet est volontairement
 * brutal : les dégâts doublés font tomber l'octorok en un coup au lieu de deux
 * et le moblin en deux au lieu de trois. Un bonus plus fin — un tiers de dégât
 * de plus, un peu d'allonge — n'aurait rien changé au ressenti, puisque les
 * points de vie des ennemis sont des entiers de deux et trois.
 *
 * L'accent est un vert de jade, seule teinte froide et saturée de l'inventaire.
 * Il ne pouvait pas être doré : l'or est déjà la couleur de « il y a quelque
 * chose à prendre » (braise des coffres, ferrures, flèche de la pagode), et une
 * arme légendaire de la même teinte se serait lue comme un trésor de plus.
 */
export const KUSANAGI: Item = {
  id: 'kusanagi',
  kind: 'weapon',
  bonusHearts: 0,
  attackMultiplier: 2,
  weapon: 'katana',
  accent: '#4fc9a3',
}

export const ITEMS: readonly Item[] = [NINJA_GARB, KUSANAGI]

/** Retrouve un objet par son identifiant. */
export function itemById(id: ItemId): Item | undefined {
  return ITEMS.find((item) => item.id === id)
}

/**
 * Objets équipés, indexés par emplacement.
 *
 * Le type vit ici et non dans le store parce que c'est la table des objets qui
 * décide de ce qu'est un emplacement — le store ne fait que tenir le registre.
 */
export type Equipment = Partial<Record<ItemSlot, ItemId>>

/**
 * Silhouette à afficher pour l'équipement courant.
 *
 * Centralisée ici plutôt que dans le composant du joueur : c'est la table des
 * objets qui décide de ce qu'une tenue fait, pas le rig qui devine.
 */
export function outfitOf(equipment: Equipment): OutfitId {
  const id = equipment.outfit
  if (!id) return 'default'
  return itemById(id)?.outfit ?? 'default'
}

/** Lame à afficher pour l'équipement courant. Même règle que `outfitOf`. */
export function weaponOf(equipment: Equipment): WeaponId {
  const id = equipment.weapon
  if (!id) return 'sword'
  return itemById(id)?.weapon ?? 'sword'
}
