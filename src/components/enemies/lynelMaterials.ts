import { useMemo } from 'react'
import { Color, MeshBasicMaterial, MeshToonMaterial } from 'three'
import { toonGradient } from '../models/toonGradient'

/**
 * Les couleurs du Lynel qui ne passent pas par `useEnemyMaterials`.
 *
 * Deux contraintes se sont rencontrées ici. L'argent doit se détacher d'une
 * arène en pierre grise — or c'est la même famille de gris, d'où un pelage
 * décalé vers le **bleu** (#dfe4ee contre #c2c1b2 pour la pierre) : à valeur
 * égale, c'est la teinte qui sépare, et aucun écart de luminosité n'y arrive
 * sans faire ressembler la bête à un fantôme.
 *
 * Et elle doit appartenir au lieu. D'où l'or, exactement celui des ruines,
 * émissif compris : son armure est faite du métal de la forteresse, elle n'est
 * pas venue d'ailleurs. Et le violet, exactement celui du cristal et du portail
 * — la seule couleur de la scène qu'aucune pierre ne porte, donc la seule qu'on
 * ne puisse pas confondre avec du décor.
 */
export const LYNEL_COLORS = {
  // Ventre, genoux, mâchoire, pectoraux, et une mèche de crinière sur deux.
  // Ils ne flashent pas en blanc sous le coup, faute de passer par
  // `useEnemyMaterials` ; c'est acceptable, le flash se lit sur la silhouette,
  // que le pelage principal et la crinière claire dessinent à eux seuls.
  furMid: 0xb3bccd,
  maneCool: 0xc6ccee,
  hoof: 0x2f3446,
  horn: 0xe8e2d2,
  hornDark: 0x9a927c,
  metal: 0x717a96,
  gold: 0xd9a441,
  goldDim: 0x8a6c33,
  goldBright: 0xf3d789,
  leather: 0x8a6a4e,
  steel: 0xcfd8e8,
  steelDark: 0x76809a,
  glow: 0x8b3ff0,
  glowPale: 0xe6ccff,
} as const

export interface LynelMaterials {
  furMid: MeshToonMaterial
  maneCool: MeshToonMaterial
  hoof: MeshToonMaterial
  horn: MeshToonMaterial
  hornDark: MeshToonMaterial
  metal: MeshToonMaterial
  gold: MeshToonMaterial
  goldDim: MeshToonMaterial
  goldBright: MeshToonMaterial
  leather: MeshToonMaterial
  steel: MeshToonMaterial
  steelDark: MeshToonMaterial
  /** Les yeux : non éclairés, donc toujours au-dessus du seuil de bloom. */
  glow: MeshBasicMaterial
  /** Halo des yeux et veine de la lame. Son opacité monte en phase III. */
  halo: MeshBasicMaterial
}

/**
 * Construits par instance, comme `useEnemyMaterials`.
 *
 * Il n'y a qu'un Lynel, donc l'argument du partage ne tient pas ; celui de la
 * symétrie, si. Un jeu de matériaux par créature est ce qui permet d'en
 * modifier un — l'émissif de la crinière en phase III — sans repeindre
 * silencieusement une autre partie de la scène qui partagerait l'objet.
 */
export function useLynelMaterials(): LynelMaterials {
  return useMemo(() => {
    const toon = (color: number, options?: { emissive?: number; intensity?: number }) =>
      new MeshToonMaterial({
        color: new Color(color),
        gradientMap: toonGradient,
        ...(options?.emissive !== undefined
          ? { emissive: new Color(options.emissive), emissiveIntensity: options.intensity ?? 0.32 }
          : {}),
      })

    return {
      furMid: toon(LYNEL_COLORS.furMid),
      maneCool: toon(LYNEL_COLORS.maneCool),
      hoof: toon(LYNEL_COLORS.hoof),
      horn: toon(LYNEL_COLORS.horn),
      hornDark: toon(LYNEL_COLORS.hornDark),
      metal: toon(LYNEL_COLORS.metal),
      // L'or porte un émissif, la pierre non : dans un rendu cel-shadé à trois
      // marches, c'est le seul moyen de faire *briller* quelque chose plutôt que
      // de le peindre en jaune. Même réglage que les ruines de l'île.
      gold: toon(LYNEL_COLORS.gold, { emissive: LYNEL_COLORS.gold, intensity: 0.32 }),
      goldDim: toon(LYNEL_COLORS.goldDim),
      goldBright: toon(LYNEL_COLORS.goldBright, {
        emissive: LYNEL_COLORS.gold,
        intensity: 0.55,
      }),
      leather: toon(LYNEL_COLORS.leather),
      steel: toon(LYNEL_COLORS.steel),
      steelDark: toon(LYNEL_COLORS.steelDark),
      glow: new MeshBasicMaterial({ color: new Color(LYNEL_COLORS.glowPale) }),
      halo: new MeshBasicMaterial({
        color: new Color(LYNEL_COLORS.glow),
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    }
  }, [])
}
