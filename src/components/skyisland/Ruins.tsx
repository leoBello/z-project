import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshToonMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  RingGeometry,
  TorusGeometry,
  type Material,
} from 'three'
import {
  ARCH_CLEAR,
  CORE_Y,
  GARDEN_Y,
  RAMPS_INNER,
  ROTUNDA_PIERS,
  ROTUNDA_R,
  ROTUNDA_RUINED_BAYS,
  WALL_H,
  WALL_R,
  islandNoise,
  rampFactor,
  rotundaPierAngle,
  topHeight,
} from '../../config/skyIsland'
import { seededRandom, smoothstep } from '../../config/world'
import { toonGradient } from '../models/toonGradient'
import { faceted } from '../environment/faceted'
import { SKY_COLORS, SKY_MATERIALS } from './palette'

/**
 * Les vestiges de l'Île Céleste.
 *
 * Une forteresse rendue à la végétation : une enceinte crevée de brèches, une
 * porte au sud dans l'axe de la rampe d'arrivée, quatre tours dont aucune n'est
 * entière, une salle à colonnes, une rotonde à coupole en encorbellement, un
 * aqueduc, et une allée de statues.
 *
 * **Deux règles gouvernent tout ce fichier.**
 *
 * La première : *la pierre perd*. Deux pans d'enceinte sur cinq sont écroulés,
 * aucune tour n'est entière, la coupole est ouverte, une colonne sur quatre est
 * couchée. Une ruine où tout tient encore debout n'est pas une ruine, c'est un
 * décor. Et les brèches sont des passages : la ruine fait partie du parcours.
 *
 * La seconde : *l'or ne survit que là où la pierre a tenu*. Six pièces dorées en
 * tout, et chacune est posée sur un élément resté debout. Réparti uniformément,
 * l'or se lirait comme de la peinture jaune ; réservé à ce qui a tenu, il
 * raconte que le reste est tombé avec son ornement.
 *
 * Tout est construit une fois dans un `useMemo` qui rend un `Group` three, monté
 * par `<primitive>`. Un composant React par bloc de pierre — il y en a près de
 * deux cents — ferait payer un arbre de réconciliation pour de la géométrie qui
 * ne bouge jamais.
 */

/*
  Les travées écroulées de la rotonde, lues comme des indices quelconques.

  L'export est un tuple `as const` pour que le combat puisse s'en servir tel
  quel ; `includes` sur un tuple littéral refuse pourtant un `number`, d'où
  cette vue élargie plutôt qu'une seconde copie des valeurs.
*/
const RUINED_BAYS: readonly number[] = ROTUNDA_RUINED_BAYS

/** Un bloc posé et orienté dans le repère polaire de l'île. */
function block(
  group: Group,
  material: Material,
  w: number,
  h: number,
  d: number,
  r: number,
  theta: number,
  y: number,
) {
  const mesh = new Mesh(faceted(new BoxGeometry(w, h, d)), material)
  mesh.position.set(Math.sin(theta) * r, y, Math.cos(theta) * r)
  mesh.rotation.y = theta
  group.add(mesh)
  return mesh
}

/**
 * Une arche : deux piédroits et un arc en plein cintre.
 *
 * L'arc est un demi-tore et non un linteau droit, et c'est le détail qui fait
 * toute la période : le linteau appartient au temple grec, le plein cintre à la
 * forteresse. Laputa est bâtie en plein cintre, du sol à la coupole.
 */
function archway(span: number, clear: number, thickness: number, material: Material) {
  const group = new Group()
  const half = span / 2
  const pierH = clear - half

  for (const side of [-1, 1]) {
    const pier = new Mesh(faceted(new BoxGeometry(0.9, pierH, thickness)), material)
    pier.position.set(side * (half + 0.45), pierH / 2, 0)
    group.add(pier)
  }

  const arc = new Mesh(
    faceted(new TorusGeometry(half + 0.45, 0.45, 4, 14, Math.PI)),
    material,
  )
  arc.position.y = pierH
  arc.scale.z = thickness / 0.9
  group.add(arc)
  return group
}

/** Une pièce porteuse et sa boîte de collision, en coordonnées monde. */
interface Blocker {
  x: number
  y: number
  z: number
  /** Demi-dimensions, comme les attend `CuboidCollider`. */
  half: [number, number, number]
  yaw: number
}

function buildRuins() {
  const materials = SKY_MATERIALS
  const group = new Group()
  const blockers: Blocker[] = []
  const toon = (options: ConstructorParameters<typeof MeshToonMaterial>[0]) =>
    new MeshToonMaterial({ gradientMap: toonGradient, ...options })

  // --- L'enceinte, avec ses brèches ----------------------------------------
  {
    const SEGMENTS = 72
    const random = seededRandom(0x1a7e)

    for (let i = 0; i < SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * Math.PI * 2
      // La porte occupe le sud : on ne bâtit pas de mur par-dessus.
      if (Math.abs(((theta + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.1) continue
      // Les rampes intérieures traversent l'enceinte : leur couloir reste ouvert.
      if (rampFactor(theta, RAMPS_INNER) > 0.4) continue

      // La ruine par pans entiers, pas pierre à pierre : c'est ainsi qu'un mur
      // tombe, et c'est ce qui crée des brèches franches, donc des passages.
      const wear = islandNoise(Math.cos(theta) * 2.6, Math.sin(theta) * 2.6)
      if (wear > 0.5) continue

      const height = WALL_H * (0.42 + 0.58 * smoothstep(0.5, -1.0, wear)) + random() * 0.4
      const width = (Math.PI * 2 * WALL_R) / SEGMENTS + 0.25
      const base = topHeight(WALL_R, theta)

      block(group, materials.stone, width, height, 1.5, WALL_R, theta, base + height / 2)
      // Couronnement : une assise plus sombre et débordante, qui donne
      // l'épaisseur au mur vu de loin.
      block(group, materials.stoneMid, width, 0.35, 1.9, WALL_R, theta, base + height + 0.1)

      // Frise dorée, à mi-hauteur, sur les seuls pans les mieux conservés.
      if (wear < -0.25) {
        block(group, materials.gold, width, 0.22, 1.62, WALL_R, theta, base + height * 0.72)
      }

      blockers.push({
        x: Math.sin(theta) * WALL_R,
        y: base + height / 2,
        z: Math.cos(theta) * WALL_R,
        half: [width / 2, height / 2, 0.75],
        yaw: theta,
      })
    }
  }

  // --- La porte, plein sud, dans l'axe de la rampe -------------------------
  {
    const base = topHeight(WALL_R, 0)
    const gate = archway(3.6, ARCH_CLEAR + 1.4, 2.4, materials.stone)
    gate.position.set(0, base, WALL_R)
    group.add(gate)

    // La masse au-dessus de l'arche, et son bandeau de couronnement. Sans elle,
    // le plein cintre flotte entre deux tours et se lit comme une arche
    // décorative : une porte de forteresse, c'est d'abord du poids porté.
    const lintel = new Mesh(faceted(new BoxGeometry(7.4, 2.4, 2.6)), materials.stone)
    lintel.position.set(0, base + ARCH_CLEAR + 3.6, WALL_R)
    group.add(lintel)

    const capping = new Mesh(faceted(new BoxGeometry(8.2, 0.55, 3.1)), materials.stoneMid)
    capping.position.set(0, base + ARCH_CLEAR + 5.05, WALL_R)
    group.add(capping)

    // Le tympan doré : le disque emblème de la civilisation, dans l'axe de la
    // rampe d'arrivée. C'est la première dorure que le joueur voit, et elle est
    // placée là où il ne peut pas la manquer — droit devant, encadrée par les
    // deux tours.
    const emblem = new Mesh(
      faceted(new CylinderGeometry(1.5, 1.5, 0.3, 12)),
      materials.goldBright,
    )
    emblem.position.set(0, base + ARCH_CLEAR + 3.7, WALL_R + 1.25)
    emblem.rotation.x = Math.PI / 2
    group.add(emblem)

    const emblemRing = new Mesh(faceted(new TorusGeometry(2.05, 0.2, 4, 14)), materials.gold)
    emblemRing.position.set(0, base + ARCH_CLEAR + 3.7, WALL_R + 1.3)
    group.add(emblemRing)

    // Le parvis : le dallage qui prolonge la rampe jusque sous l'arche, et qui
    // dit au joueur que c'est là qu'on entre.
    const apron = new Mesh(
      new CircleGeometry(5.4, 20, Math.PI * 0.72, Math.PI * 0.56),
      toon({ color: SKY_COLORS.stoneMid }),
    )
    apron.rotation.x = -Math.PI / 2
    apron.position.set(0, base + 0.05, WALL_R)
    group.add(apron)

    // Les piédroits arrêtent, l'arche non : c'est ce couple qui fait un
    // passage. Deux boîtes étroites de part et d'autre de l'ouverture.
    for (const side of [-1, 1]) {
      blockers.push({
        x: side * 2.25,
        y: base + 1.5,
        z: WALL_R,
        half: [0.45, 1.5, 1.2],
        yaw: 0,
      })
    }

    // Deux tours de flanquement, l'une arasée : une porte symétrique se lit
    // comme neuve, et cette forteresse est tombée il y a longtemps.
    for (const [side, height] of [
      [-1, 9.5],
      [1, 5.5],
    ] as const) {
      const tower = new Group()
      tower.position.set(side * 4.6, base, WALL_R - 0.2)
      const drum = new Mesh(faceted(new CylinderGeometry(2.1, 2.4, height, 8)), materials.stone)
      drum.position.y = height / 2
      tower.add(drum)
      const crown = new Mesh(
        faceted(new CylinderGeometry(2.5, 2.2, 0.6, 8)),
        materials.stoneMid,
      )
      crown.position.y = height
      tower.add(crown)
      // Meurtrière : un simple évidement sombre suffit à donner l'échelle.
      const slit = new Mesh(faceted(new BoxGeometry(0.4, 1.5, 0.3)), materials.stoneDark)
      slit.position.set(0, height * 0.6, 2.25)
      tower.add(slit)
      group.add(tower)
    }
  }

  // --- Tours d'enceinte ----------------------------------------------------
  const towers: { x: number; y: number; z: number; height: number }[] = []
  for (const [theta, height, lean] of [
    [1.15, 11.5, 0.03],
    [2.5, 6.2, -0.06],
    [3.65, 8.4, 0.02],
    [5.0, 4.0, 0.09],
  ] as const) {
    const base = topHeight(WALL_R, theta)
    const tower = new Group()
    tower.position.set(Math.sin(theta) * WALL_R, base, Math.cos(theta) * WALL_R)
    tower.rotation.z = lean
    towers.push({
      x: Math.sin(theta) * WALL_R,
      y: base,
      z: Math.cos(theta) * WALL_R,
      height,
    })

    const drum = new Mesh(faceted(new CylinderGeometry(2.2, 2.7, height, 8)), materials.stone)
    drum.position.y = height / 2
    tower.add(drum)

    // Le couronnement est brisé en biais : une tour arasée à l'horizontale se
    // lit comme un travail inachevé, pas comme une ruine.
    const crown = new Mesh(faceted(new CylinderGeometry(2.45, 2.3, 1.1, 8)), materials.stoneMid)
    crown.position.y = height
    crown.rotation.z = 0.16
    tower.add(crown)

    // Seule la plus haute tour a gardé sa flèche dorée. Une par une, elles sont
    // tombées ; celle qui reste dit ce qu'étaient les quatre autres.
    if (height > 10) {
      const finial = new Mesh(faceted(new ConeGeometry(1.5, 3.4, 6)), materials.gold)
      finial.position.y = height + 2.2
      tower.add(finial)
      const ball = new Mesh(faceted(new OctahedronGeometry(0.6, 0)), materials.goldBright)
      ball.position.y = height + 4.3
      tower.add(ball)
    }

    group.add(tower)
  }

  // --- La salle à colonnes -------------------------------------------------
  {
    // Posée dans le quartier nord-ouest de l'enceinte, entre deux rampes.
    const center = 2.1
    const random = seededRandom(0x5a11)

    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 7; i++) {
        const theta = center + (i - 3) * 0.13
        const r = 20 + row * 6.5
        const base = topHeight(r, theta)
        const fallen = random() < 0.28

        if (fallen) {
          // Fût couché : la colonne tombée est ce qui dit qu'il y en avait plus.
          const drum = new Mesh(
            faceted(new CylinderGeometry(0.55, 0.55, 4.4, 8)),
            materials.stoneMid,
          )
          drum.position.set(Math.sin(theta) * r, base + 0.55, Math.cos(theta) * r)
          drum.rotation.z = Math.PI / 2
          drum.rotation.y = theta + random()
          group.add(drum)
          continue
        }

        const height = 4.2 + random() * 1.4
        const shaft = new Mesh(
          faceted(new CylinderGeometry(0.5, 0.62, height, 8)),
          materials.stone,
        )
        shaft.position.set(Math.sin(theta) * r, base + height / 2, Math.cos(theta) * r)
        group.add(shaft)
        blockers.push({
          x: Math.sin(theta) * r,
          y: base + height / 2,
          z: Math.cos(theta) * r,
          half: [0.62, height / 2, 0.62],
          yaw: theta,
        })

        // Chapiteau doré une fois sur trois : la salle était entièrement
        // plaquée, il n'en reste que ce que les pillards n'ont pas pu atteindre.
        const capital = new Mesh(
          faceted(new BoxGeometry(1.5, 0.5, 1.5)),
          random() < 0.34 ? materials.gold : materials.stoneMid,
        )
        capital.position.set(Math.sin(theta) * r, base + height + 0.25, Math.cos(theta) * r)
        capital.rotation.y = theta
        group.add(capital)

        // Un tronçon d'architrave subsiste sur deux travées : c'est ce qui
        // prouve qu'il y avait un toit.
        if (i < 3) {
          const beam = new Mesh(faceted(new BoxGeometry(0.8, 0.55, 2.9)), materials.stoneMid)
          const mid = theta + 0.065
          beam.position.set(Math.sin(mid) * r, base + height + 0.7, Math.cos(mid) * r)
          beam.rotation.y = mid + Math.PI / 2
          group.add(beam)
        }
      }
    }
  }

  // --- La rotonde centrale, éventrée ---------------------------------------
  {
    const base = CORE_Y
    const random = seededRandom(0x30d3)

    for (let i = 0; i < ROTUNDA_PIERS; i++) {
      const theta = rotundaPierAngle(i)
      const ruined = RUINED_BAYS.includes(i)
      const height = ruined ? 1.2 + random() * 1.4 : ARCH_CLEAR + 1.8

      // Le pilier, articulé en trois : socle, fût, imposte. Un parallélépipède
      // nu se lit comme une dalle dressée ; ce sont les deux débords qui en
      // font un élément d'architecture, et ils coûtent deux boîtes.
      const shaft = new Mesh(faceted(new BoxGeometry(1.5, height, 1.9)), materials.stone)
      shaft.position.set(Math.sin(theta) * ROTUNDA_R, base + height / 2, Math.cos(theta) * ROTUNDA_R)
      shaft.rotation.y = theta
      group.add(shaft)
      blockers.push({
        x: Math.sin(theta) * ROTUNDA_R,
        y: base + height / 2,
        z: Math.cos(theta) * ROTUNDA_R,
        half: [0.75, height / 2, 0.95],
        yaw: theta,
      })

      const plinth = new Mesh(faceted(new BoxGeometry(2.1, 0.55, 2.5)), materials.stoneMid)
      plinth.position.set(Math.sin(theta) * ROTUNDA_R, base + 0.28, Math.cos(theta) * ROTUNDA_R)
      plinth.rotation.y = theta
      group.add(plinth)

      if (ruined) continue

      const impost = new Mesh(faceted(new BoxGeometry(2, 0.45, 2.4)), materials.stoneMid)
      impost.position.set(
        Math.sin(theta) * ROTUNDA_R,
        base + height - 0.22,
        Math.cos(theta) * ROTUNDA_R,
      )
      impost.rotation.y = theta
      group.add(impost)

      if (RUINED_BAYS.includes((i + 1) % ROTUNDA_PIERS)) continue

      /*
        L'arc jeté vers le pilier suivant, posé sur le **milieu de la corde** et
        non sur le cercle des piliers.

        C'est une erreur qu'on ne voit qu'une fois construite : le sommet d'un
        arc tendu entre deux points d'un cercle est en retrait de ces points, de
        `1 − cos(π/n)`. Placé sur le cercle, l'arc déborde vers l'extérieur et
        ses naissances flottent à côté des piliers au lieu d'y reposer.
      */
      const mid = theta + Math.PI / ROTUNDA_PIERS
      const chordR = ROTUNDA_R * Math.cos(Math.PI / ROTUNDA_PIERS)
      const span = 2 * ROTUNDA_R * Math.sin(Math.PI / ROTUNDA_PIERS)

      const arc = new Mesh(
        faceted(new TorusGeometry(span / 2, 0.42, 4, 12, Math.PI)),
        materials.stone,
      )
      arc.position.set(Math.sin(mid) * chordR, base + height, Math.cos(mid) * chordR)
      arc.rotation.y = mid + Math.PI / 2
      group.add(arc)

      // Corniche au-dessus de l'arc : la ligne horizontale qui tient l'ensemble.
      const cornice = new Mesh(faceted(new BoxGeometry(span + 1.4, 0.5, 2.3)), materials.stoneMid)
      cornice.position.set(
        Math.sin(mid) * chordR,
        base + height + span / 2 + 0.3,
        Math.cos(mid) * chordR,
      )
      cornice.rotation.y = mid
      group.add(cornice)
    }

    /*
      Ce qui reste de la coupole, et c'est la pièce maîtresse : **elle était
      couverte d'or**. Trois quartiers subsistent, le reste est ouvert au ciel :
      la coupole s'est effondrée seule, sous son propre poids, quand plus
      personne n'était là pour l'entretenir.

      **Un encorbellement et non une calotte.** Une portion de sphère aplatie,
      vue depuis le sol de l'arène, se présente par la tranche : elle se lit
      comme un auvent posé de travers, pas comme un dôme. Des anneaux de pierre
      empilés, chacun un peu plus étroit et un peu plus haut que le précédent,
      donnent au contraire une silhouette en escalier que la facette rend
      parfaitement, et qui est celle des coupoles bâties sans cintre. Second
      mérite : un encorbellement se ruine par le haut, anneau par anneau, ce qui
      rend la brèche évidente.

      Deux coques par anneau : la couverture dorée, et dessous la maçonnerie
      grise qu'elle protégeait. La tranche des anneaux cassés laisse donc voir
      les deux matières — exactement ce qu'on voit sur un dôme crevé.
    */
    const SPRING =
      base + ARCH_CLEAR + 1.8 + (2 * ROTUNDA_R * Math.sin(Math.PI / ROTUNDA_PIERS)) / 2 + 0.55
    const DOME_RISE = 7.5

    const COURSES: [number, number, [number, number][]][] = [
      [11.9, 0.0, [[0.3, 1.55], [2.5, 1.15], [4.3, 1.35]]],
      [10.8, 1.5, [[0.45, 1.3], [2.65, 0.95], [4.45, 1.1]]],
      [9.1, 2.9, [[0.6, 0.95], [2.85, 0.6]]],
      [6.7, 4.1, [[0.75, 0.55]]],
    ]

    for (const [radius, rise, arcs] of COURSES) {
      for (const [start, length] of arcs) {
        const y = SPRING + (rise / 4.1) * DOME_RISE

        const skin = new Mesh(
          faceted(new CylinderGeometry(radius - 0.5, radius + 0.15, 1.5, 22, 1, true, start, length)),
          toon({
            color: SKY_COLORS.gold,
            emissive: SKY_COLORS.gold,
            emissiveIntensity: 0.2,
            side: DoubleSide,
          }),
        )
        skin.position.y = y
        group.add(skin)

        const core = new Mesh(
          faceted(
            new CylinderGeometry(radius - 0.95, radius - 0.3, 1.5, 20, 1, true, start + 0.03, length - 0.06),
          ),
          toon({ color: SKY_COLORS.stoneMid, side: DoubleSide }),
        )
        core.position.y = y
        group.add(core)
      }
    }

    // Dallage de l'arène, posé au ras du sol.
    const floor = new Mesh(
      new RingGeometry(0.4, ROTUNDA_R - 0.8, 40, 1),
      toon({ color: SKY_COLORS.stone }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = base + 0.06
    group.add(floor)

    /*
      La mosaïque d'or incrustée dans le dallage : trois anneaux concentriques
      et douze rais.

      Elle a une raison d'être au-delà de l'ornement — c'est le sol de la future
      arène du boss, et un sol uni ne donne au joueur aucun repère pour juger
      une distance d'esquive. Des anneaux à rayon connu lui en donnent, sans
      qu'aucun texte n'ait à le lui dire. L'or rend la lecture immédiate, et la
      civilisation prospère paie l'addition.
    */
    for (const radius of [3.4, 6.6, 9.6]) {
      const inlay = new Mesh(new RingGeometry(radius - 0.22, radius + 0.22, 48), materials.gold)
      inlay.rotation.x = -Math.PI / 2
      inlay.position.y = base + 0.1
      group.add(inlay)
    }

    for (let i = 0; i < 12; i++) {
      const theta = (i / 12) * Math.PI * 2
      const ray = new Mesh(new PlaneGeometry(0.3, 9.4), materials.goldDim)
      ray.rotation.x = -Math.PI / 2
      ray.rotation.z = -theta
      ray.position.set(Math.sin(theta) * 5.1, base + 0.09, Math.cos(theta) * 5.1)
      group.add(ray)
    }
  }

  // --- L'aqueduc -----------------------------------------------------------
  /*
    Une arcade qui porte un canal, en travers de la terrasse du jardin.

    C'est la pièce qui dit « civilisation prospère » mieux que n'importe quelle
    dorure : personne ne bâtit un aqueduc pour la beauté du geste. Un mur doré
    est de la richesse ; un aqueduc est de l'ingénierie, donc du temps, donc un
    État. Et il travaille pour le niveau — il porte l'eau des cascades, et il
    trace une horizontale forte dans un terrain qui monte.
  */
  {
    const from = 1.15
    const to = 0.28
    const SPANS = 7
    const DECK = 6.6
    const FALLEN = [2, 5]

    for (let i = 0; i <= SPANS; i++) {
      const t = i / SPANS
      const theta = from + (to - from) * t
      const r = 26 - t * 8
      const base = topHeight(r, theta)
      const height = DECK - (base - GARDEN_Y)
      // Deux piles écroulées : l'aqueduc est une ruine comme le reste, et les
      // brèches laissent passer le joueur dessous plutôt que de barrer la
      // terrasse d'un mur continu.
      const fallen = FALLEN.includes(i)

      if (!fallen) {
        const pier = new Mesh(faceted(new BoxGeometry(1.5, height, 1.9)), materials.stone)
        pier.position.set(Math.sin(theta) * r, base + height / 2, Math.cos(theta) * r)
        pier.rotation.y = theta
        group.add(pier)
        blockers.push({
          x: Math.sin(theta) * r,
          y: base + height / 2,
          z: Math.cos(theta) * r,
          half: [0.75, height / 2, 0.95],
          yaw: theta,
        })
      }

      if (i === SPANS || fallen || FALLEN.includes(i + 1)) continue

      const nextTheta = from + (to - from) * ((i + 1) / SPANS)
      const nextR = 26 - ((i + 1) / SPANS) * 8
      const ax = Math.sin(theta) * r
      const az = Math.cos(theta) * r
      const bx = Math.sin(nextTheta) * nextR
      const bz = Math.cos(nextTheta) * nextR
      const span = Math.hypot(bx - ax, bz - az)
      const yaw = Math.atan2(bx - ax, bz - az) + Math.PI / 2

      const arc = new Mesh(faceted(new TorusGeometry(span / 2, 0.38, 4, 12, Math.PI)), materials.stone)
      arc.position.set((ax + bx) / 2, base + height, (az + bz) / 2)
      arc.rotation.y = yaw
      group.add(arc)

      const deck = new Mesh(faceted(new BoxGeometry(span + 0.6, 0.9, 2.2)), materials.stoneMid)
      deck.position.set((ax + bx) / 2, base + height + span / 2 + 0.45, (az + bz) / 2)
      deck.rotation.y = yaw
      group.add(deck)

      // Le filet d'eau que le canal porte encore. Il vit ici et non dans le
      // module de l'eau : c'est une pièce de l'aqueduc, et le séparer de son
      // ouvrage le ferait dériver au premier réglage de la travée.
      const stream = new Mesh(new PlaneGeometry(span + 0.6, 1.1), materials.water)
      stream.rotation.x = -Math.PI / 2
      stream.rotation.z = -Math.atan2((ax + bx) / 2, (az + bz) / 2)
      stream.position.set((ax + bx) / 2, base + height + span / 2 + 0.92, (az + bz) / 2)
      group.add(stream)
    }
  }

  // --- Statues sur l'allée d'honneur ---------------------------------------
  /*
    Six socles le long de la montée sud, dont la moitié n'a plus sa statue.
    L'allée bordée de figures est le marqueur de prospérité le moins cher à
    modéliser et le plus lisible : elle dit qu'on arrivait ici en cortège.
  */
  {
    const random = seededRandom(0x2b7f)
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? 1 : -1
      const r = 34 + Math.floor(i / 2) * 4.6
      const theta = (side * 2.9) / r
      const base = topHeight(r, theta)

      const plinth = new Mesh(faceted(new BoxGeometry(1.6, 1.5, 1.6)), materials.stone)
      plinth.position.set(Math.sin(theta) * r, base + 0.75, Math.cos(theta) * r)
      plinth.rotation.y = theta
      group.add(plinth)
      blockers.push({
        x: Math.sin(theta) * r,
        y: base + 0.75,
        z: Math.cos(theta) * r,
        half: [0.8, 0.75, 0.8],
        yaw: theta,
      })

      if (random() < 0.45) continue

      // La figure, très schématique : une silhouette drapée, sans tête pour la
      // moitié d'entre elles. À la distance où la caméra du jeu les montre, une
      // masse juste proportionnée en dit autant qu'un modèle détaillé.
      const body = new Mesh(
        faceted(new CylinderGeometry(0.42, 0.72, 2.6, 7)),
        materials.stoneMid,
      )
      body.position.set(Math.sin(theta) * r, base + 2.8, Math.cos(theta) * r)
      group.add(body)

      if (random() < 0.5) {
        const head = new Mesh(faceted(new IcosahedronGeometry(0.42, 0)), materials.stoneMid)
        head.position.set(Math.sin(theta) * r, base + 4.4, Math.cos(theta) * r)
        group.add(head)
        // Une couronne dorée sur celles qui ont gardé leur tête.
        const crown = new Mesh(faceted(new TorusGeometry(0.4, 0.09, 3, 10)), materials.gold)
        crown.position.set(Math.sin(theta) * r, base + 4.62, Math.cos(theta) * r)
        crown.rotation.x = Math.PI / 2
        group.add(crown)
      }
    }
  }

  // --- Blocs tombés sur la prairie -----------------------------------------
  {
    const random = seededRandom(0x9b12)
    for (let i = 0; i < 26; i++) {
      const theta = random() * Math.PI * 2
      const r = 36 + random() * 15
      const base = topHeight(r, theta)
      const size = 0.8 + random() * 1.6
      const stone = new Mesh(
        faceted(new BoxGeometry(size * 1.5, size, size * 1.2)),
        random() < 0.5 ? materials.stoneMid : materials.stoneDark,
      )
      stone.position.set(Math.sin(theta) * r, base + size * 0.35, Math.cos(theta) * r)
      stone.rotation.set(random() * 0.3, random() * Math.PI, random() * 0.3)
      group.add(stone)
    }
  }

  return { group, blockers, towers }
}

/**
 * Construits à l'import du fragment, donc pendant que le voile de transition
 * couvre l'écran. Dans un `useMemo`, ces deux cents maillages se seraient bâtis
 * à la frame où l'île apparaît — celle où React démonte déjà tout le continent,
 * ses colliders de végétation compris. C'est cette frame-là qui saccadait.
 */
const RUINS = buildRuins()

export function Ruins() {
  const { group, blockers, towers } = RUINS

  return (
    <>
      <primitive object={group} />

      {/*
        Les colliders, dans un seul corps fixe.

        Seules les pièces qui doivent **arrêter** le joueur en ont un : pans
        d'enceinte, piédroits de la porte, colonnes debout, piliers de la
        rotonde, piles d'aqueduc, socles de statue, et les quatre tours. Une
        centaine de cuboïdes fixes, ce qui n'est rien pour Rapier.

        Ce qui n'en a **pas**, et chaque cas est un choix :
         - les arcs, les corniches et la coupole, parce qu'on doit passer
           dessous — c'est tout l'intérêt d'une arche ;
         - les blocs tombés et les fûts couchés, parce qu'un obstacle d'une
           unité de haut est un **mur** pour un personnage sans autostep. Sans
           collider, on marche par-dessus, ce qui est le comportement attendu ;
         - les dorures, la mosaïque et le parvis, qui ne sont pas de la matière.
      */}
      <RigidBody type="fixed" colliders={false} friction={1}>
        {blockers.map((b, index) => (
          <CuboidCollider
            key={index}
            args={b.half}
            position={[b.x, b.y, b.z]}
            rotation={[0, b.yaw, 0]}
          />
        ))}
        {towers.map((tower, index) => (
          <CylinderCollider
            key={`tower-${index}`}
            args={[tower.height / 2, 2.45]}
            position={[tower.x, tower.y + tower.height / 2, tower.z]}
          />
        ))}
      </RigidBody>
    </>
  )
}
