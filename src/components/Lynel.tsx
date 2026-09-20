import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CapsuleCollider,
  CoefficientCombineRule,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier'
import { Color, MathUtils, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { track } from '../analytics'
import { playDefeat, playHit, playImpact, playParrySuccess } from '../audio/sfx'
import {
  DEATH_POP_MS,
  DEATH_REMOVE_MS,
  DEATH_SHAKE_AMPLITUDE,
  DEATH_SHAKE_MS,
  DEATH_SQUASH_MS,
  ENEMIES,
  HIT_FLASH_MS,
  HIT_KNOCKBACK,
} from '../config/enemies'
import { ATTACK } from '../config/gameplay'
import {
  ARENA_CENTER,
  ARENA_LEASH,
  ARENA_R,
  GOLDEN_DAMAGE_BONUS,
  GOLDEN_PHASES,
  LYNEL_ATTACKS,
  PHASE_THRESHOLDS,
  PUNISH_MULTIPLIER,
  RECENTER_RADIUS,
  attacksFor,
  phaseOf,
  type LynelAttack,
  type LynelLeash,
  type LynelPhases,
} from '../config/lynel'
import { PARRY } from '../config/parry'
import { shake } from '../state/cameraShake'
import { spawnDeathPuff, spawnDeathRing } from '../state/deathPuffs'
import { enemyRegistry, updateEnemyMarker } from '../state/enemyRegistry'
import { hitStop, isHitStopped, now as gameNow } from '../state/gameClock'
import { cancelParry, consumeParry, offerParry } from '../state/parry'
import { playerTransform } from '../state/playerTransform'
import { PROJECTILE_HIT_RADIUS, fireProjectile, projectiles } from '../state/projectiles'
import { useGameStore } from '../store/useGameStore'
import type { LynelAttackId, LynelPhase } from '../types/game'
import { LynelModel } from './enemies/LynelModel'
import { GOLDEN_LYNEL_PALETTE, LYNEL_COLORS } from './enemies/lynelMaterials'
import type { LynelPose, LynelRig } from './enemies/LynelModel'
import { useEnemyMaterials } from './enemies/models'

/**
 * Le Lynel argenté — le gardien de la rotonde.
 *
 * Il ne passe pas par `Enemy.tsx`, et ce n'est pas un doublon : cette machine-là
 * décrit une *espèce* par une attaque unique, et ne sait ni enchaîner des
 * séquences, ni changer de phase, ni annuler un télégraphe parce que le joueur a
 * reculé de deux pas. Y ajouter une troisième branche aurait transformé une
 * boucle lisible en table de cas particuliers pour un seul ennemi du jeu.
 *
 * Tout ce qui est **partagé**, en revanche, est repris tel quel et volontairement
 * à l'identique : l'inscription au registre, la hitbox d'épée du joueur évaluée
 * une fois par swing, le renvoi de projectile, le gel du coup fatal et la
 * séquence de mort. Un boss qui mourrait autrement que les autres serait un boss
 * dont la mort se lit moins bien, pas un boss plus important.
 */

/**
 * Le nom du gardien au registre des ennemis.
 *
 * Il en faut un par bête : la même chaîne sert au registre de la minimap, au
 * calque de combat et à l'offre de parade — qui doit pouvoir être retirée en la
 * nommant (`cancelParry`), sans quoi tuer une bête pendant son télégraphe laisse
 * l'anneau allumé pour l'éternité. Les trois Lynels de l'épreuve portent celui
 * de leur poste (voir `TRIAL_POSTS`).
 */
const GUARDIAN_ID = 'lynel'

/**
 * Distance à laquelle il cesse d'avancer sur le joueur.
 *
 * Un peu en deçà de la portée du balayage (3,6) : collé au joueur, il le
 * pousserait hors de son propre cône à chaque frame, et le coup partirait
 * systématiquement dans le vide.
 */
const ENGAGE_RANGE = 3

/**
 * Durée pendant laquelle la pose de fin de coup se tient, en millisecondes.
 *
 * Sans elle, le balayage reviendrait au repos à la frame suivant l'impact :
 * l'attaque n'aurait aucune fin visible, seulement un début.
 */
const FOLLOW_THROUGH_MS = 420
/**
 * Souffle imposé entre la résolution d'une attaque et l'ouverture de la
 * suivante, quelle qu'elle soit.
 *
 * Sans lui, les temps de recharge sont **par attaque** : le balayage résolu, le
 * coup d'estoc est aussitôt éligible, son télégraphe s'ouvre à la frame
 * suivante et son impact tombe 400 ms plus tard — à l'intérieur des 1 100 ms
 * d'invulnérabilité du joueur (`INVULNERABILITY_MS`). Le second coup de chaque
 * paire ne pouvait donc **jamais** blesser, ce qui enseigne exactement le
 * contraire de ce combat : que rater une parade ne coûte rien.
 *
 * 750, et le nombre se déduit : il faut que deux impacts soient séparés de plus
 * de 1 100 ms, et le plus court des télégraphes en apporte 400. 700 suffirait
 * tout juste ; 750 laisse la marge, et donne au geste de suite (420 ms) le temps
 * de se voir avant la garde suivante.
 */
const RECOVERY_MS = 750
/** Vitesse de la charge, en unités/seconde. Trois fois sa vitesse de poursuite. */
const CHARGE_SPEED = 11
/**
 * Étourdissement quand la charge finit contre l'enceinte.
 *
 * Volontairement plus long que l'ouverture d'une parade (1 300 ms) : c'est la
 * plus grosse récompense du combat, et elle doit se sentir comme telle. C'est
 * aussi la seule qu'on obtienne sans avoir rien à parer, donc la porte d'entrée
 * de qui n'a pas encore compris la parade.
 */
const CHARGE_STUN_MS = 1400
/** Durée de vie d'une flaque de feu, en millisecondes. */
const PUDDLE_MS = 3000
/** Rayon d'une flaque. */
const PUDDLE_R = 1.6
/** Cœurs retirés par seconde passée dans une flaque. */
const PUDDLE_DPS = 1
/** Nombre de flaques que le souffle dépose, et taille du pool. */
const PUDDLES = 6
/**
 * Probabilité qu'un balayage de phase III soit une feinte.
 *
 * Une fois sur quatre, et pas plus. La feinte existe parce que la parade, une
 * fois apprise, devient gratuite : le joueur ne regarde plus la bête, il attend
 * le flash. La réponse n'est pas de raccourcir la fenêtre — ça ne punirait que
 * les écrans lents — mais de mentir parfois. Au-delà d'une fois sur quatre, le
 * signal cesse d'être une information et devient du bruit : le joueur arrête de
 * le regarder, et on a détruit la mécanique qu'on voulait approfondir.
 */
const FEINT_CHANCE = 0.25
/** Retard du vrai coup sur le signal, quand c'est une feinte. */
const FEINT_DELAY_MS = 320

/** Écart entre deux flèches du triple tir, en radians. ±7°. */
const VOLLEY_SPREAD = 0.122
/**
 * Dégâts d'une flèche renvoyée au tireur.
 *
 * Le double d'un projectile d'Octorok, parce qu'elle revient de bien plus loin
 * et qu'il faut que le geste vaille le risque de rester planté à l'attendre.
 */
const RETURNED_ARROW_DAMAGE = 2

// Vecteurs de travail partagés : alloués une fois, pas soixante fois par seconde.
/**
 * État interne du Lynel, exposé en développement pour la mise au point.
 *
 * Objet muté en place et non recréé : il est écrit à chaque frame, et allouer
 * ici ferait travailler le ramasse-miettes pour un crochet de console.
 */
const lynelDebug = {
  /** Laquelle des bêtes a écrit en dernier : l'épreuve en aligne trois. */
  id: '',
  hp: 0,
  phase: 'sword' as LynelPhase,
  pose: 'repos' as string,
  pending: null as string | null,
  distance: 0,
  staggerIn: 0,
  nextAttackIn: 0,
  poseUntilIn: 0,
  charging: false,
  chargeEndsIn: 0,
  frozen: false,
  now: 0,
}
if (import.meta.env.DEV) {
  // `__lynel` porte déjà la table des attaques : celui-ci est l'état vivant.
  ;(window as unknown as Record<string, unknown>).__lynelState = lynelDebug
}

/**
 * La couleur de l'onde et des flaques : le violet du cristal, pas un orange de
 * feu. Tout ce que le Lynel produit de dangereux porte déjà cette teinte — les
 * yeux, la crinière en phase III, le signal de parade — et c'est la seule que
 * le décor ne porte nulle part.
 */
const SHOCK_COLOR = new Color(LYNEL_COLORS.glow)

const toPlayer = new Vector3()
/** Vitesse horizontale de la frame, écrite puis corrigée par `clampToLeash`. */
const velocity = { x: 0, z: 0 }
const muzzle = new Vector3()
const aim = new Vector3()
const knockback = new Vector3()
const WHITE = new Color(1, 1, 1)

interface LynelRuntime {
  hp: number
  phase: LynelPhase
  /** Attaque en préparation, ou `null`. Drapeau consommé, jamais un intervalle. */
  pending: LynelAttack | null
  pendingStartedAt: number
  /** Instant d'impact de l'attaque en préparation. Sert aussi d'offre de parade. */
  pendingImpactAt: number
  /** Dernier lancement, par attaque : chacune a son propre temps de recharge. */
  lastUsedAt: Record<LynelAttackId, number>
  /** Fin de l'étourdissement — parade réussie, ou charge dans un pilier. */
  staggerUntil: number
  lastHitSwing: number
  hitFlashUntil: number
  deathAt: number
  popped: boolean
  yaw: number
  pose: LynelPose
  /**
   * Jusqu'à quand tenir `pose` avant de revenir au repos.
   *
   * Absent du reste du jeu parce qu'aucun autre ennemi n'a de pose de fin de
   * coup : le Moblin se ramasse et se détend sur une seule courbe.
   */
  poseUntil: number
  /** Avant cet instant, aucun nouveau télégraphe ne s'ouvre. Voir `RECOVERY_MS`. */
  nextAttackAt: number
  /** Direction figée de la charge en cours, ou `null` s'il ne charge pas. */
  chargeDir: { x: number; z: number } | null
  /** Garde-fou : une charge qui n'a rien heurté s'arrête quand même. */
  chargeUntil: number
  /** Le joueur a-t-il déjà été fauché par la charge en cours ? */
  chargeHit: boolean
  /**
   * Les flaques de feu, en pool fixe.
   *
   * Elles rétrécissent l'arène sans y poser un seul obstacle, et c'est toute
   * leur raison d'être : un obstacle de décor gênerait aussi l'esquive, donc
   * punirait le joueur en dehors du moment où il s'est trompé. Une flaque ne
   * gêne que là où le Lynel a soufflé, et seulement trois secondes.
   */
  puddles: { x: number; z: number; until: number }[]
  /** Dernier prélèvement de dégâts de flaque : elles brûlent au temps passé. */
  lastBurnAt: number
}

/**
 * Quelle attaque lancer, maintenant.
 *
 * Tirage pondéré parmi celles qui sont déchargées et à portée, et **non** une
 * rotation fixe : un boss qui enchaîne toujours dans le même ordre s'apprend
 * par cœur en trois tentatives, et le combat devient une récitation. Le tirage
 * se fait avec `Math.random` et non la graine du monde — une graine fixe
 * rendrait les enchaînements identiques d'une partie à l'autre, soit exactement
 * ce qu'on veut éviter.
 */
function pickAttack(
  state: LynelRuntime,
  now: number,
  distance: number,
): LynelAttack | null {
  /*
    Tirage par réservoir, sans tableau intermédiaire.

    Un `.filter()` ici allouerait un tableau par image — la fonction est appelée
    à chaque frame tant qu'aucune attaque n'est en cours, y compris quand aucune
    n'est à portée et que le résultat est vide. C'est exactement le déchet que
    `BY_PHASE` a été mémoïsé pour supprimer un cran plus haut.

    Le réservoir donne la même équiprobabilité : le n-ième candidat retenu
    remplace le choix courant avec une chance sur n.
  */
  let chosen: LynelAttack | null = null
  let seen = 0
  for (const attack of attacksFor(state.phase)) {
    const eligible =
      now - state.lastUsedAt[attack.id] > attack.cooldownMs &&
      /*
        Sa portée exacte, et pas une unité de rab.

        Le filtre tolérait `reach >= distance - 1`, ce qui n'a de sens que si la
        bête se rapproche pendant qu'elle prépare son coup. Elle ne le fait pas :
        un télégraphe engagé cloue les sabots, précisément pour que l'esquive
        existe. La tolérance ne produisait donc pas des coups serrés, elle
        produisait des coups manqués — les deux premiers de chaque engagement
        partaient d'un mètre trop loin, brûlaient leur recharge et ne touchaient
        rien. Mesuré : premier estoc à 5,4 pour une portée de 4,4.

        Le même filtre vaut pour toutes les phases. Il valait auparavant pour la
        seule mêlée, si bien que le piétinement (portée 6,6) devenait éligible
        jusqu'à 14 tout en s'annulant au-delà de 8,6 : il aurait ouvert puis
        annulé un télégraphe à chaque frame, sans jamais consommer sa recharge.
      */
      attack.reach >= distance
    if (!eligible) continue
    seen++
    if (Math.random() < 1 / seen) chosen = attack
  }
  return chosen
}

/**
 * Le coup touche-t-il le joueur ?
 *
 * Testé **à l'instant de l'impact** et non pendant toute l'animation : c'est ce
 * qui rend l'esquive possible, puisque sortir du cône pendant le télégraphe
 * suffit. Un cône testé en continu toucherait le joueur qui traverse.
 */
function attackHits(
  attack: LynelAttack,
  position: { x: number; y: number; z: number },
  yaw: number,
) {
  const dx = playerTransform.position.x - position.x
  const dz = playerTransform.position.z - position.z
  const distance = Math.hypot(dx, dz)
  if (distance > attack.reach) return false
  if (attack.arc >= Math.PI) return true
  // Écart angulaire entre le cap du Lynel et la direction du joueur, ramené
  // dans [-π, π] — sinon un joueur à 179° et un à -179° seraient à 358° l'un de
  // l'autre et le cône se replierait sur lui-même.
  let delta = Math.atan2(dx, dz) - yaw
  delta = ((delta + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return Math.abs(delta) <= attack.arc
}

/*
  Crochets de développement.

  Même raison que `__parry` et `__lastDeath` : les trois fonctions ci-dessus
  décident tout le combat et aucune n'est observable à l'œil — un cône de 170°
  et un tirage sous contrainte de recharge ne se jugent pas sur une capture. Ce
  sont des fonctions pures, donc elles se contrôlent sans qu'aucun Lynel
  n'existe, et même depuis le continent.

  Elles ne sont **pas** `export` : les sortir du module ferait de ce fichier un
  module mixte, ce que la règle `only-export-components` signale à juste titre
  — le rafraîchissement à chaud cesserait de fonctionner sur le boss. Le crochet
  suffit à les atteindre, y compris depuis la console.
*/
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__lynel = {
    phaseOf,
    attackHits,
    pickAttack,
    attacksFor,
    attacks: LYNEL_ATTACKS,
  }
}

/**
 * La bête est-elle au bord de sa laisse, ou au-delà ?
 *
 * Sert à terminer une charge : elle ne s'arrête pas sur un raycast contre les
 * piliers — un lancer de rayon par frame pour une attaque qui sort toutes les
 * cinq secondes serait cher — mais sur la géométrie de sa laisse, qui *est*
 * l'enceinte dans le cas du gardien, et la couronne du jardin dans celui des
 * bêtes de l'épreuve.
 */
function beyondLeash(rings: readonly LynelLeash[], x: number, z: number, margin: number) {
  for (const ring of rings) {
    const distance = Math.hypot(x - ring.x, z - ring.z)
    if (distance > ring.max - margin) return true
    if (ring.min > 0 && distance < ring.min + margin) return true
  }
  return false
}

/**
 * Retire de la vitesse ce qui ferait sortir de la laisse.
 *
 * On annule la composante **radiale** fautive plutôt que la vitesse entière :
 * annuler tout le vecteur collerait la bête au bord dès qu'elle l'effleure,
 * alors qu'elle doit pouvoir continuer à longer le pourtour pour contourner le
 * joueur. Écrit dans `velocity`, qui est un objet de travail partagé — appelé à
 * chaque frame, il ne doit rien allouer.
 */
function clampToLeash(rings: readonly LynelLeash[], x: number, z: number) {
  for (const ring of rings) {
    const dx = x - ring.x
    const dz = z - ring.z
    const distance = Math.hypot(dx, dz) || 1
    const outX = dx / distance
    const outZ = dz / distance
    if (distance > ring.max - 1) {
      const outward = velocity.x * outX + velocity.z * outZ
      if (outward > 0) {
        velocity.x -= outward * outX
        velocity.z -= outward * outZ
      }
    }
    if (ring.min > 0 && distance < ring.min + 1) {
      const inward = -(velocity.x * outX + velocity.z * outZ)
      if (inward > 0) {
        velocity.x += inward * outX
        velocity.z += inward * outZ
      }
    }
  }
}

export interface LynelProps {
  /** Son nom au registre des ennemis, à la minimap et à l'offre de parade. */
  id?: string
  /** Poste de garde : son point d'apparition, et celui où elle revient. */
  home?: readonly [number, number, number]
  /** Les anneaux dont elle ne sort pas. */
  leash?: readonly LynelLeash[]
  /** Points de vie. Ceux de la table commune — le gardien — par défaut. */
  hp?: number
  /**
   * Gardien de la rotonde, bête de l'épreuve, ou Lynel doré.
   *
   * C'est d'abord ce qui décide de **ce que sa mort déclenche** : le gardien
   * ouvre les barrières, la caméra et les deux récompenses de la rotonde ; une
   * bête de l'épreuve avance un compteur de quête ; le doré clôt la dernière et
   * ouvre le portail du sommet. Et le gardien seul engage le combat d'arène —
   * une autre bête qui appellerait `startBossFight` en refermerait les
   * barrières sur un boss déjà mort.
   *
   * Le doré y ajoute trois réglages — sa robe, ses seuils de phase et le cœur
   * qu'il ajoute à chaque coup — et ils sont **déduits du rôle** plutôt que
   * passés en props. Trois props de plus au point de montage auraient permis de
   * monter un doré argenté qui frappe comme un gardien, c'est-à-dire un état
   * que rien ne décrit.
   */
  role?: 'guardian' | 'trial' | 'golden'
}

export function Lynel({
  id = GUARDIAN_ID,
  home = ARENA_CENTER,
  leash = ARENA_LEASH,
  hp = ENEMIES.lynel.hp,
  role = 'guardian',
}: LynelProps = {}) {
  const stats = ENEMIES.lynel
  const golden = role === 'golden'
  const materials = useEnemyMaterials('lynel', golden ? GOLDEN_LYNEL_PALETTE : undefined)
  /** Ses seuils de phase, et le cœur qu'il ajoute à chaque coup. Voir `role`. */
  const phases: LynelPhases = golden ? GOLDEN_PHASES : PHASE_THRESHOLDS
  const damageBonus = golden ? GOLDEN_DAMAGE_BONUS : 0

  // Mémoïsé, et pas seulement par économie : `damage` est appelé depuis la
  // boucle de frame, et lui passer un objet neuf à chaque image ferait travailler
  // le ramasse-miettes pour quatre valeurs qui ne bougent jamais.
  const beast = useMemo<Beast>(
    () => ({ id, groundY: home[1], role, phases }),
    [home, id, phases, role],
  )

  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<Group>(null)
  const rig = useRef<LynelRig>(null)
  const [removed, setRemoved] = useState(false)

  /** Les six disques de flaque, montrés et déplacés depuis la boucle. */
  const puddleMeshes = useRef<(Mesh | null)[]>([])

  const runtime = useRef<LynelRuntime>({
    hp,
    phase: phaseOf(hp, phases),
    pending: null,
    pendingStartedAt: 0,
    pendingImpactAt: 0,
    lastUsedAt: {
      sweep: -Infinity,
      thrust: -Infinity,
      stomp: -Infinity,
      charge: -Infinity,
      volley: -Infinity,
      breath: -Infinity,
    },
    staggerUntil: -Infinity,
    lastHitSwing: -Infinity,
    hitFlashUntil: -Infinity,
    deathAt: -Infinity,
    popped: false,
    yaw: 0,
    pose: 'repos',
    poseUntil: -Infinity,
    nextAttackAt: -Infinity,
    chargeDir: null,
    chargeUntil: -Infinity,
    chargeHit: false,
    puddles: Array.from({ length: PUDDLES }, () => ({ x: 0, z: 0, until: -Infinity })),
    lastBurnAt: -Infinity,
  })

  // Inscription au registre : la minimap y prend son point argenté, le calque de
  // combat sa barre de vie. Le retrait au démontage est indispensable — sans
  // lui, un Lynel mort resterait affiché sur la carte.
  useEffect(() => {
    enemyRegistry.set(id, {
      kind: 'lynel',
      x: home[0],
      y: home[1],
      z: home[2],
      state: 'idle',
      hp,
      maxHp: hp,
      lastHitAt: -Infinity,
    })
    return () => {
      enemyRegistry.delete(id)
    }
  }, [hp, home, id])

  useFrame((_, rawDelta) => {
    const rb = body.current
    const group = visual.current
    if (!rb || !group || removed) return

    const delta = Math.min(rawDelta, 0.05)
    const now = gameNow()
    const state = runtime.current
    const store = useGameStore.getState()
    const position = rb.translation()

    /*
      L'engagement se mesure sur la distance du **joueur au centre de l'arène**,
      et non sur sa distance au Lynel.

      La différence compte : mesurée sur la bête, l'entrée en combat dépendrait
      de l'endroit où elle se trouve au moment où le joueur franchit l'arcade, et
      les barrières se fermeraient tantôt derrière lui, tantôt devant. Mesurée
      sur le centre, elle se déclenche toujours au même endroit — c'est le lieu
      qui engage, pas la bête.

      `startBossFight` est idempotent : on peut l'appeler à chaque frame.
    */
    if (role === 'guardian' && state.deathAt === -Infinity && store.phase === 'playing') {
      const playerFromCenter = Math.hypot(
        playerTransform.position.x - ARENA_CENTER[0],
        playerTransform.position.z - ARENA_CENTER[2],
      )
      if (playerFromCenter < ARENA_R - 1.5) store.startBossFight()
      /*
        Et il se termine si le joueur quitte l'arène.

        Les barrières sont censées l'en empêcher, mais elles ne couvrent que les
        deux brèches : il reste la chute hors de l'île, le filet de sécurité qui
        le repose au point d'arrivée, et le menu de téléportation. Sans cette
        sortie, le combat restait « engagé » à quarante-sept unités de la
        rotonde — caméra serrée sur un joueur seul, et barrières dressées en
        travers de la seule entrée. Mesuré : c'est exactement ce qui arrivait.

        La marge est large (le double du rayon) pour qu'un pas de côté au bord du
        dallage ne coupe pas le combat en deux.
      */
      if (playerFromCenter > ARENA_R * 2) store.endBossFight(false)
    }

    // --- Mort ---------------------------------------------------------------
    // Avant tout le reste, comme dans `Enemy.tsx` : un boss tué puis abandonné
    // resterait figé en pleine séquence.
    if (state.deathAt > -Infinity) {
      const age = now - state.deathAt
      materials.body.color.copy(WHITE)
      materials.dark.color.copy(WHITE)

      if (age < DEATH_SQUASH_MS) {
        group.scale.set(1.35, 0.6, 1.35)
      } else if (age < DEATH_POP_MS) {
        // Détente en sortie cubique : une rampe linéaire se lit comme un objet
        // qu'on tire, pas comme un ressort qu'on lâche.
        const t = (age - DEATH_SQUASH_MS) / (DEATH_POP_MS - DEATH_SQUASH_MS)
        const ease = 1 - (1 - t) ** 3
        group.scale.set(1.35 - 0.75 * ease, 0.6 + 0.9 * ease, 1.35 - 0.75 * ease)
      } else if (!state.popped) {
        state.popped = true
        group.visible = false
        spawnDeathPuff(position.x, position.y, position.z, materials.base.body)
        // L'altitude du poste, et non un champ de hauteurs échantillonné : le
        // dallage de la rotonde est plat, et la couronne du jardin où se tiennent
        // les bêtes de l'épreuve ne varie que de quelques centimètres sur le
        // rayon d'une laisse.
        spawnDeathRing(position.x, home[1], position.z, materials.base.body)
        enemyRegistry.delete(id)
      }

      rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, false)
      if (age >= DEATH_REMOVE_MS) setRemoved(true)
      return
    }

    // --- Gel du coup fatal --------------------------------------------------
    // Après la branche de mort et pas avant, comme dans `Enemy.tsx` : à la frame
    // du coup fatal, le corps n'a pas encore pris sa pose écrasée — la hisser
    // plus haut figerait le boss debout, soit la seule pose que ce gel existe
    // pour ne pas montrer.
    if (isHitStopped()) return

    toPlayer.set(
      playerTransform.position.x - position.x,
      0,
      playerTransform.position.z - position.z,
    )
    const distance = toPlayer.length()
    const frozen = store.phase !== 'playing'

    updateEnemyMarker(
      id,
      position.x,
      position.y,
      position.z,
      state.pending !== null ? 'attack' : distance < stats.detectRadius ? 'chase' : 'idle',
      state.hp,
    )

    // --- Coup d'épée du joueur ---------------------------------------------
    // Repris mot pour mot d'`Enemy.tsx` : le coup est évalué **une seule fois
    // par swing**, dès la première frame qui suit l'ouverture de la fenêtre, et
    // le swing est marqué consommé qu'il touche ou non. Tester « sommes-nous
    // dans la fenêtre ? » reviendrait à échantillonner 135 ms dans une boucle à
    // cadence variable, et une frame sur deux tomberait à côté sur une machine
    // lente.
    const swing = playerTransform.attackStartedAt
    const windowOpened = now - swing >= ATTACK.hitWindow[0] * ATTACK.durationMs

    if (windowOpened && state.lastHitSwing !== swing) {
      state.lastHitSwing = swing
      const hitX = playerTransform.position.x + Math.sin(playerTransform.yaw) * ATTACK.reach
      const hitZ = playerTransform.position.z + Math.cos(playerTransform.yaw) * ATTACK.reach
      const reach = ATTACK.radius + stats.radius
      if (Math.hypot(position.x - hitX, position.z - hitZ) < reach) {
        playerTransform.lastLandedSwing = swing
        /*
          Dégâts triplés pendant l'ouverture.

          C'est ce qui fait qu'une parade réussie vaut six à neuf coups
          ordinaires, et donc que le combat se gagne en lisant plutôt qu'en
          frappant. Sans le multiplicateur, la parade ne serait qu'un moyen de
          ne pas perdre de cœurs : utile, mais optionnelle.
        */
        const punishing = now < state.staggerUntil
        const amount = store.swordDamage() * (punishing ? PUNISH_MULTIPLIER : 1)
        const died = damage(
          state,
          beast,
          rb,
          position.x,
          position.z,
          now,
          playerTransform.position.x,
          playerTransform.position.z,
          amount,
        )
        if (died) return
      }
    }

    // --- Projectile renvoyé -------------------------------------------------
    // Même raison que la hitbox d'épée : les PV vivent ici, et les faire vivre
    // dans la boucle des projectiles créerait une seconde source de vérité.
    for (const projectile of projectiles) {
      if (!projectile.active || !projectile.deflected) continue
      const reach = stats.radius + PROJECTILE_HIT_RADIUS
      if (
        Math.hypot(
          projectile.position.x - position.x,
          projectile.position.y - position.y,
          projectile.position.z - position.z,
        ) > reach
      ) {
        continue
      }

      projectile.active = false
      const died = damage(
        state,
        beast,
        rb,
        position.x,
        position.z,
        now,
        projectile.position.x,
        projectile.position.z,
        RETURNED_ARROW_DAMAGE,
      )
      if (died) return
      break
    }

    // Flash blanc à l'impact : le retour qui rend le combat lisible.
    const flashing = now < state.hitFlashUntil
    materials.body.color.copy(flashing ? WHITE : materials.base.body)
    materials.dark.color.copy(flashing ? WHITE : materials.base.dark)

    // --- Déplacement --------------------------------------------------------
    // Il n'a pas de machine à états : il avance, ou il ne bouge pas. Ce qui
    // ressemblerait à `chase` / `attack` est déjà porté par `pending`.
    velocity.x = 0
    velocity.z = 0
    let targetYaw = state.yaw
    const fromHome = Math.hypot(position.x - home[0], position.z - home[2])

    if (state.chargeDir !== null && !frozen) {
      /*
        La charge, une fois lancée, ne se pilote plus.

        `!frozen` la met en attente pendant une pause plutôt que de l'annuler :
        l'horloge de jeu s'arrête avec elle, donc `chargeUntil` ne file pas, et
        la course reprend exactement où elle en était à la reprise. Sans cette
        garde, le Lynel traverserait l'arène pendant qu'on lit une fiche de
        projet.

        Sa direction a été figée à la fin du télégraphe et n'est pas corrigée :
        une charge qui suit le joueur est infaisable à esquiver, et il en conclut
        que l'attaque n'a ni parade — ce qui est vrai — ni esquive — ce qui
        serait faux et injuste. Figée, elle se lit : on voit où elle va, on
        s'écarte.
      */
      velocity.x = state.chargeDir.x * CHARGE_SPEED
      velocity.z = state.chargeDir.z * CHARGE_SPEED
      targetYaw = Math.atan2(state.chargeDir.x, state.chargeDir.z)

      // Fauché une fois par charge : sans ce drapeau, un joueur collé au flanc
      // reprendrait des dégâts à chaque frame dès la fin de ses i-frames.
      if (!state.chargeHit && distance < stats.radius + 0.9) {
        state.chargeHit = true
        store.damagePlayer(LYNEL_ATTACKS.charge.damage + damageBonus, 'lynel')
        playImpact()
      }

      /*
        Fin de charge : le bord de la laisse, ou le temps.

        Le bord, et non une requête physique contre les piliers — un raycast par
        frame pour une attaque qui sort toutes les cinq secondes serait cher, et
        la laisse du gardien *est* le dallage : en sortir, c'est avoir heurté
        l'enceinte, quel que soit l'endroit. Une bête de l'épreuve, elle, finit
        sa course contre le talus du cœur ou contre le mur du jardin, que ses
        deux anneaux décrivent aussi bien.
      */
      if (beyondLeash(leash, position.x, position.z, 1.2) || now > state.chargeUntil) {
        state.chargeDir = null
        state.staggerUntil = now + CHARGE_STUN_MS
        state.pose = 'brise'
        state.poseUntil = now + CHARGE_STUN_MS
        state.nextAttackAt = now + CHARGE_STUN_MS
        shake(0.16, 220)
        playImpact()
      }
    } else if (frozen || now < state.staggerUntil) {
      // Étourdi : il ne se déplace pas, et il ne se retourne pas non plus —
      // l'ouverture doit rester exploitable par-derrière.
    } else if (distance < stats.detectRadius) {
      targetYaw = Math.atan2(toPlayer.x, toPlayer.z)
      // Un télégraphe engagé cloue les sabots : avancer pendant la préparation
      // rendrait la sortie de portée impossible, donc l'esquive illusoire.
      if (state.pending === null && distance > ENGAGE_RANGE) {
        toPlayer.normalize()
        velocity.x = toPlayer.x * stats.speed
        velocity.z = toPlayer.z * stats.speed
      }
    } else if (fromHome > RECENTER_RADIUS) {
      /*
        Le joueur est sorti : elle retourne à son poste plutôt que de le
        poursuivre.

        C'est ce qui lui donne une démarche de gardien, ce qui laisse au joueur
        les trois secondes qu'il faut pour se soigner, et surtout ce qui rend
        vraies les portées mesurées depuis le centre — les trois anneaux d'or du
        dallage ne disent quelque chose que si la bête part de l'origine. Pour
        les bêtes de l'épreuve, le poste est leur point d'apparition dans le
        jardin : c'est lui qui les garde à trente-six unités les unes des autres,
        donc qui permet de les tirer une par une.
      */
      const angle = Math.atan2(home[0] - position.x, home[2] - position.z)
      velocity.x = Math.sin(angle) * stats.patrolSpeed
      velocity.z = Math.cos(angle) * stats.patrolSpeed
      targetYaw = angle
    }

    /*
      La laisse : elle ne sort pas de son terrain.

      Rien ne l'y retenait. Les barrières ne ferment que les deux brèches, et
      entre deux piliers il n'y a aucun collider : en poursuivant le joueur — ou
      en finissant une charge — le gardien passait la lèvre du cœur, tombait les
      3,6 unités jusqu'au jardin, et **ne pouvait plus remonter**, la falaise
      étant à 2,7 de pente contre 0,5 de praticable. Il disparaissait du combat
      sans mourir, et se laissait achever sans jamais réagir.

      Voir `clampToLeash` pour le détail du geste, et `LynelLeash` pour la raison
      des deux rayons.
    */
    clampToLeash(leash, position.x, position.z)

    rb.setLinvel({ x: velocity.x, y: rb.linvel().y, z: velocity.z }, true)
    state.yaw = dampAngle(state.yaw, targetYaw, 9, delta)
    group.rotation.y = state.yaw

    // --- Préparation d'attaque ----------------------------------------------
    // Drapeau consommé, comme dans `Enemy.tsx` : un intervalle testé à chaque
    // frame serait échantillonné dans une boucle à cadence variable, et une
    // frame sur deux tomberait à côté sur une machine lente.
    if (
      state.pending === null &&
      state.chargeDir === null &&
      now > state.staggerUntil &&
      now > state.nextAttackAt &&
      !frozen &&
      distance < stats.detectRadius
    ) {
      const choice = pickAttack(state, now, distance)
      if (choice) {
        state.pending = choice
        state.pendingStartedAt = now
        state.pendingImpactAt = now + choice.telegraphMs
        state.pose = choice.id === 'charge' ? 'charge' : choice.id === 'stomp' ? 'cabre' : 'garde'
        /*
          L'offre part ici, à l'ouverture du télégraphe, mais la fenêtre ne
          s'ouvrira que `cueLeadMs` avant l'impact : `offerParry` calcule
          `offerFrom` depuis l'instant d'impact, pas depuis l'appel. C'est ce qui
          permet à un télégraphe de 620 ms de n'offrir que ses 500 dernières
          millisecondes — les 120 premières ne sont pas réactives, et les
          signaler donnerait au joueur un moment où appuyer paraît juste sans
          l'être. Les attaques dont le télégraphe est plus court que l'avance —
          l'estoc, à 400 ms — allument l'anneau d'emblée.
        */
        if (choice.parryable) {
          offerParry(id, state.pendingImpactAt)
          /*
            La feinte décale l'impact **après** que l'offre a été posée.

            L'offre garde donc son horaire d'origine, et c'est exactement ce qui
            la rend fausse : qui pare au signal est en récupération quand le coup
            arrive enfin. Il faut alors regarder l'épaule et non la crinière.
            C'est la seule mécanique du combat qui demande de *désapprendre*, et
            c'est pour ça qu'elle n'arrive qu'en dernière phase.
          */
          if (state.phase === 'rage' && Math.random() < FEINT_CHANCE) {
            state.pendingImpactAt += FEINT_DELAY_MS
          }
        }
      }
    }

    // Un télégraphe s'annule si le joueur sort de portée — c'est tout l'intérêt
    // du temps de préparation. Sans annulation, il ne fait que retarder un coup
    // de toute façon inévitable.
    //
    // L'offre de parade part avec lui : sinon l'anneau resterait allumé sous les
    // pieds d'un joueur qui n'a plus rien à parer, et lui apprendrait à appuyer
    // pour rien.
    if (
      state.pending !== null &&
      (frozen || distance > state.pending.reach + 2 || now < state.staggerUntil)
    ) {
      state.pending = null
      cancelParry(id)
      state.pose = 'repos'
    }

    // --- Résolution ---------------------------------------------------------
    if (state.pending !== null && now >= state.pendingImpactAt) {
      const attack = state.pending
      state.pending = null
      state.lastUsedAt[attack.id] = now
      state.poseUntil = now + FOLLOW_THROUGH_MS
      state.nextAttackAt = now + RECOVERY_MS

      if (attack.parryable && consumeParry(now)) {
        /*
          Parade réussie.

          Trois retours, tous en temps **réel** et non en temps de jeu : ils
          doivent jouer pendant le gel, qui est précisément le moment où ils
          portent. Même raison que la mort d'un ennemi — voir `Enemy.tsx`.
        */
        state.staggerUntil = now + PARRY.punishMs
        state.pose = 'brise'
        hitStop(PARRY.hitStopMs)
        shake(0.12, 150)
        playParrySuccess()
        track('boss_parry', { attack: attack.id })
      } else if (attack.id === 'charge') {
        /*
          La direction est figée **ici**, à la fin du télégraphe, et pas suivie.
          Le coup lui-même n'est pas résolu : c'est le corps lancé qui fauche,
          dans le bloc de déplacement.
        */
        const length = Math.hypot(toPlayer.x, toPlayer.z) || 1
        state.chargeDir = { x: toPlayer.x / length, z: toPlayer.z / length }
        state.chargeUntil = now + ((ARENA_R * 2) / CHARGE_SPEED) * 1000
        state.chargeHit = false
        state.pose = 'charge'
        // Pas de `poseUntil` ici : une charge dure ce que dure sa course — jusqu'à
        // 1,9 s si elle part du bord opposé — et la borner à 1,4 s faisait
        // reprendre la pose de repos en pleine course, à onze unités par seconde.
        // C'est la laisse et l'impact qui la terminent, pas un minuteur de pose.
      } else if (attack.id === 'stomp') {
        /*
          L'onde rase le sol : elle touche qui est à terre, pas qui saute.

          `playerTransform.grounded` est exactement le drapeau qu'il faut, et il
          existe déjà — le raycast sol du joueur l'écrit à chaque frame. Tester
          une hauteur absolue serait plus fragile : le dallage est à 7,2, et un
          seuil en dur y deviendrait faux le jour où l'arène bouge.

          C'est la seule attaque du combat qui se *franchit* au lieu de
          s'esquiver. Le jeu avait un saut qui ne servait qu'à grimper.
        */
        if (playerTransform.grounded && attackHits(attack, position, state.yaw)) {
          store.damagePlayer(attack.damage + damageBonus, 'lynel')
        }
        spawnDeathRing(position.x, home[1], position.z, SHOCK_COLOR, attack.reach)
        shake(0.14, 200)
        playImpact()
        state.pose = 'cabre'
      } else if (attack.id === 'breath') {
        if (attackHits(attack, position, state.yaw)) {
          store.damagePlayer(attack.damage + damageBonus, 'lynel')
        }
        // Les flaques sont semées le long du cône, du plus près au plus loin :
        // c'est le souffle qui se pose, pas une couronne autour de la bête.
        for (let i = 0; i < PUDDLES; i++) {
          const along = 1.6 + (i / (PUDDLES - 1)) * (attack.reach - 1.6)
          const spread = (i % 2 === 0 ? 1 : -1) * (i / PUDDLES) * attack.arc
          const angle = state.yaw + spread
          const slot = state.puddles[i]
          slot.x = position.x + Math.sin(angle) * along
          slot.z = position.z + Math.cos(angle) * along
          slot.until = now + PUDDLE_MS
        }
        state.pose = 'balayage'
      } else if (attack.id === 'volley') {
        /*
          Trois flèches, et pas une ligne de neuf à écrire : `fireProjectile`
          existe, et la parade d'épée du jeu les renvoie déjà — le joueur
          réutilise un geste qu'il connaît depuis le premier Octorok.

          La dispersion est appliquée **par tir** et non une fois pour les trois :
          trois flèches parallèles ne sont qu'une flèche large, et s'esquivent
          d'un pas de côté. Étalées, elles obligent à choisir un côté.
        */
        muzzle.set(position.x, position.y + 1.4, position.z)
        for (const spread of [-VOLLEY_SPREAD, 0, VOLLEY_SPREAD]) {
          const dx = playerTransform.position.x - muzzle.x
          const dz = playerTransform.position.z - muzzle.z
          const cos = Math.cos(spread)
          const sin = Math.sin(spread)
          aim.set(
            muzzle.x + dx * cos - dz * sin,
            playerTransform.position.y,
            muzzle.z + dx * sin + dz * cos,
          )
          fireProjectile(muzzle, aim, 0)
        }
        state.pose = 'balayage'
      } else if (attackHits(attack, position, state.yaw)) {
        useGameStore.getState().damagePlayer(attack.damage + damageBonus, 'lynel')
        // La charge et le triple tir sont traités au-dessus : ne restent ici que
        // les coups d'épée, qui partagent tous le même geste de suite.
        state.pose = 'balayage'
        playImpact()
      } else {
        state.pose = 'balayage'
      }
    }

    // --- Pose ---------------------------------------------------------------
    // Le retour au repos est décidé ici et nulle part ailleurs : la pose de fin
    // de coup se tient `FOLLOW_THROUGH_MS`, celle de l'étourdissement tient
    // jusqu'au bout de l'ouverture.
    if (
      state.pending === null &&
      state.chargeDir === null &&
      now > state.staggerUntil &&
      now > state.poseUntil
    ) {
      state.pose = 'repos'
    }
    rig.current?.setPose(state.pose)
    rig.current?.setRage(state.phase === 'rage')

    /*
      Les flaques brûlent au temps passé dedans, prélevé une fois par seconde.

      Pas à chaque frame : `damagePlayer` respecte les i-frames, donc un
      prélèvement par frame ne ferait de toute façon qu'un cœur toutes les 1,1 s
      — mais il ferait dépendre le rythme du framerate, ce que ce projet refuse
      partout ailleurs. Une cadence explicite se règle ; un effet de bord non.
    */
    for (let i = 0; i < PUDDLES; i++) {
      const mesh = puddleMeshes.current[i]
      if (!mesh) continue
      const puddle = state.puddles[i]
      const left = puddle.until - now
      mesh.visible = left > 0
      if (!mesh.visible) continue
      // Deux centimètres au-dessus du dallage : posée dessus, la flaque se bat
      // avec le sol dans le tampon de profondeur et clignote par bandes. Même
      // réglage que les anneaux de mort.
      mesh.position.set(puddle.x, home[1] + 0.02, puddle.z)
      // Elle s'éteint en s'effaçant, et non d'un coup : une flaque qui
      // disparaît à l'instant où elle cesse de brûler ne prévient pas.
      ;(mesh.material as MeshBasicMaterial).opacity = 0.45 * Math.min(1, left / 700)
    }

    if (now - state.lastBurnAt >= 1000 / PUDDLE_DPS) {
      for (const puddle of state.puddles) {
        if (now > puddle.until) continue
        const inside =
          Math.hypot(
            playerTransform.position.x - puddle.x,
            playerTransform.position.z - puddle.z,
          ) < PUDDLE_R
        if (inside) {
          state.lastBurnAt = now
          store.damagePlayer(1, 'lynel')
          break
        }
      }
    }

    /*
      Crochet de mise au point.

      Même raison que `__lastSwing` et `__lastDeath` : la machine à états du boss
      se joue en fractions de seconde et sur une carte où la physique ne se
      simule pas en rendu logiciel. Elle ne peut donc pas être *observée*, il
      faut pouvoir la *lire*. Les instants sont rendus relatifs à maintenant :
      « dans 900 ms » se comprend, « 41 327 » non.
    */
    if (import.meta.env.DEV) {
      lynelDebug.id = id
      lynelDebug.hp = state.hp
      lynelDebug.phase = state.phase
      lynelDebug.pose = state.pose
      lynelDebug.pending = state.pending?.id ?? null
      lynelDebug.distance = Math.round(distance * 10) / 10
      lynelDebug.staggerIn = Math.round(state.staggerUntil - now)
      lynelDebug.nextAttackIn = Math.round(state.nextAttackAt - now)
      lynelDebug.poseUntilIn = Math.round(state.poseUntil - now)
      lynelDebug.charging = state.chargeDir !== null
      lynelDebug.chargeEndsIn = Math.round(state.chargeUntil - now)
      lynelDebug.frozen = frozen
      lynelDebug.now = Math.round(now)
    }

    // La phase se relit à chaque frame plutôt qu'au moment du coup : elle est une
    // fonction des PV, pas un événement, et la dériver évite qu'un chemin de
    // dégâts oublié laisse le boss dans une phase qu'il a déjà quittée.
    state.phase = phaseOf(state.hp, phases)

    // Le corps se gonfle pendant la préparation : c'est ce mouvement-là, plus
    // que la pose, qui se lit à la périphérie du regard.
    const windup =
      state.pending !== null
        ? Math.min(1, (now - state.pendingStartedAt) / state.pending.telegraphMs)
        : 0
    const puff = flashing ? 1.1 : 1 + windup * 0.06
    group.scale.setScalar(MathUtils.damp(group.scale.x, puff, 18, delta))
  })

  if (removed) return null

  return (
    <>
      {/*
        Les flaques, **hors** du corps physique.

        Elles sont posées dans le monde et n'en bougent plus : les ranger sous le
        `RigidBody` les ferait voyager avec la bête, c'est-à-dire exactement
        l'inverse de ce qu'est une flaque. Un pool fixe de six disques, montrés
        ou cachés — aucune allocation, aucun montage React en cours de combat.
      */}
      <group>
        {Array.from({ length: PUDDLES }, (_, i) => (
          <mesh
            key={i}
            ref={(mesh) => {
              puddleMeshes.current[i] = mesh
            }}
            rotation={[-Math.PI / 2, 0, 0]}
            visible={false}
          >
            <circleGeometry args={[PUDDLE_R, 18]} />
            <meshBasicMaterial
              color={LYNEL_COLORS.glow}
              transparent
              opacity={0.45}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={[
        home[0],
        home[1] + stats.halfHeight + stats.radius + 0.4,
        home[2],
      ]}
      lockRotations
      mass={4}
      ccd
    >
      {/* Même réglage que le joueur et les autres ennemis : friction nulle en
          règle `Min`, sinon le dallage freine la bête entre deux frames et sa
          vitesse dépend du framerate. */}
      <CapsuleCollider
        args={[stats.halfHeight, stats.radius]}
        friction={0}
        frictionCombineRule={CoefficientCombineRule.Min}
      />
      <group ref={visual} position={[0, -(stats.halfHeight + stats.radius), 0]}>
        <LynelModel ref={rig} materials={materials} />
      </group>
    </RigidBody>
    </>
  )
}

/**
 * Ce qu'il faut savoir de la bête pour résoudre un coup : qui elle est, où elle
 * se tient, et ce que sa mort déclenche.
 *
 * Un objet plutôt que trois paramètres de plus, et surtout un objet **stable** :
 * il est construit une fois par bête et non à chaque frame, alors que `damage`
 * est appelé depuis la boucle.
 */
interface Beast {
  id: string
  /** Altitude du poste, où se pose l'anneau de mort. */
  groundY: number
  role: 'guardian' | 'trial' | 'golden'
  /** Ses seuils de phase : `damage` relit la phase après chaque coup. */
  phases: LynelPhases
}

/**
 * Applique des dégâts, et tout ce qui va avec : flash, recul, mort.
 *
 * Deux sources y mènent — le coup d'épée et le projectile renvoyé — et elles
 * doivent produire exactement le même effet. Retourne vrai si le Lynel vient de
 * mourir, pour que l'appelant s'arrête là.
 *
 * Le pendant d'`Enemy.tsx` à deux différences près, toutes deux volontaires :
 * aucun cœur lâché, et **aucun `registerKill()`** — ce compteur est celui des
 * vingt-six ennemis du continent, et c'est lui qui décide de l'ouverture du
 * portail. Y ajouter les Lynels, tués bien après, n'aurait aucun sens : ils ont
 * leur propre quête.
 */
function damage(
  state: LynelRuntime,
  beast: Beast,
  rb: RapierRigidBody,
  x: number,
  z: number,
  now: number,
  fromX: number,
  fromZ: number,
  amount: number,
) {
  state.hp -= amount
  state.hitFlashUntil = now + HIT_FLASH_MS
  state.phase = phaseOf(state.hp, beast.phases)
  playHit()

  const marker = enemyRegistry.get(beast.id)
  if (marker) {
    marker.lastHitAt = now
    marker.hp = Math.max(0, state.hp)
  }

  knockback.set(x - fromX, 0, z - fromZ)
  // Source confondue avec la bête : pas de direction exploitable, on ne pousse
  // pas plutôt que de pousser n'importe où.
  if (knockback.lengthSq() > 1e-6) {
    // Un tiers du recul d'un Moblin : poussé comme lui, un boss qu'on frappe
    // trente-six fois traverserait l'arène et le combat serait une poursuite.
    knockback.normalize().multiplyScalar(HIT_KNOCKBACK * 0.35)
    rb.setLinvel({ x: knockback.x, y: 1.5, z: knockback.z }, true)
  }

  if (state.hp > 0) return false

  state.deathAt = now
  state.popped = false
  state.pending = null
  state.pose = 'repos'
  // Sans ça, tuer le Lynel pendant son télégraphe laisse l'anneau de parade
  // allumé pour l'éternité, sous un joueur qui n'a plus rien à parer.
  cancelParry(beast.id)

  if (marker) {
    marker.state = 'dead'
    marker.hp = 0
  }

  /*
    Ce que la mort déclenche : le seul embranchement du fichier sur le rôle.

    Le gardien ouvre les barrières et rouvre la caméra ; son état reste
    `defeated` pour toute la partie, on ne rengage pas un boss mort en repassant
    par là. Une bête de l'épreuve avance une quête, et la troisième donne le
    cœur. Le doré clôt la dernière quête, donne le sien et ouvre le portail du
    sommet. Dans les trois cas c'est le store qui décide de la suite, pas d'ici :
    ce fichier sait faire mourir une bête, pas ce que sa mort vaut.
  */
  if (beast.role === 'guardian') {
    useGameStore.getState().endBossFight(true, [x, beast.groundY, z])
  } else if (beast.role === 'golden') {
    useGameStore.getState().registerGoldenKill()
  } else {
    useGameStore.getState().registerTrialKill(beast.id)
  }

  // Les trois retours qui font la différence entre « il a disparu » et « je
  // l'ai eu ». Tous en temps réel : ils doivent jouer pendant le gel.
  playDefeat()
  hitStop(PARRY.hitStopMs)
  shake(DEATH_SHAKE_AMPLITUDE * 2, DEATH_SHAKE_MS * 2)

  return true
}

/**
 * Rapproche un angle d'un autre par le chemin le plus court.
 *
 * Copie locale, comme dans `Enemy.tsx` et `Player.tsx` : quatre lignes que le
 * projet garde près de leur usage plutôt que dans un module d'utilitaires qui
 * n'existe pas — en sortir une troisième copie serait un refactor à part.
 */
function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = (target - current) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}
