import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Outlines } from '@react-three/drei'
import { Group, MathUtils } from 'three'
import { ATTACK, PLAYER } from '../../config/gameplay'
import { playerTransform } from '../../state/playerTransform'
import { toonGradient } from './toonGradient'

/**
 * Personnage de remplacement, entièrement procédural.
 *
 * Aucun asset externe : la silhouette est construite en primitives et animée
 * à la main (cycle de marche, pose aérienne, coup d'épée). Les proportions
 * sont volontairement "chibi" — grosse tête, petit corps — comme dans
 * Wind Waker : c'est ce qui fait lire la silhouette, pas le nombre de polygones.
 *
 * Convention : l'avant du modèle est +Z, la main droite du personnage est
 * donc du côté -X (right = forward × up en repère main droite).
 */

const COLORS = {
  tunic: '#3f9a4b',
  sleeve: '#f2ecd5',
  skin: '#f4c9a0',
  hair: '#e8c86a',
  belt: '#6b4423',
  boot: '#7a4a24',
  blade: '#dde6ef',
  guard: '#d0a53c',
  grip: '#5b3a1e',
  shield: '#b4763a',
  shieldRim: '#c9a227',
  eye: '#26241f',
  outline: '#1c2b1e',
} as const

/** Épaisseur du contour cel-shading, en unités monde. */
const OUTLINE = 0.028

/** Hauteurs de référence du "squelette". */
const HIP_Y = 0.44
const SHOULDER_Y = 0.9
const HEAD_Y = 1.2

/**
 * Interpolation sur une suite de clés `[temps, valeur]` avec temps dans [0, 1].
 * Smoothstep entre deux clés : assez pour lire une attaque, et infiniment plus
 * léger qu'un vrai système d'animation.
 */
function keyframe(t: number, frames: readonly (readonly [number, number])[]) {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i]
    if (t <= t1) {
      const [t0, v0] = frames[i - 1]
      const k = (t - t0) / (t1 - t0)
      return v0 + (v1 - v0) * (k * k * (3 - 2 * k))
    }
  }
  return frames[frames.length - 1][1]
}

/** Bras qui frappe : recul, frappe rapide vers l'avant, retour. */
const SWING_ARM = [
  [0, 0],
  [0.22, 2.5],
  [0.5, -1.2],
  [1, 0],
] as const

/** Torsion du bras pendant le coup, pour un arc plutôt qu'un axe pur. */
const SWING_TWIST = [
  [0, 0],
  [0.22, -0.35],
  [0.5, 0.45],
  [1, 0],
] as const

/** Le buste pivote avec le coup — c'est ce qui donne du poids à la frappe. */
const SWING_TORSO = [
  [0, 0],
  [0.22, 0.55],
  [0.5, -0.7],
  [1, 0],
] as const

export function HeroPlaceholder() {
  const torso = useRef<Group>(null)
  const head = useRef<Group>(null)
  const hat = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)

  /** Avance du cycle de marche, en radians. */
  const stridePhase = useRef(0)
  /** Transition sol vers air, lissée pour éviter les sauts de pose. */
  const airBlend = useRef(0)

  useFrame((state, rawDelta) => {
    if (!torso.current || !legL.current || !legR.current) return
    if (!armL.current || !armR.current || !head.current || !hat.current) return

    const delta = Math.min(rawDelta, 0.05)
    const time = state.clock.elapsedTime

    // Intensité de la marche : 0 à l'arrêt, 1 à pleine vitesse.
    const run = MathUtils.clamp(playerTransform.speed / PLAYER.speed, 0, 1)

    // La phase avance avec la distance parcourue, pas avec le temps : les pas
    // restent synchronisés au déplacement réel, sans effet de patinage.
    stridePhase.current += playerTransform.speed * delta * 2.6
    const stride = Math.sin(stridePhase.current)

    airBlend.current = MathUtils.damp(
      airBlend.current,
      playerTransform.grounded ? 0 : 1,
      14,
      delta,
    )
    const air = airBlend.current
    const ground = 1 - air

    // --- Attaque ------------------------------------------------------------
    const elapsed = performance.now() - playerTransform.attackStartedAt
    const attackProgress = elapsed / ATTACK.durationMs
    const attacking = attackProgress >= 0 && attackProgress <= 1

    // --- Jambes -------------------------------------------------------------
    // Au sol : balancier. En l'air : jambe avant repliée, jambe arrière tendue.
    legL.current.rotation.x = ground * stride * 0.85 * run + air * -0.75
    legR.current.rotation.x = ground * -stride * 0.85 * run + air * 0.45

    // --- Bras ---------------------------------------------------------------
    // Chaque bras oppose la jambe du même côté (démarche naturelle).
    armL.current.rotation.x = ground * -stride * 0.65 * run + air * 0.7

    if (attacking) {
      // L'attaque écrase complètement le balancier sur le bras armé.
      armR.current.rotation.x = keyframe(attackProgress, SWING_ARM)
      armR.current.rotation.z = keyframe(attackProgress, SWING_TWIST)
      torso.current.rotation.y = keyframe(attackProgress, SWING_TORSO)
    } else {
      armR.current.rotation.x = ground * stride * 0.65 * run + air * 0.7
      armR.current.rotation.z = MathUtils.damp(armR.current.rotation.z, 0, 12, delta)
      torso.current.rotation.y = MathUtils.damp(torso.current.rotation.y, 0, 12, delta)
    }

    // --- Buste et tête ------------------------------------------------------
    // Rebond vertical à chaque pas, respiration lente à l'arrêt.
    const bounce = Math.abs(Math.sin(stridePhase.current)) * 0.035 * run
    const breathe = Math.sin(time * 1.8) * 0.012 * (1 - run)
    torso.current.position.y = HIP_Y + bounce + breathe
    torso.current.rotation.x = 0.14 * run * ground

    // La tête compense l'inclinaison du buste : le regard reste horizontal.
    head.current.rotation.x = -0.1 * run * ground

    // Le bonnet traîne derrière le mouvement — le détail qui vend l'animation.
    hat.current.rotation.x =
      -0.32 - Math.sin(stridePhase.current - 0.6) * 0.12 * run - air * 0.25
  })

  return (
    <group>
      {/* --- Jambes : pivot à la hauteur des hanches --- */}
      <group ref={legL} position={[0.12, HIP_Y, 0]}>
        <Leg />
      </group>
      <group ref={legR} position={[-0.12, HIP_Y, 0]}>
        <Leg />
      </group>

      {/* --- Buste : porte les bras et la tête --- */}
      <group ref={torso} position={[0, HIP_Y, 0]}>
        {/* tunique évasée */}
        <mesh castShadow position={[0, 0.26, 0]}>
          <cylinderGeometry args={[0.2, 0.32, 0.54, 14]} />
          <meshToonMaterial color={COLORS.tunic} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={COLORS.outline} />
        </mesh>

        {/* ceinture */}
        <mesh castShadow position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.27, 0.28, 0.07, 14]} />
          <meshToonMaterial color={COLORS.belt} gradientMap={toonGradient} />
        </mesh>

        {/* bouclier dans le dos (l'arrière du modèle est -Z) */}
        <mesh castShadow position={[0.03, 0.3, -0.21]} rotation={[0.1, 0, 0.15]}>
          <cylinderGeometry args={[0.19, 0.19, 0.045, 12]} />
          <meshToonMaterial color={COLORS.shield} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={COLORS.outline} />
        </mesh>
        <mesh position={[0.03, 0.3, -0.235]} rotation={[0.1, 0, 0.15]}>
          <torusGeometry args={[0.17, 0.022, 6, 14]} />
          <meshToonMaterial color={COLORS.shieldRim} gradientMap={toonGradient} />
        </mesh>

        {/* --- Bras : pivot à l'épaule --- */}
        <group ref={armL} position={[0.24, SHOULDER_Y - HIP_Y, 0]}>
          <Arm />
        </group>
        <group ref={armR} position={[-0.24, SHOULDER_Y - HIP_Y, 0]}>
          <Arm />
          <Sword />
        </group>

        {/* --- Tête --- */}
        <group ref={head} position={[0, HEAD_Y - HIP_Y, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.26, 18, 16]} />
            <meshToonMaterial color={COLORS.skin} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={COLORS.outline} />
          </mesh>

          {/* oreilles pointues */}
          <mesh castShadow position={[0.25, 0.02, 0]} rotation={[0, 0, -1.9]}>
            <coneGeometry args={[0.07, 0.17, 8]} />
            <meshToonMaterial color={COLORS.skin} gradientMap={toonGradient} />
          </mesh>
          <mesh castShadow position={[-0.25, 0.02, 0]} rotation={[0, 0, 1.9]}>
            <coneGeometry args={[0.07, 0.17, 8]} />
            <meshToonMaterial color={COLORS.skin} gradientMap={toonGradient} />
          </mesh>

          {/* frange */}
          <mesh castShadow position={[0, 0.11, 0.03]} scale={[1, 0.62, 1]}>
            <sphereGeometry args={[0.265, 16, 14]} />
            <meshToonMaterial color={COLORS.hair} gradientMap={toonGradient} />
          </mesh>

          {/* yeux : la face regarde +Z */}
          <mesh position={[0.09, 0.01, 0.235]} scale={[0.5, 1, 0.4]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshBasicMaterial color={COLORS.eye} />
          </mesh>
          <mesh position={[-0.09, 0.01, 0.235]} scale={[0.5, 1, 0.4]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshBasicMaterial color={COLORS.eye} />
          </mesh>

          {/* bonnet, animé séparément */}
          <group ref={hat} position={[0, 0.16, 0]} rotation={[-0.32, 0, 0]}>
            <mesh castShadow position={[0, 0.16, -0.04]}>
              <coneGeometry args={[0.24, 0.46, 12]} />
              <meshToonMaterial color={COLORS.tunic} gradientMap={toonGradient} />
              <Outlines thickness={OUTLINE} color={COLORS.outline} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

/** Jambe et botte, suspendues sous le pivot de hanche. */
function Leg() {
  return (
    <group>
      <mesh castShadow position={[0, -0.16, 0]}>
        <capsuleGeometry args={[0.075, 0.16, 4, 10]} />
        <meshToonMaterial color={COLORS.sleeve} gradientMap={toonGradient} />
      </mesh>
      <mesh castShadow position={[0, -0.35, 0.02]}>
        <boxGeometry args={[0.17, 0.14, 0.22]} />
        <meshToonMaterial color={COLORS.boot} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={COLORS.outline} />
      </mesh>
    </group>
  )
}

/** Bras et main, suspendus sous le pivot d'épaule. */
function Arm() {
  return (
    <group>
      <mesh castShadow position={[0, -0.14, 0]}>
        <capsuleGeometry args={[0.06, 0.16, 4, 10]} />
        <meshToonMaterial color={COLORS.sleeve} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={COLORS.outline} />
      </mesh>
      <mesh castShadow position={[0, -0.27, 0]}>
        <sphereGeometry args={[0.065, 10, 10]} />
        <meshToonMaterial color={COLORS.skin} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/**
 * Épée tenue dans la main droite.
 *
 * Au repos, la lame pointe vers le haut, légèrement inclinée vers l'arrière :
 * c'est la pose "dégainée" classique, et surtout c'est la seule qui reste
 * lisible de dos comme de face (pointée vers l'arrière, la lame disparaissait
 * dans le corps).
 *
 * L'épée vit dans le repère du bras : elle suit donc l'animation d'attaque
 * sans le moindre calcul supplémentaire.
 */
function Sword() {
  return (
    <group position={[-0.02, -0.28, 0.02]} rotation={[0.28, 0, -0.12]}>
      <mesh castShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[0.05, 0.16, 0.05]} />
        <meshToonMaterial color={COLORS.grip} gradientMap={toonGradient} />
      </mesh>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[0.22, 0.04, 0.06]} />
        <meshToonMaterial color={COLORS.guard} gradientMap={toonGradient} />
      </mesh>
      <mesh castShadow position={[0, 0.48, 0]}>
        <boxGeometry args={[0.075, 0.58, 0.025]} />
        <meshToonMaterial color={COLORS.blade} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={COLORS.outline} />
      </mesh>
      <mesh castShadow position={[0, 0.81, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.053, 0.1, 4]} />
        <meshToonMaterial color={COLORS.blade} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}
