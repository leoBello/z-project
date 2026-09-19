import type { EnemyKind, EnemySpawn } from '../types/game'
import { PLAYER } from './gameplay'
import { WORLD, classifyBiome, sampleHeight, sampleSlope, seededRandom } from './world'

/**
 * Caractéristiques d'une famille d'ennemis.
 *
 * Tout le comportement est piloté par ces valeurs : ajouter un type d'ennemi,
 * c'est ajouter une entrée ici, un modèle 3D, et rien d'autre — la machine à
 * états d'`Enemy.tsx` est commune.
 */
export interface EnemyStats {
  kind: EnemyKind
  label: string
  /** Coups d'épée nécessaires pour l'abattre. */
  hp: number
  /** Vitesse de poursuite, en unités/seconde. */
  speed: number
  /** Vitesse de patrouille, plus lente que la poursuite. */
  patrolSpeed: number
  /** Distance à laquelle il repère le joueur. */
  detectRadius: number
  /** Distance à laquelle il peut frapper ou tirer. */
  attackRange: number
  /** Délai entre deux attaques, en millisecondes. */
  attackCooldownMs: number
  /**
   * Temps de préparation visible avant que l'attaque parte, en millisecondes.
   *
   * C'est le réglage qui décide si un coup se subit ou s'esquive. Sans lui,
   * l'attaque partait à la frame même où l'ennemi entrait en portée : le joueur
   * n'avait aucun signal à lire, seulement un cœur en moins. Sortir de portée
   * pendant la préparation l'annule.
   */
  telegraphMs: number
  /** Cœurs retirés au joueur. */
  damage: number
  /** Rayon du collider et demi-hauteur de la capsule. */
  radius: number
  halfHeight: number
  /** Couleur du point sur la minimap. */
  minimapColor: string
  /** Vrai si l'ennemi attaque à distance (projectile) plutôt qu'au contact. */
  ranged: boolean
  /** Dispersion du tir, en radians. Ignorée pour un ennemi de corps-à-corps. */
  spread?: number
  /**
   * L'attaque de corps-à-corps se pare-t-elle ?
   *
   * Un drapeau par espèce et non une règle générale, parce que la parade n'a de
   * sens que sur un coup *annoncé*. Le projectile de l'Octorok se renvoie déjà
   * au coup d'épée — c'est un autre geste, qui existe depuis le début et n'a
   * pas à changer.
   */
  parryable: boolean
}

export const ENEMIES: Record<EnemyKind, EnemyStats> = {
  octorok: {
    kind: 'octorok',
    label: 'Octorok',
    hp: 2,
    speed: 1.6,
    patrolSpeed: 1.2,
    // Détection et portée de tir étaient à 24 et 22 : l'Octorok tirait à la
    // frame où il repérait le joueur, depuis une distance où il n'était
    // lui-même qu'un point à l'écran. L'écart entre les deux valeurs donne
    // maintenant neuf unités pendant lesquelles on le voit sans être visé.
    detectRadius: 21,
    attackRange: 15,
    attackCooldownMs: 2400,
    telegraphMs: 560,
    damage: 1,
    radius: 0.45,
    halfHeight: 0.3,
    minimapColor: '#e0574f',
    ranged: true,
    // ±5° : à quinze unités, l'écart latéral atteint 1,3 unité pour un rayon
    // de collision de 0,62 — le tir devient évitable au loin sans cesser de
    // faire mouche à bout portant.
    spread: 0.088,
    parryable: false,
  },
  moblin: {
    kind: 'moblin',
    label: 'Moblin',
    hp: 3,
    speed: 4.4,
    patrolSpeed: 1.6,
    detectRadius: 17,
    attackRange: 2,
    // Le cooldown dépasse volontairement les i-frames du joueur (1 100 ms) :
    // en dessous, un Moblin collé au joueur touchait à chaque fin
    // d'invulnérabilité et le combat se réduisait à une course de dégâts.
    attackCooldownMs: 1500,
    telegraphMs: 420,
    damage: 1,
    radius: 0.45,
    halfHeight: 0.55,
    minimapColor: '#c8892f',
    ranged: false,
    // Son télégraphe dure 420 ms, exactement `PARRY.cueLeadMs` : l'offre
    // couvre donc toute la préparation, et le signal s'allume à la frame même
    // où le Moblin se ramasse. Ce n'est pas une coïncidence qu'on subit, c'est
    // la raison pour laquelle `cueLeadMs` vaut 420 — la parade s'apprend sur
    // lui avant d'arriver sur l'île.
    parryable: true,
  },
}

/**
 * Gel du monde sur le coup fatal, en millisecondes de temps **réel**.
 *
 * En dessous de ~60 ms le gel ne se lit pas ; au-delà de ~110 ms il ne se lit
 * plus comme un effet mais comme un à-coup de framerate.
 */
export const HIT_STOP_MS = 80
/**
 * Fin de la pose d'anticipation, en temps de **jeu**.
 *
 * Volontairement court, et ce n'est pas un oubli : le gel tient déjà cette pose
 * 80 ms de temps réel, pendant lesquelles l'horloge de jeu ne bouge pas. Les
 * deux durées s'additionnent à l'écran. Réglée « proprement » à 90 ms, la pose
 * en paraîtrait 170 et la mort deviendrait molle.
 */
export const DEATH_SQUASH_MS = 40
/** Pic de la détente : le corps disparaît, la fumée naît. */
export const DEATH_POP_MS = 130
/** Démontage du composant, quelques frames après le pic. */
export const DEATH_REMOVE_MS = 150
/** Amplitude de la secousse caméra, en unités monde. */
export const DEATH_SHAKE_AMPLITUDE = 0.08
/** Durée de la secousse, en millisecondes de temps réel. */
export const DEATH_SHAKE_MS = 120
/**
 * Recul imprimé à un ennemi touché.
 * Volontairement modéré : mesuré à 5,5, l'ennemi sortait de portée d'épée et
 * il fallait le poursuivre entre chaque coup.
 */
export const HIT_KNOCKBACK = 4
/** Durée du flash blanc quand un ennemi encaisse un coup. */
export const HIT_FLASH_MS = 160

/**
 * Probabilité qu'un ennemi vaincu laisse un cœur.
 *
 * Levier d'équilibrage principal : c'est lui qui décide si la carte se
 * traverse d'une traite ou si chaque combat coûte durablement. Le tirage est
 * fait au moment de la mort, avec `Math.random` et non la graine du monde —
 * une graine fixe rendrait les lâchers identiques à chaque partie, et le joueur
 * apprendrait quels ennemis « donnent » un cœur.
 */
export const HEART_DROP_CHANCE = 0.4

/** Nombre d'ennemis posés sur la carte. */
const ENEMY_COUNT = 26
/** Rayon sanctuarisé autour du point d'apparition du joueur. */
const SPAWN_SAFE_RADIUS = 26
/** Au-delà de cette pente, l'ennemi glisserait : on ne le pose pas là. */
const MAX_SPAWN_SLOPE = 0.5

/**
 * Place les ennemis sur la carte.
 *
 * Même approche que la végétation : tirage uniforme, puis filtrage. Le biome
 * décide de l'espèce — les Octoroks tiennent le littoral et les zones ouvertes,
 * les Moblins la jungle et les terres arides.
 */
function generateEnemySpawns(): EnemySpawn[] {
  const random = seededRandom(0xb0c0)
  const spawns: EnemySpawn[] = []
  const margin = WORLD.half - 12

  let attempts = 0
  while (spawns.length < ENEMY_COUNT && attempts < 4000) {
    attempts++
    const x = (random() * 2 - 1) * margin
    const z = (random() * 2 - 1) * margin

    const height = sampleHeight(x, z)
    if (height < WORLD.waterLevel + 0.3) continue
    if (height > WORLD.mountainLevel) continue
    if (sampleSlope(x, z) > MAX_SPAWN_SLOPE) continue
    if (Math.hypot(x - PLAYER.spawn[0], z - PLAYER.spawn[2]) < SPAWN_SAFE_RADIUS) continue

    // Deux ennemis collés se gênent et se poussent : on garde une distance.
    if (spawns.some((s) => Math.hypot(s.position[0] - x, s.position[2] - z) < 14)) continue

    const biome = classifyBiome(x, z, height)
    let kind: EnemyKind
    if (biome === 'beach' || biome === 'island') kind = 'octorok'
    else if (biome === 'jungle' || biome === 'badlands') kind = random() < 0.7 ? 'moblin' : 'octorok'
    else kind = random() < 0.5 ? 'moblin' : 'octorok'

    spawns.push({
      id: `${kind}-${spawns.length}`,
      kind,
      position: [x, height, z],
      radius: 6 + random() * 5,
    })
  }

  return spawns
}

/**
 * Le peuplement de la carte, tiré **une seule fois** pour toute la session.
 *
 * Il l'était déjà de fait — `<Enemies>` mémoïsait le tirage — mais il n'était
 * lisible que de là. Or le store a besoin de savoir *combien* d'ennemis existent
 * pour décider quand la carte est vide, et refaire le tirage de son côté aurait
 * été une seconde source de vérité : même graine, donc même résultat aujourd'hui,
 * et deux tables qui divergent silencieusement le jour où le filtrage change.
 *
 * Mémoïsé au module et non recalculé à chaque partie : la graine est fixe, le
 * résultat aussi, et `<Enemies>` remonte à chaque `runId`.
 */
let spawns: EnemySpawn[] | null = null

/** Les ennemis posés sur la carte. Tableau partagé, à ne pas modifier. */
export function enemySpawns(): EnemySpawn[] {
  if (spawns === null) spawns = generateEnemySpawns()
  return spawns
}

/**
 * Nombre d'ennemis d'une partie complète.
 *
 * Dérivé du tirage et non lu dans `ENEMY_COUNT` : le générateur abandonne au
 * bout de 4 000 essais, donc il peut en poser moins que demandé. C'est ce
 * nombre-là, le vrai, qui dit quand la carte est vide — et un écart d'une unité
 * entre les deux laisserait le portail à jamais fermé.
 */
export function enemyTotal(): number {
  return enemySpawns().length
}
