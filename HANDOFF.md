# Prompt de reprise — z-project

Copier-coller le bloc ci-dessous au prochain agent qui reprend le projet.

---

## PROMPT

Tu reprends **z-project**, un mini-jeu 3D jouable en navigateur inspiré de Zelda,
destiné à un portfolio de développeur front-end. Le projet est déjà avancé et
fonctionne : ne le repars pas de zéro, continue-le.

### Avant d'écrire la moindre ligne

Lis dans cet ordre :

1. `ROADMAP.md` — état par chantier, décisions d'architecture **avec leur
   raison**, bugs déjà corrigés, ce qu'il reste à faire par priorité, et un
   tableau « je veux changer X → fichier Y ».
2. `README.md` — arborescence commentée et note sur les assets.
3. `src/config/` — quatre fichiers qui pilotent tout le reste : `gameplay.ts`,
   `controls.ts`, `world.ts`, `biomes.ts`, `enemies.ts`.

La roadmap est la source de vérité. Tiens-la à jour à chaque étape terminée.

### État actuel

Vite 8 + React 19 + TypeScript 6, three 0.185, @react-three/fiber 9, drei 10,
@react-three/rapier 2, @react-three/postprocessing 3, zustand 5.

Ce qui tourne : monde procédural de 200×200 avec relief, sept biomes, mer
guéable et île atteignable à pied ; personnage articulé animé à la main ;
combat complet et lisible (deux espèces d'ennemis, IA à états avec temps de
préparation avant chaque attaque, épée avec traînée qui dit si le coup a porté,
projectiles dispersés, barres de vie, chevrons d'alerte pour les tirs hors
cadre, cœurs lâchés, cinq cœurs, Game Over, relance, renvoi des projectiles à
l'épée) ; minimap ; ciel étoilé procédural avec lune ; mer à écume de rivage ;
rendu diorama cel-shadé avec bloom, tilt-shift et vignette ; son entièrement
synthétisé, coupé par défaut ; réglage de qualité à deux niveaux.

Direction artistique : **diorama low-poly cozy** — la recette caméra et
post-traitement du HD-2D appliquée à de la vraie 3D. Ne la change pas sans que
le propriétaire du projet le demande.

### Conventions à respecter

- **Commentaires en français**, et ils expliquent le *pourquoi*, pas le *quoi*.
  Un commentaire qui paraphrase la ligne suivante est du bruit.
- **L'avant d'un modèle 3D est +Z.** Le calcul de cap est `atan2(dir.x, dir.z)`.
  Si un `.glb` importé regarde ailleurs, corrige-le avec `rotation-y` sur le
  `<primitive>`, jamais dans la logique.
- **Rien de réactif à 60 fps.** Tout ce qui est lu ou écrit chaque frame vit
  hors de React : `src/state/playerTransform.ts`, `src/state/enemyRegistry.ts`,
  `src/state/projectiles.ts`. Le store zustand ne porte que ce que l'UI affiche.
- **Le monde dérive d'une seule fonction pure**, `sampleWorld(x, z)` dans
  `world.ts`. Le mesh du terrain, le collider physique, le semis de végétation
  et la minimap l'interrogent tous. N'introduis jamais une seconde source de
  vérité pour le relief.
- **Tout aléatoire de génération est initialisé par une graine fixe**
  (`seededRandom`). Sans ça la carte se redessine à chaque rechargement.
- Le typage est strict et `verbatimModuleSyntax` est actif : utilise
  `import type` pour les types. Les objets de config sont `as const`, ce qui
  impose parfois une annotation explicite (`let x: number = CONFIG.valeur`).

### Pièges déjà payés — ne les repaie pas

Ces quatre bugs partagent **la même cause profonde** : échantillonner un
intervalle court dans une boucle à cadence variable. Si tu écris une condition
du type « sommes-nous en ce moment dans telle fenêtre ? », arrête-toi et
reformule en « cet événement a-t-il déjà été consommé ? ».

- Saut et attaque étaient sondés dans `useFrame` : tout appui plus court qu'une
  frame était perdu. Ils passent maintenant par un abonnement clavier.
- La hitbox d'épée testait l'appartenance à une fenêtre de 135 ms. Elle est
  désormais évaluée **une fois par coup**, dès la première frame suivant
  l'ouverture, et marquée consommée qu'elle touche ou non.
- Rapier **moyenne** les coefficients de friction des deux corps en contact :
  un joueur à 0 sur un sol à 1 donne 0,5, pas 0. Le sol freinait le joueur
  pendant les sous-pas physiques et sa vitesse dépendait du framerate. Tout
  personnage piloté en vélocité doit avoir
  `friction={0} frictionCombineRule={CoefficientCombineRule.Min}`.
- Les étoiles avaient un rayon exprimé en unités de cellule au lieu d'un angle :
  moins d'un pixel chacune, ciel apparemment vide.

Trois autres, de nature différente :

- **Géométrie du cadrage** : le ciel n'entre dans l'image que si la plongée de
  l'axe de visée est inférieure au demi-FOV. C'est `lookAtHeight`, pas la
  position de la caméra, qui décide de ce qu'on voit — relever la visée montre
  le ciel sans renoncer au point de vue en surplomb.
- **La couleur de brume doit être accordée à celle du ciel à l'horizon**, sinon
  l'image se coupe en deux sur la ligne d'horizon.
- **Le dôme de ciel doit tenir dans le `far` de la caméra**, sinon il est
  intégralement clippé et invisible.

### Comment vérifier ton travail

Le propriétaire attend des preuves, pas des affirmations. Il existe déjà des
crochets de diagnostic exposés en développement :

- `window.playerTransform` — position, cap, vitesse, au sol, dernier coup
- `window.gameWorld` — `sampleHeight`, `sampleSlope`, `classifyBiome`, `WORLD`
- `window.__store` — le store zustand complet (vie, phase, kills)
- `window.__enemies()` — liste des ennemis vivants avec état d'IA et PV
- `window.__enemyRegistry` — le registre lui-même, pour injecter un ennemi
  factice et vérifier le calque de combat sans avoir à jouer
- `window.__lastSwing` — verdict du dernier coup d'épée (jugé, touché, opacité
  atteinte). Existe parce que la traînée ne dure que 230 ms : trop court pour
  une capture d'écran, il faut la mesurer
- `window.vegetationCounts` — nombre d'instances par famille de props
- `window.__playerBody` — le rigid body du joueur. **Le seul crochet qui
  écrit** : il sert à poser le personnage à un endroit précis de la carte, parce
  qu'à 1 fps une traversée à pied est hors de portée d'un test
- `window.__projectiles` — le pool, pour poser une balle factice devant le
  joueur et vérifier la parade sans avoir à cadrer un vrai tir d'Octorok
- `window.__occlusionFade` — les uniforms du fondu de canopée. Forcer
  `uOccMinAlpha` à 1 rend le même point de vue sans effacement : c'est ce qui
  permet de comparer deux captures au lieu de juger à l'œil
- `window.__gameClock` — `now`, `resetClock`, et depuis l'animation de défaite
  `hitStop` et `isHitStopped`. Exposée pour vérifier depuis la page qu'elle se
  fige bien en pause, chose qu'on ne peut pas juger à l'œil ; le gel s'y ajoute
  pour la même raison — il dure 80 ms, aucune capture ne l'attrapera
- `window.__cameraShake` — `shake(amplitude, durationMs)` pour déclencher une
  secousse à la demande, `sampleShake` pour lire l'offset courant. Elle dure
  120 ms : impossible à juger sur une capture
- `window.__deathPuffs` — les pools de fumée et d'anneaux, plus
  `spawnDeathPuff`, `spawnDeathRing` et `clearDeathPuffs`. C'est le seul moyen
  de vérifier l'effet de mort sans tuer un ennemi au bon moment : une mort
  dure 210 ms
- `window.__lastDeath` — horodatages de la dernière mort (identifiant de
  l'ennemi, instant du coup fatal, instant du pic) et cœur lâché ou non. Même
  raison que `__lastSwing` : la séquence dure 210 ms, aucune capture ne
  l'attrapera
- `?debug` dans l'URL affiche les colliders Rapier

Méthode qui a fonctionné : piloter le jeu avec Playwright en headless
(`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`), puis
**mesurer depuis la page** plutôt que juger à l'œil. Deux avertissements :

- le rendu logiciel headless tourne à **~1 fps** (mesuré : 0,8 fps en 1280×720,
  3 fps en 420×260) et une capture d'écran peut demander une minute. Deux
  conséquences : n'en déduis jamais un timing sans horodater dans la page, et
  **renonce à capturer un effet transitoire** — un état qui dure moins d'une
  seconde ne tombera pas sur une frame. Mesure-le depuis la page, ou fige-le
  temporairement dans le code le temps d'une capture, puis annule ;
- le clamp de `delta` à 0,05 s fait tourner le déplacement vingt fois moins vite
  que le temps réel à 1 fps, alors que cooldowns et durées de vie restent en
  temps réel. Un test de combat headless mesure donc une difficulté qui n'est
  pas celle du jeu ;
- **Vite sert parfois une version périmée d'un module après édition.** Cela m'a
  coûté plusieurs cycles de diagnostic sur de faux bugs. Avant de conclure qu'un
  correctif ne marche pas : `pkill -f vite`, `rm -rf node_modules/.vite`,
  redémarre, reteste.

Avant d'annoncer qu'une étape est finie : `npx tsc -b` et `npm run build`
doivent passer, et tu dois avoir vu ou mesuré le résultat.

### Ce qu'il faut faire maintenant

Les trois priorités de la roadmap sont vidées de tout ce qui pouvait être fait
depuis un poste de développement. **Ce qui reste demande une manette et une
machine, pas du code** :

- **jouer le combat.** L'équilibrage n'a jamais été joué, seulement mesuré, et
  toutes les mesures viennent d'un rendu logiciel à ~1 fps où le déplacement
  tourne vingt fois moins vite que les délais d'attaque. Les leviers sont
  `MAX_HEARTS`, `HEART_DROP_CHANCE`, `telegraphMs` et `spread`. Le réceptacle de
  cœur du temple ajoute un sixième cœur : c'est le premier chiffre à revoir ;
- **jouer la montée au temple.** L'accès n'a été mesuré que par la pente, jamais
  parcouru ;
- **mesurer le framerate sur un GPU intégré.** Le réglage de qualité existe et
  agit (densité de végétation, shadow map, post-traitement, lumière ponctuelle
  du cristal), mais le seuil à partir duquel il devient nécessaire n'a pas été
  relevé sur une vraie machine modeste. C'est ce chiffre, et lui seul, qui doit
  décider de l'instanciation des ennemis (~150 draw calls) — une optimisation
  qui complique le code des modèles et n'a pas à être faite à l'aveugle.

Tout le reste de la priorité 3 est fait : bundle découpé, écran de chargement,
horloge unique.

Ne pars pas sur autre chose sans le demander.

### Façon de travailler attendue

Le propriétaire du projet valide étape par étape et veut pouvoir tester entre
chaque brique. Procède par incréments testables, pas en un bloc massif.

Il attend aussi que tu **signales les défauts que tu trouves** plutôt que de
les masquer, que tu **dises ce que tu n'as pas pu vérifier**, et que tu
expliques les décisions techniques non évidentes. Plusieurs des meilleures
améliorations du projet sont venues de bugs trouvés en mesurant, pas de
fonctionnalités ajoutées.

Réponds en français.
