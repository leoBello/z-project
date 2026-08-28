import type { ItemId } from '../types/game'

/**
 * Objets ramassables et leurs effets.
 *
 * Ce fichier ne décrit que ce qu'un objet **fait** et de quoi il a l'air. Son
 * nom, son type affiché et sa description vivent dans `src/i18n/*.json` sous
 * `ui.items`, comme les noms de monuments : le jeu est bilingue, et une chaîne
 * écrite ici ne pourrait pas l'être. Trois systèmes lisent cette table sans se
 * connaître — l'inventaire, la carte d'objet, et le store pour appliquer le
 * bonus de cœurs.
 */

/** Familles d'objets. Pilote le libellé de type sur la carte. */
export type ItemKind = 'outfit' | 'trinket'

/** Silhouette du joueur associée à une tenue. Voir `HeroPlaceholder`. */
export type OutfitId = 'default' | 'ninja'

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
   * Silhouette prise par le joueur quand l'objet est porté.
   *
   * `undefined` pour un objet qui ne change pas l'apparence — on ne veut pas
   * qu'une babiole ait à déclarer `outfit: 'default'` pour ne rien faire.
   */
  outfit?: OutfitId
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
  outfit: 'ninja',
  accent: '#c8443f',
}

export const ITEMS: readonly Item[] = [NINJA_GARB]

/** Retrouve un objet par son identifiant. */
export function itemById(id: ItemId): Item | undefined {
  return ITEMS.find((item) => item.id === id)
}

/**
 * Silhouette à afficher pour l'objet équipé.
 *
 * Centralisée ici plutôt que dans le composant du joueur : c'est la table des
 * objets qui décide de ce qu'une tenue fait, pas le rig qui devine.
 */
export function outfitOf(equipped: ItemId | null): OutfitId {
  if (!equipped) return 'default'
  return itemById(equipped)?.outfit ?? 'default'
}
