import { useEffect, useRef } from 'react'
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
import type { Control } from '../config/controls'
import { isTouchDevice } from '../config/device'
import { ATTACK, PLAYER } from '../config/gameplay'
import { WORLD } from '../config/world'
import { enemyRegistry } from '../state/enemyRegistry'
import { now as gameNow } from '../state/gameClock'
import { playerBody } from '../state/playerBody'
import { playerTransform } from '../state/playerTransform'
import { touchInput, resetTouchMove } from '../state/touchInput'
import { useGameStore } from '../store/useGameStore'
import { LinkModel } from './models/LinkModel'

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
  const jumpRequested = useRef(false)
  const attackRequested = useRef(false)

  const [subscribeKeys, getKeys] = useKeyboardControls<Control>()
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
    return () => {
      unsubscribeJump()
      unsubscribeAttack()
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

    if (useGameStore.getState().phase !== 'playing') {
      // Les demandes en attente sont consommées, pas conservées : sinon la
      // touche qui ferme le dialogue déclencherait le saut mis en file juste
      // avant la pause, et le personnage bondirait à la réouverture du jeu.
      jumpRequested.current = false
      attackRequested.current = false
      // Mêmes raisons que pour les refs clavier ci-dessus : une demande tactile
      // faite juste avant la pause ne doit pas se déclencher à la reprise. Le
      // joystick est remis au neutre pour ne pas « marcher sur place » si
      // l'overlay a disparu avant le pointerup.
      touchInput.jumpRequested = false
      touchInput.attackRequested = false
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
    const speed =
      (wading ? PLAYER.speed * PLAYER.waterSpeedFactor : PLAYER.speed) * speedScale

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
      if (grounded) velocityY = PLAYER.jumpSpeed
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
      }
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

    // Filet de sécurité si le joueur passe sous la map.
    if (position.y < WORLD.maxDepth - 20) {
      rb.setTranslation(
        { x: PLAYER.spawn[0], y: PLAYER.spawn[1], z: PLAYER.spawn[2] },
        true,
      )
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
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
        <LinkModel />
      </group>
    </RigidBody>
  )
}
