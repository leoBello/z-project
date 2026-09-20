import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { Outlines } from '@react-three/drei'
import { Euler, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import type { Group, Material } from 'three'
import {
  ANKLE_Y,
  CUIRASS_PIECES,
  EYE_ROT_PIECES,
  FAULD_PIECES,
  FOOT_PIECES,
  FOREARM,
  HAIR_PIECES,
  HEAD_PIECES,
  HEAD_Y,
  HELM_PIECES,
  HIP_X,
  HIP_Y,
  KNEE_Y,
  LEFT,
  MODEL_SCALE,
  NECK_PIECES,
  NECK_Y,
  PELVIS_PIECES,
  RIGHT,
  SASH_PIECES,
  SHOULDER_X,
  SHOULDER_Y,
  SWORD_PIECES,
  TORSO_PIECES,
  UPPER_ARM,
  VAMBRACE_PIECES,
  VEIN_PIECES,
  WINGS,
  BUTTERFLY_GEOMETRY,
  forearmPieces,
  handPieces,
  pauldronPieces,
  shinPieces,
  thighPieces,
  upperArmPieces,
  type Piece,
  type Wing,
} from './maleniaGeometry'
import {
  OUTLINE_COLOR,
  setRotGlow,
  useMaleniaMaterials,
  type MaleniaMaterials,
} from './maleniaMaterials'
import type { MaleniaRig } from './maleniaRig'

/**
 * Le modèle de Malenia — le rig, les deux phases, et rien d'autre.
 *
 * La géométrie vit dans `maleniaGeometry.ts`, les couleurs dans
 * `maleniaMaterials.ts` : même découpage en trois que le Lynel, pour la même
 * raison — les poses viendront s'écrire ici, et elles n'ont rien à faire au
 * milieu de trois cents lignes de capsules.
 *
 * **La métamorphose n'est pas un second modèle.** Passer en phase II, c'est
 * éteindre l'armure et allumer les ailes ; le squelette ne change pas d'un os.
 * Un second modèle aurait doublé la géométrie pour un personnage qui est le
 * même — et aurait surtout rendu impossible la chute d'armure, qui n'est
 * lisible que parce que c'est le même corps en dessous.
 *
 * C'est aussi pour ça que l'armure est **posée sur** le corps et non à sa
 * place : l'éteindre ne laisse aucun trou.
 */

interface PartProps {
  material: Material
  outline?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  geometry: Piece['geometry']
}

function Part({ material, outline, geometry, ...placement }: PartProps) {
  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow={!(material instanceof MeshBasicMaterial)}
      {...placement}
    >
      {/*
        `screenspace`, et le nom trompe : dans drei 10, c'est ce drapeau-là qui
        pousse les sommets le long de leur normale **dans le repère de l'objet**.
        Sans lui, `thickness` se compte en pixels et 0,038 y vaut un vingtième de
        pixel — c'est-à-dire rien. Même piège que sur le Lynel.
      */}
      {outline !== undefined && (
        <Outlines screenspace thickness={outline} color={OUTLINE_COLOR} />
      )}
    </mesh>
  )
}

function Pieces({ pieces, materials }: { pieces: Piece[]; materials: MaleniaMaterials }) {
  return pieces.map(({ material, ...rest }, i) => (
    <Part key={i} material={materials[material]} {...rest} />
  ))
}

/**
 * Une aile : ses nervures, ses papillons en instances, et son halo.
 *
 * Les matrices d'instance sont posées une fois, en `useLayoutEffect` : elles ne
 * dépendent que de la géométrie, qui est construite au chargement du module.
 * Les recalculer par frame coûterait quarante compositions de matrices pour un
 * résultat identique — le battement de l'aile se fait sur le **groupe**, pas sur
 * chaque papillon.
 */
function WingFan({ wing, materials }: { wing: Wing; materials: MaleniaMaterials }) {
  const solid = useRef<InstancedMesh>(null)
  const pale = useRef<InstancedMesh>(null)

  const split = useMemo(
    () => ({
      solid: wing.butterflies.filter((b) => !b.pale),
      pale: wing.butterflies.filter((b) => b.pale),
    }),
    [wing],
  )

  useLayoutEffect(() => {
    const matrix = new Matrix4()
    const position = new Vector3()
    const quaternion = new Quaternion()
    const scale = new Vector3()
    const euler = new Euler()

    for (const [mesh, list] of [
      [solid.current, split.solid],
      [pale.current, split.pale],
    ] as const) {
      if (!mesh) continue
      list.forEach((butterfly, i) => {
        position.set(...butterfly.position)
        euler.set(...butterfly.rotation)
        quaternion.setFromEuler(euler)
        scale.setScalar(butterfly.scale)
        mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale))
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.count = list.length
    }
  }, [split])

  return (
    <>
      <mesh geometry={wing.strands} material={materials.hairDark} />
      <instancedMesh
        ref={solid}
        args={[BUTTERFLY_GEOMETRY, materials.wing, split.solid.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={pale}
        args={[BUTTERFLY_GEOMETRY, materials.wingPale, split.pale.length]}
        frustumCulled={false}
      />
      {/* Le halo : un disque non éclairé derrière l'éventail. Il ne se voit pas
          franchement, et c'est le but — il empêche l'aile de se découper en
          confettis sur un ciel sombre en lui donnant un fond. */}
      <mesh
        geometry={wing.halo.geometry}
        material={materials.halo}
        position={wing.halo.position}
        rotation={wing.halo.rotation}
      />
    </>
  )
}

/*
  Les tableaux de pièces, construits **une fois** au chargement du module.

  `thighPieces(true)` rend un tableau neuf à chaque appel ; les écrire dans le
  JSX en aurait fabriqué huit par rendu, et `<Pieces>` aurait remonté ses
  maillages à chaque fois faute de reconnaître le tableau. Le Lynel porte une
  constante de module pour exactement la même raison — son en-tête parle d'un
  seul tableau de clés par frame, ce qui était déjà jugé inacceptable.
*/
const LEG_PIECES = {
  prosthetic: { thigh: thighPieces(true), shin: shinPieces(true) },
  flesh: { thigh: thighPieces(false), shin: shinPieces(false) },
}
const PAULDRON_R = pauldronPieces(RIGHT, true)
const PAULDRON_L = pauldronPieces(LEFT, false)
const UPPER_ARM_R = upperArmPieces(true)
const UPPER_ARM_L = upperArmPieces(false)
const FOREARM_R = forearmPieces(true)
const FOREARM_L = forearmPieces(false)
const HAND_R = handPieces(true)
const HAND_L = handPieces(false)

/** Une jambe complète, de la hanche au bout du pied. */
function Leg({
  side,
  prosthetic,
  materials,
  hipRef,
  kneeRef,
}: {
  side: number
  prosthetic: boolean
  materials: MaleniaMaterials
  hipRef: RefObject<Group | null>
  kneeRef: RefObject<Group | null>
}) {
  const pieces = prosthetic ? LEG_PIECES.prosthetic : LEG_PIECES.flesh
  return (
    <group ref={hipRef} position={[side * HIP_X, HIP_Y, 0]}>
      <Pieces pieces={pieces.thigh} materials={materials} />
      <group ref={kneeRef} position={[0, -(HIP_Y - KNEE_Y), 0]}>
        <Pieces pieces={pieces.shin} materials={materials} />
        <group position={[0, -(KNEE_Y - ANKLE_Y), 0]}>
          <Pieces pieces={FOOT_PIECES} materials={materials} />
        </group>
      </group>
    </group>
  )
}

export interface MaleniaModelProps {
  rig: MaleniaRig
  /** `false` en phase I : armure, heaume, pas d'ailes. `true` en phase II. */
  goddess: boolean
}

export function MaleniaModel({ rig, goddess }: MaleniaModelProps) {
  const materials = useMaleniaMaterials()
  /*
    Le rig est déstructuré d'un coup, et pas lu `rig.torso` au fil du JSX.

    C'est une question de lisibilité, et accessoirement la seule façon de faire
    taire la règle `react(refs)` d'oxlint, qui voit dans chaque `rig.quelque`
    une lecture de ref pendant le rendu. Elle a tort ici — on ne lit pas
    `.current`, on transmet l'objet — mais quinze avertissements qui ont tort
    finissent par masquer le premier qui aura raison.
  */
  const {
    root, body, torso, head, hair, sash,
    shoulderR, elbowR, wristR, shoulderL, elbowL,
    hipR, kneeR, hipL, kneeL, wingL, wingR,
  } = rig

  // La marbrure de la peau et l'intensité des veines : deux écritures dans des
  // uniformes, faites à la **transition** de phase et jamais par frame.
  useEffect(() => {
    setRotGlow(materials, goddess)
  }, [materials, goddess])

  return (
    <group ref={root} scale={MODEL_SCALE}>
      <group ref={body}>
        {/* Sa jambe gauche est la prothèse ; son pied droit en est une aussi,
            mais il appartient à la jambe de chair. Voir `thighPieces`. */}
        <Leg side={LEFT} prosthetic materials={materials} hipRef={hipL} kneeRef={kneeL} />
        <Leg
          side={RIGHT}
          prosthetic={false}
          materials={materials}
          hipRef={hipR}
          kneeRef={kneeR}
        />

        <group position={[0, HIP_Y, 0]}>
          <Pieces pieces={PELVIS_PIECES} materials={materials} />
          {!goddess && <Pieces pieces={FAULD_PIECES} materials={materials} />}
          <group ref={sash} position={[0, -0.02, -0.02]}>
            <Pieces pieces={SASH_PIECES} materials={materials} />
          </group>
        </group>

        <group ref={torso} position={[0, HIP_Y + 0.02, 0]}>
          <Pieces pieces={TORSO_PIECES} materials={materials} />
          {goddess && <Pieces pieces={VEIN_PIECES} materials={materials} />}
          {!goddess && <Pieces pieces={CUIRASS_PIECES} materials={materials} />}

          {/* Le bras droit : la prothèse, et la lame. */}
          <group ref={shoulderR} position={[RIGHT * SHOULDER_X, SHOULDER_Y - HIP_Y - 0.02, 0]}>
            <Pieces pieces={UPPER_ARM_R} materials={materials} />
            {!goddess && <Pieces pieces={PAULDRON_R} materials={materials} />}
            <group ref={elbowR} position={[0, -UPPER_ARM, 0]}>
              <Pieces pieces={FOREARM_R} materials={materials} />
              <group ref={wristR} position={[0, -FOREARM, 0]}>
                <Pieces pieces={HAND_R} materials={materials} />
                {/*
                  La lame est **fille du poignet droit**, et c'est toute la
                  question du télégraphe : elle ne peut pas bouger sans que la
                  prothèse ait bougé d'abord. Le joueur qui apprend à lire le bras
                  lit la lame avec une frame d'avance — c'est ce qui rend la
                  parade jouable à 380 ms sur l'estoc.

                  Le demi-tour est là parce que la géométrie de la lame est bâtie
                  vers +Y depuis la soie : sans lui, elle se tiendrait la pointe
                  en l'air en permanence, ce qui est la posture d'une statue et
                  pas d'un escrimeur.
                */}
                <group position={[0, -0.17, 0.02]} rotation={[Math.PI * 0.95, 0, 0]}>
                  <Pieces pieces={SWORD_PIECES} materials={materials} />
                </group>
              </group>
            </group>
          </group>

          {/* Le bras gauche : la chair, et la saisie. */}
          <group ref={shoulderL} position={[LEFT * SHOULDER_X, SHOULDER_Y - HIP_Y - 0.02, 0]}>
            <Pieces pieces={UPPER_ARM_L} materials={materials} />
            {!goddess && <Pieces pieces={PAULDRON_L} materials={materials} />}
            <group ref={elbowL} position={[0, -UPPER_ARM, 0]}>
              <Pieces pieces={FOREARM_L} materials={materials} />
              {!goddess && <Pieces pieces={VAMBRACE_PIECES} materials={materials} />}
              <group position={[0, -FOREARM, 0]}>
                <Pieces pieces={HAND_L} materials={materials} />
              </group>
            </group>
          </group>

          <group position={[0, NECK_Y - HIP_Y - 0.02, 0]}>
            <Pieces pieces={NECK_PIECES} materials={materials} />
            <group ref={head} position={[0, HEAD_Y - NECK_Y + 0.02, 0]}>
              <Pieces pieces={HEAD_PIECES} materials={materials} />
              {goddess && <Pieces pieces={EYE_ROT_PIECES} materials={materials} />}
              {!goddess && <Pieces pieces={HELM_PIECES} materials={materials} />}
              <group ref={hair} position={[0, -0.02, -0.105]}>
                <Pieces pieces={HAIR_PIECES} materials={materials} />
              </group>
            </group>
          </group>
        </group>

        {/*
          Les ailes, filles du **corps** et non du torse.

          Elles partent des omoplates, donc le torse serait le parent
          anatomiquement juste — mais le torse pivote de quatre-vingts degrés
          pendant une tranche, et une envergure de six unités qui suit ce
          mouvement balaie la moitié de l'arène à chaque coup d'épée. Attachées
          au corps, elles suivent le vol et le cap sans suivre les coups, ce qui
          est exactement ce qu'on voit dans le jeu d'origine.
        */}
        {goddess && (
          <>
            <group ref={wingL} position={[LEFT * 0.16, SHOULDER_Y - 0.06, -0.14]} rotation={[0, LEFT * -0.3, 0]}>
              <WingFan wing={WINGS.left} materials={materials} />
            </group>
            <group ref={wingR} position={[RIGHT * 0.16, SHOULDER_Y - 0.06, -0.14]} rotation={[0, RIGHT * -0.3, 0]}>
              <WingFan wing={WINGS.right} materials={materials} />
            </group>
          </>
        )}
      </group>
    </group>
  )
}
