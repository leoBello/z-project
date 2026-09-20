import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshStandardMaterial, PlaneGeometry } from 'three'
import { CONTINENT_SHAPE } from '../../config/continentShape'
import type { WorldShape } from '../../config/worldShape'
import { shoreDepthTexture } from './shoreDepth'

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
 *
 * L'écume du rivage vient d'une carte de profondeur cuite depuis `sampleHeight`
 * (voir `shoreDepth.ts`) : la frange suit donc exactement la ligne où le
 * terrain croise le niveau de la mer, sur le continent comme autour de l'île.
 */
function createWaterMaterial(shape: WorldShape) {
  const material = new MeshStandardMaterial({
    color: '#46a8c9',
    transparent: true,
    opacity: 0.58,
    roughness: 0.18,
    metalness: 0,
  })

  const uniforms = {
    uTime: { value: 0 },
    uShoreDepth: { value: shoreDepthTexture(shape) },
    uWorldSize: { value: shape.size },
  }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uShoreDepth = uniforms.uShoreDepth
    shader.uniforms.uWorldSize = uniforms.uWorldSize

    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      /* glsl */ `
      uniform float uTime;
      varying vec2 vShoreWorld;

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
      transformed.z += waveAt(wavePoint);

      // Position monde en XZ, pour retrouver le texel de profondeur et pour
      // faire onduler la frange. Le plan est couché par une rotation de -90°
      // sur X : son y local est donc l'opposé du z monde.
      vec4 shoreWorld = modelMatrix * vec4(transformed, 1.0);
      vShoreWorld = shoreWorld.xz;`,
    )

    // --- Écume ------------------------------------------------------------
    // Injectée juste après `color_fragment`, donc sur `diffuseColor` : l'écume
    // doit être éclairée comme le reste de la mer, pas plaquée par-dessus. On
    // pousse aussi l'alpha — de la mousse, ça ne se voit pas à travers.
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      /* glsl */ `
      uniform float uTime;
      uniform sampler2D uShoreDepth;
      uniform float uWorldSize;
      varying vec2 vShoreWorld;
      void main() {`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      /* glsl */ `
      #include <color_fragment>
      {
        vec2 shoreUv = vShoreWorld / uWorldSize + 0.5;
        float depth = texture2D(uShoreDepth, shoreUv).r;

        // La frange respire au lieu de rester une bande fixe : deux sinusoïdes
        // font avancer et reculer le bord, comme un ressac. Sans ça l'écume
        // ressemble à un liseré dessiné sur une carte.
        float swash = sin(vShoreWorld.x * 0.9 + vShoreWorld.y * 0.75 + uTime * 1.6) * 0.5
                    + sin(vShoreWorld.x * 0.31 - vShoreWorld.y * 0.44 + uTime * 0.9) * 0.5;
        float edge = depth + swash * 0.09;

        // Deux bandes : une nappe large et diffuse, plus un liseré vif au ras
        // du sable. C'est le liseré qui donne la ligne, la nappe qui donne la
        // profondeur — une seule des deux ferait soit un trait, soit une tache.
        float sheet = 1.0 - smoothstep(0.10, 0.62, edge);
        float lip = 1.0 - smoothstep(0.0, 0.16, edge);
        float foam = clamp(sheet * 0.7 + lip * 0.6, 0.0, 1.0);

        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.96, 1.0), foam);
        diffuseColor.a = mix(diffuseColor.a, 0.95, foam);
      }`,
    )
  }

  return { material, uniforms }
}

/**
 * La mer d'un monde — celle du continent par défaut, celle de l'Outremonde sur
 * demande.
 *
 * Même prop et même raison que `Terrain` et `Vegetation` : la houle, l'écume et
 * la transparence sont les mêmes partout, seule la ligne de rivage change — et
 * elle est cuite depuis la forme, donc elle suit.
 */
export function Water({ shape = CONTINENT_SHAPE }: { shape?: WorldShape } = {}) {
  const { material, uniforms } = useMemo(() => createWaterMaterial(shape), [shape])
  const geometry = useMemo(
    () => new PlaneGeometry(shape.size, shape.size, SEGMENTS, SEGMENTS),
    [shape],
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
      position={[0, shape.waterLevel, 0]}
      // Pas d'ombre : une surface translucide qui projette une ombre opaque
      // trahit immédiatement le truc.
      renderOrder={1}
    />
  )
}
