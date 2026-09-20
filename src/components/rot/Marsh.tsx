import { useMemo } from 'react'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { CircleGeometry, SphereGeometry } from 'three'
import { GROUND_Y, MARSH_R, WATER_Y } from '../../config/rotMarsh'
import { faceted } from '../environment/faceted'
import type { MarshMaterials } from './materials'

/**
 * La nappe de pourriture, et les bancs de vase qui en sortent.
 *
 * **Le sol est un disque, et c'est la décision structurante de cette carte.**
 * Le continent est un champ de hauteurs sur grille carrée avec son collider de
 * trimesh ; l'île est une surface radiale avec un dessous. Ni l'un ni l'autre
 * n'était nécessaire ici : un marais est une nappe. Le collider se réduit donc à
 * **une boîte plate**, ce qui est le collider le moins cher qui existe, et il
 * n'y a ni échantillonneur de hauteur à écrire ni trimesh à construire.
 *
 * Ce choix a un prix, et il vaut d'être écrit : il n'y a rien à escalader ici.
 * Le saut ne sert qu'à franchir un parapet de la chaussée ou à y remonter. C'est
 * assumé — ce n'est pas une carte d'exploration, c'est un chemin vers un
 * combat.
 *
 * L'eau est **au-dessus** du sol de trente centimètres, et c'est tout ce qui la
 * distingue : le joueur marche sur le disque et l'eau lui arrive à la cheville.
 * Elle n'a pas de collider — on la traverse, c'est même son seul intérêt.
 */

/**
 * Les bancs de vase.
 *
 * **Quarante au lieu de vingt-deux, plus larges, et ils émergent.** Le premier
 * jet les posait sous la nappe : on ne voyait donc qu'une étendue rouge d'un
 * bord à l'autre du cadre, et le retour de la première partie l'a dit — « il y
 * a beaucoup trop de marécage ». Ce n'était pas la couleur qui était en cause,
 * c'était l'absence de terre.
 *
 * Ils sont hauts de `radius × 0,34` pour un centre à −0,45 : les plus gros
 * montent à plus d'une unité au-dessus de l'eau, les plus petits affleurent à
 * peine. Cette inégalité est ce qui fait un rivage plutôt qu'un archipel de
 * plateformes identiques.
 *
 * Une spirale ouverte plutôt qu'un tirage aléatoire : le semis reste le même à
 * chaque montage de la carte, donc le paysage est le même d'une visite à
 * l'autre. Un marais qui se réarrange dans le dos du joueur n'est pas un lieu.
 */
const BANKS = Array.from({ length: 40 }, (_, i) => {
  const angle = (i / 40) * Math.PI * 2 * 3.7 + 0.7
  const radius = 16 + ((i * 31) % 74)
  return {
    position: [Math.sin(angle) * radius, -0.45 - (i % 3) * 0.15, Math.cos(angle) * radius] as const,
    rotation: [0, angle, 0] as const,
    scale: [1 + (i % 4) * 0.34, 0.34, 1 + (i % 3) * 0.46] as const,
    radius: 3.6 + (i % 7) * 1.4,
  }
})

export function Marsh({ materials }: { materials: MarshMaterials }) {
  const water = useMemo(() => new CircleGeometry(MARSH_R, 48), [])
  const ground = useMemo(() => new CircleGeometry(MARSH_R, 48), [])
  const bank = useMemo(() => faceted(new SphereGeometry(1, 9, 6)), [])

  return (
    <>
      {/*
        Le sol et son collider.

        La boîte est volontairement très épaisse (20 d'épaisseur pour une
        surface à y=0) : un collider mince laisse passer un corps rapide entre
        deux pas de simulation, et le joueur descend des racines à trois unités
        de haut. Avec vingt unités sous les pieds, aucune vitesse atteignable
        dans ce jeu ne le traverse.
      */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CuboidCollider args={[MARSH_R, 10, MARSH_R]} position={[0, GROUND_Y - 10, 0]} />
      </RigidBody>
      <mesh
        geometry={ground}
        material={materials.mud}
        position={[0, GROUND_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      />

      {/* La nappe, sans collider : on la traverse, et c'est son seul intérêt. */}
      <mesh
        geometry={water}
        material={materials.water}
        position={[0, WATER_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />

      {/*
        Les bancs de vase, qui **émergent**.

        Ils donnent au marais ce qui lui manquait le plus : de la terre. Un
        joueur peut s'y réfugier, et c'est désormais voulu — la contrainte de la
        carte n'est plus « tout est dangereux », elle est « il faut regarder où
        l'on met les pieds », ce qui est un jeu et non une punition.

        Ils reçoivent les ombres et n'en portent pas : ce sont des masses de
        vase basses et molles, et une ombre projetée par une flaque de boue sur
        une autre flaque de boue ne se voit pas — elle coûte seulement une passe
        de plus dans la carte d'ombres.
      */}
      {BANKS.map((spot, i) => (
        <mesh
          key={i}
          geometry={bank}
          material={materials.mud}
          position={spot.position}
          rotation={spot.rotation}
          scale={[spot.radius * spot.scale[0], spot.radius * spot.scale[1], spot.radius * spot.scale[2]]}
          receiveShadow
        />
      ))}
    </>
  )
}
