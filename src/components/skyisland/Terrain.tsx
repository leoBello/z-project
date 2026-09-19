import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import {
  islandNoise,
  rimRadius,
  surfaceRelief,
  topHeight,
  topSlope,
  underHeight,
  underRadius,
} from '../../config/skyIsland'
import { smoothstep } from '../../config/world'
import { faceted } from '../environment/faceted'
import { SKY_COLORS, SKY_MATERIALS, mixColor } from './palette'

/**
 * Le terrain de l'Île Céleste : son dessus, son socle, et de quoi marcher
 * dessus.
 *
 * Une surface **radiale** et non un champ de hauteurs sur grille carrée comme le
 * continent, pour une raison qui n'est pas de commodité : l'île a un dessous. Un
 * champ de hauteurs n'associe qu'une altitude à chaque `(x, z)` et ne peut donc
 * pas décrire un surplomb — or le socle inversé en est un sur toute sa surface.
 */

/**
 * Résolution du maillage **visible**.
 *
 * Cent vingt-huit secteurs pour que la lèvre irrégulière ne se lise pas en
 * segments droits à trente unités, soixante-quatre anneaux pour que les talus
 * soient des pentes et non des marches d'escalier.
 */
const VIEW_SECTORS = 128
const VIEW_RINGS = 64
/** Le socle en porte moins : il n'a ni terrasse ni rampe à décrire. */
const UNDER_RINGS = 52

/**
 * Résolution du maillage de **collision**, presque trois fois plus grossière.
 *
 * Vingt-cinq mille triangles de trimesh pour une surface qu'on parcourt à pied,
 * ce serait payer une précision que le personnage ne peut pas ressentir : sa
 * capsule fait 0,70 d'emprise, et à 48 × 24 la maille fait 1,4 unité sur la
 * lèvre et bien moins vers le centre. Aucune marche ne se sent.
 *
 * Les deux maillages restent **une seule source de vérité** : ils échantillonnent
 * la même `topHeight` et le même `surfaceRelief`. C'est la résolution qui
 * diffère, pas la forme — et c'est cette nuance qui distingue l'optimisation
 * d'un second terrain qu'il faudrait tenir à jour.
 */
const HULL_SECTORS = 48
const HULL_RINGS = 24

/**
 * Une surface radiale, en coordonnées polaires.
 *
 * `radiusAt` et `heightAt` décrivent le dessus comme le dessous ; seul l'ordre
 * des sommets change, puisque les deux surfaces se regardent en sens opposés.
 */
function buildSurface(
  sectors: number,
  rings: number,
  radiusAt: (t: number, theta: number) => number,
  heightAt: (t: number, theta: number) => number,
  colorAt: ((t: number, theta: number, r: number) => Color) | null,
  flip: boolean,
) {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  for (let ring = 0; ring <= rings; ring++) {
    const t = flip ? 1 - ring / rings : ring / rings
    for (let s = 0; s <= sectors; s++) {
      const theta = (s / sectors) * Math.PI * 2
      const r = radiusAt(t, theta)
      positions.push(Math.sin(theta) * r, heightAt(t, theta), Math.cos(theta) * r)
      if (colorAt) {
        const color = colorAt(t, theta, r)
        colors.push(color.r, color.g, color.b)
      }
    }
  }

  const stride = sectors + 1
  for (let ring = 0; ring < rings; ring++) {
    for (let s = 0; s < sectors; s++) {
      const a = ring * stride + s
      const b = a + stride
      // Le socle est parcouru de la lèvre vers la pointe, donc dans l'autre
      // sens : sans cette inversion, ses faces regarderaient l'intérieur de
      // l'île et il serait invisible de l'extérieur.
      if (flip) indices.push(a, a + 1, b, a + 1, b + 1, b)
      else indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  if (colorAt) geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  return geometry
}

/** Le dessus : trois terrasses, six rampes, et sa lèvre irrégulière. */
function buildTop(sectors: number, rings: number, colored: boolean) {
  return buildSurface(
    sectors,
    rings,
    (t, theta) => t * rimRadius(theta),
    (t, theta) => {
      const r = t * rimRadius(theta)
      return topHeight(r, theta) + surfaceRelief(r, theta)
    },
    colored
      ? (_t, theta, r) => {
          // La couleur **dit la pente**, donc où l'on peut marcher : pelouse sur
          // les plateaux et les rampes, pierre nue sur les falaises. C'est la
          // seule indication que le joueur reçoit sur ce qu'il peut gravir, et
          // elle doit donc être dérivée de la pente réelle, jamais d'un rayon
          // écrit à la main qui finirait par mentir.
          const grain = islandNoise(r * 0.09, theta * 3.1)
          let color = mixColor(SKY_COLORS.lawn, SKY_COLORS.lawnDark, 0.34 + grain * 0.26)
          color = color.lerp(new Color(SKY_COLORS.stoneDark), smoothstep(0.55, 1.3, topSlope(r, theta)))
          color = color.lerp(new Color(SKY_COLORS.stoneMid), smoothstep(50, 55.5, r))
          // Dallage de l'arène.
          color = color.lerp(new Color(SKY_COLORS.stone), smoothstep(13, 9, r) * 0.75)
          return color
        }
      : null,
    false,
  )
}

/** Le socle inversé, de la lèvre à la pointe. */
function buildUnder() {
  return buildSurface(
    VIEW_SECTORS,
    UNDER_RINGS,
    underRadius,
    underHeight,
    (t) => {
      let color = mixColor(SKY_COLORS.rock, SKY_COLORS.rockDeep, 1 - t)
      // La roche s'allume en approchant du cristal, qui est enchâssé dans la
      // pointe. C'est le seul éclairage de cette face, que le soleil n'atteint
      // jamais.
      color = color.lerp(new Color(SKY_COLORS.crystal), smoothstep(0.34, 0.02, t) * 0.62)
      return color
    },
    true,
  )
}

/**
 * Construites une fois pour toutes, hors de React.
 *
 * Contrairement aux matériaux, les géométries ne tiennent rien qui doive être
 * libéré au démontage : ce sont des tableaux de nombres, purs, identiques d'un
 * voyage à l'autre. Les reconstruire à chaque aller-retour coûterait une
 * seconde de calcul pour un résultat au bit près identique.
 */
const TOP = faceted(buildTop(VIEW_SECTORS, VIEW_RINGS, true))
const UNDER = faceted(buildUnder())

/**
 * Le casque de collision : les sommets et les triangles bruts que Rapier attend.
 *
 * Pas de `faceted()` ici, et c'est volontaire : le facettage triple le nombre de
 * sommets pour donner à chaque triangle sa propre normale, ce dont un moteur
 * physique n'a aucun usage. Il lui faut la forme, pas son ombrage.
 */
const HULL = (() => {
  const geometry = buildTop(HULL_SECTORS, HULL_RINGS, false)
  return {
    vertices: geometry.attributes.position.array as Float32Array,
    indices: new Uint32Array(geometry.index!.array),
  }
})()

export function SkyTerrain() {
  const materials = SKY_MATERIALS
  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <TrimeshCollider args={[HULL.vertices, HULL.indices]} />
      </RigidBody>

      {/*
        Le dessus reçoit et projette l'ombre ; le socle ne fait ni l'un ni
        l'autre. Il est sous l'île, le soleil ne l'atteint pas, et le faire
        entrer dans la passe d'ombres coûterait un rendu complet de sa
        géométrie pour un résultat que personne ne verra.
      */}
      <mesh geometry={TOP} material={materials.terrain} receiveShadow castShadow />
      <mesh geometry={UNDER} material={materials.terrain} />
    </>
  )
}
