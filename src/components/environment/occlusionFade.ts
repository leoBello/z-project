import { Vector3 } from 'three'
import type { Material } from 'three'
import { cameraView } from '../../state/cameraView'
import { playerTransform } from '../../state/playerTransform'

/**
 * Effacement des props qui passent entre la caméra et le joueur.
 *
 * En jungle, la canopée traverse régulièrement l'axe de visée et cache le
 * personnage. Le remède retenu est un **fondu par tramage** (*screen-door*)
 * dans le fragment shader : on ne baisse pas l'opacité du matériau, on jette un
 * pixel sur N. Deux raisons de préférer ça à de la vraie transparence :
 *
 *  - la végétation est instanciée — passer un `InstancedMesh` en `transparent`
 *    obligerait le renderer à trier des milliers d'instances entre elles, ce
 *    qu'il ne sait pas faire, et la canopée se mettrait à clignoter selon
 *    l'ordre de rendu ;
 *  - le matériau reste opaque, donc il continue d'écrire dans le tampon de
 *    profondeur et de se trier normalement vis-à-vis du reste de la scène.
 *
 * Le test est purement géométrique : un fragment est masqué s'il tombe dans le
 * **cône** qui joint l'œil au joueur. Le rayon du cône croît avec la distance à
 * l'œil (`t / len`), ce qui revient à découper un disque de taille constante
 * *à l'écran* — sans avoir à projeter quoi que ce soit.
 *
 * Limite connue, de la même famille que celle du vent : la passe d'ombres
 * utilise un matériau de profondeur distinct qui ne reçoit pas ce patch. Un
 * arbre effacé projette donc toujours son ombre. C'est voulu : c'est l'ombre
 * qui dit au joueur que l'arbre est encore là.
 */

/** Rayon du cône **au niveau du joueur**, en unités monde. */
const RADIUS = 1.6
/** Opacité résiduelle d'un prop entièrement masqué : il reste devinable. */
const MIN_ALPHA = 0.12

interface FadeUniforms {
  uOccEye: { value: Vector3 }
  uOccTarget: { value: Vector3 }
  uOccRadius: { value: number }
  uOccMinAlpha: { value: number }
}

/**
 * Uniforms **partagés** par tous les matériaux patchés.
 *
 * Un seul objet par uniform, référencé par chaque `shader.uniforms` : mettre à
 * jour l'œil et la cible une fois par frame suffit pour toutes les familles de
 * props, sans avoir à tenir un registre comme le fait le vent (qui, lui, a une
 * amplitude différente par famille).
 */
const uniforms: FadeUniforms = {
  uOccEye: { value: new Vector3() },
  uOccTarget: { value: new Vector3() },
  uOccRadius: { value: RADIUS },
  uOccMinAlpha: { value: MIN_ALPHA },
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vOccWorld;
void main() {`

// `transformed` a déjà subi le déplacement du vent quand on arrive ici : on
// s'insère avant `project_vertex`, donc après `begin_vertex`. La position monde
// est recomposée à la main plutôt que lue dans `worldPosition`, qui n'est
// déclarée que sous certains defines (ombres, env map) absents ici.
const VERTEX_BODY = /* glsl */ `
{
  vec4 occWorld = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    occWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  vOccWorld = occWorld.xyz;
}
#include <project_vertex>`

const FRAGMENT_HEAD = /* glsl */ `
uniform vec3 uOccEye;
uniform vec3 uOccTarget;
uniform float uOccRadius;
uniform float uOccMinAlpha;
varying vec3 vOccWorld;

// Bruit à gradient entrelacé (Jimenez) : un seuil par pixel, stable d'une
// frame à l'autre et bien réparti. Une matrice de Bayer donnerait un motif plus
// régulier, mais demanderait une indexation de tableau que GLSL ES 1.0
// n'autorise pas partout.
float occDither(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  {
    vec3 axis = uOccTarget - uOccEye;
    float len = max(length(axis), 0.0001);
    vec3 dir = axis / len;
    float t = dot(vOccWorld - uOccEye, dir);

    // Rien devant l'œil, et rien au-delà du joueur : un arbre situé derrière
    // lui ne le cache pas, l'effacer serait un artefact.
    float depthMask = smoothstep(0.0, 1.0, t) * (1.0 - smoothstep(len - 1.2, len - 0.2, t));

    // Distance à l'axe de visée, comparée au rayon du cône à cette profondeur.
    float perp = length((vOccWorld - uOccEye) - dir * t);
    float radius = uOccRadius * clamp(t / len, 0.0, 1.0);
    float inside = 1.0 - smoothstep(radius * 0.55, radius, perp);

    float alpha = mix(1.0, uOccMinAlpha, inside * depthMask);
    if (alpha < occDither(gl_FragCoord.xy)) discard;
  }`

/**
 * Ajoute le fondu par tramage à un matériau existant.
 *
 * Le `onBeforeCompile` déjà posé (celui du vent) est **chaîné**, pas écrasé :
 * les deux patches touchent des points d'insertion différents et cohabitent.
 */
export function withOcclusionFade<T extends Material>(material: T): T {
  const previous = material.onBeforeCompile.bind(material)

  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer)

    shader.uniforms.uOccEye = uniforms.uOccEye
    shader.uniforms.uOccTarget = uniforms.uOccTarget
    shader.uniforms.uOccRadius = uniforms.uOccRadius
    shader.uniforms.uOccMinAlpha = uniforms.uOccMinAlpha

    shader.vertexShader = shader.vertexShader.replace('void main() {', VERTEX_HEAD)
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', VERTEX_BODY)
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', FRAGMENT_HEAD)
  }

  return material
}

/** Hauteur visée sur le joueur : le torse, pas les pieds ni le sommet du crâne. */
const TARGET_LIFT = 0.35

/** Recale le cône sur la paire œil / joueur. Appelé une fois par frame. */
export function tickOcclusionFade() {
  if (!cameraView.ready) return
  uniforms.uOccEye.value.copy(cameraView.position)
  uniforms.uOccTarget.value.copy(playerTransform.position)
  uniforms.uOccTarget.value.y += TARGET_LIFT
}

// Exposé en développement : le fondu ne se laisse pas juger à l'œil sur une
// capture (il faut qu'un arbre soit *exactement* dans l'axe au moment du
// déclenchement). Pouvoir forcer `uOccMinAlpha` à 1 permet de rendre deux fois
// le même point de vue, avec et sans effacement, et de *mesurer* l'écart.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__occlusionFade = uniforms
}
