# z-project — mini-jeu 3D inspiré de Zelda

Démo jouable en navigateur : React + TypeScript + Three.js (React Three Fiber),
physique Rapier, état zustand.

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
  types/game.ts               types métier (phase, ennemis, biomes)
  store/useGameStore.ts       état de partie zustand (vie, phase, kills)
  state/playerTransform.ts    transform du joueur partagé hors React (60 fps)
  components/
    Player.tsx                contrôleur physique du personnage
    CameraRig.tsx             caméra 3e personne lissée
    Environment.tsx           sol, murs, lumières, ciel
    HUD.tsx                   overlay 2D
    models/SafeModel.tsx      fallback si un .glb est absent
    models/LinkModel.tsx      modèle du joueur + placeholder
```

## Assets 3D

Tous les modèles sont chargés depuis `public/models/`. Tant qu'un fichier est
absent, une primitive de remplacement s'affiche : le jeu reste jouable.

**Convention : l'avant d'un modèle est +Z.** Si un `.glb` regarde dans l'autre
sens, ajouter `rotation-y={Math.PI}` sur son `<primitive>`.

| Fichier attendu             | Étape | Où le trouver (CC0) |
| --------------------------- | ----- | ------------------- |
| `public/models/link.glb`    | 1     | Quaternius *Ultimate Modular Characters* / Kenney *Blocky Characters* |

Les fichiers des étapes suivantes (arbres, rochers, ennemis) seront listés ici
au fur et à mesure.

Sources : [Kenney](https://kenney.nl/assets), [Quaternius](https://quaternius.com/),
[Poly Pizza](https://poly.pizza/).
