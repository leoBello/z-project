import { useMemo } from 'react'
import { Color, DoubleSide, MeshBasicMaterial, MeshToonMaterial } from 'three'
import { SKY_COLORS } from '../../config/skyIsland'
import { toonGradient } from '../models/toonGradient'


/** Mélange deux couleurs, en allouant une seule fois par appel. */
export function mixColor(a: number, b: number, t: number) {
  return new Color(a).lerp(new Color(b), Math.min(1, Math.max(0, t)))
}

export type SkyMaterials = ReturnType<typeof useSkyMaterials>

/**
 * Les matériaux de l'île, construits une fois pour toute sa durée de vie.
 *
 * Un `useMemo` dans le composant racine plutôt que des constantes de module, et
 * la nuance compte : le fragment est monté et démonté à chaque aller-retour
 * entre les cartes. Des matériaux de module survivraient au démontage sans
 * jamais être libérés, et chaque voyage en laisserait un jeu de plus sur le GPU.
 * Les **géométries**, elles, restent en constantes de module — elles sont pures,
 * leur construction est le poste coûteux, et rien ne les rattache à un contexte.
 *
 * L'or porte un émissif, la pierre non. C'est le seul moyen, dans un rendu
 * cel-shadé à trois marches, de faire *briller* quelque chose : le toon écrase
 * les demi-teintes, donc un métal traité comme de la pierre jaune reste mat quelle
 * que soit sa couleur. Un émissif faible le fait franchir le seuil de bloom du
 * jeu (0,82) sur les faces éclairées, et seulement sur elles.
 */
export function useSkyMaterials() {
  return useMemo(() => {
    const toon = (options: ConstructorParameters<typeof MeshToonMaterial>[0]) =>
      new MeshToonMaterial({ gradientMap: toonGradient, ...options })

    return {
      /** Le terrain, dont les couleurs sont portées par les sommets. */
      terrain: toon({ vertexColors: true, side: DoubleSide }),
      stone: toon({ color: SKY_COLORS.stone }),
      stoneMid: toon({ color: SKY_COLORS.stoneMid }),
      stoneDark: toon({ color: SKY_COLORS.stoneDark }),
      moss: toon({ color: SKY_COLORS.moss }),
      bark: toon({ color: SKY_COLORS.bark }),
      leaf: toon({ color: SKY_COLORS.leaf }),
      leafDark: toon({ color: SKY_COLORS.leafDark }),
      gold: toon({ color: SKY_COLORS.gold, emissive: SKY_COLORS.gold, emissiveIntensity: 0.32 }),
      goldDim: toon({ color: SKY_COLORS.goldDim }),
      goldBright: toon({
        color: SKY_COLORS.goldBright,
        emissive: SKY_COLORS.gold,
        emissiveIntensity: 0.55,
      }),
      /** L'eau qui **coule** : bassin, canaux, filet de l'aqueduc. */
      water: new MeshBasicMaterial({
        color: SKY_COLORS.water,
        transparent: true,
        opacity: 0.55,
        side: DoubleSide,
        depthWrite: false,
      }),
      /**
       * L'eau qui **tombe**, nettement plus transparente.
       *
       * Une lame de vingt-six unités traitée comme la surface d'un bassin
       * devient une colonne opaque : elle se lit comme un tuyau posé contre
       * l'île. Ce qui fait une chute d'eau, c'est qu'on voit le ciel au travers.
       */
      fall: new MeshBasicMaterial({
        color: SKY_COLORS.water,
        transparent: true,
        opacity: 0.26,
        side: DoubleSide,
        depthWrite: false,
      }),
      foam: new MeshBasicMaterial({
        color: SKY_COLORS.foam,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    }
  }, [])
}

/** Réexporté : les pièces de l'île n'ont ainsi qu'un seul import à faire. */
export { SKY_COLORS }
