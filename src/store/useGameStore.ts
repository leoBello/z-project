import { create } from 'zustand'
import { track } from '../analytics'
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
import { preloadSkyIsland } from '../components/skyisland/preload'
import { BLAST_FORWARD } from '../config/annihilation'
import { chestById } from '../config/chests'
import { enemyTotal } from '../config/enemies'
import { itemById, type Equipment, type ItemSlot } from '../config/items'
import { WORLD, sampleHeight } from '../config/world'
import { now as gameNow, resetClock } from '../state/gameClock'
import { playerTransform, resetCombat } from '../state/playerTransform'
import { shake } from '../state/cameraShake'
import { clearProjectiles } from '../state/projectiles'
import type {
  Annihilation,
  ChestId,
  GamePhase,
  ItemId,
  HeartSourceId,
  LandmarkId,
  MapId,
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
   */
  discovered: LandmarkId[]
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
   * objets.
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
   * Un portail est à portée. Même rôle que `nearbyChest`, et même discipline :
   * écrit uniquement sur transition, jamais à chaque frame.
   *
   * Un booléen et non un identifiant : il n'y a jamais qu'un portail par carte,
   * et celle-ci est déjà connue.
   */
  nearbyPortal: boolean
  /**
   * Identifiant de la partie. Sert de `key` React sur le joueur et les ennemis :
   * l'incrémenter démonte et remonte tout le monde, ce qui remet positions,
   * points de vie et machines à états à zéro sans logique de réinitialisation
   * à écrire dans chaque composant.
   */
  runId: number

  /** Inflige des dégâts au joueur ; ignoré pendant l'invincibilité. */
  damagePlayer: (amount?: number) => void
  /** Vrai tant que le joueur est en i-frames (clignotement + immunité). */
  isInvulnerable: () => boolean
  /** Rend des cœurs au joueur. Ignoré si la barre est déjà pleine. */
  healPlayer: (amount?: number) => boolean
  registerKill: () => void
  /**
   * Ramasse le réceptacle d'un monument : un cœur maximal de plus, et la vie
   * refaite au passage. Retourne faux s'il était déjà pris, pour que
   * l'appelant sache s'il doit faire disparaître l'objet.
   */
  claimHeartContainer: (id: HeartSourceId) => boolean
  /** Marque un lieu comme trouvé. Sans effet s'il l'était déjà. */
  discoverLandmark: (id: LandmarkId) => void
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
  damageTaken: (amount: number) => number
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

  /** Signale qu'un portail est à portée, ou qu'il ne l'est plus. */
  setNearbyPortal: (near: boolean) => void
  /** Le joueur entre dans l'arène : le combat commence. Idempotent. */
  startBossFight: () => void
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
  /** Relance une partie depuis zéro. */
  reset: () => void
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
  discovered: [] as LandmarkId[],
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
  bossFellAt: null as [number, number, number] | null,
  bossState: 'idle' as 'idle' | 'fighting' | 'defeated',
  transit: null as MapId | null,
  transitLandmark: null as LandmarkId | null,
  nearbyPortal: false,
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

  damagePlayer: (amount = 1) => {
    const state = get()
    const { phase, hearts, isInvulnerable, damageTaken } = state
    if (phase !== 'playing' || isInvulnerable()) return

    // L'appelant dit ce qu'il inflige, l'équipement dit ce que ça coûte. Les
    // ennemis n'ont donc pas à connaître la table des objets.
    const next = Math.max(0, hearts - damageTaken(amount))

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

    playDamage()
    set({
      hearts: next,
      lastHitAt: gameNow(),
      phase: next === 0 ? 'gameover' : 'playing',
      // Le combat s'arrête avec le joueur. Sans ça, les barrières resteraient
      // fermées et la caméra serrée pendant tout l'écran de fin.
      bossState: next === 0 && get().bossState === 'fighting' ? 'idle' : get().bossState,
    })
  },

  isInvulnerable: () => gameNow() - get().lastHitAt < INVULNERABILITY_MS,

  heartCapacity: () => {
    const { maxHearts, bonusHearts } = get()
    return maxHearts + bonusHearts
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
    // Arrondi parce que rien n'interdit un multiplicateur fractionnaire — il y
    // en a un — et que les points de vie des ennemis, eux, sont des entiers.
    return Math.round(SWORD_DAMAGE * multiplier)
  },

  damageTaken: (amount) => {
    const worn = Object.values(get().equipped)
    // Produit sur tout l'équipement et non lecture d'un seul emplacement : rien
    // n'interdit qu'une tenue et une arme se paient toutes les deux.
    let multiplier = 1
    for (const id of worn) {
      multiplier *= itemById(id)?.damageMultiplier ?? 1
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
  registerKill: () => {
    const { kills: previous, annihilation, portalOpenedAt } = get()
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

  discoverLandmark: (id) =>
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

  showItem: (id) => {
    if (!get().items.includes(id)) return
    set({ activeItem: id })
  },

  hideItem: () => set({ activeItem: null }),

  equipItem: (id) => {
    const state = get()
    const item = itemById(id)
    if (!item || !state.items.includes(id) || state.equipped[item.kind] === id) return

    // L'objet qui occupait l'emplacement part d'abord, dans le même `set` : deux
    // écritures successives feraient passer la barre de vie par une valeur
    // intermédiaire, visible le temps d'une frame.
    const stripped = stripSlot(state, item.kind)
    const carried = stripped.bonusCarry[id] ?? item.bonusHearts

    playEquip()
    set({
      equipped: { ...stripped.equipped, [item.kind]: id },
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
    if (!item || state.equipped[item.kind] !== id) return
    playEquip()
    set({ ...stripSlot(state, item.kind), equipChangedAt: gameNow() })
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
        transitLandmark: id,
        // L'invite disparaît avec le départ, comme dans `enterMap` : on peut
        // très bien lancer la téléportation en se tenant devant le portail de
        // l'île, et son invite resterait affichée sous le voile.
        nearbyPortal: false,
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
    const x = position.x
    const z = position.z - BLAST_FORWARD

    set({
      annihilation: {
        at: gameNow(),
        x,
        // Le **sol**, et pas le centre de la capsule du joueur : c'est là que la
        // boule de feu naît et que l'anneau de souffle se pose. Le plancher au
        // niveau de la mer couvre les frappes tombées au large — sous l'eau, la
        // boule de feu serait un halo sourd sorti de nulle part.
        y: Math.max(sampleHeight(x, z), WORLD.waterLevel),
        z,
      },
    })
    return true
  },

  finishAnnihilation: () => set({ annihilation: null }),

  // --- Voyage entre les cartes ----------------------------------------------

  /** Même discipline que les monuments et les coffres : écriture sur transition. */
  setNearbyPortal: (near) => set({ nearbyPortal: near }),

  startBossFight: () => {
    // Idempotent, et ce n'est pas de la prudence : le Lynel l'appelle depuis sa
    // boucle, donc potentiellement soixante fois par seconde tant que le joueur
    // est dans l'arène. Sans cette garde, chaque frame écrirait dans le store et
    // re-rendrait tout ce qui s'y abonne.
    if (get().bossState !== 'idle') return
    set({ bossState: 'fighting' })
    track('boss_engaged', { phase: 'sword' })
  },

  endBossFight: (defeated, fellAt) => {
    /*
      Les deux sorties ne sont pas symétriques.

      Vaincu, le combat ne peut plus reprendre : l'état reste `defeated` pour
      toute la partie, les barrières s'ouvrent et la caméra se rouvre. Mort, le
      joueur repart du continent et le Lynel remonte avec ses 36 points de vie —
      d'où le retour à `idle`, qui autorise un second engagement.
    */
    if (get().bossState !== 'fighting') return
    set({
      bossState: defeated ? 'defeated' : 'idle',
      bossFellAt: defeated ? (fellAt ?? null) : null,
    })
    if (defeated) track('boss_defeated', { hearts: get().hearts })
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

    if (to === 'sky') void preloadSkyIsland()
    playPortal()
    set({
      phase: 'paused',
      transit: to,
      // Un franchissement de portail ne porte aucun lieu : écrit explicitement
      // plutôt que supposé nul, pour qu'aucun voyage ne puisse hériter de la
      // destination d'un autre.
      transitLandmark: null,
      // L'invite disparaît avec le départ, sinon elle resterait affichée sous
      // le voile le temps que le joueur s'éloigne du portail à l'arrivée.
      nearbyPortal: false,
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
        ? { transit: null, phase: 'playing' }
        : {
            transit: null,
            transitLandmark: null,
            // La partie reste en pause : ce voyage ne se termine pas sur une
            // balade mais sur la page qu'on était venu lire.
            activeLandmark: state.transitLandmark,
            phase: 'paused',
          },
    )
  },

  abortTransit: () => set({ transit: null, transitLandmark: null, phase: 'playing' }),

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
    set((state) => ({
      ...initialState,
      discovered: [],
      heartContainers: [],
      items: [],
      equipped: {},
      openedChests: [],
      bonusCarry: {},
      runId: state.runId + 1,
    }))
  },
}))

// Exposé en développement pour piloter et inspecter une partie depuis la
// console ou un test navigateur.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__store = useGameStore
}
