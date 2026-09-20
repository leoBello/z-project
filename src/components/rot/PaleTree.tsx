import { useMemo } from 'react'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import {
  CatmullRomCurve3,
  CylinderGeometry,
  IcosahedronGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { TREE } from '../../config/rotMarsh'
import { faceted } from '../environment/faceted'
import type { MarshMaterials } from './materials'

/**
 * L'Arbre blafard — cent vingt unités, mourant mais pas mort.
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
 *
 * **Il a maintenant un feuillage, et c'est la moitié de la réponse au « sombre
 * mais beau ».** La première version était un tronc nu : cent vingt unités de
 * piquet gris, ce qui donnait un pylône et non un arbre sacré. Les grappes d'or
 * pâle qui le coiffent sont la **seule source de lumière du paysage** — sous un
 * ciel sans soleil, dans une brume qui sature à 180, c'est tout ce qui reste
 * au-dessus de la tête du joueur, et c'est ce qui donne envie d'avancer.
 *
 * Elles sont clairsemées et irrégulières : un arbre également feuillu serait un
 * arbre en bonne santé, et celui-ci est en train de mourir. C'est l'écart entre
 * les branches chargées et les branches nues qui raconte ça, pas la couleur.
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
      return {
        geometry: new TubeGeometry(
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
        ),
        /*
          Les grappes de feuilles, sur les deux tiers des branches seulement.

          `i % 3 !== 1` laisse une branche sur trois nue. C'est cet écart qui
          fait lire un arbre qui meurt plutôt qu'un arbre en bonne santé — un
          feuillage régulier aurait annulé tout ce que le reste du décor
          raconte, quelle qu'en soit la couleur.
        */
        clusters:
          i % 3 === 1
            ? []
            : ([
                [sin * 18, height + 5.5, cos * 18, 5.5],
                [sin * 27, height + 1.5, cos * 27, 4.2],
                [sin * 33, height - 8, cos * 33, 3.4],
              ] as const),
      }
    })

    return { trunk, buttress, branches }
  }, [])

  const leaf = useMemo(() => faceted(new IcosahedronGeometry(1, 0)), [])

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

      {branches.map((branch, i) => (
        <group key={i}>
          <mesh geometry={branch.geometry} material={materials.bark} />
          {/* Les grappes : un icosaèdre facetté, aplati et tourné au hasard de
              son indice. À cette distance, c'est une masse lumineuse — la
              silhouette exacte d'une feuille n'existe pas à cent unités. */}
          {branch.clusters.map(([x, y, z, size], c) => (
            <mesh
              key={c}
              geometry={leaf}
              material={materials.foliage}
              position={[x, y, z]}
              rotation={[c * 0.7, i * 0.9, c * 0.4]}
              scale={[size, size * 0.62, size]}
            />
          ))}
        </group>
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
