import { create } from 'zustand'
import { playDamage, playPickup, playReward } from '../audio/sfx'
import { now as gameNow, resetClock } from '../state/gameClock'
import { resetCombat } from '../state/playerTransform'
import type { GamePhase, LandmarkId } from '../types/game'

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

export interface GameState {
  phase: GamePhase
  hearts: number
  maxHearts: number
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
  lastHitAt: -Infinity,
  kills: 0,
  discovered: [] as LandmarkId[],
  heartContainers: [] as LandmarkId[],
  activeLandmark: null as LandmarkId | null,
  nearbyLandmark: null as LandmarkId | null,
  teleporting: null as LandmarkId | null,
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,
  runId: 0,

  damagePlayer: (amount = 1) => {
    const { phase, hearts, isInvulnerable } = get()
    if (phase !== 'playing' || isInvulnerable()) return

    const next = Math.max(0, hearts - amount)
    playDamage()
    set({
      hearts: next,
      lastHitAt: gameNow(),
      phase: next === 0 ? 'gameover' : 'playing',
    })
  },

  isInvulnerable: () => gameNow() - get().lastHitAt < INVULNERABILITY_MS,

  healPlayer: (amount = 1) => {
    const { phase, hearts, maxHearts } = get()
    // Le booléen de retour évite au ramassage de refaire le test de son côté :
    // c'est le store qui sait si le soin a servi, donc si le cœur est consommé.
    if (phase !== 'playing' || hearts >= maxHearts) return false
    playPickup()
    set({ hearts: Math.min(maxHearts, hearts + amount) })
    return true
  },

  registerKill: () => set((state) => ({ kills: state.kills + 1 })),

  /**
   * Le soin est total et non d'un cœur : le réceptacle est au sommet d'une
   * montagne, on y arrive entamé, et rendre un seul cœur ferait de la
   * récompense une punition déguisée pour qui y est monté en difficulté.
   */
  claimHeartContainer: (id) => {
    const { phase, heartContainers, maxHearts } = get()
    if (phase !== 'playing' || heartContainers.includes(id)) return false
    const next = maxHearts + 1
    playReward()
    set({
      heartContainers: [...heartContainers, id],
      maxHearts: next,
      hearts: next,
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
    set({ activeLandmark: id, phase: 'paused' })
  },

  closeLandmark: () => {
    if (get().phase !== 'paused') return
    set({ activeLandmark: null, phase: 'playing' })
  },

  /** Écrit uniquement sur transition — voir l'appelant dans `Landmarks.tsx`. */
  setNearbyLandmark: (id) => set({ nearbyLandmark: id }),

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
  resolveTeleport: () =>
    set((state) =>
      state.teleporting === null
        ? state
        : { activeLandmark: state.teleporting, phase: 'paused' },
    ),

  finishTeleport: () => set({ teleporting: null }),

  // `discovered` et `heartContainers` sont réécrits explicitement :
  // `initialState` est un objet unique partagé par toutes les parties, et en
  // réutiliser leurs tableaux ferait qu'une mutation en place fuiterait d'une
  // partie à l'autre.
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
      runId: state.runId + 1,
    }))
  },
}))

// Exposé en développement pour piloter et inspecter une partie depuis la
// console ou un test navigateur.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__store = useGameStore
}
