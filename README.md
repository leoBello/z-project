# z-project — mini-jeu 3D inspiré de Zelda

Démo jouable en navigateur : React + TypeScript + Three.js (React Three Fiber),
physique Rapier, état zustand.

**Suivi du projet, décisions et reste à faire : [ROADMAP.md](./ROADMAP.md).**

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
  types/game.ts               types métier (phase, ennemis, biomes)
  store/useGameStore.ts       état de partie zustand (vie, phase, kills)
  state/playerTransform.ts    transform du joueur partagé hors React (60 fps)
  components/
    Player.tsx                contrôleur physique du personnage
    CameraRig.tsx             caméra 3e personne lissée
    Environment.tsx           composition du décor (ciel, lumières, sol, végétation)
    PostFX.tsx                bloom + tilt-shift + vignette (rendu "diorama")
    HUD.tsx                   overlay 2D
    Minimap.tsx               carte 2D, position du joueur, ennemis
    Enemy.tsx                 physique et machine à états d'un ennemi
    Enemies.tsx               peuplement de la carte
    Projectiles.tsx           pool de projectiles, un seul draw call
    enemies/models.tsx        Octorok et Moblin, matériaux par instance
    environment/Terrain.tsx   relief, couleurs par sommet, collider heightfield
    environment/Water.tsx     mer translucide, houle en vertex shader
    environment/Vegetation.tsx  semis instancié des sept biomes
    environment/windMaterial.ts  matériau toon + vent en vertex shader
    models/SafeModel.tsx      fallback si un .glb est absent
    models/LinkModel.tsx      modèle du joueur (.glb ou personnage procédural)
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
| `public/models/link.glb`    | 1     | Quaternius *Ultimate Modular Characters* / Kenney *Blocky Characters* |

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
