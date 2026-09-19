import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import {
  CORE_Y,
  RAMPS_INNER,
  RAMPS_OUTER,
  RIM_DROP,
  rimRadius,
  topHeight,
} from '../../config/skyIsland'
import { seededRandom } from '../../config/world'
import { now as gameNow } from '../../state/gameClock'
import { faceted } from '../environment/faceted'
import { SKY_COLORS, type SkyMaterials } from './palette'

/**
 * L'eau de l'Île Céleste, et le cristal qui la porte.
 *
 * **L'eau a une source et un trajet**, et c'est ce qui la rend crédible. Des
 * cascades posées au bord de l'île sortiraient de nulle part : l'œil demande
 * toujours d'où vient l'eau, et sans réponse il classe l'effet comme décoratif.
 * Ici elle naît d'un bassin au pied de l'arbre — le point haut —, descend les
 * terrasses par trois canaux taillés le long des rampes, franchit le jardin sur
 * l'aqueduc (voir `Ruins.tsx`, où le filet appartient à l'ouvrage qui le porte),
 * et se jette par-dessus la lèvre en quatre cascades.
 *
 * Une cascade, ce sont **trois choses et pas une** : la lame qui tombe, l'écume
 * au point de rupture, et la brume en bas là où le jet se désagrège. Sans le
 * haut, l'eau sort du néant ; sans le bas, elle s'arrête net au milieu du vide.
 * Ici il n'y a pas de fond pour la recevoir, donc c'est la brume qui termine la
 * chute — elle s'évapore avant d'avoir touché quoi que ce soit, ce qui est
 * précisément l'image d'une île qui flotte.
 */

/** Altitude du cristal, dans la pointe du socle. */
const CRYSTAL_Y = -34

interface Fall {
  crest: Mesh
  mist: Mesh[]
  phase: number
  baseY: number[]
}

function buildWater(materials: SkyMaterials) {
  const group = new Group()
  const falls: Fall[] = []

  // --- La source : un bassin doré au pied de l'arbre ------------------------
  {
    const basin = new Mesh(faceted(new CylinderGeometry(4.2, 3.6, 1.1, 14)), materials.stone)
    basin.position.y = CORE_Y + 0.55
    group.add(basin)

    const lip = new Mesh(faceted(new TorusGeometry(4.2, 0.26, 4, 18)), materials.gold)
    lip.position.y = CORE_Y + 1.1
    lip.rotation.x = Math.PI / 2
    group.add(lip)

    const surface = new Mesh(new CircleGeometry(4.05, 20), materials.water)
    surface.rotation.x = -Math.PI / 2
    surface.position.y = CORE_Y + 0.95
    group.add(surface)
  }

  // --- Trois canaux qui descendent les terrasses ----------------------------
  /*
    Ils suivent les rampes, et ce n'est pas une facilité de tracé : l'eau et le
    joueur descendent par le même chemin parce que c'est le seul que la pente
    autorise — 0,45 contre 2,7 pour la falaise. Le canal borde donc la rampe, et
    le trajet de l'eau accompagne exactement le parcours.
  */
  for (let i = 0; i < 3; i++) {
    for (const [theta, from, to] of [
      [RAMPS_INNER[i], 5, 33],
      [RAMPS_OUTER[i], 33, 52],
    ] as const) {
      const points: Vector3[] = []
      for (let k = 0; k <= 18; k++) {
        const r = from + (to - from) * (k / 18)
        // Décalé d'un mètre et demi du centre de la rampe : le canal la borde,
        // il ne la coupe pas. Un caniveau en travers du chemin est un piège.
        const offset = 1.6 / r
        points.push(
          new Vector3(
            Math.sin(theta + offset) * r,
            topHeight(r, theta) + 0.16,
            Math.cos(theta + offset) * r,
          ),
        )
      }
      const curve = new CatmullRomCurve3(points)

      group.add(
        new Mesh(faceted(new TubeGeometry(curve, 26, 0.55, 4, false)), materials.stoneMid),
      )
      const flow = new Mesh(faceted(new TubeGeometry(curve, 26, 0.38, 4, false)), materials.water)
      flow.position.y = 0.2
      group.add(flow)
    }
  }

  // --- Quatre cascades par-dessus la lèvre ----------------------------------
  {
    const random = seededRandom(0x8f22)

    for (let i = 0; i < 4; i++) {
      const theta = RAMPS_OUTER[i % 3] + (i === 3 ? 1.05 : 0.08)
      const radius = rimRadius(theta) - 0.8
      const x = Math.sin(theta) * radius
      const z = Math.cos(theta) * radius
      const length = 26 + random() * 12

      // L'échancrure de pierre par où l'eau sort : sans elle, la lame perce
      // l'herbe.
      const notch = new Mesh(
        faceted(new CylinderGeometry(1.7, 1.7, 1.2, 6)),
        materials.stoneMid,
      )
      notch.position.set(x, RIM_DROP + 0.2, z)
      group.add(notch)

      // La lame : elle s'élargit et s'amincit en tombant.
      const blade = new Mesh(
        new CylinderGeometry(0.9, 1.9, length, 7, 1, true),
        materials.fall,
      )
      blade.position.set(x, RIM_DROP - length / 2 + 0.4, z)
      group.add(blade)

      const crest = new Mesh(faceted(new IcosahedronGeometry(1.7, 0)), materials.foam)
      crest.position.set(x, RIM_DROP - 0.2, z)
      crest.scale.set(1.3, 0.7, 1.3)
      group.add(crest)

      // La brume, en trois paquets de plus en plus larges et de plus en plus
      // transparents : c'est le dégradé, pas la forme, qui fait l'évaporation.
      const mist: Mesh[] = []
      const baseY: number[] = []
      for (let k = 0; k < 3; k++) {
        const t = (k + 1) / 3
        const blob = new Mesh(
          faceted(new IcosahedronGeometry(2.6 + t * 4.5, 1)),
          new MeshBasicMaterial({
            color: SKY_COLORS.foam,
            transparent: true,
            opacity: 0.2 * (1 - t * 0.7),
            depthWrite: false,
          }),
        )
        const y = RIM_DROP - length * (0.55 + t * 0.42)
        blob.position.set(x + (random() - 0.5) * 2, y, z + (random() - 0.5) * 2)
        blob.scale.set(1.5, 0.75, 1.5)
        group.add(blob)
        mist.push(blob)
        baseY.push(y)
      }

      falls.push({ crest, mist, phase: i * 1.7, baseY })
    }
  }

  // --- Le cristal, à la pointe ----------------------------------------------
  /*
    Il n'est pas de l'eau, mais il vit ici pour une raison : c'est lui qui tient
    l'île en l'air, donc lui qui explique pourquoi une source coule au sommet
    d'un caillou suspendu. Le séparer dans son propre fichier ferait de la
    lévitation un détail décoratif.

    Le violet est **exactement** celui du portail. Ce n'est pas une coïncidence
    de palette : le portail est violet *parce que* ce cristal l'est.
  */
  const crystal = new Mesh(
    faceted(new OctahedronGeometry(6, 0)),
    new MeshBasicMaterial({ color: SKY_COLORS.crystalPale }),
  )
  crystal.position.y = CRYSTAL_Y
  crystal.scale.set(1, 1.9, 1)
  group.add(crystal)

  const halo = new Mesh(
    new OctahedronGeometry(11, 0),
    new MeshBasicMaterial({
      color: SKY_COLORS.crystal,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  )
  halo.position.y = CRYSTAL_Y
  halo.scale.set(1, 1.9, 1)
  group.add(halo)

  return { group, falls, crystal, halo }
}

export function SkyWater({ materials }: { materials: SkyMaterials }) {
  // Mémoïsé sur les matériaux, qui sont eux-mêmes stables pour toute la vie du
  // fragment : `built` ne change donc jamais, et la fermeture du `useFrame`
  // peut le capturer directement. Pas de `ref` intermédiaire — il n'y aurait
  // rien à y rafraîchir.
  const built = useMemo(() => buildWater(materials), [materials])

  useFrame(() => {
    /*
      Horloge de **jeu** : l'eau se fige avec le reste du monde quand un panneau
      est ouvert. Une cascade qui continue de couler pendant une pause dit au
      joueur que la pause n'en est pas vraiment une.

      Ce qu'on anime n'est pas l'écoulement lui-même — les lames n'ont pas de
      texture à faire défiler — mais l'écume qui bat au point de rupture et la
      brume qui respire en bas. C'est suffisant : l'œil lit un écoulement à
      partir de ses extrémités, pas de son milieu.
    */
    const t = gameNow() / 1000
    for (const fall of built.falls) {
      fall.crest.scale.setScalar(1.1 + Math.sin(t * 3.1 + fall.phase) * 0.14)
      fall.mist.forEach((blob, k) => {
        blob.position.y = fall.baseY[k] + Math.sin(t * 0.7 + fall.phase + k) * 0.9
      })
    }
    built.crystal.rotation.y = t * 0.3
    built.halo.rotation.y = -t * 0.18
  })

  return <primitive object={built.group} />
}
