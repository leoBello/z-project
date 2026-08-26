import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three'
import { faceted } from './faceted'

/**
 * Primitives des monuments.
 *
 * Extraites de `Temple.tsx` quand la pyramide, la stèle, l'idole et les ruines
 * se sont mises à en avoir besoin. Elles partagent toutes la même convention :
 * on compose des solides dans le repère local du monument, on les fusionne par
 * teinte, et on obtient un draw call par teinte plutôt qu'un par bloc.
 */

/**
 * Écart minimal entre deux faces qui, sans lui, seraient coplanaires.
 *
 * Le tampon de profondeur n'a pas de départage : deux surfaces au même `z` et
 * de même orientation clignotent en fonction de l'angle de vue. La règle du
 * projet est qu'un solide décoratif **mord** dans celui qu'il habille, plutôt
 * que d'affleurer avec lui.
 */
export const Z_FIGHT_LIFT = 0.012

/** Pavé facetté, centré sur (x, y, z). */
export function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): BufferGeometry {
  return faceted(new BoxGeometry(w, h, d)).translate(x, y, z)
}

/**
 * Cylindre facetté **posé** sur `y`, et non centré dessus.
 *
 * C'est la convention qui compte : les monuments s'écrivent en empilant des
 * assises, et avoir à ajouter `h / 2` à chaque appel était une source d'erreurs
 * silencieuses — un décalage d'une demi-assise ne se voit pas sur un croquis.
 */
export function cyl(
  rTop: number,
  rBottom: number,
  h: number,
  x: number,
  y: number,
  z: number,
  segments = 8,
): BufferGeometry {
  return faceted(new CylinderGeometry(rTop, rBottom, h, segments)).translate(x, y + h / 2, z)
}

/**
 * Volée de marches en blocs pleins.
 *
 * Chaque marche monte du sol à sa propre hauteur au lieu d'être une dalle
 * posée : empilées, elles ne laissent aucun vide sous le nez de marche, et ce
 * qu'elles recouvrent disparaît dedans. C'est ce qui fait paraître l'escalier
 * taillé dans la masse plutôt que collé dessus.
 */
export function stairs(
  width: number,
  height: number,
  fromZ: number,
  toZ: number,
  steps: number,
): BufferGeometry[] {
  const run = fromZ - toZ
  return Array.from({ length: steps }, (_, step) => {
    // Le décalage évite le **z-fighting**, pas un défaut d'alignement.
    //
    // Une volée plaquée sur un monument à gradins tombe fatalement sur les
    // mêmes cotes que lui : une marche sur deux avait sa face supérieure
    // exactement dans le plan d'un gradin. Deux faces horizontales à la même
    // profondeur et de même orientation, le GPU ne peut pas les départager et
    // elles clignotent selon l'angle. Un centimètre suffit à trancher, et ne se
    // voit pas à l'échelle du jeu.
    const top = ((step + 1) * height) / steps + Z_FIGHT_LIFT
    const outer = fromZ - (step * run) / steps
    const depth = outer - toZ
    return box(width, top, depth, 0, top / 2, toZ + depth / 2)
  })
}
