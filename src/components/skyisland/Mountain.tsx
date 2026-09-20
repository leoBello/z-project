import { RigidBody, TrimeshCollider } from '@react-three/rapier'
import { BufferGeometry, Color, Float32BufferAttribute, RingGeometry } from 'three'
import { ARENA_RINGS } from '../../config/lynel'
import {
  DECK_Y,
  MOUNT_BASE_R,
  MOUNT_H,
  MOUNT_WORLD,
  SPUR_YAW,
  SUMMIT_R,
  SUMMIT_Y,
  mountUnderHeight,
  mountUnderRadius,
  mountainHeight,
  mountainSlope,
} from '../../config/skyMountain'
import { smoothstep } from '../../config/world'
import { faceted } from '../environment/faceted'
import { SKY_COLORS, SKY_MATERIALS, mixColor } from './palette'

/**
 * La Montagne de l'Ouest — sa roche, son socle, et de quoi la gravir.
 *
 * Une surface radiale, comme l'île, et pour les deux mêmes raisons : elle a un
 * **dessous** qu'aucun champ de hauteurs ne peut décrire, et tout son dessin
 * tient dans un profil qui se lit du centre vers le bord.
 *
 * Elle est construite dans **son** repère et posée ensuite à sa place, plutôt
 * que bâtie en coordonnées monde. Ce n'est pas une commodité d'écriture : le
 * relief est polaire autour de son propre centre, et la seule façon d'échanti-
 * llonner un chemin de six unités de large avec assez de finesse pour que la
 * physique le voie est de le faire dans ce repère-là (voir l'en-tête de
 * `config/skyMountain.ts`).
 */

/**
 * Résolution du maillage visible.
 *
 * Quatre-vingt-seize secteurs, soit 1,1 unité d'arc sur la ligne médiane du
 * chemin : les paliers de la spire se lisent comme une pente et non comme un
 * escalier. Quarante anneaux pour vingt-quatre unités de rayon, soit un anneau
 * tous les soixante centimètres — la largeur du chemin en compte dix.
 */
const VIEW_SECTORS = 96
const VIEW_RINGS = 40
/** Le socle en porte moins : il n'a ni chemin ni plateau à décrire. */
const UNDER_RINGS = 26

/**
 * Résolution du maillage de collision.
 *
 * Plus grossière, mais **pas au point de perdre le chemin** : soixante-douze
 * secteurs donnent 1,5 unité d'arc à mi-pente, donc quatre mailles en travers
 * des six unités de large. C'est la contrainte qui a décidé que la montagne
 * serait une surface à elle : échantillonnée depuis le centre de l'île, elle
 * n'en aurait eu qu'une seule, et le chemin n'aurait pas existé pour Rapier.
 *
 * Les deux maillages restent une seule source de vérité — même `mountainHeight`,
 * seule la finesse change.
 */
const HULL_SECTORS = 72
const HULL_RINGS = 30

/**
 * La couleur de la roche, en un point.
 *
 * Elle **dit la pente**, comme celle de l'île : dallage clair là où c'est plat,
 * donc là où l'on marche, roche nue sur les flancs. C'est la seule indication
 * que le joueur reçoit sur l'endroit où passe le chemin, et elle est dérivée de
 * la pente réelle — pas d'un tracé recopié à la main, qui finirait par désigner
 * un chemin là où la spire n'est plus.
 */
function rockColor(d: number, phi: number) {
  const y = mountainHeight(d, phi)
  const flat = 1 - smoothstep(0.35, 0.85, mountainSlope(d, phi))

  // La roche fonce en montant : c'est ce qui donne du volume à un cône, qu'un
  // aplat unique aplatirait complètement.
  const color = mixColor(SKY_COLORS.rock, SKY_COLORS.rockDeep, smoothstep(0, MOUNT_H, y) * 0.6)
  color.lerp(new Color(SKY_COLORS.stone), flat * 0.78)
  // La mousse ne prend qu'au pied, là où l'ombre de l'île retient l'humidité —
  // et seulement sur le plat, jamais sur une paroi.
  color.lerp(new Color(SKY_COLORS.moss), (1 - smoothstep(1, 5, y)) * flat * 0.45)
  return color
}

/**
 * Une surface radiale dans le repère de la montagne.
 *
 * Le jumeau de `buildSurface` du terrain de l'île, et volontairement une
 * seconde écriture plutôt qu'un module partagé : celle-là prend ses cotes d'un
 * disque de rayon fixe, celle-ci du contour ondulant de l'île. Les factoriser
 * demanderait de passer en paramètre tout ce qui les distingue.
 */
function buildSurface(
  sectors: number,
  rings: number,
  radiusAt: (t: number, phi: number) => number,
  heightAt: (t: number, phi: number) => number,
  colorAt: ((t: number, phi: number, d: number) => Color) | null,
  flip: boolean,
) {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  for (let ring = 0; ring <= rings; ring++) {
    const t = flip ? 1 - ring / rings : ring / rings
    for (let s = 0; s <= sectors; s++) {
      const phi = (s / sectors) * Math.PI * 2
      const d = radiusAt(t, phi)
      positions.push(Math.sin(phi) * d, heightAt(t, phi), Math.cos(phi) * d)
      if (colorAt) {
        const color = colorAt(t, phi, d)
        colors.push(color.r, color.g, color.b)
      }
    }
  }

  const stride = sectors + 1
  for (let ring = 0; ring < rings; ring++) {
    for (let s = 0; s < sectors; s++) {
      const a = ring * stride + s
      const b = a + stride
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

function buildTop(sectors: number, rings: number, colored: boolean) {
  return buildSurface(
    sectors,
    rings,
    (t) => t * MOUNT_BASE_R,
    (t, phi) => mountainHeight(t * MOUNT_BASE_R, phi),
    colored ? (_t, phi, d) => rockColor(d, phi) : null,
    false,
  )
}

/**
 * Le socle inversé.
 *
 * Il est cousu sur `mountRimHeight`, c'est-à-dire sur la cote que la surface
 * donne elle-même au bord — et non sur zéro. La spire relève le bord jusqu'à
 * cinq unités et demie sur une partie du pourtour ; coudre le socle à plat y
 * aurait ouvert une fente par laquelle on voit le ciel, exactement le défaut
 * qu'a eu l'île et qu'aucun calcul ne signale.
 */
function buildUnder() {
  return buildSurface(
    VIEW_SECTORS,
    UNDER_RINGS,
    mountUnderRadius,
    mountUnderHeight,
    (t) => {
      const color = mixColor(SKY_COLORS.rock, SKY_COLORS.rockDeep, 1 - t)
      // Pas de cristal ici : il n'y en a qu'un, enchâssé dans la pointe de
      // l'île. Un second sous la montagne en ferait un motif décoratif au lieu
      // d'un objet unique.
      return color
    },
    true,
  )
}

const TOP = faceted(buildTop(VIEW_SECTORS, VIEW_RINGS, true))
const UNDER = faceted(buildUnder())

/** Les sommets et triangles bruts que Rapier attend. Pas de facettage : il lui
 *  faut la forme, pas son ombrage. */
const HULL = (() => {
  const geometry = buildTop(HULL_SECTORS, HULL_RINGS, false)
  return {
    vertices: geometry.attributes.position.array as Float32Array,
    indices: new Uint32Array(geometry.index!.array),
  }
})()

/**
 * Les anneaux d'or du plateau, incrustés comme ceux de la rotonde.
 *
 * Ce sont **les mêmes rayons** (`ARENA_RINGS`), et c'est tout l'intérêt : le
 * joueur a appris sur le gardien que ces cercles mesurent les portées du
 * souffle et de l'onde. Les redessiner ici avec d'autres valeurs lui aurait
 * appris à s'en méfier ; les reprendre tels quels fait de sa première victoire
 * une compétence transférable.
 *
 * Le dernier est écarté : à 9,6 il tomberait sur la lèvre du plateau, où il se
 * lirait comme une bordure et non comme une graduation.
 */
const RINGS = ARENA_RINGS.filter((r) => r < SUMMIT_R - 1.5).map((radius) =>
  new RingGeometry(radius - 0.12, radius + 0.12, 48),
)

export function Mountain() {
  const materials = SKY_MATERIALS

  return (
    <group position={[MOUNT_WORLD.x, DECK_Y, MOUNT_WORLD.z]} rotation-y={SPUR_YAW}>
      {/*
        Le collider est dans le même groupe que l'image : même position, même
        cap, par construction. Il a été un moment sorti du groupe pour porter
        ses deux cotes lui-même, sur le soupçon que Rapier ne reprenait pas la
        rotation du parent ; la mesure a démenti — posé sur le chemin, le
        personnage repose à un centimètre de la surface analytique, sur toute la
        spire. Le soupçon venait d'un glissement qui n'a rien à voir (voir la
        note de `mountainSlope`), et deux jeux de cotes séparés ne se justifient
        pas par une hypothèse fausse.
      */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        <TrimeshCollider args={[HULL.vertices, HULL.indices]} />
      </RigidBody>

      {/* Comme l'île : le dessus reçoit et projette l'ombre, le socle ni l'un
          ni l'autre — le soleil ne l'atteint jamais. */}
      <mesh geometry={TOP} material={materials.terrain} receiveShadow castShadow />
      <mesh geometry={UNDER} material={materials.terrain} />

      {RINGS.map((geometry, index) => (
        <mesh
          key={index}
          geometry={geometry}
          material={materials.gold}
          rotation={[-Math.PI / 2, 0, 0]}
          // Deux centimètres au-dessus du plateau, comme les flaques et les
          // anneaux de mort : posé dessus, l'anneau se bat avec le sol dans le
          // tampon de profondeur et clignote par bandes.
          position={[0, SUMMIT_Y - DECK_Y + 0.02, 0]}
        />
      ))}
    </group>
  )
}
