import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Mesh, type Group } from 'three'
import { HeroPlaceholder } from './HeroPlaceholder'
import { SafeModel } from './SafeModel'

/** Déposer le fichier ici pour remplacer le personnage procédural. */
export const LINK_MODEL_URL = '/models/link.glb'

function LinkGltf() {
  const { scene } = useGLTF(LINK_MODEL_URL)

  // On clone : la scène renvoyée par useGLTF est mise en cache et partagée,
  // la monter telle quelle empêcherait toute réutilisation du modèle.
  const model = useMemo(() => {
    const clone = scene.clone(true) as Group
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = false
      }
    })
    return clone
  }, [scene])

  return <primitive object={model} />
}

/**
 * Modèle du joueur.
 *
 * Tant que `/models/link.glb` est absent, on affiche le personnage procédural
 * de HeroPlaceholder — animé, cel-shadé, et donc parfaitement présentable.
 *
 * Convention du projet : **l'avant du modèle est +Z**. C'est ce qu'attend le
 * calcul de rotation de Player.tsx (`atan2(dir.x, dir.z)`). Si le .glb que tu
 * déposes regarde dans l'autre sens, ajoute `rotation-y={Math.PI}` sur le
 * `<primitive>` ci-dessus plutôt que de toucher à Player.tsx.
 */
export function LinkModel() {
  return (
    <SafeModel fallback={<HeroPlaceholder />}>
      <LinkGltf />
    </SafeModel>
  )
}
