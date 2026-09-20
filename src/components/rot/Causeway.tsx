import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { BoxGeometry, CatmullRomCurve3, CylinderGeometry, Vector3 } from 'three'
import {
  CAUSEWAY,
  DECK_HALF,
  DECK_THICK,
  DECK_Y,
  PARAPET_H,
  PARAPET_W,
} from '../../config/rotMarsh'
import { faceted } from '../environment/faceted'
import type { MarshMaterials } from './materials'

/**
 * La chaussée d'Elphaël — le chemin qui mène au bassin.
 *
 * Elle remplace un tube de racine dont la crête montait à 2,90 au-dessus du
 * marais, pour un saut qui culmine à 1,33 : une chute était **sans retour**, et
 * c'est le défaut que la première partie jouée a fait remonter. Voir l'en-tête
 * de `CAUSEWAY` pour les trois corrections et leurs raisons.
 *
 * **Tout est plat.** Le tablier, les parapets, les dalles : aucun dénivelé sur
 * les cinquante-deux unités. Ce n'est pas de la paresse de modélisation, c'est
 * la condition pour qu'on ne tombe pas — et une chaussée de ville n'a aucune
 * raison de monter et de descendre.
 *
 * La courbe, elle, reste : le tracé sinueux est ce qui empêche de voir l'arène
 * depuis le portail, donc ce qui fait qu'on la découvre au dernier virage.
 */

/** Segments de tablier. Un tous les ~2,4 unités sur cinquante-deux. */
const SEGMENTS = 22

interface Slab {
  position: [number, number, number]
  yaw: number
  halfLength: number
}

/** Le tracé, échantillonné en segments droits posés bout à bout. */
function slabsAlong(curve: CatmullRomCurve3): Slab[] {
  const slabs: Slab[] = []
  const a = new Vector3()
  const b = new Vector3()
  for (let i = 0; i < SEGMENTS; i++) {
    curve.getPointAt(i / SEGMENTS, a)
    curve.getPointAt((i + 1) / SEGMENTS, b)
    const dx = b.x - a.x
    const dz = b.z - a.z
    slabs.push({
      position: [(a.x + b.x) / 2, 0, (a.z + b.z) / 2],
      yaw: Math.atan2(dx, dz),
      // Un chouïa plus longue que le segment, pour que deux dalles voisines se
      // recouvrent : un interstice d'un millimètre est un trou par lequel on
      // tombe, et c'est exactement ce qu'on vient de corriger.
      halfLength: Math.hypot(dx, dz) / 2 + 0.2,
    })
  }
  return slabs
}

export function Causeway({ materials }: { materials: MarshMaterials }) {
  const { slabs, piers } = useMemo(() => {
    const curve = new CatmullRomCurve3(CAUSEWAY.map(([x, z]) => new Vector3(x, 0, z)))
    const slabs = slabsAlong(curve)

    /*
      Les piles qui portent la chaussée.

      Elles descendent dans la vase tous les quatre segments. Sans elles, un
      tablier posé à quatre-vingt-dix centimètres au-dessus d'une nappe se lit
      comme un décor qui flotte — et la beauté de ce lieu tient entièrement à ce
      qu'il a été *construit* avant de pourrir.
    */
    const piers: [number, number, number][] = []
    const at = new Vector3()
    for (let i = 1; i < SEGMENTS; i += 4) {
      curve.getPointAt(i / SEGMENTS, at)
      const { yaw } = slabs[i]
      for (const side of [-1, 1]) {
        piers.push([
          at.x + Math.cos(yaw) * side * (DECK_HALF - 0.4),
          -1.6,
          at.z - Math.sin(yaw) * side * (DECK_HALF - 0.4),
        ])
      }
    }
    return { slabs, piers }
  }, [])

  const geometry = useMemo(
    () => ({
      deck: new BoxGeometry(DECK_HALF * 2, DECK_THICK, 1),
      parapet: new BoxGeometry(PARAPET_W, PARAPET_H, 1),
      post: faceted(new BoxGeometry(PARAPET_W * 1.9, PARAPET_H * 1.25, PARAPET_W * 1.9)),
      pier: faceted(new CylinderGeometry(0.42, 0.6, 2.6, 6)),
    }),
    [],
  )

  return (
    <group position={[0, DECK_Y, 0]}>
      {slabs.map((slab, i) => (
        <group key={i} position={slab.position} rotation={[0, slab.yaw, 0]}>
          {/* Le tablier. Son dessus est à `DECK_Y`, donc la boîte est centrée
              une demi-épaisseur plus bas — c'est la surface qui est la cote, pas
              le centre du volume. */}
          <mesh
            geometry={geometry.deck}
            material={i % 2 ? materials.stone : materials.stoneWorn}
            position={[0, -DECK_THICK / 2, 0]}
            scale={[1, 1, slab.halfLength * 2]}
            receiveShadow
          />

          {/* Les deux parapets, et un pilastre d'or un segment sur deux. Ce sont
              eux qui empêchent la chute — voir les colliders plus bas. */}
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh
                geometry={geometry.parapet}
                material={materials.stoneWorn}
                position={[side * (DECK_HALF - PARAPET_W / 2), PARAPET_H / 2, 0]}
                scale={[1, 1, slab.halfLength * 2]}
                castShadow
              />
              {i % 2 === 0 && (
                <mesh
                  geometry={geometry.post}
                  material={materials.gold}
                  position={[side * (DECK_HALF - PARAPET_W / 2), PARAPET_H * 0.62, 0]}
                  castShadow
                />
              )}
            </group>
          ))}
        </group>
      ))}

      {piers.map((position, i) => (
        <mesh key={i} geometry={geometry.pier} material={materials.stoneDark} position={position} />
      ))}

      {/*
        Un seul corps fixe pour toute la chaussée : Rapier n'a alors qu'un objet
        à suivre, et les soixante-six formes en sont les colliders. Un corps par
        dalle aurait donné soixante-six entrées dans le solveur pour une
        géométrie qui ne bouge jamais.
      */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        {slabs.map((slab, i) => (
          <group key={i}>
            <CuboidCollider
              args={[DECK_HALF, DECK_THICK / 2, slab.halfLength]}
              position={[slab.position[0], -DECK_THICK / 2, slab.position[2]]}
              rotation={[0, slab.yaw, 0]}
            />
            {/*
              Les parapets sont **solides**, et c'est le cœur de la correction :
              on ne tombe plus par accident. On peut toujours sauter par-dessus —
              ils font 0,80 pour un saut de 1,33 — ce qui garde au marais son
              rôle, mais en fait un choix et non une punition.
            */}
            {[-1, 1].map((side) => (
              <CuboidCollider
                key={side}
                args={[PARAPET_W / 2, PARAPET_H / 2, slab.halfLength]}
                position={[
                  slab.position[0] + Math.cos(slab.yaw) * side * (DECK_HALF - PARAPET_W / 2),
                  PARAPET_H / 2,
                  slab.position[2] - Math.sin(slab.yaw) * side * (DECK_HALF - PARAPET_W / 2),
                ]}
                rotation={[0, slab.yaw, 0]}
              />
            ))}
          </group>
        ))}
      </RigidBody>
    </group>
  )
}
