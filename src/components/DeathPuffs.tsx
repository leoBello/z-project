import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  DoubleSide,
  Euler,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { now as gameNow } from '../state/gameClock'
import {
  DEATH_PUFF_MS,
  DEATH_PUFF_POOL_SIZE,
  DEATH_PUFF_SIZE,
  DEATH_RING_FROM,
  DEATH_RING_MS,
  DEATH_RING_POOL_SIZE,
  deathPuffs,
  deathRings,
} from '../state/deathPuffs'

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
function SmokeClouds() {
  const mesh = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => {
    // Pas de `faceted()` ici, contrairement au décor : `IcosahedronGeometry` est
    // déjà non indexée, l'appel se réduirait donc à un `computeVertexNormals()`
    // dont personne ne lirait le résultat. La fumée est rendue en aplat par le
    // shader ci-dessus — aucune lumière, aucune normale — exactement comme les
    // nuages d'`OutfitSmoke`.
    const base = new IcosahedronGeometry(DEATH_PUFF_SIZE, 0)
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

    // Le pool est vide l'immense majorité du temps : entre deux morts, les
    // quarante-huit itérations, les `setMatrixAt` et les trois `needsUpdate`
    // ne font que réécrire des instances déjà à l'échelle zéro. Et le CPU n'est
    // pas le vrai sujet — `frustumCulled={false}` interdit au rendu d'écarter le
    // mesh, qui coûte donc un draw call par frame pour ne rien montrer, sur des
    // GPU intégrés que le projet vise explicitement.
    //
    // Le test se fait sur `visible` **et** sur le pool : tant que le mesh est
    // encore visible, il faut laisser passer la frame qui masquera le dernier
    // nuage éteint. Sortir avant elle laisserait cette instance inscrite dans la
    // matrice, prête à réapparaître au prochain retour de `visible`.
    let pending = false
    for (let i = 0; i < deathPuffs.length; i++) {
      if (deathPuffs[i].active) {
        pending = true
        break
      }
    }
    if (!pending && !instanced.visible) return

    const now = gameNow()
    const alpha = geometry.getAttribute('aAlpha') as InstancedBufferAttribute
    const colors = geometry.getAttribute('aColor') as InstancedBufferAttribute

    let anyActive = false
    for (let i = 0; i < deathPuffs.length; i++) {
      const puff = deathPuffs[i]
      const k = puff.active ? (now - puff.bornAt) / DEATH_PUFF_MS : 1
      if (puff.active && k >= 1) puff.active = false

      if (!puff.active) {
        instanced.setMatrixAt(i, HIDDEN)
        alpha.setX(i, 0)
        continue
      }
      anyActive = true

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
    // Après la passe de masquage, jamais avant : la frame qui éteint le dernier
    // nuage est aussi celle qui le retire de la matrice.
    instanced.visible = anyActive
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

/** Couché à plat : la géométrie d'anneau naît dans le plan XY. */
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0))

/**
 * Anneau de choc, posé au sol sous l'ennemi vaincu.
 *
 * Il partage le shader des fumées : même besoin d'opacité et de teinte par
 * instance, aucune raison d'en écrire un second.
 *
 * L'anneau est **la première chose à couper** si l'effet ne se lit pas.
 * `StrikeArc` documente que la caméra, à 11 unités de haut pour 21 de recul, ne
 * voit un objet couché que sous 28° : elle n'en présente qu'un peu plus du
 * tiers de la surface. Le pari est qu'une forme concentrique en expansion
 * survit à cet écrasement là où un ruban ne survivait pas — mais c'est un
 * pari, pas une certitude.
 */
function DeathRings() {
  const mesh = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => {
    // Rayon unitaire : c'est l'échelle d'instance qui fait grandir l'anneau,
    // pas une géométrie régénérée à chaque frame.
    const base = new RingGeometry(0.86, 1, 36)
    base.setAttribute(
      'aAlpha',
      new InstancedBufferAttribute(new Float32Array(DEATH_RING_POOL_SIZE), 1),
    )
    base.setAttribute(
      'aColor',
      new InstancedBufferAttribute(new Float32Array(DEATH_RING_POOL_SIZE * 3), 3),
    )
    return base
  }, [])

  const material = useMemo(() => {
    // Instance neuve, pas partagée avec les fumées : seule la *fabrique*
    // `makePuffMaterial` l'est. C'est ce qui permet de muter `side` ici sans
    // affecter le matériau de `SmokeClouds`.
    const material = makePuffMaterial()
    // Visible des deux côtés : sur une pente, la caméra peut passer sous le
    // plan de l'anneau, et un anneau qui disparaît selon l'inclinaison du
    // terrain se lit comme un bug.
    material.side = DoubleSide
    return material
  }, [])

  useFrame(() => {
    const instanced = mesh.current
    if (!instanced) return

    // Même sortie anticipée que les fumées, et pour le même draw call inutile :
    // un anneau ne vit que 350 ms, ce pool passe donc encore plus de temps vide.
    let pending = false
    for (let i = 0; i < deathRings.length; i++) {
      if (deathRings[i].active) {
        pending = true
        break
      }
    }
    if (!pending && !instanced.visible) return

    const now = gameNow()
    const alpha = geometry.getAttribute('aAlpha') as InstancedBufferAttribute
    const colors = geometry.getAttribute('aColor') as InstancedBufferAttribute

    let anyActive = false
    for (let i = 0; i < deathRings.length; i++) {
      const ring = deathRings[i]
      const k = ring.active ? (now - ring.bornAt) / DEATH_RING_MS : 1
      if (ring.active && k >= 1) ring.active = false

      if (!ring.active) {
        instanced.setMatrixAt(i, HIDDEN)
        alpha.setX(i, 0)
        continue
      }
      anyActive = true

      // Expansion en sortie cubique : l'onde part vite et s'essouffle, ce qui
      // est le mouvement d'un choc. Linéaire, elle se lit comme un halo qui
      // grandit.
      const ease = 1 - (1 - k) ** 3
      const radius = DEATH_RING_FROM + (ring.to - DEATH_RING_FROM) * ease
      position.copy(ring.position)
      scale.set(radius, radius, radius)
      matrix.compose(position, FLAT, scale)
      instanced.setMatrixAt(i, matrix)

      // Extinction plus rapide que l'expansion : l'anneau doit avoir disparu
      // avant d'atteindre sa taille maximale, sinon il stationne.
      alpha.setX(i, 0.7 * (1 - k) ** 2)
      colors.setXYZ(i, ring.color.r, ring.color.g, ring.color.b)
    }

    instanced.instanceMatrix.needsUpdate = true
    alpha.needsUpdate = true
    colors.needsUpdate = true
    instanced.visible = anyActive
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, DEATH_RING_POOL_SIZE]}
      renderOrder={3}
      frustumCulled={false}
    />
  )
}

/**
 * Effets laissés par les ennemis vaincus : les fumées et l'anneau de choc.
 *
 * Deux `InstancedMesh` et non un seul : les géométries diffèrent, et une
 * géométrie par instance n'existe pas. Deux draw calls pour toutes les morts
 * de l'écran, quel qu'en soit le nombre.
 */
export function DeathPuffs() {
  return (
    <>
      <SmokeClouds />
      <DeathRings />
    </>
  )
}
