import type { BiomeId, MapId } from '../types/game'

/**
 * Ce qu'il faut savoir d'un monde pour en dessiner le sol et l'ensemencer.
 *
 * Le continent était le seul monde à relief : `Terrain`, `Vegetation`, `Water`,
 * la carte d'écume et le fond de minimap lisaient donc `config/world.ts`
 * directement, par des imports nommés. C'était exact tant qu'il n'y avait qu'un
 * champ de hauteurs — l'Île Céleste et le Marais ont chacun leur géométrie
 * propre, et n'ont jamais rien partagé avec ces cinq-là.
 *
 * L'Outremonde change la donne : c'est un **second champ de hauteurs**, avec les
 * sept mêmes biomes, la même mer, le même semis. Recopier les cinq modules
 * aurait donné deux versions de la même chose, à corriger deux fois — et la
 * seconde aurait divergé dès le premier réglage de densité.
 *
 * D'où cette interface. Elle ne décrit **que** ce dont ces cinq consommateurs
 * ont besoin : les cotes de la grille, l'échantillonneur de relief, la valeur de
 * région qui fond les biomes intermédiaires, le masque d'île, et les deux
 * exclusions du semis. Rien d'autre — surtout pas les monuments, les ennemis ou
 * les portails, qui ne sont pas des propriétés du *sol*.
 *
 * **Une forme n'est pas une carte.** Trois cartes existent sans forme (le ciel,
 * le marais) ou en ont une (le continent, l'Outremonde) ; c'est pourquoi il n'y
 * a pas de `Record<MapId, WorldShape>` ici. L'`id` ne sert qu'à mémoïser les
 * textures cuites une fois par monde — voir `shoreDepth.ts`.
 */
export interface WorldShape {
  /** La carte à laquelle ce relief appartient. Sert de clé de cache, rien de plus. */
  id: MapId

  /** Côté de la carte, en unités monde, et sa moitié. */
  size: number
  half: number
  /** Cellules de la grille de hauteurs (le maillage a `grid + 1` points de côté). */
  grid: number

  /** Niveau de la mer, et profondeur maximale du fond marin. */
  waterLevel: number
  maxDepth: number
  /** Au-dessus de cette altitude, on est en montagne ; puis sous la neige. */
  mountainLevel: number
  snowLevel: number

  /** Altitude du terrain en (x, z). La seule source de vérité du relief. */
  height(x: number, z: number): number
  /** Pente locale, par différences finies. Sert à ne rien planter sur une falaise. */
  slope(x: number, z: number): number
  /**
   * Valeur de région : décide entre jungle, prairie et terres arides.
   *
   * Le sol ne lit pas le biome classé mais cette valeur continue, et **fond**
   * les trois palettes le long d'elle : une couleur par biome donnerait des
   * frontières nettes, donc une carte politique. Les seuils du fondu vivent dans
   * `Terrain.tsx` et sont les mêmes pour tous les mondes — une forme qui veut
   * ses trois biomes lisibles doit donc étaler sa valeur entre 0 et 1.
   */
  region(x: number, z: number): number
  /** Vaut 1 au cœur d'une île, 0 au large. Sert au relief comme à la teinte. */
  islandMask(x: number, z: number): number
  /** Classe un point en biome. L'altitude décide avant le bruit de région. */
  biome(x: number, z: number, height: number): BiomeId

  /**
   * Interdit au semis : les parvis de monuments, les dessous de pont, les
   * dallages.
   *
   * Un prédicat et non une liste de cercles, parce que les deux mondes n'y
   * mettent pas les mêmes choses — et que le semis n'a aucune raison de savoir
   * ce qu'il évite. Il demande « puis-je planter ici ? », pas « y a-t-il un pont
   * ici ? ».
   */
  blocked(x: number, z: number): boolean

  /**
   * La clairière du point d'apparition : aucun gros prop à l'intérieur.
   *
   * Distincte de `blocked` parce qu'elle ne bloque pas tout — l'herbe et les
   * fleurs y poussent, ce sont les troncs et les rochers qui en sont exclus. Un
   * arbre planté sur le point d'arrivée est la seule chose qui puisse gâcher une
   * première seconde de jeu.
   */
  clearing: { x: number; z: number; radius: number }

  /** Graine du semis de végétation. Fixe : la carte doit être reconnaissable. */
  scatterSeed: number
}
