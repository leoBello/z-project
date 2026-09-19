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
  fov: 48,
  /**
   * Décalage de la caméra par rapport au joueur.
   *
   * La hauteur est un arbitrage direct : la caméra plonge de
   * `atan(y / z)` degrés, et le cadre ne montre du ciel que si cette plongée
   * reste inférieure à la moitié du FOV. À 12 de haut pour 17 de recul, on
   * plongeait de 35° pour un demi-FOV de 17° — l'horizon ne rentrait jamais
   * dans l'image, et le ciel était invisible quelle que soit sa beauté.
   * Réglage retenu : caméra haute (11 pour 21 de recul, la perspective reste
   * plongeante et l'effet maquette tient), mais **visée relevée** — voir
   * `lookAtHeight`. C'est la visée, pas la position, qui décide de ce qui entre
   * dans le cadre : on garde donc le point de vue en surplomb tout en faisant
   * entrer l'horizon et le ciel dans le haut de l'image.
   * Remonter la hauteur renforce le diorama et referme le ciel.
   */
  offset: [0, 11, 21] as [number, number, number],
  /**
   * Hauteur visée au-dessus du joueur.
   *
   * Relever ce point fait pivoter l'axe de visée vers le haut sans bouger la
   * caméra : le joueur descend dans le cadre et le ciel apparaît au-dessus.
   * À 4,5 pour un recul de 21, l'axe plonge de 17° pour un demi-FOV de 24° :
   * il reste 7° de ciel (environ un septième de l'image) et le joueur se pose
   * aux trois quarts de la hauteur, sans jamais toucher le bord bas.
   */
  lookAtHeight: 4.5,
  /**
   * Hauteur visée sur mobile.
   *
   * Plus basse que `lookAtHeight` : l'axe de visée se relève, le joueur remonte
   * vers le centre du cadre — au-dessus de la bande de contrôles tactiles qui
   * occupe le bas de l'écran. Contrepartie assumée : un peu moins de ciel
   * visible en haut de l'image sur mobile. La position de la caméra, elle, ne
   * bouge pas.
   */
  lookAtHeightMobile: 2,
  /** Réactivité du suivi ; plus haut = plus collé au joueur. */
  damping: 5,
  /**
   * Le cadrage du combat de boss.
   *
   * Il existe pour une raison mesurée : avec les cotes ordinaires — 11 de haut,
   * 21 de recul, demi-champ de 24° — le Lynel, qui fait 4,3 unités, occupe **un
   * cinquième** de la hauteur de l'image. Un boss qui tient dans un cinquième de
   * l'écran est un jouet, quelle que soit la qualité de son modèle.
   *
   * **Le premier réglage était raté, et il faut dire pourquoi.** Posé à 7 de haut
   * pour 13 de recul avec une visée à 5,5, l'axe ne plongeait plus que de 6,6°
   * contre 17° d'ordinaire : on voyait l'arène par la tranche, le Lynel cachait
   * le sol derrière lui, et juger une distance d'esquive devenait impossible.
   * Grossir le boss ne sert à rien si on ne voit plus où l'on met les pieds.
   *
   * Réglage retenu : **plus haut que la caméra du jeu, et plus près**. 12 pour 14
   * de recul et une visée à 5, soit une plongée de 26,6° — plus plongeante que
   * les 17° ordinaires, ce qui est exactement ce qu'on veut dans une arène :
   * c'est la position au sol qui se lit, pas l'horizon. Le boss occupe environ un
   * quart de la hauteur de l'image contre un cinquième en caméra libre.
   *
   * Contrepartie assumée : à cette plongée l'horizon sort du cadre et il n'y a
   * plus de ciel. Dans une rotonde fermée, il n'y en avait déjà presque pas.
   */
  arena: {
    offset: [0, 12, 14] as [number, number, number],
    lookAtHeight: 5,
    lookAtHeightMobile: 2.8,
  },
} as const
