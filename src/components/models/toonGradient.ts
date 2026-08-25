import { DataTexture, NearestFilter, RedFormat } from 'three'

/**
 * Rampe de dégradé pour `meshToonMaterial`.
 *
 * Le cel-shading de three.js fonctionne en remplaçant le dégradé lumineux
 * continu par une texture 1D échantillonnée en `NearestFilter` : chaque texel
 * devient une bande d'ombre franche. 3 texels = 3 niveaux (ombre / demi-ton /
 * lumière), ce qui correspond au rendu Wind Waker.
 *
 * La texture est créée une seule fois et partagée par tous les matériaux.
 */
function createToonGradient(steps: readonly number[]) {
  const texture = new DataTexture(
    new Uint8Array(steps),
    steps.length,
    1,
    RedFormat,
  )
  // Sans NearestFilter, le GPU interpole entre les bandes et on retrouve un
  // dégradé lisse — donc plus aucun effet cel-shading.
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

/** 3 bandes : le rendu "cartoon" classique. */
export const toonGradient = createToonGradient([80, 170, 255])
