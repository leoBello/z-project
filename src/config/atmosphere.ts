import type { MapId } from '../types/game'

/**
 * L'air de chaque carte : sa brume, et les quatre sources qui l'éclairent.
 *
 * Ces réglages vivaient en dur dans `App.tsx` (la brume) et dans
 * `Environment.tsx` (les lumières), **hors du branchement de carte**, et c'était
 * délibéré : le continent et l'Île Céleste partagent le même firmament — l'île
 * flotte dans le ciel du continent, pas dans un autre. Les monter deux fois les
 * aurait recréés à chaque voyage pour un résultat identique.
 *
 * Ce raisonnement tombe à la troisième carte. Une carte qui a son propre ciel a
 * forcément sa propre brume et son propre soleil, sans quoi le décor est sombre
 * et les personnages restent éclairés en fin d'après-midi — l'incohérence la
 * plus visible qui soit, et celle qu'aucun réglage de matériau ne rattrape.
 *
 * D'où cette table. Les deux premières entrées sont **la recopie exacte** des
 * valeurs qui étaient en dur : le jour où l'on a extrait ces nombres, rien ne
 * devait changer à l'écran, et rien n'a changé.
 */
export interface Atmosphere {
  /** Brume : couleur, distance de départ, distance de saturation. */
  fog: { color: string; near: number; far: number }
  /**
   * Rebond hémisphérique — le ciel par le haut, le sol par le bas.
   *
   * C'est la source qui dit *où l'on est* : sa couleur basse est celle de ce sur
   * quoi on marche. Sur le continent c'est l'herbe ; ailleurs, autre chose.
   */
  hemisphere: { sky: string; ground: string; intensity: number }
  /** Ambiante pure, pour qu'aucune ombre ne soit noire. */
  ambient: number
  /**
   * La clé, qui suit le joueur.
   *
   * `offset` est sa position **relative au joueur** : une lumière directionnelle
   * n'a pas de position au sens physique, mais sa carte d'ombres en a une, et
   * c'est ce décalage qui garde la zone visible dedans. Un décalage bas fait une
   * lumière rasante, donc des ombres longues.
   */
  sun: { color: string; intensity: number; offset: [number, number, number] }
  /** Contre-jour sans ombre : purement du détourage des silhouettes. */
  rim: { color: string; intensity: number; position: [number, number, number] }
}

export const ATMOSPHERE: Record<MapId, Atmosphere> = {
  /*
    Fin d'après-midi. Trois sources, et c'est volontaire : une seule lumière
    blanche aplatit n'importe quel style. La clé chaude sculpte, le rebond froid
    du ciel évite les ombres noires et mortes, et le contre-jour détache les
    silhouettes du fond — c'est lui qui fait « lire » le personnage sur la
    végétation.

    La couleur de brume est accordée à celle du ciel juste au-dessus de
    l'horizon (mélange de `horizon` et `glow` dans `StarrySky`). Sans cet accord,
    le terrain lointain s'estompe vers une teinte différente de celle du ciel et
    l'image se coupe en deux sur la ligne d'horizon.
  */
  continent: {
    fog: { color: '#6b7cba', near: 60, far: 200 },
    hemisphere: { sky: '#d2dcf4', ground: '#6a7a42', intensity: 0.7 },
    ambient: 0.28,
    sun: { color: '#ffe3ad', intensity: 2.1, offset: [45, 70, 35] },
    rim: { color: '#9fb0e8', intensity: 0.5, position: [-30, 18, -35] },
  },

  /*
    L'île est dans le ciel du continent : même air, au mot près. Cette entrée
    n'est donc pas une duplication mais une **affirmation** — si les deux cartes
    doivent un jour diverger, c'est ici que ça se dira, et pas par un branchement
    caché dans un composant de décor.
  */
  sky: {
    fog: { color: '#6b7cba', near: 60, far: 200 },
    hemisphere: { sky: '#d2dcf4', ground: '#6a7a42', intensity: 0.7 },
    ambient: 0.28,
    sun: { color: '#ffe3ad', intensity: 2.1, offset: [45, 70, 35] },
    rim: { color: '#9fb0e8', intensity: 0.5, position: [-30, 18, -35] },
  },
}
