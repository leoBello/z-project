import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import {
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  Shape,
  type BufferGeometry,
  type Group,
  type Mesh,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TEMPLE } from '../../config/landmarks'
import { now as gameNow } from '../../state/gameClock'
import { toonGradient } from '../models/toonGradient'
import { faceted } from './faceted'
import { box, cyl } from './solids'
import { InteractionMarker } from './InteractionMarker'

/**
 * Temple du Sommet.
 *
 * Un péristyle ouvert : colonnade, entablement, deux frontons, et rien au-dessus
 * de la cour. La toiture manque volontairement — c'est ce qui fait lire une
 * ruine plutôt qu'un bâtiment neuf, mais surtout la caméra du jeu plonge de 17° :
 * un toit plein aurait masqué tout l'intérieur, donc l'autel et le cristal,
 * c'est-à-dire la seule raison de monter jusqu'ici.
 *
 * Le sol du temple est la terrasse creusée par `sampleHeight` (voir
 * `config/landmarks.ts`) ; le stylobate posé dessus, lui, est de la géométrie.
 * Ses gradins sont infranchissables — le personnage n'a pas d'autostep, voir
 * le commentaire de la rampe dans `TempleColliders` — donc le temple n'a qu'une
 * entrée, l'escalier de la façade. C'est assumé : ça donne un seuil au lieu
 * d'un décor qu'on traverse.
 */

// --- Cotes ------------------------------------------------------------------

const TIER_COUNT = 3
const TIER_H = 0.22
const TIER_INSET = 0.62
/** Hauteur du sol du temple au-dessus de la terrasse. */
const FLOOR_Y = TIER_COUNT * TIER_H
const BASE_W = 15
const BASE_D = 10.4
const TOP_W = BASE_W - 2 * TIER_INSET * (TIER_COUNT - 1)
const TOP_D = BASE_D - 2 * TIER_INSET * (TIER_COUNT - 1)

/** Demi-écartement de la colonnade, mesuré depuis le centre. */
const COL_HALF_X = TOP_W / 2 - 1
const COL_HALF_Z = TOP_D / 2 - 1
const COL_ALONG_X = 6
const COL_ALONG_Z = 4
const SHAFT_H = 3.3
const SHAFT_R = 0.3
const PLINTH_H = 0.14
const CAPITAL_H = 0.2
const COL_TOP = FLOOR_Y + PLINTH_H + SHAFT_H + CAPITAL_H

const ENTABLATURE_H = 0.72
const CORNICE_H = 0.3
const CORNICE_W = 13.7
const CORNICE_D = 9.1
const CORNICE_T = 1.5
const PEDIMENT_H = 2.05

/**
 * Escalier d'entrée, sur la façade +Z.
 *
 * Il *entame* le stylobate au lieu de se poser devant : la volée part de la
 * terrasse et monte jusqu'au bord du gradin supérieur. Autrement on arriverait
 * en haut des marches face à une marche de plus.
 *
 * Le nombre de contremarches est un compromis physique, pas esthétique. Le
 * collider de l'escalier est une rampe unique (voir `TempleColliders`) : plus
 * les marches sont fines, plus la rampe colle au profil dessiné. À six, l'écart
 * maximal entre le pied du joueur et la marche qu'il voit vaut une demi-marche,
 * soit 5,5 cm — invisible à l'échelle du jeu.
 */
const STAIR_W = 6
const STAIR_STEPS = 6
/** Pied de l'escalier, sur la terrasse. */
const STAIR_FROM_Z = BASE_D / 2 + 2.7
/** Haut de l'escalier, au bord du gradin supérieur. */
const STAIR_TO_Z = BASE_D / 2 - 2 * TIER_INSET
const STAIR_RUN = STAIR_FROM_Z - STAIR_TO_Z
const STAIR_PITCH = Math.atan2(FLOOR_Y, STAIR_RUN)
const STAIR_LENGTH = Math.hypot(STAIR_RUN, FLOOR_Y)
/** Demi-épaisseur du collider en rampe. */
const RAMP_T = 0.2

// --- Fabriques de géométrie -------------------------------------------------

/**
 * Bandeau rectangulaire creux, en quatre pavés.
 *
 * Un bandeau plein aurait bouché la cour vue du dessus : même raisonnement de
 * cadrage que l'absence de toit.
 */
function ring(outerW: number, outerD: number, thickness: number, y: number, h: number) {
  const halfW = outerW / 2
  const halfD = outerD / 2
  const sideD = outerD - 2 * thickness
  const cy = y + h / 2
  return [
    box(outerW, h, thickness, 0, cy, halfD - thickness / 2),
    box(outerW, h, thickness, 0, cy, -(halfD - thickness / 2)),
    box(thickness, h, sideD, halfW - thickness / 2, cy, 0),
    box(thickness, h, sideD, -(halfW - thickness / 2), cy, 0),
  ]
}

/** Fronton triangulaire, extrudé le long de +Z depuis `z`. */
function pediment(width: number, height: number, thickness: number, y: number, z: number) {
  const shape = new Shape()
  shape.moveTo(-width / 2, 0)
  shape.lineTo(width / 2, 0)
  shape.lineTo(0, height)
  shape.closePath()
  return faceted(
    new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }),
  ).translate(0, y, z)
}

/** Positions des colonnes : le pourtour seulement, la cour reste dégagée. */
function columnPositions() {
  const positions: Array<[number, number]> = []
  for (let ix = 0; ix < COL_ALONG_X; ix++) {
    const x = -COL_HALF_X + (ix / (COL_ALONG_X - 1)) * COL_HALF_X * 2
    positions.push([x, COL_HALF_Z], [x, -COL_HALF_Z])
  }
  // Les rangs latéraux sautent les extrémités, déjà posées par la boucle en X.
  for (let iz = 1; iz < COL_ALONG_Z - 1; iz++) {
    const z = -COL_HALF_Z + (iz / (COL_ALONG_Z - 1)) * COL_HALF_Z * 2
    positions.push([COL_HALF_X, z], [-COL_HALF_X, z])
  }
  return positions
}

/** Colonnes couchées et fûts brisés, pour que le lieu ait un passé. */
const RUINS = [
  { x: -9.2, z: 3.4, yaw: 0.7, length: 2.8 },
  { x: 8.6, z: -2.2, yaw: -0.35, length: 2.2 },
] as const
const STUMPS = [
  { x: 7.4, z: 4.6, h: 1.15 },
  { x: -7.9, z: -4.9, h: 0.7 },
] as const

/**
 * Toute la maçonnerie, fusionnée par teinte.
 *
 * Une trentaine de pavés et seize colonnes coûteraient une cinquantaine de draw
 * calls à eux seuls, sur un budget déjà tendu par la végétation. Comme rien de
 * tout ça ne bouge, on fusionne en amont : le temple entier tient en un draw
 * call par teinte.
 */
function buildTemple() {
  const pale: BufferGeometry[] = []
  const dark: BufferGeometry[] = []
  const roof: BufferGeometry[] = []

  // Stylobate : gradins emboîtés, du plus large au plus étroit.
  for (let tier = 0; tier < TIER_COUNT; tier++) {
    const w = BASE_W - 2 * TIER_INSET * tier
    const d = BASE_D - 2 * TIER_INSET * tier
    pale.push(box(w, TIER_H, d, 0, tier * TIER_H + TIER_H / 2, 0))
  }

  // Volée d'entrée : chaque marche est un bloc plein montant du sol à sa
  // propre hauteur, et non une dalle posée. Empilées, elles ne laissent aucun
  // vide sous le nez de marche, et les gradins qu'elles recouvrent disparaissent
  // dedans — l'escalier paraît taillé dans le stylobate.
  for (let step = 0; step < STAIR_STEPS; step++) {
    const top = ((step + 1) * FLOOR_Y) / STAIR_STEPS
    const outer = STAIR_FROM_Z - (step * STAIR_RUN) / STAIR_STEPS
    const depth = outer - STAIR_TO_Z
    pale.push(box(STAIR_W, top, depth, 0, top / 2, STAIR_TO_Z + depth / 2))
  }

  for (const [x, z] of columnPositions()) {
    dark.push(box(0.74, PLINTH_H, 0.74, x, FLOOR_Y + PLINTH_H / 2, z))
    pale.push(cyl(SHAFT_R * 0.85, SHAFT_R, SHAFT_H, x, FLOOR_Y + PLINTH_H, z))
    dark.push(box(0.84, CAPITAL_H, 0.84, x, COL_TOP - CAPITAL_H / 2, z))
  }

  dark.push(...ring(CORNICE_W - 0.72, CORNICE_D - 0.72, 1.32, COL_TOP, ENTABLATURE_H))
  roof.push(...ring(CORNICE_W, CORNICE_D, CORNICE_T, COL_TOP + ENTABLATURE_H, CORNICE_H))

  const pedimentY = COL_TOP + ENTABLATURE_H + CORNICE_H
  const pedimentZ = CORNICE_D / 2 - CORNICE_T
  roof.push(pediment(CORNICE_W, PEDIMENT_H, 1.4, pedimentY, pedimentZ))
  roof.push(pediment(CORNICE_W, PEDIMENT_H * 0.92, 1.4, pedimentY, -pedimentZ - 1.4))

  // Autel : deux assises et un fût. Tout est bloquant — on regarde le cristal
  // depuis le bord, on ne monte pas dessus.
  pale.push(cyl(2.4, 2.4, 0.2, 0, FLOOR_Y, 0, 12))
  pale.push(cyl(1.85, 1.85, 0.2, 0, FLOOR_Y + 0.2, 0, 12))
  dark.push(cyl(0.75, 0.92, 1.1, 0, FLOOR_Y + 0.4, 0, 8))

  for (const ruin of RUINS) {
    const drum = faceted(new CylinderGeometry(SHAFT_R * 0.9, SHAFT_R, ruin.length, 8))
    drum.rotateZ(Math.PI / 2)
    drum.rotateY(ruin.yaw)
    drum.translate(ruin.x, SHAFT_R, ruin.z)
    pale.push(drum)
  }
  for (const stump of STUMPS) {
    pale.push(cyl(SHAFT_R * 0.95, SHAFT_R, stump.h, stump.x, 0, stump.z))
  }

  // Braseros de part et d'autre du pied de l'escalier.
  const flames: BufferGeometry[] = []
  const brazierZ = STAIR_FROM_Z - 0.5
  for (const side of [-1, 1]) {
    const x = side * (STAIR_W / 2 + 1)
    dark.push(cyl(0.16, 0.2, 0.95, x, 0, brazierZ))
    dark.push(cyl(0.46, 0.26, 0.42, x, 0.95, brazierZ, 8))
    const flame = faceted(new IcosahedronGeometry(0.3, 0))
    flame.scale(1, 1.7, 1)
    flame.translate(x, 1.62, brazierZ)
    flames.push(flame)
  }

  return {
    pale: mergeGeometries(pale)!,
    dark: mergeGeometries(dark)!,
    roof: mergeGeometries(roof)!,
    flames: mergeGeometries(flames)!,
    crystal: faceted(new OctahedronGeometry(0.52, 0)).scale(1, 1.9, 1),
  }
}

/**
 * Géométries construites une fois pour toutes, hors du rendu React.
 *
 * Le temple est unique et immuable : les reconstruire à chaque montage
 * relancerait une fusion de géométries pour un résultat identique.
 */
const geometry = buildTemple()

/** Cristal de l'autel : il tourne et respire, c'est le seul mouvement du lieu. */
function Crystal({ y }: { y: number }) {
  const mesh = useRef<Mesh>(null)
  const glow = useRef<Group>(null)

  useFrame(() => {
    // Horloge de jeu et non celle de r3f : cette dernière continue de courir
    // pendant la pause, et le cristal tournait donc derrière le panneau ouvert
    // alors que tout le reste du monde était figé.
    const t = gameNow() / 1000
    if (!mesh.current) return
    mesh.current.rotation.y = t * 0.55
    mesh.current.position.y = y + Math.sin(t * 1.15) * 0.14
    if (glow.current) glow.current.position.y = mesh.current.position.y
  })

  return (
    <>
      <mesh ref={mesh} geometry={geometry.crystal} position={[0, y, 0]} castShadow>
        <meshToonMaterial
          gradientMap={toonGradient}
          color="#ffe9bd"
          emissive="#ffb43c"
          emissiveIntensity={1.35}
        />
      </mesh>
      {/*
        Seule lumière ponctuelle de la scène, et c'est un arbitrage assumé :
        elle ajoute une passe d'éclairage dans *tous* les shaders, végétation
        instanciée comprise. Elle est gardée parce que c'est elle qui détache la
        colonnade sur la neige et donne au temple son statut de balise. Premier
        candidat à sauter si le framerate décroche sur GPU intégré — la retirer
        ne change rien à la lisibilité du lieu.
      */}
      <group ref={glow} position={[0, y, 0]}>
        <pointLight color="#ffc46b" intensity={26} distance={17} decay={2} />
      </group>
    </>
  )
}

/** Colliders du temple : gradins, escalier, colonnes, autel, ruines. */
function TempleColliders() {
  const columns = useMemo(columnPositions, [])

  return (
    <RigidBody type="fixed" colliders={false}>
      {Array.from({ length: TIER_COUNT }, (_, tier) => (
        <CuboidCollider
          key={`tier-${tier}`}
          args={[
            (BASE_W - 2 * TIER_INSET * tier) / 2,
            TIER_H / 2,
            (BASE_D - 2 * TIER_INSET * tier) / 2,
          ]}
          position={[0, tier * TIER_H + TIER_H / 2, 0]}
        />
      ))}
      {/*
        L'escalier est une **rampe**, pas six marches.

        Mesuré en pilotant le jeu : le joueur ne franchissait aucune des marches
        et restait collé au socle, vitesse nulle. La cause n'est pas la hauteur
        de marche mais la façon dont le personnage est déplacé — vélocité
        imposée en XZ, Y laissé à la gravité, et aucun *autostep*. Sur l'arête
        d'une marche, la normale de contact est presque horizontale : elle
        repousse le joueur, elle ne le soulève jamais. Il aurait fallu sauter à
        chaque marche.

        Une rampe, elle, donne une normale à forte composante verticale, et la
        résolution de pénétration fait monter le joueur — exactement le
        mécanisme qui lui permet déjà de gravir la montagne. À 9,5° elle est
        quatre fois plus douce que le flanc qu'il vient d'escalader.

        Corollaire à garder en tête : les gradins du pourtour sont donc des
        murs, et c'est voulu. Le temple n'a qu'une entrée.
      */}
      <CuboidCollider
        args={[STAIR_W / 2, RAMP_T, STAIR_LENGTH / 2]}
        position={[
          0,
          FLOOR_Y / 2 - RAMP_T * Math.cos(STAIR_PITCH),
          (STAIR_FROM_Z + STAIR_TO_Z) / 2 - RAMP_T * Math.sin(STAIR_PITCH),
        ]}
        rotation={[STAIR_PITCH, 0, 0]}
      />
      {columns.map(([x, z], index) => (
        <CylinderCollider
          key={`column-${index}`}
          args={[SHAFT_H / 2, SHAFT_R]}
          position={[x, FLOOR_Y + PLINTH_H + SHAFT_H / 2, z]}
        />
      ))}
      {/* L'autel s'approche, il ne se gravit pas : ses assises basses bloquent
          au rayon qu'on leur voit, et le fût central prend le relais au-dessus.
          Deux colliders plutôt qu'un cylindre unique de rayon 2,4, qui aurait
          tenu le joueur à distance jusqu'en haut du fût — un mur invisible. */}
      <CylinderCollider args={[0.2, 2.4]} position={[0, FLOOR_Y + 0.2, 0]} />
      <CylinderCollider args={[0.55, 0.92]} position={[0, FLOOR_Y + 0.95, 0]} />
      {RUINS.map((ruin, index) => (
        <CylinderCollider
          key={`ruin-${index}`}
          args={[ruin.length / 2, SHAFT_R]}
          position={[ruin.x, SHAFT_R, ruin.z]}
          rotation={[0, ruin.yaw, Math.PI / 2]}
        />
      ))}
    </RigidBody>
  )
}

export function Temple() {
  return (
    <group position={[TEMPLE.x, TEMPLE.altitude, TEMPLE.z]} rotation={[0, TEMPLE.yaw, 0]}>
      {/*
        Trois valeurs, et un accent.

        En première version le temple était monochrome beige : posé sur une
        neige que le soleil rend crème, il ne se détachait plus du sol et sa
        silhouette ne tenait que par l'ombre portée. Ce qui manquait était du
        contraste de *valeur*, pas une couleur de plus — un premier essai en
        vert-de-gris a donné un toit vert vif, pas du bronze patiné. La toiture
        d'ardoise sombre règle le problème sans élargir la palette : elle
        reprend le bleu-parme de la brume et du ciel, donc le temple se découpe
        de loin tout en restant du même monde.
      */}
      <mesh geometry={geometry.pale} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color="#cfc5ae" />
      </mesh>
      <mesh geometry={geometry.dark} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color="#7b7264" />
      </mesh>
      <mesh geometry={geometry.roof} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color="#4f5878" />
      </mesh>
      <mesh geometry={geometry.flames}>
        <meshToonMaterial
          gradientMap={toonGradient}
          color="#ffd9a0"
          emissive="#ff8b2e"
          emissiveIntensity={1.2}
        />
      </mesh>
      <Crystal y={FLOOR_Y + 2.55} />

      {/*
        Le marqueur d'interaction, sur le parvis, dans l'axe de l'escalier. Sa
        position est celle qui sert aussi d'ancre à la détection de proximité
        (`TEMPLE.interact`), les deux dérivant de la même constante : un
        marqueur posé ailleurs que la zone qui l'active mentirait au joueur.
      */}
      <InteractionMarker landmarkId={TEMPLE.id} position={[0, 0, TEMPLE.markerZ]} />
      <TempleColliders />
    </group>
  )
}
