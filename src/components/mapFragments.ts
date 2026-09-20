import type { MapId } from '../types/game'
import { preloadRotMarsh } from './rot/preload'
import { preloadSkyIsland } from './skyisland/preload'

/**
 * Le fragment de bundle à télécharger avant d'entrer sur une carte.
 *
 * Deux appelants, et c'est la raison de cette table : le store lance le
 * téléchargement au lever du voile (`enterMap`), et le voile de transition
 * l'attend avant de basculer. Tant qu'il n'y avait qu'une carte différée, les
 * deux écrivaient `to === 'sky' ? preloadSkyIsland() : Promise.resolve()`, et
 * cette ligne recopiée à deux endroits était exactement le genre de chose qui
 * finit par diverger — avec pour symptôme un voile qui se lève sur une carte
 * pas encore arrivée.
 *
 * Le continent n'a pas de fragment : il est dans le bundle d'accueil, parce
 * qu'il *est* l'accueil. Son entrée résout immédiatement, ce qui vaut mieux que
 * de l'omettre — un `Record<MapId, …>` complet est ce qui garantit qu'une
 * quatrième carte ne puisse pas se glisser ici sans qu'on se pose la question.
 */
const FRAGMENTS: Record<MapId, () => Promise<unknown>> = {
  continent: () => Promise.resolve(),
  sky: preloadSkyIsland,
  rot: preloadRotMarsh,
}

export function preloadMap(map: MapId) {
  return FRAGMENTS[map]()
}
