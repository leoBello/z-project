import { useFrame } from '@react-three/fiber'
import { LANDMARKS } from '../../config/landmarks'
import { playerTransform } from '../../state/playerTransform'
import { useGameStore } from '../../store/useGameStore'
import { Temple } from './Temple'

/**
 * Découverte des points d'intérêt.
 *
 * Le test tourne à chaque frame mais ne touche au store que sur la transition :
 * `getState()` évite l'abonnement, donc ce composant ne se re-rend jamais, et
 * `discoverLandmark` est idempotent côté store. C'est la même règle que partout
 * ailleurs — rien de réactif à 60 fps.
 */
function LandmarkDiscovery() {
  useFrame(() => {
    const { discovered, discoverLandmark } = useGameStore.getState()
    const { position } = playerTransform

    for (const landmark of LANDMARKS) {
      if (discovered.includes(landmark.id)) continue
      // Distance au sol : on peut découvrir le temple sans être à son altitude,
      // sinon le lieu ne se déclencherait qu'une fois l'escalier gravi.
      const distance = Math.hypot(position.x - landmark.x, position.z - landmark.z)
      if (distance < landmark.discoverRadius) discoverLandmark(landmark.id)
    }
  })

  return null
}

/** Tous les monuments de la carte, plus leur détection de découverte. */
export function Landmarks() {
  return (
    <>
      <Temple />
      <LandmarkDiscovery />
    </>
  )
}
