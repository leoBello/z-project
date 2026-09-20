import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier'
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshToonMaterial,
  TorusGeometry,
  type BufferGeometry,
} from 'three'
import { TRIAL_COUNT } from '../../config/quests'
import {
  BAY_HALF_X,
  BAY_HALF_Z,
  DECK_HALF,
  DECK_X0,
  DECK_X1,
  DECK_Y,
  GATE_X,
  GRILLE_H,
  GRILLE_LIFT,
  GRILLE_OPEN_MS,
  GRILLE_W,
  PARAPET_H,
  PARAPET_W,
  PIER_DEPTH,
  SPUR_YAW,
  spurToWorld,
  TOWER_H,
  TOWER_R,
  TOWER_Z,
} from '../../config/skyMountain'
import { now as gameNow } from '../../state/gameClock'
import { useGameStore } from '../../store/useGameStore'
import { toonGradient } from '../models/toonGradient'
import { faceted } from '../environment/faceted'
import { SKY_MATERIALS } from './palette'

/**
 * La Voie de l'Ouest : le pont, sa porte, et la herse qui la ferme.
 *
 * **Les deux tours sont la seule chose entière de l'île**, et c'est le contraire
 * de la règle que `Ruins.tsx` s'impose partout ailleurs (« la pierre perd »).
 * L'exception est le propos : tout le reste de la forteresse s'est écroulé, et
 * ici deux fûts tiennent encore, herse baissée, mécanisme en état. Quelqu'un —
 * quelque chose — garde toujours cette route. Une porte en ruine n'aurait rien
 * interdit ; une porte intacte pose la question de ce qu'elle protège avant
 * même qu'on ait vu la montagne.
 *
 * La herse se lève à l'accomplissement de l'épreuve des trois Lynels, et la
 * condition est lue **dans le store** — `trialSlain`, la même liste qui décide
 * quelles bêtes sont montées et qui fait avancer le journal. Il n'y a donc pas
 * de « drapeau porte ouverte » à tenir à jour : la porte ne peut pas mentir sur
 * l'état de l'épreuve, elle *est* cet état.
 *
 * Le tablier est bâti en boîtes, comme les vestiges, et pour la même raison :
 * une passerelle de pierre taillée à la serpe appartient au même monde que
 * l'enceinte. Une surface lissée s'y lirait comme une pièce rapportée.
 *
 * **Tout est écrit dans le repère de la voie**, celui où elle part vers les −X,
 * et le cap du promontoire n'est appliqué qu'ici : un lacet sur le groupe des
 * maillages, le même sur les corps fixes — dont il fait tourner les colliders
 * avec eux, puisqu'ils sont exprimés dans le repère du corps. Seule la herse,
 * qui est cinématique et se pilote en coordonnées monde, doit convertir sa
 * position (voir `spurToWorld`).
 */

/** Longueur du tablier, et son milieu. Tout le reste s'y accroche. */
const DECK_LEN = Math.abs(DECK_X1 - DECK_X0)
const DECK_MID = (DECK_X0 + DECK_X1) / 2
/** Épaisseur de la dalle. Sa face supérieure est à `DECK_Y`. */
const DECK_T = 1.2

/**
 * Le fer de la herse.
 *
 * Froid et sombre, et surtout **pas de la pierre** : c'est le seul matériau
 * manufacturé de l'île, et il doit se distinguer au premier regard de tout ce
 * qui l'entoure. Un émissif nul, contrairement à l'or : le fer n'a jamais
 * brillé.
 */
const IRON = new MeshToonMaterial({ gradientMap: toonGradient, color: 0x2e333f })
const IRON_DARK = new MeshToonMaterial({ gradientMap: toonGradient, color: 0x1c2029 })

/**
 * La voie, ses parapets et ses deux tours, construits une fois à l'import.
 *
 * Même raison que `RUINS` : au niveau du module, tout cela se bâtit pendant que
 * le voile de transition couvre l'écran. Dans un `useMemo`, ce serait à la frame
 * où l'île paraît, celle où React démonte déjà le continent entier.
 */
function buildCauseway() {
  const materials = SKY_MATERIALS
  const group = new Group()

  const add = (
    geometry: BufferGeometry,
    material: MeshToonMaterial,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new Mesh(faceted(geometry), material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  // --- Le tablier ----------------------------------------------------------
  add(
    new BoxGeometry(DECK_LEN, DECK_T, DECK_HALF * 2),
    materials.stone,
    DECK_MID,
    DECK_Y - DECK_T / 2,
    0,
  )

  /*
    La quille, sous la dalle : une poutre carrée tournée d'un huitième de tour.

    Sans elle, le pont vu d'en dessous — et on le voit d'en dessous, depuis la
    prairie comme depuis le socle de l'île — est une planche d'un mètre
    d'épaisseur suspendue au-dessus du vide. La quille lui donne une section, ce
    qui est la seule chose qui distingue un ouvrage d'art d'un décor posé.
  */
  const keel = new Mesh(faceted(new BoxGeometry(DECK_LEN, 2.6, 2.6)), materials.stoneDark)
  keel.geometry.rotateX(Math.PI / 4)
  keel.position.set(DECK_MID, DECK_Y - DECK_T - 1.2, 0)
  group.add(keel)

  // Les contreforts : cinq raidisseurs sous le tablier, qui rythment la portée.
  for (let i = 0; i < 5; i++) {
    const x = DECK_X0 + ((i + 0.5) / 5) * (DECK_X1 - DECK_X0)
    add(new BoxGeometry(1.1, 1.6, DECK_HALF * 2 - 0.6), materials.stoneMid, x, DECK_Y - DECK_T - 0.6, 0)
  }

  // --- Les parapets --------------------------------------------------------
  for (const side of [-1, 1]) {
    const z = side * (DECK_HALF - PARAPET_W / 2)
    add(
      new BoxGeometry(DECK_LEN, PARAPET_H, PARAPET_W),
      materials.stoneMid,
      DECK_MID,
      DECK_Y + PARAPET_H / 2,
      z,
    )

    /*
      Les merlons, tous les trois mètres et demi.

      Un parapet lisse de trente-huit unités de long se lit comme une glissière
      d'autoroute : c'est la répétition à intervalle régulier d'une **masse**,
      pas la ligne continue, qui fait la fortification. Ils sont posés sur le
      parapet et non à sa place, donc ils n'ajoutent aucun collider : c'est déjà
      le parapet qui arrête.
    */
    const count = Math.floor(DECK_LEN / 3.5)
    for (let i = 0; i <= count; i++) {
      const x = DECK_X0 + (i / count) * (DECK_X1 - DECK_X0)
      add(new BoxGeometry(1.1, 0.5, PARAPET_W + 0.2), materials.stone, x, DECK_Y + PARAPET_H + 0.25, z)
    }
  }

  // --- La travée fortifiée, et ce qui la porte -----------------------------
  {
    /*
      L'épaississement du tablier sous la porte.

      Il ne l'élargit pas — voir `BAY_HALF_Z`, où la raison est écrite : le
      moindre dallage hors des parapets se saute, et une porte qu'on saute ne
      ferme rien. Il l'épaissit, ce qui suffit à asseoir la maçonnerie.
    */
    add(
      new BoxGeometry(BAY_HALF_X * 2, DECK_T + 0.3, BAY_HALF_Z * 2),
      materials.stone,
      GATE_X,
      DECK_Y - (DECK_T + 0.3) / 2,
      0,
    )

    for (const side of [-1, 1]) {
      /*
        Le corbeau, et la pile qui pend dessous.

        Les tours sont en encorbellement au-dessus du vide : leur axe est à 5,2
        du milieu du pont, qui n'en fait que 3,6 de demi-largeur. Le corbeau est
        la console de pierre qui rattrape cet écart — un tronc de cône évasé
        vers le haut, c'est-à-dire la forme même d'une console. La pile, elle,
        descend et ne touche rien : c'est un pont dans le ciel, ses piles
        pendent, et c'est ce qui dit que la porte n'est pas posée sur l'air.
      */
      add(
        new CylinderGeometry(TOWER_R + 0.2, TOWER_R - 1.1, 2.4, 6),
        materials.stoneMid,
        GATE_X,
        DECK_Y - DECK_T - 1.2,
        side * TOWER_Z,
      )
      add(
        new CylinderGeometry(TOWER_R - 1.1, 0.5, PIER_DEPTH, 6),
        materials.stoneDark,
        GATE_X,
        DECK_Y - DECK_T - 2.4 - PIER_DEPTH / 2,
        side * TOWER_Z,
      )
    }
  }

  // --- Les deux tours ------------------------------------------------------
  for (const side of [-1, 1]) {
    const z = side * TOWER_Z
    add(
      new CylinderGeometry(TOWER_R - 0.2, TOWER_R, TOWER_H, 8),
      materials.stone,
      GATE_X,
      DECK_Y + TOWER_H / 2,
      z,
    )

    // La frise dorée, à la hauteur de celles de l'enceinte. La règle de l'île
    // vaut ici : l'or n'a survécu que là où la pierre a tenu, et c'est
    // précisément ce que ces deux tours racontent.
    add(
      new CylinderGeometry(TOWER_R + 0.06, TOWER_R + 0.06, 0.34, 8),
      materials.gold,
      GATE_X,
      DECK_Y + TOWER_H * 0.62,
      z,
    )

    // Le couronnement, et ses créneaux : huit blocs sur l'octogone du fût, un
    // sur deux, comme un vrai chemin de ronde.
    add(
      new CylinderGeometry(TOWER_R + 0.35, TOWER_R + 0.1, 0.9, 8),
      materials.stoneMid,
      GATE_X,
      DECK_Y + TOWER_H + 0.45,
      z,
    )
    for (let i = 0; i < 8; i += 2) {
      const angle = (i / 8) * Math.PI * 2 + Math.PI / 8
      add(
        new BoxGeometry(0.9, 0.8, 0.7),
        materials.stone,
        GATE_X + Math.sin(angle) * (TOWER_R + 0.05),
        DECK_Y + TOWER_H + 1.3,
        z + Math.cos(angle) * (TOWER_R + 0.05),
      ).rotation.y = angle
    }
  }

  // --- Le corps de garde, au-dessus du passage -----------------------------
  {
    /*
      La masse qui porte, et qui **avale la herse quand elle se lève**.

      Sa face inférieure est à la hauteur exacte du passage, son sommet cinq
      unités plus haut : la grille, levée de sa propre hauteur, disparaît
      entièrement dedans. Une herse qui s'évapore en fondu n'aurait jamais pesé ;
      une herse qui rentre dans la pierre a un mécanisme, donc un passé.
    */
    const H = 5.2
    add(
      new BoxGeometry(3, H, TOWER_Z * 2),
      materials.stone,
      GATE_X,
      DECK_Y + GRILLE_H + H / 2,
      0,
    )
    add(
      new BoxGeometry(3.6, 0.5, TOWER_Z * 2 + 0.6),
      materials.stoneMid,
      GATE_X,
      DECK_Y + GRILLE_H + H + 0.25,
      0,
    )

    // L'arc de décharge, en plein cintre, sur les deux faces. Le passage d'une
    // herse est rectangulaire — ses rainures le sont — mais la maçonnerie qui
    // le surmonte reste celle de l'île, et l'île est bâtie en plein cintre.
    for (const face of [-1, 1]) {
      const arc = new Mesh(
        faceted(new TorusGeometry(GRILLE_W / 2 + 0.4, 0.34, 4, 12, Math.PI)),
        materials.stoneMid,
      )
      arc.position.set(GATE_X + face * 1.5, DECK_Y + GRILLE_H + 0.5, 0)
      arc.rotation.y = Math.PI / 2
      group.add(arc)
    }
  }

  return group
}

/** La herse elle-même, bâtie à part : c'est la seule pièce qui bouge. */
function buildGrille() {
  const group = new Group()
  const BAR = 0.16

  // Les barreaux verticaux, et les trois traverses qui les tiennent.
  const bars = Math.round(GRILLE_W / 0.72)
  for (let i = 0; i <= bars; i++) {
    const z = -GRILLE_W / 2 + (i / bars) * GRILLE_W
    const bar = new Mesh(faceted(new BoxGeometry(BAR, GRILLE_H, BAR)), IRON)
    bar.position.set(0, GRILLE_H / 2, z)
    bar.castShadow = true
    group.add(bar)

    /*
      Les pointes du bas, une par barreau.

      C'est le détail qui fait la herse plutôt que la grille de jardin : une
      herse se referme *dans le sol*, elle est faite pour empaler ce qui passe
      dessous. Le joueur ne la lit pas comme un portail qu'on pousse.
    */
    const spike = new Mesh(faceted(new ConeGeometry(BAR * 0.9, 0.5, 4)), IRON_DARK)
    spike.position.set(0, -0.25, z)
    spike.rotation.x = Math.PI
    group.add(spike)
  }

  for (const y of [0.5, GRILLE_H / 2, GRILLE_H - 0.4]) {
    const rail = new Mesh(faceted(new BoxGeometry(BAR * 0.9, 0.2, GRILLE_W)), IRON_DARK)
    rail.position.set(0, y, 0)
    group.add(rail)
  }

  return group
}

const CAUSEWAY = buildCauseway()
const GRILLE = buildGrille()

/** La porte, en coordonnées monde : la herse cinématique s'y pilote. */
const GATE_WORLD = spurToWorld(GATE_X, 0)

/**
 * Instant d'ouverture d'une porte déjà ouverte à l'arrivée.
 *
 * Même raison que l'`ALREADY_OPEN` du portail du retour : la valeur ne sert
 * qu'à l'animation, qui la compare au temps de jeu. Moins l'infini la place
 * assez loin dans le passé pour que la herse soit levée à la première frame —
 * ce qu'on veut, puisque le joueur l'a déjà ouverte lors d'un passage
 * précédent, et la voir se relever toute seule à chaque aller-retour serait un
 * mensonge sur ce qui vient de se produire.
 */
const ALREADY_RAISED = -Infinity

export function Causeway() {
  const trialDone = useGameStore((state) => state.trialSlain.length >= TRIAL_COUNT)

  const grille = useRef<Group>(null)
  /*
    Corps **cinématique** et non fixe, et c'est ce qui fait que le collider monte
    avec l'image.

    Un corps fixe prend son transform au montage et ne le reprend plus : la
    herse se serait levée à l'écran en laissant son mur invisible en travers du
    chemin. L'autre solution — démonter le collider à l'instant où l'épreuve
    s'achève — le retirait une seconde et demie avant que la grille ait fini de
    monter, et le joueur pouvait traverser une herse encore à demi baissée.
  */
  const barrier = useRef<RapierRigidBody>(null)

  /** Vrai si la herse était déjà levée à l'arrivée sur l'île. */
  const [raisedOnArrival] = useState(
    () => useGameStore.getState().trialSlain.length >= TRIAL_COUNT,
  )
  const openedAt = useRef<number | null>(null)

  useEffect(() => {
    if (!trialDone || openedAt.current !== null) return
    openedAt.current = raisedOnArrival ? ALREADY_RAISED : gameNow()
  }, [trialDone, raisedOnArrival])

  useFrame(() => {
    const group = grille.current
    if (!group) return

    const since = openedAt.current
    const t = since === null ? 0 : Math.min(1, (gameNow() - since) / GRILLE_OPEN_MS)
    /*
      Sortie cubique : elle part vite et finit en s'appuyant sur sa butée.

      Une montée linéaire est ce qui se lit comme une porte automatique — une
      vitesse constante n'a ni masse ni mécanisme. La courbe donne le contre-
      poids qui bascule d'un coup puis la chaîne qui retient les derniers
      centimètres, et c'est ce dernier ralentissement, plus que le départ, qui
      fait le poids.
    */
    const lift = GRILLE_LIFT * (1 - (1 - t) ** 3)

    group.position.y = DECK_Y + lift
    // En coordonnées **monde** : un corps cinématique se pilote dans le monde,
    // pas dans le repère de son parent. C'est la seule cote du fichier qui
    // sorte du repère de la voie.
    barrier.current?.setNextKinematicTranslation({
      x: GATE_WORLD.x,
      y: DECK_Y + lift + GRILLE_H / 2,
      z: GATE_WORLD.z,
    })
  })

  return (
    <>
      <group rotation-y={SPUR_YAW}>
        <primitive object={CAUSEWAY} />

        <group ref={grille} position={[GATE_X, DECK_Y, 0]}>
          <primitive object={GRILLE} />
        </group>
      </group>

      {/*
        La physique de la voie, en un seul corps fixe.

        Le tablier arrête par le dessus, les deux parapets par les côtés, les
        deux tours par leur fût. Les merlons, les contreforts et la quille n'ont
        pas de collider : on ne peut ni les atteindre ni tomber dessus.

        Le parapet est franchement plus haut que sa pierre — une unité contre
        0,75 — et ce n'est pas une erreur de recopie. Sans ce rab, un joueur qui
        saute en longeant le bord passe par-dessus, et la chute est de trente
        unités jusqu'à la limite de sécurité. Le collider invisible qui dépasse
        est moins choquant que la mort qu'il évite.
      */}
      <RigidBody type="fixed" colliders={false} rotation={[0, SPUR_YAW, 0]} friction={1}>
        <CuboidCollider
          args={[DECK_LEN / 2, DECK_T / 2, DECK_HALF]}
          position={[DECK_MID, DECK_Y - DECK_T / 2, 0]}
        />
        {/* La travée : elle porte les tours, donc elle doit porter le joueur —
            sinon il traverse le sol de la seule pièce d'où il ne peut pas
            revenir. */}
        <CuboidCollider
          args={[BAY_HALF_X, DECK_T / 2, BAY_HALF_Z]}
          position={[GATE_X, DECK_Y - DECK_T / 2, 0]}
        />
        {[-1, 1].map((side) => (
          <CuboidCollider
            key={side}
            args={[DECK_LEN / 2, 0.5, PARAPET_W / 2]}
            position={[DECK_MID, DECK_Y + 0.5, side * (DECK_HALF - PARAPET_W / 2)]}
          />
        ))}
        {[-1, 1].map((side) => (
          <CylinderCollider
            key={`tower-${side}`}
            args={[TOWER_H / 2, TOWER_R]}
            position={[GATE_X, DECK_Y + TOWER_H / 2, side * TOWER_Z]}
          />
        ))}
      </RigidBody>

      <RigidBody
        ref={barrier}
        type="kinematicPosition"
        colliders={false}
        position={[GATE_WORLD.x, DECK_Y + GRILLE_H / 2, GATE_WORLD.z]}
        rotation={[0, SPUR_YAW, 0]}
      >
        {/*
          Le mur de la herse est plus large que sa grille : il va jusqu'à l'axe
          des tours, donc il s'enfonce d'une unité et demie dans la pierre de
          chacune.

          À la largeur exacte de la grille, ses deux bords venaient **tangenter**
          les fûts : le passage y était nul au millième près, et une géométrie
          qui ne ferme que par tangence est une géométrie qui laissera passer le
          jour où un rayon bougera d'un centimètre. Le recouvrement, lui, ne se
          voit pas et ne peut pas s'ouvrir.
        */}
        <CuboidCollider args={[0.2, GRILLE_H / 2, TOWER_Z]} />
      </RigidBody>
    </>
  )
}
