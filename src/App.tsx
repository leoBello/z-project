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
import { InteractionKey } from './components/InteractionKey'
import { KeyboardGuard } from './components/KeyboardGuard'
import { KonamiCode } from './components/KonamiCode'
import { LanguageToggle } from './components/LanguageToggle'
import { Minimap } from './components/Minimap'
import { WorldTransition } from './components/WorldTransition'
import { NukeBlast } from './components/NukeBlast'
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
import { QuestButton } from './components/quests/QuestButton'
import { QuestPanel } from './components/quests/QuestPanel'
import { StrikeArc } from './components/StrikeArc'
import { BeyondArrival } from './components/BeyondArrival'
import { BootScreen } from './components/BootScreen'
import { ChallengeHUD } from './components/ChallengeHUD'
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
  /**
   * Carte courante. Lue ici pour une seule raison : les ennemis n'existent que
   * sur le continent, et `<Enemies>` monte vingt-six corps physiques — le
   * laisser monté sur l'île y ferait tomber vingt-six Moblins dans le vide.
   */
  const location = useGameStore((state) => state.location)

  return (
    <KeyboardControls map={controlMap}>
      {/* Sous `KeyboardControls` et avant tout le reste : il ne rend rien, il
          remet les touches à plat quand la fenêtre perd le focus. Sans lui,
          une commande restée enfoncée avale l'appui suivant. */}
      <KeyboardGuard />
      {/* Juste après lui, et l'ordre compte : le garde renvoie des `keyup` de
          synthèse à la perte de focus, et le code de triche n'écoute que les
          `keydown` — il ne peut donc pas les prendre pour une saisie. Hors du
          Canvas et sans rien demander à `KeyboardControls` : une suite d'appuis
          n'est pas un état de commande. Voir l'en-tête du composant. */}
      <KonamiCode />
      {/* La touche d'interaction, hors du Canvas et hors du décor : elle vaut
          pour toutes les cartes. Rangée dans `<Landmarks>`, elle disparaissait
          avec le continent et le portail du retour ne répondait plus. */}
      <InteractionKey />
      <Canvas
        // "percentage" = PCFShadowMap ; PCFSoft est déprécié depuis three 0.185.
        shadows="percentage"
        // `far` doit dépasser la taille du dôme de <Sky> (scale 1000),
        // sinon le ciel est entièrement clippé par le frustum.
        camera={{ fov: CAMERA.fov, near: 0.1, far: 2000, position: CAMERA.offset }}
      >
        {/* La brume n'est plus ici : elle dépend de la carte, et elle est donc
            montée par `<Environment>` à partir de `config/atmosphere.ts`, avec
            les quatre lumières. Une carte qui a son propre ciel a forcément sa
            propre brume — voir l'en-tête de cette table. */}

        {/* Avant <Physics> et avec une priorité de useFrame négative : tout ce
            qui lit un délai de gameplay doit trouver l'horloge déjà avancée. */}
        <GameClock />

        <Suspense fallback={null}>
          <PhysicsGate debug={DEBUG_PHYSICS}>
            <Environment />
            <Player key={`player-${runId}`} />
            {location === 'continent' && <Enemies key={`enemies-${runId}`} />}
            <Projectiles />
            <Pickups />
          </PhysicsGate>

          {/* Hors de <Physics> : la traînée de lame, la fumée de changement de
              tenue et les fumées de mort ne sont que des effets visuels, elles
              n'ont ni collider ni corps à simuler. */}
          <StrikeArc />
          <OutfitSmoke />
          <DeathPuffs />
          {/* Même famille, et même raison d'être hors de <Physics> : le
              champignon est une image, pas un corps. Ce qui tue les ennemis
              est un rayon calculé, lu par chacun d'eux — voir `Enemy.tsx`. */}
          <NukeBlast />
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
        {/* Les deux pastilles du **jeu**, rangées ensemble sous les réglages de
            la page. `key={runId}` sur les deux : chacune s'appuie sur un
            compteur local — « nouvel objet » pour l'une, « nouvelle quête » pour
            l'autre — qui doit repartir de zéro à chaque partie comme l'état
            qu'il observe. Voir les en-têtes des deux composants. */}
        <div className="settings__game">
          <QuestButton key={`quests-${runId}`} />
          <InventoryButton key={`inventory-${runId}`} />
        </div>
      </div>
      {/* Le panneau passe devant tout le HUD, invite d'interaction comprise. */}
      <PortfolioDialog />
      {/* Après le portfolio et avant le menu de téléportation : l'inventaire
          doit recouvrir un panneau de lieu resté ouvert, mais pas l'onglet de
          voyage rapide, qui reste accessible en toutes circonstances. */}
      <InventoryPanel />
      {/* Au même rang que l'inventaire, et pour les mêmes raisons : il recouvre
          un panneau de lieu resté ouvert, jamais l'onglet de voyage rapide. Les
          deux ne peuvent pas être ouverts ensemble — chacun met la partie en
          pause, et leurs pastilles sont désactivées hors de `playing`. */}
      <QuestPanel />
      {/*
        Le défi du maître : sa proposition, son décompte, son chronomètre et son
        résultat. Posé **avant** la révélation de coffre et le voyage, pour la
        raison qui range déjà l'inventaire ici : ses deux panneaux mettent la
        partie en pause, ils doivent donc recouvrir le HUD — mais jamais un
        coffre qui s'ouvre, ni un voile de transition, ni l'écran de démarrage.

        Monté en permanence et non sous condition de carte : il ne rend rien tant
        qu'aucun défi ne court, et le tester ici aurait mis dans `App.tsx` une
        troisième connaissance de la carte courante.
      */}
      <ChallengeHUD />
      {/* La fanfare d'arrivée sur l'Outremonde, au même rang et pour les mêmes
          raisons. Elle ne rend rien ailleurs, ni après ses six secondes. */}
      <BeyondArrival />
      {/* La révélation d'un coffre passe devant tout le reste : c'est le seul
          moment du jeu où l'écran a une seule chose à dire. */}
      <ChestReveal />
      <TeleportMenu />
      <TeleportOverlay />
      {/* Après l'overlay de téléportation et avant l'écran de chargement : le
          voyage entre cartes doit recouvrir un vol de braises resté à l'écran,
          mais jamais l'écran de démarrage. */}
      <WorldTransition />
      <BootScreen />
    </KeyboardControls>
  )
}
