import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CapsuleCollider,
  CoefficientCombineRule,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier'
import { Color, Group, MathUtils, Vector3 } from 'three'
import {
  DEATH_POP_MS,
  DEATH_REMOVE_MS,
  DEATH_SHAKE_AMPLITUDE,
  DEATH_SHAKE_MS,
  DEATH_SQUASH_MS,
  ENEMIES,
  HEART_DROP_CHANCE,
  HIT_FLASH_MS,
  HIT_KNOCKBACK,
  HIT_STOP_MS,
} from '../config/enemies'
import { playDefeat, playHit, playParrySuccess } from '../audio/sfx'
import { killRadius } from '../config/annihilation'
import { ATTACK } from '../config/gameplay'
import { PARRY } from '../config/parry'
import { sampleHeight } from '../config/world'
import { cancelParry, consumeParry, offerParry } from '../state/parry'
import { playerTransform } from '../state/playerTransform'
import { shake } from '../state/cameraShake'
import { spawnDeathPuff, spawnDeathRing } from '../state/deathPuffs'
import { enemyRegistry, updateEnemyMarker } from '../state/enemyRegistry'
import { sanctuary } from '../state/sanctuary'
import { scaledHp } from '../state/difficulty'
import { hitStop, isHitStopped, now as gameNow } from '../state/gameClock'
import { dropPickup } from '../state/pickups'
import {
  fireProjectile,
  PROJECTILE_HIT_RADIUS,
  projectiles,
} from '../state/projectiles'
import { useGameStore } from '../store/useGameStore'
import type { EnemyKind, EnemySpawn, EnemyState } from '../types/game'
import { MoblinModel, OctorokModel, useEnemyMaterials } from './enemies/models'

/** Au-delà de cette distance, l'ennemi n'est ni affiché ni mis à jour. */
const ACTIVE_RADIUS = 85

// Vecteurs de travail partagés : `useFrame` tourne pour chaque ennemi à chaque
// frame, allouer dedans ferait travailler le GC pour rien.
const toPlayer = new Vector3()
const knockback = new Vector3()
const muzzle = new Vector3()
const playerChest = new Vector3()
const WHITE = new Color(1, 1, 1)

/**
 * Dernière mort en date, pour vérification depuis la page.
 *
 * Même raison que `__lastSwing` : la séquence dure 210 ms, aucune capture ne
 * l'attrapera et le rendu headless tourne à 1 fps. Ce qui se mesure, ce sont
 * les horodatages et les drapeaux.
 */
const lastDeath = {
  spawnId: '',
  deathAt: -Infinity,
  poppedAt: -Infinity,
  dropsHeart: false,
}
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__lastDeath = lastDeath
}

interface EnemyRuntime {
  hp: number
  state: EnemyState
  /** Horodatage d'entrée dans l'état courant. */
  stateSince: number
  lastAttackAt: number
  /**
   * Fin de l'immobilisation imposée par une parade réussie.
   *
   * Un champ à part, et c'est une correction : le blocage passait par
   * `lastAttackAt = now + punishMs`, ce qui marchait pour la recharge mais
   * cassait la pose. Celle-ci lit `now - lastAttackAt` pour animer la détente du
   * coup ; avec une valeur posée dans le futur, l'écart balayait −1 300 → 0 et
   * le sinus de la détente traversait cinq demi-périodes. Le Moblin vibrait
   * d'avant en arrière pendant toute l'ouverture — c'est-à-dire exactement
   * pendant la seconde et demie où le joueur est censé le punir.
   */
  attackBlockedUntil: number
  /** Vrai entre le début d'une préparation d'attaque et sa résolution. */
  windupPending: boolean
  windupStartedAt: number
  /** Identifiant du coup d'épée déjà encaissé : un swing ne blesse qu'une fois. */
  lastHitSwing: number
  hitFlashUntil: number
  deathAt: number
  /**
   * Tiré à la mort, consommé au pic.
   *
   * Le tirage reste à l'instant de la mort — seul le lâcher est différé, pour
   * que le cœur se lise comme jaillissant de la fumée plutôt que du corps.
   */
  dropsHeart: boolean
  /** Vrai une fois la fumée émise : elle ne doit l'être qu'une fois. */
  popped: boolean
  /** Cap visuel, lissé. */
  yaw: number
  /** Cible de patrouille, relative au point d'apparition. */
  patrolAngle: number
  patrolUntil: number
}

/**
 * Applique des dégâts et tout ce qui va avec : flash, recul, mort.
 *
 * Deux sources y mènent — le coup d'épée et le projectile renvoyé — et elles
 * doivent produire *exactement* le même effet, cœur lâché compris. Le recul est
 * calculé depuis la source du coup, pas depuis le joueur : une balle parée qui
 * arrive de côté doit pousser de côté.
 *
 * Le montant, lui, dépend de l'appelant : l'arme portée multiplie le coup
 * d'épée, jamais le renvoi de projectile — celui-ci est une parade, pas une
 * frappe, et il n'y a aucune raison qu'une lame plus tranchante fasse un
 * projectile plus meurtrier.
 *
 * Retourne vrai si l'ennemi vient de mourir, pour que l'appelant s'arrête là.
 */
function damageEnemy(
  state: EnemyRuntime,
  rb: RapierRigidBody,
  x: number,
  z: number,
  spawnId: string,
  kind: EnemyKind,
  now: number,
  fromX: number,
  fromZ: number,
  amount: number,
) {
  state.hp -= amount
  state.hitFlashUntil = now + HIT_FLASH_MS
  playHit()

  const marker = enemyRegistry.get(spawnId)
  if (marker) marker.lastHitAt = now

  knockback.set(x - fromX, 0, z - fromZ)
  // Source confondue avec l'ennemi (tir à bout portant) : pas de direction de
  // recul exploitable, on ne pousse pas plutôt que de pousser n'importe où.
  if (knockback.lengthSq() > 1e-6) {
    knockback.normalize().multiplyScalar(HIT_KNOCKBACK)
    rb.setLinvel({ x: knockback.x, y: 3, z: knockback.z }, true)
  }

  if (state.hp > 0) return false

  killEnemy(
    state,
    spawnId,
    kind,
    now,
    // Le tirage se fait ici, à l'instant de la mort, et avec `Math.random` et
    // non la graine du monde — une graine fixe rendrait les lâchers identiques
    // à chaque partie, et le joueur apprendrait quels ennemis « donnent » un
    // cœur. Seul le lâcher est différé, jusqu'au pic de la détente.
    Math.random() < HEART_DROP_CHANCE,
  )

  // Les trois retours qui font la différence entre « l'ennemi a disparu » et
  // « je l'ai eu ». Tous trois chronométrés en temps réel : ils doivent jouer
  // pendant le gel, qui est le moment où ils portent.
  //
  // Ils sont **hors de `killEnemy`**, et c'est le point de la séparation :
  // l'onde d'annihilation tue vingt-six ennemis en moins de deux secondes, et
  // trois gels de 80 ms enchaînés par mort fige l'horloge de jeu presque en
  // continu — donc fige l'onde elle-même, qui se mesure sur cette horloge. Un
  // coup d'épée est un événement, une frappe nucléaire en est un aussi : elle
  // a droit à *un* gel et à *une* secousse, pas à vingt-six.
  playDefeat()
  hitStop(HIT_STOP_MS)
  shake(DEATH_SHAKE_AMPLITUDE, DEATH_SHAKE_MS)

  return true
}

/**
 * Bascule un ennemi dans l'état mort — la comptabilité, sans les retours.
 *
 * Deux appelants : le coup qui porte (`damageEnemy`, juste au-dessus) et l'onde
 * d'annihilation. Ils ne partagent pas les effets — l'un claque, l'autre
 * balaie — mais ils doivent partager *exactement* ce qui suit, sous peine
 * d'avoir un ennemi mort pour le joueur et vivant pour la minimap, ou un
 * compteur de victimes qui n'atteint jamais le total qui ouvre le portail.
 *
 * Ne joue rien et ne fige rien : l'animation de mort est pilotée par
 * `state.deathAt` dans la boucle du composant, elle n'a besoin de personne.
 */
function killEnemy(
  state: EnemyRuntime,
  spawnId: string,
  kind: EnemyKind,
  now: number,
  dropsHeart: boolean,
) {
  state.state = 'dead'
  state.deathAt = now
  state.popped = false
  state.dropsHeart = dropsHeart
  // L'espèce est passée au compteur depuis que le défi de l'Outremonde marque
  // des **points** : un Octorok et un Moblin ne valent pas la même chose. Le
  // continent, lui, ne compte que des têtes et ignore l'argument.
  useGameStore.getState().registerKill(kind)

  // Un Moblin tué pendant sa préparation laisserait son offre derrière lui :
  // l'anneau resterait allumé et une parade partirait dans le vide.
  cancelParry(spawnId)

  // Le registre doit dire « mort » dès l'instant du coup fatal, et pas seulement
  // à la frame suivante comme avant : la branche de mort passe désormais avant
  // `updateEnemyMarker`, qu'elle n'atteint donc jamais. Sans ça, le calque de
  // combat continue de dessiner la barre de vie sur un corps qui s'étire et
  // explose, et le renvoi de projectile peut se verrouiller sur un cadavre.
  const marker = enemyRegistry.get(spawnId)
  if (marker) {
    marker.state = 'dead'
    marker.hp = 0
  }

  if (import.meta.env.DEV) {
    lastDeath.spawnId = spawnId
    lastDeath.deathAt = now
    lastDeath.poppedAt = -Infinity
    lastDeath.dropsHeart = dropsHeart
  }
}

interface EnemyProps {
  spawn: EnemySpawn
  /**
   * Délai de réapparition, en millisecondes de temps de jeu, ou `undefined`
   * pour une bête qui ne revient pas.
   *
   * **Le continent ne le passe pas, et c'est tout son sujet** : y vider la carte
   * ouvre le portail de Nakano, donc une bête qui se relève rendrait la première
   * quête du jeu impossible à finir. L'Outremonde le passe, parce qu'une carte
   * d'entraînement qui s'épuise en dix minutes n'est pas un terrain
   * d'entraînement — voir `RESPAWN_MS`.
   *
   * Une prop et non une lecture de la carte courante : ce composant ne sait pas
   * où il est monté, et il n'a aucune raison de l'apprendre pour ça.
   */
  respawnMs?: number
}

/**
 * Ennemi générique.
 *
 * Une seule machine à états pour toutes les espèces : `idle → patrol → chase →
 * attack → dead`. Ce qui change d'une espèce à l'autre tient entièrement dans
 * `ENEMIES[kind]` et dans le modèle affiché — ajouter un troisième type ne
 * demandera pas de toucher à cette logique.
 */
export function Enemy({ spawn, respawnMs }: EnemyProps) {
  const stats = ENEMIES[spawn.kind]
  const materials = useEnemyMaterials(spawn.kind)

  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<Group>(null)
  const [removed, setRemoved] = useState(false)

  /*
    Les points de vie, à la difficulté courante.

    Lus **à l'apparition** et jamais ensuite : une bête qui verrait sa barre
    changer de longueur en plein combat parce qu'on a touché un réglage serait
    incompréhensible. C'est aussi pour cette raison que le peuplement entier
    remonte au départ d'un défi (voir `populationId`) — c'est ce remontage qui
    fait prendre le nouveau calibre, pas une mise à jour en place.

    `scaledHp` vaut l'identité hors de l'Outremonde : les trois autres cartes ne
    voient aucune différence.
  */
  const [maxHp] = useState(() => scaledHp(stats.hp))

  const runtime = useRef<EnemyRuntime>({
    hp: maxHp,
    state: 'idle',
    stateSince: 0,
    lastAttackAt: -Infinity,
    attackBlockedUntil: -Infinity,
    windupPending: false,
    windupStartedAt: 0,
    lastHitSwing: -Infinity,
    hitFlashUntil: -Infinity,
    deathAt: -Infinity,
    dropsHeart: false,
    popped: false,
    yaw: 0,
    patrolAngle: Math.random() * Math.PI * 2,
    patrolUntil: 0,
  })

  // Inscription à la minimap. Le retrait au démontage est indispensable :
  // sans lui, les ennemis tués resteraient affichés sur la carte.
  useEffect(() => {
    enemyRegistry.set(spawn.id, {
      kind: spawn.kind,
      x: spawn.position[0],
      y: spawn.position[1],
      z: spawn.position[2],
      state: 'idle',
      hp: maxHp,
      maxHp: maxHp,
      lastHitAt: -Infinity,
    })
    return () => {
      enemyRegistry.delete(spawn.id)
    }
    // `maxHp` est figé pour la vie du composant — `useState` avec initialiseur
    // paresseux — mais il est dans les dépendances quand même : le jour où il
    // deviendrait recalculable, l'inscription au registre doit suivre, et un
    // tableau qui ment est plus dangereux qu'un rendu de trop.
  }, [maxHp, spawn])

  useFrame((_, rawDelta) => {
    const rb = body.current
    const group = visual.current

    if (!rb || !group || removed) return

    const delta = Math.min(rawDelta, 0.05)
    const now = gameNow()
    const state = runtime.current
    const store = useGameStore.getState()
    const position = rb.translation()

    // --- Mort ---------------------------------------------------------------
    // Placée **avant** le test de culling, et c'est une correction : un ennemi
    // tué puis quitté au-delà d'ACTIVE_RADIUS n'atteignait jamais cette
    // branche. Il restait figé en `dead` pour le reste de la partie, ne se
    // démontait jamais, et son entrée de registre restait en mémoire.
    if (state.state === 'dead') {
      const age = now - state.deathAt

      // Le corps reste blanc jusqu'au bout. L'affectation du flash est plus
      // bas, après ce `return` : sans ces deux lignes, un cadavre reprendrait
      // sa couleur d'origine au milieu de sa propre mort.
      materials.body.color.copy(WHITE)
      materials.dark.color.copy(WHITE)

      if (age < DEATH_SQUASH_MS) {
        // Anticipation : le corps se ramasse. C'est la pose que le gel tient,
        // donc la frame que le joueur regarde vraiment.
        group.scale.set(1.35, 0.6, 1.35)
        group.position.y = 0
        group.position.z = 0
      } else if (age < DEATH_POP_MS) {
        // Détente, en sortie cubique : une rampe linéaire donne un étirement
        // mou, qui se lit comme un objet qu'on tire et non comme un ressort
        // qu'on lâche.
        const t = (age - DEATH_SQUASH_MS) / (DEATH_POP_MS - DEATH_SQUASH_MS)
        const ease = 1 - (1 - t) ** 3
        group.scale.set(1.35 - 0.75 * ease, 0.6 + 0.9 * ease, 1.35 - 0.75 * ease)
        group.position.y = ease * 0.2
        group.position.z = 0
      } else if (!state.popped) {
        state.popped = true
        group.visible = false
        /*
          Le corps sort de la simulation, il n'en est pas retiré.

          `setEnabled(false)` suspend le corps **et ses colliders** : le cadavre
          invisible cesse de bousculer le joueur, et Rapier cesse de l'intégrer.
          C'est ce qui permet de garder le `<RigidBody>` monté pendant les
          vingt-cinq secondes qui séparent une bête de sa réapparition.

          **Pourquoi ne pas démonter.** La première version de la réapparition
          passait par `setRemoved`, donc par un démontage puis un remontage React.
          Le mode illimité l'a mise en défaut tout de suite : l'onde
          d'annihilation tue les soixante-treize bêtes en même temps, donc les
          remonte en même temps, et recréer soixante-dix corps physiques dans une
          seule frame faisait paniquer le wasm de Rapier — « unreachable », puis
          « recursive use of an object », puis plus aucune frame. Le monde se
          vidait et ne revenait jamais.

          Suspendre et réveiller ne crée ni ne détruit rien : aucun corps
          physique n'est alloué après le montage de la carte.
        */
        if (respawnMs !== undefined) rb.setEnabled(false)
        spawnDeathPuff(position.x, position.y, position.z, materials.base.body)
        // L'anneau se pose sur la surface **visible** du terrain, pas sous le
        // centre de la capsule : même échantillonneur que le mesh, le collider
        // et les cœurs, donc aucune seconde source de vérité.
        spawnDeathRing(
          position.x,
          sampleHeight(position.x, position.z),
          position.z,
          materials.base.body,
        )
        // Le cœur part de la poitrine, pas des pieds : le petit saut le rend
        // visible par-dessus les herbes hautes avant qu'il ne retombe.
        if (state.dropsHeart) dropPickup(position.x, position.y + 0.3, position.z)
        // Le point quitte la minimap au pic et non au démontage : la carte et
        // l'écran doivent dire la même chose au même moment.
        enemyRegistry.delete(spawn.id)
        if (import.meta.env.DEV) lastDeath.poppedAt = now
      }

      /*
        La réapparition, ou le retrait définitif.

        Sans délai passé, la bête est retirée pour de bon comme sur le continent
        — y vider la carte ouvre le portail de Nakano, une bête qui se relève
        rendrait la première quête du jeu impossible à finir.

        Avec un délai, elle **revient à son poste**. Tout est remis à plat à la
        main parce que rien n'a été démonté : l'état d'exécution est une `ref`,
        elle a survécu à la mort. La ligne qui manquerait le plus est `deathAt` :
        sans elle, la ressuscitée serait reprise par cette branche à la frame
        suivante, qui la trouverait vieille de vingt-cinq secondes.

        Le compte est fait sur l'horloge de **jeu**, donc une bête ne réapparaît
        pas derrière un panneau d'inventaire ouvert.
      */
      if (respawnMs === undefined) {
        rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, false)
        if (age >= DEATH_REMOVE_MS) setRemoved(true)
        return
      }

      if (age < respawnMs) return

      state.hp = maxHp
      state.state = 'idle'
      state.stateSince = now
      state.deathAt = -Infinity
      state.popped = false
      state.dropsHeart = false
      state.lastAttackAt = -Infinity
      state.attackBlockedUntil = -Infinity
      state.windupPending = false
      state.hitFlashUntil = -Infinity
      state.patrolUntil = 0
      state.lastHitSwing = -Infinity

      // La pose de mort avait écrasé puis étiré le groupe : sans cette remise à
      // zéro, la bête revient aplatie et décalée de vingt centimètres.
      group.scale.set(1, 1, 1)
      group.position.set(0, 0, 0)
      group.visible = true

      rb.setEnabled(true)
      // Reposée **à son poste** et non là où elle est tombée : c'est ce qui
      // garde le peuplement étalé sur la carte. Sans ça, une heure de défi finit
      // par empiler toutes les bêtes du monde à l'endroit où le joueur combat.
      rb.setTranslation(
        { x: spawn.position[0], y: spawn.position[1] + 1.5, z: spawn.position[2] },
        true,
      )
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)

      // Le point revient sur la minimap avec le corps : la branche de mort
      // l'avait retiré du registre au pic de la détente.
      enemyRegistry.set(spawn.id, {
        kind: spawn.kind,
        x: spawn.position[0],
        y: spawn.position[1],
        z: spawn.position[2],
        state: 'idle',
        hp: maxHp,
        maxHp: maxHp,
        lastHitAt: -Infinity,
      })
      return
    }

    // --- Onde d'annihilation ------------------------------------------------
    // Placée **avant** la garde de gel, et c'est délibéré : le rayon mortel se
    // mesure sur l'horloge de jeu, qui ne tourne pas pendant un gel. Sous la
    // garde, chaque mort figerait l'onde pour 80 ms — et l'onde ne progresse
    // que parce que l'horloge avance. Elle s'arrêterait donc au premier mort.
    //
    // Avant le culling aussi, pour la raison symétrique : la promesse du code
    // de triche est que *tous* les ennemis meurent, y compris ceux qui sont à
    // l'autre bout de la carte et que le composant, autrement, n'anime plus.
    const blast = store.annihilation
    if (blast !== null) {
      const reach = killRadius(now - blast.at)
      if (Math.hypot(position.x - blast.x, position.z - blast.z) < reach) {
        // Aucun cœur lâché : vingt-six cœurs jaillissant en même temps d'une
        // carte qu'on vient de vider ne récompensent rien, ils encombrent.
        killEnemy(state, spawn.id, spawn.kind, now, false)
        return
      }
    }

    // --- Gel du coup fatal --------------------------------------------------
    // Rien de ce qui suit n'a de raison de tourner pendant les 80 ms de gel, et
    // deux lignes ont une raison de ne pas tourner : le lissage du cap et celui
    // de l'échelle intègrent sur le `delta` de `useFrame`, pas sur l'horloge de
    // jeu. Sur la durée du gel ils avaleraient la moitié de l'angle restant et
    // les trois quarts de l'écart d'échelle — un ennemi qui pivote vers le
    // joueur, ou qui redescend de son flash, bougerait pendant la frame censée
    // être figée. Le reste est déjà inerte de lui-même : la fenêtre de dégâts se
    // compare à `gameNow()`, arrêtée, donc aucun coup ne s'ouvre ni ne se ferme
    // pendant le gel, et les `setLinvel` s'adressent à un moteur en pause.
    //
    // La garde est placée **après** la branche de mort, et pas en tête comme
    // pour les pools : à la frame du coup fatal, `damageEnemy` sort avant que le
    // corps n'ait pris sa pose écrasée, qui n'est posée qu'à la frame suivante —
    // c'est-à-dire pendant le gel. La hisser plus haut figerait l'ennemi debout,
    // soit exactement la pose que ce gel existe pour ne pas montrer.
    if (isHitStopped()) return

    toPlayer.set(
      playerTransform.position.x - position.x,
      0,
      playerTransform.position.z - position.z,
    )
    const distance = toPlayer.length()

    // --- Culling : rien à faire pour un ennemi hors de portée de vue --------
    const active = distance < ACTIVE_RADIUS
    group.visible = active
    if (!active) {
      rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, false)
      return
    }

    updateEnemyMarker(spawn.id, position.x, position.y, position.z, state.state, state.hp)

    // --- Coup d'épée du joueur ---------------------------------------------
    // La hitbox est une simple sphère posée devant le joueur : pas de requête
    // physique, résultat prévisible, et le coût est négligeable.
    //
    // Point important : le coup est évalué **une seule fois par swing**, dès la
    // première frame qui suit l'ouverture de la fenêtre, et le swing est marqué
    // consommé qu'il touche ou non. Tester « sommes-nous à l'intérieur de la
    // fenêtre ? » reviendrait à échantillonner un intervalle de 135 ms dans une
    // boucle à cadence variable : sur une machine lente, une frame sur deux
    // tomberait à côté et les coups ne porteraient pas. Même piège que le
    // sondage clavier corrigé plus tôt.
    const swing = playerTransform.attackStartedAt
    const swingAge = now - swing
    const windowOpened = swingAge >= ATTACK.hitWindow[0] * ATTACK.durationMs

    if (windowOpened && state.lastHitSwing !== swing) {
      state.lastHitSwing = swing
      // La portée **effective**, équipement compris, et non la constante : un
      // objet peut allonger le bras, et le point d'impact doit suivre. Voir
      // `swordReach`.
      const armLength = store.swordReach()
      const hitX = playerTransform.position.x + Math.sin(playerTransform.yaw) * armLength
      const hitZ = playerTransform.position.z + Math.cos(playerTransform.yaw) * armLength
      const reach = ATTACK.radius + stats.radius
      if (Math.hypot(position.x - hitX, position.z - hitZ) < reach) {
        // Signale au reste du jeu que ce swing a porté : le retour visuel du
        // coup dans le vide s'en sert, et la barre de vie reste affichée un
        // moment après le dernier coup encaissé.
        playerTransform.lastLandedSwing = swing
        const died = damageEnemy(
          state,
          rb,
          position.x,
          position.z,
          spawn.id,
          spawn.kind,
          now,
          playerTransform.position.x,
          playerTransform.position.z,
          // Lu au moment du coup et non mémorisé : l'inventaire met la partie en
          // pause, donc l'arme peut changer entre deux frappes sans que ce
          // composant en soit averti.
          store.swordDamage(),
        )
        if (died) return
      }
    }

    // --- Projectile renvoyé -------------------------------------------------
    // La collision est testée ici, et pas dans la boucle des projectiles, pour
    // la même raison que la hitbox d'épée : les PV vivent dans ce composant, et
    // les faire vivre ailleurs créerait une seconde source de vérité. Le
    // projectile, lui, n'a qu'à être désactivé.
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
      const died = damageEnemy(
        state,
        rb,
        position.x,
        position.z,
        spawn.id,
        spawn.kind,
        now,
        projectile.position.x,
        projectile.position.z,
        1,
      )
      if (died) return
      break
    }

    // Flash blanc à l'impact : le retour visuel qui rend le combat lisible.
    const flashing = now < state.hitFlashUntil
    materials.body.color.copy(flashing ? WHITE : materials.base.body)
    materials.dark.color.copy(flashing ? WHITE : materials.base.dark)

    // --- Machine à états ----------------------------------------------------
    /*
      « Gelé » vaut désormais pour deux raisons, et la seconde est la trêve.

      La première est la pause : panneau ouvert, écran de fin, voyage en cours.
      La seconde est le Sanctuaire de l'Outremonde — tant que le joueur est sur
      son dallage, aucune bête ne le poursuit ni ne le frappe.

      Les deux passent par **la même variable**, et ce n'est pas une économie de
      lignes : `frozen` est lu à trois endroits de cette boucle — la machine à
      états, l'armement d'une attaque, et l'annulation d'un coup déjà en
      préparation — et la trêve doit valoir pour les trois. Un test ajouté au
      seul premier aurait laissé partir le coup d'un Moblin qui se ramassait
      déjà quand le joueur a passé la lisière : le pire cas possible, puisque
      c'est exactement la situation où l'on court se mettre à l'abri.

      `sanctuary.safe` vaut `false` partout ailleurs que sur l'Outremonde — il
      n'y a que là que quelqu'un l'écrit — donc les trois autres cartes ne
      changent pas d'un iota.
    */
    const frozen = store.phase !== 'playing' || sanctuary.safe
    let desired: EnemyState = 'idle'

    if (frozen) {
      desired = 'idle'
    } else if (distance < stats.attackRange) {
      desired = 'attack'
    } else if (distance < stats.detectRadius) {
      desired = 'chase'
    } else if (now > state.patrolUntil) {
      // Patrouille : nouvelle direction toutes les quelques secondes.
      state.patrolAngle = Math.random() * Math.PI * 2
      state.patrolUntil = now + 2500 + Math.random() * 2500
      desired = 'patrol'
    } else {
      desired = state.state === 'chase' || state.state === 'attack' ? 'idle' : state.state
    }

    if (desired !== state.state) {
      state.state = desired
      state.stateSince = now
    }

    // --- Déplacement --------------------------------------------------------
    let velocityX = 0
    let velocityZ = 0
    let targetYaw = state.yaw

    if (state.state === 'chase') {
      toPlayer.normalize()
      velocityX = toPlayer.x * stats.speed
      velocityZ = toPlayer.z * stats.speed
      targetYaw = Math.atan2(toPlayer.x, toPlayer.z)
    } else if (state.state === 'attack') {
      // À portée : on s'arrête et on fait face.
      targetYaw = Math.atan2(toPlayer.x, toPlayer.z)
    } else if (state.state === 'patrol') {
      // Les ennemis restent autour de leur point d'apparition : ça évite qu'ils
      // dérivent tous vers le joueur et vident le reste de la carte.
      const home = Math.hypot(position.x - spawn.position[0], position.z - spawn.position[2])
      const angle =
        home > (spawn.radius ?? 8)
          ? Math.atan2(spawn.position[0] - position.x, spawn.position[2] - position.z)
          : state.patrolAngle
      velocityX = Math.sin(angle) * stats.patrolSpeed
      velocityZ = Math.cos(angle) * stats.patrolSpeed
      targetYaw = angle
    }

    rb.setLinvel({ x: velocityX, y: rb.linvel().y, z: velocityZ }, true)

    state.yaw = dampAngle(state.yaw, targetYaw, 9, delta)
    group.rotation.y = state.yaw

    // --- Attaque : préparation, puis résolution ------------------------------
    // La préparation est un **drapeau consommé**, pas un intervalle testé à
    // chaque frame. Écrire « sommes-nous dans la fenêtre de préparation ? »
    // reviendrait à échantillonner quelques centaines de millisecondes dans une
    // boucle à cadence variable — le piège déjà payé trois fois sur ce projet.
    const ready =
      state.state === 'attack' &&
      !frozen &&
      now > state.attackBlockedUntil &&
      now - state.lastAttackAt > stats.attackCooldownMs

    if (ready && !state.windupPending) {
      state.windupPending = true
      state.windupStartedAt = now
      if (stats.parryable) offerParry(spawn.id, now + stats.telegraphMs)
    }

    // Sortir de portée annule le coup en préparation. C'est tout l'intérêt du
    // temps de préparation : sans annulation, il ne ferait que retarder un coup
    // de toute façon inévitable.
    if (state.windupPending && (frozen || state.state !== 'attack')) {
      state.windupPending = false
      // L'offre part avec le coup, sinon l'anneau reste allumé sous un joueur
      // qui n'a plus rien à parer.
      cancelParry(spawn.id)
    }

    if (state.windupPending && now - state.windupStartedAt >= stats.telegraphMs) {
      state.windupPending = false
      state.lastAttackAt = now
      if (stats.ranged) {
        muzzle.set(position.x, position.y + 0.45, position.z)
        playerChest.copy(playerTransform.position)
        fireProjectile(muzzle, playerChest, stats.spread)
      } else if (stats.parryable && consumeParry(now)) {
        /*
          Paré.

          Aucun multiplicateur de dégâts ici, contrairement au Lynel : un Moblin
          a 3 points de vie, et une ouverture à dégâts triplés le tuerait d'un
          coup. La parade deviendrait une exécution, et le continent se
          traverserait en appuyant sur R. Sa récompense est l'ouverture elle-même
          — il est repoussé, et son prochain coup n'arrive pas avant
          `punishMs` **plus** son temps de recharge, soit 2,8 s : de quoi placer
          deux coups ordinaires sans être interrompu.

          Gel, secousse et son jouent en temps réel, pendant le gel : même
          raison que la mort d'un ennemi, plus haut dans ce fichier.
        */
        state.attackBlockedUntil = now + PARRY.punishMs
        knockback.set(position.x - playerTransform.position.x, 0, position.z - playerTransform.position.z)
        if (knockback.lengthSq() > 1e-6) {
          knockback.normalize().multiplyScalar(HIT_KNOCKBACK)
          rb.setLinvel({ x: knockback.x, y: 2, z: knockback.z }, true)
        }
        hitStop(PARRY.hitStopMs)
        shake(0.1, 140)
        playParrySuccess()
      } else {
        useGameStore.getState().damagePlayer(stats.damage, stats.kind)
      }
    }

    // Anticipation puis détente sur l'attaque : suffit à lire le coup.
    const sinceAttack = now - state.lastAttackAt
    const lunge = sinceAttack < 260 ? Math.sin((sinceAttack / 260) * Math.PI) : 0
    // Le corps se ramasse pendant la préparation et se détend au moment du
    // coup : c'est ce mouvement, plus que la couleur, qui rend l'attaque
    // lisible à la périphérie du regard.
    const windup = state.windupPending
      ? Math.min(1, (now - state.windupStartedAt) / stats.telegraphMs)
      : 0
    group.position.z = lunge * 0.28 - windup * 0.2
    const bob = state.state === 'chase' ? Math.abs(Math.sin(now * 0.012)) * 0.08 : 0
    group.position.y = bob - windup * 0.1
    const puff = flashing ? 1.18 : 1 + windup * 0.22
    group.scale.setScalar(MathUtils.damp(group.scale.x, puff, 18, delta))
  })

  if (removed) return null

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={[spawn.position[0], spawn.position[1] + 1.5, spawn.position[2]]}
      lockRotations
      mass={1}
      ccd
    >
      {/* Même réglage que le joueur : friction nulle en règle `Min`, sinon le
          sol freine l'ennemi entre deux frames et sa vitesse dépend du framerate. */}
      <CapsuleCollider
        args={[stats.halfHeight, stats.radius]}
        friction={0}
        frictionCombineRule={CoefficientCombineRule.Min}
      />
      <group ref={visual} position={[0, -(stats.halfHeight + stats.radius), 0]}>
        {spawn.kind === 'octorok' ? (
          <OctorokModel materials={materials} />
        ) : (
          <MoblinModel materials={materials} />
        )}
      </group>
    </RigidBody>
  )
}

/** Rapproche un angle d'un autre par le chemin le plus court. */
function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = (target - current) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}
