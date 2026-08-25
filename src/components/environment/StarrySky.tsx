import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, Color, ShaderMaterial, SphereGeometry, Vector3, type Mesh } from 'three'

/**
 * Rayon du dôme. Doit rester à l'intérieur du `far` de la caméra (2000), sinon
 * le ciel est clippé par le frustum — le piège déjà rencontré avec `<Sky>`.
 */
const RADIUS = 900

/**
 * Palette, dominante bleue.
 *
 * Le violet n'apparaît qu'en nébuleuse : une dominante magenta transforme le
 * ciel en aplat rose dès qu'on n'en voit qu'une bande au-dessus de l'horizon,
 * ce qui est exactement le cadrage du jeu.
 *
 * `horizon` et `glow` sont volontairement **clairs**. C'est la contrainte la
 * plus importante du fichier : la brume du terrain (`fog` dans App.tsx) forme
 * une bande lumineuse sur la ligne d'horizon, et si le ciel y est sombre,
 * l'image se coupe nettement en deux. Les deux couleurs doivent se rejoindre.
 */
const SKY = {
  zenith: '#050a2e',
  upper: '#0d1a5c',
  middle: '#1d2e7d',
  horizon: '#4a5fa8',
  glow: '#6a7cbd',
  milkyCore: '#eef2ff',
  milkyEdge: '#6d95e8',
  nebulaIndigo: '#5f46c8',
  nebulaBlue: '#2a55d8',
} as const

/**
 * Orientation de la Voie lactée.
 *
 * La caméra du jeu regarde toujours vers -Z : la bande et son bulbe sont donc
 * placés dans ce demi-espace, sinon ils restent dans le dos du joueur.
 * `BAND_AXIS` est l'axe **perpendiculaire** au ruban ; `CORE_DIRECTION` est
 * choisi sur le ruban (produit scalaire nul avec l'axe) et à quelques degrés
 * au-dessus de l'horizon, donc dans le cadre.
 */
const BAND_AXIS = new Vector3(0.84, -0.52, -0.15).normalize()
const CORE_DIRECTION = new Vector3(-0.118, 0.094, -0.988).normalize()

const vertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    // Le dôme est recentré sur la caméra à chaque frame : la position locale
    // du sommet est donc exactement la direction de visée, sans parallaxe.
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vDirection;

  uniform float uTime;
  uniform vec3 uZenith;
  uniform vec3 uUpper;
  uniform vec3 uMiddle;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uMilkyCore;
  uniform vec3 uMilkyEdge;
  uniform vec3 uNebulaIndigo;
  uniform vec3 uNebulaBlue;
  uniform vec3 uBandAxis;
  uniform vec3 uCoreDir;

  // --- Bruit -----------------------------------------------------------------

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }

  float fbm3(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise3(p);
      p *= 2.07;
      amplitude *= 0.5;
    }
    return value;
  }

  /**
   * Champ d'étoiles : l'espace est découpé en cellules cubiques, chacune tire
   * au hasard le droit d'héberger une étoile, sa position et sa teinte.
   * Bien plus économique qu'une texture, et sans répétition visible.
   */
  vec3 starLayer(vec3 dir, float scale, float density, float angularSize, float twinkle) {
    vec3 p = dir * scale;
    vec3 cell = floor(p);
    vec3 local = fract(p) - 0.5;

    float seed = hash31(cell);
    if (seed > density) return vec3(0.0);

    vec3 offset = vec3(
      hash31(cell + 11.0),
      hash31(cell + 23.0),
      hash31(cell + 37.0)
    ) - 0.5;

    float d = length(local - offset * 0.75);

    // Le rayon est donné en **radians** puis converti en unités de cellule.
    // Exprimé directement en unités de cellule, il donnait des étoiles de
    // moins d'un pixel : le ciel paraissait vide malgré des milliers d'étoiles.
    float size = angularSize * scale;

    float brightness = smoothstep(size, 0.0, d);
    brightness = pow(brightness, 1.6);
    // Halo doux : sans lui les étoiles sont des points durs qui aliassent.
    brightness += 0.18 * smoothstep(size * 3.0, 0.0, d);

    // Scintillement : chaque étoile a sa propre phase, sinon elles clignotent
    // toutes ensemble et l'effet devient un stroboscope.
    brightness *= 1.0 - twinkle + twinkle * (0.5 + 0.5 * sin(uTime * 1.6 + seed * 63.0));

    // Teinte : la plupart blanc-bleu, quelques-unes ambrées. Un champ
    // monochrome se lit immédiatement comme du bruit plutôt que comme un ciel.
    float tint = hash31(cell + 53.0);
    vec3 color = mix(vec3(0.74, 0.84, 1.0), vec3(1.0, 0.9, 0.76), smoothstep(0.76, 1.0, tint));
    return color * brightness;
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float height = dir.y;

    // --- Dégradé vertical ----------------------------------------------------
    // Les paliers sont volontairement **étalés** : la bande de ciel réellement
    // visible dans le jeu ne fait que 7°, et une transition rapide s'y lirait
    // comme une frontière nette au lieu d'un dégradé.
    vec3 sky = mix(uHorizon, uMiddle, smoothstep(-0.02, 0.30, height));
    sky = mix(sky, uUpper, smoothstep(0.24, 0.58, height));
    sky = mix(sky, uZenith, smoothstep(0.52, 0.95, height));

    // Halo atmosphérique : bleu, large et doux. C'est lui qui raccorde le ciel
    // à la brume du terrain — les deux couleurs sont accordées à la main.
    float haze = exp(-max(height, 0.0) * 5.0);
    sky = mix(sky, uGlow, haze * 0.55);

    // --- Nébuleuses ----------------------------------------------------------
    float nebulaA = fbm3(dir * 1.6 + 4.0);
    float nebulaB = fbm3(dir * 1.1 - 7.0);
    sky += uNebulaIndigo * smoothstep(0.55, 0.98, nebulaA) * 0.16;
    sky += uNebulaBlue * smoothstep(0.48, 0.95, nebulaB) * 0.30;

    // --- Voie lactée ---------------------------------------------------------
    // La bande est l'ensemble des directions perpendiculaires à un axe : la
    // gaussienne sur ce produit scalaire donne un ruban qui traverse le ciel.
    float band = dot(dir, uBandAxis);
    float ribbon = exp(-(band * band) / (2.0 * 0.23 * 0.23));

    float dust = fbm3(dir * 2.4 + 13.0);
    float grain = fbm3(dir * 8.0 - 5.0);
    float density = ribbon * smoothstep(0.28, 0.86, dust * 0.7 + grain * 0.45);

    // Voies sombres : sans elles la bande ressemble à une simple traînée floue.
    float lanes = smoothstep(0.34, 0.60, fbm3(dir * 4.4 + 21.0));
    density *= mix(1.0, 0.22, lanes * ribbon);

    // Le voile est discret : ce sont les étoiles, plus bas, qui portent la
    // Voie lactée. Trop de voile et elle se lit comme un nuage blanc.
    vec3 milky = mix(uMilkyEdge, uMilkyCore, smoothstep(0.10, 0.70, density));
    sky += milky * density * 0.42;

    // Bulbe galactique : une lueur chaude et large sur la bande, qui donne un
    // point d'accroche au regard au lieu d'un ruban uniforme.
    float coreAngle = acos(clamp(dot(dir, uCoreDir), -1.0, 1.0));
    float coreGlow = exp(-(coreAngle * coreAngle) / (2.0 * 0.34 * 0.34)) * ribbon;
    sky += vec3(1.0, 0.87, 0.7) * coreGlow * 0.26;

    // --- Étoiles -------------------------------------------------------------
    // La densité est modulée par un bruit très basse fréquence : le ciel a des
    // régions riches et des régions vides, au lieu d'un semis uniforme.
    float clustering = 0.5 + 1.1 * fbm3(dir * 1.25 + 31.0);
    float boost = clustering * (1.0 + ribbon * 4.5 + coreGlow * 3.0);

    // Tailles en radians : ~0.0042 rad ≈ 3,5 px de rayon à 720 p et FOV 48.
    vec3 stars = vec3(0.0);
    stars += starLayer(dir, 34.0, 0.055 * boost, 0.0042, 0.45) * 1.45;
    stars += starLayer(dir, 80.0, 0.10 * boost, 0.0026, 0.30) * 0.95;
    stars += starLayer(dir, 170.0, 0.16 * boost, 0.0016, 0.15) * 0.60;
    stars += starLayer(dir, 330.0, 0.20 * boost * ribbon, 0.0011, 0.0) * 0.45;

    // Extinction atmosphérique : les étoiles s'estompent progressivement en
    // approchant de l'horizon, sur une quinzaine de degrés. Une coupure courte
    // donnait une image tranchée en deux — étoilée en haut, vide en bas.
    stars *= smoothstep(-0.05, 0.26, height);
    sky += stars;

    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * Ciel étoilé procédural.
 *
 * Tout est calculé dans le fragment shader — dégradé, halo d'horizon,
 * nébuleuses, Voie lactée, bulbe galactique et quatre couches d'étoiles.
 * Aucune texture à charger, aucune répétition visible, palette réglable par
 * uniforms.
 *
 * Le dôme suit la caméra : sans ça, se déplacer de cent unités ferait glisser
 * la Voie lactée dans le ciel.
 */
export function StarrySky() {
  const mesh = useRef<Mesh>(null)
  const camera = useThree((state) => state.camera)

  const geometry = useMemo(() => new SphereGeometry(RADIUS, 48, 32), [])

  const material = useMemo(() => {
    const uniforms = {
      uTime: { value: 0 },
      uZenith: { value: new Color(SKY.zenith) },
      uUpper: { value: new Color(SKY.upper) },
      uMiddle: { value: new Color(SKY.middle) },
      uHorizon: { value: new Color(SKY.horizon) },
      uGlow: { value: new Color(SKY.glow) },
      uMilkyCore: { value: new Color(SKY.milkyCore) },
      uMilkyEdge: { value: new Color(SKY.milkyEdge) },
      uNebulaIndigo: { value: new Color(SKY.nebulaIndigo) },
      uNebulaBlue: { value: new Color(SKY.nebulaBlue) },
      // Vector3 et non Color : `Color` passe par la gestion d'espace
      // colorimétrique de three et n'accepte pas de composante négative.
      uBandAxis: { value: BAND_AXIS.clone() },
      uCoreDir: { value: CORE_DIRECTION.clone() },
    }

    return new ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      // Vu de l'intérieur, et le ciel ne doit jamais masquer la géométrie.
      side: BackSide,
      depthWrite: false,
      fog: false,
    })
  }, [])

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    mesh.current?.position.copy(camera.position)
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      // Dessiné en premier : tout le reste de la scène passe par-dessus.
      renderOrder={-1000}
      frustumCulled={false}
    />
  )
}
