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
import { WORLD, classifyBiome, sampleHeight } from '../config/world'
import { enemyRegistry } from '../state/enemyRegistry'
import { playerTransform } from '../state/playerTransform'
import { useGameStore } from '../store/useGameStore'
import type { BiomeId } from '../types/game'

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
 * Fond de carte, rendu **une seule fois** dans un canvas hors écran.
 *
 * Échantillonner le monde coûte ~50 ms pour 48 000 pixels : hors de question de
 * le refaire à chaque frame. Le fond est donc figé, et la boucle d'animation ne
 * fait plus que le recopier et dessiner les marqueurs par-dessus.
 */
function renderWorldMap() {
  const canvas = document.createElement('canvas')
  canvas.width = MAP_RESOLUTION
  canvas.height = MAP_RESOLUTION

  const context = canvas.getContext('2d')
  if (!context) return canvas

  const image = context.createImageData(MAP_RESOLUTION, MAP_RESOLUTION)
  const step = WORLD.size / MAP_RESOLUTION

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
    const z = -WORLD.half + py * step
    for (let px = 0; px < MAP_RESOLUTION; px++) {
      const x = -WORLD.half + px * step
      const height = sampleHeight(x, z)

      let rgb: [number, number, number]
      let shade = 1

      if (height < WORLD.waterLevel) {
        rgb = palette.get('water')!
        // L'eau s'éclaircit fortement en faible profondeur : c'est ce qui rend
        // le haut-fond vers l'île lisible d'un coup d'œil, donc franchissable.
        const depth = Math.min(1, height / WORLD.maxDepth)
        shade = 0.62 + 0.85 * (1 - depth) ** 1.4
      } else {
        rgb = palette.get(classifyBiome(x, z, height))!
        // Ombrage de relief : lumière venue du nord-ouest, comme sur une carte
        // topographique. C'est ce qui fait apparaître la montagne.
        const dx = sampleHeight(x + step, z) - height
        const dz = sampleHeight(x, z + step) - height
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
  const worldMap = useMemo(renderWorldMap, [])
  const islandMap = useMemo(
    () => (location === 'sky' ? renderIslandMap() : null),
    [location],
  )
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

    const sky = location === 'sky'
    // Le cadrage suit la carte : la carte céleste tient dans un cadre dérivé de
    // son propre contenu (voir `ISLAND_MAP_SIZE`), le continent dans 200. Une
    // seule échelle pour les deux rendrait l'île minuscule au milieu d'un vide,
    // ce qui est exact et illisible.
    const extent = sky ? ISLAND_MAP_SIZE : WORLD.size
    // Le cadre céleste n'est pas centré sur l'origine : il l'est sur le milieu
    // de ce qu'il doit montrer, île **et** promontoire du nord-ouest — donc
    // décalé sur les deux axes. Le décalage est appliqué ici et dans le fond de
    // carte, et il n'existe qu'à ces deux endroits — un troisième aurait un
    // jour dessiné les repères à côté du relief qu'ils désignent.
    const centerX = sky ? ISLAND_MAP_CENTER_X : 0
    const centerZ = sky ? ISLAND_MAP_CENTER_Z : 0
    const toPixels = (x: number, z: number) => ({
      px: ((x - centerX + extent / 2) / extent) * size,
      py: ((z - centerZ + extent / 2) / extent) * size,
    })

    const draw = () => {
      const { position, yaw } = playerTransform

      context.clearRect(0, 0, size, size)
      context.drawImage(islandMap ?? worldMap, 0, 0, size, size)

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
      if (!sky) {
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

      // Le libellé sous la carte nomme le biome sur le continent, et la carte
      // elle-même dans le ciel : l'île n'a pas de biomes, et « Prairie » y
      // serait à la fois vrai et hors sujet.
      if (!sky) {
        const current = classifyBiome(
          position.x,
          position.z,
          sampleHeight(position.x, position.z),
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
  }, [worldMap, islandMap, location])

  return (
    <div className="minimap">
      <canvas ref={canvasRef} className="minimap__canvas" />
      <span className="minimap__north">{dict.ui.minimap.north}</span>
      <span className="minimap__label">
        {location === 'sky' ? dict.ui.maps.sky : dict.ui.biomes[biome]}
      </span>
    </div>
  )
}
