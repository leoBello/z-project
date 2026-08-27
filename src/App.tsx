import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { KeyboardControls } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { CameraRig } from './components/CameraRig'
import { CombatOverlay } from './components/CombatOverlay'
import { Enemies } from './components/Enemies'
import { Environment } from './components/Environment'
import { GameClock } from './components/GameClock'
import { HUD } from './components/HUD'
import { LanguageToggle } from './components/LanguageToggle'
import { Minimap } from './components/Minimap'
import { Pickups } from './components/Pickups'
import { Player } from './components/Player'
import { Projectiles } from './components/Projectiles'
import { PostFX } from './components/PostFX'
import { PortfolioDialog } from './components/portfolio/PortfolioDialog'
import { SwordArc } from './components/SwordArc'
import { BootScreen } from './components/BootScreen'
import { TeleportMenu } from './components/TeleportMenu'
import { TeleportOverlay } from './components/TeleportOverlay'
import { controlMap } from './config/controls'
import { CAMERA, PLAYER } from './config/gameplay'
import { useGameStore } from './store/useGameStore'

/** Ajouter `?debug` à l'URL pour visualiser les colliders Rapier. */
const DEBUG_PHYSICS =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')

export default function App() {
  /**
   * Identifiant de partie utilisé comme `key` React : le changer démonte et
   * remonte joueur et ennemis, ce qui remet positions, points de vie et
   * machines à états à zéro sans logique de réinitialisation à écrire.
   */
  const runId = useGameStore((state) => state.runId)
  /**
   * Lu par abonnement, et c'est sans danger : la phase ne change qu'à une
   * transition (pause, Game Over), jamais par frame. Le composant ne se
   * re-rend donc que dans ces rares moments.
   */
  const phase = useGameStore((state) => state.phase)

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
        {/*
          La couleur de brume est accordée à celle du ciel juste au-dessus de
          l'horizon (mélange de `horizon` et `glow` dans StarrySky). Sans cet
          accord, le terrain lointain s'estompe vers une teinte différente de
          celle du ciel et l'image se coupe en deux sur la ligne d'horizon.
        */}
        <fog attach="fog" args={['#6b7cba', 60, 200]} />

        {/* Avant <Physics> et avec une priorité de useFrame négative : tout ce
            qui lit un délai de gameplay doit trouver l'horloge déjà avancée. */}
        <GameClock />

        <Suspense fallback={null}>
          <Physics
            gravity={[0, PLAYER.gravity, 0]}
            paused={phase !== 'playing'}
            debug={DEBUG_PHYSICS}
          >
            <Environment />
            <Player key={`player-${runId}`} />
            <Enemies key={`enemies-${runId}`} />
            <Projectiles />
            <Pickups />
          </Physics>

          {/* Hors de <Physics> : la traînée de lame n'est qu'un effet visuel,
              elle n'a ni collider ni corps à simuler. */}
          <SwordArc />
        </Suspense>

        <CameraRig />
        <PostFX />
      </Canvas>

      {/* Le calque de combat est posé avant le HUD : les barres de vie et les
          indicateurs de menace appartiennent à la scène, les cœurs et le menu
          de Game Over passent devant. */}
      <CombatOverlay />
      <Minimap />
      <HUD />
      <LanguageToggle />
      {/* Le panneau passe devant tout le HUD, invite d'interaction comprise. */}
      <PortfolioDialog />
      <TeleportMenu />
      <TeleportOverlay />
      <BootScreen />
    </KeyboardControls>
  )
}
