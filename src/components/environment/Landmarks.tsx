import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import type { Control } from '../../config/controls'
import { LANDMARKS } from '../../config/landmarks'
import { playerTransform } from '../../state/playerTransform'
import { useGameStore } from '../../store/useGameStore'
import type { LandmarkId } from '../../types/game'
import { Temple } from './Temple'

/**
 * Découverte et mise à portée des points d'intérêt.
 *
 * Le test tourne à chaque frame mais ne touche au store **que sur transition** :
 * `getState()` évite l'abonnement, donc ce composant ne se re-rend jamais. Sans
 * ce soin, on re-rendrait le HUD soixante fois par seconde pour réafficher la
 * même invite.
 */
function LandmarkProximity() {
  useFrame(() => {
    const store = useGameStore.getState()
    const { position } = playerTransform

    let nearest: LandmarkId | null = null
    let nearestDistance = Infinity

    for (const landmark of LANDMARKS) {
      // Distance au sol : on peut découvrir le temple sans être à son altitude,
      // sinon le lieu ne se déclencherait qu'une fois l'escalier gravi.
      const distance = Math.hypot(position.x - landmark.x, position.z - landmark.z)

      if (distance < landmark.discoverRadius && !store.discovered.includes(landmark.id)) {
        store.discoverLandmark(landmark.id)
      }
      // L'interaction se mesure sur son **ancre** et non sur le centre du
      // monument : c'est le marqueur lumineux qui promet quelque chose au
      // joueur, donc c'est autour de lui que la promesse doit être tenue.
      const toAnchor = Math.hypot(
        position.x - landmark.interact.x,
        position.z - landmark.interact.z,
      )
      if (toAnchor < landmark.interactRadius && toAnchor < nearestDistance) {
        nearest = landmark.id
        nearestDistance = toAnchor
      }
    }

    if (nearest !== store.nearbyLandmark) store.setNearbyLandmark(nearest)
  })

  return null
}

/** Ouverture et fermeture du panneau d'un lieu, à la touche d'interaction. */
function LandmarkInteraction() {
  const [subscribeKeys] = useKeyboardControls<Control>()

  useEffect(
    () =>
      subscribeKeys(
        (state) => state.interact,
        (pressed) => {
          if (!pressed) return
          // Abonnement et non sondage dans `useFrame` : un appui plus court
          // qu'une frame serait perdu. C'est le piège déjà payé sur le saut et
          // sur l'attaque, et il ne coûte rien de ne pas le repayer.
          const store = useGameStore.getState()
          if (store.phase === 'playing' && store.nearbyLandmark) {
            store.openLandmark(store.nearbyLandmark)
          } else if (store.phase === 'paused') {
            store.closeLandmark()
          }
        },
      ),
    [subscribeKeys],
  )

  return null
}

/** Tous les monuments de la carte, plus leur logique de proximité. */
export function Landmarks() {
  return (
    <>
      <Temple />
      <LandmarkProximity />
      <LandmarkInteraction />
    </>
  )
}
