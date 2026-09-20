import { TRIAL_COUNT } from './quests'
import { CORE_Y, ROTUNDA_R, WALL_R, groundAt } from './skyIsland'
import { MOUNT_WORLD, SUMMIT_CENTER, SUMMIT_R } from './skyMountain'
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
 * L'anneau dans lequel une bête tient, et dont elle ne sort pas.
 *
 * Deux rayons et non un seul, parce qu'une laisse circulaire ne décrit pas un
 * jardin : celui de l'île est une couronne entre la terrasse du cœur (14) et
 * l'enceinte (29,5). Bornée par le seul `max`, une bête lancée vers l'intérieur
 * se cognait au talus du cœur et y restait collée, hors d'atteinte d'un joueur
 * resté sur le dallage.
 */
export interface LynelLeash {
  x: number
  z: number
  /** En deçà, la composante entrante de la vitesse est annulée. Zéro = pas de trou. */
  min: number
  /** Au-delà, c'est la composante sortante. */
  max: number
}

/** La laisse du gardien : le dallage de la rotonde, et rien d'autre. */
export const ARENA_LEASH: readonly LynelLeash[] = [
  { x: ARENA_CENTER[0], z: ARENA_CENTER[2], min: 0, max: ARENA_R },
]

/**
 * Points de vie d'une bête de l'épreuve.
 *
 * La moitié du gardien, et le nombre se lit dans la table des phases : à 18 PV
 * elle commence en phase `arena` — épée, estoc, charge et volée — et bascule en
 * `rage` à 12, comme lui. Ce sont donc de vrais Lynels et non des figurants,
 * mais ils n'ont pas de premier tiers : le joueur qui les affronte a déjà appris
 * la parade sur le gardien, et lui refaire donner trois cours d'épée serait le
 * faire attendre.
 *
 * Trois fois 18 font 54 contre les 36 du gardien. C'est plus, et c'est
 * volontaire — mais ils se tirent un par un (voir `TRIAL_POSTS`), ce qui
 * n'arrive jamais qu'à qui ne se jette pas au milieu.
 */
export const TRIAL_HP = 18

/**
 * Rayon du cercle de garde d'une bête de l'épreuve, autour de son poste.
 *
 * Il décide de la seule chose qui rende l'épreuve jouable : **on n'en réveille
 * qu'une à la fois.** Les trois postes sont à 36 unités l'un de l'autre pour un
 * rayon de détection de 14 ; une bête qui pourrait suivre le joueur sur onze
 * unités reste hors de portée des deux autres, quel que soit l'endroit où la
 * poursuite s'arrête. Élargir cette valeur, c'est transformer trois combats en
 * un seul contre trois.
 */
const TRIAL_LEASH_R = 11

/**
 * Le jardin, borné pour les bêtes : entre la lèvre de la terrasse et l'enceinte.
 *
 * Une unité et demie en deçà du mur plutôt que sur lui — la porte au sud est une
 * ouverture franche dans l'enceinte, et sans cette marge une charge lancée dans
 * son axe sortait de l'île par là.
 */
const GARDEN_LEASH: LynelLeash = { x: 0, z: 0, min: 15, max: WALL_R - 1.5 }

/** Rayon auquel les postes de garde sont plantés, sur la couronne du jardin. */
const TRIAL_POST_R = 21

/**
 * Cap du premier poste. Les trois suivent à 120°.
 *
 * **Trente degrés, parce que les six rampes du jardin sont aux multiples de
 * soixante** (voir `RAMPS_OUTER` et `RAMPS_INNER`) : les trois qui montent au
 * cœur sont à 60°, 180° et 300°, les trois qui descendent au pré à 0°, 120° et
 * 240°. Une série de postes partie de 60° les plantait donc toutes les trois au
 * milieu d'une rampe — et une rampe n'est pas du plat : la bête y naissait en
 * dévers et glissait jusqu'au jardin, à trois unités de son poste, en travers du
 * seul chemin qui monte à la rotonde. Mesuré : rayon 21 au départ, 24 à 25 vingt
 * secondes plus tard.
 *
 * Trente degrés tombe pile entre deux rampes, et le couloir de rampe ne fait que
 * 0,21 rad de demi-largeur : les trois postes sont sur le plat, à 12° du bord le
 * plus proche. Ça les écarte aussi de la porte de l'enceinte — au cap 0, à
 * quinze unités du premier poste, soit une de plus que son rayon de détection :
 * on entre dans le jardin sans que rien ne se réveille.
 */
const TRIAL_POST_THETA = Math.PI / 6

/** Un poste de garde : la bête qui s'y tient, et l'anneau qu'elle défend. */
export interface TrialPost {
  /** Son nom au registre des ennemis. Sert aussi de clé React et de marque de mort. */
  id: string
  /** Point d'apparition, et point de retour entre deux engagements. */
  home: [number, number, number]
  leash: readonly LynelLeash[]
}

/**
 * Les trois postes de l'épreuve, calculés une fois au chargement.
 *
 * Posés sur le sol réel de l'île (`groundAt`) et non à l'altitude nominale du
 * jardin : le relief de surface y monte de quelques dizaines de centimètres, et
 * une bête posée sur la moyenne apparaîtrait enfoncée dans un creux.
 */
export const TRIAL_POSTS: readonly TrialPost[] = Array.from(
  { length: TRIAL_COUNT },
  (_, i) => {
    const theta = TRIAL_POST_THETA + (i * Math.PI * 2) / TRIAL_COUNT
    const ground = groundAt(TRIAL_POST_R, theta)
    return {
      id: `lynel-trial-${i}`,
      home: [ground.x, ground.y, ground.z] as [number, number, number],
      leash: [
        GARDEN_LEASH,
        { x: ground.x, z: ground.z, min: 0, max: TRIAL_LEASH_R },
      ] as const,
    }
  },
)

// --- Le Lynel doré ----------------------------------------------------------

/** Son nom au registre des ennemis. Un seul : il n'y en a qu'un. */
export const GOLDEN_ID = 'lynel-golden'

/**
 * Points de vie du Lynel doré.
 *
 * Une fois et demie le gardien. C'est beaucoup, et ce n'est pas la mesure de sa
 * difficulté : le joueur qui monte jusqu'à lui a déjà tué quatre Lynels, il
 * connaît la parade, les six attaques et la valeur d'une ouverture. Ce qui doit
 * durer plus longtemps, c'est le combat — pas l'apprentissage, qui est fait.
 *
 * Et il n'a **pas** de premier tiers non plus : il ouvre en phase `arena`, avec
 * la charge et la volée, puis bascule en `rage` à mi-vie. Trois cours d'épée de
 * plus auraient repoussé le vrai combat de deux minutes.
 */
export const GOLDEN_HP = 54

/**
 * Seuils de phase du doré, en points de vie restants.
 *
 * `arena` vaut ses PV de départ, ce qui n'est pas un tour de passe-passe mais
 * la lecture littérale de `phaseOf` : `hp > arena` est faux dès la première
 * frame, donc il ne connaît jamais la phase `sword`. Écrire `Infinity` aurait
 * dit la même chose en cachant d'où vient le nombre.
 */
export const GOLDEN_PHASES = { arena: GOLDEN_HP, rage: GOLDEN_HP / 2 } as const

/**
 * Cœurs ajoutés à chacune de ses attaques.
 *
 * **Un de plus, en dur, et non un multiplicateur.** Les cœurs sont entiers :
 * un facteur 1,5 aurait donné 3 au balayage comme à l'estoc et au souffle —
 * donc la même chose que +1 — mais **5** à la charge, soit la moitié d'une
 * barre de vie complète en un coup qui ne se pare pas. Le multiplicateur aurait
 * transformé une attaque en sentence, là où l'addition les renforce toutes de
 * la même façon.
 *
 * La volée fait exception et garde son dégât : une flèche passe par le système
 * commun de projectiles, qui ne sait pas qui l'a tirée. Corriger ça
 * demanderait un dégât par projectile, ce qui est une autre tâche — et trois
 * flèches à 1 restent trois flèches.
 */
export const GOLDEN_DAMAGE_BONUS = 1

/**
 * Son poste, et l'anneau dont il ne sort pas : le plateau du sommet.
 *
 * Une unité et demie en deçà de la lèvre, pour la même raison que la marge de
 * la porte sud sur le jardin : une charge lancée vers le bord sortirait de la
 * montagne, et une bête qui tombe de son arène ne meurt pas — elle disparaît du
 * combat.
 */
export const GOLDEN_POST: readonly [number, number, number] = SUMMIT_CENTER
export const GOLDEN_LEASH: readonly LynelLeash[] = [
  { x: MOUNT_WORLD.x, z: MOUNT_WORLD.z, min: 0, max: SUMMIT_R - 1.5 },
]

/**
 * Seuils de phase, en points de vie restants.
 *
 * 36 → 24 → 12 → 0 : trois tiers égaux. Un découpage inégal se défend, mais il
 * demande alors une raison, et il n'y en a pas ici — chaque phase doit avoir le
 * temps d'enseigner ce qu'elle ajoute.
 */
export const PHASE_THRESHOLDS = { arena: 24, rage: 12 } as const

/** Les deux seuils d'une bête. Ceux du gardien, ou ceux du doré. */
export interface LynelPhases {
  arena: number
  rage: number
}

/**
 * La phase, déduite des PV restants et des seuils de la bête.
 *
 * Les seuils sont un **paramètre** et non une constante depuis que le doré
 * existe : ses 54 PV lus contre la table du gardien l'auraient laissé trente
 * points de vie durant en phase `sword`, c'est-à-dire à deux attaques, ce qui
 * est le contraire de ce qu'on attend d'un dernier adversaire. Les passer en
 * argument plutôt que d'en faire un ratio garde intact le cas des bêtes de
 * l'épreuve, qui ouvrent à 18 PV en phase `arena` — un ratio les aurait toutes
 * renvoyées au cours d'épée.
 */
export function phaseOf(hp: number, thresholds: LynelPhases = PHASE_THRESHOLDS): LynelPhase {
  if (hp > thresholds.arena) return 'sword'
  if (hp > thresholds.rage) return 'arena'
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
