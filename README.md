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
  config/worldShape.ts        ce qu'un monde doit savoir répondre au décor
  config/continentShape.ts    le continent, vu comme une `WorldShape`
  config/beyond.ts            l'Outremonde : relief, roue des biomes, Sanctuaire
  config/beyondEnemies.ts     peuplement de l'Outremonde, postes des Lynels
  config/challenge.ts         le défi : difficultés, durées, barème, rangs
  scores/entry.ts             le classement : pseudo, rang, tamis (pur, testé)
  scores/firestore.ts         les deux seuls échanges réseau : lire, enregistrer
  firebase/app.ts             l'app Firebase, chargée à la demande
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
  store/useScoresStore.ts     le classement en ligne : filtres, lignes, envoi
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
                              (prend une `WorldShape` : continent ou Outremonde)
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
    beyond/Beyond.tsx         l'Outremonde : le fragment chargé à la demande
    beyond/BeyondSky.tsx      ciel violet, aurore, planète annelée
    beyond/Sanctuary.tsx      la zone franche : dallage, monolithes, trêve
    beyond/Crucible.tsx       le dallage noir du centre, où attend la Déchue
    beyond/Sensei.tsx         le maître : modèle, salut, proximité
    beyond/BeyondPopulation.tsx  ennemis, cinq Lynels et une Malenia
    ChallengeHUD.tsx          réglages du défi, décompte, chronomètre, résultat
    scores/ScoreSubmit.tsx    enregistrer son score, et la place obtenue
    scores/ScoreBoard.tsx     le tableau : quatre filtres, huit colonnes
    BeyondArrival.tsx         la fanfare des cinq premières secondes
```

## Classement en ligne

Les scores du défi du maître sont enregistrés dans **Firestore**. C'est la seule
partie du jeu qui sorte du navigateur, et elle est entièrement facultative : sans
configuration, le jeu est complet et le classement n'apparaît nulle part.

**Configuration.** Copier `.env.example` en `.env` et y mettre les identifiants du
projet Firebase (console Firebase > Paramètres du projet > Vos applications). Ces
identifiants sont publics par construction : ils désignent le projet, ils ne
l'autorisent pas — c'est le rôle des règles de sécurité.

**Règles de sécurité.** `firestore.rules` est à publier une fois, depuis la
console (Firestore Database > Règles) ou avec
`firebase deploy --only firestore:rules`. Sans elles, un projet en mode test
s'ouvre à tout et se referme au bout de trente jours : le classement marcherait
un mois, puis cesserait sans prévenir. Elles n'autorisent que la création, jamais
la modification ni la suppression, et valident la forme de chaque ligne.

**Aucun index à créer.** La lecture ne filtre que sur un seul champ — la
catégorie — parce que Firestore indexe automatiquement les champs pris isolément.
Le tri et les filtres de tenue et d'arme sont faits en mémoire, ce qui les rend
instantanés. Voir l'en-tête de `src/scores/firestore.ts`.

**Le SDK ne pèse pas sur le démarrage.** Il arrive par `import()` au premier
affichage du classement, dans un chunk à part : un visiteur qui ne finit jamais
le jeu ne le télécharge jamais.

**Ce que le classement ne peut pas faire.** Le jeu n'a pas de comptes : il n'y a
donc pas d'auteur à qui restreindre l'écriture, et rien n'empêche quelqu'un de
poster un score qu'il n'a pas fait. Les règles valident la forme, pas la
sincérité. C'est un classement de jeu de navigateur, et la seule protection
sérieuse serait de rejouer la partie côté serveur.

**Les règles de jeu**, elles, sont dans le client : seul un joueur **encore en
vie** à la fin de son défi se voit proposer d'enregistrer, et personne n'y est
obligé. Les pseudos identiques sont autorisés — sans compte, un nom n'a pas de
propriétaire.

## Mesure d'audience

Deux collecteurs reçoivent **exactement les mêmes événements** : **Umami** pour
un tableau de bord qui se lit d'un coup d'œil, **Google Analytics 4** pour les
entonnoirs, la comparaison de périodes et l'origine du trafic. Les deux sont
facultatifs et indépendants — vider une variable d'environnement en éteint un
sans toucher à l'autre, et sans rien changer au jeu.

Leurs totaux ne coïncideront jamais : les bloqueurs de publicité coupent
couramment Google sans toucher à Umami. Ce sont deux mesures partielles, pas une
seule à deux endroits.

**Configuration.** `VITE_UMAMI_WEBSITE_ID` pour Umami. Pour Google, rien à faire
si Firebase est déjà configuré : `VITE_FIREBASE_MEASUREMENT_ID` porte
l'identifiant du flux GA4 (`G-…`) et sert de repli. `VITE_GA_MEASUREMENT_ID` le
remplace le jour où la mesure quitterait Firebase.

**Aucun cookie, donc aucun bandeau.** Umami n'en pose pas par construction ;
Google est chargé en mode consentement refusé (`analytics_storage: 'denied'`),
ce qui lui interdit d'écrire quoi que ce soit et le limite à des relevés
anonymes. Le prix : dans GA4, le nombre d'**utilisateurs** et tout ce qui
suppose de reconnaître quelqu'un — rétention, parcours complet — sont des
estimations. Les **événements**, eux, sont comptés tels quels.

**Où sont les scripts.** Posés dans le `<head>` au build par
`plugins/analytics.ts`, jamais importés depuis le bundle : chargés après les
~3,6 Mo de moteur 3D, ils rateraient précisément les visiteurs qui abandonnent
pendant le téléchargement, c'est-à-dire la mesure la plus utile du site. Rien
n'est émis en développement, ni depuis les préproductions `*.vercel.app`.

### Les événements

Ils sont déclarés en un seul endroit, `src/analytics/index.ts`, chacun avec la
question à laquelle il répond. En résumé :

| Événement | Ce qu'il dit |
| --- | --- |
| `boot_complete` | le monde est jouable, en combien de temps — et le taux d'abandon au chargement |
| `landmark_opened` | quelle rubrique du portfolio s'ouvre, à pied ou par téléportation |
| `portfolio_slide_viewed` | quel projet, quelle école, quel contact est réellement atteint dans le panneau |
| `landmark_closed` | combien de temps une rubrique est restée ouverte, et combien de pages y ont été lues |
| `project_photo_opened` | une capture est ouverte en plein écran |
| `outbound_link` | un lien sortant est cliqué (contact, projet, réseau) |
| `language_changed` | la langue est changée à la main — donc la détection s'était trompée |
| `portal_opened` | la carte est vidée, le portail s'ouvre : par les combats ou par le code de triche |
| `sky_island_entered` | le portail est franchi |
| `boss_engaged` / `boss_parry` / `boss_defeated` | le Lynel : engagé, paré, tombé, et avec combien de cœurs |
| `trial_cleared` / `golden_slain` | l'épreuve des trois Lynels, puis le Lynel doré du sommet |
| `malenia_engaged` / `malenia_morph` / `malenia_parry` / `malenia_defeated` | le dernier combat, de la première phase à la fin du jeu |
| `beyond_entered` | l'après-partie est découverte |
| `player_died` | le joueur tombe : qui l'a tué, et sur quelle carte |
| `challenge_started` / `challenge_ended` | un défi, ses réglages, son score et ce qui l'a arrêté |
| `score_submitted` | un score est écrit au classement |

### Une étape à faire dans GA4, une seule fois

**C'est le piège de Google, et il est silencieux.** GA4 reçoit et conserve les
paramètres de chaque événement — `landmark`, `hearts`, `attack`… — mais n'en
affiche aucun tant qu'ils n'ont pas été déclarés dans *Admin > Définitions
personnalisées*. Rien ne le signale, et **les données d'avant la déclaration ne
remontent pas** : un paramètre déclaré en retard est perdu pour la période
écoulée. Umami, lui, les montre sans rien demander.

À déclarer en **dimensions personnalisées** (portée « événement ») :

`landmark`, `slide`, `via`, `project`, `target`, `attack`, `phase`, `outcome`,
`difficulty`, `duration`, `locale`, `from`, `location`, `failed`

À déclarer en **métriques personnalisées** :

`ms`, `seconds`, `slides`, `index`, `hearts`, `score`, `kills`

Les quotas sont larges (50 dimensions, 50 métriques) : tout tient sans arbitrage.

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
