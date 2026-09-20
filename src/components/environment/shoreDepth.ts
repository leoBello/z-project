import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RedFormat,
  UnsignedByteType,
} from 'three'
import type { WorldShape } from '../../config/worldShape'

/**
 * Carte de profondeur d'eau, échantillonnée depuis `sampleHeight`.
 *
 * L'écume du rivage doit savoir, pour chaque pixel de la mer, à quelle distance
 * du bord il se trouve. Le shader n'a pas accès au bruit qui génère le relief —
 * c'est une fonction JavaScript. La solution qui **ne crée pas de seconde
 * source de vérité** est de cuire le relief une fois au démarrage, depuis
 * `sampleHeight` lui-même : la ligne de rivage de l'écume est alors, par
 * construction, celle du mesh, du collider et de la minimap.
 *
 * L'alternative aurait été de lire le tampon de profondeur pour comparer la
 * surface au fond, comme le font les moteurs. Elle coûte une passe de rendu
 * supplémentaire et un `depthTexture` — cher pour une frange de deux unités de
 * large sur une scène qui tient déjà son budget.
 *
 * Coût mesuré au démarrage : voir `console.time('shoreDepth')` en développement.
 */

/** Côté de la texture. 256 sur 200 unités : ~0,8 unité par texel. */
const RESOLUTION = 256
/**
 * Profondeur, en unités monde, au-delà de laquelle il n'y a plus d'écume.
 *
 * C'est elle qui fixe la largeur de la frange : le haut-fond guéable qui mène à
 * l'île descend lentement, une valeur trop grande y noierait tout le passage
 * sous la mousse.
 */
export const FOAM_DEPTH = 1.5

/**
 * Une texture par monde, et non une seule.
 *
 * Deux cartes du jeu ont une mer — le continent et l'Outremonde — et leurs
 * lignes de rivage n'ont évidemment rien à voir. Une variable unique aurait
 * servi la carte d'écume du premier monde visité au second, c'est-à-dire de la
 * mousse au large et pas une goutte contre la côte.
 */
const textures = new Map<string, DataTexture>()

/**
 * Construit la texture au premier appel pour ce monde, puis la réutilise.
 *
 * Paresseuse et non calculée à l'import : le module est chargé par le découpage
 * de bundle avant que la scène n'existe, et 65 000 évaluations de bruit n'ont
 * rien à faire dans le chemin critique du parsing.
 */
export function shoreDepthTexture(shape: WorldShape) {
  const cached = textures.get(shape.id)
  if (cached) return cached

  if (import.meta.env.DEV) console.time(`shoreDepth:${shape.id}`)
  const data = new Uint8Array(RESOLUTION * RESOLUTION)

  for (let row = 0; row < RESOLUTION; row++) {
    // Le texel est indexé par la **position monde**, pas par l'UV du plan : le
    // shader retrouve donc sa coordonnée sans avoir à raisonner sur la rotation
    // de -90° qui couche le plan d'eau.
    const z = ((row + 0.5) / RESOLUTION - 0.5) * shape.size
    for (let column = 0; column < RESOLUTION; column++) {
      const x = ((column + 0.5) / RESOLUTION - 0.5) * shape.size
      const depth = shape.waterLevel - shape.height(x, z)
      const normalized = Math.min(Math.max(depth / FOAM_DEPTH, 0), 1)
      data[row * RESOLUTION + column] = Math.round(normalized * 255)
    }
  }
  if (import.meta.env.DEV) console.timeEnd(`shoreDepth:${shape.id}`)

  const texture = new DataTexture(data, RESOLUTION, RESOLUTION, RedFormat, UnsignedByteType)
  // Filtrage linéaire : sans lui, la frange d'écume prendrait l'escalier des
  // texels, très visible sur une ligne de rivage presque parallèle aux axes.
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.needsUpdate = true
  textures.set(shape.id, texture)
  return texture
}
