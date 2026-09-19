import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { CORE_Y } from '../../config/skyIsland'
import { LynelModel } from './LynelModel'
import { useEnemyMaterials } from './models'

/**
 * Le Lynel posé au centre de l'arène, sans IA ni collider, tournant lentement.
 *
 * Provisoire, et il a une raison d'exister le temps d'une tâche : c'est le seul
 * moyen de juger le modèle sous le **vrai** rendu — le cel-shading à trois
 * marches, le bloom à 0,82, la brume de l'île, la lumière du ciel étoilé. Une
 * maquette en page isolée ne dit rien de ce que le post-traitement fera de l'or
 * émissif ni du violet des yeux.
 */
export function LynelPreview() {
  const spin = useRef<Group>(null)
  const materials = useEnemyMaterials('lynel')

  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.25
  })

  // CORE_Y : l'altitude du plateau de la rotonde.
  return (
    <group ref={spin} position={[0, CORE_Y, 0]}>
      <LynelModel materials={materials} />
    </group>
  )
}
