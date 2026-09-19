import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Outlines } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { MeshBasicMaterial } from 'three'
import type { BufferGeometry, Group, Material, Quaternion } from 'three'
import type { EnemyMaterials } from './models'
import { useLynelMaterials } from './lynelMaterials'
import type { LynelMaterials } from './lynelMaterials'
import { isHitStopped } from '../../state/gameClock'
import {
  BODY_Y,
  BODY_R,
  HIP_X,
  FORE_Z,
  HIND_Z,
  BUST,
  BUST_LEAN,
  SHOULDER_Y,
  HEAD_Y,
  OUTLINE,
  OUTLINE_THIN,
  OUTLINE_COLOR,
  UPPER_ROTATION,
  LOWER_ROTATION,
  LOWER_Y,
  LEGS,
  TAIL,
  TAIL_TUFT,
  BELT_BUCKLE,
  BELT_STRAP,
  BELT_STUD,
  PAULDRON_SPIKE,
  BLADE,
  SWORD_FULLER,
  SWORD_VEIN,
  SWORD_GUARD,
  SWORD_QUILLON,
  SWORD_POMMEL,
  SHIELD_PLATE,
  SHIELD_BOSS_PLATE,
  SHIELD_BOSS,
  SHIELD_SPIKE,
  SHIELD_SPIKES,
  BOW,
  BOW_GRIP,
  FANG,
  EAR,
  EAR_INNER,
  HORNS,
  RUFF,
  NECK_MANE,
  SPINE_MANE,
} from './lynelGeometry'
import type { Vec3, MatKey, Piece } from './lynelGeometry'

export type LynelPose = 'repos' | 'garde' | 'balayage' | 'charge' | 'cabre' | 'brise'

/** Les articulations posables, nommées comme dans la table des poses. */
type LynelJoint =
  | 'root'
  | 'bust'
  | 'head'
  | 'tail'
  | 'legFRu'
  | 'legFRl'
  | 'legFLu'
  | 'legFLl'
  | 'legHRu'
  | 'legHRl'
  | 'legHLu'
  | 'legHLl'
  | 'armRu'
  | 'armRf'
  | 'armLu'
  | 'armLf'

interface PoseSpec {
  /** Écarts en radians, articulation par articulation. Absent = ne bouge pas. */
  rig: Partial<Record<LynelJoint, Vec3>>
  /** Décollement du corps entier, en unités monde. Le cabré s'en sert. */
  lift?: number
}

/*
  Les six poses, portées de la maquette (lignes 1957-2056) sans retouche.

  Une pose est une table d'**écarts** sur les rotations de construction, et non
  un jeu de rotations absolues : ce qui n'y figure pas ne bouge pas, et `repos`
  est littéralement la table vide. Sans ça, chaque pose devrait redonner les
  seize rotations — y compris celles qu'elle ne change pas — et la première
  correction de la géométrie les rendrait toutes fausses d'un coup.

  Elles sont interpolées et jamais appliquées sèches : ce qui fait le télégraphe,
  c'est le mouvement qui mène à l'image, pas l'image.
*/
const POSES: Record<LynelPose, PoseSpec> = {
  /** Repos — il attend au centre, il ne patrouille pas. */
  repos: { rig: {} },
  /*
    Garde — 620 ms de télégraphe. L'épée passe derrière l'épaule, la tête
    descend : le coup vient de la droite, et il vient de haut.
  */
  garde: {
    rig: {
      bust: [-0.16, -0.42, 0],
      head: [0.26, 0.34, 0],
      armRu: [-0.95, 0, -0.55],
      armRf: [-0.85, 0, 0],
      armLu: [-0.35, 0, 0.3],
      armLf: [-0.7, 0, 0],
      legFRu: [-0.18, 0, 0],
      legFLu: [0.1, 0, 0],
      tail: [-0.25, 0, 0],
    },
  },
  /*
    Balayage — arc de 170°, portée 3,6. Le buste entier tourne : on ne le
    contourne pas, on le pare.
  */
  balayage: {
    rig: {
      bust: [0.1, 0.72, 0],
      head: [-0.1, -0.5, 0],
      armRu: [-0.5, 0, -1.25],
      armRf: [-0.15, 0, 0],
      armLu: [0.3, 0, 0.5],
      armLf: [-0.4, 0, 0],
      legFRu: [0.2, 0, 0],
      legFLu: [-0.22, 0, 0],
      tail: [0.2, 0, 0],
    },
  },
  /*
    Charge — elle traverse l'arène. Elle s'annonce aux pattes et jamais à la
    crinière : c'est la règle de lecture, et elle dit qu'on ne la pare pas.
  */
  charge: {
    lift: -0.16,
    rig: {
      root: [-0.1, 0, 0],
      bust: [0.34, 0, 0],
      head: [-0.12, 0, 0],
      armRu: [0.55, 0, -0.35],
      armRf: [-0.5, 0, 0],
      armLu: [0.5, 0, 0.35],
      armLf: [-0.5, 0, 0],
      legFRu: [-0.95, 0, 0],
      legFRl: [0.35, 0, 0],
      legFLu: [0.55, 0, 0],
      legFLl: [-0.5, 0, 0],
      legHRu: [0.85, 0, 0],
      legHRl: [-0.75, 0, 0],
      legHLu: [-0.45, 0, 0],
      legHLl: [0.3, 0, 0],
      tail: [0.55, 0, 0],
    },
  },
  /*
    Cabré — 760 ms, puis une onde au sol jusqu'à l'anneau 6,6. La seule attaque
    du combat qui se franchit au saut.
  */
  cabre: {
    lift: 0.52,
    rig: {
      root: [-0.62, 0, 0],
      bust: [0.34, 0, 0],
      head: [0.2, 0, 0],
      armRu: [-1.5, 0, -0.5],
      armRf: [-0.5, 0, 0],
      armLu: [-1.5, 0, 0.5],
      armLf: [-0.5, 0, 0],
      legFRu: [-1.25, 0, 0],
      legFRl: [-0.7, 0, 0],
      legFLu: [-1.05, 0, 0],
      legFLl: [-0.85, 0, 0],
      legHRu: [0.25, 0, 0],
      legHRl: [-0.15, 0, 0],
      legHLu: [0.25, 0, 0],
      legHLl: [-0.15, 0, 0],
      tail: [-0.5, 0, 0],
    },
  },
  /*
    Paré — 1,3 s d'ouverture, dégâts ×3. Garde ouverte, tête rejetée, épée hors
    d'axe : deux coups rentrent, trois si on est propre.
  */
  brise: {
    lift: -0.06,
    rig: {
      root: [0.12, 0, 0],
      bust: [0.3, 0.26, -0.18],
      head: [-0.55, 0.2, 0.2],
      armRu: [0.2, 0, -1.55],
      armRf: [-0.25, 0, 0],
      armLu: [-0.15, 0, 0.9],
      armLf: [-0.3, 0, 0],
      legFRu: [0.45, 0, 0],
      legFRl: [-0.3, 0, 0],
      legFLu: [0.3, 0, 0],
      legFLl: [-0.2, 0, 0],
      legHRu: [0.6, 0, 0],
      legHRl: [-0.35, 0, 0],
      legHLu: [0.55, 0, 0],
      legHLl: [-0.3, 0, 0],
      tail: [-0.6, 0, 0],
    },
  },
}

/** Écart nul, pour les articulations qu'une pose ne mentionne pas. */
const ZERO: Vec3 = [0, 0, 0]

/** L'ordre de parcours du rig. Un tableau, parce qu'un `for…in` sur un objet
    alloue un tableau de clés à chaque frame. */
const JOINT_NAMES: LynelJoint[] = [
  'root',
  'bust',
  'head',
  'tail',
  'legFRu',
  'legFRl',
  'legFLu',
  'legFLl',
  'legHRu',
  'legHRl',
  'legHLu',
  'legHLl',
  'armRu',
  'armRf',
  'armLu',
  'armLf',
]

/**
 * Ce que `Lynel.tsx` peut demander au modèle.
 *
 * Deux méthodes et non quinze groupes : les articulations sont un détail du
 * modèle, et les exposer obligerait le composant de combat à connaître le
 * squelette. Il dit « garde », le modèle sait quels bras bougent.
 *
 * Par ref plutôt que par props : les poses changent dans un `useFrame`, et une
 * prop re-rendrait le boss soixante fois par seconde pour tourner un bras.
 */
export interface LynelRig {
  setPose: (pose: LynelPose) => void
  setRage: (on: boolean) => void
}

interface LynelModelProps {
  /** Pelage, marques et crinière — ceux qui flashent en blanc sous le coup. */
  materials: EnemyMaterials
}


/* --- Rendu ---------------------------------------------------------------- */

interface PartProps {
  material: Material
  geometry?: BufferGeometry
  position?: Vec3
  rotation?: Vec3
  quaternion?: Quaternion
  scale?: Vec3
  /** Épaisseur du contour ; aucun contour si absent. */
  outline?: number
  children?: ReactNode
}

/**
 * Une pièce, l'équivalent du `part()` + `outline()` de la maquette.
 *
 * Les yeux et les halos ne portent pas d'ombre : une lueur qui projette une
 * ombre est une contradiction qu'on verrait sur le dallage.
 */
function Part({ material, outline, children, ...placement }: PartProps) {
  return (
    <mesh castShadow={!(material instanceof MeshBasicMaterial)} material={material} {...placement}>
      {children}
      {/*
        `screenspace`, et le nom trompe : dans drei 10, c'est ce drapeau-là qui
        pousse les sommets le long de leur normale **dans le repère de l'objet**,
        comme le shader de la maquette. Sans lui, `thickness` se compte en
        *pixels* (`thickness / size * w * 2` dans le vertex shader) : 0,045 y
        vaut un vingtième de pixel, et le contour disparaît. Mesuré : à 0,3 sans
        le drapeau, le liseré ne faisait encore qu'un pixel autour du tronc.
      */}
      {outline !== undefined && <Outlines screenspace thickness={outline} color={OUTLINE_COLOR} />}
    </mesh>
  )
}

type MatPicker = (key: MatKey) => Material

function Pieces({ pieces, pick }: { pieces: Piece[]; pick: MatPicker }) {
  return pieces.map(({ material, ...rest }, i) => <Part key={i} material={pick(material)} {...rest} />)
}

interface LegProps {
  sign: number
  z: number
  hind: boolean
  pick: MatPicker
  upperRef: RefObject<Group | null>
  lowerRef: RefObject<Group | null>
}

function Leg({ sign, z, hind, pick, upperRef, lowerRef }: LegProps) {
  const leg = hind ? LEGS.hind : LEGS.fore
  return (
    <group position={[HIP_X * sign, leg.hipY, z]}>
      <group ref={upperRef} rotation-x={hind ? UPPER_ROTATION.hind : UPPER_ROTATION.fore}>
        <group
          ref={lowerRef}
          position-y={LOWER_Y}
          rotation-x={hind ? LOWER_ROTATION.hind : LOWER_ROTATION.fore}
        >
          <Pieces pieces={leg.lower} pick={pick} />
        </group>
        <Pieces pieces={leg.upper} pick={pick} />
      </group>
    </group>
  )
}

interface ArmProps {
  sign: number
  materials: EnemyMaterials
  mats: LynelMaterials
  rootRef: RefObject<Group | null>
  foreRef: RefObject<Group | null>
  /** Ce que tient la main : l'épée, à droite seulement. */
  children?: ReactNode
}

function Arm({ sign, materials, mats, rootRef, foreRef, children }: ArmProps) {
  return (
    <group
      ref={rootRef}
      position={[0.54 * sign, SHOULDER_Y - 0.09, 0.02]}
      rotation={[0.12, 0, 0.3 * -sign]}
    >
      <group ref={foreRef} position-y={-0.56} rotation-x={-0.72}>
        <Part material={materials.body} position={[0, -0.27, 0]}>
          <capsuleGeometry args={[0.15, 0.34, 4, 10]} />
        </Part>
        {/* Le brassard. */}
        <group>
          <Part material={mats.metal} position={[0, -0.23, 0]}>
            <cylinderGeometry args={[0.175, 0.19, 0.24, 12]} />
          </Part>
          <Part material={mats.gold} position={[0, -0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.185, 0.033, 3, 12]} />
          </Part>
        </group>
        <Part material={materials.dark} position={[0, -0.56, 0]} outline={OUTLINE_THIN}>
          <sphereGeometry args={[0.185, 9, 7]} />
        </Part>
        {children}
      </group>
      <Part material={materials.body} position={[0, -0.3, 0]} outline={OUTLINE}>
        <capsuleGeometry args={[0.17, 0.32, 4, 10]} />
      </Part>
      <Part material={mats.furMid} position={[0, -0.56, 0]}>
        <sphereGeometry args={[0.155, 9, 7]} />
      </Part>
    </group>
  )
}

/**
 * Une calotte, pas une boule : sphère pleine, l'épaulière descendait sous
 * l'épaule et couvrait le flanc du torse — précisément la masse qu'il faut
 * voir pour lire un centaure.
 */
function Pauldron({ sign, mats }: { sign: number; mats: LynelMaterials }) {
  return (
    <group position={[0.56 * sign, SHOULDER_Y + 0.08, -0.02]}>
      <Part material={mats.metal} scale={[1, 0.95, 1.05]} outline={OUTLINE_THIN}>
        <sphereGeometry args={[0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </Part>
      <Part material={mats.gold} position={[0, -0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.295, 0.048, 4, 14]} />
      </Part>
      {[0, 1, 2].map((i) => {
        const a = -0.45 + i * 0.45
        return (
          <Part
            key={i}
            geometry={PAULDRON_SPIKE}
            material={mats.goldBright}
            position={[sign * 0.19, 0.16, Math.sin(a) * 0.21]}
            rotation={[a * 0.5, 0, sign * -0.85]}
          />
        )
      })}
    </group>
  )
}

/**
 * Pas de contour sur la lame, et c'est volontaire : sur une géométrie
 * extrudée, dont les normales divergent brutalement aux arêtes, le trait se
 * fend à chaque coin. La gouttière sombre donne son épaisseur à la lame.
 */
function Sword({ mats }: { mats: LynelMaterials }) {
  return (
    <group position={[0, -0.58, 0.05]} rotation={[-0.25, 0, 0.1]}>
      <Part geometry={BLADE} material={mats.steel} position={[0, 0.16, -0.037]} />
      {/* La gouttière, et la veine violette qui la parcourt : c'est elle qui
          s'allume en phase III, le seul endroit où la lueur touche l'acier. */}
      <Part geometry={SWORD_FULLER} material={mats.steelDark} position={[-0.02, 1.05, 0]} />
      <Part geometry={SWORD_VEIN} material={mats.halo} position={[-0.02, 1.0, 0]} />
      {/* Garde, poignée, pommeau. */}
      <Part geometry={SWORD_GUARD} material={mats.gold} position={[0, 0.14, 0]} />
      {[-1, 1].map((s) => (
        <Part
          key={s}
          geometry={SWORD_QUILLON}
          material={mats.goldBright}
          position={[s * 0.24, 0.24, 0]}
          rotation={[0, 0, s * -0.5]}
        />
      ))}
      <Part material={mats.leather} position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.058, 0.064, 0.42, 10]} />
      </Part>
      <Part geometry={SWORD_POMMEL} material={mats.gold} position={[0, -0.34, 0]} />
    </group>
  )
}

/**
 * Le Lynel argenté.
 *
 * Géométrie originale, portée de `docs/maquettes/2026-09-19-lynel-argente.html`
 * — aucun asset sous licence. L'avant du modèle est **+Z**, comme le joueur et
 * comme les deux autres ennemis.
 *
 * Quatre masses, et c'est le rapport entre elles qui fait le Lynel plutôt que
 * le détail de chacune : un buste d'homme trop petit sur un corps de bête trop
 * gros. Le rapport qui compte tient en un nombre — **le buste vaut deux têtes
 * et demie**. La maquette l'a raté trois fois de suite en corrigeant la
 * crinière, le masque et le cou, alors que le défaut était là : un crâne de
 * 0,88 de haut pour un torse de 0,86 donne une figurine, et aucun détail ne
 * rattrape ça.
 */
export const LynelModel = forwardRef<LynelRig, LynelModelProps>(function LynelModel(
  { materials },
  ref,
) {
  const mats = useLynelMaterials()

  // Le rig : les articulations que la Task 3 posera, rotation de construction
  // comprise — une pose n'y exprimera que des écarts.
  const root = useRef<Group>(null)
  const bust = useRef<Group>(null)
  const head = useRef<Group>(null)
  const tail = useRef<Group>(null)
  const legFRu = useRef<Group>(null)
  const legFRl = useRef<Group>(null)
  const legFLu = useRef<Group>(null)
  const legFLl = useRef<Group>(null)
  const legHRu = useRef<Group>(null)
  const legHRl = useRef<Group>(null)
  const legHLu = useRef<Group>(null)
  const legHLl = useRef<Group>(null)
  const armRu = useRef<Group>(null)
  const armRf = useRef<Group>(null)
  const armLu = useRef<Group>(null)
  const armLf = useRef<Group>(null)

  /*
    Le rig, nommé, et les rotations de construction relevées à la première frame.

    Relevées plutôt qu'écrites en dur : les valeurs vivent dans
    `lynelGeometry.ts` et dans le JSX au-dessus, et les recopier ici en ferait
    une seconde source de vérité que la première retouche du modèle rendrait
    fausse — silencieusement, puisqu'une pose continuerait de s'afficher.
  */
  const joints = useRef<Record<LynelJoint, RefObject<Group | null>>>({
    root,
    bust,
    head,
    tail,
    legFRu,
    legFRl,
    legFLu,
    legFLl,
    legHRu,
    legHRl,
    legHLu,
    legHLl,
    armRu,
    armRf,
    armLu,
    armLf,
  })
  const bases = useRef<Partial<Record<LynelJoint, Vec3>>>({})

  /** La pose visée. `Lynel.tsx` l'écrit depuis son `useFrame`. */
  const target = useRef<LynelPose>('repos')

  // `setRage` reste vide : c'est la Task 6 qui allume la crinière et la veine.
  // Elle existe déjà pour que l'interface ne change plus d'ici là.
  useImperativeHandle(ref, () => ({
    setPose: (pose: LynelPose) => {
      target.current = pose
    },
    setRage: () => {},
  }))

  useFrame((_, rawDelta) => {
    // Rien ne bouge pendant le gel du coup fatal ou d'une parade. C'est
    // précisément la frame que le gel existe pour tenir : un boss qui continue
    // de glisser vers sa pose pendant les 110 ms d'une parade réussie transforme
    // l'arrêt sur image en ralenti.
    if (isHitStopped()) return

    const delta = Math.min(rawDelta, 0.05)
    // Amortissement exponentiel, et non un facteur constant par frame : celui-ci
    // serait deux fois plus rapide à 120 Hz qu'à 60. Même règle que le lissage
    // de la caméra et celui du cap des ennemis.
    const k = 1 - Math.exp(-delta * 9)
    const spec = POSES[target.current]

    for (const name of JOINT_NAMES) {
      const group = joints.current[name].current
      if (!group) continue

      let base = bases.current[name]
      if (base === undefined) {
        base = [group.rotation.x, group.rotation.y, group.rotation.z]
        bases.current[name] = base
      }

      const offset = spec.rig[name] ?? ZERO
      group.rotation.x += (base[0] + offset[0] - group.rotation.x) * k
      group.rotation.y += (base[1] + offset[1] - group.rotation.y) * k
      group.rotation.z += (base[2] + offset[2] - group.rotation.z) * k
    }

    // Le décollement s'applique au corps entier et non à une articulation : le
    // cabré lève les quatre sabots, aucune rotation ne peut le faire.
    const body = root.current
    if (body) body.position.y += ((spec.lift ?? 0) - body.position.y) * k
  })

  const pick: MatPicker = (key) =>
    key === 'fur'
      ? materials.body
      : key === 'furDark'
        ? materials.dark
        : key === 'mane'
          ? materials.accent
          : mats[key]

  return (
    <group ref={root}>
      {/* --- Le tronc quadrupède (maquette 1283-1317) --------------------- */}
      <group>
        <Part
          material={materials.body}
          position={[0, BODY_Y, -0.05]}
          rotation={[Math.PI / 2, 0, 0]}
          outline={OUTLINE}
        >
          <capsuleGeometry args={[BODY_R, 1.02, 5, 14]} />
        </Part>

        {/* Le ventre, plus clair et débordant par le bas : un tronc d'une seule
            teinte est un tube, et la ligne de ventre est ce qui fait un animal. */}
        <Part material={mats.furMid} position={[0, BODY_Y - 0.24, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.5, 0.84, 4, 10]} />
        </Part>

        {/* Poitrail et croupe. */}
        <Part material={materials.body} position={[0, BODY_Y + 0.04, 0.86]} scale={[1.04, 1.0, 0.82]} outline={OUTLINE}>
          <sphereGeometry args={[0.66, 14, 10]} />
        </Part>
        <Part material={materials.body} position={[0, BODY_Y + 0.02, -0.94]} scale={[1.08, 1.0, 0.86]} outline={OUTLINE}>
          <sphereGeometry args={[0.64, 14, 10]} />
        </Part>

        {/* Les rayures de la croupe, trois par flanc. Minces le long du corps et
            hautes en travers : une rayure de zèbre. L'inverse donne des taches
            de vache, et change l'animal qu'on regarde. */}
        {[-1, 1].flatMap((side) =>
          [-0.36, -0.68, -1.0].map((z) => (
            <Part
              key={`${side}:${z}`}
              material={materials.dark}
              position={[side * 0.5, BODY_Y + 0.16, z]}
              rotation={[0.15 * side, 0, 0]}
              scale={[0.62, 1.0, 0.11]}
            >
              <sphereGeometry args={[0.34, 10, 8]} />
            </Part>
          )),
        )}

        {/* --- Les jambes (maquette 1318-1378) ---------------------------- */}
        <Leg sign={-1} z={FORE_Z} hind={false} pick={pick} upperRef={legFRu} lowerRef={legFRl} />
        <Leg sign={1} z={FORE_Z} hind={false} pick={pick} upperRef={legFLu} lowerRef={legFLl} />
        <Leg sign={-1} z={HIND_Z} hind pick={pick} upperRef={legHRu} lowerRef={legHRl} />
        <Leg sign={1} z={HIND_Z} hind pick={pick} upperRef={legHLu} lowerRef={legHLl} />

        {/* --- La queue (maquette 1379-1403) ------------------------------ */}
        <group ref={tail} position={[0, BODY_Y + 0.38, -1.22]}>
          <Part geometry={TAIL} material={materials.body} />
          <Pieces pieces={TAIL_TUFT} pick={pick} />
        </group>

        {/* La crinière de l'échine (maquette 1800-1807), dernière fille du
            tronc comme dans la maquette. */}
        <Pieces pieces={SPINE_MANE} pick={pick} />
      </group>

      {/* --- Le buste (maquette 1404-1457) ------------------------------- */}
      <group ref={bust} position={BUST} rotation-x={BUST_LEAN}>
        <Part material={materials.body} position={[0, 0.3, 0]} outline={OUTLINE}>
          <capsuleGeometry args={[0.34, 0.24, 4, 12]} />
        </Part>
        {/* Le torse : deux têtes et demie, de la ceinture aux épaules. La hauteur
            totale n'a pas bougé quand on l'a réglé — ce qu'on a retiré au crâne,
            on l'a rendu au torse. */}
        <Part material={materials.body} position={[0, 0.82, 0]} scale={[1.25, 1, 0.78]} outline={OUTLINE}>
          <capsuleGeometry args={[0.42, 0.42, 5, 14]} />
        </Part>
        <Part material={mats.furMid} position={[0, 0.98, 0.26]} scale={[1.6, 0.74, 0.6]}>
          <sphereGeometry args={[0.28, 11, 8]} />
        </Part>

        {/* La ceinture : sans elle, le buste a l'air planté dans le dos ; avec
            elle, il a l'air sanglé dessus. */}
        <group>
          <Part material={mats.leather} position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.44, 0.47, 0.22, 14]} />
          </Part>
          <Part geometry={BELT_BUCKLE} material={mats.gold} position={[0, 0.06, 0.44]} />
          <Part material={mats.goldDim} position={[0, 0.06, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.3, 0.045, 3, 12]} />
          </Part>
          {/* Une seule sangle en diagonale : deux en croix font un X sombre, et
              à l'écran le torse devient la sangle. */}
          <Part geometry={BELT_STRAP} material={mats.leather} position={[0, 0.7, 0.36]} rotation={[0, 0, 0.55]} />
          {[0, 1, 2, 3].map((i) => (
            <Part
              key={i}
              geometry={BELT_STUD}
              material={mats.gold}
              position={[0.3 - i * 0.2, 1.0 - i * 0.28, 0.4]}
            />
          ))}
        </group>

        {/* --- Les bras (maquette 1482-1514), l'épée dans la main droite ---
            L'avant étant +Z, la main droite est côté -X. */}
        <Arm sign={-1} materials={materials} mats={mats} rootRef={armRu} foreRef={armRf}>
          <Sword mats={mats} />
        </Arm>
        <Arm sign={1} materials={materials} mats={mats} rootRef={armLu} foreRef={armLf} />

        {/* --- Les épaulières (maquette 1458-1481) ------------------------ */}
        <Pauldron sign={-1} mats={mats} />
        <Pauldron sign={1} mats={mats} />

        {/* --- Bouclier et arc, sur le dos (maquette 1580-1615) ----------- */}
        <group position={[0.2, 0.74, -0.36]} rotation={[0.28, -0.35, 0.2]}>
          <Part geometry={SHIELD_PLATE} material={mats.metal} rotation={[Math.PI / 2, 0, 0]} />
          <Part
            geometry={SHIELD_BOSS_PLATE}
            material={mats.steelDark}
            position={[0, 0, 0.01]}
            rotation={[Math.PI / 2, 0, 0]}
          />
          <Part geometry={SHIELD_BOSS} material={mats.gold} position={[0, 0, 0.07]} />
          {SHIELD_SPIKES.map((spike, i) => (
            <Part key={i} geometry={SHIELD_SPIKE} material={mats.goldBright} {...spike} />
          ))}
        </group>
        <group position={[-0.26, 0.7, -0.4]} rotation={[0.2, 0.3, -0.7]}>
          <Part geometry={BOW} material={mats.hornDark} />
          <Part geometry={BOW_GRIP} material={mats.gold} position={[0, 0, -0.23]} />
          <Part material={mats.horn} position={[0, 0, 0.06]}>
            <cylinderGeometry args={[0.012, 0.012, 1.92, 5]} />
          </Part>
        </group>

        {/* --- La tête (maquette 1616-1694) ------------------------------- */}
        <group ref={head} position={[0, HEAD_Y, 0.06]}>
          {/* Le cou. */}
          <Part material={materials.body} position={[0, -0.36, -0.07]} rotation={[0.22, 0, 0]} outline={OUTLINE_THIN}>
            <capsuleGeometry args={[0.19, 0.34, 4, 10]} />
          </Part>
          <Part material={materials.body} scale={[1, 0.95, 1.14]} outline={OUTLINE}>
            <sphereGeometry args={[0.32, 14, 11]} />
          </Part>

          {/* Le masque : une bande et non une visière. Aplati à 0,38 et reculé
              derrière le museau, il ne fait qu'asseoir les yeux sur du sombre —
              plus grand, la tête devenait un casque et le Lynel un chevalier. */}
          <Part material={materials.dark} position={[0, 0.085, 0.1]} scale={[1.05, 0.4, 0.95]}>
            <sphereGeometry args={[0.29, 12, 10]} />
          </Part>

          {/* Le museau, court et large — un mufle de félin, pas un chanfrein de
              chèvre — et poussé à 0,55 pour dépasser du crâne de 0,185 : moins,
              la tête n'a pas de visage, elle a un front. */}
          <Part
            material={materials.body}
            position={[0, -0.075, 0.41]}
            rotation={[Math.PI / 2 + 0.1, 0, 0]}
            outline={OUTLINE_THIN}
          >
            <cylinderGeometry args={[0.175, 0.235, 0.28, 10]} />
          </Part>
          <Part material={mats.furMid} position={[0, -0.2, 0.36]} scale={[0.94, 0.56, 1.05]}>
            <sphereGeometry args={[0.21, 10, 8]} />
          </Part>
          <Part material={materials.dark} position={[0, -0.035, 0.545]} scale={[1.25, 0.8, 0.7]}>
            <sphereGeometry args={[0.1, 8, 6]} />
          </Part>
          {[-1, 1].map((s) => (
            <Part
              key={s}
              geometry={FANG}
              material={mats.horn}
              position={[s * 0.085, -0.215, 0.5]}
              rotation={[0.18, 0, Math.PI]}
            />
          ))}

          {/* Les yeux, à demi sortis du masque (z = 0,345 contre une surface à
              0,329) : plus en arrière, ils étaient dedans, donc invisibles sous
              tous les angles, et rien dans la scène ne le signalait. */}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.152, 0.082, 0.345]}>
              <Part material={mats.glow} scale={[1, 1.2, 0.9]}>
                <sphereGeometry args={[0.072, 10, 8]} />
              </Part>
              <Part material={mats.halo} position={[0, 0, -0.04]} scale={[1, 1.15, 0.6]}>
                <sphereGeometry args={[0.105, 10, 8]} />
              </Part>
            </group>
          ))}

          {/* Oreilles. */}
          {[-1, 1].map((s) => (
            <group key={s}>
              <Part
                geometry={EAR}
                material={materials.body}
                position={[s * 0.265, 0.13, -0.12]}
                rotation={[-0.5, 0, s * 1.15]}
              />
              <Part
                geometry={EAR_INNER}
                material={materials.dark}
                position={[s * 0.275, 0.14, -0.1]}
                rotation={[-0.5, 0, s * 1.15]}
              />
            </group>
          ))}

          {/* --- Les cornes (maquette 1695-1741) -------------------------- */}
          <Pieces pieces={HORNS} pick={pick} />

          {/* --- La collerette (maquette 1745-1789) ----------------------- */}
          <Pieces pieces={RUFF} pick={pick} />
        </group>

        {/* La crinière de la nuque (maquette 1791-1797). */}
        <Pieces pieces={NECK_MANE} pick={pick} />
      </group>
    </group>
  )
})
