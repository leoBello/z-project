import type { BufferGeometry } from 'three'

/**
 * Force les normales par face, pour le rendu low-poly facetté.
 *
 * `MeshToonMaterial` n'expose pas `flatShading` (contrairement à Standard ou
 * Lambert), donc l'effet doit être cuit dans la géométrie : on dé-indexe, puis
 * on recalcule les normales — chaque triangle obtient alors les siennes au lieu
 * de les moyenner avec ses voisins.
 *
 * Le test sur `index` n'est pas cosmétique : `ExtrudeGeometry` produit déjà une
 * géométrie non indexée, et `toNonIndexed()` la relance avec un avertissement
 * console à chaque appel.
 */
export function faceted<T extends BufferGeometry>(geometry: T): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  flat.computeVertexNormals()
  return flat
}
