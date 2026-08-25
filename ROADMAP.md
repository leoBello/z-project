# z-project — état du projet

Mini-jeu 3D navigateur inspiré de Zelda, pour portfolio front-end.
Direction artistique : **diorama low-poly cozy** — cel-shading, FOV étroit,
tilt-shift. La recette caméra + post-traitement du HD-2D, appliquée à de la 3D.

Dernière mise à jour : 25 août 2026 — la boucle de jeu est complète.

---

## 1. Ce qui est fait

### Socle technique
- Vite 8 + React 19 + TypeScript 6
- three 0.185, @react-three/fiber 9, drei 10, rapier 2, postprocessing 3, zustand 5
- Type-check et build de production passants
- `?debug` dans l'URL affiche les colliders Rapier
- En développement, `window.playerTransform`, `window.gameWorld` et
  `window.vegetationCounts` sont exposés pour inspecter l'état depuis la console

### Personnage
- Contrôleur physique : capsule Rapier, rotations verrouillées, vélocité imposée
- Déplacement caméra-relatif, saut, ralentissement dans l'eau
- Mapping clavier par **codes physiques** : WASD en QWERTY et ZQSD en AZERTY
  avec la même configuration, sans réglage
- Saut et attaque **événementiels** (abonnement clavier), jamais perdus
- Personnage procédural articulé, cel-shadé, avec animation à la main :
  cycle de marche synchronisé à la vitesse réelle, pose aérienne, coup d'épée
- Chargement `.glb` prêt avec repli automatique si le fichier est absent

### Monde
- Carte 200 × 200, relief généré par bruit déterministe
- **Sept biomes** : haut-fond, plage, prairie, jungle, terres arides, montagne, île
- Continent occupant l'essentiel de la carte, ceinturé par l'océan
- Montagne enneigée au nord-ouest, île au large du sud-est
- **Île atteignable à pied** par un haut-fond guéable — pas de système de nage
- Collider `Heightfield` Rapier construit à partir de la même grille que le
  mesh visuel : alignement vérifié à 0,00 unité près
- Végétation instanciée : ~7 600 props en 9 draw calls, vent en vertex shader
- Colliders sur les troncs et les gros rochers uniquement

### Rendu
- Cel-shading `meshToonMaterial` + rampe de dégradé partagée
- Sol peint par sommet, transitions de biome continues
- FOV 35 + bloom + tilt-shift + vignette
- Trois sources de lumière (clé chaude, rebond froid, contre-jour)
- Soleil et shadow camera qui suivent le joueur
- Mer translucide avec houle et normales calculées dans le vertex shader

### Combat et ennemis
- **Deux espèces** : Octorok (tourelle, tire des projectiles en cloche) et
  Moblin (détecte, poursuit, frappe au corps-à-corps)
- Machine à états commune `idle → patrol → chase → attack → dead` ; ce qui
  change d'une espèce à l'autre tient entièrement dans `ENEMIES[kind]`
- 26 ennemis posés par biome, patrouille autour de leur point d'apparition
- Hitbox d'épée en sphère devant le joueur, **une évaluation par coup**
- **Visée assistée circulaire** : le personnage s'aligne sur l'ennemi le plus
  proche au moment de frapper
- Recul, flash blanc à l'impact, effondrement à la mort
- Projectiles en pool de taille fixe, un seul draw call, collision avec le
  relief via le même échantillonneur que le terrain
- Ennemis inactifs au-delà de 85 unités : ni affichés, ni mis à jour

### Interface
- HUD : cœurs, rappel des contrôles
- Flash rouge à chaque coup encaissé, clignotement du joueur pendant les i-frames
- Écran de Game Over avec nombre d'ennemis vaincus et bouton de relance
- **Minimap** en haut à gauche : fond de carte pré-rendu avec ombrage de relief,
  position et cap du joueur, **ennemis vivants**, nom du biome courant

---

## 2. Décisions d'architecture

| Décision | Pourquoi |
| --- | --- |
| `playerTransform` mutable hors React | Lu et écrit à 60 fps par la caméra, la minimap et l'animation. Un state React provoquerait un re-render par frame. |
| Une seule fonction `sampleWorld(x, z)` | Le mesh, le collider, le semis et la minimap l'interrogent tous. Impossible qu'ils se désynchronisent. |
| Vent dans le vertex shader | La végétation est instanciée. L'animer côté CPU obligerait à réécrire chaque matrice à chaque frame et annulerait le bénéfice de l'instanciation. |
| Matrices d'instance posées au montage | La végétation est statique. Coût par frame : zéro travail CPU. |
| Couleur du sol par sommet, pas par texture | Transitions continues entre biomes, aucun asset à charger, chemin et rivage dessinés dans la foulée. |
| Minimap en canvas 2D hors du Canvas 3D | Une seconde caméra ou une seconde scène coûterait bien plus cher pour un rendu 2D. |
| Végétation procédurale plutôt que `.glb` | Contrôle total de la palette par biome, couleur par instance, zéro octet à télécharger. Voir « écarts » plus bas. |
| Une machine à états pour toutes les espèces | Ajouter un troisième type d'ennemi ne demandera qu'une entrée de config et un modèle. |
| Projectiles hors React et hors Rapier | Un projectile vit 2,6 s ; un rigid body complet coûterait plus cher que l'intégration à la main, et réveillerait le solveur en cascade. |
| `runId` comme `key` React | Relancer une partie remonte joueur et ennemis : positions, PV et machines à états repartent de zéro sans code de réinitialisation. |
| Registre d'ennemis mutable | La minimap lit les positions à chaque frame. Un state React re-rendrait tout le HUD 60 fois par seconde. |

---

## 3. Bugs corrigés qui valent d'être retenus

**Appuis clavier perdus.** Saut et attaque étaient sondés dans `useFrame` :
tout appui plus court qu'une frame tombait entre deux sondages. Passés en
événementiel.

**Vitesse dépendante du framerate.** Rapier *moyenne* les coefficients de
friction des deux corps en contact : joueur à 0 sur sol à 1 donnait 0,5. Le sol
freinait le joueur pendant les sous-pas physiques enchaînés entre deux frames,
et la vitesse chutait de 7 à 2 u/s sur une machine lente. Corrigé par
`frictionCombineRule = Min`.

**Ciel invisible.** Le dôme de `<Sky>` fait 1000 unités ; le `far` de la caméra
était à 400, il était donc intégralement clippé.

**Un biome entier absent de la carte.** Le fbm se concentre autour de 0,5 ; les
seuils extrêmes n'étaient jamais atteints. Corrigé en étalant la valeur.

**Coups d'épée qui ne portent pas.** La hitbox testait « sommes-nous à
l'intérieur de la fenêtre de dégâts ? », soit un intervalle de 135 ms
échantillonné dans une boucle à cadence variable : sur une machine lente, une
frame sur deux tombait à côté. Le coup est maintenant évalué **une seule fois
par swing**, dès la première frame suivant l'ouverture de la fenêtre, et marqué
consommé qu'il touche ou non. Exactement le même piège que le sondage clavier.

**Ennemis increvables dans le dos.** Sans souris ni caméra libre, il n'existe
aucun moyen de se retourner sur place : un ennemi passé derrière le joueur ne
pouvait plus jamais être touché. Mesuré : dix coups d'affilée dans le vide.
Corrigé par une visée assistée circulaire.

---

## 4. Ce qu'il reste à faire

### Priorité 1 — équilibrage et lisibilité du combat (prochaine étape)
- [ ] Équilibrer la difficulté : 26 ennemis pour 3 cœurs, la partie est courte
- [ ] Barre de vie au-dessus des ennemis engagés (les PV sont déjà dans le registre)
- [ ] Indicateur de direction quand on se fait tirer dessus hors écran
- [ ] Retour sonore ou visuel quand un coup part dans le vide
- [ ] Cœurs lâchés par les ennemis vaincus

### Priorité 2 — confort et finition
- [ ] **Occlusion des arbres** : en jungle, une canopée passe régulièrement entre
      la caméra et le joueur. Solution prévue : fondu par tramage
      (*screen-door*) dans le fragment shader des canopées, en passant la
      position du joueur en uniform. Pas de tri de transparence à gérer.
- [ ] Points d'intérêt sur l'île, pour lui donner une raison d'exister
- [ ] Écume au bord de l'eau
- [ ] Son : ambiance, pas, épée

### Priorité 3 — performance et livraison
- [ ] Bundle à 3,5 Mo (1,2 Mo gzip) en un seul chunk — découper le code
- [ ] Mesurer le framerate sur GPU intégré ; prévoir un réglage de qualité
      (densité de végétation, résolution d'ombres, post-traitement)
- [ ] Les ennemis coûtent ~150 draw calls à 26 unités : instancier les parties
      communes si le framerate décroche
- [ ] Écran de chargement : la génération du monde bloque ~1 s au démarrage

### Plus tard
- [ ] Inventaire, quêtes, dialogues
- [ ] Modèles `.glb` riggés + animations Mixamo pour le héros
- [ ] Cycle jour/nuit

---

## 5. Écarts assumés par rapport au brief initial

**La végétation n'utilise pas de `.glb`.** Le brief prévoyait des modèles
Kenney/Quaternius. Le rendu est procédural : palette maîtrisée par biome,
couleur par instance, aucun téléchargement. Pour basculer, il suffit de
remplacer les entrées de l'objet `geometries` dans `Vegetation.tsx` par les
géométries extraites d'un `.glb` — semis, couleurs, vent et colliders restent
inchangés.

**Le personnage joueur reste procédural.** Le chemin `.glb` existe et fonctionne
(`public/models/link.glb`), mais le personnage codé est animé et cel-shadé, donc
présentable tel quel. Le passage à un modèle riggé n'apporterait que de vraies
animations.

---

## 6. Où régler quoi

| Je veux changer… | Fichier |
| --- | --- |
| Vitesse, saut, gravité, caméra, durée d'attaque | `src/config/gameplay.ts` |
| Touches | `src/config/controls.ts` |
| Relief, position de la montagne, de l'île, du gué | `src/config/world.ts` |
| Couleurs d'un biome | `src/config/biomes.ts` |
| Densité et nature de la végétation | `src/components/environment/Vegetation.tsx` |
| Bloom, tilt-shift, vignette | `src/components/PostFX.tsx` |
| Lumières, ombres | `src/components/Environment.tsx` |
| Animation du personnage | `src/components/models/HeroPlaceholder.tsx` |
| Minimap | `src/components/Minimap.tsx` |
| Vie, phase de partie, score | `src/store/useGameStore.ts` |
| Statistiques et placement des ennemis | `src/config/enemies.ts` |
| IA, dégâts, recul, mort | `src/components/Enemy.tsx` |
| Apparence des ennemis | `src/components/enemies/models.tsx` |
| Cœurs, flash de dégâts, Game Over | `src/components/HUD.tsx` + `src/index.css` |
