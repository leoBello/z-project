import type { QuestId } from '../types/game'

/**
 * Le journal de quêtes — ce qu'il y a à faire, et comment le jeu le sait.
 *
 * Aucun état n'est stocké ici, et c'est tout le principe : une quête n'est pas
 * une case à cocher qu'un appelant pense à cocher, c'est une **lecture** de la
 * partie. La carte vidée, l'île atteinte, trois bêtes abattues — ces trois
 * faits vivent déjà dans le store parce que d'autres systèmes en dépendent (le
 * portail, la prime de cœurs, les Lynels montés sur l'île). Le journal les
 * relit ; il ne les double pas.
 *
 * C'est ce qui garantit qu'aucune quête ne peut mentir : un chemin de code
 * oublié — le code de triche qui vide la carte, un voyage rapide qui dépose sur
 * l'île — coche la quête sans avoir à la connaître.
 */

/**
 * Nombre de Lynels de l'épreuve.
 *
 * Il vit **ici** et non dans `config/lynel.ts`, où sont pourtant leurs postes :
 * le journal en a besoin pour afficher « 0 / 3 », et il est chargé dès
 * l'accueil, alors que la configuration du Lynel appartient au fragment de
 * l'Île Céleste (voir l'en-tête de `skyisland/SkyIsland.tsx`). Importer l'une
 * depuis l'autre ferait entrer tout le combat de boss dans le bundle de la page
 * d'accueil, pour un seul chiffre.
 */
export const TRIAL_COUNT = 3

/** Où en est une quête. Les verrouillées ne s'affichent pas : elles se découvrent. */
export type QuestState = 'locked' | 'active' | 'done'

/** Une ligne du journal, telle que le panneau la rend. */
export interface QuestStatus {
  id: QuestId
  state: QuestState
  /** Avancement courant, et son but. Égaux à 1 quand la quête ne se compte pas. */
  current: number
  target: number
}

/**
 * Les faits de partie dont le journal se déduit.
 *
 * Une interface structurelle plutôt que `GameState` lui-même : le journal ne
 * doit pouvoir lire *que* ces sept valeurs, sinon la tentation viendra vite d'y
 * brancher une huitième et de faire du fichier une seconde logique de jeu. Ça
 * le rend aussi testable sans monter de store.
 */
export interface QuestFacts {
  /** Ennemis abattus sur le continent, et combien il y en avait. */
  kills: number
  enemyTotal: number
  /** Le portail de Nakano est ouvert : la carte est vide. */
  portalOpened: boolean
  /** Le joueur a posé le pied sur l'Île Céleste au moins une fois. */
  skyVisited: boolean
  /** Le gardien de la rotonde est tombé. */
  bossDefeated: boolean
  /** Bêtes de l'épreuve déjà abattues. */
  trialSlain: number
  /** Le Lynel doré, au sommet de la montagne de l'ouest, est tombé. */
  goldenSlain: boolean
  /** Malenia est tombée. Lu dans `maleniaSlainAt`, comme le doré dans le sien. */
  maleniaSlain: boolean
  /**
   * Un défi du maître a été mené à terme, au moins une fois.
   *
   * Lu dans `challengeBest`, qui n'est écrit que par `endChallenge` : un défi
   * abandonné en franchissant l'anneau ne le touche pas. C'est donc exactement
   * « le joueur est allé au bout d'un chronomètre », ce que la quête raconte.
   */
  challengeDone: boolean
}

/**
 * Le journal, dans l'ordre où il se lit.
 *
 * L'ordre est celui de la partie et non celui de l'avancement : une quête
 * accomplie reste à sa place, au-dessus de celle qu'elle a ouverte. Un journal
 * qui se réordonne tout seul oblige à relire la liste entière à chaque
 * changement pour retrouver où l'on en est.
 */
export function questBoard(facts: QuestFacts): QuestStatus[] {
  const continentDone = facts.portalOpened

  return [
    {
      id: 'clear-continent',
      state: continentDone ? 'done' : 'active',
      // Plafonné, et ce n'est pas de la coquetterie : le code de triche tue tout
      // le monde d'un coup, et rien ne garantit que le dernier compte tombe
      // pile sur le total si un ennemi meurt deux fois d'une onde et d'une lame.
      current: Math.min(facts.kills, facts.enemyTotal),
      target: facts.enemyTotal,
    },
    {
      id: 'sky-portal',
      state: !continentDone ? 'locked' : facts.skyVisited ? 'done' : 'active',
      current: facts.skyVisited ? 1 : 0,
      target: 1,
    },
    {
      /*
        L'épreuve ne s'ouvre qu'à la chute du gardien, et c'est aussi ce qui fait
        apparaître les trois bêtes sur l'île (voir `SkyIsland.tsx`) : la même
        condition pilote la quête et son contenu, elles ne peuvent donc pas se
        désynchroniser.

        Entre l'arrivée sur l'île et cette chute, le journal n'a **rien** à
        proposer, et c'est voulu : l'île se visite. Lui coller une quête « battez
        le gardien » réduirait une découverte à une consigne.
      */
      id: 'lynel-trial',
      state: !facts.bossDefeated
        ? 'locked'
        : facts.trialSlain >= TRIAL_COUNT
          ? 'done'
          : 'active',
      current: Math.min(facts.trialSlain, TRIAL_COUNT),
      target: TRIAL_COUNT,
    },
    {
      /*
        La montagne de l'ouest, et ce que la herse cachait.

        Elle se déverrouille sur **la même condition qui lève la herse** — les
        trois bêtes abattues — parce que c'est cette condition-là qui rend la
        montagne atteignable. Le joueur voit donc la quête paraître à l'instant
        précis où le chemin s'ouvre, et non avant : le promontoire et ses deux
        tours se regardent depuis l'arrivée sur l'île, mais rien ne dit ce qui
        s'y tient tant qu'on ne peut pas y monter.

        Elle ne se compte pas — un doré, un seul — d'où le but à un. Le journal
        rend alors la ligne sans jauge, ce qui est exact : il n'y a rien à
        collectionner, il y a quelque chose à battre.
      */
      id: 'golden-lynel',
      state:
        facts.trialSlain < TRIAL_COUNT
          ? 'locked'
          : facts.goldenSlain
            ? 'done'
            : 'active',
      current: facts.goldenSlain ? 1 : 0,
      target: 1,
    },
    {
      /*
        Le Marais d'Aeonia, et ce qu'il y a au bout.

        Elle se déverrouille sur **la chute du doré**, parce que c'est elle qui
        perce le portail du sommet — donc la seule chose qui rende ce monde
        atteignable. Même raisonnement que la montagne : la quête paraît à
        l'instant où le chemin s'ouvre, et pas avant.

        Le libellé ne nomme pas Malenia, et c'est délibéré. Les quatre autres
        quêtes disent ce qu'il y a à faire parce que le joueur peut le voir de
        loin — une carte à vider, un portail, trois bêtes, une montagne. Celle-ci
        dit seulement qu'il y a un monde derrière l'anneau. Ce qui l'attend au
        pied de l'arbre n'a pas à être annoncé par un panneau d'interface.
      */
      id: 'aeonia',
      state: !facts.goldenSlain ? 'locked' : facts.maleniaSlain ? 'done' : 'active',
      current: facts.maleniaSlain ? 1 : 0,
      target: 1,
    },
    {
      /*
        L'Outremonde, et c'est la seule ligne du journal qui survive à son
        accomplissement.

        Les cinq autres se ferment sur un état de partie qui ne revient pas : la
        carte est vide, l'île est atteinte, la bête est tombée. Celle-ci se ferme
        sur un défi mené à terme — et rien n'interdit de le relancer pour faire
        mieux. Elle est donc `done` dès le premier chronomètre achevé, quel qu'en
        soit le score, y compris nul : ce qui était demandé était d'y aller, pas
        de gagner.

        Elle se déverrouille sur la chute de Malenia, parce que c'est elle qui
        perce l'anneau du bassin — donc la seule chose qui rende ce monde
        atteignable. Même raisonnement que les trois précédentes : la quête
        paraît à l'instant où le chemin s'ouvre, et pas avant.
      */
      id: 'beyond',
      state: !facts.maleniaSlain ? 'locked' : facts.challengeDone ? 'done' : 'active',
      current: facts.challengeDone ? 1 : 0,
      target: 1,
    },
  ]
}

/**
 * La quête en cours, ou `null` s'il n'y en a pas.
 *
 * Il ne peut y en avoir qu'une : chacune ouvre la suivante. La fonction prend
 * donc la première venue plutôt que d'en retourner une liste — le jour où deux
 * quêtes seraient ouvertes ensemble, c'est cette signature qui le signalera.
 */
export function activeQuest(board: QuestStatus[]): QuestStatus | null {
  return board.find((quest) => quest.state === 'active') ?? null
}
