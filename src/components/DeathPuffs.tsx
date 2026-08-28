import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Euler,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import { now as gameNow } from '../state/gameClock'
import {
  DEATH_PUFF_MS,
  DEATH_PUFF_POOL_SIZE,
  DEATH_PUFF_SIZE,
  deathPuffs,
} from '../state/deathPuffs'
import { faceted } from './environment/faceted'

const HIDDEN = new Matrix4().makeScale(0, 0, 0)
const matrix = new Matrix4()
const position = new Vector3()
const quaternion = new Quaternion()
const scale = new Vector3()
const euler = new Euler()

/**
 * Matériau des fumées de mort.
 *
 * Un `ShaderMaterial` brut, et c'est le seul choix qui tient. Il faut un
 * `InstancedMesh` — un draw call quel que soit le nombre de morts à l'écran —
 * or **l'opacité par instance n'existe pas** sur les matériaux standard.
 *
 * `Pickups` a contourné le problème analogue en animant l'échelle plutôt que
 * l'opacité, ce qui marche pour un cœur qui palpite ; pour de la fumée, un
 * nuage qui rétrécit se lit comme une bulle qui rentre, pas comme une
 * dissipation. D'où deux attributs d'instance, `aAlpha` et `aColor`, et douze
 * lignes de GLSL — le projet écrit déjà un shader brut pour la traînée d'épée.
 *
 * `instanceMatrix` n'est **pas** déclaré ici : three l'injecte lui-même dans le
 * préfixe du vertex shader dès que l'objet est un `InstancedMesh`. Le
 * redéclarer casse la compilation.
 */
function makePuffMaterial() {
  return new ShaderMaterial({
    transparent: true,
    // Pas d'écriture de profondeur : la fumée doit se superposer au décor et à
    // elle-même, jamais le découper. Le test reste actif pour qu'un relief
    // devant elle la cache normalement. Même réglage que la fumée de tenue.
    depthWrite: false,
    vertexShader: `
      attribute float aAlpha;
      attribute vec3 aColor;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vAlpha = aAlpha;
        vColor = aColor;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        if (vAlpha < 0.01) discard;
        gl_FragColor = vec4(vColor, vAlpha);
      }
    `,
  })
}

/**
 * Fumées laissées par les ennemis vaincus.
 *
 * Rendu hors de `<Physics>`, comme la traînée de lame et la fumée de tenue :
 * ce n'est qu'un effet, il n'a ni collider ni corps à simuler.
 *
 * Chronométré sur l'**horloge de jeu** et non sur `performance.now()` — à
 * l'inverse d'`OutfitSmoke`, et la différence est de fond : un changement de
 * tenue se fait depuis un menu, donc en pause, et doit jouer malgré elle ; une
 * mort est un événement de jeu et doit se figer avec le reste, pause comprise
 * et gel compris. Aucune garde de phase n'est nécessaire ici, contrairement à
 * `Pickups` : l'horloge est déjà arrêtée, donc l'âge des nuages ne bouge pas.
 */
export function DeathPuffs() {
  const mesh = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => {
    // Facettée, comme tout le décor et comme la fumée de tenue.
    const base = faceted(new IcosahedronGeometry(DEATH_PUFF_SIZE, 0))
    base.setAttribute(
      'aAlpha',
      new InstancedBufferAttribute(new Float32Array(DEATH_PUFF_POOL_SIZE), 1),
    )
    base.setAttribute(
      'aColor',
      new InstancedBufferAttribute(new Float32Array(DEATH_PUFF_POOL_SIZE * 3), 3),
    )
    return base
  }, [])

  const material = useMemo(makePuffMaterial, [])

  useFrame(() => {
    const instanced = mesh.current
    if (!instanced) return

    const now = gameNow()
    const alpha = geometry.getAttribute('aAlpha') as InstancedBufferAttribute
    const colors = geometry.getAttribute('aColor') as InstancedBufferAttribute

    for (let i = 0; i < deathPuffs.length; i++) {
      const puff = deathPuffs[i]
      const k = puff.active ? (now - puff.bornAt) / DEATH_PUFF_MS : 1
      if (puff.active && k >= 1) puff.active = false

      if (!puff.active) {
        instanced.setMatrixAt(i, HIDDEN)
        alpha.setX(i, 0)
        continue
      }

      // Gonflement rapide puis dissipation lente. L'inverse se lirait comme une
      // bulle qui éclate, pas comme un nuage qui se disperse.
      const grow = Math.min(k * 3.2, 1)
      position.set(puff.position.x, puff.position.y + puff.rise * k, puff.position.z)
      euler.set(k * puff.spin, k * puff.spin * 1.4, 0)
      quaternion.setFromEuler(euler)
      scale.setScalar(puff.scale * (0.25 + grow * 0.95))
      matrix.compose(position, quaternion, scale)
      instanced.setMatrixAt(i, matrix)

      alpha.setX(i, 0.85 * (1 - k * k))
      colors.setXYZ(i, puff.color.r, puff.color.g, puff.color.b)
    }

    instanced.instanceMatrix.needsUpdate = true
    alpha.needsUpdate = true
    colors.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, DEATH_PUFF_POOL_SIZE]}
      // Après la traînée de lame (2) : sur un coup fatal les deux se
      // superposent, et c'est la fumée qui doit passer devant.
      renderOrder={3}
      // Les fumées sont dispersées sur toute la carte : recalculer un volume
      // englobant commun à chaque frame coûterait plus cher que de les dessiner.
      frustumCulled={false}
    />
  )
}
