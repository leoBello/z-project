import { useMemo } from 'react'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { CatmullRomCurve3, CylinderGeometry, TubeGeometry, Vector3 } from 'three'
import { TREE } from '../../config/rotMarsh'
import { faceted } from '../environment/faceted'
import type { MarshMaterials } from './materials'

/**
 * L'Arbre blafard — cent vingt unités, mort, sans une feuille.
 *
 * **Il tient lieu de boussole, et c'est sa seule fonction de jeu.** On le voit
 * du portail d'arrivée, à cent cinquante unités, et l'arène est à son pied. Il
 * n'y a donc ni flèche à afficher, ni marqueur de quête, ni dialogue
 * d'orientation à écrire : le joueur sait où aller parce qu'il n'y a qu'une
 * seule chose verticale dans le paysage. C'est le procédé le plus vieux du monde
 * et il n'a jamais eu besoin d'être remplacé.
 *
 * Il est posé à trente-quatre unités **derrière** l'arène et non dedans : un
 * tronc de neuf unités de rayon au centre du bassin aurait mangé le quart de
 * l'aire de combat, et c'est un combat où l'on court beaucoup.
 *
 * Le tronc est ouvert aux deux bouts (`openEnded`) : on ne voit jamais ni son
 * pied, masqué par les contreforts, ni sa cime, prise dans la brume. Deux
 * disques de fermeture pour rien, sur une géométrie qu'on facette ensuite.
 */

/** Neuf contreforts et neuf branches : le même semis, pour qu'ils s'alignent. */
const LIMBS = 9

export function PaleTree({ materials }: { materials: MarshMaterials }) {
  const { trunk, buttress, branches } = useMemo(() => {
    const trunk = faceted(
      new CylinderGeometry(TREE.topRadius, TREE.baseRadius, TREE.height, 12, 1, true),
    )
    const buttress = faceted(new CylinderGeometry(1.5, 4.2, 22, 7))

    const branches = Array.from({ length: LIMBS }, (_, i) => {
      const angle = (i / LIMBS) * Math.PI * 2
      const height = 62 + (i % 4) * 13
      const sin = Math.sin(angle)
      const cos = Math.cos(angle)
      /*
        Une branche morte retombe. Le quatrième point est **plus bas** que le
        troisième, et c'est tout ce qui sépare un arbre mort d'un arbre vivant à
        cette distance : une branche qui monte jusqu'à sa pointe se lit comme une
        branche qui pousse, quelle que soit sa couleur.
      */
      return new TubeGeometry(
        new CatmullRomCurve3([
          new Vector3(sin * 3.6, height, cos * 3.6),
          new Vector3(sin * 15, height + 7, cos * 15),
          new Vector3(sin * 26, height + 3, cos * 26),
          new Vector3(sin * 33, height - 9, cos * 33),
        ]),
        14,
        0.9,
        6,
        false,
      )
    })

    return { trunk, buttress, branches }
  }, [])

  return (
    <group position={[TREE.x, 0, TREE.z]}>
      <mesh
        geometry={trunk}
        material={materials.bark}
        position={[0, TREE.height / 2, 0]}
        castShadow
      />

      {Array.from({ length: LIMBS }, (_, i) => {
        const angle = (i / LIMBS) * Math.PI * 2
        return (
          <mesh
            key={i}
            geometry={buttress}
            material={materials.barkDark}
            position={[Math.sin(angle) * 7, 7, Math.cos(angle) * 7]}
            rotation={[Math.cos(angle) * 0.3, 0, -Math.sin(angle) * 0.3]}
            castShadow
          />
        )
      })}

      {branches.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={materials.bark} />
      ))}

      {/*
        Un seul cylindre de collision, sur les vingt-huit premières unités.

        Le joueur ne peut pas monter dessus, il ne peut que s'y cogner : au-delà
        de sa propre taille, la forme du collider n'a plus aucun effet observable,
        et le faire monter à cent vingt ne ferait que donner à Rapier un volume
        inutile à tester.

        Cylindrique et non une boîte : une boîte circonscrite à un tronc de 9,5
        de rayon aurait arrêté le joueur à quatre unités de l'écorce dans les
        diagonales, contre un tronc qu'il voit parfaitement rond.
      */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CylinderCollider args={[14, TREE.baseRadius]} position={[0, 14, 0]} />
      </RigidBody>
    </group>
  )
}
