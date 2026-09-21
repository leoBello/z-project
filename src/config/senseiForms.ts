import { CHALLENGE_RANKS, rankFor, type ChallengeRank } from './challenge'

/**
 * Les six formes du maître, et ce qui les sépare.
 *
 * Le Sanctuaire n'avait qu'un seul interlocuteur et il ne changeait jamais. Or
 * c'est le seul personnage du jeu que l'on revoit **après** l'avoir battu à son
 * propre jeu, et rien ne le montrait : on pouvait remplir les douze catégories
 * de classement et le retrouver exactement tel qu'au premier jour. Ces six
 * paliers sont la seule récompense de l'Outremonde qui ne soit pas un chiffre.
 *
 * **Trois décisions tiennent le fichier.**
 *
 *  1. *Le palier se gagne à la qualité, pas au volume.* Une catégorie compte
 *     quand on y a atteint le rang Guerrier ou mieux — voir `isMasteringRank`.
 *     Compter les défis terminés aurait fait monter le maître en enchaînant des
 *     courses molles en deux minutes facile, ce qui est exactement l'inverse de
 *     ce qu'il propose.
 *
 *  2. *Trois coupes pour six formes.* La base, la forme divine et la dernière
 *     partagent **exactement** les mêmes paramètres de chevelure : seule la
 *     teinte change. Seules les trois formes intermédiaires se dressent. Ce
 *     n'est pas une économie de données, c'est la règle du personnage.
 *
 *  3. *Les paramètres sont ici et non dans le modèle.* `Sensei` lit cette table
 *     et n'a aucune valeur en dur. C'est ce qui permet d'interpoler d'un palier
 *     au suivant sans écrire une transition par couple de formes.
 */

/* --- La règle de maîtrise --------------------------------------------------- */

/**
 * Le rang à partir duquel une catégorie est **maîtrisée**.
 *
 * Guerrier, c'est-à-dire soixante-quinze points par minute. Le palier en
 * dessous est Novice, qui est à zéro et n'est donc jamais raté : le prendre
 * comme seuil aurait rendu la progression automatique, et une progression
 * automatique n'est pas une progression.
 */
export const MASTERY_RANK: ChallengeRank = 'warrior'

/** Position d'un rang dans `CHALLENGE_RANKS`, du meilleur au moins bon. */
function rankIndex(rank: ChallengeRank): number {
  return CHALLENGE_RANKS.findIndex((entry) => entry.id === rank)
}

/**
 * Ce rang vaut-il maîtrise ?
 *
 * La comparaison passe par l'**index** dans `CHALLENGE_RANKS` et non par une
 * liste écrite à la main des rangs acceptés : la table est ordonnée du meilleur
 * au moins bon, donc un rang meilleur a un index plus petit. Ajouter un rang
 * intermédiaire à la table le classera correctement sans toucher à ce fichier.
 */
export function isMasteringRank(rank: ChallengeRank): boolean {
  return rankIndex(rank) <= rankIndex(MASTERY_RANK)
}

/** Une course vaut-elle maîtrise de sa catégorie ? */
export function isMasteringRun(score: number, elapsedMs: number): boolean {
  return isMasteringRank(rankFor(score, elapsedMs))
}

/* --- Les formes ------------------------------------------------------------- */

export type SenseiFormId = 'base' | 'ss' | 'ss2' | 'ss3' | 'ssg' | 'ssb'

/** Ce que la chevelure fait, palier par palier. */
export interface SenseiHair {
  /**
   * De combien les mèches se redressent vers la verticale, de 0 à 1.
   *
   * Appliqué **par mèche** et pondéré par sa propre réponse (voir `Sensei`) :
   * le sommet suit à fond, l'arrière à moitié, les tempes à peine. Sans cette
   * pondération toute la chevelure converge à la verticale et la silhouette
   * devient une colonne au lieu de s'évaser.
   */
  rise: number
  /** Tassement de l'élévation de base, pour les coupes qui retombent. */
  elDown: number
  /** Allongement des mèches. */
  lenK: number
  /** Mèches supplémentaires prises dans la réserve. */
  extra: number
  /** Crinière longue jusqu'aux reins. */
  mane: boolean
}

export interface SenseiAura {
  color: string
  /** Opacité d'une langue à sa naissance. */
  opacity: number
  /** Hauteur atteinte par une langue avant de s'éteindre. */
  height: number
  /** Rayon du cercle où naissent les langues. */
  radius: number
  tongues: number
  motes: number
  /** Anneau de lumière au sol. */
  ring: boolean
  /** Arcs électriques, et leur teinte. */
  bolts: number
  boltColor?: string
}

export interface SenseiForm {
  id: SenseiFormId
  /** Catégories maîtrisées à partir desquelles cette forme est atteinte. */
  gate: number
  /** Clé i18n du nom affiché, sous `ui.challenge.senseiForms`. */
  labelKey: string
  hairColor: string
  /** Teinte de pointe de mèche. `null` quand la mèche est d'un seul ton. */
  tipColor: string | null
  eyeColor: string
  /**
   * Sourcils : de la teinte des cheveux, ou absents.
   *
   * `'none'` n'est pas un oubli — c'est le signe distinctif de la troisième
   * forme, et une arcade de peau saillante les remplace.
   */
  brow: 'hair' | 'none'
  hair: SenseiHair
  aura: SenseiAura | null
  /** Le bâton est-il en main, ou planté à côté ? */
  pole: 'hold' | 'planted'
  pose: {
    /** Écart des appuis. */
    stance: number
    /** Inclinaison du buste. */
    lean: number
    /** Ouverture des bras. */
    armZ: number
    /** Recul des bras. */
    armX: number
    /** Bascule de la tête. */
    headTilt: number
  }
}

/**
 * La coupe de base, partagée par trois formes.
 *
 * Elle est nommée parce qu'elle est **réutilisée à l'identique**, et qu'un
 * lecteur qui verrait trois fois les mêmes cinq nombres se demanderait si c'est
 * voulu. Ça l'est : la forme divine et la dernière gardent la coupe de départ,
 * seule la teinte change.
 */
const BASE_HAIR: SenseiHair = { rise: 0.02, elDown: 0.92, lenK: 1, extra: 0, mane: false }

export const SENSEI_FORMS: readonly SenseiForm[] = [
  {
    id: 'base',
    gate: 0,
    labelKey: 'base',
    hairColor: '#100e14',
    tipColor: null,
    eyeColor: '#241d2c',
    brow: 'hair',
    hair: BASE_HAIR,
    aura: null,
    pole: 'hold',
    pose: { stance: 0.15, lean: 0, armZ: 0.11, armX: 0.06, headTilt: 0 },
  },
  {
    id: 'ss',
    gate: 1,
    labelKey: 'ss',
    hairColor: '#f7d33c',
    tipColor: '#ffe873',
    eyeColor: '#3e9e86',
    brow: 'hair',
    hair: { rise: 0.46, elDown: 1, lenK: 1.26, extra: 2, mane: false },
    aura: {
      color: '#ffd84a',
      opacity: 0.75,
      height: 2.5,
      radius: 0.54,
      tongues: 9,
      motes: 6,
      ring: false,
      bolts: 0,
    },
    pole: 'planted',
    pose: { stance: 0.2, lean: 0.07, armZ: 0.3, armX: -0.28, headTilt: 0.03 },
  },
  {
    id: 'ss2',
    gate: 3,
    labelKey: 'ss2',
    hairColor: '#fad94a',
    tipColor: '#fff09a',
    eyeColor: '#45ab90',
    brow: 'hair',
    hair: { rise: 0.64, elDown: 1, lenK: 1.4, extra: 4, mane: false },
    aura: {
      color: '#ffd84a',
      opacity: 0.82,
      height: 2.9,
      radius: 0.58,
      tongues: 11,
      motes: 8,
      ring: false,
      bolts: 6,
      boltColor: '#7fd8ff',
    },
    pole: 'planted',
    pose: { stance: 0.23, lean: 0.16, armZ: 0.4, armX: -0.46, headTilt: 0.05 },
  },
  {
    id: 'ss3',
    gate: 6,
    labelKey: 'ss3',
    hairColor: '#f8dc55',
    tipColor: '#fff3b0',
    eyeColor: '#4bb397',
    brow: 'none',
    hair: { rise: 0.7, elDown: 1, lenK: 1.5, extra: 4, mane: true },
    aura: {
      color: '#ffe071',
      opacity: 0.9,
      height: 3.3,
      radius: 0.66,
      tongues: 13,
      motes: 11,
      ring: true,
      bolts: 4,
      boltColor: '#ffe8a0',
    },
    pole: 'planted',
    pose: { stance: 0.25, lean: 0.08, armZ: 0.5, armX: -0.24, headTilt: -0.16 },
  },
  {
    id: 'ssg',
    gate: 10,
    labelKey: 'ssg',
    hairColor: '#cc3a33',
    tipColor: '#e2564a',
    eyeColor: '#d1493f',
    brow: 'hair',
    // Coupe de base : la chevelure ne se dresse pas.
    hair: BASE_HAIR,
    aura: {
      color: '#e14a3a',
      opacity: 0.6,
      height: 2.2,
      radius: 0.48,
      tongues: 7,
      motes: 6,
      ring: false,
      bolts: 0,
    },
    pole: 'planted',
    pose: { stance: 0.14, lean: 0.02, armZ: 0.12, armX: 0.02, headTilt: 0.02 },
  },
  {
    id: 'ssb',
    gate: 12,
    labelKey: 'ssb',
    hairColor: '#2bb8dc',
    tipColor: '#79e2f5',
    eyeColor: '#3fd2ee',
    brow: 'hair',
    // Coupe de base également : elle garde la forme de la précédente.
    hair: BASE_HAIR,
    aura: {
      color: '#37c6e8',
      opacity: 0.82,
      height: 2.8,
      radius: 0.56,
      tongues: 10,
      motes: 9,
      ring: true,
      bolts: 0,
    },
    pole: 'planted',
    pose: { stance: 0.21, lean: 0.06, armZ: 0.32, armX: -0.24, headTilt: 0.02 },
  },
]

/**
 * La forme atteinte pour un nombre de catégories maîtrisées.
 *
 * Parcours **du haut vers le bas** et premier palier franchi : écrit dans
 * l'autre sens, il aurait fallu comparer au palier suivant, donc traiter à part
 * le cas de la dernière forme qui n'en a pas.
 *
 * Les valeurs hors bornes sont ramenées dans la table plutôt que refusées. Un
 * compte négatif n'est pas censé exister, mais le seul endroit qui pourrait en
 * produire un est un `localStorage` trafiqué, et la bonne réponse à une sauve-
 * garde abîmée est la forme de départ, pas un écran noir.
 */
export function formForMastery(count: number): SenseiForm {
  const safe = Number.isFinite(count) ? count : 0
  for (let i = SENSEI_FORMS.length - 1; i > 0; i -= 1) {
    if (safe >= SENSEI_FORMS[i].gate) return SENSEI_FORMS[i]
  }
  return SENSEI_FORMS[0]
}

/** La forme d'un identifiant, ou celle de départ s'il n'est pas connu. */
export function formById(id: SenseiFormId): SenseiForm {
  return SENSEI_FORMS.find((form) => form.id === id) ?? SENSEI_FORMS[0]
}
