import { useMemo } from 'react'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  MeshToonMaterial,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { NAKANO } from '../../config/landmarks'
import {
  ARCH_CLEAR,
  CORE_Y,
  SKY_COLORS,
  TREE_TOP,
  WALL_H,
  WALL_R,
  islandNoise,
  rimRadius,
  surfaceRelief,
  topHeight,
  topSlope,
  underHeight,
  underRadius,
} from '../../config/skyIsland'
import { smoothstep } from '../../config/world'
import { toonGradient } from '../models/toonGradient'

/**
 * L'Île Céleste, vue depuis le continent.
 *
 * C'est le **double lointain** de l'île réelle, et c'est ce qui permet de ne
 * charger celle-ci qu'au franchissement du portail tout en la montrant dès
 * l'écran de départ.
 *
 * **Elle est dérivée de l'île, pas dessinée à côté.** Le relief sort des mêmes
 * fonctions, échantillonné plus grossièrement ; l'enceinte applique la même
 * règle d'usure, donc ses brèches tombent aux mêmes caps ; les tours ont les
 * hauteurs des vraies. Le joueur qui franchit le portail atterrit sur l'île
 * qu'il regardait, et non sur une autre qui lui ressemblait de loin. Une
 * silhouette inventée aurait été plus simple à écrire et se serait trahie au
 * premier réglage de l'enceinte.
 *
 * Environ 2 800 triangles, une seule géométrie à couleurs par sommet, un seul
 * matériau — donc **un seul appel de dessin**, pour un objet qui ne bouge pas,
 * ne s'anime pas et n'a pas de physique. Pour comparaison, la végétation du
 * continent en dessine plusieurs dizaines de milliers.
 */

/*
  Où l'île se tient dans le ciel, et pourquoi si bas.

  Trois nombres, et aucun n'est choisi à l'œil — ils sortent tous du cadrage de
  la caméra, qui plonge de 17° pour un demi-champ vertical de 24° (voir `CAMERA`
  dans `config/gameplay.ts`). Le bord haut de l'image est donc à **7° au-dessus
  de l'horizontale**, et la ligne d'horizon tombe aux 85 % de la hauteur d'écran :
  tout ce qui dépasse 7° est hors cadre en permanence.

  À cinq cents unités au nord de la pagode et trente-huit au-dessus du niveau de
  la mer, l'île se pose à 2,7° — au milieu du bandeau visible. L'instinct dirait
  de la monter « plus haut dans le ciel » ; ça la ferait purement et simplement
  disparaître.

  Le décalage de quatre-vingt-dix vers l'est n'est pas une correction mais une
  composition : pile dans l'axe de la pagode, elle se lirait comme une cible de
  visée. Légèrement de côté, elle appartient au paysage.

  La position est **fixe dans le monde**, pas accrochée à la caméra : elle
  grossit donc à mesure qu'on marche vers le nord, ce qui récompense
  l'exploration sans une ligne de code de plus.
*/
const DISTANT = {
  x: NAKANO.x + 90,
  y: 38,
  z: NAKANO.z - 500,
}

/**
 * Résolution de la silhouette.
 *
 * Quarante-quatre secteurs et non vingt-six : à vingt-six, le contour se lisait
 * en segments droits et le socle en facettes trop larges pour que sa roche
 * paraisse rugueuse. C'est le seul poste où quelques centaines de triangles
 * changent vraiment quelque chose à l'image.
 *
 * Le socle porte **plus d'anneaux que le dessus**, ce qui est l'inverse de l'île
 * réelle : c'est lui qu'on voit presque en entier depuis le continent, alors que
 * le dessus, regardé par en dessous, n'est qu'une tranche.
 */
const SECTORS = 44
const TOP_RINGS = 9
const UNDER_RINGS = 16

/** Mélange une couleur vers le bleu d'horizon, dans la proportion voulue. */
function hazed(color: number, haze: number) {
  return new Color(color).lerp(new Color(SKY_COLORS.haze), haze)
}

/**
 * Déplie une géométrie et lui donne **une** couleur, brume comprise.
 *
 * Les attributs sont ramenés à position et normale : `mergeGeometries` refuse un
 * lot où certaines pièces portent un `uv` et d'autres non, et rien ici n'est
 * texturé.
 *
 * La brume est **cuite dans les couleurs** plutôt que laissée au brouillard de
 * la scène. Celui du jeu sature à 200 unités (voir le `<fog>` d'`App.tsx`) : une
 * île posée à 500 en serait entièrement effacée. On mélange donc chaque couleur
 * vers le bleu d'horizon, dans la proportion qu'aurait donnée la perspective
 * atmosphérique. C'est la vieille recette des fonds de décor peints, et elle ne
 * coûte rien à l'exécution.
 */
function tint(geometry: BufferGeometry, color: number, haze: number) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  flat.computeVertexNormals()
  for (const name of Object.keys(flat.attributes)) {
    if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name)
  }

  const shaded = hazed(color, haze)
  const count = flat.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = shaded.r
    colors[i * 3 + 1] = shaded.g
    colors[i * 3 + 2] = shaded.b
  }
  flat.setAttribute('color', new BufferAttribute(colors, 3))
  return flat
}

/**
 * Une surface radiale grossière : le dessus, ou le socle.
 *
 * Colorée **par sommet**, et c'est ce qui fait la moitié de l'image : un aplat
 * vert donnerait une galette, alors que la pierre des falaises dessine les trois
 * terrasses en anneaux et que le dégradé du socle lui donne sa profondeur. Les
 * critères sont ceux de l'île réelle — la pente pour le dessus, l'enfoncement
 * pour le socle — donc les deux se ressemblent vraiment.
 */
function coarseSurface(under: boolean) {
  const rings = under ? UNDER_RINGS : TOP_RINGS
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  for (let ring = 0; ring <= rings; ring++) {
    const t = under ? 1 - ring / rings : ring / rings
    for (let s = 0; s <= SECTORS; s++) {
      const theta = (s / SECTORS) * Math.PI * 2
      const r = under ? underRadius(t, theta) : t * rimRadius(theta)
      // Le relief de surface est compté ici aussi, alors qu'il est invisible à
      // cinq cents unités : c'est lui qui fait tomber le bord du dessus
      // exactement sur `rimHeight`, donc exactement sur le haut du socle. Sans
      // lui, la silhouette s'ouvre sur le ciel — c'est le défaut qu'a eu l'île
      // elle-même, et il se voyait d'un bout à l'autre de la carte.
      const y = under
        ? underHeight(t, theta)
        : topHeight(r, theta) + surfaceRelief(r, theta)
      positions.push(Math.sin(theta) * r, y, Math.cos(theta) * r)

      let color: Color
      if (under) {
        // La roche s'assombrit et se noie dans la brume à mesure qu'on descend ;
        // la pointe s'allume du violet du cristal qui y est enchâssé.
        color = hazed(SKY_COLORS.rock, 0.5)
        color.lerp(hazed(SKY_COLORS.rockDeep, 0.66), 1 - t)
        color.lerp(hazed(SKY_COLORS.crystal, 0.45), smoothstep(0.3, 0.02, t) * 0.5)
      } else {
        const grain = islandNoise(r * 0.09, theta * 3.1)
        color = hazed(SKY_COLORS.lawn, 0.44)
        color.lerp(hazed(SKY_COLORS.lawnDark, 0.46), 0.3 + grain * 0.3)
        // La pierre des falaises : c'est elle qui dessine les terrasses en
        // anneaux, et sans elle le dessus n'est qu'un disque vert uni.
        color.lerp(hazed(SKY_COLORS.stoneMid, 0.5), smoothstep(0.5, 1.4, topSlope(r, theta)))
        // La lèvre, plus sombre : elle sépare le vert de la roche au lieu de
        // laisser les deux se toucher sans transition.
        color.lerp(hazed(SKY_COLORS.stoneDark, 0.55), smoothstep(50, 55.5, r))
      }
      colors.push(color.r, color.g, color.b)
    }
  }

  const stride = SECTORS + 1
  for (let ring = 0; ring < rings; ring++) {
    for (let s = 0; s < SECTORS; s++) {
      const a = ring * stride + s
      const b = a + stride
      if (under) indices.push(a, a + 1, b, a + 1, b + 1, b)
      else indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  const flat = geometry.toNonIndexed()
  flat.computeVertexNormals()
  return flat
}

/**
 * La silhouette bâtie, dérivée des vraies cotes.
 *
 * Pas de boîtes posées à l'estime : l'enceinte applique la règle d'usure de
 * `Ruins.tsx`, donc ses brèches tombent aux mêmes caps, et les tours ont les
 * hauteurs des vraies. C'est ce qui fait qu'on reconnaît l'île en arrivant
 * dessus, et ce qui évite qu'un réglage de l'enceinte fasse mentir le ciel.
 */
function buildMassing() {
  const parts: BufferGeometry[] = []
  const HAZE = 0.5

  // L'enceinte : vingt pans au lieu de soixante-douze, mais les mêmes brèches.
  const SEGMENTS = 20
  for (let i = 0; i < SEGMENTS; i++) {
    const theta = (i / SEGMENTS) * Math.PI * 2
    const wear = islandNoise(Math.cos(theta) * 2.6, Math.sin(theta) * 2.6)
    if (wear > 0.5) continue

    const height = WALL_H * (0.42 + 0.58 * smoothstep(0.5, -1.0, wear))
    const width = (Math.PI * 2 * WALL_R) / SEGMENTS + 0.4
    const base = topHeight(WALL_R, theta)
    const wall = new BoxGeometry(width, height, 1.6)
    wall.rotateY(theta)
    wall.translate(Math.sin(theta) * WALL_R, base + height / 2, Math.cos(theta) * WALL_R)
    parts.push(tint(wall, SKY_COLORS.stone, HAZE))
  }

  // Les quatre tours, aux caps et aux hauteurs des vraies.
  for (const [theta, height] of [
    [1.15, 11.5],
    [2.5, 6.2],
    [3.65, 8.4],
    [5.0, 4.0],
  ] as const) {
    const base = topHeight(WALL_R, theta)
    const drum = new CylinderGeometry(2.2, 2.7, height, 6)
    drum.translate(Math.sin(theta) * WALL_R, base + height / 2, Math.cos(theta) * WALL_R)
    parts.push(tint(drum, SKY_COLORS.stone, HAZE - 0.04))

    // La flèche dorée de la grande tour reste dorée : c'est le seul point de
    // l'île qui accroche la lumière d'assez loin pour valoir ses triangles.
    if (height > 10) {
      const finial = new ConeGeometry(1.5, 3.6, 5)
      finial.translate(Math.sin(theta) * WALL_R, base + height + 1.8, Math.cos(theta) * WALL_R)
      parts.push(tint(finial, SKY_COLORS.gold, 0.3))
    }
  }

  // Les deux tours de la porte, plein sud.
  {
    const base = topHeight(WALL_R, 0)
    for (const [side, height] of [
      [-1, 9.5],
      [1, 5.5],
    ] as const) {
      const drum = new CylinderGeometry(2.1, 2.4, height, 6)
      drum.translate(side * 4.6, base + height / 2, WALL_R)
      parts.push(tint(drum, SKY_COLORS.stone, HAZE - 0.04))
    }
  }

  // La rotonde : son tambour, et sa coupole dorée.
  {
    const height = ARCH_CLEAR + 1.8
    const drum = new CylinderGeometry(11.5, 11.5, height, 10)
    drum.translate(0, CORE_Y + height / 2, 0)
    parts.push(tint(drum, SKY_COLORS.stoneMid, HAZE))

    /*
      La coupole, **plus petite et plus embrumée que l'instinct ne le voudrait**.

      À 0,38 de brume elle virait à l'orange vif et devenait le sujet de
      l'image : on ne voyait plus une île avec un dôme doré, mais une tache
      orange posée sur du vert. L'or est ce qui accroche le regard de loin — il
      faut donc le doser à l'inverse de ce qu'on croit, et le laisser affleurer
      plutôt que briller. À 0,52 il reste doré sans prendre le dessus, et la
      flèche de la grande tour redevient le point le plus vif de la silhouette.
    */
    const dome = new CylinderGeometry(6.2, 10.8, 2.6, 10)
    dome.translate(0, CORE_Y + height + 1.3, 0)
    parts.push(tint(dome, SKY_COLORS.gold, 0.52))
  }

  // L'arbre, à la hauteur réelle : c'est lui qui donne l'échelle de l'île.
  {
    const trunkH = TREE_TOP - CORE_Y - 5
    const trunk = new CylinderGeometry(2.2, 5.4, trunkH, 6)
    trunk.translate(0, CORE_Y + trunkH / 2, 0)
    parts.push(tint(trunk, SKY_COLORS.bark, 0.45))

    // Couronne étagée plutôt qu'une boule : à cette distance, c'est la découpe
    // contre le ciel qui se lit, et une boule se lit comme une sucette.
    for (const [x, y, z, s, light] of [
      [0, TREE_TOP - 3.4, 0, 9.2, true],
      [-7.6, TREE_TOP - 5.6, 3.4, 6.2, false],
      [7.2, TREE_TOP - 5.2, -3.8, 6.6, true],
      [-2.8, TREE_TOP - 1.2, -5.4, 5.2, false],
    ] as const) {
      const blob = new IcosahedronGeometry(s, 0)
      blob.scale(1, 0.58, 1)
      blob.translate(x, y, z)
      parts.push(tint(blob, light ? SKY_COLORS.leaf : SKY_COLORS.leafDark, 0.42))
    }
  }

  return parts
}

function buildImpostor() {
  const parts: BufferGeometry[] = [
    coarseSurface(false),
    coarseSurface(true),
    ...buildMassing(),
  ]
  const merged = mergeGeometries(parts)!
  merged.computeVertexNormals()
  return merged
}

export function SkyIslandDistant() {
  const mesh = useMemo(() => {
    const object = new Mesh(
      buildImpostor(),
      new MeshToonMaterial({
        gradientMap: toonGradient,
        vertexColors: true,
        // Hors brouillard : celui du jeu sature à 200 unités et effacerait
        // l'île. Sa brume est déjà peinte dans ses couleurs — voir `tint`.
        fog: false,
      }),
    )
    object.position.set(DISTANT.x, DISTANT.y, DISTANT.z)
    // Ni ombre reçue ni ombre projetée : la caméra d'ombres est cadrée sur le
    // joueur, sur quarante-deux unités de demi-largeur. À cinq cents, l'île n'y
    // entre jamais — l'y faire entrer coûterait une passe pour rien.
    object.name = 'sky-island-distant'
    return object
  }, [])

  return <primitive object={mesh} />
}
