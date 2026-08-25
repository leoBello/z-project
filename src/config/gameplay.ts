/**
 * Constantes de gameplay, regroupées pour pouvoir régler le "feeling"
 * sans fouiller dans les composants.
 */

import { WORLD, sampleHeight } from './world'

/** Alias historiques — la source de vérité est `WORLD` dans `world.ts`. */
export const MAP_SIZE = WORLD.size
export const MAP_HALF = WORLD.half

export const PLAYER = {
  /** Vitesse horizontale, en unités/seconde. */
  speed: 7,
  /** Vitesse verticale imprimée au saut. */
  jumpSpeed: 8,
  /** Gravité du monde (plus fort que la réalité = saut plus "jeu vidéo"). */
  gravity: -24,
  /** Demi-hauteur de la capsule de collision (hors calottes). */
  capsuleHalfHeight: 0.45,
  capsuleRadius: 0.35,
  /** Vitesse de rotation du modèle vers la direction de déplacement. */
  turnDamping: 12,
  /** Vitesse conservée dans l'eau : patauger doit se sentir. */
  waterSpeedFactor: 0.55,
  /**
   * Position de réapparition, posée sur le relief réel : le terrain n'est plus
   * plat, une constante en dur ferait apparaître le joueur sous la montagne ou
   * en l'air selon les réglages de génération.
   */
  spawn: [0, sampleHeight(0, 0) + 2.5, 0] as [number, number, number],
} as const

export const ATTACK = {
  /** Durée totale de l'animation de coup d'épée, en millisecondes. */
  durationMs: 450,
  /**
   * Fenêtre (en fraction de la durée) pendant laquelle la lame blesse.
   * Sert à l'animation aujourd'hui, à la hitbox à l'étape combat.
   */
  hitWindow: [0.25, 0.55] as [number, number],
  /** Portée et rayon de la sphère de dégâts devant le joueur. */
  reach: 1.4,
  radius: 0.9,
  /**
   * Visée assistée : au déclenchement de l'attaque, le personnage s'aligne sur
   * l'ennemi le plus proche dans ce rayon.
   *
   * Sans elle, on ne peut frapper que dans la direction du dernier déplacement.
   * Le ciblage est volontairement circulaire (demi-angle = π) : il n'y a ni
   * souris ni caméra libre dans ce jeu, donc aucun moyen de se retourner sur
   * place — un ennemi passé dans le dos deviendrait littéralement increvable.
   * Mesuré : sans ciblage circulaire, dix coups d'affilée dans le vide.
   */
  aimAssistRange: 3.4,
  aimAssistArc: Math.PI,
} as const

export const CAMERA = {
  /**
   * Champ de vision réduit — c'est le réglage clé du rendu "diorama".
   * Un FOV étroit aplatit la perspective tout en gardant la profondeur : les
   * lignes de fuite s'atténuent et la scène se lit comme une maquette. C'est
   * exactement ce que fait la caméra du HD-2D. En contrepartie il faut
   * s'éloigner d'autant pour cadrer la même zone, d'où l'offset ci-dessous.
   */
  fov: 35,
  /** Décalage de la caméra par rapport au joueur (vue 3e personne 3/4). */
  offset: [0, 12, 17] as [number, number, number],
  /** Hauteur visée sur le joueur (à peu près la tête). */
  lookAtHeight: 1.2,
  /** Réactivité du suivi ; plus haut = plus collé au joueur. */
  damping: 5,
} as const
