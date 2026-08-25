import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { KeyboardControls, Loader } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { CameraRig } from './components/CameraRig'
import { Environment } from './components/Environment'
import { HUD } from './components/HUD'
import { Player } from './components/Player'
import { PostFX } from './components/PostFX'
import { controlMap } from './config/controls'
import { CAMERA, PLAYER } from './config/gameplay'

/** Ajouter `?debug` à l'URL pour visualiser les colliders Rapier. */
const DEBUG_PHYSICS =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')

export default function App() {
  return (
    <KeyboardControls map={controlMap}>
      <Canvas
        // "percentage" = PCFShadowMap ; PCFSoft est déprécié depuis three 0.185.
        shadows="percentage"
        // `far` doit dépasser la taille du dôme de <Sky> (scale 1000),
        // sinon le ciel est entièrement clippé par le frustum.
        camera={{ fov: CAMERA.fov, near: 0.1, far: 2000, position: CAMERA.offset }}
      >
        {/* Brume assortie au ciel : donne la profondeur et masque les bords de map. */}
        {/* La brume commence au-delà du joueur et sature avant le bord de la
            carte : elle masque les limites du terrain et donne la profondeur. */}
        <fog attach="fog" args={['#dbe8ec', 45, 145]} />

        <Suspense fallback={null}>
          <Physics gravity={[0, PLAYER.gravity, 0]} debug={DEBUG_PHYSICS}>
            <Environment />
            <Player />
          </Physics>
        </Suspense>

        <CameraRig />
        <PostFX />
      </Canvas>

      <HUD />
      <Loader />
    </KeyboardControls>
  )
}
