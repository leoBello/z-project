import { CylinderCollider, RigidBody } from '@react-three/rapier'
import {
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  Object3D,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Curve,
} from 'three'
import {
  ARENA_CLEAR_R,
  GUTTER_R,
  RAMPS_INNER,
  RAMPS_OUTER,
  TREE_BASE_Y,
  TREE_THETA,
  TREE_TOP,
  WALL_R,
  rampFactor,
  rimHeight,
  rimRadius,
  surfaceRelief,
  topHeight,
  treePosition,
  underHeight,
  underRadius,
} from '../../config/skyIsland'
import { seededRandom, smoothstep } from '../../config/world'
import { faceted } from '../environment/faceted'
import { SKY_MATERIALS, type SkyMaterials } from './palette'

/**
 * La végétation de l'Île Céleste.
 *
 * Elle raconte une chose et une seule : **le temps a repris la forteresse**. Ce
 * n'est donc pas un semis décoratif, et chaque famille est placée pour dire où
 * la reprise a eu lieu — la mousse au pied des murs, les lianes par-dessus la
 * lèvre, les racines du grand arbre agrippées au rebord de la rotonde.
 *
 * Rien ici n'a de collider — sauf le tronc du grand arbre —, et c'est un choix.
 * Sur le continent, `Vegetation.tsx` pose un collider par tronc, parce que la
 * forêt y est dense et qu'un joueur qui la traverse en ligne droite perdrait
 * tout sens du terrain.
 * L'île est un parcours, pas une étendue : ses bosquets bordent des chemins déjà
 * délimités par des falaises et des murs. Cinquante colliders de plus ne
 * fermeraient rien. Le grand arbre fait exception parce qu'il n'est pas un
 * bosquet : un tronc de cinq unités de rayon qu'on traverse ne se lit plus
 * comme un arbre, mais comme un décor peint.
 */

/** Nombre de touffes d'herbe. Instanciées : une par mesh serait 420 appels. */
const TUFTS = 420

/** Pied du grand arbre, en coordonnées monde. */
const TREE_AT = new Vector3(...treePosition())
/** Hauteur du tronc : la cime reste à `TREE_TOP` quelle que soit l'altitude du pied. */
const TREE_TRUNK_H = TREE_TOP - TREE_BASE_Y - 5
/*
  Rayon du disque où rien d'autre ne pousse autour du grand arbre : son tronc
  fait 5,4 à la base, plus une marge pour qu'aucune frondaison de bosquet ne
  perce l'écorce.
*/
const TREE_CLEAR_R = 6.5

/** Vrai si `(x, z)` tombe dans le tronc du grand arbre, marge comprise. */
function inTreeTrunk(x: number, z: number) {
  return Math.hypot(x - TREE_AT.x, z - TREE_AT.z) < TREE_CLEAR_R
}

/**
 * Ramène sur le cercle `ARENA_CLEAR_R` tout sommet qui s'en approcherait.
 *
 * Appliqué aux **sommets** et non aux points de la courbe : une racine dont
 * l'axe s'arrête à 13 garde un demi-diamètre de bois en deçà, et c'est le bois
 * qui gênerait le combat, pas son axe. Écrit comme une contrainte plutôt que
 * comme une longueur réglée à l'œil, pour qu'elle tienne encore au premier
 * réglage des racines. `origin` est la position monde du groupe qui portera la
 * géométrie.
 */
function keepOutOfArena<T extends BufferGeometry>(geometry: T, origin: Vector3) {
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + origin.x
    const z = position.getZ(i) + origin.z
    const d = Math.hypot(x, z)
    if (d >= ARENA_CLEAR_R || d === 0) continue
    const k = ARENA_CLEAR_R / d
    position.setX(i, x * k - origin.x)
    position.setZ(i, z * k - origin.z)
  }
  position.needsUpdate = true
  return geometry
}

/**
 * Un tube qui s'affine de `from` à `to` le long de sa courbe.
 *
 * Pour les racines qui finissent **à l'air**, sur le rebord : un tube de
 * section constante s'y arrêterait sur un orifice ouvert, un tuyau coupé net.
 * Celles qui s'enfoncent dans le jardin n'en ont pas besoin, le sol cache leur
 * bout.
 */
function taperedTube(curve: Curve<Vector3>, segments: number, from: number, to: number) {
  const tube = new TubeGeometry(curve, segments, 1, 5, false)
  const position = tube.getAttribute('position')
  const ring = tube.parameters.radialSegments + 1
  const centre = new Vector3()
  const vertex = new Vector3()
  for (let i = 0; i <= segments; i++) {
    const u = i / segments
    // `TubeGeometry` pose ses anneaux sur `getPointAt`, pas sur `getPoint`.
    curve.getPointAt(u, centre)
    const radius = from + (to - from) * u
    for (let j = 0; j < ring; j++) {
      vertex.fromBufferAttribute(position, i * ring + j).sub(centre)
      vertex.multiplyScalar(radius).add(centre)
      position.setXYZ(i * ring + j, vertex.x, vertex.y, vertex.z)
    }
  }
  return tube
}

/** Arbre du bosquet : tronc conique, trois masses de feuillage aplaties. */
function smallTree(
  materials: SkyMaterials,
  r: number,
  theta: number,
  scale: number,
  random: () => number,
) {
  const group = new Group()
  group.position.set(Math.sin(theta) * r, topHeight(r, theta), Math.cos(theta) * r)

  const trunkH = 2.2 * scale
  const trunk = new Mesh(
    faceted(new CylinderGeometry(0.16 * scale, 0.34 * scale, trunkH, 6)),
    materials.bark,
  )
  trunk.position.y = trunkH / 2
  group.add(trunk)

  const leaves = random() < 0.5 ? materials.leaf : materials.leafDark
  for (let i = 0; i < 3; i++) {
    const blob = new Mesh(
      faceted(new IcosahedronGeometry((1.1 - i * 0.18) * scale, 0)),
      leaves,
    )
    blob.position.set(
      (random() - 0.5) * 0.8 * scale,
      trunkH + (0.4 + i * 0.55) * scale,
      (random() - 0.5) * 0.8 * scale,
    )
    blob.scale.y = 0.7
    group.add(blob)
  }
  return group
}

function buildFlora() {
  const materials = SKY_MATERIALS
  const group = new Group()

  // --- Bosquets -------------------------------------------------------------
  {
    const random = seededRandom(0x7ee3)
    for (let i = 0; i < 46; i++) {
      const theta = random() * Math.PI * 2
      // Sur la prairie et dans les quartiers de l'enceinte, jamais sur l'arène :
      // c'est le sol du futur combat, il doit rester nu.
      const r = random() < 0.62 ? 36 + random() * 14 : 17 + random() * 10
      // Rien ne pousse dans l'axe d'une rampe : ce sont les chemins, et un
      // arbre au milieu d'une montée se lit comme un obstacle qu'il faudrait
      // pouvoir couper.
      if (rampFactor(theta, RAMPS_OUTER) > 0.5 || rampFactor(theta, RAMPS_INNER) > 0.5) {
        continue
      }
      // Ni dans le tronc du grand arbre, qui pousse à cette distance-là.
      if (inTreeTrunk(Math.sin(theta) * r, Math.cos(theta) * r)) continue
      group.add(smallTree(materials, r, theta, 0.8 + random() * 0.9, random))
    }
  }

  // --- Touffes d'herbe ------------------------------------------------------
  {
    const random = seededRandom(0x2c8a)
    const tuft = faceted(new ConeGeometry(0.28, 0.9, 4))
    const mesh = new InstancedMesh(tuft, materials.moss, TUFTS)
    const dummy = new Object3D()

    // Les tirages tombés dans le tronc sont sautés et non retirés : retirer
    // décalerait la suite pseudo-aléatoire et redistribuerait toute la prairie.
    let placed = 0
    for (let draw = 0; draw < TUFTS; draw++) {
      const theta = random() * Math.PI * 2
      const r = 8 + random() * 46
      const rotation = random() * Math.PI
      const scale = 0.7 + random() * 0.8
      if (inTreeTrunk(Math.sin(theta) * r, Math.cos(theta) * r)) continue
      dummy.position.set(
        Math.sin(theta) * r,
        topHeight(r, theta) + 0.3,
        Math.cos(theta) * r,
      )
      dummy.rotation.y = rotation
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(placed++, dummy.matrix)
    }
    mesh.count = placed
    group.add(mesh)
  }

  // --- La mousse qui monte sur la maçonnerie --------------------------------
  {
    const random = seededRandom(0x4f0c)
    for (let i = 0; i < 90; i++) {
      const theta = random() * Math.PI * 2
      // Au pied des murs : la mousse gagne par le bas, jamais par les arêtes que
      // la pluie lave.
      const r = WALL_R + (random() - 0.5) * 2.6
      const blob = new Mesh(
        faceted(new IcosahedronGeometry(0.28 + random() * 0.4, 0)),
        random() < 0.5 ? materials.moss : materials.leafDark,
      )
      // Elle **grimpe**, elle ne s'étale pas : aplatie au sol, la tache verte se
      // lit comme un nénuphar posé sur l'herbe plutôt que comme de la mousse au
      // pied d'un mur. D'où une forme haute, et une altitude tirée vers le bas
      // par le carré du tirage — la plupart restent basses, quelques-unes
      // montent.
      blob.position.set(
        Math.sin(theta) * r,
        topHeight(r, theta) + random() * random() * 2.2,
        Math.cos(theta) * r,
      )
      blob.scale.set(1.15, 0.85, 1.15)
      group.add(blob)
    }
  }

  // --- Les cascades de végétation, par-dessus la lèvre ----------------------
  {
    const random = seededRandom(0x6d41)

    for (let i = 0; i < 34; i++) {
      const theta = (i / 34) * Math.PI * 2 + random() * 0.14
      const depth = 0.1 + random() * 0.2

      // La liane suit la **peau du socle** au lieu de pendre à la verticale :
      // une tige droite accrochée à une paroi qui rentre part dans le vide et se
      // lit comme une pique plantée dans l'île. Même paramétrage que les
      // racines, et pour exactement la même raison.
      const points: Vector3[] = []
      for (let k = 0; k <= 7; k++) {
        const t = 1 - (k / 7) * depth
        const twist = theta + (1 - t) * 0.5
        const radius = underRadius(t, twist) * 1.01 + 0.35
        points.push(
          new Vector3(
            Math.sin(twist) * radius,
            // Au premier point on remonte au-dessus de la lèvre : la liane doit
            // naître dans l'herbe, pas sous le rebord. Sur `rimHeight` et non
            // sur `RIM_DROP`, qui n'est la cote du bord qu'aux caps où le
            // contour atteint 55 — ailleurs la liane partirait dans le vide.
            k === 0 ? rimHeight(twist) + 0.8 : underHeight(t, twist) + 0.3,
            Math.cos(twist) * radius,
          ),
        )
      }

      const curve = new CatmullRomCurve3(points)
      group.add(
        new Mesh(
          faceted(new TubeGeometry(curve, 16, 0.22, 4, false)),
          random() < 0.4 ? materials.bark : materials.leafDark,
        ),
      )

      // Des paquets de feuilles le long de la tige : une liane nue n'est qu'un
      // câble.
      const clumps = 3 + Math.floor(random() * 3)
      for (let k = 1; k <= clumps; k++) {
        const leaf = new Mesh(
          faceted(new IcosahedronGeometry(0.55 + random() * 0.75, 0)),
          random() < 0.5 ? materials.moss : materials.leafDark,
        )
        leaf.position.copy(curve.getPoint(k / (clumps + 0.4)))
        leaf.scale.set(1.25, 0.7, 1.25)
        group.add(leaf)
      }

      // La touffe d'accroche, dans l'herbe : sans elle la liane sort du néant.
      const anchorRadius = rimRadius(theta) - 1
      const anchor = new Mesh(
        faceted(new IcosahedronGeometry(1 + random() * 0.8, 0)),
        materials.moss,
      )
      anchor.position.set(
        Math.sin(theta) * anchorRadius,
        topHeight(anchorRadius, theta) + 0.2,
        Math.cos(theta) * anchorRadius,
      )
      anchor.scale.set(1.4, 0.5, 1.4)
      group.add(anchor)
    }
  }

  // --- Racines sur le socle -------------------------------------------------
  for (let i = 0; i < 7; i++) {
    const start = (i / 7) * Math.PI * 2
    const points: Vector3[] = []
    for (let k = 0; k <= 16; k++) {
      // Paramétrées par le même `t` que le socle : c'est la seule façon
      // qu'elles restent à sa surface au lieu de s'y enfoncer.
      const t = 1 - k / 16
      const theta = start + (1 - t) * 2.3
      const radius = underRadius(t, theta) * 1.02 + 0.6
      points.push(
        new Vector3(
          Math.sin(theta) * radius,
          underHeight(t, theta) + 0.4,
          Math.cos(theta) * radius,
        ),
      )
    }
    const tube = new TubeGeometry(new CatmullRomCurve3(points), 40, 1.35, 5, false)
    group.add(new Mesh(faceted(tube), materials.bark))
  }

  // --- Le grand arbre -------------------------------------------------------
  {
    const random = seededRandom(0xa71c)
    const tree = new Group()
    tree.position.copy(TREE_AT)
    const trunkH = TREE_TRUNK_H

    const trunk = new Mesh(
      faceted(keepOutOfArena(new CylinderGeometry(2.2, 5.4, trunkH, 10), TREE_AT)),
      materials.bark,
    )
    trunk.position.y = trunkH / 2
    tree.add(trunk)

    /*
      Les racines s'agrippent à la maçonnerie de la rotonde : c'est ce geste, et
      pas la taille du tronc, qui dit que l'arbre a mangé la forteresse.

      Celles qui regardent l'arène (à ±70° de la direction du centre) remontent
      la falaise du cœur et **s'arrêtent au rebord**, à `GUTTER_R + 0,4` du
      centre. Elles n'entrent pas sur le dallage parce que c'est le sol du
      combat : une racine d'une unité y serait un mur pour un personnage sans
      autostep, ou, sans collider, un obstacle qu'on traverse. Et c'est de leur
      extrémité que naît l'eau — voir `Water.tsx`.

      Les autres s'étalent sur le jardin, comme au temps où l'arbre était au
      centre.
    */
    const towardCentre = TREE_THETA - Math.PI
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
    const climbing: { theta: number; offset: number }[] = []
    for (let i = 0; i < 8; i++) {
      const theta = (i / 8) * Math.PI * 2 + 0.2
      const offset = wrap(theta - towardCentre)
      if (Math.abs(offset) < (70 * Math.PI) / 180) {
        climbing.push({ theta, offset })
        continue
      }
      const points: Vector3[] = []
      for (let k = 0; k <= 8; k++) {
        const t = k / 8
        const radius = 2.6 + t * 9.5
        points.push(
          new Vector3(
            Math.sin(theta + t * 0.35) * radius,
            4.2 * (1 - t) * (1 - t) - t * 0.3,
            Math.cos(theta + t * 0.35) * radius,
          ),
        )
      }
      const root = new TubeGeometry(new CatmullRomCurve3(points), 18, 0.85, 5, false)
      tree.add(new Mesh(faceted(keepOutOfArena(root, TREE_AT)), materials.bark))
    }

    /*
      Les racines grimpantes, réparties sur le rebord autour de `TREE_THETA`.

      La plus centrale y aboutit exactement — c'est elle qui porte le bec de la
      source —, les autres s'en écartent en proportion de leur écart de
      direction. Le signe est inversé parce qu'une racine qui part vers la
      gauche de l'arbre, vu depuis l'arbre, atteint le rebord à droite du cap
      `TREE_THETA`, vu depuis le centre ; sans cette inversion, elles se
      croiseraient.
    */
    const central = climbing.reduce((a, b) => (Math.abs(b.offset) < Math.abs(a.offset) ? b : a))
    const tipR = GUTTER_R + 0.4
    for (const { theta, offset } of climbing) {
      const tipTheta = TREE_THETA - (offset - central.offset) * 0.45
      const start = new Vector3(Math.sin(theta) * 2.6, 0, Math.cos(theta) * 2.6).add(TREE_AT)
      const tip = new Vector3(Math.sin(tipTheta) * tipR, 0, Math.cos(tipTheta) * tipR)
      const points: Vector3[] = []
      for (let k = 0; k <= 12; k++) {
        const t = k / 12
        const at = start.clone().lerp(tip, t)
        const r = Math.hypot(at.x, at.z)
        const polar = Math.atan2(at.x, at.z)
        // Elle sort du tronc en arc, comme les autres, puis épouse le terrain :
        // la falaise est la seule prise qu'elle ait pour monter au cœur. Sur
        // le rebord, sa pointe se redresse de 0,7 — assez pour que le bec de
        // la source, posé à `CORE_Y + 1` dans `Water.tsx`, verse de haut.
        const arch = TREE_BASE_Y + 4.2 * (1 - t) * (1 - t)
        const ground =
          topHeight(r, polar) + surfaceRelief(r, polar) + 0.3 + 0.7 * smoothstep(0.75, 1, t)
        at.y = Math.max(arch, ground)
        points.push(at.sub(TREE_AT))
      }
      const root = taperedTube(new CatmullRomCurve3(points), 24, 0.85, 0.22)
      tree.add(new Mesh(faceted(keepOutOfArena(root, TREE_AT)), materials.bark))
    }

    // Couronne large et étagée : à cette hauteur, une boule serait une sucette.
    const blobs: [number, number, number, number, boolean][] = [
      [0, trunkH + 2.6, 0, 9.2, true],
      [-8.4, trunkH + 0.4, 3.8, 6.2, false],
      [7.8, trunkH + 0.9, -4.2, 6.6, true],
      [2.6, trunkH - 0.6, 8.2, 5.8, false],
      [-3.2, trunkH + 4.2, -6.8, 5.4, true],
      [4.4, trunkH + 4.8, 3.0, 5.0, false],
    ]
    for (const [x, y, z, s, light] of blobs) {
      const blob = new Mesh(
        faceted(new IcosahedronGeometry(s, 1)),
        light ? materials.leaf : materials.leafDark,
      )
      blob.position.set(x, y, z)
      blob.scale.y = 0.58
      blob.rotation.y = random() * Math.PI
      tree.add(blob)
    }

    group.add(tree)
  }

  return group
}

/** Bâtie à l'import du fragment — voir la note de `Ruins.tsx`. */
const FLORA = buildFlora()

export function Flora() {
  return (
    <>
      <primitive object={FLORA} />

      {/*
        Le tronc du grand arbre, seul collider de la végétation.

        Rayon 5,0 et non 5,4 : le tronc s'affine, et 5,0 est son rayon à hauteur
        de personnage — un cylindre au rayon du pied tiendrait le joueur à
        distance de l'écorce qu'il voit. Les racines n'en ont pas, pour la raison
        des blocs tombés de `Ruins.tsx` : un obstacle d'une unité est un mur pour
        un personnage sans autostep.
      */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        <CylinderCollider
          args={[TREE_TRUNK_H / 2, 5]}
          position={[TREE_AT.x, TREE_AT.y + TREE_TRUNK_H / 2, TREE_AT.z]}
        />
      </RigidBody>
    </>
  )
}
