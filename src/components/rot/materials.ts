import { useMemo } from 'react'
import { Color, MeshBasicMaterial, MeshToonMaterial } from 'three'
import { ROT_COLORS } from '../../config/rotPalette'
import { toonGradient } from '../models/toonGradient'

/**
 * Les matériaux du Marais, construits une fois et descendus en props.
 *
 * Même discipline que `SkyIsland.tsx` : chaque pièce pourrait fabriquer les
 * siens, elle en produirait alors un jeu complet, et la carte en compterait cinq
 * ou six exemplaires pour un résultat identique. C'est aussi ce qui garantit
 * qu'une retouche de la racine se voie partout à la fois.
 */
export interface MarshMaterials {
  root: MeshToonMaterial
  rootDark: MeshToonMaterial
  bark: MeshToonMaterial
  barkDark: MeshToonMaterial
  mud: MeshToonMaterial
  bloom: MeshToonMaterial
  /**
   * L'eau : **non éclairée**, et c'est le seul choix qui tienne ici.
   *
   * Sous un ciel sans soleil, une nappe qui dépend des lumières devient noire —
   * et une eau noire n'a pas l'air dangereuse, elle a l'air profonde. Or elle
   * doit avoir l'air corrosive. Un matériau basique la maintient à sa valeur
   * quel que soit l'angle, ce qui est faux physiquement et juste pour ce qu'on
   * raconte : cette pourriture luit d'elle-même.
   */
  water: MeshBasicMaterial
  /** Le cœur des fleurs, au-dessus du seuil de bloom du jeu (0,82). */
  spore: MeshBasicMaterial
}

export function useMarshMaterials(): MarshMaterials {
  return useMemo(() => {
    const toon = (color: string, emissive?: string, intensity = 0.3) =>
      new MeshToonMaterial({
        color: new Color(color),
        gradientMap: toonGradient,
        ...(emissive
          ? { emissive: new Color(emissive), emissiveIntensity: intensity }
          : {}),
      })

    return {
      root: toon(ROT_COLORS.root),
      rootDark: toon(ROT_COLORS.rootDark),
      bark: toon(ROT_COLORS.bark),
      barkDark: toon(ROT_COLORS.barkDark),
      mud: toon(ROT_COLORS.mud),
      // Les fleurs portent un émissif faible : elles doivent se repérer de loin
      // sur un sol de la même famille de teintes, sans pour autant rivaliser
      // avec leur propre cœur, qui est la seule chose vraiment lumineuse.
      bloom: toon(ROT_COLORS.rotDeep, ROT_COLORS.rot, 0.35),
      water: new MeshBasicMaterial({ color: new Color(ROT_COLORS.water) }),
      spore: new MeshBasicMaterial({ color: new Color(ROT_COLORS.rotBright) }),
    }
  }, [])
}
