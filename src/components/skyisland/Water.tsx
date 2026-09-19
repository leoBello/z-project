import { useFrame } from '@react-three/fiber'
import {
  CatmullRomCurve3,
  ConeGeometry,
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
  GUTTER_R,
  RAMPS_INNER,
  RAMPS_OUTER,
  SOURCE_TIP_R,
  SOURCE_TIP_Y,
  TREE_THETA,
  rimHeight,
  rimRadius,
  topHeight,
} from '../../config/skyIsland'
import { seededRandom } from '../../config/world'
import { now as gameNow } from '../../state/gameClock'
import { faceted } from '../environment/faceted'
import { SKY_COLORS, SKY_MATERIALS } from './palette'

/**
 * L'eau de l'Île Céleste, et le cristal qui la porte.
 *
 * **L'eau a une source et un trajet**, et c'est ce qui la rend crédible. Des
 * cascades posées au bord de l'île sortiraient de nulle part : l'œil demande
 * toujours d'où vient l'eau, et sans réponse il classe l'effet comme décoratif.
 * Ici elle naît des racines du grand arbre, là où elles agrippent le rebord de
 * la rotonde — le point haut —, fait le tour de l'arène dans une rigole,
 * descend les terrasses par trois canaux taillés le long des rampes, franchit
 * le jardin sur l'aqueduc (voir `Ruins.tsx`, où le filet appartient à
 * l'ouvrage qui le porte), et se jette par-dessus la lèvre en quatre cascades.
 *
 * L'argument tient toujours depuis que la source a quitté le centre : elle se
 * voit — le bec doré au bout des racines, le filet qui en tombe et l'écume au
 * point d'impact. Depuis le sud de l'arène, un pilier de la rotonde peut la
 * masquer ; elle réapparaît dès qu'on se déplace, et c'est pour ça qu'elle est
 * à l'échelle des cascades du bord et non à celle d'un ornement.
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

function buildWater() {
  const materials = SKY_MATERIALS
  const group = new Group()
  const falls: Fall[] = []

  // --- La source : les racines, au bord de la rotonde ------------------------
  /*
    L'eau naît des racines, là où elles agrippent le rebord de la rotonde, et
    fait le tour de l'arène avant de descendre.

    Elle naissait d'un bassin au centre, au pied de l'arbre. L'arbre a reculé
    derrière l'arène pour laisser le sol au combat, et l'eau ne pouvait pas le
    suivre : la terrasse du jardin est 3,6 unités plus bas que le cœur, et une
    source placée là n'aurait jamais alimenté des canaux qui partent d'en haut.
    Les racines, elles, remontent la falaise — c'est donc d'elles que l'eau sort.
  */
  {
    // La rigole : même section que les canaux, pour qu'on lise une seule
    // installation et non un anneau posé à côté. Pas de collider — c'est un
    // caniveau, on l'enjambe.
    const y = CORE_Y + 0.16
    const channel = new Mesh(faceted(new TorusGeometry(GUTTER_R, 0.55, 4, 64)), materials.stoneMid)
    channel.rotation.x = Math.PI / 2
    channel.position.y = y
    group.add(channel)

    const flow = new Mesh(faceted(new TorusGeometry(GUTTER_R, 0.38, 4, 64)), materials.water)
    flow.rotation.x = Math.PI / 2
    flow.position.y = y + 0.2
    group.add(flow)

    // Un filet d'or sur le bord extérieur : la rigole était ouvragée, comme
    // la coupole qu'elle ceinture.
    const lip = new Mesh(faceted(new TorusGeometry(GUTTER_R + 0.5, 0.12, 4, 64)), materials.gold)
    lip.rotation.x = Math.PI / 2
    lip.position.y = y + 0.42
    group.add(lip)

    /*
      Le bec, au bout de la racine centrale, et le filet qui en tombe.

      **À l'échelle des autres eaux de l'île**, et c'est le point : une lame de
      cascade fait 0,9 à 1,9 de rayon, et un bec de trois dixièmes posé au ras de
      la rigole ne se lisait pas depuis la caméra de jeu, qui regarde l'arène de
      vingt-quatre unités. Or c'est cette source-là que l'en-tête invoque pour
      dire d'où vient l'eau ; invisible, elle ne prouvait rien.

      La racine se cabre donc jusqu'à `SOURCE_TIP_Y` — deux unités au-dessus du
      dallage — et le bec verse de là : le filet fait un mètre et demi de chute,
      assez pour se voir, et l'écume au point d'impact termine la lecture, comme
      pour les quatre cascades du bord.
    */
    /** Une unité de rayon : celui d'une lame de cascade, la plus fine (0,9). */
    const SPOUT_R = 1
    const SPOUT_H = 2
    /*
      L'inclinaison est **calculée**, pas choisie : le bec prend appui sur la
      pointe de la racine, en arrière de l'axe de la rigole, et c'est l'angle qui
      ramène sa pointe exactement à l'aplomb de cet axe. Réglé à l'œil, il
      verserait sur le dallage au premier déplacement de la rigole.
    */
    const SPOUT_TILT = Math.acos((SOURCE_TIP_R - GUTTER_R) / (SPOUT_H / 2))
    const spoutR = SOURCE_TIP_R
    const spout = new Mesh(
      faceted(new ConeGeometry(SPOUT_R, SPOUT_H, 6)),
      materials.goldBright,
    )
    spout.position.set(
      Math.sin(TREE_THETA) * spoutR,
      SOURCE_TIP_Y,
      Math.cos(TREE_THETA) * spoutR,
    )
    spout.rotation.set(Math.PI / 2 + SPOUT_TILT, TREE_THETA + Math.PI, 0, 'YXZ')
    group.add(spout)

    // Le filet part de la pointe du bec — calculée, pas devinée — et tombe dans
    // la rigole.
    const surface = y + 0.2
    const fallR = spoutR - Math.cos(SPOUT_TILT) * (SPOUT_H / 2)
    const fallTop = SOURCE_TIP_Y - Math.sin(SPOUT_TILT) * (SPOUT_H / 2)
    const fx = Math.sin(TREE_THETA) * fallR
    const fz = Math.cos(TREE_THETA) * fallR
    const trickle = new Mesh(
      new CylinderGeometry(0.4, 0.5, fallTop - surface, 7, 1, true),
      materials.fall,
    )
    trickle.position.set(fx, (surface + fallTop) / 2, fz)
    group.add(trickle)

    const splash = new Mesh(faceted(new IcosahedronGeometry(0.45, 0)), materials.foam)
    splash.position.set(fx, surface + 0.1, fz)
    splash.scale.set(1.2, 0.6, 1.2)
    group.add(splash)
  }

  // --- Trois canaux qui descendent les terrasses ----------------------------
  /*
    Ils suivent les rampes, et ce n'est pas une facilité de tracé : l'eau et le
    joueur descendent par le même chemin parce que c'est le seul que la pente
    autorise — 0,45 contre 2,7 pour la falaise. Le canal borde donc la rampe, et
    le trajet de l'eau accompagne exactement le parcours.

    Ils partent de la rigole, qu'ils saignent en trois points : l'eau qui a
    fait le tour de l'arène descend par les trois rampes.
  */
  for (let i = 0; i < 3; i++) {
    for (const [theta, from, to] of [
      [RAMPS_INNER[i], GUTTER_R, 33],
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
      // La cote du bord **à ce cap précis**, et non `RIM_DROP` : le contour
      // ondule de cinq unités, et une échancrure posée sur la cote nominale
      // flotterait ou s'enfoncerait selon l'endroit.
      const rim = rimHeight(theta)
      const x = Math.sin(theta) * radius
      const z = Math.cos(theta) * radius
      const length = 26 + random() * 12

      // L'échancrure de pierre par où l'eau sort : sans elle, la lame perce
      // l'herbe.
      const notch = new Mesh(
        faceted(new CylinderGeometry(1.7, 1.7, 1.2, 6)),
        materials.stoneMid,
      )
      notch.position.set(x, rim + 0.2, z)
      group.add(notch)

      // La lame : elle s'élargit et s'amincit en tombant.
      const blade = new Mesh(
        new CylinderGeometry(0.9, 1.9, length, 7, 1, true),
        materials.fall,
      )
      blade.position.set(x, rim - length / 2 + 0.4, z)
      group.add(blade)

      const crest = new Mesh(faceted(new IcosahedronGeometry(1.7, 0)), materials.foam)
      crest.position.set(x, rim - 0.2, z)
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
        const y = rim - length * (0.55 + t * 0.42)
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

/** Bâtie à l'import du fragment — voir la note de `Ruins.tsx`. */
const built = buildWater()

export function SkyWater() {

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
