import { create } from 'zustand'
import { track } from '../analytics'
import {
  playChestCreak,
  playDamage,
  playEquip,
  playPickup,
  playReward,
  playTreasure,
} from '../audio/sfx'
import { chestById } from '../config/chests'
import { itemById, type Equipment, type ItemSlot } from '../config/items'
import { now as gameNow, resetClock } from '../state/gameClock'
import { resetCombat } from '../state/playerTransform'
import type { ChestId, GamePhase, ItemId, LandmarkId } from '../types/game'

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
  heartContainers: LandmarkId[]
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
  claimHeartContainer: (id: LandmarkId) => boolean
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
   * l'overlay. Sans effet si une téléportation est déjà en cours, si la
   * partie est terminée, ou si `id` est déjà le lieu affiché.
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
  kills: 0,
  discovered: [] as LandmarkId[],
  heartContainers: [] as LandmarkId[],
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
    const { phase, hearts, isInvulnerable, damageTaken } = get()
    if (phase !== 'playing' || isInvulnerable()) return

    // L'appelant dit ce qu'il inflige, l'équipement dit ce que ça coûte. Les
    // ennemis n'ont donc pas à connaître la table des objets.
    const next = Math.max(0, hearts - damageTaken(amount))
    playDamage()
    set({
      hearts: next,
      lastHitAt: gameNow(),
      phase: next === 0 ? 'gameover' : 'playing',
    })
  },

  isInvulnerable: () => gameNow() - get().lastHitAt < INVULNERABILITY_MS,

  heartCapacity: () => {
    const { maxHearts, bonusHearts } = get()
    return maxHearts + bonusHearts
  },

  swordDamage: () => {
    const held = get().equipped.weapon
    const weapon = held ? itemById(held) : undefined
    // Arrondi parce que rien n'interdira un multiplicateur fractionnaire un
    // jour, et que les points de vie des ennemis, eux, sont des entiers.
    return Math.round(SWORD_DAMAGE * (weapon?.attackMultiplier ?? 1))
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

  registerKill: () => set((state) => ({ kills: state.kills + 1 })),

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
   * Refusée dans trois cas : partie terminée, téléportation déjà en cours
   * (anti-spam-clic), ou lieu déjà affiché. Sinon, gèle tout immédiatement —
   * qu'on parte de `playing` (en pleine balade) ou de `paused` (en train de
   * lire un autre lieu : sa modale se ferme aussitôt, cachée par les
   * braises qui montent).
   */
  teleportTo: (id) => {
    const { phase, activeLandmark, teleporting } = get()
    if (phase === 'gameover' || teleporting !== null) return
    if (phase === 'paused' && activeLandmark === id) return
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
