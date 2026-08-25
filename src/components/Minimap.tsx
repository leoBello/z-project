import { useEffect, useMemo, useRef, useState } from 'react'
import { BIOMES, MINIMAP_WATER } from '../config/biomes'
import { WORLD, classifyBiome, sampleHeight } from '../config/world'
import { playerTransform } from '../state/playerTransform'
import type { BiomeId } from '../types/game'

/** Résolution du fond de carte, en pixels. Indépendante de la taille affichée. */
const MAP_RESOLUTION = 220

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
  const worldMap = useMemo(renderWorldMap, [])
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

    const toPixels = (x: number, z: number) => ({
      px: ((x + WORLD.half) / WORLD.size) * size,
      py: ((z + WORLD.half) / WORLD.size) * size,
    })

    const draw = () => {
      const { position, yaw } = playerTransform

      context.clearRect(0, 0, size, size)
      context.drawImage(worldMap, 0, 0, size, size)

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

      const current = classifyBiome(
        position.x,
        position.z,
        sampleHeight(position.x, position.z),
      )
      if (current !== lastBiome) {
        lastBiome = current
        setBiome(current)
      }

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [worldMap])

  return (
    <div className="minimap">
      <canvas ref={canvasRef} className="minimap__canvas" />
      <span className="minimap__north">N</span>
      <span className="minimap__label">{BIOMES[biome].label}</span>
    </div>
  )
}
