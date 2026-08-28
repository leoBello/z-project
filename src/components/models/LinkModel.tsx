import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Mesh, type Group } from 'three'
import { outfitOf, weaponOf } from '../../config/items'
import { useGameStore } from '../../store/useGameStore'
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
 * de HeroPlaceholder — animé, cel-shadé, et donc parfaitement présentable. Il
 * est le seul des deux à savoir porter les tenues et les armes de l'inventaire :
 * un `.glb` déposé ici ignorera l'équipement, faute d'une convention de nommage
 * de matériaux à laquelle se raccrocher.
 *
 * Convention du projet : **l'avant du modèle est +Z**. C'est ce qu'attend le
 * calcul de rotation de Player.tsx (`atan2(dir.x, dir.z)`). Si le .glb que tu
 * déposes regarde dans l'autre sens, ajoute `rotation-y={Math.PI}` sur le
 * `<primitive>` ci-dessus plutôt que de toucher à Player.tsx.
 */
export function LinkModel() {
  // Abonnements au store, et c'est sans danger : l'équipement ne change qu'à un
  // clic dans l'inventaire, jamais par frame. Le composant ne se re-rend donc
  // qu'à ces rares moments, et le rig d'animation, qui vit dans
  // `HeroPlaceholder`, n'est pas remonté pour autant — seules ses props
  // changent. Deux sélecteurs plutôt qu'un objet composé : un sélecteur qui
  // renvoie un objet frais à chaque appel re-rendrait à chaque notification du
  // store, quelle que soit la valeur.
  const outfit = useGameStore((state) => outfitOf(state.equipped))
  const weapon = useGameStore((state) => weaponOf(state.equipped))

  return (
    <SafeModel fallback={<HeroPlaceholder outfit={outfit} weapon={weapon} />}>
      <LinkGltf />
    </SafeModel>
  )
}
