import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { type BufferGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { STATUE } from '../../config/landmarks'
import { toonGradient } from '../models/toonGradient'
import { InteractionMarker } from './InteractionMarker'
import { box, cyl } from './solids'

/**
 * Idole des Terres Arides — le parcours.
 *
 * Une figure trapue, tête surdimensionnée, un seul bras, penchée de quelques
 * degrés. Chacun de ces traits sert la même intention : « étrange » ne
 * s'obtient pas en ajoutant du détail mais en cassant les attentes. Une statue
 * symétrique et d'aplomb se lit comme une décoration ; celle-ci se lit comme
 * quelque chose que personne n'est venu redresser depuis longtemps.
 *
 * L'inclinaison est portée par le `<group>` et non cuite dans la géométrie :
 * les colliders en héritent, donc le joueur bute exactement là où il voit la
 * pierre.
 */

const BASE_H = 0.4
const BODY_H = 3.2
const BODY_R_BOTTOM = 1.4
const BODY_R_TOP = 1
const HEAD_H = 1.5
/** Inclinaison de l'idole, en radians. Trois degrés suffisent à faire douter. */
const LEAN = 0.055

const BODY_Y = BASE_H + 0.3
/**
 * Base de la tête, **sous** le sommet des épaules.
 *
 * Elle était 2,5 cm au-dessus : un jour fin faisait le tour du cou et la tête
 * paraissait posée en lévitation. Les pièces d'un empilement doivent toujours
 * se chevaucher, jamais s'effleurer.
 */
const HEAD_Y = BODY_Y + BODY_H - 0.2

function buildStatue() {
  const pale: BufferGeometry[] = []
  const dark: BufferGeometry[] = []
  const glyph: BufferGeometry[] = []

  // Socle : un disque large et une assise fendue. Sept faces, pas huit — un
  // octogone se lit comme un cylindre régulier, un heptagone comme une pierre.
  dark.push(cyl(2.2, 2.35, BASE_H, 0, 0, 0, 7))
  pale.push(cyl(1.75, 1.95, 0.3, 0, BASE_H, 0, 7))

  pale.push(cyl(BODY_R_TOP, BODY_R_BOTTOM, BODY_H, 0, BODY_Y, 0, 7))
  // Ceinture gravée, à mi-corps : elle donne l'échelle du personnage.
  dark.push(cyl(BODY_R_TOP + 0.5, BODY_R_TOP + 0.55, 0.3, 0, BODY_Y + 1.15, 0, 7))

  // Épaules, puis une tête franchement trop grosse pour le corps.
  dark.push(box(2.5, 0.45, 1.15, 0, BODY_Y + BODY_H - 0.1, 0))
  pale.push(box(1.6, HEAD_H, 1.4, 0, HEAD_Y + HEAD_H / 2, 0))
  dark.push(box(1.75, 0.28, 1.55, 0, HEAD_Y + HEAD_H, 0))

  // Un seul œil, creusé et allumé. L'asymétrie est le geste central du modèle.
  dark.push(box(0.62, 0.36, 0.14, -0.28, HEAD_Y + 0.9, 0.7))
  glyph.push(box(0.44, 0.22, 0.1, -0.28, HEAD_Y + 0.9, 0.76))
  // À la place du second, une simple entaille : la pierre s'est brisée là.
  dark.push(box(0.5, 0.14, 0.12, 0.36, HEAD_Y + 0.86, 0.7))

  // Bras unique, plaqué contre le flanc. L'autre manque, et on ne l'explique pas.
  pale.push(box(0.55, 1.9, 0.55, 1.15, BODY_Y + 1.2, 0.1))

  // Éclat tombé au pied : ce qui reste du bras absent.
  dark.push(box(0.7, 0.35, 0.5, 2.05, 0.18, 1.4))

  return {
    pale: mergeGeometries(pale)!,
    dark: mergeGeometries(dark)!,
    glyph: mergeGeometries(glyph)!,
  }
}

const geometry = buildStatue()

export function Statue() {
  return (
    <group position={[STATUE.x, STATUE.altitude, STATUE.z]} rotation={[0, STATUE.yaw, 0]}>
      {/* L'inclinaison vit sur un groupe intérieur : le marqueur, lui, doit
          rester d'aplomb sur le sol. */}
      <group rotation={[LEAN, 0, LEAN * 0.6]}>
        <mesh geometry={geometry.pale} castShadow receiveShadow>
          <meshToonMaterial gradientMap={toonGradient} color="#b5a184" />
        </mesh>
        <mesh geometry={geometry.dark} castShadow receiveShadow>
          <meshToonMaterial gradientMap={toonGradient} color="#71604a" />
        </mesh>
        <mesh geometry={geometry.glyph}>
          <meshToonMaterial
            gradientMap={toonGradient}
            color="#ffe9bd"
            emissive="#ffb43c"
            emissiveIntensity={1.3}
          />
        </mesh>

        <RigidBody type="fixed" colliders={false}>
          <CylinderCollider args={[BASE_H / 2 + 0.15, 2.3]} position={[0, BASE_H / 2, 0]} />
          <CylinderCollider
            args={[(BODY_H + HEAD_H) / 2, BODY_R_BOTTOM]}
            position={[0, BODY_Y + (BODY_H + HEAD_H) / 2, 0]}
          />
        </RigidBody>
      </group>

      <InteractionMarker landmarkId={STATUE.id} position={[0, 0, STATUE.markerZ]} />
    </group>
  )
}
