import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { DoubleSide, type Mesh, type MeshBasicMaterial } from 'three'
import {
  CORE_Y,
  ROTUNDA_PIERS,
  ROTUNDA_R,
  ROTUNDA_RUINED_BAYS,
  SKY_COLORS,
  rotundaPierAngle,
} from '../../config/skyIsland'
import { now as gameNow } from '../../state/gameClock'
import { useGameStore } from '../../store/useGameStore'

/*
  Les deux travées écroulées de la rotonde sont ses entrées — et ses sorties.

  Les laisser ouvertes pendant le combat, c'est pouvoir fuir se soigner et
  revenir : un combat qu'on ne peut pas perdre mais qu'on peut rater longtemps,
  ce qui est la pire des deux choses. Les fermer, c'est un boss de jeu vidéo, et
  c'est assumé.

  Le voile est le violet du cristal, celui du portail. Le joueur a déjà appris
  que cette couleur sépare deux endroits : on ne lui enseigne rien de neuf, on
  réutilise ce qu'il sait.
*/

/** Hauteur du voile. Au-dessus de l'arcade, donc infranchissable au saut. */
const GATE_H = 6
/** Largeur d'une travée, mesurée sur la corde entre deux piliers voisins. */
const GATE_W = 2 * ROTUNDA_R * Math.sin(Math.PI / ROTUNDA_PIERS)
/** Demi-épaisseur du collider. Assez mince pour ne pas mordre sur le dallage. */
const GATE_T = 0.3

export function ArenaGate() {
  const fighting = useGameStore((state) => state.bossState === 'fighting')
  const veils = useRef<(Mesh | null)[]>([])

  useFrame(() => {
    // Ondulation lente de l'opacité : un voile parfaitement stable se lit comme
    // une vitre, et une vitre n'a pas l'air de pouvoir s'ouvrir.
    const pulse = 0.28 + 0.1 * Math.sin(gameNow() * 0.003)
    for (const veil of veils.current) {
      if (veil) (veil.material as MeshBasicMaterial).opacity = pulse
    }
  })

  if (!fighting) return null

  return (
    <>
      {ROTUNDA_RUINED_BAYS.map((bay, index) => {
        /*
          Le milieu de la travée, et non l'angle du pilier : `ROTUNDA_RUINED_BAYS`
          désigne les piliers manquants, donc la brèche s'étend de part et d'autre
          de l'endroit où ce pilier se tenait. Le voile se pose exactement là.

          `rotundaPierAngle` porte le déphasage de 0,31 rad de la colonnade ;
          recalculer l'angle à la main l'oublierait, et les voiles tomberaient
          entre deux piliers debout.
        */
        const angle = rotundaPierAngle(bay)
        const x = Math.sin(angle) * ROTUNDA_R
        const z = Math.cos(angle) * ROTUNDA_R

        return (
          <group key={bay} position={[x, CORE_Y, z]} rotation={[0, angle, 0]}>
            <mesh
              // Indexé, et non poussé dans un tableau : un callback de ref est
              // rappelé à chaque rendu, et un `push` ferait grossir la liste sans
              // fin jusqu'à ce que l'animation coûte plus cher que la scène.
              ref={(mesh) => {
                veils.current[index] = mesh
              }}
              position={[0, GATE_H / 2, 0]}
            >
              <planeGeometry args={[GATE_W, GATE_H]} />
              <meshBasicMaterial
                color={SKY_COLORS.crystal}
                transparent
                opacity={0.3}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {/* Un corps fixe et non un capteur : le voile doit arrêter le
                joueur, pas signaler qu'il le traverse. */}
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider
                args={[GATE_W / 2, GATE_H / 2, GATE_T]}
                position={[0, GATE_H / 2, 0]}
              />
            </RigidBody>
          </group>
        )
      })}
    </>
  )
}
