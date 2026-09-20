import { useEffect, useMemo, useRef, useState } from 'react'
import { BIOMES, MINIMAP_WATER } from '../config/biomes'
import { useI18n } from '../i18n/useI18n'
import { ENEMIES } from '../config/enemies'
import { LANDMARKS } from '../config/landmarks'
import { PORTAL } from '../config/portal'
import { SKY_COLORS, rimRadius, topHeight, topSlope } from '../config/skyIsland'
import {
  ISLAND_MAP_CENTER_X,
  ISLAND_MAP_CENTER_Z,
  ISLAND_MAP_SIZE,
  MOUNT_BASE_R,
  MOUNT_H,
  mountainHeight,
  mountainLocal,
  mountainSlope,
  nearCauseway,
} from '../config/skyMountain'
import {
  ARENA_R,
  MARSH_MAP_CENTER_X,
  MARSH_MAP_CENTER_Z,
  MARSH_MAP_SIZE,
  MARSH_PORTAL,
  CAUSEWAY,
  DECK_HALF,
  TREE,
} from '../config/rotMarsh'
import { ROT_COLORS } from '../config/rotPalette'
import {
  BEYOND_ARENA,
  BEYOND_MAP_CENTER_X,
  BEYOND_MAP_CENTER_Z,
  BEYOND_MAP_SIZE,
  BEYOND_PORTAL,
  BEYOND_SHAPE,
  SANCTUARY,
} from '../config/beyond'
import { CONTINENT_SHAPE } from '../config/continentShape'
import type { WorldShape } from '../config/worldShape'
import { enemyRegistry } from '../state/enemyRegistry'
import { playerTransform } from '../state/playerTransform'
import { useGameStore } from '../store/useGameStore'
import type { BiomeId, MapId } from '../types/game'

/** Résolution du fond de carte, en pixels. Indépendante de la taille affichée. */
const MAP_RESOLUTION = 220

/**
 * Violet du portail sur la minimap.
 *
 * Plus clair que celui de la scène 3D (`#8b3ff0`) : le fond de carte est
 * sombre par endroits — l'eau profonde, l'ombre de la montagne — et un violet
 * saturé s'y perdait. Aucun autre repère de la carte n'approche cette teinte,
 * c'est ce qui compte.
 */
const PORTAL_MINIMAP_COLOR = '#c79bff'

/**
 * Le fond de carte du Marais d'Aeonia.
 *
 * **Dessiné, et non échantillonné.** Les deux autres fonds interrogent un relief
 * pixel par pixel — quarante-huit mille appels, une cinquantaine de
 * millisecondes — parce qu'ils ont un relief à montrer. Le Marais n'en a pas :
 * c'est une nappe plate, et tout ce qu'on y voit est un petit nombre d'objets
 * posés dessus. Le décrire avec cinq primitives de canvas coûte une fraction de
 * milliseconde et donne une image plus lisible qu'un champ de hauteurs qui
 * serait uniforme partout.
 *
 * Ce que la carte doit dire, et rien d'autre : où est le chemin, où est l'arbre,
 * et où est la porte. Un joueur qui regarde cette vignette cherche à savoir s'il
 * est encore sur les racines.
 */
function renderMarshMap() {
  const canvas = document.createElement('canvas')
  canvas.width = MAP_RESOLUTION
  canvas.height = MAP_RESOLUTION

  const context = canvas.getContext('2d')
  if (!context) return canvas

  const scale = MAP_RESOLUTION / MARSH_MAP_SIZE
  const px = (x: number) => (x - MARSH_MAP_CENTER_X + MARSH_MAP_SIZE / 2) * scale
  const py = (z: number) => (z - MARSH_MAP_CENTER_Z + MARSH_MAP_SIZE / 2) * scale

  // L'eau, partout. Elle n'a pas de bord visible sur cette carte, et c'est
  // exact : le marais déborde du cadre de tous les côtés.
  context.fillStyle = ROT_COLORS.minimapWater
  context.fillRect(0, 0, MAP_RESOLUTION, MAP_RESOLUTION)

  // La chaussée, d'un seul trait : elle est continue, et la dessiner en
  // morceaux aurait laissé paraître des coupures là où le joueur marche sans
  // s'arrêter. Sa largeur est la vraie, à l'échelle de la vignette.
  context.strokeStyle = ROT_COLORS.minimapStone
  context.lineWidth = DECK_HALF * 2 * scale
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  CAUSEWAY.forEach(([x, z], i) => {
    if (i === 0) context.moveTo(px(x), py(z))
    else context.lineTo(px(x), py(z))
  })
  context.stroke()

  // Le bassin, puis le tronc par-dessus : l'arène est au pied de l'arbre, donc
  // l'arbre la recouvre en partie, et c'est ce recouvrement qui fait comprendre
  // d'un coup d'oeil que le combat se livre contre le tronc.
  context.fillStyle = ROT_COLORS.minimapRoot
  context.beginPath()
  context.arc(px(0), py(0), ARENA_R * scale, 0, Math.PI * 2)
  context.fill()

  context.fillStyle = ROT_COLORS.minimapBark
  context.beginPath()
  context.arc(px(TREE.x), py(TREE.z), TREE.baseRadius * scale, 0, Math.PI * 2)
  context.fill()

  // La porte, du même violet que le portail du continent : c'est le seul repère
  // de la carte qui ne soit pas de ce monde, et il garde donc sa couleur.
  context.fillStyle = PORTAL_MINIMAP_COLOR
  context.beginPath()
  context.arc(px(MARSH_PORTAL.x), py(MARSH_PORTAL.z), 3.4, 0, Math.PI * 2)
  context.fill()

  return canvas
}

/**
 * Le cadrage de chaque carte : son étendue, et le point sur lequel elle est
 * centrée.
 *
 * Une table indexée par `MapId`, et pas trois ternaires `sky ? … : …` comme
 * auparavant. Ces ternaires étaient trois occasions distinctes d'oublier une
 * carte, et ils auraient donné au Marais le cadrage du continent — deux cents
 * unités centrées sur l'origine pour un monde qui en fait cent soixante-dix,
 * décalé de quarante.
 */
const FRAME: Record<MapId, { extent: number; x: number; z: number }> = {
  continent: { extent: CONTINENT_SHAPE.size, x: 0, z: 0 },
  sky: { extent: ISLAND_MAP_SIZE, x: ISLAND_MAP_CENTER_X, z: ISLAND_MAP_CENTER_Z },
  rot: { extent: MARSH_MAP_SIZE, x: MARSH_MAP_CENTER_X, z: MARSH_MAP_CENTER_Z },
  // Comme le continent : le relief occupe toute la grille, il n'y a pas de
  // sous-partie à cadrer ni de décalage à appliquer.
  beyond: { extent: BEYOND_MAP_SIZE, x: BEYOND_MAP_CENTER_X, z: BEYOND_MAP_CENTER_Z },
}

/**
 * Marqueur affichable sur la minimap.
 * Le type est déjà là pour la suite : ennemis, objectifs, points d'intérêt
 * viendront alimenter le tableau `markers` sans toucher au rendu.
 */
export interface MinimapMarker {
  id: string
  x: number
  z: number
  color: string
  /** Rayon du point, en pixels écran. */
  size?: number
}

/**
 * Fond de carte d'un champ de hauteurs, rendu **une seule fois** dans un canvas
 * hors écran.
 *
 * Échantillonner le monde coûte ~50 ms pour 48 000 pixels : hors de question de
 * le refaire à chaque frame. Le fond est donc figé, et la boucle d'animation ne
 * fait plus que le recopier et dessiner les marqueurs par-dessus.
 *
 * Il sert **deux** cartes — le continent et l'Outremonde — là où celui de l'île
 * et celui du Marais n'en servent qu'une chacun, et la différence n'est pas une
 * question de courage : ces deux-là sont le même objet mathématique, une grille
 * de hauteurs classée en biomes. Le paramétrer coûte un argument ; paramétrer
 * le rendu de l'île pour qu'il couvre aussi le Marais aurait coûté tout ce qui
 * les distingue.
 */
function renderWorldMap(shape: WorldShape) {
  const canvas = document.createElement('canvas')
  canvas.width = MAP_RESOLUTION
  canvas.height = MAP_RESOLUTION

  const context = canvas.getContext('2d')
  if (!context) return canvas

  const image = context.createImageData(MAP_RESOLUTION, MAP_RESOLUTION)
  const step = shape.size / MAP_RESOLUTION

  // Palette pré-résolue en RGB : parser une couleur CSS par pixel serait le
  // poste de coût dominant.
  const palette = new Map<BiomeId | 'water', [number, number, number]>()
  const toRgb = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
  for (const biome of Object.values(BIOMES)) palette.set(biome.id, toRgb(biome.minimap))
  palette.set('water', toRgb(MINIMAP_WATER))

  for (let py = 0; py < MAP_RESOLUTION; py++) {
    // Le nord de la carte est le -Z du monde : py croît donc avec z.
    const z = -shape.half + py * step
    for (let px = 0; px < MAP_RESOLUTION; px++) {
      const x = -shape.half + px * step
      const height = shape.height(x, z)

      let rgb: [number, number, number]
      let shade = 1

      if (height < shape.waterLevel) {
        rgb = palette.get('water')!
        // L'eau s'éclaircit fortement en faible profondeur : c'est ce qui rend
        // le haut-fond vers l'île lisible d'un coup d'œil, donc franchissable.
        const depth = Math.min(1, height / shape.maxDepth)
        shade = 0.62 + 0.85 * (1 - depth) ** 1.4
      } else {
        rgb = palette.get(shape.biome(x, z, height))!
        // Ombrage de relief : lumière venue du nord-ouest, comme sur une carte
        // topographique. C'est ce qui fait apparaître la montagne.
        const dx = shape.height(x + step, z) - height
        const dz = shape.height(x, z + step) - height
        shade = Math.max(0.55, Math.min(1.35, 1 + (dx + dz) * 0.5))
      }

      const index = (py * MAP_RESOLUTION + px) * 4
      image.data[index] = Math.min(255, rgb[0] * shade)
      image.data[index + 1] = Math.min(255, rgb[1] * shade)
      image.data[index + 2] = Math.min(255, rgb[2] * shade)
      image.data[index + 3] = 255
    }
  }

  context.putImageData(image, 0, 0)
  return canvas
}

/**
 * Fond de carte de l'Île Céleste, rendu une seule fois comme celui du continent.
 *
 * Un **second rendu** et non une généralisation du premier, et c'est un choix :
 * le continent est un champ de hauteurs sur grille carrée avec des biomes, l'île
 * est un disque à terrasses. Une fonction qui couvrirait les deux prendrait en
 * paramètre tout ce qui les distingue, c'est-à-dire tout — on aurait écrit deux
 * fonctions en une, avec un `if` au milieu.
 *
 * Le hors-île est laissé **transparent** et non peint en bleu : il n'y a pas de
 * mer autour, il n'y a rien. C'est ce vide qui dit, d'un seul coup d'œil sur la
 * carte, qu'on est sur un caillou en l'air. C'est aussi lui qui fait lire la
 * voie de l'ouest comme un **pont** : un ruban de pierre de sept unités de
 * large entouré de néant, et une montagne détachée au bout.
 *
 * Les trois morceaux sont peints par la même règle — la pente dit la couleur,
 * donc la carte dit où l'on peut monter — et chacun la tire de sa propre source
 * de vérité : `topSlope` pour l'île, `mountainSlope` pour la montagne. Aucun
 * des deux n'est redessiné ici, ce qui interdit à la carte de contredire le
 * terrain.
 */
function renderIslandMap() {
  const canvas = document.createElement('canvas')
  canvas.width = MAP_RESOLUTION
  canvas.height = MAP_RESOLUTION

  const context = canvas.getContext('2d')
  if (!context) return canvas

  const image = context.createImageData(MAP_RESOLUTION, MAP_RESOLUTION)
  const step = ISLAND_MAP_SIZE / MAP_RESOLUTION
  const half = ISLAND_MAP_SIZE / 2

  const toRgb = (hex: number): [number, number, number] => [
    (hex >> 16) & 0xff,
    (hex >> 8) & 0xff,
    hex & 0xff,
  ]
  const lawn = toRgb(SKY_COLORS.lawn)
  const stone = toRgb(SKY_COLORS.stoneMid)
  /**
   * La roche de la montagne : elle n'a pas d'herbe, c'est un caillou nu.
   *
   * `rock` et non `rockDeep`, qui est la teinte du **dessous** de l'île. Sur la
   * carte, le violet sombre de `rockDeep` rendait la montagne presque noire à
   * côté du vert de l'île : on y voyait un trou dans le cadre plutôt qu'un
   * relief, et la spire s'y perdait. Le plancher d'ombrage est relevé pour la
   * même raison — un cône vu de dessus est sombre à sa base par construction,
   * et la carte n'a pas à en rajouter.
   */
  const rock = toRgb(SKY_COLORS.rock)

  /**
   * Peint un pixel : deux couleurs, le mélange entre elles, et un ombrage.
   *
   * Les deux couleurs sont un paramètre parce que les deux reliefs n'ont pas la
   * même matière — l'île oppose l'herbe à la pierre, la montagne la pierre à la
   * roche nue. Un seul couple codé en dur aurait verdi les flancs du cône.
   */
  const paint = (
    index: number,
    flat: [number, number, number],
    steep: [number, number, number],
    t: number,
    shade: number,
  ) => {
    for (let c = 0; c < 3; c++) {
      image.data[index + c] = Math.min(255, (flat[c] * (1 - t) + steep[c] * t) * shade)
    }
    image.data[index + 3] = 255
  }

  for (let py = 0; py < MAP_RESOLUTION; py++) {
    const z = ISLAND_MAP_CENTER_Z - half + py * step
    for (let px = 0; px < MAP_RESOLUTION; px++) {
      // Le cadre est décalé vers l'ouest pour tenir la montagne sans rapetisser
      // l'île — voir `ISLAND_MAP_CENTER_X`.
      const x = ISLAND_MAP_CENTER_X - half + px * step
      const index = (py * MAP_RESOLUTION + px) * 4

      const mount = mountainLocal(x, z)
      if (mount.d <= MOUNT_BASE_R) {
        // La montagne, à la même règle que l'île : le chemin en spire ressort
        // en clair parce qu'il est plat, les flancs restent sombres parce
        // qu'ils ne le sont pas. Personne n'a dessiné de spirale.
        const slope = Math.min(1, mountainSlope(mount.d, mount.phi) / 1.1)
        const shade = 0.74 + 0.26 * (mountainHeight(mount.d, mount.phi) / MOUNT_H)
        paint(index, stone, rock, slope, shade)
        continue
      }

      // La voie : un rectangle dans **son** repère, que `nearCauseway` teste
      // sans que la carte ait à savoir sous quel cap il est posé. Sa pente est
      // nulle, donc sa couleur est celle du dallage, sans avoir à l'écrire.
      if (nearCauseway(x, z, 0)) {
        paint(index, stone, rock, 0, 0.9)
        continue
      }

      const r = Math.hypot(x, z)
      const theta = Math.atan2(x, z)
      if (r > rimRadius(theta)) {
        // Hors de l'île : rien. L'alpha à zéro laisse voir le cadre au travers.
        image.data[index + 3] = 0
        continue
      }

      // Les falaises en pierre, les plateaux et les rampes en herbe : la carte
      // dit donc où l'on peut monter, exactement comme le terrain lui-même. Les
      // deux lisent `topSlope`, ils ne peuvent pas se contredire.
      const slope = Math.min(1, topSlope(r, theta) / 1.4)
      // Ombrage de relief : les terrasses se détachent parce que leur talus est
      // sombre, pas parce qu'on aurait dessiné un cercle par-dessus.
      const shade = 0.72 + 0.28 * (topHeight(r, theta) / 7.2)
      paint(index, lawn, stone, slope, shade)
    }
  }

  context.putImageData(image, 0, 0)
  return canvas
}

interface MinimapProps {
  /** Marqueurs additionnels. Vide pour l'instant, prêt pour les ennemis. */
  markers?: MinimapMarker[]
}

/**
 * Minimap en haut à gauche.
 *
 * Volontairement hors du Canvas 3D : c'est du dessin 2D, un canvas dédié le
 * fait pour une fraction du coût d'une seconde scène ou d'une seconde caméra.
 * Sa boucle est indépendante de celle de R3F.
 */
export function Minimap({ markers = [] }: MinimapProps) {
  const { dict } = useI18n()
  const location = useGameStore((state) => state.location)
  /*
    Les deux fonds sont rendus **à la demande et mémoïsés séparément** : celui
    de l'île n'est calculé qu'au premier voyage, et celui du continent n'est
    jamais recalculé au retour. Échantillonner un relief coûte une cinquantaine
    de millisecondes pour quarante-huit mille pixels — le refaire à chaque
    aller-retour se verrait.
  */
  const worldMap = useMemo(() => renderWorldMap(CONTINENT_SHAPE), [])
  const islandMap = useMemo(
    () => (location === 'sky' ? renderIslandMap() : null),
    [location],
  )
  const marshMap = useMemo(
    () => (location === 'rot' ? renderMarshMap() : null),
    [location],
  )
  /*
    Le fond de l'Outremonde, cuit au premier voyage seulement.

    Il passe par le même rendu que le continent — c'est le même objet — mais il
    a sa propre mémoïsation, et surtout **ses deux repères peints par-dessus** :
    le sanctuaire en or, le cœur en noir. Ce sont les deux seuls points fixes
    d'une carte qui n'a ni monument ni chemin ; sans eux, la vignette n'est
    qu'une tache de biomes où l'on ne sait pas où l'on va.
  */
  const beyondMap = useMemo(() => {
    if (location !== 'beyond') return null
    const canvas = renderWorldMap(BEYOND_SHAPE)
    const context = canvas.getContext('2d')
    if (!context) return canvas

    const scale = MAP_RESOLUTION / BEYOND_MAP_SIZE
    const px = (x: number) => (x + BEYOND_MAP_SIZE / 2) * scale
    const py = (z: number) => (z + BEYOND_MAP_SIZE / 2) * scale

    // Le cœur : le dallage noir, au centre exact.
    context.fillStyle = '#20141f'
    context.beginPath()
    context.arc(px(BEYOND_ARENA.x), py(BEYOND_ARENA.z), BEYOND_ARENA.radius * scale, 0, Math.PI * 2)
    context.fill()

    // Le sanctuaire : l'or du bâti, la seule teinte chaude de la vignette.
    context.fillStyle = '#f5dc95'
    context.beginPath()
    context.arc(px(SANCTUARY.x), py(SANCTUARY.z), SANCTUARY.radius * scale, 0, Math.PI * 2)
    context.fill()

    // Et la porte, du violet qu'elle a partout ailleurs.
    context.fillStyle = PORTAL_MINIMAP_COLOR
    context.beginPath()
    context.arc(px(BEYOND_PORTAL.x), py(BEYOND_PORTAL.z), 3, 0, Math.PI * 2)
    context.fill()

    return canvas
  }, [location])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const markersRef = useRef(markers)
  markersRef.current = markers

  /** Nom du biome sous le joueur, rafraîchi seulement quand il change. */
  const [biome, setBiome] = useState<BiomeId>('meadow')

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    // Rendu en résolution physique : sinon la carte est floue sur un écran HiDPI.
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const size = canvas.clientWidth
    canvas.width = size * ratio
    canvas.height = size * ratio
    context.scale(ratio, ratio)

    let frame = 0
    let lastBiome: BiomeId | null = null

    /*
      Le cadrage suit la carte, et il vient d'une table (voir `FRAME`) : chaque
      carte tient dans un cadre dérivé de son propre contenu. Une seule échelle
      pour toutes rendrait l'île minuscule au milieu d'un vide, ce qui est exact
      et illisible.

      Seul le cadre du continent est centré sur l'origine. Celui de l'île l'est
      sur le milieu de ce qu'elle doit montrer, île **et** promontoire du
      nord-ouest ; celui du Marais sur le milieu du chemin, qui va du portail à
      l'arbre. Le décalage est appliqué ici et dans le fond de carte, et il
      n'existe qu'à ces deux endroits — un troisième aurait un jour dessiné les
      repères à côté du relief qu'ils désignent.
    */
    const onContinent = location === 'continent'
    /*
      Le relief sous les pieds, quand la carte en a un.

      Deux cartes sur quatre sont des champs de hauteurs classés en biomes ; les
      deux autres n'ont rien à répondre à « sur quoi est-ce que je marche ? ».
      D'où un relief nullable plutôt qu'un second test `=== 'continent'` : c'est
      la présence d'une forme qui décide si le libellé nomme un biome, et non le
      nom de la carte.
    */
    const shape =
      location === 'continent' ? CONTINENT_SHAPE : location === 'beyond' ? BEYOND_SHAPE : null
    const { extent, x: centerX, z: centerZ } = FRAME[location]
    const toPixels = (x: number, z: number) => ({
      px: ((x - centerX + extent / 2) / extent) * size,
      py: ((z - centerZ + extent / 2) / extent) * size,
    })

    const draw = () => {
      const { position, yaw } = playerTransform

      context.clearRect(0, 0, size, size)
      context.drawImage(beyondMap ?? marshMap ?? islandMap ?? worldMap, 0, 0, size, size)

      /*
        Les ennemis se dessinent sur les **deux** cartes, et le registre suffit.

        Il était compris dans le test « continent seulement », avec pour raison
        que sur l'île « le registre est vide ». Il ne l'est plus : le Lynel s'y
        inscrit comme les autres, et son point argenté ne paraissait nulle part —
        alors même que `ENEMIES.lynel` justifie son entrée dans la table commune
        par la couleur que la minimap y prend.
      */
      for (const enemy of enemyRegistry.values()) {
        const { px, py } = toPixels(enemy.x, enemy.z)
        context.fillStyle = ENEMIES[enemy.kind].minimapColor
        context.beginPath()
        context.arc(px, py, 2.6, 0, Math.PI * 2)
        context.fill()
      }

      /*
        Monuments et portail, eux, n'existent que sur le continent : `LANDMARKS`
        parle d'une autre carte, et dessiner ses losanges sur l'île reviendrait à
        poser le Temple du Sommet au milieu du ciel.
      */
      if (onContinent) {
        // Monuments : un losange, pas un point. La forme suffit à les distinguer
        // des ennemis sans avoir à mémoriser un code couleur — et ils restent
        // affichés avant d'être découverts, parce que c'est ce qui donne au
        // joueur une destination.
        for (const landmark of LANDMARKS) {
          const { px, py } = toPixels(landmark.x, landmark.z)
          context.save()
          context.translate(px, py)
          context.rotate(Math.PI / 4)
          context.fillStyle = landmark.minimapColor
          context.strokeStyle = 'rgba(20, 30, 24, 0.85)'
          context.lineWidth = 1.2
          context.fillRect(-2.6, -2.6, 5.2, 5.2)
          context.strokeRect(-2.6, -2.6, 5.2, 5.2)
          context.restore()
        }

        // Portail de l'Île Céleste : un **anneau** qui pulse, et rien d'autre sur
        // cette carte n'a cette forme. Les ennemis sont des points pleins, les
        // monuments des losanges, le joueur un triangle : le vocabulaire est déjà
        // pris trois fois, et un quatrième point violet aurait obligé le joueur à
        // retenir un code couleur. Un anneau se reconnaît sans être appris — et
        // c'est un anneau parce que c'est ce à quoi ressemble le portail.
        //
        // Lu sans abonnement, comme le registre des ennemis : la minimap tourne
        // dans sa propre boucle et ne se re-rend jamais.
        if (useGameStore.getState().portalOpenedAt !== null) {
          const { px, py } = toPixels(PORTAL.x, PORTAL.z)
          // Sur `performance.now()` et non l'horloge de jeu : cette boucle est
          // celle du navigateur, et un repère figé sur une carte ouverte pendant
          // une pause n'aurait aucun sens — c'est une interface, pas le monde.
          const pulse = 0.5 + Math.sin(performance.now() * 0.0042) * 0.5
          context.save()
          context.strokeStyle = PORTAL_MINIMAP_COLOR
          context.lineWidth = 2
          context.beginPath()
          context.arc(px, py, 3.4 + pulse * 1.6, 0, Math.PI * 2)
          context.stroke()
          // Le halo ne pulse pas en phase avec l'anneau : il s'efface quand
          // celui-ci s'ouvre, ce qui donne une onde plutôt qu'un clignotement.
          context.globalAlpha = 0.35 * (1 - pulse)
          context.lineWidth = 3
          context.beginPath()
          context.arc(px, py, 6.5, 0, Math.PI * 2)
          context.stroke()
          context.restore()
        }
      }

      for (const marker of markersRef.current) {
        const { px, py } = toPixels(marker.x, marker.z)
        context.fillStyle = marker.color
        context.beginPath()
        context.arc(px, py, marker.size ?? 3, 0, Math.PI * 2)
        context.fill()
      }

      // Joueur : un triangle orienté selon le cap, plus lisible qu'un point.
      const { px, py } = toPixels(position.x, position.z)
      context.save()
      context.translate(px, py)
      // `yaw` est mesuré depuis +Z ; sur la carte +Z pointe vers le bas, d'où
      // le quart de tour de conversion.
      context.rotate(Math.PI / 2 - yaw)
      context.beginPath()
      context.moveTo(6, 0)
      context.lineTo(-4, 4)
      context.lineTo(-4, -4)
      context.closePath()
      context.fillStyle = '#ffffff'
      context.strokeStyle = 'rgba(20, 30, 24, 0.85)'
      context.lineWidth = 1.5
      context.fill()
      context.stroke()
      context.restore()

      // Le libellé sous la carte nomme le biome là où il y en a — le continent
      // et l'Outremonde — et la carte elle-même ailleurs : ni l'île ni le Marais
      // n'ont de biomes, et « Prairie » y serait à la fois vrai et hors sujet.
      if (shape) {
        const current = shape.biome(
          position.x,
          position.z,
          shape.height(position.x, position.z),
        )
        if (current !== lastBiome) {
          lastBiome = current
          setBiome(current)
        }
      }

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [worldMap, islandMap, marshMap, beyondMap, location])

  return (
    <div className="minimap">
      <canvas ref={canvasRef} className="minimap__canvas" />
      <span className="minimap__north">{dict.ui.minimap.north}</span>
      <span className="minimap__label">
        {location === 'continent' || location === 'beyond'
          ? dict.ui.biomes[biome]
          : dict.ui.maps[location]}
      </span>
    </div>
  )
}
