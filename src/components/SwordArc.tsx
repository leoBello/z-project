import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DoubleSide, Group, Mesh, RingGeometry, ShaderMaterial } from 'three'
import { ATTACK } from '../config/gameplay'
import { playerTransform } from '../state/playerTransform'

/** Début et fin de l'arc, en fraction de la durée d'attaque. */
const ARC_START = 0.2
const ARC_END = 0.72
/** Ouverture angulaire de la traînée. */
const ARC_SPAN = 2.05
/**
 * Course du balayage, en radians. Reprend celle du buste dans
 * `HeroPlaceholder` (+0,55 → -0,70) : la traînée doit suivre l'épée, pas
 * décrire son propre mouvement.
 */
const SWEEP_FROM = 0.62
const SWEEP_TO = -0.78
/** Hauteur de la lame au-dessus des pieds. */
const BLADE_HEIGHT = 0.95
/**
 * Inclinaison de la traînée, en radians.
 *
 * Un anneau parfaitement horizontal est vu par la caméra sous 28° seulement
 * (11 de haut pour 21 de recul) : il ne présente qu'un peu plus du tiers de sa
 * surface et se lit comme une tache au sol — vérifié en capture. Redresser
 * l'arc le tourne vers la caméra et lui donne aussi la trajectoire descendante
 * d'un vrai coup d'épée.
 */
const ARC_TILT = 0.78
/** Décalage entre le centre de la capsule et les pieds. */
const FEET_DROP = 0.8

const NEUTRAL = '#fff4d6'
const LANDED = '#ffd54a'
const WHIFFED = '#bcd0e6'

/**
 * Traînée de lame.
 *
 * Elle sert deux choses d'un coup : matérialiser la portée réelle de l'épée
 * (le joueur ne pouvait pas la deviner), et répondre à la question « est-ce que
 * mon coup a porté ? ». Un coup dans le vide laisse une traînée pâle et bleutée
 * qui retombe ; un coup qui touche laisse une traînée dorée, plus large.
 *
 * Le verdict n'est pas obtenu en refaisant le test de hitbox — ce serait une
 * seconde source de vérité, qui finirait par diverger de celle d'`Enemy.tsx`.
 * Chaque ennemi blessé inscrit le swing dans `playerTransform.lastLandedSwing`,
 * et on se contente de comparer.
 *
 * Le verdict est rendu **deux frames après l'ouverture de la fenêtre de
 * dégâts**, jamais « pendant » celle-ci. Attendre une frame de plus garantit
 * que tous les ennemis ont eu leur évaluation, quel que soit l'ordre dans
 * lequel R3F appelle les `useFrame`. C'est le même piège que la hitbox et que
 * le sondage clavier : on ne teste pas l'appartenance à un intervalle court, on
 * attend qu'un événement soit consommé.
 */
export function SwordArc() {
  const group = useRef<Group>(null)
  const mesh = useRef<Mesh>(null)

  const geometry = useMemo(
    () =>
      new RingGeometry(
        // Ruban volontairement plus étroit que la hitbox : un anneau large
        // vu en plongée remplit tout le sol devant le joueur et se lit comme
        // une flaque, pas comme une lame — constaté en capture.
        ATTACK.reach - ATTACK.radius * 0.38,
        ATTACK.reach + ATTACK.radius * 0.42,
        40,
        1,
        // L'anneau naît dans le plan XY, thêta mesuré depuis +X. Couché à plat,
        // thêta = -π/2 pointe vers +Z, c'est-à-dire l'avant du personnage.
        -Math.PI / 2 - ARC_SPAN / 2,
        ARC_SPAN,
      ),
    [],
  )

  const material = useMemo(() => {
    const inner = ATTACK.reach - ATTACK.radius * 0.38
    const outer = ATTACK.reach + ATTACK.radius * 0.42
    const start = -Math.PI / 2 - ARC_SPAN / 2

    return new ShaderMaterial({
      transparent: true,
      side: DoubleSide,
      // Pas d'écriture de profondeur : la traînée est un effet, elle ne doit
      // pas masquer ce qui passe derrière. Le test de profondeur reste actif
      // pour qu'un relief devant le joueur la cache normalement.
      depthWrite: false,
      uniforms: {
        uColor: { value: new Color(NEUTRAL) },
        uOpacity: { value: 0 },
      },
      // Le dégradé tête-queue et l'affinement des bords sont calculés dans le
      // shader plutôt que dessinés dans une texture : la traînée se réduit à
      // une géométrie de 40 segments sans aucun octet à charger, et la forme
      // reste nette quelle que soit la taille à l'écran.
      vertexShader: `
        varying float vAngle;
        varying float vRadial;
        void main() {
          vAngle = (atan(position.y, position.x) - ${start.toFixed(5)}) / ${ARC_SPAN.toFixed(5)};
          vRadial = (length(position.xy) - ${inner.toFixed(5)}) / ${(outer - inner).toFixed(5)};
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAngle;
        varying float vRadial;
        void main() {
          // Tête franche du côté vers lequel la lame va, queue estompée
          // derrière : c'est ce qui donne le sens du coup d'un seul regard.
          float tail = smoothstep(0.0, 0.62, vAngle);
          // Bords adoucis : sans ça le ruban a deux arêtes dures et ressemble
          // à un décor plutôt qu'à un effet.
          float edge = smoothstep(0.0, 0.28, vRadial) * (1.0 - smoothstep(0.72, 1.0, vRadial));
          float alpha = uOpacity * tail * edge;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })
  }, [])

  /** Verdict du swing en cours. `pending` retient la frame d'attente. */
  const verdict = useRef({ swing: -Infinity, pending: -Infinity, landed: false })

  // Crochet de diagnostic : le rendu de l'arc dure 230 ms, trop court pour être
  // capturé de façon fiable par une capture d'écran. On publie donc le verdict
  // et l'intensité maximale atteinte, qui eux se mesurent depuis la page.
  const probe = useRef({ swing: -Infinity, judged: false, landed: false, frames: 0, peak: 0 })
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__lastSwing = probe.current
  }, [])

  useFrame(() => {
    const node = group.current
    if (!node) return

    const now = performance.now()
    const swing = playerTransform.attackStartedAt
    const progress = (now - swing) / ATTACK.durationMs

    // --- Verdict, une fois par swing ---------------------------------------
    // Rendu **avant** le test d'affichage, et non à l'intérieur : la traînée
    // n'est visible que 230 ms, et sur une machine lente aucune frame ne tombe
    // dans cet intervalle. Un verdict calculé là ne serait jamais rendu — le
    // retour visuel disparaîtrait précisément là où il sert le plus.
    const state = verdict.current
    if (state.swing !== swing && progress >= ATTACK.hitWindow[0]) {
      if (state.pending === swing) {
        state.swing = swing
        state.landed = playerTransform.lastLandedSwing === swing
        if (import.meta.env.DEV) {
          const p = probe.current
          p.swing = swing
          p.judged = true
          p.landed = state.landed
          p.frames = 0
          p.peak = 0
        }
      } else {
        state.pending = swing
      }
    }
    const judged = state.swing === swing
    const landed = judged && state.landed

    if (progress < ARC_START || progress > ARC_END) {
      node.visible = false
      return
    }

    const phase = (progress - ARC_START) / (ARC_END - ARC_START)
    // Montée brutale, extinction lente : une traînée qui apparaît
    // progressivement se lit comme un halo, pas comme un coup.
    const fade = phase < 0.18 ? phase / 0.18 : 1 - (phase - 0.18) / 0.82

    node.visible = true
    node.position.set(
      playerTransform.position.x,
      playerTransform.position.y - FEET_DROP + BLADE_HEIGHT - (judged && !landed ? phase * 0.22 : 0),
      playerTransform.position.z,
    )
    node.rotation.y = playerTransform.yaw + SWEEP_FROM + (SWEEP_TO - SWEEP_FROM) * phase

    const scale = judged && !landed ? 0.94 : 1 + (landed ? phase * 0.14 : 0)
    node.scale.setScalar(scale)

    ;(material.uniforms.uColor.value as Color).set(!judged ? NEUTRAL : landed ? LANDED : WHIFFED)
    material.uniforms.uOpacity.value = fade * (judged && !landed ? 0.55 : 1)
    if (mesh.current) mesh.current.renderOrder = 2

    if (import.meta.env.DEV) {
      const p = probe.current
      if (p.swing !== swing) {
        p.swing = swing
        p.judged = judged
        p.landed = landed
        p.frames = 0
        p.peak = 0
      }
      p.frames++
      p.peak = Math.max(p.peak, material.uniforms.uOpacity.value as number)
    }
  })

  return (
    <group ref={group} visible={false}>
      <mesh
        ref={mesh}
        geometry={geometry}
        material={material}
        rotation-x={-Math.PI / 2 + ARC_TILT}
      />
    </group>
  )
}
