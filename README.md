# z-project — mini-jeu 3D inspiré de Zelda

Démo jouable en navigateur : React + TypeScript + Three.js (React Three Fiber),
physique Rapier, état zustand.

**Suivi du projet, décisions et reste à faire : [ROADMAP.md](./ROADMAP.md).**

**Plans d'implémentation détaillés : [`docs/`](./docs/)** — actuellement
[points d'intérêt interactifs](./docs/plan-poi-portfolio.md).
**Reprise du projet par un autre agent : [HANDOFF.md](./HANDOFF.md).**

```bash
npm install
npm run dev      # http://localhost:5173
npm run dev -- --open
```

Ajouter `?debug` à l'URL (`http://localhost:5173/?debug`) affiche les colliders Rapier.

## Structure

```
src/
  App.tsx                     Canvas, Physics, KeyboardControls
  config/controls.ts          mapping clavier (codes physiques → WASD + ZQSD)
  config/gameplay.ts          constantes réglables (vitesse, saut, caméra, map)
  config/world.ts             relief, mer, classification des biomes, bruit
  config/biomes.ts            palettes des sept biomes
  config/enemies.ts           statistiques par espèce, placement
  config/landmarks.ts         points d'intérêt : position, terrasse, découverte
  config/bridge.ts            tracé du pont de Nakano, ancrages lus dans le relief
  config/items.ts             objets : effets, emplacements, silhouettes, lames
  config/chests.ts            coffres : monument porteur, position locale, contenu
  config/quests.ts            journal de quêtes : dérivé de l'état, jamais stocké
  i18n/fr.json, en.json       dictionnaires (interface + contenu du portfolio)
  i18n/index.ts               types, dictionnaires, format()
  i18n/useI18n.ts             accès au dictionnaire courant
  state/gameClock.ts          horloge de jeu : s'arrête en pause
  types/game.ts               types métier (phase, ennemis, biomes)
  store/useGameStore.ts       état de partie zustand (vie, phase, kills)
  store/quests.ts             le journal, relu depuis l'état de partie
  state/playerTransform.ts    transform du joueur partagé hors React (60 fps)
  state/cameraView.ts         matrice view-projection publiée hors React + projection écran
  state/enemyRegistry.ts      position, état d'IA et PV des ennemis vivants
  state/projectiles.ts        pool de tirs
  state/pickups.ts            pool de cœurs lâchés
  components/
    Player.tsx                contrôleur physique du personnage
    CameraRig.tsx             caméra 3e personne lissée
    Environment.tsx           composition du décor (ciel, lumières, sol, végétation)
    PostFX.tsx                bloom + tilt-shift + vignette (rendu "diorama")
    HUD.tsx                   overlay 2D
    Minimap.tsx               carte 2D, position du joueur, ennemis
    CombatOverlay.tsx         barres de vie et chevrons d'alerte, en canvas 2D
    StrikeArc.tsx             traînée du coup (arc de lame ou onde de poing), verdict
    Pickups.tsx               cœurs lâchés : chute, flottement, ramassage
    Enemy.tsx                 physique et machine à états d'un ennemi
    Enemies.tsx               peuplement de la carte
    Projectiles.tsx           pool de projectiles, un seul draw call
    enemies/models.tsx        Octorok et Moblin, matériaux par instance
    environment/Terrain.tsx   relief, couleurs par sommet, collider heightfield
    environment/Water.tsx     mer translucide, houle en vertex shader
    environment/StarrySky.tsx  ciel procédural : Voie lactée, étoiles, nébuleuses
    environment/Vegetation.tsx  semis instancié des sept biomes
    environment/Landmarks.tsx  monuments, proximité et touche d'interaction
    environment/Temple.tsx    Temple du Sommet, géométrie fusionnée et colliders
    environment/InteractionMarker.tsx  braise bleue : « on peut agir ici »
    environment/Pyramid.tsx   Pyramide de la Jungle — la présentation
    environment/Stele.tsx     Grande Stèle — les compétences
    environment/Statue.tsx    Idole des Terres Arides — le parcours
    environment/Ruins.tsx     Ruines de l'Île — le contact
    environment/Pagoda.tsx    Temple de Nakano — la pagode de l'îlot du nord-est
    environment/Bridge.tsx    pont et torii vers l'îlot : tablier, piles, colliders
    environment/TreasureChest.tsx  coffre au trésor et séquence d'ouverture
    environment/solids.ts     primitives partagées des monuments
    environment/faceted.ts    normales par face, partagé par le décor
    environment/windMaterial.ts  matériau toon + vent en vertex shader
    GameClock.tsx             avance l'horloge de jeu, avant tout le monde
    KeyboardGuard.tsx         relâche les touches quand la fenêtre perd le focus
    LanguageToggle.tsx        sélecteur FR / EN
    portfolio/PortfolioDialog.tsx  panneau des projets, navigation, focus
    portfolio/ProjectStepper.tsx   pastilles de progression
    portfolio/ProjectIllustration.tsx  illustration générée par projet
    portfolio/illustration/   projection isométrique et motifs
    portfolio/sections.ts     contenu d'une section → diapositives
    quests/QuestButton.tsx    pastille du journal, point d'appel, bulle d'entrée
    quests/QuestPanel.tsx     le journal : quêtes en cours et accomplies
    models/SafeModel.tsx      fallback si un .glb est absent
    models/HeroModel.tsx      modèle du joueur (.glb ou personnage procédural)
    models/HeroPlaceholder.tsx  personnage articulé + animation procédurale
    models/toonGradient.ts    rampe de cel-shading partagée
```

## Assets 3D

Tous les modèles sont chargés depuis `public/models/`. Tant qu'un fichier est
absent, un modèle de remplacement s'affiche : le jeu reste jouable.

Le joueur a un personnage procédural complet (`HeroPlaceholder`) : silhouette
chibi en primitives, `meshToonMaterial` + contour `Outlines` pour le
cel-shading, et animation à la main (marche synchronisée à la vitesse réelle,
pose aérienne, coup d'épée). Il reste le fallback même une fois le `.glb` posé.

**Convention : l'avant d'un modèle est +Z.** Si un `.glb` regarde dans l'autre
sens, ajouter `rotation-y={Math.PI}` sur son `<primitive>`.

| Fichier attendu             | Étape | Où le trouver (CC0) |
| --------------------------- | ----- | ------------------- |
| `public/models/hero.glb`    | 1     | Quaternius *Ultimate Modular Characters* / Kenney *Blocky Characters* |

**La végétation ne passe pas par des `.glb`** : arbres, rochers, touffes
d'herbe et fleurs sont générés en primitives dans `Vegetation.tsx`, puis rendus
en `InstancedMesh` avec une couleur par instance. Ça garantit une palette
cohérente par biome et zéro octet à télécharger. Pour brancher des modèles
téléchargés à la place, il suffit de remplacer les entrées de l'objet
`geometries` par les géométries extraites du `.glb` — le semis, les couleurs,
le vent et les colliders restent inchangés.

Les fichiers des ennemis seront listés ici à l'étape suivante.

Sources : [Kenney](https://kenney.nl/assets), [Quaternius](https://quaternius.com/),
[Poly Pizza](https://poly.pizza/).
