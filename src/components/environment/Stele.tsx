import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { STELE } from '../../config/landmarks'
import { toonGradient } from '../models/toonGradient'
import { InteractionMarker } from './InteractionMarker'
import { box } from './solids'

/**
 * Grande Stèle — les compétences.
 *
 * Une dalle dressée, deux fois plus haute que le joueur, sur un socle à deux
 * redans et flanquée de deux bornes. Sa silhouette est **verticale et étroite**,
 * là où la pyramide est large et l'idole trapue : à la distance de la caméra,
 * c'est la proportion qui identifie un monument, avant sa couleur.
 *
 * Le panneau gravé est émissif ambre, comme le cristal du temple. Le bleu est
 * réservé aux marqueurs d'interaction — un monument qui s'allumerait en bleu
 * brouillerait le seul code couleur que le joueur ait à retenir.
 */

const SLAB_W = 3.2
const SLAB_D = 0.85
/** Hauteur du fût, avant la partie amincie et le chapiteau. */
const SHAFT_H = 5.6
const CROWN_H = 1.6
const BASE_H = 0.7
const TOTAL_H = BASE_H + SHAFT_H + CROWN_H + 0.4

function buildStele() {
  const pale: BufferGeometry[] = []
  const dark: BufferGeometry[] = []
  const glyph: BufferGeometry[] = []

  // Socle : deux redans, le vocabulaire du stylobate du temple. Les cinq
  // monuments partagent quelques gestes pour appartenir au même monde.
  dark.push(box(5.2, 0.35, 3.6, 0, 0.175, 0))
  dark.push(box(4.4, 0.35, 2.9, 0, 0.525, 0))

  // Fût, puis section amincie : le rétrécissement donne l'élancement sans avoir
  // à modéliser un vrai fruit.
  pale.push(box(SLAB_W, SHAFT_H, SLAB_D, 0, BASE_H + SHAFT_H / 2, 0))
  pale.push(box(SLAB_W - 0.5, CROWN_H, SLAB_D - 0.15, 0, BASE_H + SHAFT_H + CROWN_H / 2, 0))
  dark.push(box(SLAB_W + 0.3, 0.4, SLAB_D + 0.2, 0, TOTAL_H - 0.2, 0))

  // Cadre gravé, puis le panneau lumineux en retrait dedans.
  dark.push(box(2.5, 4.6, 0.1, 0, BASE_H + 2.6, SLAB_D / 2 + 0.05))
  glyph.push(box(2.1, 4.2, 0.08, 0, BASE_H + 2.6, SLAB_D / 2 + 0.11))

  // Deux bornes, l'une plus courte : parfaitement jumelles, elles auraient donné
  // une symétrie de mausolée plutôt qu'un vestige.
  dark.push(box(0.8, 1.9, 0.8, -2.9, 0.95, 0.3))
  dark.push(box(0.8, 1.35, 0.8, 2.9, 0.675, -0.2))

  return {
    pale: mergeGeometries(pale)!,
    dark: mergeGeometries(dark)!,
    glyph: mergeGeometries(glyph)!,
  }
}

const geometry = buildStele()

export function Stele() {
  return (
    <group position={[STELE.x, STELE.altitude, STELE.z]} rotation={[0, STELE.yaw, 0]}>
      <mesh geometry={geometry.pale} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color="#b3b6ae" />
      </mesh>
      <mesh geometry={geometry.dark} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color="#6d7168" />
      </mesh>
      <mesh geometry={geometry.glyph}>
        <meshToonMaterial
          gradientMap={toonGradient}
          color="#ffe9bd"
          emissive="#ffb43c"
          emissiveIntensity={1.1}
        />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[2.6, 0.35, 1.8]} position={[0, 0.35, 0]} />
        <CuboidCollider
          args={[SLAB_W / 2, (SHAFT_H + CROWN_H) / 2, SLAB_D / 2]}
          position={[0, BASE_H + (SHAFT_H + CROWN_H) / 2, 0]}
        />
      </RigidBody>

      <InteractionMarker landmarkId={STELE.id} position={[0, 0, STELE.markerZ]} />
    </group>
  )
}
