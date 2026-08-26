import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PYRAMID } from '../../config/landmarks'
import { seededRandom } from '../../config/world'
import { toonGradient } from '../models/toonGradient'
import { InteractionMarker } from './InteractionMarker'
import { box, stairs, Z_FIGHT_LIFT } from './solids'

/**
 * Pyramide de la Jungle — la présentation.
 *
 * À degrés, avec une volée raide plaquée sur la façade et un sanctuaire au
 * sommet. La raideur est volontaire : une pyramide à degrés méso-américaine
 * monte à plus de 45°, et c'est cette pente qui la distingue au premier coup
 * d'œil d'un tumulus. Personne ne la gravit — le marqueur est au pied, et les
 * gradins sont des murs, comme ceux du temple.
 *
 * Elle est posée dans la végétation la plus dense de la carte : c'est le rayon
 * dégagé de son point d'intérêt qui lui ouvre une clairière, sans quoi la
 * jungle repousserait jusque contre ses flancs.
 */

const TIERS = 6
const TIER_H = 1.35
const TIER_INSET = 1.15
const BASE = 16
const HEIGHT = TIERS * TIER_H

/** Sanctuaire du sommet. */
const SHRINE_W = 4.2
const SHRINE_H = 2.2
const SHRINE_D = 4.2

const STAIR_W = 4.5
const STAIR_FROM_Z = BASE / 2 + 0.6
const STAIR_TO_Z = SHRINE_D / 2 + 0.15

/** Largeur du gradin `tier`, du plus large au plus étroit. */
const tierWidth = (tier: number) => BASE - 2 * TIER_INSET * tier

function buildPyramid() {
  const pale: BufferGeometry[] = []
  const dark: BufferGeometry[] = []
  const moss: BufferGeometry[] = []

  for (let tier = 0; tier < TIERS; tier++) {
    const w = tierWidth(tier)
    pale.push(box(w, TIER_H, w, 0, tier * TIER_H + TIER_H / 2, 0))
    // Un bandeau sombre au nu de chaque gradin : sans lui, six blocs de la même
    // teinte empilés se lisent comme un seul tronc de pyramide lisse.
    //
    // Son sommet dépasse celui du gradin de `Z_FIGHT_LIFT`, et c'est un
    // correctif : à l'origine les deux affleuraient exactement, donc six paires
    // de faces horizontales coplanaires — elles clignotaient. Le gradin est
    // maintenant coiffé par le bandeau, sa face supérieure enfouie dedans.
    const bandTop = (tier + 1) * TIER_H + Z_FIGHT_LIFT
    const bandH = 0.16 + Z_FIGHT_LIFT
    dark.push(box(w + 0.12, bandH, w + 0.12, 0, bandTop - bandH / 2, 0))
  }

  // La mousse ne pousse que sur les deux premiers gradins : c'est là que la
  // canopée retient l'humidité, et ça ancre le monument dans son biome.
  //
  // Par **plaques** et non en bandeau continu. Une dalle verte pleine sur toute
  // la largeur du gradin se lisait comme un couvercle posé sur la pierre, pas
  // comme de la végétation — vu en capture, l'effet était franchement mauvais.
  // Ce qui fait lire la mousse, c'est l'irrégularité du contour.
  const random = seededRandom(0x9055)
  for (let tier = 0; tier < 2; tier++) {
    const half = tierWidth(tier) / 2
    const top = (tier + 1) * TIER_H
    for (const side of [0, 1, 2, 3]) {
      for (let patch = 0; patch < 3; patch++) {
        const length = 0.7 + random() * 1.2
        const offset = (random() * 2 - 1) * (half - 1.1)
        const inset = half - 0.28
        // Les plaques débordent légèrement du nu du gradin : c'est ce
        // débordement qui accroche la lumière et signale du vivant.
        moss.push(
          side < 2
            ? box(length, 0.13, 0.62, offset, top + 0.02, side === 0 ? inset : -inset)
            : box(0.62, 0.13, length, side === 2 ? inset : -inset, top + 0.02, offset),
        )
      }
    }
  }

  dark.push(...stairs(STAIR_W, HEIGHT, STAIR_FROM_Z, STAIR_TO_Z, 12))

  // Sanctuaire : un cube, une corniche en saillie, un toit de mousse, et une
  // porte creusée dans la façade. Chaque pièce descend de `Z_FIGHT_LIFT` dans
  // celle du dessous, pour la même raison que les bandeaux.
  const shrineTop = HEIGHT + SHRINE_H
  const corniceTop = shrineTop + 0.32
  const roofTop = corniceTop + 0.34
  pale.push(box(SHRINE_W, SHRINE_H, SHRINE_D, 0, HEIGHT + SHRINE_H / 2, 0))

  const corniceH = corniceTop - shrineTop + Z_FIGHT_LIFT
  dark.push(box(SHRINE_W + 0.5, corniceH, SHRINE_D + 0.5, 0, corniceTop - corniceH / 2, 0))

  const roofH = roofTop - corniceTop + Z_FIGHT_LIFT
  moss.push(box(SHRINE_W + 0.2, roofH, SHRINE_D + 0.2, 0, roofTop - roofH / 2, 0))

  dark.push(box(1.3, 1.5, 0.3, 0, HEIGHT + 0.75, SHRINE_D / 2 - 0.06))

  return {
    pale: mergeGeometries(pale)!,
    dark: mergeGeometries(dark)!,
    moss: mergeGeometries(moss)!,
  }
}

/** Construite une fois pour toutes : la pyramide est unique et immuable. */
const geometry = buildPyramid()

export function Pyramid() {
  return (
    <group position={[PYRAMID.x, PYRAMID.altitude, PYRAMID.z]} rotation={[0, PYRAMID.yaw, 0]}>
      {/* Pierre chaude et sourde, plus terreuse que celle du temple : le même
          calcaire clair aurait fait doublon avec un monument déjà vu, et il
          n'aurait pas tenu contre le vert saturé de la jungle. */}
      <mesh geometry={geometry.pale} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color="#b9ab8e" />
      </mesh>
      <mesh geometry={geometry.dark} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color="#6f6349" />
      </mesh>
      <mesh geometry={geometry.moss} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color="#4f7d43" />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        {Array.from({ length: TIERS }, (_, tier) => (
          <CuboidCollider
            key={`tier-${tier}`}
            args={[tierWidth(tier) / 2, TIER_H / 2, tierWidth(tier) / 2]}
            position={[0, tier * TIER_H + TIER_H / 2, 0]}
          />
        ))}
        {/* L'escalier est plein et raide : un seul pavé qui couvre sa saillie
            suffit à empêcher le joueur de s'y coincer. */}
        <CuboidCollider
          args={[STAIR_W / 2, HEIGHT / 2, (STAIR_FROM_Z - STAIR_TO_Z) / 2]}
          position={[0, HEIGHT / 2, (STAIR_FROM_Z + STAIR_TO_Z) / 2]}
        />
      </RigidBody>

      <InteractionMarker landmarkId={PYRAMID.id} position={[0, 0, PYRAMID.markerZ]} />
    </group>
  )
}
