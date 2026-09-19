import type { ItemId } from '../types/game'

/**
 * Objets ramassables et leurs effets.
 *
 * Ce fichier ne décrit que ce qu'un objet **fait** et de quoi il a l'air. Son
 * nom, son type affiché et sa description vivent dans `src/i18n/*.json` sous
 * `ui.items`, comme les noms de monuments : le jeu est bilingue, et une chaîne
 * écrite ici ne pourrait pas l'être. Quatre systèmes lisent cette table sans se
 * connaître — l'inventaire, la carte d'objet, le store pour appliquer bonus de
 * cœurs et dégâts, et le rig du personnage pour choisir sa silhouette, son arme et ses aptitudes.
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

/**
 * Silhouette du joueur associée à un skin. Voir `HeroPlaceholder`.
 *
 * Le premier est celui du départ de partie : c'est lui que `outfitOf` renvoie
 * quand l'emplacement est vide, et il n'existe donc aucun objet qui le donne.
 */
export type OutfitId = 'luffy' | 'zoro'

/**
 * Ce que le personnage tient en main droite. Voir `HeroPlaceholder`.
 *
 * `fists` n'est pas l'absence d'arme, c'en est une : le premier skin se bat à
 * mains nues, et c'est `StrikeArc` qui en tire les conséquences — une onde
 * d'impact au bout du poing plutôt qu'une traînée de lame.
 */
export type WeaponId = 'fists' | 'sword' | 'katana'

/**
 * Aptitude de déplacement propre à un skin.
 *
 * Elle vit ici, et pas dans la table des objets, parce que **le skin de départ
 * n'a pas d'objet** : aucun coffre ne le donne, il est ce qu'on est quand on n'a
 * rien trouvé. Une aptitude portée par l'objet aurait donc laissé le début de
 * partie sans aucune, et le second skin aurait été un gain sec au lieu d'un
 * échange.
 *
 * Ce sont des multiplicateurs de `PLAYER.speed` et `PLAYER.jumpSpeed`, jamais
 * des valeurs absolues : le réglage de base reste dans `gameplay.ts`, seul
 * endroit où on l'ajuste.
 *
 * L'échange est volontairement net. La hauteur d'un saut varie comme le **carré**
 * de la vitesse initiale : ×1,2 sur `jumpSpeed`, ce sont 44 % de hauteur en
 * plus, pas 20. C'est ce qu'il faut pour que le franchissement change vraiment,
 * là où les 18 % de vitesse au sol du second skin se sentent surtout sur la
 * longueur d'une traversée.
 */
export interface SkinTraits {
  speed: number
  jump: number
}

const SKIN_TRAITS: Record<OutfitId, SkinTraits> = {
  luffy: { speed: 1, jump: 1.2 },
  zoro: { speed: 1.18, jump: 1 },
}

/** Aptitudes du skin courant. */
export function skinTraits(outfit: OutfitId): SkinTraits {
  return SKIN_TRAITS[outfit]
}

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
   * qu'une babiole ait à déclarer le skin de départ pour ne rien faire.
   */
  outfit?: OutfitId
  /** Arme prise par le joueur quand l'objet est porté. Même règle que `outfit`. */
  weapon?: WeaponId
  /** Teinte d'accent : carte, icône d'inventaire, éclat du coffre. */
  accent: string
}

/**
 * Tenue du Chasseur de Pirates — le second skin.
 *
 * Le seul objet du jeu qui change le personnage lui-même, et pas seulement ses
 * vêtements : manteau, haramaki, deux fourreaux, coupe verte et œil clos. C'est
 * assumé — une simple tenue de rechange ne se serait pas vue à cette échelle de
 * silhouette, et l'objet doit valoir la montée jusqu'au Temple.
 *
 * Il donne des cœurs **et** de la vitesse, mais ce n'est pas un gain sec : le
 * skin de départ saute nettement plus haut, et cette détente-là se perd en
 * l'équipant. Voir `SkinTraits`.
 *
 * L'accent est un vert franc, et c'est le point le plus discutable de la table.
 * Le vert est partout dans le monde, contrairement au prune et au cramoisi qu'il
 * remplace ; mais l'accent ne sert qu'à l'interface — carte, icône d'inventaire,
 * éclat du coffre — où il n'a que le jade de Kusanagi pour voisin. Les deux se
 * séparent par la température : celui-ci tire vers le jaune, le jade vers le
 * bleu.
 */
export const ZORO_GARB: Item = {
  id: 'zoro-garb',
  kind: 'outfit',
  bonusHearts: 2,
  attackMultiplier: 1,
  outfit: 'zoro',
  accent: '#6fa83c',
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

export const ITEMS: readonly Item[] = [ZORO_GARB, KUSANAGI]

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
  if (!id) return 'luffy'
  return itemById(id)?.outfit ?? 'luffy'
}

/**
 * Ce que le personnage tient, pour l'équipement courant.
 *
 * Contrairement à `outfitOf`, le défaut n'est pas constant : **il dépend du
 * skin**. Un bretteur qui porte deux sabres à la hanche et cogne du poing aurait
 * été une incohérence gratuite, et un homme-caoutchouc qui dégaine une épée
 * aussi. L'arme trouvée, elle, reste équipable par les deux — c'est tout
 * l'intérêt d'avoir un emplacement par famille.
 */
export function weaponOf(equipment: Equipment, outfit: OutfitId): WeaponId {
  const id = equipment.weapon
  const equipped = id ? itemById(id)?.weapon : undefined
  return equipped ?? (outfit === 'zoro' ? 'sword' : 'fists')
}
