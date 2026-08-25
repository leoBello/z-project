import { Bloom, EffectComposer, TiltShift2, Vignette } from '@react-three/postprocessing'

/**
 * Chaîne de post-traitement.
 *
 * C'est ici que se joue l'essentiel de l'effet "maquette" : le tilt-shift
 * garde une bande nette au centre et floute le haut et le bas de l'image, ce
 * que le cerveau interprète comme une macro sur un objet miniature. Combiné au
 * FOV réduit de la caméra, c'est la recette du HD-2D — sans les sprites.
 *
 * Choix des effets contraints par la cible : le web tourne souvent sur GPU
 * intégré. Bloom + tilt-shift + vignette restent bon marché ; l'occlusion
 * ambiante, la profondeur de champ réelle et les réflexions ont été écartées,
 * elles feraient s'effondrer le framerate pour un gain marginal à ce style.
 */
export function PostFX() {
  return (
    <EffectComposer enableNormalPass={false} multisampling={4}>
      {/* Seuil haut : seuls le ciel et les surfaces éclairées "débordent",
          la végétation à l'ombre reste franche. */}
      <Bloom
        intensity={0.45}
        luminanceThreshold={0.82}
        luminanceSmoothing={0.3}
        mipmapBlur
      />
      <TiltShift2 blur={0.18} taper={0.55} />
      <Vignette offset={0.32} darkness={0.5} />
    </EffectComposer>
  )
}
