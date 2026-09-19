import { CORE_Y, ROTUNDA_R } from './skyIsland'
import type { LynelAttackId, LynelPhase } from '../types/game'

/**
 * Le combat du Lynel — ses cotes, et la table de ses six attaques.
 *
 * Une **règle de lecture unique** tient tout l'ensemble, et elle vaut mieux
 * qu'une documentation : *ce qui est paré est annoncé par la crinière, ce qui
 * ne l'est pas est annoncé par les pattes.* Le joueur n'a donc jamais à
 * mémoriser six animations — il regarde d'abord où naît le mouvement. Toute
 * attaque ajoutée ici doit respecter ça, sans quoi l'ensemble redevient six
 * cas particuliers.
 */

/** Rayon du dallage de la rotonde — le même nombre que ses piliers, pas une copie. */
export const ARENA_R = ROTUNDA_R
/** Centre de l'arène, en coordonnées monde de l'île. */
export const ARENA_CENTER: [number, number, number] = [0, CORE_Y, 0]

/**
 * Les trois anneaux d'or incrustés dans le dallage.
 *
 * Ils sont déjà dans le dépôt, et ils n'ont jamais été de l'ornement : le
 * commentaire de `Ruins.tsx` les décrit comme des repères de distance pour « le
 * futur boss ». Les portées ci-dessous tombent dessus, et c'est le seul moyen
 * qu'a le joueur de juger une distance d'esquive sans qu'aucun texte ne la lui
 * donne.
 *
 * Attention : un repère au sol est une règle graduée depuis le **centre de
 * l'arène**, pas depuis la bête. Il ne dit donc la portée du souffle et de
 * l'onde que si le Lynel part de l'origine — d'où `RECENTER_RADIUS`, qui a
 * l'air arbitraire et ne l'est pas.
 */
export const ARENA_RINGS = [3.4, 6.6, 9.6] as const

/**
 * Au-delà de cette distance au centre, le Lynel y revient entre deux séquences.
 *
 * Ça lui donne une démarche de gardien plutôt que de poursuivant, ça laisse au
 * joueur les trois secondes qu'il faut pour se soigner ou se replacer, et ça
 * fait des anneaux une information vraie au lieu d'une décoration.
 */
export const RECENTER_RADIUS = 4

/** Multiplicateur des dégâts pendant l'ouverture d'une parade réussie. */
export const PUNISH_MULTIPLIER = 3

/**
 * Seuils de phase, en points de vie restants.
 *
 * 36 → 24 → 12 → 0 : trois tiers égaux. Un découpage inégal se défend, mais il
 * demande alors une raison, et il n'y en a pas ici — chaque phase doit avoir le
 * temps d'enseigner ce qu'elle ajoute.
 */
export const PHASE_THRESHOLDS = { arena: 24, rage: 12 } as const

export function phaseOf(hp: number): LynelPhase {
  if (hp > PHASE_THRESHOLDS.arena) return 'sword'
  if (hp > PHASE_THRESHOLDS.rage) return 'arena'
  return 'rage'
}

export interface LynelAttack {
  id: LynelAttackId
  /** Durée visible de préparation, en millisecondes. */
  telegraphMs: number
  /** Portée en unités monde, mesurée depuis le centre du Lynel. */
  reach: number
  /** Demi-angle du cône touché, en radians. `Math.PI` = tout autour. */
  arc: number
  /** Cœurs retirés au joueur. */
  damage: number
  /**
   * Parable ?
   *
   * C'est ce drapeau, et lui seul, qui décide si l'attaque appelle
   * `offerParry()`. Étendre la parade au Moblin, ce sera ajouter le même
   * drapeau dans `EnemyStats` — pas retoucher le joueur ni le calque.
   */
  parryable: boolean
  /** Première phase où elle est disponible. */
  phase: LynelPhase
  /** Délai avant de pouvoir la relancer, en millisecondes. */
  cooldownMs: number
}

export const LYNEL_ATTACKS: Record<LynelAttackId, LynelAttack> = {
  /*
    Le coup de base, et le cours de parade.

    L'arc de 170° interdit le contournement : on pare, ou on sort de portée,
    jamais les deux. Un balayage esquivable sur le côté n'apprendrait rien —
    le joueur contournerait tout le combat sans jamais découvrir la touche R.
  */
  sweep: {
    id: 'sweep',
    telegraphMs: 620,
    reach: 3.6,
    arc: 1.48,
    damage: 2,
    parryable: true,
    phase: 'sword',
    cooldownMs: 2200,
  },
  /*
    Le plus rapide et le plus long. Il punit le joueur qui recule pour souffler :
    le pas en arrière cesse d'être une échappatoire gratuite, ce qui est la
    condition pour que la parade soit un choix plutôt qu'un dernier recours.
  */
  thrust: {
    id: 'thrust',
    telegraphMs: 400,
    reach: 4.4,
    arc: 0.26,
    damage: 2,
    parryable: true,
    phase: 'sword',
    cooldownMs: 1800,
  },
  /*
    Il se cabre et retombe. La seule attaque qui se *franchit* au lieu de
    s'esquiver : l'onde rase le sol, le saut la passe. Le jeu a un saut qui ne
    servait jusqu'ici qu'à grimper.

    Elle atteint l'anneau 6,6 — le repère du milieu — et c'est ce qui fait de
    cet anneau une information utilisable.
  */
  stomp: {
    id: 'stomp',
    telegraphMs: 760,
    reach: 6.6,
    arc: Math.PI,
    damage: 2,
    parryable: false,
    phase: 'rage',
    cooldownMs: 4200,
  },
  /*
    Un pas de côté, et il finit dans un pilier : 1,4 s d'étourdissement, la plus
    grosse ouverture du combat. Se lit au grattement du sabot antérieur, jamais
    à la crinière — c'est la règle de lecture.

    `reach` vaut le diamètre de l'arène : la charge traverse, elle ne s'arrête
    pas au joueur.
  */
  charge: {
    id: 'charge',
    telegraphMs: 900,
    reach: ARENA_R * 2,
    arc: 0.3,
    damage: 3,
    parryable: false,
    phase: 'arena',
    cooldownMs: 5200,
  },
  /*
    Trois flèches, et pas une ligne de neuf à écrire : le système de projectiles
    existe, et la parade d'épée du jeu les renvoie déjà. Une flèche renvoyée
    coûte 2 au tireur — le double d'un projectile d'Octorok, parce qu'elle
    revient de bien plus loin et qu'il faut que ça vaille le geste.
  */
  volley: {
    id: 'volley',
    telegraphMs: 700,
    reach: 18,
    arc: 0.12,
    damage: 1,
    parryable: false,
    phase: 'arena',
    cooldownMs: 3600,
  },
  /*
    Casser la ligne, et se souvenir que le sol reste dangereux après : c'est ce
    qui rétrécit l'arène sans y poser un seul obstacle, donc sans rien enlever à
    l'esquive.
  */
  breath: {
    id: 'breath',
    telegraphMs: 850,
    reach: 6.6,
    arc: 0.42,
    damage: 2,
    parryable: false,
    phase: 'rage',
    cooldownMs: 5600,
  },
}

/**
 * Les attaques disponibles par phase, construites **une fois** au chargement.
 *
 * Elles étaient filtrées à l'appel, et l'appel a lieu à chaque frame tant que le
 * Lynel est en position d'attaquer : trois tableaux jetables par image, cent
 * quatre-vingts par seconde, pour un résultat qui ne change jamais. Le projet
 * refuse ce déchet ailleurs — `LynelModel` porte une constante entière pour
 * éviter un seul tableau de clés par frame.
 */
const BY_PHASE: Record<LynelPhase, readonly LynelAttack[]> = {
  sword: Object.values(LYNEL_ATTACKS).filter((a) => a.phase === 'sword'),
  arena: Object.values(LYNEL_ATTACKS).filter((a) => a.phase !== 'rage'),
  rage: Object.values(LYNEL_ATTACKS),
}

export function attacksFor(phase: LynelPhase): readonly LynelAttack[] {
  return BY_PHASE[phase]
}
