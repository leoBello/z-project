import { create } from 'zustand'
import { track } from '../analytics'
import { useScoresStore } from './useScoresStore'
import {
  playChestCreak,
  playDamage,
  playEquip,
  playFallingBomb,
  playPickup,
  playPortal,
  playReward,
  playRevive,
  playTreasure,
} from '../audio/sfx'
import { preloadMap } from '../components/mapFragments'
import { purgeRot, resetRot } from '../state/rot'
import { requestPlacement } from '../state/playerBody'
import { applyDifficulty, difficulty, resetDifficulty } from '../state/difficulty'
import { BLAST_FORWARD_BY_MAP } from '../config/annihilation'
import {
  COUNTDOWN_MS,
  DEFAULT_DIFFICULTY,
  DEFAULT_DURATION,
  categoryKey,
  pointsFor,
  type DifficultyId,
  type DurationId,
  type ScoreTarget,
} from '../config/challenge'
import { isMasteringRun } from '../config/senseiForms'
import { readMastery, withMastered, writeMastery } from '../state/senseiMastery'
import { ATTACK, PLAYER } from '../config/gameplay'
import { chestById } from '../config/chests'
import { enemyTotal } from '../config/enemies'
import {
  itemById,
  outfitOf,
  slotOf,
  weaponOf,
  type Equipment,
  type ItemSlot,
  type OutfitId,
  type WeaponId,
} from '../config/items'
import { TRIAL_COUNT } from '../config/quests'
import { arrivalFor, arrivalYaw, spawnFor } from '../config/portal'
import { WORLD, sampleHeight } from '../config/world'
import { now as gameNow, resetClock } from '../state/gameClock'
import { playerTransform, resetCombat } from '../state/playerTransform'
import { shake } from '../state/cameraShake'
import { clearPickups } from '../state/pickups'
import { clearProjectiles } from '../state/projectiles'
import type {
  Annihilation,
  ChestId,
  EnemyKind,
  GamePhase,
  ItemId,
  HeartSourceId,
  LandmarkId,
  MapId,
  PlaceId,
} from '../types/game'

/**
 * Nombre de cœurs de départ.
 *
 * Zelda commence à trois cœurs, mais son héros dispose d'un bouclier, d'une
 * roulade et d'une caméra libre pour voir venir les coups. Ici on n'a que le
 * déplacement : à trois cœurs, la carte n'était pas traversable, et une partie
 * pouvait se terminer sans que le joueur ait bougé. Cinq cœurs laissent le
 * temps d'apprendre les deux espèces d'ennemis.
 */
export const MAX_HEARTS = 5
/** Durée d'invincibilité après un coup reçu, en millisecondes. */
export const INVULNERABILITY_MS = 1100

/**
 * Cœurs rendus à l'arrivée sur l'Île Céleste, une fois par partie.
 *
 * Trois, et le nombre se déduit du boss : le Lynel retire deux cœurs par coup
 * d'épée et trois sur sa charge. Trois cœurs de plus, c'est deux parades ratées
 * qu'on peut encaisser au lieu d'une — assez pour apprendre le geste, trop peu
 * pour se passer de l'apprendre.
 */
export const SKY_BOON_HEARTS = 3

/**
 * Dégâts d'un coup d'épée, arme nue.
 *
 * Les armes de l'inventaire *multiplient* cette valeur plutôt que d'en déclarer
 * une nouvelle : les points de vie des ennemis sont des entiers de deux et trois
 * (voir `config/enemies.ts`), et un multiplicateur se lit directement en nombre
 * de coups économisés — ce qu'une valeur absolue oblige à calculer de tête.
 */
export const SWORD_DAMAGE = 1

/**
 * Ce que vaut un coup critique.
 *
 * Le double, et pas davantage. Un critique doit se **sentir** sans rendre le
 * reste du temps insignifiant : à ×3, un joueur qui en enchaîne deux abat un
 * Lynel de l'épreuve en quatre coups, et le combat se met à dépendre du tirage
 * plutôt que de la lecture — exactement ce que la parade a été écrite pour
 * éviter.
 */
export const CRIT_MULTIPLIER = 2

export interface GameState {
  phase: GamePhase
  /**
   * Cœurs actuellement remplis, **rouges et jaunes confondus**.
   *
   * Un seul compteur pour les deux couleurs, et c'est le cœur du modèle : les
   * cases jaunes sont posées *après* les rouges dans la barre, donc soustraire
   * de `hearts` entame les jaunes en premier et remplir les rend en dernier,
   * sans une seule ligne de priorité à écrire. Le plafond n'est pas `maxHearts`
   * mais `heartCapacity()` — voir plus bas.
   */
  hearts: number
  /** Cœurs **rouges** : la vie propre du joueur, réceptacles compris. */
  maxHearts: number
  /**
   * Cœurs **jaunes** accordés par la tenue portée, ou zéro.
   *
   * Séparé de `maxHearts` pour une raison précise : ce sont deux choses
   * différentes. `maxHearts` est un acquis définitif de la partie, `bonusHearts`
   * est prêté par un objet et repart avec lui.
   */
  bonusHearts: number
  /**
   * Cœurs jaunes **restants au moment où une tenue a été retirée**, par objet.
   *
   * Sans cette mémoire, retirer puis remettre la tenue rendrait les deux cœurs
   * jaunes à neuf : un soin gratuit, instantané et illimité, accessible depuis
   * un menu qui met le jeu en pause. On mémorise donc ce qui restait, et le
   * ré-équipement ne rend que ça. Indexé par objet plutôt que gardé en simple
   * nombre : le jour où une deuxième tenue existe, un compteur unique
   * transférerait les jaunes de l'une à l'autre.
   */
  bonusCarry: Partial<Record<ItemId, number>>
  /**
   * Le relèvement de la partie a-t-il été consommé ?
   *
   * **Par partie et non par objet**, et c'est la seule règle qui empêche
   * l'effet d'être une immortalité : l'inventaire met le jeu en pause, donc un
   * compteur porté par la tenue se rechargerait en la retirant et en la
   * remettant, à volonté, y compris à un cœur du game over.
   */
  reviveUsed: boolean
  /**
   * Instant du relèvement, sur l'horloge de jeu, ou `-Infinity`.
   *
   * Lu par le HUD, qui s'en sert de clé pour rejouer son bandeau et son flash —
   * même mécanisme que `lastHitAt` pour le flash de dégâts.
   */
  revivedAt: number
  /**
   * Horodatage du dernier dégât subi, sur l'**horloge de jeu**.
   *
   * Volontairement pas `performance.now()` : les i-frames ne doivent pas
   * s'écouler pendant une pause. Le HUD s'en sert aussi comme `key` React pour
   * rejouer l'animation du flash rouge — la valeur change toujours à chaque
   * coup, donc la `key` continue de fonctionner.
   */
  lastHitAt: number
  /** Ennemis tués sur la partie en cours. */
  kills: number
  /**
   * Lieux déjà trouvés, dans l'ordre de découverte. Le dernier élément pilote
   * le bandeau du HUD ; l'ordre est donc porteur d'information, pas décoratif.
   *
   * Monuments **et** lieux remarquables, dans la même file : le joueur ne fait
   * pas la différence entre trouver la Pyramide et trouver le Gué, et deux
   * listes parallèles auraient fini par afficher deux bandeaux l'un sur
   * l'autre. Voir `PlaceId` et `config/sites.ts`.
   */
  discovered: PlaceId[]
  /**
   * Monuments dont le réceptacle de cœur a été pris.
   *
   * Stocké par identifiant de lieu, et pas en simple compteur : le réceptacle
   * doit rester pris quand on revient sur place, et un compteur ne saurait pas
   * *lequel* a déjà été ramassé.
   */
  heartContainers: HeartSourceId[]
  /**
   * Lieu dont le panneau est ouvert. Non nul implique `phase === 'paused'`.
   */
  activeLandmark: LandmarkId | null
  /**
   * Lieu à portée d'interaction, ou `null`. Pilote l'invite du HUD ; écrit
   * uniquement sur transition, jamais à chaque frame.
   */
  nearbyLandmark: LandmarkId | null
  /**
   * Objets possédés, dans l'ordre de ramassage.
   *
   * L'ordre est porteur d'information comme celui de `discovered` : la grille
   * de l'inventaire range les trouvailles les plus anciennes en premier, ce qui
   * donne au sac une histoire plutôt qu'un tri arbitraire.
   */
  items: ItemId[]
  /**
   * Objets portés, **un par famille** : une tenue, une arme, une babiole.
   *
   * Un emplacement unique aurait été plus simple à écrire et faux à jouer : le
   * katana et la tenue du clan n'occupent pas la même place sur un personnage,
   * et les faire se chasser l'un l'autre aurait fait d'une deuxième trouvaille
   * un renoncement à la première. La famille de l'objet *est* son emplacement
   * (voir `ItemSlot`), il n'y a donc rien à déclarer en plus dans la table des
   * objets — à une exception près, les reliques, qui sont une famille sans
   * emplacement et n'entrent donc jamais dans ce registre. C'est `slotOf` qui
   * tranche, et rien ici ne lit plus `item.kind`.
   */
  equipped: Equipment
  /**
   * Coffres déjà ouverts.
   *
   * Marqué **au déclenchement** de l'ouverture, pas à la fermeture de la carte :
   * c'est aussi cet état qui dit au coffre de dessiner son couvercle relevé, et
   * un couvercle piloté par une variable locale se refermerait au premier
   * remontage du composant.
   */
  openedChests: ChestId[]
  /** L'inventaire est affiché. Implique `phase === 'paused'`. */
  inventoryOpen: boolean
  /**
   * Objet dont la carte est affichée, ou `null`.
   *
   * Deux chemins y mènent — un clic dans l'inventaire, et la révélation d'un
   * coffre — et c'est volontairement le même champ : la carte est un seul
   * composant, elle ne doit pas exister en deux exemplaires qui divergeraient.
   * `chestReveal` distingue les deux contextes pour ceux que ça regarde.
   */
  activeItem: ItemId | null
  /**
   * Coffre dont la séquence d'ouverture est en cours, ou `null`.
   *
   * Non nul pendant toute la séquence : de l'appui sur la touche jusqu'à la
   * fermeture de la carte. Le coffre s'en sert pour animer sa colonne de
   * lumière et faire flotter l'objet, la carte pour choisir son action de
   * sortie — porter la trouvaille tout de suite, ou la ranger dans le sac.
   */
  chestReveal: ChestId | null
  /**
   * Coffre à portée d'ouverture, ou `null`. Même rôle que `nearbyLandmark`, et
   * mis à jour par le même balayage de proximité.
   */
  nearbyChest: ChestId | null
  /**
   * Horodatage du dernier changement d'équipement, sur l'horloge de jeu.
   *
   * Sert de `key` et de départ d'animation à la bouffée de fumée qui masque le
   * changement de silhouette — celui de la tenue comme celui de la lame, qui
   * s'allonge d'un coup. `-Infinity` tant que rien n'a été équipé.
   */
  equipChangedAt: number
  /**
   * Lieu vers lequel une téléportation est en cours, ou `null`.
   *
   * Distinct de `activeLandmark` : tant qu'il est non-nul, l'overlay de
   * braises est à l'écran et la modale n'a pas encore commencé son fondu
   * d'ouverture — elle ne démarre qu'en toute fin de séquence, une fois la
   * dispersion inverse et la pause d'observation écoulées, via
   * `resolveTeleport`.
   */
  teleporting: LandmarkId | null
  /**
   * Frappe d'annihilation en cours, ou `null` — le code de triche, une fois
   * tapé.
   *
   * Un seul champ pour toute la séquence : la chute de l'ogive, l'explosion,
   * l'onde qui tue les ennemis et le champignon de fumée s'en déduisent tous,
   * chacun de son côté, en comparant l'horloge de jeu à `at`. Personne n'a à
   * être prévenu d'une étape par quelqu'un d'autre, donc rien ne peut se
   * désynchroniser. Remis à `null` par `finishAnnihilation`, en fin de séquence.
   */
  annihilation: Annihilation | null
  /**
   * Instant où le portail de l'Île Céleste s'est ouvert, ou `null`.
   *
   * Un horodatage plutôt qu'un booléen, parce que trois choses ont besoin de la
   * *date* et pas seulement du fait : le portail lui-même, qui se déplie depuis
   * rien sur un peu plus d'une seconde, la minimap, dont le repère pulse en
   * phase avec lui, et le bandeau du HUD, qui s'en sert de `key` React pour
   * jouer son animation d'entrée. Un booléen aurait obligé chacun des trois à
   * se rappeler tout seul quand il est passé à vrai.
   */
  portalOpenedAt: number | null
  /**
   * Carte courante. Pilote le décor, la minimap et le point d'apparition.
   *
   * Trois consommateurs seulement, et c'est tout le découpage : l'île n'essaie
   * pas de passer par la tuyauterie du continent — elle apporte son terrain, son
   * collider et son fond de carte. Ce champ ne dit que « lequel des deux mondes
   * est monté », et c'est la seule chose que les deux aient en commun.
   */
  location: MapId
  /**
   * Où en est le combat contre le Lynel.
   *
   * Dans le store et non dans `Lynel.tsx`, parce que trois consommateurs qui ne
   * se connaissent pas en dépendent : la caméra, qui se rapproche ; les
   * barrières qui ferment les travées écroulées ; et le portail du retour. Le
   * tenir dans le composant du boss obligerait chacun d'eux à aller le chercher
   * là-bas, c'est-à-dire dans le fragment de l'île, que le tronc commun ne doit
   * pas importer.
   */
  bossState: 'idle' | 'fighting' | 'defeated'
  /** Les trois cœurs de l'arrivée sur l'île ont-ils déjà été donnés ? */
  skyBoonTaken: boolean
  /**
   * Le joueur a-t-il posé le pied sur l'Île Céleste, au moins une fois ?
   *
   * Un champ à lui plutôt qu'une lecture de `location` ou de `skyBoonTaken` :
   * le premier repasse à `continent` dès qu'on rentre, et le second dit « la
   * prime a été versée », ce qui est une autre question — le jour où elle
   * changerait de condition, la quête du portail se déverrouillerait avec elle
   * sans que personne n'ait touché au journal.
   */
  skyVisited: boolean
  /**
   * Bêtes de l'épreuve déjà abattues, par identifiant de poste.
   *
   * Par identifiant et non en compteur, pour la même raison que
   * `heartContainers` : l'île se démonte quand on rentre au continent, et un
   * simple compteur ferait reparaître les trois bêtes au retour — dont celles
   * qu'on venait de tuer. C'est cette liste qui décide lesquelles sont montées
   * (voir `SkyIsland.tsx`), et un compteur ne saurait pas *laquelle* est morte.
   */
  trialSlain: string[]
  /**
   * Quand le Lynel doré est tombé, ou `null` s'il est encore debout.
   *
   * **Un instant et non un booléen**, exactement pour la raison qui vaut à
   * `portalOpenedAt` le sien : sa chute ouvre un portail, et un portail doit
   * pouvoir se *percer* devant le joueur plutôt que d'être déjà là. Avec un
   * booléen, le fragment de l'île aurait dû retenir de son côté l'instant du
   * basculement — donc tenir un second état, à côté du premier, qui dit la même
   * chose en moins fiable : il serait reparti à zéro à chaque aller-retour, et
   * l'anneau se serait rouvert à chaque visite.
   *
   * Une liste d'identifiants comme `trialSlain` n'avait pas de sens : il n'y en
   * a qu'un, et la question « lequel est mort » ne se pose pas.
   */
  goldenSlainAt: number | null
  /**
   * Instant de la chute de Malenia, ou `null` tant qu'elle tient.
   *
   * Un champ à elle, exactement comme `goldenSlainAt` en a un : `bossState` ne
   * décrit **que** le gardien de la rotonde, et il vaut déjà `defeated` quand on
   * arrive dans le Marais — le joueur a dû tuer le gardien, l'épreuve et le
   * Lynel doré pour y accéder. S'en servir pour elle l'aurait fait naître morte.
   */
  maleniaSlainAt: number | null
  /**
   * Où elle est tombée, pour y poser le réceptacle.
   *
   * Même rôle et même raison que `bossFellAt` : le composant du boss se démonte
   * avec lui, donc le point de chute doit survivre dans le store — sans quoi la
   * récompense n'aurait plus d'endroit où paraître.
   */
  maleniaFellAt: [number, number, number] | null
  /**
   * Quel combat de boss est engagé, ou `null`.
   *
   * **Générique, là où `bossState` est celui de la rotonde.** La distinction a
   * été forcée par Malenia : `bossState === 'fighting'` pilotait à la fois la
   * caméra d'arène (qui vaut pour tous les boss) et les barrières de la rotonde
   * (qui ne valent que pour elle). Les deux ne pouvaient pas rester le même
   * champ le jour où un second boss a eu besoin de la caméra sans avoir de
   * barrières.
   *
   * Le gardien écrit les deux ; Malenia n'écrit que celui-ci.
   */
  arenaFight: 'guardian' | 'malenia' | null
  /** Le journal de quêtes est affiché. Implique `phase === 'paused'`. */
  questsOpen: boolean
  /**
   * Où le Lynel est tombé, en coordonnées monde, ou `null`.
   *
   * Dans le store et non dans son composant, parce que le composant se démonte
   * avec lui : le réceptacle doit paraître à l'endroit du corps, et il n'y a
   * plus personne pour s'en souvenir. C'est la seule raison de ce champ.
   */
  bossFellAt: [number, number, number] | null
  /**
   * Carte vers laquelle un voyage est en cours, ou `null`.
   *
   * Distinct de `location` exactement comme `teleporting` l'est de
   * `activeLandmark` : tant qu'il est non nul, le voile est à l'écran et la
   * carte d'arrivée n'est pas encore montée. C'est aussi lui qui interdit un
   * second franchissement pendant le voyage.
   */
  transit: MapId | null
  /**
   * Lieu à ouvrir à l'arrivée du voyage en cours, ou `null`.
   *
   * Non nul quand le voyage n'a pas été demandé par un portail mais par le menu
   * de téléportation, depuis une carte où les monuments n'existent pas. Il
   * change deux choses au voyage, et deux seulement : on est déposé devant le
   * monument au lieu du portail, et la modale du lieu s'ouvre au retrait du
   * voile. Le reste de la séquence — attente du fragment, démontage de la carte
   * de départ, image effectivement dessinée — est exactement le même, et c'est
   * bien pourquoi la téléportation emprunte ce chemin plutôt que le sien : le
   * vol de braises de `TeleportOverlay` joue une ligne de temps fermée, qui ne
   * sait pas attendre qu'un continent soit monté.
   */
  transitLandmark: LandmarkId | null
  /**
   * La **destination** du portail à portée, ou `null` s'il n'y en a pas.
   *
   * Même rôle que `nearbyChest`, et même discipline : écrit uniquement sur
   * transition, jamais à chaque frame.
   *
   * C'était un booléen — « il y a un portail à côté » — et la destination se
   * déduisait de la carte courante : depuis le continent on part vers le ciel,
   * sinon on rentre. Avec une troisième carte la déduction est fausse, parce que
   * l'île a maintenant **deux** portails qui ne mènent pas au même endroit :
   * celui de la prairie ramène au continent, celui du sommet mène au Marais.
   * C'est donc le portail qui dit où il va.
   */
  nearbyPortal: MapId | null
  /**
   * D'où part le voyage en cours, ou `null`.
   *
   * Écrit dans le même `set` que `transit`, donc avant que le voile n'existe, et
   * remis à `null` par `finishTransit`. Un seul consommateur : `arrivalFor`, qui
   * en a besoin parce que le Marais a maintenant deux portes — celle de la
   * chaussée et celle du bassin — et que la destination seule ne dit plus par
   * laquelle on ressort.
   *
   * Distinct de `location`, et c'est tout l'intérêt : au moment où le voile
   * dépose le joueur, `location` vaut déjà la carte d'**arrivée** (voir
   * `arriveOnMap`, appelé plus tôt dans la séquence). L'origine serait donc
   * perdue sans ce champ.
   */
  transitFrom: MapId | null

  /* --- L'Outremonde et le défi du maître ---------------------------------- */

  /**
   * Quand le joueur a posé le pied sur l'Outremonde, ou `null`.
   *
   * Une **date** et pas un booléen, exactement comme `portalOpenedAt`, et pour
   * la même raison : trois choses en dépendent et aucune ne se contente du fait.
   * Le bandeau d'arrivée s'en sert de `key` React pour rejouer son animation, le
   * halo du sanctuaire cale son embrasement dessus, et le journal de quêtes lit
   * le fait tout court. Un booléen aurait obligé les deux premiers à se
   * rappeler tout seuls quand il est passé à vrai.
   *
   * Écrit une seule fois par partie : c'est la **première** arrivée, pas la
   * dernière. Revenir de l'Outremonde et y retourner ne rejoue pas la fanfare —
   * on ne découvre un monde qu'une fois.
   */
  beyondArrivedAt: number | null
  /**
   * Le maître est-il à portée de parole ?
   *
   * Même rôle et même discipline que `nearbyChest` et `nearbyPortal` : écrit
   * uniquement sur transition, jamais à chaque frame. Il entre dans la règle de
   * priorité d'`interaction.ts`, en dernier — voir là-bas.
   */
  nearbySensei: boolean
  /** Sa proposition est affichée. Implique `phase === 'paused'`. */
  senseiOffer: boolean
  /**
   * Où en est le défi.
   *
   * Quatre états, et il faut les quatre :
   *
   *  - `idle` : il n'y en a pas. C'est l'état de toute la partie sauf deux
   *    minutes ;
   *  - `countdown` : accepté, pas encore commencé. La partie tourne — on peut
   *    courir pendant le décompte — mais aucune mort ne compte encore ;
   *  - `running` : le chronomètre tourne et les morts s'additionnent ;
   *  - `over` : le panneau de résultat est à l'écran. C'est un état et non un
   *    simple `result !== null`, parce qu'il met la partie en pause et qu'il
   *    faut pouvoir le refermer.
   */
  challenge: 'idle' | 'countdown' | 'running' | 'over'
  /**
   * Instant où le défi a été accepté, sur l'horloge de **jeu**.
   *
   * C'est de lui que se déduisent le décompte et le chronomètre, et c'est pour
   * cela qu'il n'y a pas de champ « temps restant » : une durée stockée dans le
   * store devrait être réécrite à chaque frame, ce qui re-rendrait tout ce qui
   * s'y abonne soixante fois par seconde. Le bandeau la recalcule dans sa propre
   * boucle — voir `ChallengeHUD`.
   *
   * Sur l'horloge de jeu et non en temps réel : ouvrir l'inventaire met la
   * partie en pause, donc arrête l'horloge, donc suspend le défi. C'est la seule
   * façon de ne pas punir un joueur qui consulte son équipement, et la seule de
   * ne pas récompenser celui qui s'en sert pour souffler.
   */
  challengeStartedAt: number
  /**
   * La difficulté et la durée choisies devant le maître.
   *
   * Elles vivent **hors du défi** et lui survivent : ce sont des préférences de
   * joueur, pas l'état d'une course. Relancer enchaîne donc sur les mêmes
   * réglages sans avoir à les recliquer, ce qui est tout l'intérêt d'un défi
   * qu'on rejoue pour faire mieux.
   *
   * La difficulté agit aussi **hors défi**, sur toute la carte : elle est posée
   * dans `state/difficulty.ts` dès qu'elle change, et les bêtes la lisent à leur
   * apparition. Un joueur qui veut s'entraîner en facile n'a pas à lancer un
   * chronomètre pour ça.
   */
  challengeDifficulty: DifficultyId
  challengeDuration: DurationId
  /** Bêtes abattues depuis le départ du défi en cours. */
  challengeKills: number
  /**
   * Points marqués depuis le départ, difficulté comprise.
   *
   * Distinct du compte de victimes, et les deux sont affichés : le score dit ce
   * qu'on a osé, le compte dit ce qu'on a abattu. Un Lynel doré vaut vingt-cinq
   * Octoroks, et c'est ce rapport-là qui décide si l'on traverse la carte ou si
   * l'on ratisse la plage. Voir `KILL_POINTS`.
   */
  challengeScore: number
  /** Score du dernier défi terminé, ou `null` s'il n'y en a pas encore eu. */
  challengeResult: number | null
  /** Bêtes abattues lors du dernier défi terminé. */
  challengeResultKills: number
  /** Durée réellement courue par le dernier défi, en millisecondes de jeu. */
  challengeResultMs: number
  /** Le défi terminé s'est-il achevé sur une mort plutôt que sur le temps ? */
  challengeFailed: boolean
  /**
   * La tenue et l'arme portées **au moment où le chronomètre s'est arrêté**.
   *
   * Figées ici et non relues dans `equipped` quand vient l'enregistrement du
   * score : le panneau de résultat met la partie en pause mais le score, lui,
   * reste affiché jusqu'au défi suivant. Sans cet instantané, ouvrir un coffre
   * après sa course aurait réécrit ce avec quoi elle avait été faite — et le
   * classement par tenue, qui est tout l'intérêt d'avoir huit silhouettes,
   * aurait menti sur une ligne sur deux.
   */
  challengeResultOutfit: OutfitId
  challengeResultWeapon: WeaponId
  /**
   * Les records, **par catégorie** : une durée, une difficulté, douze cases.
   *
   * Les mélanger n'aurait aucun sens — dix minutes en facile et deux minutes en
   * difficile ne se comparent pas — et la seule façon de garder un record
   * honnête est de ne jamais le faire tenir dans la même case qu'un autre. La
   * clé vient de `categoryKey`, et elle est la même des deux côtés : le panneau
   * du maître montre le record de la catégorie **qu'on s'apprête à jouer**.
   */
  challengeBests: Record<string, { score: number; kills: number }>
  /**
   * Les catégories **maîtrisées** : celles où le rang Guerrier a été atteint.
   *
   * Elle double partiellement `challengeBests`, et c'est voulu. Les records
   * disent *combien* on a marqué et meurent avec l'onglet ; celle-ci dit
   * seulement *quelles cases sont cochées* et survit aux visites, parce qu'elle
   * commande la forme du maître — la seule récompense de l'Outremonde qui
   * n'ait pas à être regagnée chaque fois. Voir `state/senseiMastery`.
   */
  senseiMastered: string[]
  /**
   * Génération du peuplement de l'Outremonde. Sert de `key` React.
   *
   * L'incrémenter démonte et remonte les soixante-treize corps de la carte —
   * bêtes, Lynels et la Déchue — ce qui les remet tous debout, à leur poste, aux
   * points de vie de la difficulté courante. C'est l'idiome de `runId` appliqué
   * à une seule carte, et c'est ce qui permet de **relancer un défi autant de
   * fois qu'on veut** sur un monde entier plutôt que sur ses restes.
   *
   * Les petites bêtes réapparaissent d'elles-mêmes en cours de course (voir
   * `RESPAWN_MS`) ; les six gros, non. Eux ne reviennent qu'ici.
   */
  populationId: number

  /**
   * Identifiant de la partie. Sert de `key` React sur le joueur et les ennemis :
   * l'incrémenter démonte et remonte tout le monde, ce qui remet positions,
   * points de vie et machines à états à zéro sans logique de réinitialisation
   * à écrire dans chaque composant.
   */
  runId: number

  /**
   * Génération des boss de la carte courante. Sert de `key` React.
   *
   * Troisième exemplaire de l'idiome de `runId`, après `populationId`, et le
   * plus étroit des trois : il ne remonte que les adversaires qui ont un nom.
   *
   * Il existe parce que la mort ne rejoue plus la partie. Le joueur repart du
   * point d'apparition de sa carte avec son inventaire (voir `respawn`), donc
   * plus rien ne démonte le Marais ni l'Île — et une Déchue laissée à huit
   * points de vie se serait achevée à la visite suivante. Or c'est la seule
   * chose qu'un boss ne doit pas être : une barre de vie qu'on grignote en
   * mourant. Le monde garde ses plaies, les boss non.
   *
   * Les instantanés de montage (`standing`, `guardianStanding`, le doré) sont
   * repris au passage, et c'est ce qui empêche l'inverse — un boss **vaincu**
   * qui ressusciterait à la mort du joueur : ils relisent le store au montage,
   * donc un boss tombé reste tombé.
   */
  worldId: number

  /**
   * Inflige des dégâts au joueur ; ignoré pendant l'invincibilité.
   *
   * `from` nomme l'**espèce** qui frappe, et il est optionnel : une chute, un
   * piège ou un projectile sans propriétaire n'ont personne à déclarer, et
   * l'omettre revient à dire « le monde », c'est-à-dire le tarif plein. Il
   * n'existe que pour `damageBy` — voir la table des objets — et c'est la
   * raison pour laquelle il porte une espèce et non un identifiant d'ennemi :
   * une armure se taille contre une engeance, jamais contre un individu.
   */
  damagePlayer: (amount?: number, from?: EnemyKind) => void
  /** Vrai tant que le joueur est en i-frames (clignotement + immunité). */
  isInvulnerable: () => boolean
  /** Rend des cœurs au joueur. Ignoré si la barre est déjà pleine. */
  healPlayer: (amount?: number) => boolean
  /**
   * Compte une victime.
   *
   * L'espèce est passée par l'appelant depuis que le défi compte des **points**
   * et plus seulement des têtes : un Octorok abattu de loin et un Lynel doré
   * mené au bout de cinquante-quatre points de vie ne valent pas la même chose.
   * Elle est facultative, et son absence vaut zéro point — le continent, lui, ne
   * compte que des têtes, et n'a aucune raison de connaître un barème.
   */
  registerKill: (target?: ScoreTarget) => void
  /**
   * Ramasse le réceptacle d'un monument : un cœur maximal de plus, et la vie
   * refaite au passage. Retourne faux s'il était déjà pris, pour que
   * l'appelant sache s'il doit faire disparaître l'objet.
   */
  claimHeartContainer: (id: HeartSourceId) => boolean
  /** Marque un lieu comme trouvé. Sans effet s'il l'était déjà. */
  discoverPlace: (id: PlaceId) => void
  /** Ouvre le panneau d'un lieu et met la partie en pause. */
  openLandmark: (id: LandmarkId) => void
  /** Referme le panneau et rend la main au jeu. */
  closeLandmark: () => void
  /** Signale le lieu à portée d'interaction, ou `null` s'il n'y en a plus. */
  setNearbyLandmark: (id: LandmarkId | null) => void
  /** Signale le coffre à portée d'ouverture, ou `null`. */
  setNearbyChest: (id: ChestId | null) => void

  /** Capacité totale de la barre de vie : cœurs rouges plus cœurs jaunes. */
  heartCapacity: () => number
  /**
   * Dégâts d'un coup d'épée, arme portée comprise.
   *
   * Une fonction et non un champ : elle est appelée une fois par coup porté,
   * depuis `Enemy.tsx`, et un champ tenu à jour à chaque équipement aurait été
   * une seconde source de vérité à côté de la table des objets.
   */
  swordDamage: () => number
  /**
   * Portée effective du coup d'épée, équipement compris.
   *
   * Une fonction et non un champ, comme `swordDamage()` et pour la même raison.
   * Quatre appelants la lisent au moment de l'impact — les trois familles
   * d'ennemis et le renvoi de projectile — là où ils lisaient jusqu'ici la
   * constante `ATTACK.reach`. C'est ce qui permet à un objet d'allonger le bras
   * sans qu'aucun d'eux ne le sache.
   */
  swordReach: () => number
  /**
   * Probabilité qu'un coup soit critique, équipement compris.
   *
   * Composée comme des événements indépendants — `1 − Π(1 − p)` — et non par
   * addition : deux sources à 60 % additionnées donneraient une certitude
   * obtenue par arithmétique plutôt que par conception.
   */
  critChance: () => number
  /**
   * Dégâts réellement subis pour une agression de `amount`, équipement compris.
   *
   * Miroir exact de `swordDamage()`, et pour les mêmes raisons : une fonction
   * et non un champ, parce qu'un champ tenu à jour à chaque équipement serait
   * une seconde source de vérité à côté de la table des objets ; arrondie,
   * parce que les cœurs sont des entiers.
   *
   * Le plancher à 1 n'est pas de la prudence gratuite : le jour où une babiole
   * défensive divisera les dégâts par deux, elle doit rendre les coups moins
   * chers, pas gratuits. Sans lui, le premier multiplicateur sous 0,5 rendrait
   * le joueur immortel.
   */
  damageTaken: (amount: number, from?: EnemyKind) => number
  /** Ouvre l'inventaire et met la partie en pause. */
  openInventory: () => void
  /** Referme l'inventaire, et la carte d'objet avec lui. */
  closeInventory: () => void
  /** Affiche la carte d'un objet possédé. */
  showItem: (id: ItemId) => void
  /** Referme la carte d'objet, sans quitter l'inventaire. */
  hideItem: () => void
  /**
   * Porte un objet. Retire d'abord celui qui occupait **son emplacement**, en
   * mettant ses cœurs jaunes de côté. Sans effet si l'objet n'est pas possédé.
   */
  equipItem: (id: ItemId) => void
  /**
   * Retire l'objet porté, s'il l'est, et met ses cœurs jaunes restants de côté.
   *
   * Prend l'objet et non l'emplacement : l'appelant est une carte d'objet, qui
   * sait ce qu'elle affiche et n'a pas à connaître la table des emplacements.
   */
  unequipItem: (id: ItemId) => void
  /**
   * Déclenche l'ouverture d'un coffre : gèle la partie et lance sa séquence.
   * Retourne faux s'il était déjà ouvert ou si la partie n'est pas en cours.
   */
  openChest: (id: ChestId) => boolean
  /**
   * Affiche la carte de l'objet trouvé, en fin d'animation du coffre — pas au
   * moment où le couvercle s'ouvre : le délai laisse voir les éclats et l'objet
   * s'élever avant que la carte ne recouvre l'écran (voir `TreasureChest`).
   */
  resolveChest: () => void
  /**
   * Referme la carte du coffre : l'objet entre à l'inventaire et la main est
   * rendue au jeu. Le coffre, lui, reste ouvert — il l'est depuis `openChest`.
   *
   * `equip` porte la trouvaille dans la foulée, pour le bouton de la carte de
   * révélation. C'est un paramètre et non une action séparée parce que les deux
   * gestes sont indissociables : l'objet n'existe dans le sac qu'à partir de
   * cette fermeture, et `equipItem` refuse ce qu'on ne possède pas.
   */
  finishChest: (equip?: boolean) => void
  /**
   * Démarre une téléportation vers `id` : gèle la partie et déclenche
   * l'overlay. Depuis une autre carte, c'est le voile de voyage qui s'en charge
   * — voir `transitLandmark`. Sans effet si une téléportation ou un voyage est
   * déjà en cours, si la partie est terminée, ou si `id` est déjà le lieu
   * affiché.
   */
  teleportTo: (id: LandmarkId) => void
  /**
   * Ouvre la modale du lieu en cours de téléportation, en toute fin de
   * séquence — pas au "warp" : le délai est volontaire, pour laisser le temps
   * de voir la dispersion inverse des braises et la destination avant que la
   * modale n'apparaisse (voir `TeleportOverlay`).
   */
  resolveTeleport: () => void
  /** Efface l'état de téléportation, en fin d'animation. */
  finishTeleport: () => void
  /**
   * Largue l'ogive au-dessus du joueur : le code de triche vient d'être tapé.
   *
   * Retourne faux si elle est refusée — partie non en cours, ou frappe déjà en
   * vol. L'appelant s'en sert pour savoir s'il doit consommer la séquence de
   * touches ou la laisser courir.
   */
  triggerAnnihilation: () => boolean
  /** Range le champignon, en fin de séquence. */
  finishAnnihilation: () => void

  /**
   * Un anneau **se signale** à portée, ou se retire.
   *
   * L'identité de l'anneau est dans la signature, et ce n'est pas décoratif :
   * deux cartes portent deux portails, et ils tournaient tous les deux à chaque
   * frame. Voir la règle d'arbitrage sur l'implémentation.
   */
  setNearbyPortal: (to: MapId, near: boolean) => void
  /**
   * Compte une bête de l'épreuve, et donne le cœur si c'était la dernière.
   *
   * Idempotent par identifiant : la mort d'un Lynel est résolue dans sa boucle
   * de frame, et un appel de trop ne doit pas avancer l'épreuve.
   */
  registerTrialKill: (id: string) => void
  /**
   * Le Lynel doré tombe : la dernière quête s'achève, et le cœur est donné.
   *
   * Idempotent, comme `registerTrialKill` et pour la même raison : la mort
   * d'une bête est résolue dans sa boucle de frame, et un appel de trop ne doit
   * pas verser deux fois la récompense — `claimHeartContainer` refuserait la
   * seconde, mais la mesure d'audience, elle, serait partie deux fois.
   */
  registerGoldenKill: () => void
  /** Ouvre le journal de quêtes, et met la partie en pause. */
  openQuests: () => void
  closeQuests: () => void
  /** Le joueur entre dans l'arène : le combat commence. Idempotent. */
  startBossFight: () => void
  /**
   * Malenia se lève. Idempotent, pour la même raison que `startBossFight` :
   * elle l'appelle depuis sa boucle, donc potentiellement soixante fois par
   * seconde tant que le joueur est dans le bassin.
   */
  startMaleniaFight: () => void
  /** Elle tombe, ou le joueur quitte le bassin. */
  endMaleniaFight: (defeated: boolean, fellAt?: [number, number, number]) => void
  /**
   * Le combat s'arrête, vaincu ou non.
   *
   * `fellAt` n'est lu que sur une victoire : c'est là que se posera le
   * réceptacle, et l'endroit meurt avec le composant du boss.
   */
  endBossFight: (defeated: boolean, fellAt?: [number, number, number]) => void
  /**
   * Part vers l'autre carte : gèle la partie et lève le voile.
   *
   * Retourne faux si le voyage est refusé — partie non en cours, voyage déjà en
   * vol, ou destination déjà courante.
   */
  enterMap: (to: MapId) => boolean
  /** Bascule effectivement de carte, sous le voile opaque. */
  arriveOnMap: () => void
  /**
   * Retire le voile et rend la main au jeu, en fin de séquence — ou ouvre la
   * modale du lieu quand le voyage en portait un (`transitLandmark`).
   */
  finishTransit: () => void
  /**
   * Abandonne le voyage en cours : le joueur n'a pas bougé, rien ne s'ouvre.
   *
   * Distinct de `finishTransit` précisément parce que celui-ci ouvrirait la
   * modale d'un lieu devant lequel le joueur n'a jamais été déposé.
   */
  abortTransit: () => void
  /**
   * Relève le joueur après une mort : au point d'apparition de sa carte, soigné,
   * tout son acquis en poche.
   */
  respawn: () => void
  /** Relance une partie depuis zéro. */
  reset: () => void

  /* --- Le défi du maître --------------------------------------------------- */

  /** Le maître entre ou sort de portée. Écrit sur transition seulement. */
  setNearbySensei: (near: boolean) => void
  /** Ouvre sa proposition, et met la partie en pause le temps qu'on la lise. */
  openSenseiOffer: () => void
  /** La referme sans rien lancer. */
  closeSenseiOffer: () => void
  /** Choisit la difficulté. Prend effet immédiatement, défi ou non. */
  setChallengeDifficulty: (id: DifficultyId) => void
  /** Choisit la durée. Ne prend effet qu'au défi suivant. */
  setChallengeDuration: (id: DurationId) => void
  /** On accepte : le décompte part, la partie reprend. */
  acceptChallenge: () => void
  /** Fin du décompte — le chronomètre part. Appelé par la boucle du bandeau. */
  beginChallenge: () => void
  /**
   * Fin du défi. `failed` distingue la mort du temps écoulé.
   *
   * Idempotent : la boucle du bandeau l'appelle à la frame où le temps tombe à
   * zéro, et `damagePlayer` peut l'appeler sur la même frame si le coup fatal
   * arrive à cet instant. Sans la garde, le second appel écraserait le score
   * avec un compteur déjà remis à zéro.
   */
  endChallenge: (failed: boolean) => void
  /** Referme le panneau de résultat et rend la main, sur place. */
  dismissChallengeResult: () => void
  /** Referme le panneau **et** repose le joueur au Sanctuaire. */
  returnToSanctuary: () => void
}

const initialState = {
  phase: 'playing' as GamePhase,
  hearts: MAX_HEARTS,
  maxHearts: MAX_HEARTS,
  bonusHearts: 0,
  bonusCarry: {} as Partial<Record<ItemId, number>>,
  lastHitAt: -Infinity,
  reviveUsed: false,
  revivedAt: -Infinity,
  kills: 0,
  discovered: [] as PlaceId[],
  heartContainers: [] as HeartSourceId[],
  items: [] as ItemId[],
  equipped: {} as Equipment,
  openedChests: [] as ChestId[],
  inventoryOpen: false,
  activeItem: null as ItemId | null,
  chestReveal: null as ChestId | null,
  nearbyChest: null as ChestId | null,
  equipChangedAt: -Infinity,
  activeLandmark: null as LandmarkId | null,
  nearbyLandmark: null as LandmarkId | null,
  teleporting: null as LandmarkId | null,
  annihilation: null as Annihilation | null,
  portalOpenedAt: null as number | null,
  location: 'continent' as MapId,
  skyBoonTaken: false,
  skyVisited: false,
  trialSlain: [] as string[],
  goldenSlainAt: null as number | null,
  maleniaSlainAt: null as number | null,
  maleniaFellAt: null as [number, number, number] | null,
  arenaFight: null as 'guardian' | 'malenia' | null,
  questsOpen: false,
  bossFellAt: null as [number, number, number] | null,
  bossState: 'idle' as 'idle' | 'fighting' | 'defeated',
  transit: null as MapId | null,
  transitLandmark: null as LandmarkId | null,
  nearbyPortal: null as MapId | null,
  transitFrom: null as MapId | null,
  beyondArrivedAt: null as number | null,
  nearbySensei: false,
  senseiOffer: false,
  challenge: 'idle' as 'idle' | 'countdown' | 'running' | 'over',
  challengeStartedAt: -Infinity,
  challengeDifficulty: DEFAULT_DIFFICULTY as DifficultyId,
  challengeDuration: DEFAULT_DURATION as DurationId,
  challengeKills: 0,
  challengeScore: 0,
  challengeResult: null as number | null,
  challengeResultKills: 0,
  challengeResultMs: 0,
  challengeFailed: false,
  challengeResultOutfit: 'luffy' as OutfitId,
  challengeResultWeapon: 'fists' as WeaponId,
  challengeBests: {} as Record<string, { score: number; kills: number }>,
  // Hydraté depuis le stockage, contrairement à tout le reste de l'état : une
  // partie recommence, une progression de maître non.
  senseiMastered: readMastery(),
  populationId: 0,
}

/** Secousse du relèvement : plus ample que celle d'une mort d'ennemi. */
const REVIVE_SHAKE = 0.22
const REVIVE_SHAKE_MS = 420

/**
 * Un coup fatal peut-il être annulé, là, maintenant ?
 *
 * Fonction pure et non action du store : elle est appelée depuis
 * `damagePlayer`, qui tient déjà son instantané d'état et ne doit pas le relire
 * au milieu de son calcul.
 *
 * Elle parcourt tout l'équipement plutôt que le seul emplacement de tenue, par
 * la même discipline que `damageTaken` et `swordDamage` : c'est la table des
 * objets qui dit ce qu'un objet fait, et rien n'interdit qu'une babiole relève
 * un jour.
 */
function reviveAvailable(state: GameState) {
  if (state.reviveUsed) return false
  return Object.values(state.equipped).some((id) => (itemById(id)?.revives ?? 0) > 0)
}

/**
 * Vide un emplacement d'équipement, en mettant de côté les cœurs jaunes qui
 * restaient à l'objet qui l'occupait.
 *
 * Fonction pure et non action du store : elle est appelée par `equipItem`
 * *avant* de poser le nouvel objet, et deux `set` successifs auraient fait
 * clignoter la barre de vie à la valeur intermédiaire.
 */
function stripSlot(state: GameState, slot: ItemSlot) {
  const equipped = { ...state.equipped }
  delete equipped[slot]

  const current = state.equipped[slot]
  const item = current ? itemById(current) : undefined
  // Une arme n'a pas de cœurs jaunes à rendre : on ne touche alors ni à la barre
  // de vie ni à la réserve. Le test porte sur l'objet et non sur l'emplacement —
  // c'est la table des objets qui sait ce qu'un objet prête.
  if (!current || !item || item.bonusHearts === 0) {
    return {
      hearts: state.hearts,
      bonusHearts: state.bonusHearts,
      bonusCarry: state.bonusCarry,
      equipped,
    }
  }
  // Ce qui dépasse des cœurs rouges *est* le jaune restant : la barre est un
  // pool unique dont les jaunes occupent la fin.
  const left = Math.max(0, state.hearts - state.maxHearts)
  return {
    hearts: Math.min(state.hearts, state.maxHearts),
    bonusHearts: 0,
    bonusCarry: { ...state.bonusCarry, [current]: left },
    equipped,
  }
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,
  runId: 0,
  // Hors d'`initialState`, comme `runId` et pour la même raison : ce sont des
  // clés React, et une clé qui reviendrait à sa valeur d'origine au milieu
  // d'une session ne garantirait plus le remontage qu'on lui demande.
  worldId: 0,

  damagePlayer: (amount = 1, from) => {
    const state = get()
    const { phase, hearts, isInvulnerable, damageTaken } = state
    if (phase !== 'playing' || isInvulnerable()) return

    /*
      L'appelant dit ce qu'il inflige **et qui il est**, l'équipement dit ce que
      ça coûte, et la difficulté dit sur quel terrain on joue.

      Les trois se composent dans cet ordre, et la difficulté vient en premier
      parce qu'elle décrit le monde : elle vaut un partout sauf sur l'Outremonde
      (voir `state/difficulty.ts`), donc cette ligne ne change rien aux trois
      autres cartes. Les ennemis, eux, n'ont toujours pas à connaître la table
      des objets ni le réglage courant : ils se nomment, ils ne se comparent pas.

      Le plancher d'un cœur de `damageTaken` s'applique après : en facile, ce
      sont les gros coups qui sont divisés — une charge de Lynel à deux cœurs en
      rend un — jamais les égratignures.
    */
    const next = Math.max(0, hearts - damageTaken(amount * difficulty.damage, from))

    /*
      Le coup était fatal, et quelque chose de porté l'annule.

      Trois choix se lisent dans ce bloc :

       - **`playDamage` n'est pas joué.** Le son du dégât et celui du
         relèvement se marcheraient dessus à l'instant précis où le joueur doit
         comprendre ce qui vient de se passer ; `playRevive` part d'ailleurs sur
         un coup sourd, qui tient le rôle du premier ;
       - **seuls les cœurs rouges reviennent.** La réserve jaune de la tenue est
         dépensée, et c'est ce qui empêche le second souffle d'être une remise à
         neuf : on repart avec la barre de base, pas avec celle de l'équipement.
         Le modèle de barre unique fait le reste — `bonusHearts` reste au
         plafond, sa portion est simplement vide ;
       - **`lastHitAt` est repoussé.** Sans lui, aucune invulnérabilité ne
         couvre le relèvement, et le contact qui vient de tuer le referait à la
         frame suivante — le second souffle serait consommé sans qu'on ait eu le
         temps de bouger.
    */
    if (next === 0 && reviveAvailable(state)) {
      playRevive()
      shake(REVIVE_SHAKE, REVIVE_SHAKE_MS)
      set({
        hearts: state.maxHearts,
        reviveUsed: true,
        revivedAt: gameNow(),
        lastHitAt: gameNow(),
      })
      return
    }

    /*
      On ne meurt pas sur l'Outremonde — on est relevé au Sanctuaire.

      C'est la seule carte du jeu où le Game Over n'existe pas, et ce n'est pas
      une faveur : elle vient **après** la partie. Les cinq quêtes sont closes,
      il n'y a plus de progression à perdre, et renvoyer le joueur à l'écran de
      fin lui coûterait la totalité d'une partie terminée pour avoir mal jugé une
      charge de Lynel dans un terrain de jeu. Ce serait la punition la plus
      disproportionnée du jeu.

      Ce qui se paie, en revanche, est le **défi** : le chronomètre s'arrête, le
      score est arrêté là, et le panneau le dit. C'est la seule conséquence de la
      mort ici, et elle suffit — deux minutes perdues à trente secondes de la fin
      font plus mal qu'un écran noir.

      La vie est refaite jusqu'à la capacité **totale**, cœurs jaunes compris :
      on est reposé sur le dallage d'un sanctuaire, pas soigné à moitié. Et
      `lastHitAt` est repoussé pour la même raison que le second souffle — sans
      i-frames, la bête qui vient de tuer recommencerait avant qu'on ait bougé,
      sauf qu'ici on est à quarante unités d'elle et que ça n'arrivera pas ; la
      garde est là parce qu'elle est juste, pas parce qu'elle sert.
    */
    if (next === 0 && state.location === 'beyond') {
      playRevive()
      shake(REVIVE_SHAKE, REVIVE_SHAKE_MS)
      // Une **demande** et non une écriture directe : on est appelé depuis la
      // boucle d'un ennemi, monde de Rapier en marche. Voir l'en-tête de
      // `pendingPlacement`, qui raconte l'erreur que ça a coûté.
      requestPlacement(arrivalFor('beyond'), arrivalYaw('beyond'))
      set({
        hearts: state.maxHearts + state.bonusHearts,
        lastHitAt: gameNow(),
        revivedAt: gameNow(),
      })
      // Après le `set` : `endChallenge` lit le compteur de bêtes, qui n'a pas
      // changé — mais il écrit la phase, et l'ordre inverse aurait laissé le
      // panneau de résultat s'ouvrir avant que la vie ne soit refaite, donc
      // affiché sur une barre vide.
      if (get().challenge !== 'idle') get().endChallenge(true)
      return
    }

    playDamage()
    set({
      hearts: next,
      lastHitAt: gameNow(),
      phase: next === 0 ? 'gameover' : 'playing',
      // Le combat s'arrête avec le joueur. Sans ça, les barrières resteraient
      // fermées et la caméra serrée pendant tout l'écran de fin.
      bossState: next === 0 && get().bossState === 'fighting' ? 'idle' : get().bossState,
    })

    // Après les deux reprises ci-dessus, donc seules les vraies morts passent
    // ici : un second souffle et un relèvement sur l'Outremonde sont sortis
    // avant. `from` est optionnel pour les appelants qui infligent un dégât
    // sans être une bête — une chute, un piège —, et une colonne vide dans un
    // tableau de bord ne se distingue pas d'une colonne perdue en route.
    if (next === 0) track('player_died', { from: from ?? 'unknown', location: state.location })
  },

  isInvulnerable: () => gameNow() - get().lastHitAt < INVULNERABILITY_MS,

  heartCapacity: () => {
    const { maxHearts, bonusHearts } = get()
    return maxHearts + bonusHearts
  },

  swordReach: () => {
    let multiplier = 1
    for (const id of Object.values(get().equipped)) {
      multiplier *= itemById(id)?.reachMultiplier ?? 1
    }
    return ATTACK.reach * multiplier
  },

  critChance: () => {
    /*
      La probabilité qu'**au moins une** source se déclenche.

      `1 − Π(1 − p)` et non une somme. Avec une seule source les deux formules
      donnent le même nombre, donc rien ne distinguerait le bon choix du mauvais
      aujourd'hui — c'est le jour où un second objet en portera que la somme
      dépasserait un, et ce jour-là le défaut serait déjà partout.
    */
    let miss = 1
    for (const id of Object.values(get().equipped)) {
      miss *= 1 - (itemById(id)?.critChance ?? 0)
    }
    return 1 - miss
  },

  swordDamage: () => {
    // Produit sur **tout** l'équipement et non lecture du seul emplacement
    // d'arme : c'est ce que `damageTaken` fait déjà des dégâts reçus, et ce que
    // la table des objets décrit depuis le début — `attackMultiplier` est
    // déclaré par tous les objets, pas seulement par les armes, précisément
    // pour que le store n'ait pas à reconnaître ce qu'il multiplie. Tant
    // qu'aucune tenue n'y touchait, la lecture d'un seul emplacement donnait le
    // même résultat ; le manteau de l'Aube est le premier à faire mentir ce
    // raccourci.
    const worn = Object.values(get().equipped)
    let multiplier = 1
    for (const id of worn) {
      multiplier *= itemById(id)?.attackMultiplier ?? 1
    }
    /*
      Le coup critique, appliqué **ici** et pas chez les appelants.

      Trois familles d'ennemis lisent cette fonction pour savoir ce qu'elles
      encaissent. Laisser chacune multiplier de son côté aurait été trois
      occasions d'oublier — et un critique qui ne vaudrait que sur les Moblins
      serait un défaut qu'on ne verrait jamais en jouant, parce qu'on ne compare
      pas des dégâts entre deux espèces.

      Le verdict, lui, ne se tire pas ici : il a été tiré au départ du geste
      (voir `playerTransform.critical`). Cette fonction ne fait que le lire, et
      c'est ce qui garantit qu'un balayage qui prend trois bêtes soit critique
      sur les trois ou sur aucune.
    */
    if (playerTransform.critical) multiplier *= CRIT_MULTIPLIER
    // Arrondi parce que rien n'interdit un multiplicateur fractionnaire — il y
    // en a un — et que les points de vie des ennemis, eux, sont des entiers.
    return Math.round(SWORD_DAMAGE * multiplier)
  },

  damageTaken: (amount, from) => {
    const worn = Object.values(get().equipped)
    // Produit sur tout l'équipement et non lecture d'un seul emplacement : rien
    // n'interdit qu'une tenue et une arme se paient toutes les deux.
    let multiplier = 1
    for (const id of worn) {
      const item = itemById(id)
      if (!item) continue
      multiplier *= item.damageMultiplier
      /*
        Le tarif propre à l'espèce, multiplié par-dessus le général.

        Les deux se composent au lieu de s'exclure, et c'est ce qui fait tenir
        la lame maudite avec l'armure : les dégâts reçus doublent, puis ceux du
        Lynel sont divisés par deux — on se retrouve au tarif normal *contre
        lui seul*, et double contre tout le reste du monde. Rien n'a été écrit
        pour ça, c'est le produit qui le produit.
      */
      if (from) multiplier *= item.damageBy[from] ?? 1
    }
    return Math.max(1, Math.round(amount * multiplier))
  },

  healPlayer: (amount = 1) => {
    const { phase, hearts, heartCapacity } = get()
    // Le plafond est la capacité *totale*, jaunes compris : un cœur ramassé en
    // tenue complète doit pouvoir refaire une case jaune entamée, sinon les
    // deux cœurs de la tenue seraient consommables une seule fois par partie.
    const capacity = heartCapacity()
    // Le booléen de retour évite au ramassage de refaire le test de son côté :
    // c'est le store qui sait si le soin a servi, donc si le cœur est consommé.
    if (phase !== 'playing' || hearts >= capacity) return false
    playPickup()
    set({ hearts: Math.min(capacity, hearts + amount) })
    /*
      Un cœur ramassé purge la pourriture, contamination en cours comprise.

      C'est la **seule** sortie de la jauge en dehors du reflux, et c'est ce qui
      donne aux créatures du Marais leur raison d'exister : elles ne sont pas là
      pour le défi, elles sont là pour que le joueur arrive avec une réserve.

      L'enchaînement tombe juste tout seul, et c'est ce qui le rend bon : la
      contamination retire des cœurs, donc elle fait de la place, donc le cœur
      ramassé passe. Un joueur à pleine vie ne peut pas se purger — mais un
      joueur à pleine vie n'est pas contaminé depuis longtemps.
    */
    purgeRot()
    return true
  },

  /**
   * Compte un ennemi vaincu, et ouvre le portail si c'était le dernier.
   *
   * Le portail est décidé **ici** et nulle part ailleurs, et c'est le point
   * important : il y a deux façons de vider la carte — les abattre un par un,
   * ou taper le code de triche — et les deux passent par ce compteur. Poser la
   * condition dans l'onde de choc aurait donné un portail réservé aux
   * tricheurs ; la poser dans un balayage de proximité aurait donné un
   * troisième endroit où compter les morts.
   *
   * La comparaison est un `===` et non un `>=` : c'est la transition qui
   * intéresse, pas l'état. Un `>=` rejouerait la fanfare à chaque ennemi tué
   * au-delà du compte — impossible aujourd'hui, mais c'est le genre de
   * condition qu'on ne relit jamais.
   */
  registerKill: (target) => {
    const { kills: previous, annihilation, portalOpenedAt, location, challenge } = get()

    /*
      Une mort hors du continent ne compte pas pour le continent.

      Le compteur `kills` a un sens très précis — « combien des vingt-six bêtes
      de la carte de départ sont tombées » — et c'est lui qui ouvre le portail de
      Nakano. Tant que les seuls ennemis génériques du jeu vivaient là, la
      question ne se posait pas. L'Outremonde en pose soixante-douze de plus, et
      sans cet aiguillage la soixante-treizième mort aurait fait `kills ===
      enemyTotal()` sur une carte où il n'y a pas de portail à ouvrir : fanfare,
      bandeau « la carte est vide », et une quête cochée à l'autre bout du monde.

      Les morts y comptent donc pour le **défi**, et seulement pendant qu'il
      court. En dehors, tuer une bête ne compte nulle part, et c'est exact : on
      s'entraîne.
    */
    if (location !== 'continent') {
      if (challenge !== 'running') return
      /*
        Le score et le compte, ensemble et dans le même `set`.

        Les deux montent à la même victime mais ne disent pas la même chose, et
        les écrire séparément aurait fait afficher un bandeau incohérent pendant
        une frame — un Lynel doré ajoutant cent cinquante points avant d'ajouter
        sa tête.

        Le multiplicateur de difficulté est appliqué **ici** et pas au barème :
        le barème dit ce que vaut une espèce, la difficulté dit ce que vaut la
        partie. Arrondi, parce qu'un score est un entier.
      */
      const gained = target ? Math.round(pointsFor(target) * difficulty.score) : 0
      set({
        challengeKills: get().challengeKills + 1,
        challengeScore: get().challengeScore + gained,
      })
      return
    }

    const kills = previous + 1
    const cleared = kills === enemyTotal()

    if (!cleared) {
      set({ kills })
      return
    }

    // Hors du `set`, comme la mesure d'audience de `resolveTeleport` : un
    // updater d'état ne joue pas de son et n'appelle pas le tableau de bord.
    playPortal()
    // Une frappe en cours au moment du dernier mort *est* la signature du code
    // de triche : c'est le seul chemin qui l'arme.
    track('portal_opened', { via: annihilation !== null ? 'cheat' : 'combat' })
    set({ kills, portalOpenedAt: portalOpenedAt ?? gameNow() })
  },

  /**
   * Le soin est total et non d'un cœur : le réceptacle est au sommet d'une
   * montagne, on y arrive entamé, et rendre un seul cœur ferait de la
   * récompense une punition déguisée pour qui y est monté en difficulté.
   */
  claimHeartContainer: (id) => {
    const { phase, heartContainers, maxHearts, bonusHearts } = get()
    if (phase !== 'playing' || heartContainers.includes(id)) return false
    const next = maxHearts + 1
    playReward()
    set({
      heartContainers: [...heartContainers, id],
      maxHearts: next,
      // Vie refaite jusqu'à la capacité totale, cœurs jaunes de la tenue
      // compris : le soin du réceptacle est total, il n'a pas à s'arrêter à la
      // frontière des deux couleurs.
      hearts: next + bonusHearts,
    })
    return true
  },

  discoverPlace: (id) =>
    set((state) =>
      state.discovered.includes(id)
        ? state
        : { discovered: [...state.discovered, id] },
    ),

  /**
   * Ouvre le panneau d'un lieu et met la partie en pause.
   *
   * Refusé hors de `playing` : sans ce garde, une invite encore affichée à
   * l'instant du Game Over pourrait rouvrir un dialogue par-dessus l'écran de
   * fin, et `closeLandmark` remettrait alors la phase à `playing` avec zéro
   * cœur.
   */
  openLandmark: (id) => {
    if (get().phase !== 'playing') return
    track('landmark_opened', { landmark: id, via: 'walk' })
    set({ activeLandmark: id, phase: 'paused' })
  },

  /**
   * Referme le panneau d'un lieu.
   *
   * Le second garde n'est pas de la ceinture et des bretelles : depuis
   * l'inventaire et les coffres, `phase === 'paused'` ne signifie plus « un
   * panneau de lieu est ouvert ». Sans lui, la touche d'interaction relancerait
   * la partie — physique et ennemis — derrière un inventaire resté à l'écran.
   */
  closeLandmark: () => {
    const { phase, activeLandmark } = get()
    if (phase !== 'paused' || activeLandmark === null) return
    set({ activeLandmark: null, phase: 'playing' })
  },

  /** Écrit uniquement sur transition — voir l'appelant dans `Landmarks.tsx`. */
  setNearbyLandmark: (id) => set({ nearbyLandmark: id }),

  /** Même discipline que ci-dessus : écriture sur transition uniquement. */
  setNearbyChest: (id) => set({ nearbyChest: id }),

  // --- Inventaire -----------------------------------------------------------

  openInventory: () => {
    // Même garde que `openLandmark`, pour la même raison : une pastille encore
    // cliquable à l'instant du Game Over ouvrirait un panneau par-dessus
    // l'écran de fin, et sa fermeture remettrait la phase à `playing` avec zéro
    // cœur.
    if (get().phase !== 'playing') return
    set({ inventoryOpen: true, activeItem: null, phase: 'paused' })
  },

  closeInventory: () => {
    if (!get().inventoryOpen) return
    set({ inventoryOpen: false, activeItem: null, phase: 'playing' })
  },

  // --- Journal de quêtes ----------------------------------------------------

  // Même garde que `openInventory`, et pour la même raison : une pastille encore
  // cliquable à l'instant du Game Over ouvrirait un panneau par-dessus l'écran
  // de fin, et sa fermeture remettrait la phase à `playing` avec zéro cœur.
  openQuests: () => {
    if (get().phase !== 'playing') return
    set({ questsOpen: true, phase: 'paused' })
  },

  closeQuests: () => {
    if (!get().questsOpen) return
    set({ questsOpen: false, phase: 'playing' })
  },

  showItem: (id) => {
    if (!get().items.includes(id)) return
    set({ activeItem: id })
  },

  hideItem: () => set({ activeItem: null }),

  equipItem: (id) => {
    const state = get()
    const item = itemById(id)
    if (!item || !state.items.includes(id)) return
    // Une relique ne se porte pas, et le refus vit ici plutôt que dans les
    // boutons qui appellent : l'interface n'en propose aucun, mais le store est
    // la seule porte que tout le monde franchit — la carte d'objet, la grille,
    // et la fermeture de coffre qui équipe dans la foulée.
    const slot = slotOf(item)
    if (slot === null || state.equipped[slot] === id) return

    // L'objet qui occupait l'emplacement part d'abord, dans le même `set` : deux
    // écritures successives feraient passer la barre de vie par une valeur
    // intermédiaire, visible le temps d'une frame.
    const stripped = stripSlot(state, slot)
    const carried = stripped.bonusCarry[id] ?? item.bonusHearts

    playEquip()
    set({
      equipped: { ...stripped.equipped, [slot]: id },
      // Somme et non affectation : `stripSlot` n'a remis les jaunes à zéro que
      // s'il vidait l'emplacement qui les portait. Équiper une arme ne doit pas
      // faire disparaître les cœurs de la tenue.
      bonusHearts: stripped.bonusHearts + item.bonusHearts,
      // On ne rend que ce qui restait — plafonné par la capacité jaune du
      // *nouvel* objet, qui peut être plus petite que celle d'où vient le report.
      hearts: stripped.hearts + Math.min(carried, item.bonusHearts),
      bonusCarry: { ...stripped.bonusCarry, [id]: 0 },
      equipChangedAt: gameNow(),
    })
  },

  unequipItem: (id) => {
    const state = get()
    const item = itemById(id)
    if (!item) return
    const slot = slotOf(item)
    if (slot === null || state.equipped[slot] !== id) return
    playEquip()
    set({ ...stripSlot(state, slot), equipChangedAt: gameNow() })
  },

  // --- Coffres --------------------------------------------------------------

  openChest: (id) => {
    const { phase, openedChests } = get()
    if (phase !== 'playing' || openedChests.includes(id)) return false
    playChestCreak()
    set({
      // Marqué tout de suite, et pas à la fermeture de la carte : c'est cet
      // état qui tient le couvercle relevé, y compris si le composant remonte
      // pendant la séquence.
      openedChests: [...openedChests, id],
      chestReveal: id,
      // L'invite disparaît avec l'ouverture, sinon elle resterait affichée
      // sous la carte le temps que le joueur s'éloigne.
      nearbyChest: null,
      phase: 'paused',
    })
    return true
  },

  resolveChest: () => {
    const { chestReveal } = get()
    if (chestReveal === null) return
    const chest = chestById(chestReveal)
    if (!chest) return
    playTreasure()
    set({ activeItem: chest.item })
  },

  finishChest: (equip = false) => {
    const state = get()
    if (state.chestReveal === null) return
    const chest = chestById(state.chestReveal)
    const item = chest ? itemById(chest.item) : undefined

    set({
      chestReveal: null,
      activeItem: null,
      phase: 'playing',
      items: item && !state.items.includes(item.id) ? [...state.items, item.id] : state.items,
      // La réserve de cœurs jaunes de l'objet démarre pleine : le premier
      // équipement rend donc les deux cœurs, les suivants ne rendront que ce
      // qui restait au moment où la tenue a été retirée.
      bonusCarry: item ? { ...state.bonusCarry, [item.id]: item.bonusHearts } : state.bonusCarry,
    })

    // Après le `set`, jamais avant : `equipItem` relit le store et refuse un
    // objet absent de `items`. Il n'y entre qu'à la ligne du dessus.
    if (equip && item) get().equipItem(item.id)
  },

  /**
   * Refusée dans quatre cas : partie terminée, téléportation déjà en cours
   * (anti-spam-clic), voyage entre cartes en cours, ou lieu déjà affiché.
   * Sinon, gèle tout immédiatement — qu'on parte de `playing` (en pleine
   * balade) ou de `paused` (en train de lire un autre lieu : sa modale se ferme
   * aussitôt, cachée par les braises qui montent).
   *
   * **Depuis une autre carte, elle passe par le voyage et non par les braises.**
   * Les monuments appartiennent au continent : y poser le joueur sans ramener
   * sa carte le déposait dans le vide de l'Île Céleste, où il tombait dès la
   * fin de la séquence — le filet de chute le renvoyait au point d'arrivée de
   * l'île, et le menu paraissait ne plus rien faire. Le voile de `transit` est
   * le seul chemin qui sache attendre qu'une carte soit montée et dessinée ;
   * `transitLandmark` lui dit où déposer et quoi ouvrir à l'arrivée.
   */
  teleportTo: (id) => {
    const { phase, activeLandmark, teleporting, transit, location } = get()
    if (phase === 'gameover' || teleporting !== null || transit !== null) return
    if (phase === 'paused' && activeLandmark === id) return

    if (location !== 'continent') {
      // Même son que le portail : c'est le même voyage, et le distinguer
      // laisserait entendre qu'il se passe autre chose.
      playPortal()
      set({
        phase: 'paused',
        activeLandmark: null,
        transit: 'continent',
        transitFrom: location,
        transitLandmark: id,
        // L'invite disparaît avec le départ, comme dans `enterMap` : on peut
        // très bien lancer la téléportation en se tenant devant le portail de
        // l'île, et son invite resterait affichée sous le voile.
        nearbyPortal: null,
      })
      return
    }

    set({ phase: 'paused', activeLandmark: null, teleporting: id })
  },

  /**
   * Réaffirme `phase: 'paused'` en même temps que `activeLandmark`, sans
   * condition. Pendant le vol (voir `teleportTo`), la phase peut avoir été
   * remise à `playing` par un appui sur F traité comme une fermeture de
   * panneau (`closeLandmark`, voir le garde ajouté dans `Landmarks.tsx`) ;
   * sans cette réaffirmation, `activeLandmark` se retrouverait non nul avec
   * `phase === 'playing'`, brisant l'invariant documenté plus haut et ouvrant
   * la modale sur une partie qui tourne toujours (physique et ennemis actifs).
   */
  resolveTeleport: () => {
    /*
      Compté ici *en plus* de `openLandmark` : la téléportation est le second
      chemin vers un monument, et l'omettre attribuerait toute la fréquentation
      à la marche. Le champ `via` garde les deux distinguables — c'est aussi la
      seule façon de savoir si le menu de téléportation sert à quelqu'un.

      Hors de l'updater passé à `set`, qui doit rester une fonction pure : la
      mesure d'audience n'a rien à faire dans le calcul d'un état.
    */
    const { teleporting } = get()
    if (teleporting !== null) {
      track('landmark_opened', { landmark: teleporting, via: 'teleport' })
    }

    set((state) =>
      state.teleporting === null
        ? state
        : { activeLandmark: state.teleporting, phase: 'paused' },
    )
  },

  finishTeleport: () => set({ teleporting: null }),

  // --- Annihilation ---------------------------------------------------------

  /**
   * Largue l'ogive au-dessus du joueur.
   *
   * Le point d'impact est **figé ici**, à la verticale du joueur au moment où
   * le code se termine, et non suivi frame par frame : une bombe déjà en l'air
   * ne rectifie pas sa trajectoire parce que sa cible a fait trois pas. C'est
   * aussi ce qui permet au joueur de voir la chute arriver sur lui.
   *
   * La partie n'est **pas** mise en pause, et c'est une contrainte et non un
   * oubli : l'horloge de jeu s'arrête hors de la phase `playing` (voir
   * `state/gameClock.ts`), donc une pause figerait la bombe en vol et l'onde de
   * choc ne partirait jamais. Le joueur reste donc exposé pendant la séquence —
   * d'où le balayage des projectiles ci-dessous, qui efface ce qui était déjà
   * en vol. Les ennemis encore vivants, eux, meurent avant d'avoir le temps de
   * préparer un tir : les plus proches sont les premiers atteints par l'onde.
   */
  triggerAnnihilation: () => {
    const { phase, annihilation } = get()
    if (phase !== 'playing' || annihilation !== null) return false

    // Ce qui était déjà en vol disparaît avec le reste. Sans ça, une flèche
    // partie une demi-seconde avant le code touche le joueur pendant
    // l'explosion censée tout balayer — le pire moment possible pour perdre un
    // cœur, puisque rien à l'écran ne l'explique plus.
    clearProjectiles()
    playFallingBomb()

    // Devant le joueur et non sur lui : c'est une contrainte de cadrage, pas un
    // choix de mise en scène — cette caméra ne montre presque pas le ciel, et un
    // champignon dressé à la verticale du joueur serait hors champ. Le nord est
    // le haut de l'écran, la caméra étant fixe. Voir la note de `BLAST_FORWARD`.
    const { position } = playerTransform
    const map = get().location
    const x = position.x
    const z = position.z - BLAST_FORWARD_BY_MAP[map]

    /*
      L'altitude du sol, et elle dépend de la carte.

      `sampleHeight` est l'échantillonneur du **continent** : l'interroger depuis
      l'Île Céleste ou le Marais rendait l'altitude du relief continental sous
      des coordonnées qui n'y désignent rien, donc une boule de feu enterrée ou
      suspendue. Ailleurs, on prend les pieds du joueur — les deux autres cartes
      sont plates ou quasi, et c'est par construction le sol qu'il regarde.
    */
    const ground =
      map === 'continent'
        ? // Le plancher au niveau de la mer couvre les frappes tombées au
          // large : sous l'eau, la boule de feu serait un halo sourd sorti de
          // nulle part.
          Math.max(sampleHeight(x, z), WORLD.waterLevel)
        : position.y - (PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius)

    set({
      annihilation: {
        at: gameNow(),
        x,
        // Le **sol**, et pas le centre de la capsule du joueur : c'est là que la
        // boule de feu naît et que l'anneau de souffle se pose.
        y: ground,
        z,
      },
    })
    return true
  },

  finishAnnihilation: () => set({ annihilation: null }),

  // --- Voyage entre les cartes ----------------------------------------------

  /**
   * **Un anneau ne parle que de lui-même**, et c'est toute la règle.
   *
   * Elle a été forcée par les cartes à deux portes. L'Île Céleste en a deux
   * depuis qu'elle mène au Marais, le Marais depuis qu'il mène à l'Outremonde,
   * et les deux `useFrame` tournaient côte à côte en écrivant « à portée / pas à
   * portée » dans le même champ. Le lointain effaçait donc ce que le proche
   * venait d'y poser, à chaque image, et le gagnant était simplement le dernier
   * monté : sur l'île, l'anneau du sommet écrasait celui de la prairie, et le
   * retour vers le continent cessait de répondre **à la seconde où le portail du
   * sommet s'ouvrait** — c'est-à-dire à la chute du Lynel doré. Sur le Marais,
   * la chute de Malenia condamnait de la même façon le retour vers l'île. Deux
   * culs-de-sac, ouverts par une victoire.
   *
   * L'anneau s'annonce donc quand il est à portée, et ne retire que **sa
   * propre** annonce. Les deux anneaux d'une carte sont à cent trente unités
   * l'un de l'autre pour une portée de sept : il ne peut pas y en avoir deux à
   * portée à la fois, donc `to` désigne sans ambiguïté celui qui parle.
   *
   * Même discipline d'écriture que les monuments et les coffres : la sortie
   * anticipée garantit qu'on n'écrit que sur **transition**, jamais à chaque
   * frame — sans quoi le HUD se re-rendrait soixante fois par seconde pour
   * réafficher la même invite.
   */
  setNearbyPortal: (to, near) => {
    const { nearbyPortal } = get()
    if (near ? nearbyPortal === to : nearbyPortal !== to) return
    set({ nearbyPortal: near ? to : null })
  },

  /**
   * Une bête de l'épreuve tombe.
   *
   * Le cœur de la troisième passe par `claimHeartContainer` plutôt que par un
   * `set` d'ici, et ce n'est pas de la politesse : ce réceptacle-là n'a pas de
   * socle à ramasser, mais il fait exactement la même chose qu'un autre — un
   * cœur rouge de plus, la vie refaite jusqu'à la capacité, le son, et le
   * bandeau du HUD qui lit `heartContainers`. Le réécrire ici en aurait donné
   * une seconde version, à corriger deux fois.
   */
  registerTrialKill: (id) => {
    const { trialSlain } = get()
    if (trialSlain.includes(id)) return
    const slain = [...trialSlain, id]
    set({ trialSlain: slain })
    if (slain.length < TRIAL_COUNT) return
    // La mesure suit le verdict du réceptacle plutôt que le compte des bêtes :
    // il refuse la prime hors de `playing`, et une épreuve dont la récompense
    // n'a pas été versée n'est pas une épreuve terminée. Les cœurs sont relus
    // *après*, sinon on rapporterait la barre d'avant la récompense.
    if (get().claimHeartContainer('trial')) track('trial_cleared', { hearts: get().hearts })
  },

  registerGoldenKill: () => {
    if (get().goldenSlainAt !== null) return
    set({ goldenSlainAt: gameNow() })
    // Même ordre que l'épreuve : le réceptacle d'abord, la mesure ensuite et
    // seulement s'il a été versé — une bête tombée pendant l'écran de fin ne
    // clôt rien. Les cœurs sont relus après, sinon on rapporterait la barre
    // d'avant la récompense.
    if (get().claimHeartContainer('golden')) track('golden_slain', { hearts: get().hearts })
  },

  startBossFight: () => {
    // Idempotent, et ce n'est pas de la prudence : le Lynel l'appelle depuis sa
    // boucle, donc potentiellement soixante fois par seconde tant que le joueur
    // est dans l'arène. Sans cette garde, chaque frame écrirait dans le store et
    // re-rendrait tout ce qui s'y abonne.
    if (get().bossState !== 'idle') return
    set({ bossState: 'fighting', arenaFight: 'guardian' })
    track('boss_engaged', { phase: 'sword' })
  },

  startMaleniaFight: () => {
    if (get().arenaFight !== null) return
    set({ arenaFight: 'malenia' })
  },

  /**
   * Les deux sorties ne sont pas symétriques, comme pour le gardien.
   *
   * Vaincue, elle ne se relève pas : `maleniaSlainAt` est écrit une fois pour
   * toute la partie, et c'est lui qui empêche le Marais de la remonter à la
   * visite suivante. Le joueur mort, ou simplement sorti du bassin, le combat
   * redevient disponible — elle remonte avec ses soixante points de vie, et sa
   * phase repart de la lame.
   */
  endMaleniaFight: (defeated, fellAt) => {
    /*
      La garde n'est pas la même dans les deux sens, exactement comme celle du
      gardien de la rotonde — et pour la raison que l'onde d'annihilation a
      révélée là-bas : **une victoire s'enregistre même si le combat n'avait pas
      été formellement engagé.** Un boss mort est mort.
    */
    if (defeated) {
      if (get().maleniaSlainAt !== null) return
      set({ arenaFight: null, maleniaSlainAt: gameNow(), maleniaFellAt: fellAt ?? null })
      // Le réceptacle n'est pas versé ici : il se **ramasse**, comme celui de la
      // rotonde. Voir `MarshReward`.
      track('malenia_defeated', { hearts: get().hearts })
      return
    }

    if (get().arenaFight !== 'malenia') return
    set({ arenaFight: null })
  },

  endBossFight: (defeated, fellAt) => {
    /*
      Les deux sorties ne sont pas symétriques, et leurs **gardes** ne le sont
      pas non plus.

      Vaincu, le combat ne peut plus reprendre : l'état reste `defeated` pour
      toute la partie, les barrières s'ouvrent et la caméra se rouvre. Mort, le
      joueur repart du continent et le Lynel remonte avec ses 36 points de vie —
      d'où le retour à `idle`, qui autorise un second engagement.

      **Une victoire s'enregistre même si le combat n'avait pas été engagé**, et
      c'est la correction d'un défaut réel. La garde unique d'avant —
      `if (bossState !== 'fighting') return` — protégeait les deux sorties
      ensemble, ce qui était juste tant que la seule façon de tuer le gardien
      était de l'affronter. L'onde d'annihilation en a ouvert une seconde : la
      bête mourait sans avoir jamais été engagée, l'appel sortait ici sans rien
      faire, et **trois choses en dépendaient** — le coffre et le réceptacle de
      la rotonde, qui lisent `defeated` ; les trois bêtes de l'épreuve, qui ne se
      montent qu'à cette condition, donc ne pouvaient plus mourir, donc ne
      levaient jamais la herse ; et le journal de quêtes.

      Un boss mort est mort, quelle que soit la façon dont il l'est devenu. La
      garde de `fighting` ne vaut donc que pour l'abandon, où elle a un sens :
      on ne peut pas renoncer à un combat qu'on n'a pas commencé.
    */
    const { bossState } = get()

    if (defeated) {
      if (bossState === 'defeated') return
      set({ bossState: 'defeated', bossFellAt: fellAt ?? null, arenaFight: null })
      track('boss_defeated', { hearts: get().hearts })
      return
    }

    if (bossState !== 'fighting') return
    set({ bossState: 'idle', bossFellAt: null, arenaFight: null })
  },

  /**
   * Part vers l'autre carte.
   *
   * Le téléchargement du fragment commence **ici**, au lever du voile, et non au
   * palier opaque : sur une connexion lente les 780 ms de montée ne suffiraient
   * pas, et le joueur attendrait devant un écran violet sans rien qui bouge. En
   * le lançant tout de suite, le transfert court pendant que le voile monte, et
   * dans le cas normal il est terminé avant même que l'écran soit couvert.
   */
  enterMap: (to) => {
    const { phase, transit, location } = get()
    if (phase !== 'playing' || transit !== null || location === to) return false

    /*
      Franchir un anneau pendant un défi l'abandonne, sans panneau ni score.

      Le cas est réel : l'anneau du retour est posé sur le dallage du Sanctuaire,
      à cinq pas du maître, donc à portée immédiate de quelqu'un qui vient
      d'accepter. Sans cette ligne, le défi restait « en cours » sur une carte
      qu'on a quittée — chronomètre gelé avec l'horloge de jeu, et compteur qui
      se serait remis à monter en tuant Malenia dans son bassin, puisque
      `registerKill` aiguille toutes les morts hors continent vers lui.

      **Abandonné et non terminé** : pas de son, pas de rang, pas de record. On
      ne relève pas un défi de deux minutes en sortant du monde au bout de dix
      secondes, et lui donner un panneau de résultat aurait fait de la fuite une
      façon de jouer.
    */
    if (get().challenge !== 'idle') {
      set({ challenge: 'idle', challengeKills: 0, challengeScore: 0 })
    }

    // Le téléchargement commence **ici**, au lever du voile, et pas au palier
    // opaque : voir l'en-tête de cette méthode. La table dit quel fragment, et
    // le continent y répond « aucun » sans que l'appelant ait à le savoir.
    void preloadMap(to)
    playPortal()
    set({
      phase: 'paused',
      transit: to,
      // L'origine, pour que l'arrivée sache par quelle porte on ressort. Voir
      // `transitFrom`.
      transitFrom: location,
      // Un franchissement de portail ne porte aucun lieu : écrit explicitement
      // plutôt que supposé nul, pour qu'aucun voyage ne puisse hériter de la
      // destination d'un autre.
      transitLandmark: null,
      // L'invite disparaît avec le départ, sinon elle resterait affichée sous
      // le voile le temps que le joueur s'éloigne du portail à l'arrivée.
      nearbyPortal: null,
    })
    return true
  },

  /**
   * Bascule de carte, appelée quand le voile est opaque **et** que le fragment
   * est arrivé — jamais sur un simple délai.
   *
   * Ne touche pas à `phase` : la partie reste en pause jusqu'au retrait complet
   * du voile. Sans ça la physique reprendrait derrière un écran encore opaque,
   * et le joueur pourrait tomber de l'île avant d'avoir vu où il a atterri.
   */
  arriveOnMap: () => {
    const { transit } = get()
    if (transit === null) return
    // Hors du `set`, comme la mesure d'audience de `resolveTeleport` : un
    // updater d'état n'appelle pas le tableau de bord.
    if (transit === 'sky') track('sky_island_entered', { via: 'portal' })
    /*
      Quitter l'île termine le combat, et il faut le dire ici plutôt que dans le
      Lynel.

      Lui le fait déjà quand le joueur s'éloigne de l'arène — mais sa boucle est
      gardée par `phase === 'playing'`, et le menu de téléportation met la partie
      en pause **dans le même `set`** qui lance le voyage. La garde ne repassait
      donc jamais, l'île se démontait avec le boss, et `bossState` restait à
      `fighting` pour le reste de la partie : le continent se jouait alors avec
      la caméra serrée de l'arène. Un clic dans le menu suffisait.
    */
    if (transit !== 'sky') get().endBossFight(false)

    // Marqué à l'arrivée et jamais effacé : c'est ce qui accomplit la quête du
    // portail, et elle ne se rouvre pas parce qu'on est rentré.
    /*
      La pourriture ne quitte pas le Marais.

      Elle est remise à zéro à **chaque** bascule de carte, y compris à
      l'arrivée : la jauge est une propriété du lieu, pas du personnage. La
      laisser courir aurait fait mourir sur le continent un joueur contaminé qui
      vient de franchir le portail pour s'échapper — c'est-à-dire punir la seule
      réaction sensée qu'il pouvait avoir.
    */
    resetRot()

    if (transit === 'sky') set({ skyVisited: true })

    /*
      La première arrivée sur l'Outremonde, et elle seule.

      `?? gameNow()` plutôt qu'une écriture sèche : le champ date la
      **découverte**, pas le dernier passage. Un joueur qui repart par l'anneau
      et revient chercher un meilleur score ne doit pas se refaire jouer la
      fanfare d'arrivée — elle dure cinq secondes, elle recouvre le maître, et la
      seconde fois elle ne dit plus rien à personne.
    */
    if (transit === 'beyond') {
      set({ beyondArrivedAt: get().beyondArrivedAt ?? gameNow() })
      track('beyond_entered', { hearts: get().hearts })
    }

    /*
      La difficulté est une propriété de **l'Outremonde**, pas du personnage.

      Elle est posée à l'arrivée et remise à neutre partout ailleurs, exactement
      comme la trêve du Sanctuaire est levée au démontage. Sans cette remise à
      zéro, un joueur qui repart du Sanctuaire en difficile emporterait ses
      dégâts majorés sur le continent — et un jeu devenu un peu plus dur ne
      ressemble pas à un bug, donc personne ne le signalerait jamais.
    */
    if (transit === 'beyond') applyDifficulty(get().challengeDifficulty)
    else resetDifficulty()

    /*
      L'île rend trois cœurs, une seule fois.

      Elle est un aller sans retour tant que le Lynel est debout : on y arrive
      avec ce qu'il restait de la traversée du continent, et un joueur arrivé à
      deux cœurs n'a aucune chance contre un boss qui en retire deux par coup.
      Trois de plus, c'est deux erreurs de parade encaissables au lieu d'une.

      Un acquis définitif comme un réceptacle, et non des cœurs jaunes : ceux-là
      appartiennent à l'équipement, et changer de tenue sur l'île les effacerait
      (voir `stripSlot`). Et la vie est refaite au passage, capacité comprise —
      arriver entamé devant le gardien serait puni sans que rien ne l'ait
      annoncé.
    */
    if (transit === 'sky' && !get().skyBoonTaken) {
      const { maxHearts, bonusHearts } = get()
      const next = maxHearts + SKY_BOON_HEARTS
      playReward()
      set({ skyBoonTaken: true, maxHearts: next, hearts: next + bonusHearts })
    }

    set({ location: transit })
  },

  finishTransit: () => {
    // Hors du `set`, comme la mesure d'audience de `resolveTeleport` : un
    // updater d'état n'appelle pas le tableau de bord. Même `via` que là-bas —
    // c'est le même geste du joueur, seul le chemin technique diffère.
    const { transitLandmark } = get()
    if (transitLandmark !== null) {
      track('landmark_opened', { landmark: transitLandmark, via: 'teleport' })
    }

    set((state) =>
      state.transitLandmark === null
        ? { transit: null, transitFrom: null, phase: 'playing' }
        : {
            transit: null,
            transitFrom: null,
            transitLandmark: null,
            // La partie reste en pause : ce voyage ne se termine pas sur une
            // balade mais sur la page qu'on était venu lire.
            activeLandmark: state.transitLandmark,
            phase: 'paused',
          },
    )
  },

  abortTransit: () =>
    set({ transit: null, transitFrom: null, transitLandmark: null, phase: 'playing' }),

  // --- Le défi du maître ----------------------------------------------------

  setNearbySensei: (near) => set({ nearbySensei: near }),

  /**
   * Ouvre la proposition.
   *
   * La partie passe en pause, comme devant un panneau de monument : on y choisit
   * une difficulté et une durée, et faire ce choix pendant qu'un Lynel arrive
   * serait une mauvaise plaisanterie — sauf qu'ici aucun ne peut arriver, la
   * trêve les tient. La pause est donc là pour le **confort de lecture**, et
   * parce que tous les panneaux du jeu se comportent ainsi.
   *
   * Refusée pendant un défi : lui parler alors **termine** la course en cours
   * (voir `triggerInteraction`), ce qui est la seule façon d'arrêter un mode
   * illimité — et la seule façon d'abandonner une course de dix minutes sans
   * mourir ni quitter la carte.
   */
  openSenseiOffer: () => {
    const { phase, challenge } = get()
    if (phase !== 'playing' || challenge !== 'idle') return
    set({ senseiOffer: true, phase: 'paused' })
  },

  /**
   * La difficulté prend effet **tout de suite**, défi ou non.
   *
   * C'est ce qui permet de s'entraîner en facile sans lancer de chronomètre, et
   * ça ne peut pas casser une course en cours : le panneau qui l'appelle est
   * fermé pendant un défi. Les points de vie déjà posés ne bougent pas — une
   * bête calibre les siens à son apparition — donc le réglage se voit au défi
   * suivant, qui remonte tout le peuplement.
   */
  setChallengeDifficulty: (id) => {
    if (get().challengeDifficulty === id) return
    applyDifficulty(id)
    set({ challengeDifficulty: id })
  },

  setChallengeDuration: (id) => {
    if (get().challengeDuration === id) return
    set({ challengeDuration: id })
  },

  closeSenseiOffer: () => set({ senseiOffer: false, phase: 'playing' }),

  /**
   * On accepte.
   *
   * La partie **reprend** au lieu de rester en pause, et le décompte court
   * pendant ce temps : le joueur peut s'élancer avant le « GO ! ». C'est le
   * seul avantage que cette carte offre à qui la connaît, et il vaut mieux
   * qu'un chronomètre qui démarre sur un joueur immobile.
   *
   * Les compteurs sont remis à zéro ici et pas à la fin du défi précédent : un
   * score reste affiché tant qu'on ne relance pas, et le remettre à zéro en
   * fermant le panneau aurait effacé sous les yeux du joueur le nombre qu'il
   * venait de faire.
   *
   * **Et la vie est refaite, ici et non ailleurs.** Deux chemins la rendaient
   * déjà — la mort sur l'Outremonde et le bouton « retour au Sanctuaire » du
   * panneau de résultat — mais aucun des deux n'est obligatoire : un joueur qui
   * ferme le résultat sur place pour finir le Lynel qu'il avait engagé, ou qui
   * arrive du continent après une traversée coûteuse, repartait sur ce qu'il
   * lui restait. Le soin dépendait donc du bouton par lequel on était passé, ce
   * qui n'est pas une règle qu'un joueur peut deviner.
   *
   * Le moment juste est celui-ci : un défi est une course chronométrée qu'on
   * relance « autant de fois qu'on veut », et deux courses ne se comparent que
   * si elles partent du même endroit — même peuplement (voir `populationId`),
   * même difficulté, et même barre de vie. Capacité **totale**, cœurs jaunes de
   * la tenue compris, comme partout ailleurs.
   *
   * Pas d'i-frames en revanche, à la différence des deux autres chemins : ceux-
   * là reposent le joueur ailleurs, au milieu de ce qui traîne. Ici il n'a pas
   * bougé, il est devant le maître, et la trêve du Sanctuaire tient.
   */
  acceptChallenge: () => {
    const { challenge, challengeDifficulty, challengeDuration, populationId } = get()
    if (challenge !== 'idle') return
    playPortal()
    track('challenge_started', {
      difficulty: challengeDifficulty,
      duration: challengeDuration,
    })
    // La difficulté peut avoir été choisie avant d'arriver sur la carte : on la
    // réaffirme au départ plutôt que de supposer qu'elle est déjà posée.
    applyDifficulty(challengeDifficulty)
    set({
      senseiOffer: false,
      phase: 'playing',
      challenge: 'countdown',
      challengeStartedAt: gameNow(),
      challengeKills: 0,
      challengeScore: 0,
      challengeResult: null,
      hearts: get().heartCapacity(),
      /*
        **Le monde entier se relève.**

        C'est la correction qui manquait à la première version : les six gros
        adversaires — cinq Lynels et la Déchue — restaient morts pour la session,
        donc le deuxième défi se courait sur un monde amputé de ses meilleures
        cibles, et le troisième sur des restes. On ne pouvait pas « recommencer
        autant de fois qu'on veut », on pouvait recommencer une fois.

        Incrémenter cet identifiant remonte les soixante-treize corps par une
        `key` React, ce qui les repose à leur poste avec les points de vie de la
        difficulté choisie. L'idiome est celui de `runId`, restreint à une carte.

        Ça se paie d'un à-coup de quelques dizaines de millisecondes — soixante-
        treize corps physiques recréés d'un coup — et il tombe pendant le
        décompte, c'est-à-dire au seul moment de la course où le joueur n'a
        encore rien à perdre.
      */
      populationId: populationId + 1,
      challengeFailed: false,
    })
    /*
      Le formulaire du classement oublie la course précédente.

      Il est le seul état du défi qui ne vive pas dans ce store — il survit à une
      partie, comme le pseudo qu'il retient — donc `initialState` ne peut pas le
      remettre à zéro. Sans cet appel, le panneau de résultat du deuxième défi
      rouvrirait sur « enregistré, 4ᵉ sur 37 », qui est la place du premier.
    */
    useScoresStore.getState().forgetSave()
  },

  beginChallenge: () => {
    if (get().challenge !== 'countdown') return
    set({ challenge: 'running' })
  },

  endChallenge: (failed) => {
    const state = get()
    const { challenge, challengeKills, challengeScore } = state
    // Idempotent — voir la déclaration. Le temps qui tombe à zéro et un coup
    // fatal peuvent se produire sur la même frame.
    if (challenge === 'idle' || challenge === 'over') return

    /*
      La durée **réellement courue**, et non celle qui était prévue.

      Elle sert au rang, qui se mesure en points par minute : un mode illimité
      arrêté au bout de trois minutes doit être jugé sur trois minutes, et une
      course de dix interrompue par une mort à la sixième aussi. Le décompte de
      départ est retiré — on ne marque rien pendant, il ne doit pas diluer le
      rythme.
    */
    const ran = Math.max(0, gameNow() - state.challengeStartedAt - COUNTDOWN_MS)
    const key = categoryKey(state.challengeDuration, state.challengeDifficulty)
    const previous = state.challengeBests[key]

    /*
      La maîtrise de la catégorie, qui commande la forme du maître.

      Elle suit **le rang de la course**, pas le record : une course qui tient
      le rythme du Guerrier coche la case même si elle ne bat pas le meilleur
      score de la catégorie, parce que ce qu'on demande est d'avoir su le faire,
      pas de le refaire mieux à chaque fois.

      Les défis ratés comptent, exactement comme pour les records : on garde ce
      qu'on a marqué avant de tomber. Un rythme de Guerrier tenu pendant quatre-
      vingt-dix secondes reste un rythme de Guerrier, et exiger de survivre
      aurait fait du palier une épreuve de prudence plutôt que de tranchant.

      L'écriture disque ne passe que quand la liste change : la relancer à
      chaque défi rejouerait une sérialisation pour rien, et surtout écraserait
      la sauvegarde à chaque course perdue.
    */
    const mastered = isMasteringRun(challengeScore, ran)
      ? withMastered(state.senseiMastered, key)
      : state.senseiMastered
    // Comparaison par **longueur** et non par référence : `withMastered` rend
    // toujours un tableau neuf, donc l'identité serait fausse à chaque course
    // et le disque réécrit pour rien. La fonction ne fait qu'ajouter, la
    // longueur est donc un test exact.
    if (mastered.length !== state.senseiMastered.length) writeMastery(mastered)

    // L'équipement est figé **ici**, une fois pour la course. Voir la
    // déclaration de `challengeResultOutfit` : relu plus tard, il aurait dit ce
    // que le joueur porte, pas ce avec quoi il a marqué.
    const outfit = outfitOf(state.equipped)
    const weapon = weaponOf(state.equipped, outfit)

    playReward()
    track('challenge_ended', {
      score: challengeScore,
      kills: challengeKills,
      failed,
      difficulty: state.challengeDifficulty,
      duration: state.challengeDuration,
    })
    set({
      challenge: 'over',
      challengeResult: challengeScore,
      challengeResultKills: challengeKills,
      challengeResultMs: ran,
      challengeFailed: failed,
      challengeResultOutfit: outfit,
      challengeResultWeapon: weapon,
      /*
        Le record de **cette catégorie**, et il ne retient que les défis menés à
        terme, morts comprises : on garde ce qu'on a marqué avant de tomber. Un
        score n'est pas annulé parce qu'il s'est mal fini, il est seulement plus
        bas.

        Le compte de victimes suit le score et n'est pas maximisé de son côté :
        un record est un instantané d'une course, pas un assemblage des
        meilleures moitiés de plusieurs.
      */
      challengeBests:
        challengeScore > (previous?.score ?? -1)
          ? {
              ...state.challengeBests,
              [key]: { score: challengeScore, kills: challengeKills },
            }
          : state.challengeBests,
      senseiMastered: mastered,
      // Le panneau met la partie en pause, comme tous les panneaux du jeu.
      phase: 'paused',
    })
  },

  /**
   * Referme le panneau et rend la main **sur place**.
   *
   * C'est la sortie par défaut, et elle manquait : la première version n'offrait
   * qu'un bouton, libellé « Revenir au Sanctuaire », qui ne ramenait nulle part
   * et se contentait de fermer. Le joueur restait au milieu de la carte devant
   * un bouton qui avait promis autre chose — le défaut ressemblait à un bouton
   * mort, alors que c'était un libellé qui mentait.
   *
   * Les deux sorties existent donc maintenant pour de bon : celle-ci laisse le
   * joueur là où le chronomètre l'a surpris, avec les bêtes autour de lui, parce
   * qu'une carte d'entraînement ne doit pas interrompre un combat en cours pour
   * annoncer un score.
   */
  dismissChallengeResult: () => {
    if (get().challenge !== 'over') return
    set({ challenge: 'idle', challengeKills: 0, challengeScore: 0, phase: 'playing' })
  },

  /**
   * Referme le panneau **et** repose le joueur au Sanctuaire.
   *
   * L'autre sortie, celle que le libellé promettait. Elle passe par une demande
   * de placement et non par une écriture directe dans le corps physique : la
   * partie est en pause quand le panneau est ouvert, donc le monde de Rapier est
   * arrêté et l'écriture serait sûre — mais la demande est appliquée par
   * `Player.tsx` au même endroit que la résurrection, et avoir deux chemins pour
   * « reposer le joueur au Sanctuaire » est exactement ce qui finit par en
   * laisser un derrière.
   *
   * **Et elle soigne**, jusqu'à la capacité totale, cœurs jaunes compris —
   * exactement ce que fait la mort sur l'Outremonde, qui repose au même endroit.
   * C'était l'asymétrie absurde : tomber pendant le défi rendait toute la vie,
   * survivre au chronomètre à un demi-cœur et rentrer de son plein gré ne
   * rendait rien. Le défi suivant se lançait alors sur une barre vide, et la
   * seule manière de repartir entier était de se faire tuer. Le Sanctuaire
   * repose qui s'y présente, mort ou vif.
   *
   * `lastHitAt` suit pour la même raison que la résurrection : on arrive à
   * quarante unités de ce qui frappait, la garde ne servira probablement jamais,
   * mais une vie refaite qu'une bête posée là entamerait avant le premier pas ne
   * serait pas un repos.
   */
  returnToSanctuary: () => {
    const state = get()
    if (state.challenge !== 'over') return
    requestPlacement(arrivalFor('beyond'), arrivalYaw('beyond'))
    set({
      challenge: 'idle',
      challengeKills: 0,
      challengeScore: 0,
      phase: 'playing',
      hearts: state.maxHearts + state.bonusHearts,
      lastHitAt: gameNow(),
    })
  },

  /**
   * On se relève, et on ne recommence pas.
   *
   * C'est la réponse au reproche le plus net qu'on puisse faire à ce jeu : mourir
   * effaçait la partie. Trente minutes de continent, le gardien, l'épreuve, le
   * doré, le Marais — et une charge mal lue au fond d'un bassin rendait le tout à
   * l'écran d'accueil. Aucun joueur ne va au bout d'un boss dans ces conditions ;
   * il ferme l'onglet, ce qui est la même chose que perdre, sans le clic.
   *
   * Ce que la mort coûte désormais : **le chemin**. On rouvre les yeux au point
   * d'apparition de la carte où l'on est tombé — l'entrée du Marais, l'arrivée de
   * l'île, le centre du continent —, donc à la distance qu'on vient de parcourir,
   * et le boss est de nouveau entier (voir `worldId`). C'est le tarif des jeux
   * dont celui-ci s'inspire, et il suffit : refaire la traversée est une punition
   * qu'on accepte, refaire la partie n'en est pas une.
   *
   * Ce qu'elle ne coûte pas : l'inventaire, les réceptacles, les coffres ouverts,
   * les lieux découverts, les quêtes, le compteur d'ennemis. Rien de tout cela
   * n'est remis en jeu, et la barre de vie est refaite jusqu'à la capacité
   * **totale**, cœurs jaunes de la tenue compris — on se relève entier ou on ne
   * se relève pas.
   *
   * Trois détails qui ne se voient que quand ils manquent :
   *
   *  - **`spawnFor` et non `arrivalFor`.** Les deux tables existent précisément
   *    pour ne pas se confondre : l'une dit où une *porte* dépose, l'autre où
   *    l'on *réapparaît* sur cette carte. Se relever est la seconde question —
   *    sur le continent, la première aurait reposé le joueur au portail de
   *    Nakano, à cent trente unités du début de la partie ;
   *  - **la pourriture est soldée.** Elle survivrait autrement à la mort qu'elle
   *    vient de causer, et la contamination en cours reprendrait sur une barre
   *    neuve, à l'autre bout de la carte, sans que rien la justifie ;
   *  - **`arenaFight` est relâché ici.** La caméra d'arène et les barrières
   *    tiennent à ce champ, et c'est le boss qui le rend d'ordinaire en voyant le
   *    joueur s'éloigner. Mais il est remonté au même instant : le nouveau n'a
   *    jamais engagé le combat, il ne le clôturera donc jamais, et la partie se
   *    serait poursuivie avec le cadrage serré du bassin.
   *
   * Le second souffle de la tenue, lui, ne repart pas : il vaut une fois par
   * partie, et la partie continue. Sans quoi la mort le rendrait, c'est-à-dire
   * que mourir deviendrait une façon de recharger un objet.
   */
  respawn: () => {
    const state = get()
    if (state.phase !== 'gameover') return

    resetRot()
    // Une **demande** et non une écriture directe, comme le relèvement au
    // Sanctuaire : le monde de Rapier est gelé pendant l'écran de fin, mais les
    // deux chemins qui reposent le joueur doivent rester le même chemin. Voir
    // l'en-tête de `pendingPlacement`.
    requestPlacement(spawnFor(state.location), arrivalYaw(state.location))
    playRevive()
    shake(REVIVE_SHAKE, REVIVE_SHAKE_MS)
    set({
      phase: 'playing',
      hearts: state.maxHearts + state.bonusHearts,
      // Les i-frames du relèvement, pour la raison d'ailleurs : on réapparaît
      // seul au point d'apparition, rien ne peut frapper, mais une vie refaite
      // qu'un projectile resté en vol entamerait ne serait pas un relèvement.
      lastHitAt: gameNow(),
      arenaFight: null,
      // `damagePlayer` l'a déjà rendu en tuant, mais la mort n'est pas le seul
      // chemin vers l'écran de fin qu'on puisse ouvrir un jour, et un boss
      // « en combat » sans boss est ce qui ferme les barrières pour toujours.
      bossState: state.bossState === 'fighting' ? 'idle' : state.bossState,
      worldId: state.worldId + 1,
    })
  },

  // Les collections sont réécrites explicitement : `initialState` est un objet
  // unique partagé par toutes les parties, et en réutiliser les tableaux (ou
  // les objets `equipped` et `bonusCarry`) ferait qu'une mutation en place
  // fuiterait d'une partie à l'autre.
  reset: () => {
    // Sans cette remise à zéro, une seconde partie démarrerait avec une horloge
    // à plusieurs minutes : les sentinelles `-Infinity` encaissent, mais un cœur
    // lâché juste avant le Game Over expirerait instantanément.
    resetClock()
    // Les compteurs de combat vivent dans `playerTransform` (hors React) et
    // survivent au remontage du joueur : sans ça, `attackStartedAt` reste dans
    // le futur de l'horloge fraîchement remise à zéro et l'attaque se bloque.
    resetCombat()
    // Troisième de la même famille, et celui-là se voyait : la jauge de
    // pourriture vit hors de React, donc une partie relancée depuis le Marais
    // rouvrait sur le continent avec le bandeau écarlate encore rempli sous les
    // cœurs. Il n'y avait plus rien pour le vider — le reflux ne tourne que sur
    // le Marais — et la barre restait là pour toute la partie suivante.
    resetRot()
    // Même famille, même raison : la difficulté de l'Outremonde vit hors de
    // React et ne serait pas remise à neutre par le retour à `initialState`.
    // Une nouvelle partie commencée en difficile encaisserait les dégâts majorés
    // dès le premier Moblin du continent.
    resetDifficulty()
    /*
      Les deux pools hors React, et c'est une nouvelle partie qui les vide — pas
      un relèvement.

      La distinction est celle que fait déjà `resume` dans le HUD : après une
      mort, les cœurs au sol **restent**, parce qu'ils sont tombés d'ennemis
      vaincus et que le monde n'est pas remis à zéro. Ici il l'est — les objets,
      les coffres, les monuments découverts, tout repart — et un cœur tombé dans
      la partie précédente serait ramassable dans celle-ci, à un endroit que rien
      n'explique plus.

      Le pool ne se vide pas de lui-même : la remise à zéro de l'horloge, juste
      au-dessus, rend l'âge de ces cœurs **négatif**, donc le test d'expiration
      ne les atteint jamais. Ils resteraient là toute la partie suivante.
    */
    clearPickups()
    clearProjectiles()
    set((state) => ({
      ...initialState,
      discovered: [],
      heartContainers: [],
      items: [],
      equipped: {},
      openedChests: [],
      trialSlain: [],
      goldenSlainAt: null,
      maleniaSlainAt: null,
      maleniaFellAt: null,
      arenaFight: null,
      bonusCarry: {},
      // Les champs de l'Outremonde sont tous des primitives, donc `initialState`
      // les remet seul — sauf à se souvenir que le record, lui, est un acquis de
      // *partie* et non de session. Une nouvelle partie repart sans record, comme
      // elle repart sans cœurs et sans objets.
      /*
        La maîtrise est l'exception, et la seule du store : elle est **portée
        d'une visite à l'autre** puisqu'elle commande la forme du maître.

        La remettre à `initialState` la ramènerait à l'instantané pris au
        chargement du module, donc ferait régresser le maître dès qu'on
        recommence une partie — jusqu'au prochain rechargement de page, où le
        stockage la rétablirait. Un personnage qui perd ses paliers en lançant
        une nouvelle partie puis les retrouve en rafraîchissant est exactement
        le genre d'incohérence qu'on ne remarque qu'une fois livrée.
      */
      senseiMastered: state.senseiMastered,
      runId: state.runId + 1,
    }))
  },
}))

// Exposé en développement pour piloter et inspecter une partie depuis la
// console ou un test navigateur.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__store = useGameStore
}
