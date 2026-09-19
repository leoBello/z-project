import { useMemo } from 'react'
import { Color, DoubleSide, MeshBasicMaterial, MeshToonMaterial } from 'three'
import { toonGradient } from '../models/toonGradient'

/**
 * La palette de l'Île Céleste, et ses matériaux.
 *
 * **La pierre est grise, pas blonde**, et c'est le choix qui sépare cette île du
 * reste du monde. Le calcaire chaud (`#d8c890`) est celui des ruines de l'île du
 * continent ; si la forteresse céleste partageait sa palette, elle aurait l'air
 * d'avoir été bâtie par les mêmes gens. Elle ne doit pas.
 */
export const SKY = {
  lawn: 0x8fbf63,
  lawnDark: 0x5f9147,
  stone: 0xc2c1b2,
  stoneMid: 0x9d9d8e,
  stoneDark: 0x6c6d62,
  moss: 0x6f9a4e,
  /*
    L'or, en trois valeurs.

    `gold` est l'or lavé par la pluie, celui des arêtes et des saillies ;
    `goldDim` l'or terni des creux, qui a viré au brun-vert ; `goldBright` ne
    sert qu'aux quelques pièces que la lumière frappe de plein fouet. Trois
    valeurs et pas une, parce qu'un or uniforme se lit comme de la peinture
    jaune — ce qui fait l'or, c'est l'écart entre ce qui brille et ce qui ne
    brille plus.
  */
  gold: 0xd9a441,
  goldDim: 0x8a6c33,
  goldBright: 0xf3d789,
  rock: 0x7d7365,
  rockDeep: 0x3d3548,
  bark: 0x6b5540,
  leaf: 0x4f9a4a,
  leafDark: 0x36753f,
  water: 0xcfe6f5,
  foam: 0xf2fbff,
  /** Le violet du cristal. Le même que celui du portail, et pour cause. */
  crystal: 0x8b3ff0,
  crystalPale: 0xe6ccff,
} as const

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
      stone: toon({ color: SKY.stone }),
      stoneMid: toon({ color: SKY.stoneMid }),
      stoneDark: toon({ color: SKY.stoneDark }),
      moss: toon({ color: SKY.moss }),
      bark: toon({ color: SKY.bark }),
      leaf: toon({ color: SKY.leaf }),
      leafDark: toon({ color: SKY.leafDark }),
      gold: toon({ color: SKY.gold, emissive: SKY.gold, emissiveIntensity: 0.32 }),
      goldDim: toon({ color: SKY.goldDim }),
      goldBright: toon({
        color: SKY.goldBright,
        emissive: SKY.gold,
        emissiveIntensity: 0.55,
      }),
      /** L'eau qui **coule** : bassin, canaux, filet de l'aqueduc. */
      water: new MeshBasicMaterial({
        color: SKY.water,
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
        color: SKY.water,
        transparent: true,
        opacity: 0.26,
        side: DoubleSide,
        depthWrite: false,
      }),
      foam: new MeshBasicMaterial({
        color: SKY.foam,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    }
  }, [])
}
