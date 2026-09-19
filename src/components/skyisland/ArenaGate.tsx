import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { DoubleSide, type Mesh, type MeshBasicMaterial } from 'three'
import {
  CORE_Y,
  ROTUNDA_PIERS,
  ROTUNDA_R,
  SKY_COLORS,
  rotundaPierAngle,
} from '../../config/skyIsland'
import { now as gameNow } from '../../state/gameClock'
import { useGameStore } from '../../store/useGameStore'

/*
  L'arène se referme pendant le combat.

  Laisser sortir, c'est pouvoir fuir se soigner et revenir : un combat qu'on ne
  peut pas perdre mais qu'on peut rater longtemps, ce qui est la pire des deux
  choses. Les fermer, c'est un boss de jeu vidéo, et c'est assumé.

  **Les dix travées, et pas seulement les deux écroulées.** C'était l'erreur du
  premier jet, et elle venait d'une lecture trop rapide de `Ruins.tsx` : les
  travées écroulées sont les deux *entrées lisibles*, celles par lesquelles on
  arrive — mais la colonnade n'a jamais eu de mur. Chaque pilier porte un
  collider d'une unité et demie sur un cercle de 11,5 ; entre deux piliers il
  reste près de six unités de vide, et l'arche laisse 5,2 de passage au-dessus.
  Deux voiles sur dix fermaient donc un cinquième du pourtour, et on sortait par
  n'importe laquelle des huit autres.

  Le voile est le violet du cristal, celui du portail. Le joueur a déjà appris
  que cette couleur sépare deux endroits : on ne lui enseigne rien de neuf, on
  réutilise ce qu'il sait.
*/

/** Hauteur du voile. Au-dessus de l'arcade, donc infranchissable au saut. */
const GATE_H = 6
/**
 * Largeur d'un voile : la corde entre deux piliers voisins, plus un peu.
 *
 * La marge ferme les deux flancs du moignon quand le pilier voisin est l'un des
 * deux écroulés — sans elle, il restait près de trois unités de passage de
 * chaque côté de la souche.
 */
const GATE_W = 2 * ROTUNDA_R * Math.sin(Math.PI / ROTUNDA_PIERS) + 1.2
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
      {Array.from({ length: ROTUNDA_PIERS }, (_, bay) => {
        /*
          Le **milieu** de chaque travée, c'est-à-dire entre le pilier `bay` et le
          suivant — et non l'angle d'un pilier, qui est justement l'endroit que la
          pierre occupe déjà.

          `rotundaPierAngle` porte le déphasage de 0,31 rad de la colonnade ;
          recalculer l'angle à la main l'oublierait, et les voiles tomberaient sur
          les piliers au lieu des vides.
        */
        const angle = (rotundaPierAngle(bay) + rotundaPierAngle(bay + 1)) / 2
        const x = Math.sin(angle) * ROTUNDA_R
        const z = Math.cos(angle) * ROTUNDA_R

        return (
          <group key={bay} position={[x, CORE_Y, z]} rotation={[0, angle, 0]}>
            <mesh
              // Indexé, et non poussé dans un tableau : un callback de ref est
              // rappelé à chaque rendu, et un `push` ferait grossir la liste sans
              // fin jusqu'à ce que l'animation coûte plus cher que la scène.
              ref={(mesh) => {
                veils.current[bay] = mesh
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
