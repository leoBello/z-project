import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { KeyboardControls } from '@react-three/drei'
import { CameraRig } from './components/CameraRig'
import { CombatOverlay } from './components/CombatOverlay'
import { DeathPuffs } from './components/DeathPuffs'
import { Enemies } from './components/Enemies'
import { Environment } from './components/Environment'
import { GameClock } from './components/GameClock'
import { HUD } from './components/HUD'
import { LanguageToggle } from './components/LanguageToggle'
import { Minimap } from './components/Minimap'
import { PhysicsGate } from './components/PhysicsGate'
import { Pickups } from './components/Pickups'
import { Player } from './components/Player'
import { Projectiles } from './components/Projectiles'
import { OutfitSmoke } from './components/OutfitSmoke'
import { PostFX } from './components/PostFX'
import { QualityToggle } from './components/QualityToggle'
import { SoundToggle } from './components/SoundToggle'
import { ChestReveal } from './components/inventory/ChestReveal'
import { InventoryButton } from './components/inventory/InventoryButton'
import { InventoryPanel } from './components/inventory/InventoryPanel'
import { PortfolioDialog } from './components/portfolio/PortfolioDialog'
import { SwordArc } from './components/SwordArc'
import { BootScreen } from './components/BootScreen'
import { TeleportMenu } from './components/TeleportMenu'
import { TeleportOverlay } from './components/TeleportOverlay'
import { TouchControls } from './components/TouchControls'
import { controlMap } from './config/controls'
import { CAMERA } from './config/gameplay'
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
          <PhysicsGate debug={DEBUG_PHYSICS}>
            <Environment />
            <Player key={`player-${runId}`} />
            <Enemies key={`enemies-${runId}`} />
            <Projectiles />
            <Pickups />
          </PhysicsGate>

          {/* Hors de <Physics> : la traînée de lame, la fumée de changement de
              tenue et les fumées de mort ne sont que des effets visuels, elles
              n'ont ni collider ni corps à simuler. */}
          <SwordArc />
          <OutfitSmoke />
          <DeathPuffs />
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
      {/* Avant <PortfolioDialog /> : le panneau plein écran doit recouvrir les
          contrôles tactiles quand il s'ouvre. */}
      <TouchControls />
      {/* Réglages du visiteur : langue et qualité graphique, rangés ensemble
          pour qu'aucun n'ait à connaître la largeur de l'autre. La pastille
          d'inventaire vient **sous** la rangée : ce n'est pas un réglage de la
          page mais une partie du jeu, et la mettre à côté des trois autres
          l'aurait fait lire comme un quatrième bouton d'options. */}
      <div className="settings">
        <div className="settings__row">
          <SoundToggle />
          <QualityToggle />
          <LanguageToggle />
        </div>
        {/* `key={runId}` : le point « nouvel objet » s'appuie sur un compteur
            local au composant, qui doit repartir de zéro à chaque partie comme
            l'inventaire lui-même. Voir l'en-tête d'`InventoryButton`. */}
        <InventoryButton key={`inventory-${runId}`} />
      </div>
      {/* Le panneau passe devant tout le HUD, invite d'interaction comprise. */}
      <PortfolioDialog />
      {/* Après le portfolio et avant le menu de téléportation : l'inventaire
          doit recouvrir un panneau de lieu resté ouvert, mais pas l'onglet de
          voyage rapide, qui reste accessible en toutes circonstances. */}
      <InventoryPanel />
      {/* La révélation d'un coffre passe devant tout le reste : c'est le seul
          moment du jeu où l'écran a une seule chose à dire. */}
      <ChestReveal />
      <TeleportMenu />
      <TeleportOverlay />
      <BootScreen />
    </KeyboardControls>
  )
}
