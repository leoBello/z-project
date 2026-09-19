import { useMemo } from 'react'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  MeshToonMaterial,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { NAKANO } from '../../config/landmarks'
import {
  SKY_COLORS,
  rimRadius,
  topHeight,
  underHeight,
  underRadius,
} from '../../config/skyIsland'
import { toonGradient } from '../models/toonGradient'

/**
 * L'Île Céleste, vue depuis le continent.
 *
 * C'est le **double lointain** de l'île réelle, et c'est ce qui permet de ne
 * charger celle-ci qu'au franchissement du portail tout en la montrant dès
 * l'écran de départ. À cinq cents unités, l'île n'occupe qu'une poignée de
 * pixels de haut : son relief détaillé, ses cent cinquante blocs de pierre, sa
 * végétation et ses colliders n'y changeraient rien de visible.
 *
 * On en fabrique donc une **silhouette** : le même relief, échantillonné cinq
 * fois plus grossièrement, la forteresse réduite à sept boîtes, la couronne de
 * l'arbre à deux boules. Tout est fondu en une seule géométrie à couleurs par
 * sommet — donc **un seul appel de dessin**, pour un objet qui ne bouge pas, ne
 * s'anime pas et n'a pas de physique.
 *
 * Ce fichier vit dans le tronc commun et non dans le fragment de l'île : il
 * importe donc `config/skyIsland.ts`, qui s'y retrouve aussi. C'est voulu et
 * sans coût — ce module est de la pure arithmétique, quelques centaines
 * d'octets une fois minifié. Ce qui pèse (les composants, les géométries des
 * vestiges) reste dans le fragment.
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

/** Résolution de la silhouette. Cinq fois plus grossière que l'île réelle. */
const SECTORS = 26
const RINGS = 10

/**
 * Déplie une géométrie et lui donne une couleur par sommet, brume comprise.
 *
 * Les attributs sont ramenés à **position et normale**, et ce n'est pas du
 * ménage : `mergeGeometries` refuse un lot où certaines pièces portent un `uv`
 * et d'autres non. Les primitives de three en ont un, les surfaces radiales
 * construites ici n'en ont pas, et aucune des deux n'en a besoin — rien de tout
 * ça n'est texturé.
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

  const shaded = new Color(color).lerp(new Color(SKY_COLORS.haze), haze)
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

/** Une surface radiale grossière : le dessus, ou le socle. */
function coarseSurface(under: boolean) {
  const positions: number[] = []
  const indices: number[] = []

  for (let ring = 0; ring <= RINGS; ring++) {
    const t = under ? 1 - ring / RINGS : ring / RINGS
    for (let s = 0; s <= SECTORS; s++) {
      const theta = (s / SECTORS) * Math.PI * 2
      const r = under ? underRadius(t, theta) : t * rimRadius(theta)
      const y = under ? underHeight(t, theta) : topHeight(r, theta)
      positions.push(Math.sin(theta) * r, y, Math.cos(theta) * r)
    }
  }

  const stride = SECTORS + 1
  for (let ring = 0; ring < RINGS; ring++) {
    for (let s = 0; s < SECTORS; s++) {
      const a = ring * stride + s
      const b = a + stride
      if (under) indices.push(a, a + 1, b, a + 1, b + 1, b)
      else indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

function buildImpostor() {
  const parts: BufferGeometry[] = []

  // La roche du dessous est plus brumée que la pelouse du dessus : elle est plus
  // loin de la lumière, et l'œil l'attend plus sombre et plus bleue.
  parts.push(tint(coarseSurface(false), SKY_COLORS.lawn, 0.46))
  parts.push(tint(coarseSurface(true), SKY_COLORS.rock, 0.62))

  // La masse bâtie : sept boîtes, pas une de plus. À cette distance, ce qui se
  // lit d'une forteresse c'est sa découpe contre le ciel, pas ses arcades.
  const massing: [number, number, number, number, number, number][] = [
    [0, 9.0, 0, 14, 9, 14],
    [0, 15.5, 0, 6, 8, 6],
    [-9, 6.2, 7, 5, 5, 5],
    [10, 7.4, -6, 4.5, 8, 4.5],
    [26, 5.4, 10, 5, 4, 5],
    [-24, 5.0, -14, 4, 3.4, 4],
    [8, 5.2, 27, 4, 3, 4],
  ]
  for (const [x, y, z, w, h, d] of massing) {
    parts.push(tint(new BoxGeometry(w, h, d).translate(x, y, z), SKY_COLORS.stone, 0.5))
  }

  // La flèche dorée reste dorée : c'est le seul point de l'île qui accroche la
  // lumière d'assez loin pour valoir son triangle.
  parts.push(
    tint(new ConeGeometry(2, 5, 5).translate(10, 15, -6), SKY_COLORS.gold, 0.35),
  )

  // La couronne de l'arbre : deux boules aplaties.
  for (const [x, y, z, s] of [
    [0, 23, 0, 11],
    [-6, 20, 5, 7.5],
  ] as const) {
    const blob = new IcosahedronGeometry(s, 0)
    blob.scale(1, 0.6, 1)
    blob.translate(x, y, z)
    parts.push(tint(blob, SKY_COLORS.leaf, 0.42))
  }

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
