import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RUINS } from '../../config/landmarks'
import { seededRandom } from '../../config/world'
import { toonGradient } from '../models/toonGradient'
import { InteractionMarker } from './InteractionMarker'
import { box, cyl, Z_FIGHT_LIFT } from './solids'

/**
 * Ruines de l'Île — le contact.
 *
 * Un cercle de fûts brisés autour d'un autel fendu. C'est le seul monument des
 * cinq qui n'ait plus de forme d'ensemble : les quatre autres se lisent comme
 * des bâtiments, celui-ci comme ce qu'il en reste. La lecture vient des
 * **hauteurs inégales** — huit fûts à la même cote auraient donné une colonnade
 * neuve, donc un cinquième temple.
 *
 * Dernier lieu de la carte : on ne l'atteint qu'en traversant le gué, donc en
 * ayant compris que la mer se franchit à pied.
 */

const COLUMNS = 8
/**
 * Cotes resserrées par contrainte de terrain, pas par goût.
 *
 * Le plateau naturel de l'île est plat à la valeur près jusqu'à 5,2 de rayon,
 * puis plonge. Le dallage doit donc laisser la place au marqueur *à
 * l'intérieur* de cette zone, sans quoi la braise flotterait au-dessus du vide.
 * Des ruines compactes conviennent d'ailleurs mieux qu'une esplanade : c'est un
 * vestige, pas une place publique.
 */
const RING_R = 3
const COLUMN_R = 0.42
const FLOOR_R = 4

/**
 * Hauteurs des fûts, tirées une fois pour toutes avec une graine fixe.
 *
 * Graine fixe et non `Math.random` : sans elle, la ruine se redessinerait à
 * chaque rechargement, et en développement à chaque re-render. C'est la même
 * règle que le semis de végétation.
 */
function columnHeights() {
  const random = seededRandom(0x51e)
  return Array.from({ length: COLUMNS }, (_, index) => {
    // Un fût sur trois est réduit à un moignon : c'est ce qui casse le cercle.
    const stump = index % 3 === 0
    return stump ? 0.55 + random() * 0.5 : 1.9 + random() * 1.6
  })
}

const HEIGHTS = columnHeights()
const angleOf = (index: number) => (index / COLUMNS) * Math.PI * 2

/**
 * Cotes d'empilement, nommées plutôt que recalculées à chaque ligne.
 *
 * Elles l'étaient, et deux pièces flottaient : les socles des fûts à 18 cm
 * au-dessus du dallage, le chapiteau de l'autel à 22 cm au-dessus de lui. Une
 * arithmétique répétée de proche en proche finit toujours par dériver ; des
 * sommets nommés se vérifient d'un coup d'œil.
 */
const FLOOR_TOP = 0.3
const PLINTH_TOP = 0.5
const ALTAR_TOP = 0.9
/** Hauteur à laquelle démarre un fût, enfoncée dans son socle. */
const COLUMN_FOOT = PLINTH_TOP - Z_FIGHT_LIFT

function buildRuins() {
  const pale: BufferGeometry[] = []
  const dark: BufferGeometry[] = []
  const glyph: BufferGeometry[] = []

  // Dallage : un disque large et une assise centrale, tous deux à peine
  // épais — une ruine est d'abord un sol qui affleure.
  pale.push(cyl(FLOOR_R, FLOOR_R + 0.2, FLOOR_TOP, 0, 0, 0, 12))
  dark.push(cyl(2.6, 2.7, 0.18, 0, FLOOR_TOP, 0, 12))

  HEIGHTS.forEach((height, index) => {
    const angle = angleOf(index)
    const x = Math.cos(angle) * RING_R
    const z = Math.sin(angle) * RING_R
    // Le socle descend sous le dallage plutôt que de se poser dessus : il
    // n'existe alors ni jour ni faces coplanaires entre les deux.
    const plinthH = PLINTH_TOP - FLOOR_TOP + Z_FIGHT_LIFT
    dark.push(box(1.05, plinthH, 1.05, x, PLINTH_TOP - plinthH / 2, z))
    pale.push(cyl(COLUMN_R * 0.9, COLUMN_R, height, x, COLUMN_FOOT, z))
    // Les fûts encore hauts gardent leur chapiteau ; les moignons l'ont perdu.
    if (height > 1.5) {
      dark.push(box(1, 0.22, 1, x, COLUMN_FOOT + height + 0.11 - Z_FIGHT_LIFT, z))
    }
  })

  // Un linteau tient encore entre deux fûts voisins : c'est lui qui dit que le
  // cercle était couvert. Sans cette pièce, on lit un alignement de bornes.
  const a = angleOf(1)
  const b = angleOf(2)
  const midX = ((Math.cos(a) + Math.cos(b)) / 2) * RING_R
  const midZ = ((Math.sin(a) + Math.sin(b)) / 2) * RING_R
  // Longueur ajustée à la corde entre deux fûts voisins, plus leurs rayons :
  // écrite en dur, elle dépasserait dès qu'on touche à `RING_R`.
  const span = 2 * RING_R * Math.sin(Math.PI / COLUMNS) + COLUMN_R * 2
  const lintel = box(0.75, 0.4, span, 0, 0, 0)
  lintel.rotateY(-(a + b) / 2)
  lintel.translate(midX, COLUMN_FOOT + Math.min(HEIGHTS[1], HEIGHTS[2]) + 0.32, midZ)
  dark.push(lintel)

  // Fût couché, à l'extérieur du cercle.
  const fallen = cyl(COLUMN_R * 0.9, COLUMN_R, 3.1, 0, 0, 0)
  fallen.rotateZ(Math.PI / 2)
  fallen.rotateY(0.7)
  fallen.translate(-2.2, COLUMN_R + 0.3, 2.6)
  pale.push(fallen)

  // Autel fendu au centre, et la fente qui luit. La dalle de couverture coiffe
  // l'autel au lieu de flotter au-dessus, et la fente reste dans son flanc.
  pale.push(box(2, 0.85, 2, 0, ALTAR_TOP - 0.425, 0))
  const capH = 0.2 + Z_FIGHT_LIFT
  dark.push(box(2.3, capH, 2.3, 0, ALTAR_TOP + 0.2 - capH / 2, 0))
  glyph.push(box(0.16, 0.6, 1.7, 0.15, ALTAR_TOP - 0.32, 0))

  return {
    pale: mergeGeometries(pale)!,
    dark: mergeGeometries(dark)!,
    glyph: mergeGeometries(glyph)!,
  }
}

const geometry = buildRuins()

export function Ruins() {
  return (
    <group position={[RUINS.x, RUINS.altitude, RUINS.z]} rotation={[0, RUINS.yaw, 0]}>
      {/* Pierre plus blonde que celle du continent : c'est du calcaire d'île,
          accordé au sable qui l'entoure. */}
      <mesh geometry={geometry.pale} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color="#cdbf9c" />
      </mesh>
      <mesh geometry={geometry.dark} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color="#8a7a5c" />
      </mesh>
      <mesh geometry={geometry.glyph}>
        <meshToonMaterial
          gradientMap={toonGradient}
          color="#ffe9bd"
          emissive="#ffb43c"
          emissiveIntensity={1.25}
        />
      </mesh>

      <RigidBody type="fixed" colliders={false}>
        {HEIGHTS.map((height, index) => {
          const angle = angleOf(index)
          return (
            <CylinderCollider
              key={`column-${index}`}
              args={[height / 2, COLUMN_R]}
              position={[
                Math.cos(angle) * RING_R,
                COLUMN_FOOT + height / 2,
                Math.sin(angle) * RING_R,
              ]}
            />
          )
        })}
        {/* L'autel bloque au rayon qu'on lui voit ; le dallage, lui, se
            traverse — c'est un sol, pas un obstacle. */}
        <CylinderCollider args={[0.6, 1.45]} position={[0, 0.9, 0]} />
      </RigidBody>

      <InteractionMarker landmarkId={RUINS.id} position={[0, 0, RUINS.markerZ]} />
    </group>
  )
}
