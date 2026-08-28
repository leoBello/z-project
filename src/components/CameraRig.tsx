import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { CAMERA } from '../config/gameplay'
import { useIsTouchDevice } from '../config/device'
import { cameraView } from '../state/cameraView'
import { playerTransform } from '../state/playerTransform'
import { sampleShake } from '../state/cameraShake'

/** Position de la caméra relative au joueur, en coordonnées monde. */
const OFFSET = new Vector3(...CAMERA.offset)
const desiredPosition = new Vector3()
const desiredTarget = new Vector3()
const shakeOffset = new Vector3()

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
  const isTouch = useIsTouchDevice()
  /** Point visé, lissé lui aussi pour éviter les à-coups de rotation. */
  const lookAt = useRef(new Vector3())
  /** Position lissée, **sans** la secousse. Voir plus bas. */
  const smoothed = useRef(new Vector3())
  const started = useRef(false)

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const t = 1 - Math.exp(-CAMERA.damping * delta)

    // Premier passage : la caméra est là où la prop `position` du Canvas l'a
    // posée. Lerper depuis un vecteur nul la ferait plonger depuis l'origine.
    if (!started.current) {
      smoothed.current.copy(camera.position)
      started.current = true
    }

    desiredPosition.copy(playerTransform.position).add(OFFSET)
    // Le lissage travaille sur une position **non secouée**, et la secousse
    // n'est ajoutée qu'ensuite. Lerper depuis la position secouée reviendrait à
    // poursuivre le tremblement : le lissage l'absorberait en partie et en
    // laisserait le reste comme une dérive résiduelle.
    smoothed.current.lerp(desiredPosition, t)
    camera.position.copy(smoothed.current)

    desiredTarget.copy(playerTransform.position)
    // Sur mobile, on vise plus bas : le joueur remonte au centre, au-dessus des
    // contrôles tactiles. Le rig lerpe déjà `desiredTarget` chaque frame, donc
    // le changement de valeur s'applique en douceur, sans transition à coder.
    desiredTarget.y += isTouch ? CAMERA.lookAtHeightMobile : CAMERA.lookAtHeight
    lookAt.current.lerp(desiredTarget, t)
    // Visée calculée depuis la position non secouée : la caméra tremble en
    // translation sans se réorienter, et c'est le monde qui bouge à l'écran.
    camera.lookAt(lookAt.current)

    sampleShake(shakeOffset)
    camera.position.add(shakeOffset)

    // Publication de la caméra pour le calque de combat 2D.
    //
    // `lookAt` ne met à jour que le quaternion : sans `updateMatrixWorld`, la
    // matrice monde reste celle de la frame précédente et les barres de vie
    // traînent visiblement derrière les ennemis pendant les déplacements.
    //
    // La secousse est ajoutée **avant** cet appel, et ce n'est pas indifférent :
    // publiée sans elle, `cameraView` garderait la position non secouée et les
    // barres de vie se décrocheraient des ennemis pendant toute la secousse.
    camera.updateMatrixWorld()
    cameraView.viewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    )
    cameraView.position.copy(camera.position)
    cameraView.ready = true
  })

  return null
}
