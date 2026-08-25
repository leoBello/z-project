import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { CAMERA } from '../config/gameplay'
import { playerTransform } from '../state/playerTransform'

/** Position de la caméra relative au joueur, en coordonnées monde. */
const OFFSET = new Vector3(...CAMERA.offset)
const desiredPosition = new Vector3()
const desiredTarget = new Vector3()

/**
 * Caméra troisième personne.
 *
 * Elle garde une orientation monde fixe (vue 3/4 façon Zelda) et se contente de
 * suivre le joueur avec un lissage exponentiel. Le lissage utilise
 * `1 - exp(-lambda * dt)` plutôt qu'un lerp à coefficient constant : le
 * résultat est identique quel que soit le framerate.
 */
export function CameraRig() {
  const camera = useThree((state) => state.camera)
  /** Point visé, lissé lui aussi pour éviter les à-coups de rotation. */
  const lookAt = useRef(new Vector3())

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const t = 1 - Math.exp(-CAMERA.damping * delta)

    desiredPosition.copy(playerTransform.position).add(OFFSET)
    camera.position.lerp(desiredPosition, t)

    desiredTarget.copy(playerTransform.position)
    desiredTarget.y += CAMERA.lookAtHeight
    lookAt.current.lerp(desiredTarget, t)
    camera.lookAt(lookAt.current)
  })

  return null
}
