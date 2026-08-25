import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshStandardMaterial, PlaneGeometry } from 'three'
import { WORLD } from '../../config/world'

/** Subdivisions du plan d'eau : assez pour que la houle soit lisible. */
const SEGMENTS = 96

/**
 * Surface de la mer.
 *
 * Un simple plan translucide au niveau zéro. Le fond marin étant peint en sable
 * clair, la transparence suffit à faire lire la profondeur — pas besoin de
 * lecture du depth buffer, qui coûterait une passe de rendu supplémentaire.
 *
 * La houle est déplacée dans le vertex shader, et **la normale est recalculée
 * analytiquement** au même endroit : sans ça la surface resterait parfaitement
 * plate à la lumière, et les vagues seraient invisibles malgré le déplacement.
 */
function createWaterMaterial() {
  const material = new MeshStandardMaterial({
    color: '#46a8c9',
    transparent: true,
    opacity: 0.58,
    roughness: 0.18,
    metalness: 0,
  })

  const uniforms = { uTime: { value: 0 } }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime

    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      /* glsl */ `
      uniform float uTime;

      // Trois sinusoïdes non harmoniques : la somme ne se répète pas
      // visiblement, contrairement à une houle à fréquence unique.
      float waveAt(vec2 p) {
        return sin(p.x * 0.35 + uTime * 1.1) * 0.09
             + sin(p.y * 0.27 - uTime * 0.8) * 0.07
             + sin((p.x + p.y) * 0.15 + uTime * 1.7) * 0.05;
      }

      void main() {`,
    )

    // Les dérivées de la houle donnent directement la normale : pas besoin de
    // recalculer les normales du maillage côté CPU à chaque frame.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      /* glsl */ `
      #include <beginnormal_vertex>
      vec2 wavePoint = position.xy;
      float waveDx = 0.35 * cos(wavePoint.x * 0.35 + uTime * 1.1) * 0.09
                   + 0.15 * cos((wavePoint.x + wavePoint.y) * 0.15 + uTime * 1.7) * 0.05;
      float waveDy = 0.27 * cos(wavePoint.y * 0.27 - uTime * 0.8) * 0.07
                   + 0.15 * cos((wavePoint.x + wavePoint.y) * 0.15 + uTime * 1.7) * 0.05;
      objectNormal = normalize(vec3(-waveDx, -waveDy, 1.0));`,
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      transformed.z += waveAt(wavePoint);`,
    )
  }

  return { material, uniforms }
}

export function Water() {
  const { material, uniforms } = useMemo(createWaterMaterial, [])
  const geometry = useMemo(
    () => new PlaneGeometry(WORLD.size, WORLD.size, SEGMENTS, SEGMENTS),
    [],
  )
  const time = useRef(uniforms.uTime)

  useFrame((state) => {
    time.current.value = state.clock.elapsedTime
  })

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, WORLD.waterLevel, 0]}
      // Pas d'ombre : une surface translucide qui projette une ombre opaque
      // trahit immédiatement le truc.
      renderOrder={1}
    />
  )
}
