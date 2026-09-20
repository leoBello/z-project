import { useMemo } from 'react'
import { BoxGeometry, CylinderGeometry, TorusGeometry } from 'three'
import { ARENA_R } from '../../config/rotMarsh'
import { faceted } from '../environment/faceted'
import type { MarshMaterials } from './materials'

/**
 * Ce qu'Elphaël était avant de pourrir.
 *
 * **C'est la pièce qui manquait.** Le premier jet n'avait que de la vase, de
 * l'eau et du bois mort — trois teintes de pourriture et aucune de ce qui a
 * pourri. Le retour de la première partie l'a dit en une phrase : « le biome est
 * sombre mais beau, là il y a beaucoup trop de marécage ». La pourriture n'est
 * belle que si elle mange quelque chose de beau ; il n'y avait rien à manger.
 *
 * Trois motifs, et trois seulement : une arche brisée, une colonne tronquée, un
 * pan de mur. Ils se répètent à des échelles et des caps différents, ce qui
 * suffit à peupler cent cinquante unités — un quatrième motif n'aurait rien
 * ajouté qu'on remarque, et chacun coûte une géométrie de plus.
 *
 * Ils sont **posés, pas semés au hasard** : une spirale ouverte comme les bancs
 * de vase, donc identique d'une visite à l'autre. Une ville qui se réarrange
 * dans le dos du joueur n'est pas une ville.
 *
 * Aucun collider. Ce sont des silhouettes, plantées à l'écart de la chaussée et
 * du bassin ; leur donner des colliders aurait ajouté quarante corps à la
 * simulation pour des objets qu'on ne touche jamais.
 */

interface Ruin {
  kind: 'arch' | 'column' | 'wall'
  position: [number, number, number]
  yaw: number
  scale: number
  tilt: number
}

const RUINS: Ruin[] = Array.from({ length: 34 }, (_, i) => {
  const angle = (i / 34) * Math.PI * 2 * 3.1 + 0.9
  const radius = ARENA_R + 8 + ((i * 23) % 76)
  return {
    kind: (['arch', 'column', 'wall'] as const)[i % 3],
    position: [Math.sin(angle) * radius, 0, Math.cos(angle) * radius],
    yaw: angle * 1.7,
    scale: 0.8 + ((i * 7) % 11) / 9,
    // Une ruine parfaitement d'aplomb n'est pas une ruine, c'est un bâtiment.
    // L'inclinaison alterne de sens pour qu'elles ne penchent pas toutes du
    // même côté, ce qui se lirait comme une erreur de repère et non comme un
    // affaissement.
    tilt: (((i * 13) % 9) - 4) * 0.035,
  }
})

export function Ruins({ materials }: { materials: MarshMaterials }) {
  const geometry = useMemo(
    () => ({
      // L'arche : un demi-tore, donc un arc franc. C'est la forme la plus
      // reconnaissable d'une architecture à cent unités de distance.
      arch: new TorusGeometry(3.2, 0.55, 5, 14, Math.PI),
      pillar: faceted(new CylinderGeometry(0.62, 0.78, 1, 8)),
      capital: faceted(new BoxGeometry(1.5, 0.38, 1.5)),
      wall: faceted(new BoxGeometry(5.4, 1, 0.7)),
      rubble: faceted(new BoxGeometry(1.1, 0.5, 0.9)),
    }),
    [],
  )

  return (
    <>
      {RUINS.map((ruin, i) => (
        <group
          key={i}
          position={ruin.position}
          rotation={[ruin.tilt, ruin.yaw, ruin.tilt * 0.6]}
          scale={ruin.scale}
        >
          {ruin.kind === 'arch' && (
            <>
              <mesh geometry={geometry.arch} material={materials.stone} position={[0, 3.4, 0]} castShadow />
              {[-1, 1].map((side) => (
                <mesh
                  key={side}
                  geometry={geometry.pillar}
                  material={materials.stoneWorn}
                  position={[side * 3.2, 1.7, 0]}
                  scale={[1, 3.4, 1]}
                  castShadow
                />
              ))}
            </>
          )}

          {ruin.kind === 'column' && (
            <>
              {/* Tronquée, jamais entière : c'est la cassure qui dit la ruine.
                  Le chapiteau tombé à son pied dit d'où vient le morceau. */}
              <mesh
                geometry={geometry.pillar}
                material={materials.stone}
                position={[0, 2.6, 0]}
                scale={[1, 5.2, 1]}
                castShadow
              />
              <mesh
                geometry={geometry.capital}
                material={materials.stoneWorn}
                position={[1.4, 0.19, 0.6]}
                rotation={[0.3, 0.8, 0.2]}
              />
              <mesh
                geometry={geometry.rubble}
                material={materials.stoneDark}
                position={[-1.1, 0.25, -0.5]}
                rotation={[0, 1.2, 0.15]}
              />
            </>
          )}

          {ruin.kind === 'wall' && (
            <>
              <mesh
                geometry={geometry.wall}
                material={materials.stoneWorn}
                position={[0, 1.2, 0]}
                scale={[1, 2.4, 1]}
                castShadow
              />
              {/* Une brèche : le pan de mur n'est jamais continu. Deux blocs
                  tombés devant suffisent à faire lire l'effondrement. */}
              <mesh
                geometry={geometry.rubble}
                material={materials.stoneDark}
                position={[2.2, 0.25, 0.9]}
                rotation={[0.1, 0.5, 0.1]}
                scale={1.4}
              />
              <mesh
                geometry={geometry.rubble}
                material={materials.stone}
                position={[-1.8, 0.2, 1.3]}
                rotation={[0.05, -0.7, -0.08]}
              />
            </>
          )}
        </group>
      ))}
    </>
  )
}
