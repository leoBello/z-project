import type { MapId } from '../types/game'
/**
 * L'annihilation — le code de triche et son champignon.
 *
 * Ce fichier ne contient que des *durées* et des *cotes* : la séquence est
 * entièrement pilotée par un horodatage unique posé dans le store
 * (`annihilation.at`), et chaque pièce du spectacle en déduit où elle en est.
 * Aucune machine à états, aucun `setTimeout` — le même principe que la mort
 * d'un ennemi, et pour la même raison : une séquence jouée à partir d'un seul
 * instant de départ ne peut pas se désynchroniser d'elle-même.
 *
 * Toutes les durées sont en millisecondes de **temps de jeu**. C'est-à-dire
 * qu'ouvrir l'inventaire fige la bombe en plein vol, ce qui est exactement ce
 * qu'on veut : l'onde de choc tue des ennemis, elle appartient au jeu et non à
 * l'interface.
 */

// --- Cadrage ----------------------------------------------------------------

/*
  Tout ce qui suit est commandé par une seule contrainte, et elle est sévère :
  **cette caméra ne montre presque pas le ciel.**

  Elle est posée 11 unités au-dessus du joueur et 21 derrière, vise 4,5 au-dessus
  de lui, et son champ vertical fait 48° (voir `CAMERA` dans `gameplay.ts`).
  L'axe de visée plonge donc de 17° pour un demi-champ de 24° : le bord haut de
  l'image est à 7° au-dessus de l'horizontale de la caméra. À la verticale du
  joueur — 21 unités de distance — cela plafonne à 21 × tan(7°) ≈ 2,6 au-dessus
  de la caméra, soit **13,6 unités au-dessus du sol**.

  Autrement dit, un champignon atomique dressé sur le joueur serait hors cadre
  aux quatre cinquièmes. Deux conséquences, et ce sont elles qui expliquent tous
  les nombres de ce fichier :

   - la frappe tombe **devant** le joueur et non sur lui. Plus le point d'impact
     est loin, plus le cadre est haut à cet endroit : le bord haut vaut
     11 + 0,123 × (21 + D) unités de sol à une distance D au nord ;
   - le champignon reste **petit**. À 42 unités, le plafond est de 19,1 : une
     colonne de 15 surmontée d'une coiffe de 7,5 de rayon culmine à 18,5 et
     tient tout juste dans l'image, coiffe comprise.

  Vouloir un champignon de cinquante unités demanderait de larguer la bombe à
  280 unités du joueur, c'est-à-dire hors de la carte.
*/

/**
 * Distance de la frappe **au nord du joueur**, en unités monde.
 *
 * Au nord, et pas dans la direction du regard du personnage : la caméra de ce
 * jeu est fixe et regarde toujours vers le nord (voir la note de cap des
 * monuments dans `landmarks.ts`). Le nord du monde *est* le haut de l'écran, et
 * c'est la seule direction où poser quelque chose garantit qu'on le verra.
 *
 * Quarante-deux unités, c'est aussi juste en deçà des soixante où la brume
 * commence : la frappe est lointaine, mais elle n'est pas dans le brouillard.
 */
export const BLAST_FORWARD = 42

/**
 * Le même décalage, par carte.
 *
 * Quarante-deux unités devant le joueur conviennent à un continent de deux
 * cents ; sur l'Île Céleste, dont la lèvre est à vingt-neuf, la frappe serait
 * tombée **à côté de l'île** — un champignon suspendu dans le vide, et une
 * boule de feu née de rien. Vingt unités la posent sur le sol qu'on regarde,
 * quelle que soit la direction où l'on se tient.
 *
 * Ça ne change rien à ce que la frappe *tue* : passé 2,2 s, `killRadius` vaut
 * l'infini et la distance ne compte plus. Le décalage n'est qu'un cadrage.
 */
export const BLAST_FORWARD_BY_MAP: Record<MapId, number> = {
  continent: BLAST_FORWARD,
  sky: 20,
  rot: 20,
  // L'Outremonde est un continent, et sa brume est repoussée à trois cents : la
  // frappe peut y tomber aussi loin que sur le premier, et elle doit — c'est la
  // seule carte où l'on voit vraiment jusque-là.
  beyond: BLAST_FORWARD,
}

// --- Chronologie ------------------------------------------------------------

/**
 * Hauteur de largage de l'ogive, au-dessus de son point d'impact.
 *
 * Trente et non deux cents : à 42 unités de distance le bord haut du cadre est
 * à 19,1 du sol (voir ci-dessus), donc tout ce qui est largué plus haut tombe
 * hors champ et n'apparaît qu'à mi-course. À 30, l'ogive entre dans l'image au
 * premier tiers de sa chute — assez tôt pour qu'on la voie venir, assez haut
 * pour que ça reste une chute et non une apparition.
 */
export const FALL_HEIGHT = 30
/**
 * Durée de chute.
 *
 * Ce n'est pas du remplissage : c'est la seule fenêtre pendant laquelle le
 * joueur peut comprendre que *son* code a déclenché quelque chose. Une
 * explosion instantanée se lit comme un défaut d'affichage ; un sifflement qui
 * descend pendant presque une seconde se lit comme une conséquence.
 */
export const FALL_MS = 900
/** Durée du cœur blanc de l'explosion, le temps que l'œil ne voie rien d'autre. */
export const FLASH_MS = 320
/** Durée de vie du champignon, comptée depuis l'impact. */
export const CLOUD_MS = 4300
/** Fin de la séquence : l'état repasse à `null` et le décor se range. */
export const TOTAL_MS = FALL_MS + CLOUD_MS

// --- Onde de choc -----------------------------------------------------------

/**
 * Vitesse de propagation au sol, en unités par seconde.
 *
 * Réglée par la carte et non à l'oreille : le plus grand écart possible entre
 * le joueur et un ennemi est la diagonale du monde, soit environ 283 unités
 * (200 × √2). À 160 u/s l'onde la parcourt en 1,77 s — assez lent pour qu'on
 * voie l'anneau partir et les ennemis proches tomber les premiers, assez
 * rapide pour que la séquence ne s'éternise pas.
 */
export const WAVE_SPEED = 160
/**
 * Délai après lequel plus rien ne survit, quelle que soit la distance.
 *
 * Choisi juste au-dessus des 1,77 s calculées ci-dessus, et il ne sert jamais
 * en pratique. Il est là parce que la promesse du code de triche — *tous* les
 * ennemis meurent, donc le portail s'ouvre — ne doit pas reposer sur une
 * inégalité géométrique. Le jour où la carte s'agrandit ou où la vitesse de
 * l'onde baisse, ce plafond tient la promesse tout seul.
 */
export const SWEEP_MS = 2200

/**
 * Rayon mortel de l'onde, à un instant donné de la séquence.
 *
 * `0` tant que la bombe tombe, `Infinity` une fois le balayage terminé. C'est
 * la seule fonction que `Enemy.tsx` connaisse de tout ce fichier : un ennemi
 * meurt dès que sa distance au point d'impact passe sous ce rayon.
 *
 * @param elapsed temps écoulé depuis le déclenchement, en ms de temps de jeu.
 */
export function killRadius(elapsed: number) {
  const since = elapsed - FALL_MS
  if (since <= 0) return 0
  if (since >= SWEEP_MS) return Infinity
  return (since / 1000) * WAVE_SPEED
}

// --- Cotes du spectacle -----------------------------------------------------

/** Rayon de la boule de feu à son maximum. */
export const FIREBALL_RADIUS = 6.5
/** Hauteur du pied du champignon, une fois monté. Voir la note de cadrage. */
export const STEM_HEIGHT = 15
/**
 * Rayon de la coiffe, une fois déployée.
 *
 * Elle est aplatie de moitié à l'affichage, donc elle dépasse de 3,75 au-dessus
 * de son centre : le sommet du champignon culmine à 18,5, pour un plafond de
 * cadre à 19,1. C'est le nombre qui ferme la série — le grossir d'une unité
 * fait sortir la coiffe par le haut de l'écran.
 */
export const CAP_RADIUS = 7.5
/**
 * Rayon final de l'anneau de souffle au sol.
 *
 * Plus court que le rayon mortel, et volontairement : au-delà d'une centaine
 * d'unités l'anneau est de toute façon noyé dans la brume (qui sature à 200) et
 * n'aurait plus qu'un coût. Ce que le joueur voit passer, c'est le début de
 * l'onde ; ce qui tue au loin n'a pas à être dessiné.
 */
export const RING_RADIUS = 120

// --- Palette ----------------------------------------------------------------

/** Cœur de l'explosion. Cassé vers le jaune : le blanc pur brûle le bloom. */
export const FLASH_COLOR = '#fff4d2'
/** Boule de feu à son apogée. */
export const FIRE_COLOR = '#ffab3d'
/** Braise refroidissante, sous la coiffe. */
export const EMBER_COLOR = '#e04f24'
/** Fumée du champignon. Grise et chaude, jamais noire : le ciel est violet. */
export const SMOKE_COLOR = '#7a6a63'
