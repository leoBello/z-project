import { ARENA_CENTER, ARENA_R } from './rotMarsh'
import { ROT } from './rotBlight'
import type { MaleniaAttackId, MaleniaPhase } from '../types/game'

/**
 * Le combat de Malenia — ses cotes, et la table de ses dix attaques.
 *
 * **Une règle de lecture unique tient tout l'ensemble**, comme celle du Lynel,
 * et elle vaut mieux qu'une documentation : *ce qui vient de la lame se pare,
 * ce qui vient du corps ou des ailes s'esquive.* Le joueur n'a donc pas dix
 * animations à mémoriser — il regarde d'où part le mouvement. Toute attaque
 * ajoutée ici doit tenir cette règle, sans quoi l'ensemble redevient dix cas
 * particuliers.
 *
 * Et une seconde règle, qui est *la* mécanique du personnage : **elle se soigne
 * de chaque coup qu'elle porte.** Encaisser n'est plus « perdre un cœur », c'est
 * « rendre dix secondes de travail ». Le joueur qui joue mal ne perd pas
 * lentement — il n'avance pas du tout.
 */

/** Son nom au registre des ennemis. Il n'y en a qu'une. */
export const MALENIA_ID = 'malenia'

/** Le centre et le rayon de son arène : ceux du bassin, pas une copie. */
export { ARENA_CENTER, ARENA_R }

/**
 * Points de vie.
 *
 * C'était la question 01 de la maquette, et la réponse retenue n'est aucune des
 * deux proposées. Quatre-vingt-huit — deux barres pleines, comme le jeu
 * d'origine — est fidèle et beaucoup trop long contre un adversaire qui se
 * soigne : la seconde barre pleine après une première déjà gagnée est
 * exactement le geste qui fait reposer la manette. Quarante-quatre en tout
 * aurait vidé la métamorphose de son poids.
 *
 * **Quarante-quatre, métamorphose à vingt-deux — descendu de soixante après la
 * première partie jouée.** Soixante tenait sur le papier et pas à la manette :
 * contre un adversaire qui se soigne et dont chaque touche coûte deux à quatre
 * cœurs, la première moitié du combat durait déjà plus longtemps que le Lynel
 * doré entier. Le combat garde ses deux formes, ses dix attaques et sa chute
 * d'armure ; il tient maintenant dans une durée qu'on accepte de rejouer.
 *
 * **Une seule barre, et c'est une économie qui n'était pas prévue.** La maquette
 * demandait une seconde barre vide sous la première pour annoncer la phase II.
 * Avec un seuil à mi-vie, c'est le même mécanisme que les phases du Lynel :
 * `CombatOverlay` n'a rien à apprendre, et le joueur voit la barre descendre
 * vers un milieu qu'il peut lire.
 */
export const MALENIA_HP = 44

/** Seuil de la métamorphose, en points de vie restants. */
export const MORPH_AT = MALENIA_HP / 2

/**
 * Durée de la métamorphose.
 *
 * Elle est **invulnérable** pendant, et immobile : l'armure tombe, les ailes
 * s'ouvrent. C'est la seule pause du combat, et elle est là pour que le joueur
 * la regarde — un boss qui change de forme en continuant à frapper ne change pas
 * de forme, il change de statistiques.
 */
export const MORPH_MS = 2200

/**
 * **La phase est un verrou, pas une déduction — et c'est la différence la plus
 * importante entre elle et le Lynel.**
 *
 * Celle du Lynel se relit à chaque frame depuis ses points de vie
 * (`phaseOf(hp)`), ce qui est correct parce que rien ne peut lui en rendre. Ici,
 * elle **se soigne** : une Malenia en phase II qui enchaîne quatre coups
 * repasserait au-dessus de trente points, donc en phase I d'après une telle
 * fonction — et le modèle redeviendrait casqué au milieu du combat, ailes
 * comprises. Le défaut ne se serait vu qu'en jouant mal, c'est-à-dire exactement
 * quand il aurait fait le plus de mal.
 *
 * Il n'y a donc **pas** de `phaseOf` ici, volontairement : la métamorphose
 * s'arme une fois, dans la machine à états, et ne se désarme jamais. Le plafond
 * de soin de la phase II est fixé à `MORPH_AT` pour la même raison — deux
 * verrous valent mieux qu'un sur une valeur qui remonte.
 */

/**
 * Ce qu'elle se rend par coup porté.
 *
 * **Chiffré en fraction de sa propre barre, et pas en coups d'épée du joueur.**
 * La première version disait « une tranche encaissée annule deux coups d'épée »,
 * et c'était faux : l'équipement du jeu multiplie l'attaque par 1 à 4, et les
 * multiplicateurs se composent entre emplacements. « Deux coups d'épée » vaut
 * donc entre deux coups et un tiers de coup selon ce que le joueur porte —
 * c'est-à-dire que la mécanique signature du personnage s'évaporait exactement
 * pour les joueurs les mieux équipés.
 *
 * Deux points sur quarante-quatre, soit **4,5 % de sa vie par touche**, et 11 %
 * sur la saisie. L'écart selon l'équipement demeure — il est inhérent au jeu, et
 * le Lynel doré a le même — mais il porte sur une valeur qu'on peut raisonner :
 * cinq touches encaissées lui rendent un quart de sa barre, quel que soit le
 * joueur.
 *
 * C'était le nombre annoncé comme le plus susceptible de bouger après la
 * première partie, et il a bougé : 5 % la rendaient increvable pour un joueur
 * qui encaisse un peu, parce que la régénération se cumulait avec des dégâts
 * déjà trop élevés. Baisser les deux ensemble était nécessaire — l'un sans
 * l'autre n'aurait rien changé au ressenti.
 *
 * **La parade ne lui rend rien**, et c'était la question 02 de la maquette. Dans
 * le jeu d'origine, même bloqué le coup la soigne, et c'est célèbre pour être
 * injuste. Ici la parade est la mécanique maison : lui refuser le soin est ce
 * qui la fait passer de bonne idée à obligation. C'est le seul écart de fidélité
 * assumé de tout le combat.
 */
export const LIFESTEAL = 2
export const LIFESTEAL_GRAB = 5

/**
 * Multiplicateur de dégâts pendant l'ouverture d'une parade réussie.
 *
 * Le même que celui du Lynel, et **déclaré ici plutôt qu'importé de lui** :
 * c'est un réglage d'équilibrage de *ce* combat, et le jour où l'un des deux
 * devra bouger, il ne doit pas emmener l'autre. Que les deux valent trois
 * aujourd'hui est une coïncidence utile, pas une dépendance.
 *
 * Contre elle, il vaut plus cher qu'ailleurs : une parade est le seul moyen de
 * lui infliger des dégâts sans lui en rendre, donc la seule façon d'avancer.
 */
export const PUNISH_MULTIPLIER = 3

/**
 * Pause commune ajoutée à la récupération de **chaque** attaque.
 *
 * Elle n'existait pas, et c'est ce qui rendait le combat étouffant : dix
 * attaques avec des recharges indépendantes, c'est presque toujours au moins une
 * de disponible, donc une séquence qui repart six cents millisecondes après la
 * précédente. Le joueur n'avait jamais le temps de se replacer, encore moins de
 * frapper.
 *
 * Une demi-seconde partout plutôt qu'un rallongement des dix récupérations : la
 * récupération dit ce que *cette* attaque coûte à sa lanceuse, la respiration dit
 * le rythme du combat. Les mélanger aurait rendu impossible de régler l'un sans
 * déplacer l'autre.
 */
export const BREATH_MS = 500

/** Un coup dans une séquence. */
export interface MaleniaStrike {
  /** Décalage depuis la fin du télégraphe, en millisecondes. */
  at: number
  /** Portée, mesurée depuis son centre. */
  reach: number
  /** Demi-angle du cône touché, en radians. `Math.PI` = tout autour. */
  arc: number
  /** Cœurs retirés au joueur. */
  damage: number
  /**
   * Parable ?
   *
   * C'est ce drapeau, et lui seul, qui décide si le coup appelle `offerParry()`.
   * La règle de lecture s'y résume : il est vrai pour tout ce que la lame porte,
   * faux pour le pied, la saisie, les ailes et la pourriture.
   */
  parryable: boolean
  /**
   * Un spectre, et non elle.
   *
   * Parer un fantôme le dissipe — mais **ne l'ouvre pas** : on ne peut pas
   * punir une image. Sans ce drapeau, les fantômes seraient la meilleure source
   * d'ouvertures du combat, ce qui est l'inverse de ce qu'ils doivent être :
   * ils sont là pour casser la lecture, pas pour la récompenser.
   */
  phantom?: boolean
  /** Elle se replace sur le joueur juste avant ce coup. */
  relocate?: boolean
  /** Ce coup ouvre une flaque de pourriture là où il tombe. */
  puddle?: boolean
  /** Pourriture versée à la touche, en plus du dégât. */
  rot?: number
  /** Vie qu'elle se rend à la touche. Par défaut `LIFESTEAL`. */
  lifesteal?: number
}

export interface MaleniaAttack {
  id: MaleniaAttackId
  /** Durée visible de préparation avant le premier coup, en millisecondes. */
  telegraphMs: number
  /**
   * Distance au joueur au-delà de laquelle l'attaque n'est pas choisie.
   *
   * Distincte de la portée des coups, et il faut le dire parce que c'est
   * contre-intuitif : la portée d'un estoc est de 5,4, mais son allonge
   * *géométrique* n'est que de 2,3 — la différence est du **déplacement**. Elle
   * bondit. `range` dit à partir d'où le bond vaut la peine.
   */
  range: number
  strikes: readonly MaleniaStrike[]
  /** Première phase où elle est disponible. */
  phase: MaleniaPhase
  /** Délai avant de pouvoir la relancer, en millisecondes. */
  cooldownMs: number
  /** Récupération après le dernier coup — l'ouverture offerte au joueur. */
  recoveryMs: number
  /** Poids du tirage. Plus haut = plus fréquente. */
  weight: number
}

/** Un coup ordinaire de la lame : parable, et il la soigne. */
const blade = (at: number, reach: number, arc: number, damage: number): MaleniaStrike => ({
  at,
  reach,
  arc,
  damage,
  parryable: true,
})

export const MALENIA_ATTACKS: Record<MaleniaAttackId, MaleniaAttack> = {
  /*
    Le coup de base, et le cours de parade.

    Elle enchaîne jusqu'à deux fois, à 340 ms d'intervalle — assez pour qu'une
    garde consommée par le premier coup ne couvre pas le second. C'est la
    première chose que le combat enseigne : une parade ne pare qu'un coup.
  */
  slash: {
    id: 'slash',
    telegraphMs: 460,
    range: 5,
    strikes: [blade(0, 3.4, 1.3, 2), blade(340, 3.4, 1.3, 2)],
    phase: 'blade',
    cooldownMs: 2000,
    recoveryMs: 620,
    weight: 3,
  },

  /*
    Quatre tranches, dont la dernière après un temps mort.

    C'est la feinte du combat, et elle est **dans la séquence** plutôt que
    tirée au hasard comme celle du Lynel : celui qui relâche la parade au
    troisième coup mange le quatrième, à tous les coups et pas une fois sur
    quatre. Une feinte aléatoire s'encaisse ; une feinte systématique s'apprend,
    ce qui est mieux — la punition tombe une seule fois par joueur.
  */
  flurry: {
    id: 'flurry',
    telegraphMs: 520,
    range: 5,
    strikes: [
      blade(0, 3.6, 0.8, 1),
      blade(150, 3.6, 0.8, 1),
      blade(300, 3.6, 0.8, 1),
      blade(720, 3.8, 0.8, 1),
    ],
    phase: 'blade',
    cooldownMs: 3600,
    recoveryMs: 700,
    weight: 2,
  },

  /*
    Le coup qui punit le pas en arrière.

    Le plus rapide (380 ms) et le plus long. Reculer pour souffler cesse d'être
    gratuit, ce qui est la condition pour que la parade soit un choix plutôt
    qu'un dernier recours — exactement le rôle qu'avait l'estoc du Lynel.
  */
  thrust: {
    id: 'thrust',
    // 520 et non 380 : c'était le coup le plus rapide du jeu sur une portée de
    // 5,4, donc un coup qu'on encaissait sans l'avoir vu partir. Il doit punir
    // le pas en arrière, pas le fait de ne pas lire dans les pensées.
    telegraphMs: 520,
    range: 7,
    strikes: [{ ...blade(0, 5.4, 0.22, 2), relocate: true }],
    phase: 'blade',
    cooldownMs: 2600,
    recoveryMs: 640,
    weight: 3,
  },

  /*
    Le coup qui punit le contournement.

    Tout autour d'elle, et **pas parable** : il ne vient pas de la lame. C'est la
    règle de lecture qui s'applique, et c'est aussi la seule façon d'empêcher le
    joueur de vivre dans son dos — ce qu'il apprend à faire contre tout ennemi
    dont les attaques sont frontales.
  */
  kick: {
    id: 'kick',
    telegraphMs: 420,
    range: 3.2,
    strikes: [{ at: 0, reach: 2.6, arc: Math.PI, damage: 2, parryable: false }],
    phase: 'blade',
    cooldownMs: 3200,
    recoveryMs: 560,
    weight: 2,
  },

  /*
    La saisie — le coup qui punit la cupidité.

    Elle recule d'un pas, ouvre la main de chair, et fond. Sept cents
    millisecondes de télégraphe, donc largement lisible : ce n'est pas un piège,
    c'est une punition annoncée. **Six points de vie rendus**, soit trois fois
    l'ordinaire : c'est le coup qu'il faut absolument ne pas encaisser, et le
    seul qui ne se pare pas parce qu'il ne vient pas de la lame.
  */
  grab: {
    id: 'grab',
    telegraphMs: 700,
    range: 3,
    strikes: [
      { at: 0, reach: 2.4, arc: 0.35, damage: 2, parryable: false, lifesteal: LIFESTEAL_GRAB },
    ],
    phase: 'blade',
    cooldownMs: 9000,
    recoveryMs: 900,
    weight: 1,
  },

  /*
    Le vol de sarcelle.

    Trois rafales, deux secondes neuf, et une réponse différente pour chacune —
    c'est la pièce autour de laquelle tout le combat est construit, et la seule
    raison de mettre ce personnage dans ce jeu.

    Les deux premières rafales **balaient devant elle** : elles se fuient, et le
    jeu a une course à 7 unités par seconde pour une portée de 7 — la fuite
    marche, tout juste. La troisième se **replace sur le joueur** : aucune
    distance n'en sort. Fuir les deux premières puis revenir parer la troisième
    est la traduction exacte de la réponse du jeu d'origine, et elle n'a demandé
    aucune mécanique nouvelle.

    Sa récupération est la plus longue du combat (1200 ms) : c'est le prix de
    l'avoir lue.
  */
  waterfowl: {
    id: 'waterfowl',
    telegraphMs: 900,
    range: 14,
    strikes: [
      // Première rafale : trois coups (quatre à l'origine — dix touches faisaient
      // dix cœurs, soit deux barres pleines pour une seule attaque).
      blade(0, 6, 0.9, 1),
      blade(140, 6, 0.9, 1),
      blade(280, 6, 0.9, 1),
      // Pause de 550, puis deux coups.
      blade(880, 5.5, 0.9, 1),
      blade(990, 5.5, 0.9, 1),
      // Pause de 700, puis elle fond sur le joueur.
      { ...blade(1690, 6, 0.9, 1), relocate: true },
      blade(1810, 6, 0.9, 1),
      blade(1930, 6, 0.9, 1),
    ],
    phase: 'blade',
    cooldownMs: 20000,
    recoveryMs: 1500,
    weight: 2,
  },

  /*
    Aeonia écarlate — le premier geste de la phase II.

    Elle monte, plonge, et une fleur de sept unités éclôt là où elle touche.
    **Toute l'arène est dedans** (portée 12 = le rayon du bassin), donc la seule
    réponse est d'être déjà en train de courir quand elle monte : 1600 ms de
    télégraphe, et rien à parer.

    Elle verse la jauge de pourriture **entière**. Ce n'est pas un dégât de plus,
    c'est une contamination garantie — quatre cœurs sur les dix secondes qui
    suivent, pendant lesquelles elle continue à frapper.

    Sa récupération de 1800 ms est la plus grande ouverture du combat, et c'est
    ce qui la rend juste : le coup le plus cher à encaisser est aussi celui qui
    paie le plus quand on le lit.
  */
  aeonia: {
    id: 'aeonia',
    telegraphMs: 1600,
    range: 22,
    strikes: [
      {
        at: 0,
        reach: ARENA_R,
        arc: Math.PI,
        damage: 3,
        parryable: false,
        puddle: true,
        // La moitié de la jauge et non son plein : une contamination garantie
        // par-dessus les dégâts faisait huit cœurs sur une seule attaque, soit
        // plus qu'une barre complète. À 55, elle contamine le joueur déjà
        // souillé et laisse une marge à celui qui a gardé les pieds au sec.
        rot: ROT.max * 0.55,
        relocate: true,
      },
    ],
    phase: 'goddess',
    cooldownMs: 42000,
    recoveryMs: 1800,
    weight: 2,
  },

  /*
    Le plongeon pourri — ce qui rétrécit l'arène sans y poser un obstacle.

    Elle plante la lame et laisse une flaque qui pourrit le sol dix secondes.
    C'est exactement ce que faisait le souffle du Lynel, et pour la même raison :
    un obstacle de décor gênerait aussi l'esquive, donc punirait le joueur en
    dehors du moment où il s'est trompé. Une flaque ne gêne que là où elle a
    frappé.
  */
  plunge: {
    id: 'plunge',
    telegraphMs: 800,
    range: 8,
    strikes: [
      {
        at: 0,
        reach: 4.5,
        arc: Math.PI,
        damage: 2,
        parryable: false,
        puddle: true,
        rot: ROT.perHit,
        relocate: true,
      },
    ],
    phase: 'goddess',
    cooldownMs: 6500,
    recoveryMs: 800,
    weight: 3,
  },

  /*
    La fauche ailée — le coup qui punit la fuite.

    Un vol rasant suivi d'un estoc. Sept unités de portée pour un télégraphe de
    700 ms : c'est la première attaque du jeu qui rattrape un joueur à pleine
    course, et c'est ce qui interdit de traiter la phase II comme une course
    d'endurance autour du bassin.
  */
  flying: {
    id: 'flying',
    telegraphMs: 700,
    range: 12,
    strikes: [
      { at: 0, reach: 7, arc: 0.5, damage: 1, parryable: false, relocate: true, rot: ROT.perHit },
      { at: 380, reach: 4.4, arc: 0.3, damage: 1, parryable: false, rot: ROT.perHit },
    ],
    phase: 'goddess',
    cooldownMs: 5000,
    recoveryMs: 760,
    weight: 3,
  },

  /*
    Les fantômes écarlates — le coup qui punit la panique.

    Trois spectres frappent l'un après l'autre, et **le troisième plus vite que
    les deux premiers** : celui qui a pris le rythme sur les deux premiers pare
    trop tard le troisième. C'est la seule attaque du combat qui demande de ne
    pas se fier à la cadence qu'on vient d'entendre.

    Ils sont parables — ce sont des lames, la règle tient — mais parer un
    spectre **ne l'ouvre pas** : voir `phantom`. Ils cassent la lecture, ils ne
    la récompensent pas.
  */
  phantoms: {
    id: 'phantoms',
    telegraphMs: 1100,
    range: 10,
    strikes: [
      { ...blade(0, 4, 0.3, 1), phantom: true, rot: ROT.perHit },
      { ...blade(420, 4, 0.3, 1), phantom: true, rot: ROT.perHit },
      { ...blade(700, 4.4, 0.3, 1), phantom: true, relocate: true, rot: ROT.perHit },
    ],
    phase: 'goddess',
    cooldownMs: 11000,
    recoveryMs: 900,
    weight: 2,
  },
}

/**
 * Les attaques par phase, construites **une fois** au chargement.
 *
 * Elles étaient filtrées à l'appel dans la version du Lynel, et l'appel a lieu à
 * chaque frame tant que la bête est en position d'attaquer : deux tableaux
 * jetables par image pour un résultat qui ne change jamais. Le défaut a été
 * corrigé là-bas ; il ne sera pas réintroduit ici.
 *
 * La phase II garde **tout** ce que la phase I savait faire, et en ajoute
 * quatre. C'est ce qui fait que la métamorphose ne remet pas le joueur à zéro :
 * ce qu'il a appris sert encore.
 */
const BY_PHASE: Record<MaleniaPhase, readonly MaleniaAttack[]> = {
  blade: Object.values(MALENIA_ATTACKS).filter((a) => a.phase === 'blade'),
  goddess: Object.values(MALENIA_ATTACKS),
}

export function attacksFor(phase: MaleniaPhase): readonly MaleniaAttack[] {
  return BY_PHASE[phase]
}

/** Durée totale d'une attaque, du premier coup au dernier. */
export function strikeSpan(attack: MaleniaAttack) {
  return attack.strikes[attack.strikes.length - 1].at
}

/* --- Les flaques ----------------------------------------------------------- */

/** Combien de flaques peuvent coexister. Un pool fixe, comme celui du Lynel. */
export const PUDDLES = 8
/** Rayon d'une flaque. */
export const PUDDLE_R = 2.2
/** Durée de vie d'une flaque. */
export const PUDDLE_MS = 10000

/* --- Déplacement ----------------------------------------------------------- */

/**
 * Sa vitesse de marche.
 *
 * Un peu moins que celle du joueur (7), et c'est délibéré : **on peut la fuir à
 * pied**, sinon le combat n'aurait aucune respiration. Ce qui rattrape le joueur
 * n'est jamais sa vitesse de déplacement, ce sont ses bonds — d'où l'écart entre
 * `range` et la portée des coups dans toute la table ci-dessus.
 */
export const WALK_SPEED = 5.6

/** Distance sous laquelle elle cesse d'avancer : elle est déjà à portée. */
export const CLOSE_ENOUGH = 2.4

/** Sa laisse : le bassin, moins une marge de sécurité. */
export const LEASH_R = ARENA_R - 1
