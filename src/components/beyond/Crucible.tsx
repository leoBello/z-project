import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CircleGeometry, CylinderGeometry, RingGeometry, type Group } from 'three'
import { BEYOND_ARENA } from '../../config/beyond'
import { now as gameNow } from '../../state/gameClock'
import { faceted } from '../environment/faceted'
import { Z_FIGHT_LIFT } from '../environment/solids'
import type { BeyondMaterials } from './materials'

/**
 * Le Creuset — le dallage noir au centre du monde, et ce qui s'y tient.
 *
 * C'est le pendant exact du Sanctuaire, et il est écrit pour être lu comme tel :
 * un disque de pierre, un cercle de verticales, un anneau au sol. Les mêmes
 * formes, la même échelle, et **l'inverse de la palette** — basalte contre
 * pierre claire, violet contre or. Le joueur qui regarde le nord depuis le
 * Sanctuaire voit donc son reflet sombre à soixante-quatorze unités, et n'a
 * besoin de personne pour comprendre ce qu'on lui propose d'aller faire.
 *
 * Il n'a **ni collider, ni herse, ni barrière**. Le dallage est une terrasse de
 * `beyondHeight`, donc le sol le porte déjà ; et la Déchue qui l'occupe n'a pas
 * besoin qu'on ferme derrière elle — sa laisse la tient, et le joueur qui fuit
 * doit pouvoir fuir. Sur une carte où un chronomètre tourne, une arène dont on
 * ne sort pas serait une erreur qui coûte deux minutes.
 */

/** Les obélisques du pourtour : combien, à quelle distance, et leur hauteur. */
const SHARDS = 12
const SHARD_R = BEYOND_ARENA.radius + 1.6
const SHARD_H = 7

/** Hauteur de la surface dallée, à peine décollée du terrain qui la porte. */
const FLOOR_Y = BEYOND_ARENA.altitude + Z_FIGHT_LIFT

export function Crucible({ materials }: { materials: BeyondMaterials }) {
  const veins = useRef<Group>(null)

  const geometry = useMemo(
    () => ({
      floor: new CircleGeometry(BEYOND_ARENA.radius, 56).rotateX(-Math.PI / 2),
      rim: new RingGeometry(BEYOND_ARENA.radius - 1.1, BEYOND_ARENA.radius, 56).rotateX(
        -Math.PI / 2,
      ),
      /*
        L'anneau intérieur : la règle graduée du combat, comme les trois anneaux
        d'or de la rotonde et l'anneau d'eau du bassin d'Aeonia.

        Celui-ci ne coûte rien — il ne pique pas, il n'y a pas de pourriture ici.
        Il dit seulement « à partir d'ici, elle vous atteint », et c'est la
        distance de son estoc. Un repère de portée sur le sol vaut mieux que
        n'importe quel indicateur au-dessus de la tête d'un boss.
      */
      inner: new RingGeometry(5.2, 5.6, 48).rotateX(-Math.PI / 2),
      shard: faceted(new CylinderGeometry(0.1, 0.85, SHARD_H, 4)),
      vein: new RingGeometry(BEYOND_ARENA.radius - 3.4, BEYOND_ARENA.radius - 3.1, 4).rotateX(
        -Math.PI / 2,
      ),
    }),
    [],
  )

  useFrame(() => {
    // Une rotation très lente, et rien d'autre. Le Creuset est le seul lieu
    // immobile de la carte — c'est ce qui le rend menaçant — mais un décor
    // parfaitement figé finit par se lire comme une texture. Un quart de tour
    // toutes les quarante secondes suffit à dire qu'il est allumé.
    if (veins.current) veins.current.rotation.y = gameNow() / 1000 * 0.16
  })

  return (
    <group position={[BEYOND_ARENA.x, 0, BEYOND_ARENA.z]}>
      <mesh geometry={geometry.floor} material={materials.basalt} position={[0, FLOOR_Y, 0]} receiveShadow />
      <mesh
        geometry={geometry.rim}
        material={materials.violet}
        position={[0, FLOOR_Y + Z_FIGHT_LIFT, 0]}
      />
      <mesh
        geometry={geometry.inner}
        material={materials.violet}
        position={[0, FLOOR_Y + Z_FIGHT_LIFT, 0]}
      />

      {/* Le losange qui tourne : un anneau à quatre segments, donc un carré aux
          angles arrondis. Il est la seule pièce mobile du lieu. */}
      <group ref={veins} position={[0, FLOOR_Y + Z_FIGHT_LIFT * 2, 0]}>
        <mesh geometry={geometry.vein} material={materials.violet} />
      </group>

      {/*
        Les obélisques, penchés vers l'intérieur.

        Vers l'**intérieur** et non vers l'extérieur comme les monolithes du
        Sanctuaire, et c'est tout ce qui sépare un lieu qui accueille d'un lieu
        qui se referme. Le geste est le même, l'angle est opposé, et l'effet est
        inverse — c'est le genre de symétrie qui ne se remarque jamais
        consciemment et qui fait tout le travail.

        Pas de collider, pour la raison des contreforts d'Aeonia : on recule
        beaucoup en combattant ici, et rester coincé dans un décor pendant un vol
        de sarcelle est la pire mort qu'on puisse offrir.
      */}
      {Array.from({ length: SHARDS }, (_, index) => {
        const angle = (index / SHARDS) * Math.PI * 2 + 0.13
        const height = SHARD_H * (index % 2 === 0 ? 1 : 0.68)
        return (
          <mesh
            key={index}
            geometry={geometry.shard}
            material={materials.basalt}
            position={[
              Math.sin(angle) * SHARD_R,
              BEYOND_ARENA.altitude + height / 2,
              Math.cos(angle) * SHARD_R,
            ]}
            rotation={[Math.cos(angle) * 0.19, angle, Math.sin(angle) * -0.19]}
            scale={[1, height / SHARD_H, 1]}
            castShadow
          />
        )
      })}
    </group>
  )
}
