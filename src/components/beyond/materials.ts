import { useMemo } from 'react'
import { Color, MeshBasicMaterial, MeshToonMaterial } from 'three'
import { toonGradient } from '../models/toonGradient'

/**
 * Les matériaux de l'Outremonde, construits une fois et descendus en props.
 *
 * Même discipline que `SkyIsland.tsx` et `RotMarsh.tsx` : chaque pièce pourrait
 * fabriquer les siens, elle en produirait alors un jeu complet, et la carte en
 * compterait cinq ou six exemplaires pour un résultat identique. C'est aussi ce
 * qui garantit qu'une retouche de la pierre se voie partout à la fois.
 *
 * **La palette tient en trois familles, et elles ne se mélangent jamais.**
 *
 *  - la **pierre claire et l'or** du Sanctuaire. C'est la palette du bâti du
 *    continent — les temples, les braseros, la laque de la pagode — et elle est
 *    reprise telle quelle : le Sanctuaire est le seul endroit de cette carte
 *    construit par quelqu'un, et il doit avoir l'air d'appartenir au même monde
 *    que ce que le joueur a visité pendant toute sa partie ;
 *  - le **basalte et le violet** du cœur. C'est la palette des portails, donc de
 *    ce qui ne vient pas d'ici. Rien d'autre sur la carte ne la porte ;
 *  - le **cyan** de l'aurore, réservé aux lueurs qui flottent. Il vient du ciel,
 *    littéralement : c'est la teinte de contre-jour de `atmosphere.ts`.
 *
 * Un joueur qui voit du violet sait qu'il y a quelque chose là-bas ; un joueur
 * qui voit de l'or sait qu'il est en sécurité. Ça ne s'explique nulle part, et
 * ça n'a pas à l'être.
 */
export interface BeyondMaterials {
  /** La pierre du dallage et des monolithes. */
  stone: MeshToonMaterial
  stoneDark: MeshToonMaterial
  /** L'or des incrustations et des vasques, émissif comme partout dans le jeu. */
  gold: MeshToonMaterial
  /**
   * Le basalte du cœur : la valeur la plus sombre de la carte.
   *
   * Presque noir, et volontairement plus sombre que tout ce que le terrain peut
   * produire — y compris l'ombre portée d'une falaise. C'est ce qui fait qu'on
   * repère le dallage central depuis le Sanctuaire, à soixante-quatorze unités :
   * il n'est pas d'une autre couleur, il est d'une autre **valeur**.
   */
  basalt: MeshToonMaterial
  /**
   * Les lueurs : **non éclairées**, et c'est le seul choix qui tienne.
   *
   * Une flamme, une veine de portail ou une poussière en suspension qui
   * dépendraient des lumières s'assombriraient en passant à l'ombre d'un
   * monolithe — c'est-à-dire exactement là où elles doivent le plus se voir. Un
   * matériau basique les maintient à leur valeur quel que soit l'angle, ce qui
   * est faux physiquement et juste pour ce qu'on raconte : ces choses-là
   * brillent d'elles-mêmes.
   *
   * Leurs teintes sont au-dessus du seuil de bloom du post-traitement : le halo
   * n'est pas peint, c'est le bloom qui le fait.
   */
  ember: MeshBasicMaterial
  violet: MeshBasicMaterial
  aurora: MeshBasicMaterial
}

export function useBeyondMaterials(): BeyondMaterials {
  return useMemo(() => {
    const toon = (color: string, emissive?: string, intensity = 0.3) =>
      new MeshToonMaterial({
        color: new Color(color),
        gradientMap: toonGradient,
        ...(emissive ? { emissive: new Color(emissive), emissiveIntensity: intensity } : {}),
      })

    return {
      stone: toon('#cfc6ad'),
      stoneDark: toon('#8d8470'),
      gold: toon('#e0b04e', '#e0b04e', 0.34),
      basalt: toon('#221a2e'),
      ember: new MeshBasicMaterial({ color: new Color('#ffd79a') }),
      violet: new MeshBasicMaterial({ color: new Color('#c79bff') }),
      aurora: new MeshBasicMaterial({ color: new Color('#9ceeff') }),
    }
  }, [])
}
