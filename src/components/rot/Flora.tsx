import { useMemo } from 'react'
import { ConeGeometry, CylinderGeometry, SphereGeometry } from 'three'
import { ARENA_R } from '../../config/rotMarsh'
import { faceted } from '../environment/faceted'
import type { MarshMaterials } from './materials'

/**
 * Ce qui pousse dans le marais : des arbres morts, et des fleurs de pourriture.
 *
 * Deux semis, tirés une fois au chargement du module et jamais re-tirés. Comme
 * les bancs de vase, ils sont déroulés depuis une spirale et non depuis
 * `Math.random` : le paysage doit être le même d'une visite à l'autre. Un marais
 * qui se réarrange dans le dos du joueur n'est pas un lieu, c'est un écran de
 * veille.
 *
 * Aucun des deux ne porte de collider. Les arbres morts sont des silhouettes
 * lointaines, plantées au-delà du chemin ; les fleurs font quarante centimètres
 * et le joueur passe au travers. Le seul décor de cette carte qui arrête
 * quelqu'un est l'arbre lui-même.
 *
 * **Les fleurs évitent l'arène.** Elles sont refusées en deçà du rayon du
 * bassin, et pas seulement pour le rangement : le combat s'y joue sur des
 * distances lues au sol, et une fleur au milieu d'un repère est une information
 * fausse. C'est la même raison qui garde le dallage de la rotonde vide.
 */

const DEAD_TREES = Array.from({ length: 16 }, (_, i) => {
  const angle = (i / 16) * Math.PI * 2 * 1.7 + 1.2
  const radius = 24 + ((i * 29) % 58)
  return {
    position: [Math.sin(angle) * radius, 0, Math.cos(angle) * radius] as const,
    yaw: angle * 2,
    height: 5 + (i % 4) * 2.5,
  }
})

const BLOOMS = Array.from({ length: 26 }, (_, i) => {
  const angle = (i / 26) * Math.PI * 2 * 3.3
  const radius = 14 + ((i * 17) % 64)
  return {
    position: [Math.sin(angle) * radius, 0, Math.cos(angle) * radius] as const,
    radius,
  }
}).filter((bloom) => bloom.radius > ARENA_R + 3)

export function Flora({ materials }: { materials: MarshMaterials }) {
  const geometry = useMemo(
    () => ({
      trunk: faceted(new CylinderGeometry(0.22, 0.6, 1, 6)),
      branch: faceted(new CylinderGeometry(0.06, 0.18, 1, 5)),
      petals: faceted(new ConeGeometry(0.55, 0.9, 6)),
      core: new SphereGeometry(0.28, 7, 6),
    }),
    [],
  )

  return (
    <>
      {DEAD_TREES.map((tree, i) => (
        <group key={i} position={tree.position} rotation={[0, tree.yaw, 0]}>
          <mesh
            geometry={geometry.trunk}
            material={materials.barkDark}
            position={[0, tree.height / 2, 0]}
            scale={[1, tree.height, 1]}
            castShadow
          />
          {/* Trois moignons, inclinés et répartis : c'est le minimum pour qu'une
              silhouette se lise comme un arbre et non comme un piquet. */}
          {[0, 1, 2].map((b) => (
            <mesh
              key={b}
              geometry={geometry.branch}
              material={materials.barkDark}
              position={[0, tree.height * 0.82, 0]}
              rotation={[0.7, (b / 3) * Math.PI * 2, 0]}
              scale={[1, tree.height * 0.5, 1]}
            />
          ))}
        </group>
      ))}

      {BLOOMS.map((bloom, i) => (
        <group key={i} position={bloom.position}>
          <mesh geometry={geometry.petals} material={materials.bloom} position={[0, 0.45, 0]} />
          {/* Le cœur, non éclairé, franchement au-dessus du seuil de bloom : à
              cinquante unités il ne reste que ce point-là, et c'est lui qui
              peuple le marais quand la brume a mangé tout le reste. */}
          <mesh
            geometry={geometry.core}
            material={materials.spore}
            position={[0, 0.95, 0]}
            scale={[1, 0.6, 1]}
          />
        </group>
      ))}
    </>
  )
}
