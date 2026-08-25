import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Mesh, type Group } from 'three'
import { SafeModel } from './SafeModel'

/** Déposer le fichier ici pour remplacer le placeholder. */
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

/** Silhouette de remplacement : tunique verte, tête, bonnet, épée. */
function LinkPlaceholder() {
  return (
    <group>
      {/* corps */}
      <mesh castShadow position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.32, 0.5, 6, 16]} />
        <meshStandardMaterial color="#3f9d4a" />
      </mesh>
      {/* tête */}
      <mesh castShadow position={[0, 1.18, 0]}>
        <sphereGeometry args={[0.26, 20, 20]} />
        <meshStandardMaterial color="#f2c9a0" />
      </mesh>
      {/* bonnet pointu, incliné vers l'arrière (l'avant du modèle est +Z) */}
      <mesh castShadow position={[0, 1.5, -0.06]} rotation={[-0.35, 0, 0]}>
        <coneGeometry args={[0.26, 0.5, 16]} />
        <meshStandardMaterial color="#2f8039" />
      </mesh>
      {/* épée tenue sur le côté droit */}
      <mesh castShadow position={[-0.36, 0.7, 0.05]} rotation={[-0.2, 0, 0.25]}>
        <boxGeometry args={[0.07, 0.8, 0.07]} />
        <meshStandardMaterial color="#d6e3ef" metalness={0.4} roughness={0.3} />
      </mesh>
    </group>
  )
}

/**
 * Modèle du joueur.
 *
 * Convention du projet : **l'avant du modèle est +Z**. C'est ce qu'attend le
 * calcul de rotation de Player.tsx (`atan2(dir.x, dir.z)`). Si le .glb que tu
 * déposes regarde dans l'autre sens, ajoute `rotation-y={Math.PI}` sur le
 * `<primitive>` ci-dessus plutôt que de toucher à Player.tsx.
 */
export function LinkModel() {
  return (
    <SafeModel fallback={<LinkPlaceholder />}>
      <LinkGltf />
    </SafeModel>
  )
}
