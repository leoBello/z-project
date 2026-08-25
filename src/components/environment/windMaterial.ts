import { Color, MeshToonMaterial } from 'three'
import { toonGradient } from '../models/toonGradient'

/**
 * Matériau toon avec balancement de vent, injecté dans le vertex shader.
 *
 * Pourquoi un shader plutôt qu'une animation CPU : la végétation est rendue en
 * `InstancedMesh` (des centaines d'objets, un seul draw call). Animer chaque
 * instance côté CPU annulerait tout le bénéfice de l'instanciation — il
 * faudrait réécrire la matrice de chaque instance à chaque frame. Le GPU le
 * fait gratuitement, en parallèle, pour toutes les instances à la fois.
 *
 * Limite connue : le rendu des ombres utilise un *depth material* distinct qui
 * ne reçoit pas ce patch, donc l'ombre portée ne se balance pas. Invisible aux
 * amplitudes utilisées ici, et le corriger coûterait un second matériau patché.
 */

interface WindUniforms {
  uTime: { value: number }
  uWindStrength: { value: number }
  uHeight: { value: number }
}

/** Tous les matériaux vent actifs, avancés d'un coup par <WindClock />. */
const registry = new Set<WindUniforms>()

export interface WindMaterialOptions {
  color: string
  /** Amplitude du balancement en sommet d'objet, en unités monde. */
  strength?: number
  /** Hauteur locale de l'objet : sert à répartir la flexion de la base au sommet. */
  height?: number
}

export function createWindMaterial({
  color,
  strength = 0.08,
  height = 1,
}: WindMaterialOptions) {
  const material = new MeshToonMaterial({
    color: new Color(color),
    gradientMap: toonGradient,
  })

  const uniforms: WindUniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: strength },
    uHeight: { value: height },
  }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uWindStrength = uniforms.uWindStrength
    shader.uniforms.uHeight = uniforms.uHeight

    shader.vertexShader = shader.vertexShader.replace(
      'void main() {',
      /* glsl */ `
      uniform float uTime;
      uniform float uWindStrength;
      uniform float uHeight;
      void main() {`,
    )

    // `begin_vertex` déclare `transformed` (la position locale du sommet).
    // On la décale AVANT `project_vertex`, donc la matrice d'instance
    // s'applique ensuite normalement : le patch marche identiquement sur un
    // mesh simple et sur un InstancedMesh.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      {
        // La flexion croît avec la hauteur locale, au carré : le pied reste
        // planté dans le sol et seule la cime bouge vraiment.
        float flex = clamp(transformed.y / uHeight, 0.0, 1.0);
        flex *= flex;

        // Position monde, pour que deux objets voisins ne se balancent pas en
        // phase — sans ça toute la prairie ondule comme un seul bloc.
        vec4 windWorld = modelMatrix * vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          windWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #endif
        float phase = windWorld.x * 0.18 + windWorld.z * 0.24;

        // Deux sinusoïdes non harmoniques : la somme ne se répète pas de façon
        // audible à l'œil, contrairement à une seule.
        float gust = sin(uTime * 1.1 + phase) * 0.7
                   + sin(uTime * 2.7 + phase * 1.9) * 0.3;

        transformed.x += gust * flex * uWindStrength;
        transformed.z += gust * flex * uWindStrength * 0.6;
      }`,
    )
  }

  registry.add(uniforms)
  return material
}

/** Avance l'horloge de tous les matériaux vent. Appelé une fois par frame. */
export function tickWind(elapsed: number) {
  for (const uniforms of registry) uniforms.uTime.value = elapsed
}
