import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { CatmullRomCurve3, CylinderGeometry, TubeGeometry, Vector3 } from 'three'
import { SPANS, SPAN_RADIUS } from '../../config/rotMarsh'
import { faceted } from '../environment/faceted'
import type { MarshMaterials } from './materials'

/**
 * Les trois racines qui traversent le marais — le seul sol sec de la carte.
 *
 * C'est la géométrie de la Voie de l'île, reprise dans son principe : une
 * courbe, un tube, et des colliders de boîte posés le long. Rien de neuf à
 * écrire, et c'est l'essentiel de l'économie de ce chantier.
 *
 * **Les colliders sont des boîtes échantillonnées sur la courbe, pas un
 * trimesh du tube.** Un trimesh de trois tubes de vingt-six segments coûterait
 * quelques milliers de triangles à la simulation pour un résultat moins bon :
 * un joueur qui marche sur un tube rond glisse sur les flancs, alors qu'une
 * boîte horizontale lui donne une surface plane. Le tube est ce qu'on voit, la
 * boîte est ce sur quoi on marche, et les deux n'ont pas à être la même chose.
 *
 * Les racines s'enchaînent bout à bout — le dernier point de l'une est le
 * premier de la suivante — pour qu'il n'y ait aucun saut à faire entre deux. Un
 * trou dans le chemin transformerait une traversée en épreuve d'adresse, ce
 * qu'elle n'est pas.
 */

/** Nombre de boîtes par racine. Une tous les ~2,5 unités sur une portée de 60. */
const COLLIDERS_PER_SPAN = 24

interface Piece {
  position: [number, number, number]
  rotation: [number, number, number]
  halfLength: number
}

/**
 * Les boîtes d'une courbe : position, cap, et demi-longueur.
 *
 * Le cap suit la tangente en projection horizontale, et **seulement** elle : on
 * ne fait pas basculer la boîte selon la pente. Une boîte inclinée sur une
 * racine qui monte donnerait une rampe exacte, mais ses arêtes formeraient des
 * marches à chaque jonction, et le joueur y accrocherait. Une suite de boîtes
 * horizontales décalées en hauteur fait un escalier très fin, que la capsule du
 * personnage gravit sans s'en apercevoir.
 */
function boxesAlong(curve: CatmullRomCurve3): Piece[] {
  const pieces: Piece[] = []
  const a = new Vector3()
  const b = new Vector3()
  for (let i = 0; i < COLLIDERS_PER_SPAN; i++) {
    curve.getPointAt(i / COLLIDERS_PER_SPAN, a)
    curve.getPointAt((i + 1) / COLLIDERS_PER_SPAN, b)
    const dx = b.x - a.x
    const dz = b.z - a.z
    const span = Math.hypot(dx, dz)
    pieces.push({
      // Au milieu du segment, et à la hauteur du plus haut des deux bouts : la
      // boîte affleure donc le dessus du tube plutôt que de s'y enfoncer.
      position: [(a.x + b.x) / 2, Math.max(a.y, b.y), (a.z + b.z) / 2],
      rotation: [0, Math.atan2(dx, dz), 0],
      // Un chouïa plus longue que le segment, pour que deux boîtes voisines se
      // recouvrent : un interstice d'un millimètre entre deux colliders est un
      // trou par lequel on tombe.
      halfLength: span / 2 + 0.15,
    })
  }
  return pieces
}

export function Roots({ materials }: { materials: MarshMaterials }) {
  const { tubes, anchors, pieces } = useMemo(() => {
    const tubes: TubeGeometry[] = []
    const anchors: { position: [number, number, number]; height: number }[] = []
    const pieces: Piece[] = []

    for (const span of SPANS) {
      const curve = new CatmullRomCurve3(span.map(([x, y, z]) => new Vector3(x, y, z)))
      tubes.push(new TubeGeometry(curve, 26, SPAN_RADIUS, 7, false))
      pieces.push(...boxesAlong(curve))

      /*
        Les radicelles qui lestent la racine dans la vase.

        Sans elles, un tube posé au-dessus de l'eau se lit comme une passerelle
        — et une passerelle suppose un constructeur, donc une civilisation, dont
        il n'y a aucune trace sur cette carte. Quatre pieds par portée suffisent
        à dire que ça a poussé là.
      */
      const at = new Vector3()
      for (let i = 1; i < 5; i++) {
        curve.getPointAt(i / 5, at)
        anchors.push({
          position: [at.x, (at.y - 0.7) / 2, at.z],
          height: at.y + 1.4,
        })
      }
    }
    return { tubes, anchors, pieces }
  }, [])

  const anchorGeometry = useMemo(() => faceted(new CylinderGeometry(0.35, 0.8, 1, 6)), [])

  return (
    <>
      {tubes.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={materials.root} castShadow receiveShadow />
      ))}

      {anchors.map((anchor, i) => (
        <mesh
          key={i}
          geometry={anchorGeometry}
          material={materials.rootDark}
          position={anchor.position}
          scale={[1, anchor.height, 1]}
          castShadow
        />
      ))}

      {/*
        Un seul corps fixe pour les trois racines : Rapier n'a alors qu'un objet
        à suivre, et les soixante-douze boîtes en sont les formes. Un corps par
        boîte aurait donné soixante-douze entrées dans le solveur pour une
        géométrie qui ne bouge jamais.
      */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        {pieces.map((piece, i) => (
          <CuboidCollider
            key={i}
            args={[SPAN_RADIUS * 0.82, 0.3, piece.halfLength]}
            position={piece.position}
            rotation={piece.rotation}
          />
        ))}
      </RigidBody>
    </>
  )
}
