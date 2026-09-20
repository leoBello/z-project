import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import {
  CapsuleCollider,
  CoefficientCombineRule,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from '@react-three/rapier'
import { Group, Vector3 } from 'three'
import { playFootstep, playJump, playParry, playSwing } from '../audio/sfx'
import type { Control } from '../config/controls'
import { isTouchDevice } from '../config/device'
import { ATTACK, PLAYER } from '../config/gameplay'
import { outfitOf, traitsOf } from '../config/items'
import { spawnFor } from '../config/portal'
import { MARSH_LEASH_R } from '../config/rotMarsh'
import { WORLD } from '../config/world'
import type { MapId } from '../types/game'
import { enemyRegistry } from '../state/enemyRegistry'
import { isHitStopped, now as gameNow } from '../state/gameClock'
import { pressParry } from '../state/parry'
import { playerBody } from '../state/playerBody'
import { playerTransform } from '../state/playerTransform'
import { touchInput, resetTouchMove } from '../state/touchInput'
import { useGameStore } from '../store/useGameStore'

/**
 * Altitude sous laquelle le joueur est remis à son point d'apparition.
 *
 * Une table indexée par carte, et pas un ternaire : c'est la règle posée en
 * tête de `MapId`, et elle vient précisément de ce genre de ligne. La version
 * précédente s'écrivait `sky ? -20 : WORLD.maxDepth - 20`, ce qui aurait donné
 * au Marais le plancher du continent — soit une centaine d'unités de chute
 * avant que le filet ne se déclenche.
 *
 *  - **continent** : très bas. Le terrain est fermé par des murs invisibles, il
 *    faudrait traverser le sol pour l'atteindre, et ça n'arrive jamais ;
 *  - **sky** : sous la lèvre de l'île (−1,2) et bien au-dessus de son cristal
 *    (−34). On tombe assez longtemps pour comprendre qu'on est tombé, jamais
 *    assez pour traverser le socle et le voir de l'intérieur ;
 *  - **rot** : le marais est une nappe plate, on n'y tombe de nulle part. Ce
 *    plancher ne sert donc qu'à rattraper une chute impossible — il existe pour
 *    que la table soit complète, pas parce qu'on l'attend.
 */
const FALL_FLOOR: Record<MapId, number> = {
  continent: WORLD.maxDepth - 20,
  sky: -20,
  rot: -20,
}
import { HeroModel } from './models/HeroModel'

// Vecteurs de travail alloués une seule fois : `useFrame` tourne ~60x/s,
// créer des Vector3 dedans ferait travailler le GC pour rien.
const WORLD_UP = new Vector3(0, 1, 0)
const DOWN = { x: 0, y: -1, z: 0 }
const camForward = new Vector3()
const camRight = new Vector3()
const moveDir = new Vector3()

/**
 * Référence stable pour `userData` du `RigidBody` ci-dessous.
 *
 * Doit être définie une seule fois hors du composant : `@react-three/rapier`
 * inclut `userData` dans les dépendances de l'effet qui synchronise ses
 * options mutables (`useUpdateRigidBodyOptions`), et cet effet **réapplique
 * aussi la translation** du corps physique à chaque déclenchement (depuis la
 * position, possiblement obsolète, de l'`object3D` React-Three-Fiber — voir
 * `setRigidBodyOptions` dans la lib, appelé avec `updateTranslations: true`
 * par défaut). Un objet littéral `{ type: 'player' }` recréé à chaque rendu de
 * `Player` change de référence sans changer de contenu, mais React compare par
 * référence : chaque rendu déclenchait donc ce réagencement complet. Résultat
 * mesuré : après une téléportation (qui gèle la physique via `paused` sur
 * `<Physics>`, donc sans synchronisation de l'`object3D` pendant tout l'arrêt),
 * fermer la modale fait re-rendre `Player` (la phase change), ce qui réactive
 * cet effet et réécrase la translation fraîchement posée par
 * `TeleportOverlay` avec l'ancienne position du joueur d'avant le voyage.
 * Une référence stable élimine le déclenchement — plus aucune trace de
 * `userData` ne change entre deux rendus.
 */
const PLAYER_USER_DATA = { type: 'player' }

/** Décalage entre le centre de la capsule et les pieds du modèle. */
const FEET_OFFSET = -(PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius)
/** Longueur du rayon "suis-je au sol ?" : pieds + une petite marge. */
const GROUND_RAY_LENGTH = PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius + 0.2
/**
 * Distance entre deux pas, en unités monde.
 *
 * Calée sur le cycle de marche du modèle : à la vitesse de course (7 u/s), 1,45
 * donne un peu moins de cinq pas par seconde, soit la cadence de l'animation.
 * Une valeur en secondes se décalerait dès que le joueur ralentit dans l'eau.
 */
const STRIDE_LENGTH = 1.45

/**
 * Aligne le personnage sur l'ennemi le plus proche au moment de frapper.
 *
 * Le cap est écrit directement, sans lissage : au moment du coup on veut que
 * l'épée parte exactement là où le joueur regarde, pas 200 ms plus tard.
 * L'ennemi n'est retenu que s'il est déjà à peu près devant — sinon le
 * personnage ferait volte-face tout seul, ce qui se sentirait comme une perte
 * de contrôle plutôt que comme une aide.
 */
function aimAtNearestEnemy(x: number, z: number) {
  let bestYaw = playerTransform.yaw
  // Annotation explicite : `ATTACK` est `as const`, sans elle TypeScript
  // infère le type littéral 3.2 et refuse toute autre valeur.
  let bestDistance: number = ATTACK.aimAssistRange

  for (const enemy of enemyRegistry.values()) {
    const dx = enemy.x - x
    const dz = enemy.z - z
    const distance = Math.hypot(dx, dz)
    if (distance > bestDistance) continue

    const yaw = Math.atan2(dx, dz)
    let offset = (yaw - playerTransform.yaw) % (Math.PI * 2)
    if (offset > Math.PI) offset -= Math.PI * 2
    if (offset < -Math.PI) offset += Math.PI * 2
    if (Math.abs(offset) > ATTACK.aimAssistArc) continue

    bestDistance = distance
    bestYaw = yaw
  }

  playerTransform.yaw = bestYaw
}

/** Rapproche un angle d'un autre par le chemin le plus court (évite le tour complet). */
function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = (target - current) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}

export function Player() {
  const body = useRef<RapierRigidBody>(null)
  const visual = useRef<Group>(null)
  /**
   * Actions ponctuelles mises en file d'attente par les abonnements clavier.
   *
   * Saut et attaque ne peuvent pas être sondés dans `useFrame` : un appui plus
   * court qu'une frame (fréquent à 30 fps, ou sur un clavier rapide) tomberait
   * entre deux sondages et serait perdu. On s'abonne donc aux transitions de
   * touche, on lève un drapeau, et la frame suivante le consomme.
   */
  /** Distance parcourue depuis le dernier pas entendu, en unités monde. */
  const strideRef = useRef(0)
  const jumpRequested = useRef(false)
  const attackRequested = useRef(false)
  const parryRequested = useRef(false)

  const [subscribeKeys, getKeys] = useKeyboardControls<Control>()

  // Aptitudes de l'équipement porté : vitesse au sol, détente, et aisance en
  // mer. On s'abonne à `equipped` — dont la référence ne change qu'à un vrai
  // changement d'équipement — puis on mémoïse. Appeler `traitsOf` dans le
  // sélecteur aurait re-rendu le contrôleur à **chaque** notification du store,
  // la fonction construisant un objet neuf à chaque appel.
  const equipped = useGameStore((state) => state.equipped)
  const traits = useMemo(() => traitsOf(equipped, outfitOf(equipped)), [equipped])
  const { world, rapier } = useRapier()
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    const unsubscribeJump = subscribeKeys(
      (state) => state.jump,
      (pressed) => {
        if (pressed) jumpRequested.current = true
      },
    )
    const unsubscribeAttack = subscribeKeys(
      (state) => state.attack,
      (pressed) => {
        if (pressed) attackRequested.current = true
      },
    )
    const unsubscribeParry = subscribeKeys(
      (state) => state.parry,
      (pressed) => {
        if (pressed) parryRequested.current = true
      },
    )
    return () => {
      unsubscribeJump()
      unsubscribeAttack()
      unsubscribeParry()
    }
  }, [subscribeKeys])

  // Pont vers l'extérieur de React : `TeleportOverlay` a besoin de déplacer
  // directement le `RigidBody` du joueur, sans passer par du state React.
  useEffect(() => {
    playerBody.current = body.current
    return () => {
      playerBody.current = null
    }
  }, [])

  useFrame((_, rawDelta) => {
    const rb = body.current
    if (!rb) return

    // Pendant le gel du coup fatal, le monde entier tient sa pose : Rapier est
    // en pause et les ennemis n'avancent plus d'un pixel. Le héros que la
    // caméra garde au centre de l'écran ne peut pas être le seul repère à
    // continuer de pivoter et de marcher pendant ces 80 ms. Contrairement à
    // `Enemy.tsx`, aucune branche ci-dessous n'a d'effet à jouer *pendant* le
    // gel : la garde peut donc se poser en tête, avant même de lire l'état de
    // pause. Les demandes de saut et d'attaque (clavier et tactile) ne sont
    // pas consommées ici — elles restent levées et se consommeront à la
    // reprise, elles ne sont pas perdues dans le gel.
    if (isHitStopped()) return

    if (useGameStore.getState().phase !== 'playing') {
      // Les demandes en attente sont consommées, pas conservées : sinon la
      // touche qui ferme le dialogue déclencherait le saut mis en file juste
      // avant la pause, et le personnage bondirait à la réouverture du jeu.
      jumpRequested.current = false
      attackRequested.current = false
      parryRequested.current = false
      // Mêmes raisons que pour les refs clavier ci-dessus : une demande tactile
      // faite juste avant la pause ne doit pas se déclencher à la reprise. Le
      // joystick est remis au neutre pour ne pas « marcher sur place » si
      // l'overlay a disparu avant le pointerup.
      touchInput.jumpRequested = false
      touchInput.attackRequested = false
      touchInput.parryRequested = false
      resetTouchMove()
      // Le clignotement d'i-frames laisse le modèle une frame sur deux à
      // `visible = false` : figer la boucle sur l'une de ces frames laisserait
      // le personnage invisible pendant toute la pause.
      if (visual.current) visual.current.visible = true
      // La vitesse publiée est ce qui pilote le cycle de marche. Sortir sans la
      // remettre à zéro laisserait le personnage marcher sur place pendant tout
      // le temps de la pause, avec la dernière vitesse connue.
      playerTransform.speed = 0
      return
    }

    // Clamp du delta : après un changement d'onglet, un delta énorme
    // téléporterait le joueur à travers les collisions.
    const delta = Math.min(rawDelta, 0.05)
    const keys = getKeys()
    const position = rb.translation()

    // --- 1. Détection du sol -------------------------------------------------
    // Rayon vertical partant du centre de la capsule. On exclut le rigid body du
    // joueur du test, sinon le rayon touche immédiatement sa propre capsule.
    const groundHit = world.castRay(
      new rapier.Ray(position, DOWN),
      GROUND_RAY_LENGTH,
      true,
      undefined,
      undefined,
      undefined,
      rb,
    )
    const grounded = groundHit !== null

    // --- 2. Direction voulue, relative à la caméra ---------------------------
    // On projette l'axe de vue sur le plan XZ : "avant" = là où regarde la
    // caméra, à plat. Ça garde des contrôles cohérents si la caméra devient
    // orbitale plus tard.
    camera.getWorldDirection(camForward)
    camForward.y = 0
    camForward.normalize()
    camRight.crossVectors(camForward, WORLD_UP).normalize()

    moveDir.set(0, 0, 0)
    // `speedScale` reste à 1 pour le clavier (plein régime) ; le joystick le
    // ramène entre 0 et 1 selon l'amplitude du stick.
    let speedScale = 1

    // Test tactile en second : sur desktop `moveX/moveY` valent toujours 0, donc
    // on court-circuite avant même de consulter la media query — le chemin
    // clavier ne paie rien.
    if ((touchInput.moveX !== 0 || touchInput.moveY !== 0) && isTouchDevice()) {
      // Joystick : l'axe écran est projeté sur les axes caméra (droite / avant).
      // `moveY` positif pointe vers le bas de l'écran, donc vers l'arrière.
      moveDir
        .addScaledVector(camRight, touchInput.moveX)
        .addScaledVector(camForward, -touchInput.moveY)
      // camRight et camForward sont unitaires et perpendiculaires : la longueur
      // de moveDir vaut donc hypot(moveX, moveY) — l'amplitude du stick.
      speedScale = Math.min(moveDir.length(), 1)
    } else {
      if (keys.forward) moveDir.add(camForward)
      if (keys.backward) moveDir.sub(camForward)
      if (keys.right) moveDir.add(camRight)
      if (keys.left) moveDir.sub(camRight)
    }

    const isMoving = moveDir.lengthSq() > 0
    // Normaliser évite le classique "diagonale plus rapide" ; la vitesse est
    // dosée séparément par `speedScale`.
    if (isMoving) moveDir.normalize()

    // Patauger ralentit. On teste la hauteur des pieds, pas celle du centre de
    // la capsule : c'est le contact avec l'eau qui compte, pas la silhouette.
    const feetHeight = position.y + FEET_OFFSET
    const wading = feetHeight < WORLD.waterLevel
    const topSpeed = PLAYER.speed * traits.speed
    // Borné à 1 : on ne nage jamais plus vite qu'on ne court. La borne est ici
    // et non dans la table des objets pour que celle-ci n'ait pas à connaître
    // le réglage qu'elle corrige — et pour qu'un second objet aquatique ne
    // puisse pas, en se cumulant, faire de la mer un raccourci.
    const waterFactor = Math.min(1, PLAYER.waterSpeedFactor * traits.water)
    const speed = (wading ? topSpeed * waterFactor : topSpeed) * speedScale

    // --- 3. Application de la vélocité --------------------------------------
    // On pilote directement la vélocité linéaire plutôt que d'appliquer des
    // forces : réponse immédiate, pas d'inertie parasite. La composante Y est
    // laissée à Rapier (gravité), sauf au moment du saut.
    const linvel = rb.linvel()
    let velocityY = linvel.y

    if (jumpRequested.current || touchInput.jumpRequested) {
      // La demande est consommée même si le saut est refusé : sans ça, un appui
      // en l'air se déclencherait à l'atterrissage. Les deux sources (clavier et
      // bouton tactile) sont vidées ensemble.
      jumpRequested.current = false
      touchInput.jumpRequested = false
      if (grounded) {
        // La hauteur atteinte varie comme le carré de cette vitesse : le
        // multiplicateur du skin s'y applique donc bien plus fort qu'il n'en a
        // l'air. Voir `SkinTraits`.
        velocityY = PLAYER.jumpSpeed * traits.jump
        playJump()
      }
    }

    rb.setLinvel(
      {
        x: moveDir.x * speed,
        y: velocityY,
        z: moveDir.z * speed,
      },
      true,
    )

    // --- 4. Attaque ----------------------------------------------------------
    // Ici on ne fait que déclencher l'animation ; la hitbox qui inflige les
    // dégâts viendra se brancher sur cette même fenêtre temporelle.
    if (attackRequested.current || touchInput.attackRequested) {
      attackRequested.current = false
      touchInput.attackRequested = false
      const attackElapsed = gameNow() - playerTransform.attackStartedAt
      // Pas d'enchaînement tant que le coup précédent n'est pas terminé.
      if (attackElapsed >= ATTACK.durationMs) {
        playerTransform.attackStartedAt = gameNow()
        aimAtNearestEnemy(position.x, position.z)
        playSwing()
      }
    }

    // --- 4 bis. Parade --------------------------------------------------------
    // Événementielle comme l'attaque, et pour la même raison : sondée dans la
    // boucle, une pression plus courte qu'une frame serait perdue — et une
    // parade *est* plus courte qu'une frame sur une machine chargée.
    //
    // Aucune condition de contexte : la touche marche partout, même sans
    // ennemi. C'est ce qui permet au joueur d'apprendre le geste avant d'en
    // avoir besoin, et à `pressParry` de le punir s'il en abuse.
    if (parryRequested.current || touchInput.parryRequested) {
      parryRequested.current = false
      touchInput.parryRequested = false
      if (pressParry(gameNow()) === 'guard') playParry()
    }

    // --- 5. Orientation du modèle -------------------------------------------
    // Les rotations du rigid body sont verrouillées (le personnage ne doit
    // jamais basculer) : on tourne uniquement le groupe visuel enfant.
    if (visual.current) {
      if (isMoving) {
        playerTransform.yaw = dampAngle(
          playerTransform.yaw,
          Math.atan2(moveDir.x, moveDir.z),
          PLAYER.turnDamping,
          delta,
        )
      }
      visual.current.rotation.y = playerTransform.yaw

      // Clignotement pendant les i-frames. On lit le store via `getState()` et
      // non via le hook : un abonnement re-rendrait le composant à chaque coup
      // reçu, alors qu'on ne veut que basculer une visibilité par frame.
      const invulnerable = useGameStore.getState().isInvulnerable()
      visual.current.visible = !invulnerable || Math.floor(gameNow() / 90) % 2 === 0
    }

    // --- 6. Publication de l'état pour les autres systèmes ------------------
    // La vitesse réelle (et non la vitesse voulue) pilote le cycle de marche :
    // si le joueur pousse contre un mur, les jambes s'arrêtent aussi.
    playerTransform.position.set(position.x, position.y, position.z)
    playerTransform.grounded = grounded
    playerTransform.speed = Math.hypot(linvel.x, linvel.z)

    // --- 7. Pas ---------------------------------------------------------------
    // Déclenchés à la **distance parcourue**, pas à intervalle de temps : c'est
    // ce qui les garde synchronisés avec le cycle de marche, qui est lui aussi
    // piloté par la vitesse réelle. Un pas toutes les N secondes se décalerait
    // dès que le joueur ralentit dans l'eau ou monte une pente.
    if (grounded && playerTransform.speed > 0.5) {
      strideRef.current += playerTransform.speed * delta
      if (strideRef.current >= STRIDE_LENGTH) {
        strideRef.current = 0
        playFootstep()
      }
    } else {
      // Remise à zéro en l'air : à l'atterrissage, le premier pas doit tomber
      // sur une foulée complète, pas sur le reliquat d'avant le saut.
      strideRef.current = 0
    }

    /*
      Filet de sécurité si le joueur passe sous la carte.

      **Il dépend de la carte, et c'est tout le sujet.** Sur le continent il ne
      sert presque jamais : le terrain est fermé par des murs invisibles et il
      faudrait traverser le sol pour l'atteindre. Sur l'Île Céleste il est le
      traitement normal de la chute dans le vide — on marche jusqu'au bord et on
      tombe, c'est même l'un des rares gestes que la carte propose aujourd'hui.

      Un seul filet pour les deux, plutôt qu'un second posé dans le module de
      l'île : deux gestionnaires de chute qui s'ignorent, c'est la garantie
      qu'un jour l'un des deux dépose le joueur au point d'apparition du
      continent alors qu'il est dans le ciel. `spawnFor` est la seule table qui
      réponde à « où remet-on le joueur sur cette carte ».

      Aucun dégât n'est infligé, boss compris. Tomber pendant le combat a déjà
      un coût, et le bon : le Lynel est tenu sur son dallage, donc le joueur
      revient à pied par une rampe pendant que le gardien l'attend au complet.
      Y ajouter des cœurs punirait deux fois la même erreur.
    */
    // Lecture non réactive : ce composant ne doit pas se re-rendre au voyage,
    // c'est `WorldTransition` qui le repose.
    const location = useGameStore.getState().location
    if (position.y < FALL_FLOOR[location]) {
      const spawn = spawnFor(location)
      rb.setTranslation(spawn, true)
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      return
    }

    /*
      La laisse horizontale du Marais.

      Elle est ici et non dans le module du Marais, pour exactement la raison
      donnée plus haut à propos du filet de chute : deux gestionnaires qui
      remettent le joueur en place et qui s'ignorent finiront par se contredire.
      C'est la même question — « le joueur est-il sorti de la carte ? » — et elle
      a donc le même endroit.

      Elle est horizontale parce que le Marais n'a pas de vide : le sol y est une
      nappe plate qui déborde de partout. Un mur invisible aurait démenti
      l'image d'un marais sans fin ; une laisse silencieuse à cent quarante-huit
      unités ne se rencontre qu'en la cherchant, et la brume sature bien avant.
    */
    if (location === 'rot') {
      const drift = Math.hypot(position.x, position.z)
      if (drift > MARSH_LEASH_R) {
        const spawn = spawnFor(location)
        rb.setTranslation(spawn, true)
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }
    }
  })

  return (
    <RigidBody
      ref={body}
      name="player"
      userData={PLAYER_USER_DATA}
      position={PLAYER.spawn}
      colliders={false}
      // Le personnage ne doit jamais basculer : on bloque toutes les rotations
      // physiques et on gère nous-mêmes le cap (yaw) sur le groupe visuel.
      lockRotations
      mass={1}
      ccd
    >
      {/*
        Friction nulle — et surtout règle de combinaison `Min`.

        Par défaut Rapier *moyenne* les coefficients des deux corps en contact :
        un joueur à 0 sur un sol à 1 donne 0,5, pas 0. Le sol freinait donc le
        joueur pendant les sous-pas physiques enchaînés entre deux frames, et la
        vitesse réelle se mettait à dépendre du framerate (mesuré : 2 u/s au lieu
        de 7 sur une machine lente). `Min` garantit que le 0 du joueur l'emporte.

        Le déplacement étant piloté en vélocité, la friction n'apporte rien ici.
      */}
      <CapsuleCollider
        args={[PLAYER.capsuleHalfHeight, PLAYER.capsuleRadius]}
        friction={0}
        frictionCombineRule={CoefficientCombineRule.Min}
      />
      <group ref={visual} position={[0, FEET_OFFSET, 0]}>
        <HeroModel />
      </group>
    </RigidBody>
  )
}
