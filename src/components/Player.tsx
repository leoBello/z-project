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
import { ATTACK, PLAYER } from '../config/gameplay'
import { WORLD } from '../config/world'
import { playerTransform } from '../state/playerTransform'
import { LinkModel } from './models/LinkModel'

// Vecteurs de travail alloués une seule fois : `useFrame` tourne ~60x/s,
// créer des Vector3 dedans ferait travailler le GC pour rien.
const WORLD_UP = new Vector3(0, 1, 0)
const DOWN = { x: 0, y: -1, z: 0 }
const camForward = new Vector3()
const camRight = new Vector3()
const moveDir = new Vector3()

/** Décalage entre le centre de la capsule et les pieds du modèle. */
const FEET_OFFSET = -(PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius)
/** Longueur du rayon "suis-je au sol ?" : pieds + une petite marge. */
const GROUND_RAY_LENGTH = PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius + 0.2

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

  useFrame((_, rawDelta) => {
    const rb = body.current
    if (!rb) return

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
    if (keys.forward) moveDir.add(camForward)
    if (keys.backward) moveDir.sub(camForward)
    if (keys.right) moveDir.add(camRight)
    if (keys.left) moveDir.sub(camRight)

    const isMoving = moveDir.lengthSq() > 0
    // Normaliser évite le classique "diagonale plus rapide".
    if (isMoving) moveDir.normalize()

    // Patauger ralentit. On teste la hauteur des pieds, pas celle du centre de
    // la capsule : c'est le contact avec l'eau qui compte, pas la silhouette.
    const feetHeight = position.y + FEET_OFFSET
    const wading = feetHeight < WORLD.waterLevel
    const speed = wading ? PLAYER.speed * PLAYER.waterSpeedFactor : PLAYER.speed

    // --- 3. Application de la vélocité --------------------------------------
    // On pilote directement la vélocité linéaire plutôt que d'appliquer des
    // forces : réponse immédiate, pas d'inertie parasite. La composante Y est
    // laissée à Rapier (gravité), sauf au moment du saut.
    const linvel = rb.linvel()
    let velocityY = linvel.y

    if (jumpRequested.current) {
      // La demande est consommée même si le saut est refusé : sans ça, un appui
      // en l'air se déclencherait à l'atterrissage.
      jumpRequested.current = false
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
    if (attackRequested.current) {
      attackRequested.current = false
      const attackElapsed = performance.now() - playerTransform.attackStartedAt
      // Pas d'enchaînement tant que le coup précédent n'est pas terminé.
      if (attackElapsed >= ATTACK.durationMs) {
        playerTransform.attackStartedAt = performance.now()
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
      userData={{ type: 'player' }}
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
