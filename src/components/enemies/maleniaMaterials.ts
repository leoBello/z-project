import { useMemo } from 'react'
import { Color, DoubleSide, MeshBasicMaterial, MeshToonMaterial } from 'three'
import { ROT_COLORS } from '../../config/rotPalette'
import { toonGradient } from '../models/toonGradient'

/**
 * Les matériaux de Malenia.
 *
 * Les couleurs viennent de `config/rotPalette.ts`, qu'elle partage avec sa
 * carte, et ce partage est le point : l'or qui la détache du marais et
 * l'écarlate qui l'y fond sont deux valeurs de la **même** table. Les séparer
 * aurait permis de retoucher l'eau sans voir qu'on venait de la rapprocher de
 * la couleur de ses ailes.
 *
 * Construits par instance, comme ceux du Lynel. Il n'y a qu'une Malenia, donc
 * l'argument du partage ne tient pas ; celui de la symétrie, si — un jeu de
 * matériaux par créature est ce qui permet d'en modifier un (l'émissif des
 * veines en phase II) sans repeindre silencieusement une autre partie de la
 * scène qui partagerait l'objet.
 */
export interface MaleniaMaterials {
  gold: MeshToonMaterial
  goldBright: MeshToonMaterial
  goldDim: MeshToonMaterial
  goldDeep: MeshToonMaterial
  bronze: MeshToonMaterial
  bronzeDark: MeshToonMaterial
  leather: MeshToonMaterial
  skin: MeshToonMaterial
  skinShade: MeshToonMaterial
  hair: MeshToonMaterial
  hairDark: MeshToonMaterial
  cloth: MeshToonMaterial
  clothDark: MeshToonMaterial
  steel: MeshToonMaterial
  steelDark: MeshToonMaterial
  /** Les papillons de l'aile. Transparents et à deux faces — voir plus bas. */
  wing: MeshToonMaterial
  wingPale: MeshToonMaterial
  /** Les veines de pourriture : non éclairées, donc toujours au-dessus du bloom. */
  vein: MeshBasicMaterial
  /** Le fond de l'éventail, qui empêche l'aile de se découper en confettis. */
  halo: MeshBasicMaterial
}

export function useMaleniaMaterials(): MaleniaMaterials {
  return useMemo(() => {
    const toon = (color: string, emissive?: string, intensity = 0.32) =>
      new MeshToonMaterial({
        color: new Color(color),
        gradientMap: toonGradient,
        ...(emissive
          ? { emissive: new Color(emissive), emissiveIntensity: intensity }
          : {}),
      })

    return {
      /*
        L'or porte un émissif, le bronze non : dans un rendu cel-shadé à trois
        marches, c'est le seul moyen de faire *briller* quelque chose plutôt que
        de le peindre en jaune. Même réglage que les ruines de l'île et que le
        Lynel doré — c'est littéralement le même or.
      */
      gold: toon(ROT_COLORS.gold, ROT_COLORS.gold, 0.32),
      goldBright: toon(ROT_COLORS.goldBright, ROT_COLORS.gold, 0.55),
      goldDim: toon(ROT_COLORS.goldDim),
      goldDeep: toon(ROT_COLORS.goldDeep),
      bronze: toon(ROT_COLORS.bronze),
      bronzeDark: toon(ROT_COLORS.bronzeDark),
      leather: toon(ROT_COLORS.leather),
      skin: toon(ROT_COLORS.skin),
      skinShade: toon(ROT_COLORS.skinShade),
      hair: toon(ROT_COLORS.hair),
      hairDark: toon(ROT_COLORS.hairDark),
      cloth: toon(ROT_COLORS.rotDeep),
      clothDark: toon('#5e1219'),
      steel: toon(ROT_COLORS.steel),
      steelDark: toon(ROT_COLORS.steelDark),

      /*
        Les papillons.

        `DoubleSide` est obligatoire : une aile est un plan sans épaisseur, et
        la moitié d'un éventail est toujours vue par l'envers. `transparent`
        pour qu'ils se superposent sans faire un mur opaque, mais `depthWrite`
        reste vrai — sans lui, cent quatre-vingts plans transparents se trient
        entre eux à chaque frame et l'aile clignote quand la caméra tourne.

        L'émissif est fort (0,62) parce que ces ailes doivent *brûler* sous un
        ciel sans soleil. Une aile repeinte en rouge serait rouge ; celle-ci
        franchit le seuil de bloom du jeu (0,82) sur ses faces éclairées.
      */
      wing: toon(ROT_COLORS.rot, ROT_COLORS.rot, 0.62),
      wingPale: toon(ROT_COLORS.rotBright, ROT_COLORS.rotBright, 0.78),

      vein: new MeshBasicMaterial({ color: new Color(ROT_COLORS.rotBright) }),
      halo: new MeshBasicMaterial({
        color: new Color(ROT_COLORS.rot),
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: DoubleSide,
      }),
    }
  }, [])
}

/**
 * Les deux réglages que la métamorphose modifie sur les matériaux eux-mêmes.
 *
 * Tout le reste de la phase II est une affaire de visibilité — l'armure
 * s'éteint, les ailes s'allument. Ces deux-là ne le sont pas : la peau se
 * marbre et les veines s'intensifient, sur des pièces qui étaient déjà là.
 *
 * Appelé sur transition de phase et jamais par frame : ce sont des écritures
 * dans des uniformes de matériau, qui invalident le programme si on les répète.
 */
export function setRotGlow(materials: MaleniaMaterials, on: boolean) {
  materials.skin.emissive.set(on ? ROT_COLORS.rotDeep : 0x000000)
  materials.skin.emissiveIntensity = on ? 0.42 : 0
  materials.vein.color.set(on ? ROT_COLORS.rotBright : ROT_COLORS.rotDeep)
}

/** Réglages de contour, repris du Lynel mais plus fins — voir la maquette. */
export const OUTLINE = 0.038
export const OUTLINE_THIN = 0.016
export const OUTLINE_COLOR = '#1a0c10'
