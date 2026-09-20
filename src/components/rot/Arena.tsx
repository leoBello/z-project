import { useMemo } from 'react'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import { CylinderGeometry, RingGeometry, TorusGeometry } from 'three'
import { ARENA_R, ARENA_RING, GROUND_Y } from '../../config/rotMarsh'
import { faceted } from '../environment/faceted'
import { Z_FIGHT_LIFT } from '../environment/solids'
import type { MarshMaterials } from './materials'

/**
 * Le bassin de racines au pied de l'Arbre blafard — l'arène.
 *
 * Rayon 12, soit un demi de plus que la rotonde du Lynel (11,5). La différence
 * est faible et voulue : le joueur y a déjà livré quatre combats, il connaît
 * cette distance dans son corps. On ne la lui réapprend pas, on la remplit
 * autrement.
 *
 * **Elle n'a pas de herse, et n'en aura pas.** La rotonde avait deux travées
 * écroulées à fermer pendant le combat ; ici les contreforts ferment le cercle
 * d'eux-mêmes. Le lieu enferme, comme le plateau du sommet — et un lieu qui
 * enferme est toujours meilleur qu'une barrière qui apparaît, parce qu'il n'a
 * jamais l'air d'une règle de jeu vidéo.
 *
 * L'anneau d'eau à la lèvre est la **règle graduée** du combat, ce qu'étaient
 * les trois anneaux d'or du dallage de la rotonde. Avec une différence de
 * taille : celui-ci coûte quelque chose. Y reculer fait monter la pourriture, et
 * un repère de distance qui se paie est un repère qu'on regarde vraiment.
 */

/** Les contreforts qui ferment le cercle. Onze, à un cap décalé de l'axe d'arrivée. */
const BUTTRESSES = 11

export function Arena({ materials }: { materials: MarshMaterials }) {
  const { floor, lip, ring, buttress } = useMemo(
    () => ({
      floor: new CylinderGeometry(ARENA_R, ARENA_R + 0.6, 0.7, 40),
      lip: new TorusGeometry(ARENA_R, 0.5, 6, 44),
      ring: new RingGeometry(ARENA_RING[0], ARENA_RING[1], 44),
      buttress: faceted(new CylinderGeometry(0.5, 1.5, 1, 7)),
    }),
    [],
  )

  return (
    <group position={[0, GROUND_Y, 0]}>
      {/*
        Le dallage, et son collider.

        Sa surface est à 0,45, soit **quinze centimètres au-dessus de la nappe**
        (0,30) : c'est ce qui rend le bassin sec, donc ce qui fait que la
        pourriture cesse de monter dès qu'on y met le pied. Le joueur n'a rien à
        lire pour le comprendre — il voit l'eau s'arrêter.

        Le collider est **cylindrique**, et il a fallu s'y reprendre. La première
        version était une boîte de 12,6 de demi-côté, ce qui est le collider le
        moins cher qui existe — mais une boîte circonscrite à un disque déborde
        de 41 % dans les diagonales : le joueur marchait sur de l'air jusqu'à
        17,8 du centre, dans quatre coins invisibles. Sur une arène où l'on
        recule beaucoup en regardant ailleurs, c'est une chute garantie hors du
        monde visible.
      */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CylinderCollider args={[0.35, ARENA_R + 0.6]} position={[0, 0.1, 0]} />
      </RigidBody>
      <mesh geometry={floor} material={materials.root} position={[0, 0.1, 0]} receiveShadow />

      {/* La lèvre : un tore posé à plat, qui cache la jonction du dallage et du
          marais — un disque sur un disque laisse toujours voir une arête. */}
      <mesh
        geometry={lip}
        material={materials.rootDark}
        position={[0, 0.4, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />

      {/* L'anneau d'eau. Relevé de `Z_FIGHT_LIFT` au-dessus du dallage, comme
          toutes les décalques du jeu : deux surfaces à la même altitude
          clignotent l'une sur l'autre selon l'angle de caméra. */}
      <mesh
        geometry={ring}
        material={materials.water}
        position={[0, 0.45 + Z_FIGHT_LIFT, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />

      {/*
        Les contreforts, penchés vers l'intérieur.

        Ils n'ont **pas** de collider, et c'est délibéré : ils sont plantés à
        12,8 du centre, donc au-delà du dallage, et le joueur qui sort du bassin
        entre dans l'eau bien avant de les toucher. Leur donner un collider aurait
        posé onze obstacles sur le bord d'une arène où l'on recule beaucoup — et
        rester coincé dans un décor pendant un vol de sarcelle est la pire mort
        qu'on puisse offrir.
      */}
      {Array.from({ length: BUTTRESSES }, (_, i) => {
        const angle = (i / BUTTRESSES) * Math.PI * 2 + 0.28
        const height = 7 + (i % 3) * 2.2
        return (
          <mesh
            key={i}
            geometry={buttress}
            material={materials.rootDark}
            position={[Math.sin(angle) * 12.8, height / 2, Math.cos(angle) * 12.8]}
            rotation={[Math.cos(angle) * -0.22, 0, Math.sin(angle) * 0.22]}
            scale={[1, height, 1]}
            castShadow
          />
        )
      })}
    </group>
  )
}
