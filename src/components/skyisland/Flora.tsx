import { useMemo } from 'react'
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
} from 'three'
import {
  CORE_Y,
  RAMPS_INNER,
  RAMPS_OUTER,
  TREE_TOP,
  WALL_R,
  rampFactor,
  rimHeight,
  rimRadius,
  topHeight,
  underHeight,
  underRadius,
} from '../../config/skyIsland'
import { seededRandom } from '../../config/world'
import { faceted } from '../environment/faceted'
import type { SkyMaterials } from './palette'

/**
 * La végétation de l'Île Céleste.
 *
 * Elle raconte une chose et une seule : **le temps a repris la forteresse**. Ce
 * n'est donc pas un semis décoratif, et chaque famille est placée pour dire où
 * la reprise a eu lieu — la mousse au pied des murs, les lianes par-dessus la
 * lèvre, l'arbre au travers de la coupole.
 *
 * Rien ici n'a de collider, et c'est un choix. Sur le continent,
 * `Vegetation.tsx` pose un collider par tronc, parce que la forêt y est dense
 * et qu'un joueur qui la traverse en ligne droite perdrait tout sens du terrain.
 * L'île est un parcours, pas une étendue : ses bosquets bordent des chemins déjà
 * délimités par des falaises et des murs. Cinquante colliders de plus ne
 * fermeraient rien.
 */

/** Nombre de touffes d'herbe. Instanciées : une par mesh serait 420 appels. */
const TUFTS = 420

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

function buildFlora(materials: SkyMaterials) {
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
      group.add(smallTree(materials, r, theta, 0.8 + random() * 0.9, random))
    }
  }

  // --- Touffes d'herbe ------------------------------------------------------
  {
    const random = seededRandom(0x2c8a)
    const tuft = faceted(new ConeGeometry(0.28, 0.9, 4))
    const mesh = new InstancedMesh(tuft, materials.moss, TUFTS)
    const dummy = new Object3D()

    for (let placed = 0; placed < TUFTS; placed++) {
      const theta = random() * Math.PI * 2
      const r = 8 + random() * 46
      dummy.position.set(
        Math.sin(theta) * r,
        topHeight(r, theta) + 0.3,
        Math.cos(theta) * r,
      )
      dummy.rotation.y = random() * Math.PI
      dummy.scale.setScalar(0.7 + random() * 0.8)
      dummy.updateMatrix()
      mesh.setMatrixAt(placed, dummy.matrix)
    }
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
    tree.position.y = CORE_Y
    const trunkH = TREE_TOP - CORE_Y - 5

    const trunk = new Mesh(
      faceted(new CylinderGeometry(2.2, 5.4, trunkH, 10)),
      materials.bark,
    )
    trunk.position.y = trunkH / 2
    tree.add(trunk)

    // Les racines s'agrippent à la maçonnerie de la rotonde : c'est ce geste, et
    // pas la taille du tronc, qui dit que l'arbre a mangé la forteresse.
    for (let i = 0; i < 8; i++) {
      const theta = (i / 8) * Math.PI * 2 + 0.2
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
      tree.add(new Mesh(faceted(root), materials.bark))
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

export function Flora({ materials }: { materials: SkyMaterials }) {
  const group = useMemo(() => buildFlora(materials), [materials])
  return <primitive object={group} />
}
