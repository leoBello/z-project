/**
 * Projection isométrique et découpage en trois bandes.
 *
 * C'est ici que se joue la parenté avec le jeu. Le rendu 3D utilise un
 * `meshToonMaterial` sur une rampe de trois texels — ombre, demi-ton, lumière —
 * ce qui donne des bandes franches plutôt qu'un dégradé. On transpose
 * littéralement : chaque solide est peint en trois aplats, un par orientation
 * de face. Aucun dégradé, aucune ombre douce, la même lecture facettée que la
 * végétation et le temple.
 */

/** Pixels par unité, sur chaque axe de la projection. */
const ISO_X = 15
const ISO_Y = 7.5
const ISO_H = 15

/** Un point projeté à l'écran. */
export type Point = readonly [number, number]

export interface Facet {
  /**
   * Sommets projetés, gardés en **nombres** et non en chaîne SVG.
   *
   * C'est ce qui permet à `boundsOf` de cadrer l'image sans reparser quoi que
   * ce soit. La chaîne n'est fabriquée qu'au moment du rendu.
   */
  points: readonly Point[]
  fill: string
}

/** Attribut `points` d'un `<polygon>`. */
export function pointsAttribute(points: readonly Point[]) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}

/**
 * Boîte englobante d'un ensemble de facettes.
 *
 * Le cadrage doit être calculé, pas écrit à la main : le nombre d'éléments d'un
 * motif varie d'un projet à l'autre, donc un `viewBox` fixe laisserait une
 * marge béante sur les compositions courtes et rognerait les longues. Mesuré
 * sur la première version, où le socle sortait par le bas pendant qu'un tiers
 * de la hauteur restait vide en haut.
 */
export function boundsOf(facets: readonly Facet[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const facet of facets) {
    for (const [x, y] of facet.points) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}

export interface Shade {
  top: string
  left: string
  right: string
}

/** Éclaircit ou assombrit une couleur `#rrggbb` d'un facteur multiplicatif. */
function scale(hex: string, factor: number) {
  const value = parseInt(hex.slice(1), 16)
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * factor)))
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

/**
 * Les trois bandes d'un solide.
 *
 * Le dessus prend la lumière, la face droite reste au demi-ton, la face gauche
 * passe à l'ombre. L'écart entre les trois est volontairement large : resserré,
 * il redonnerait un dégradé, donc annulerait exactement l'effet recherché.
 */
export function shadesFrom(base: string): Shade {
  return { top: scale(base, 1.28), right: scale(base, 1), left: scale(base, 0.68) }
}

/** Coordonnées écran d'un point du repère isométrique. */
function project(x: number, y: number, z: number): Point {
  return [(x - z) * ISO_X, (x + z) * ISO_Y - y * ISO_H]
}

/**
 * Un pavé isométrique, en trois facettes.
 *
 * `(x, y, z)` est le coin bas-arrière, `h` la hauteur. L'ordre de retour
 * compte : dessus, face gauche, face droite. Les facettes sont dessinées dans
 * l'ordre du tableau final, **sans tri de profondeur** — les motifs sont donc
 * écrits du plus lointain au plus proche. Pour des compositions de cette
 * taille, ça suffit et ça évite d'écrire un tri qui serait de toute façon faux
 * pour des solides qui s'interpénètrent.
 */
export function isoBox(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  shade: Shade,
): Facet[] {
  const top = y + h
  return [
    {
      points: [
        project(x, top, z),
        project(x + w, top, z),
        project(x + w, top, z + d),
        project(x, top, z + d),
      ],
      fill: shade.top,
    },
    {
      points: [
        project(x, top, z + d),
        project(x + w, top, z + d),
        project(x + w, y, z + d),
        project(x, y, z + d),
      ],
      fill: shade.left,
    },
    {
      points: [
        project(x + w, top, z),
        project(x + w, top, z + d),
        project(x + w, y, z + d),
        project(x + w, y, z),
      ],
      fill: shade.right,
    },
  ]
}
