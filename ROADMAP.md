# z-project — état du projet

Mini-jeu 3D navigateur inspiré de Zelda, pour portfolio front-end.
Direction artistique : **diorama low-poly cozy** — cel-shading, FOV étroit,
tilt-shift. La recette caméra + post-traitement du HD-2D, appliquée à de la 3D.

Dernière mise à jour : 27 août 2026 — occlusion de la canopée, renvoi des
projectiles, réceptacle de cœur au temple, écume, lune, son, réglage de qualité
et découpage du bundle.

---

## 1. Ce qui est fait

### Socle technique
- Vite 8 + React 19 + TypeScript 6
- three 0.185, @react-three/fiber 9, drei 10, rapier 2, postprocessing 3, zustand 5
- Type-check et build de production passants
- `?debug` dans l'URL affiche les colliders Rapier
- En développement, `window.playerTransform`, `window.gameWorld`, `window.__store`,
  `window.__enemies()`, `window.__enemyRegistry`, `window.__lastSwing` et
  `window.vegetationCounts` sont exposés pour inspecter l'état depuis la console
  ou depuis un test navigateur. `__lastSwing` existe parce que la traînée de
  lame ne dure que 230 ms : trop court pour être attrapé de façon fiable par une
  capture d'écran, il fallait pouvoir *mesurer* le verdict au lieu de le voir
- Trois crochets ajoutés depuis, tous pour la même raison — un test navigateur
  en rendu logiciel tourne à ~1 fps, il ne peut pas *provoquer* une situation,
  il faut pouvoir la poser :
  `window.__playerBody` (déplacer le joueur à un point précis de la carte),
  `window.__projectiles` (poser une balle factice et vérifier la parade),
  `window.__occlusionFade` (forcer l'opacité du fondu à 1 pour rendre deux fois
  le même point de vue, avec et sans effacement, et comparer)

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
- Montagne enneigée au nord-ouest, **deux îles** au large : celle du sud-est et
  l'îlot de Nakano, au nord-est
- **Île du sud-est atteignable à pied** par un haut-fond guéable — pas de
  système de nage
- **Îlot de Nakano atteignable par un pont**, depuis la plage des terres arides.
  Une rampe droite de 17 unités à 16,7°, sur piles, précédée d'un torii
  vermillon. Les deux ancrages sont **lus dans le relief** au chargement
  (`config/bridge.ts`) : le tablier affleure le sol à ses deux bouts, donc on
  entre et on sort du pont sans marche — un personnage sans autostep ne franchit
  aucune marche, c'est le piège déjà payé sur l'escalier du temple.
  L'ancrage côté îlot est le **point de tangence** de la droite la plus raide
  qu'on puisse tirer depuis le pied : viser le bord du plateau enfonçait le
  tablier de 22 cm dans un flanc qui monte à 1,36 de pente
- Collider `Heightfield` Rapier construit à partir de la même grille que le
  mesh visuel : alignement vérifié à 0,00 unité près
- Végétation instanciée : ~7 600 props en 9 draw calls, vent en vertex shader
- Colliders sur les troncs et les gros rochers uniquement

### Points d'intérêt
- Table déclarative dans `src/config/landmarks.ts`. Trois systèmes la lisent
  sans se connaître : `sampleHeight` y creuse la terrasse du monument, le semis
  de végétation s'y interdit de pousser, la minimap y pose un repère
- **Cinq monuments de portfolio**, un par section, chacun dans un biome
  différent et chacun avec sa braise d'interaction :
  Temple du Sommet (montagne) → projets ; Pyramide de la Jungle → présentation ;
  Grande Stèle (jungle) → compétences ; Idole des Terres Arides → parcours ;
  Ruines de l'Île → contact
- **Un sixième lieu sans section** : le Temple de Nakano, une pagode à quatre
  toits sur l'îlot du nord-est. `section: null` veut dire « paysage, pas page » :
  il se découvre, il paraît sur la minimap et il creuse sa terrasse comme les
  autres, mais il n'a ni braise ni entrée au menu de téléportation — ce menu est
  la table des matières du portfolio, pas un index des monuments. Ce qu'on vient
  y chercher est dans le coffre posé à côté
- Sites choisis **par balayage de `sampleHeight`**, pas à vue : dénivelé naturel
  et pureté de biome mesurés sur tout le rayon avant de poser quoi que ce soit
- Le contenu de chaque section se ramène à une **forme unique** de diapositive
  (`portfolio/sections.ts`) : un seul panneau à maintenir, une seule façon de
  naviguer à apprendre
- **Temple du Sommet**, sur le point culminant de la crête nord-ouest.
  Péristyle ouvert de seize colonnes, entablement, deux frontons, escalier de
  façade, braseros, autel à cristal, colonnes couchées. Fusionné en trois
  géométries — un draw call par teinte de pierre
- Terrasse **creusée dans le relief** et non posée dessus : le mesh, le
  collider, le semis et la minimap voient tous la même plate-forme
- Bandeau « Lieu découvert » quand le joueur entre dans le rayon du monument
- **Marqueur d'interaction** : une braise bleue sur le parvis, devant
  l'escalier. Seule teinte froide de la scène, face aux deux braseros orange du
  temple ; elle grossit et s'intensifie quand le joueur entre à portée. C'est
  elle qui porte l'ancre d'interaction — pas le centre du monument, sans quoi le
  marqueur promettrait quelque chose là où il ne se passe rien
- **Interaction** : devant la braise, `F` ouvre un panneau qui présente les projets —
  illustration générée, titre, description, tags, navigation aux flèches et
  stepper. L'ouverture met la partie en pause
- **Illustrations générées** : emblèmes isométriques en SVG, un solide = trois
  aplats francs, transposition en 2D du `toonGradient` du rendu 3D. Motif déduit
  des tags du projet, palette prélevée sur le jeu, cadrage calculé. Zéro asset

### Objets et inventaire
- Table déclarative dans `src/config/items.ts` : un objet y déclare ce qu'il
  **fait** (cœurs bonus, multiplicateur d'attaque, silhouette, lame) ; ses
  libellés vivent dans `src/i18n/*.json`, le jeu étant bilingue
- **Un emplacement d'équipement par famille d'objet** (`ItemKind` sert de clé
  d'emplacement) : on porte la tenue *et* l'arme. Un emplacement unique aurait
  été plus court à écrire et faux à jouer — la deuxième trouvaille serait
  devenue un renoncement à la première
- **Tenue du Clan** (coffre de la pyramide) : +2 cœurs jaunes, silhouette ninja
- **Katana de Kusanagi** (coffre du temple de Nakano) : dégâts d'épée ×2, lame
  longue en main droite. L'effet est volontairement brutal — les PV des ennemis
  sont des entiers de 2 et 3, donc l'octorok tombe en un coup au lieu de deux et
  le moblin en deux au lieu de trois. Un bonus plus fin n'aurait rien changé
- Les dégâts sont lus **au moment du coup** (`swordDamage()` dans le store) et
  non mémorisés : l'inventaire met la partie en pause, l'arme peut donc changer
  entre deux frappes sans que l'ennemi en soit averti
- Le renvoi de projectile reste à 1 dégât : c'est une parade, pas une frappe
- Réserve de cœurs jaunes mémorisée par objet (`bonusCarry`) : retirer puis
  remettre une tenue ne soigne pas gratuitement
- Coffres décrits **dans le repère de leur monument** (`src/config/chests.ts`),
  jamais en coordonnées monde : un coffre posé en absolu se retrouve dans le
  vide au premier réglage du monument
- Séquence d'ouverture chronométrée en **temps réel** et non sur l'horloge de
  jeu, qui est gelée dès l'appui — même contrainte que l'overlay de téléportation

### Son
- **Entièrement synthétisé** en Web Audio, aucun fichier à télécharger : nappe
  de vent (bruit filtré dont le volume respire), pas, coup d'épée dans l'air,
  impact, saut, dégât, cœur ramassé, réceptacle
- Les pas sont déclenchés à la **distance parcourue** et non à intervalle de
  temps : c'est ce qui les garde synchronisés avec le cycle de marche, lui aussi
  piloté par la vitesse réelle
- **Coupé par défaut**, allumé d'un clic. Un portfolio qui se met à souffler du
  vent sans prévenir est agaçant, et le geste qui allume le son est justement
  celui qui autorise l'audio au regard de la politique d'autoplay du navigateur

### Réglage de qualité
- Deux niveaux, persistés, avec estimation de départ (appareil tactile ou peu de
  cœurs → qualité réduite). Quatre leviers : densité de végétation (100 % / 55 %),
  shadow map (2048² / 1024²), post-traitement, lumière ponctuelle du cristal
- La densité rogne le **nombre de tirages** du semis, pas leur résultat : la
  graine étant fixe, un massif ne se redessine pas ailleurs, il s'éclaircit
- **Non mesuré sur GPU intégré** : le réglage agit, mais le seuil à partir
  duquel il devient nécessaire n'a pas été relevé sur une vraie machine modeste

### Internationalisation
- Dictionnaires typés `src/i18n/{fr,en}.json`, **sans dépendance**. Le français
  définit la forme, l'anglais doit s'y conformer — dans les deux sens, clé
  manquante *et* clé en trop, vérifié à la compilation
- Tout le texte visible passe par le dictionnaire : HUD, Game Over, rappels de
  touches, noms de biomes, noms de lieux, panneau portfolio
- Sélecteur FR/EN, préférence persistée, `<html lang>` posé dès le premier rendu

### Temps de jeu
- **Horloge de jeu unique** (`src/state/gameClock.ts`) : tous les délais de
  gameplay s'y rapportent, plus aucun appel à `performance.now()` dans le code
  exécutable. Elle cumule les mêmes deltas clampés que le déplacement, et
  n'avance pas hors de la phase `playing`
- Phase `paused` : physique Rapier gelée, joueur, ennemis, projectiles et cœurs
  figés, horloge arrêtée

### Rendu
- **Ciel étoilé procédural** : dégradé bleu à quatre paliers, halo
  atmosphérique, nébuleuses, Voie lactée avec voies sombres et bulbe galactique,
  quatre couches d'étoiles scintillantes avec extinction près de l'horizon.
  Entièrement calculé dans le fragment shader, aucune texture
- Couleur de brume **accordée à celle du ciel à l'horizon** : sans cet accord,
  le terrain lointain s'estompe vers une autre teinte que le ciel et l'image se
  coupe en deux sur la ligne d'horizon
- Le monde reste éclairé de jour : seules les teintes des lumières basculent
  vers le parme, les intensités sont inchangées
- Cel-shading `meshToonMaterial` + rampe de dégradé partagée
- Sol peint par sommet, transitions de biome continues
- FOV 35 + bloom + tilt-shift + vignette
- Trois sources de lumière (clé chaude, rebond froid, contre-jour)
- Soleil et shadow camera qui suivent le joueur
- Mer translucide avec houle et normales calculées dans le vertex shader
- **Écume au rivage**, tirée d'une carte de profondeur cuite au démarrage depuis
  `sampleHeight` : la frange suit exactement la ligne où le terrain croise le
  niveau de la mer, sur le continent comme autour de l'île. Deux bandes — une
  nappe large et un liseré vif — dont le bord ondule comme un ressac
- **Lune procédurale** : disque à mers, assombrissement du limbe et halo qui
  accroche le bloom. Placée à 4,5° d'élévation parce que le ciel n'occupe que
  les sept degrés au-dessus de l'horizon, et décalée en azimut pour ne pas se
  superposer au bulbe galactique
- **Effacement de la végétation qui passe entre la caméra et le joueur** :
  fondu par tramage (*screen-door*) dans le fragment shader, sur un test de cône
  œil → joueur. Le matériau reste opaque, donc aucun tri de transparence à
  gérer sur un `InstancedMesh`. Seules les familles hautes sont concernées

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
- **Temps de préparation avant chaque attaque** (560 ms pour l'Octorok, 420 ms
  pour le Moblin) : le corps se ramasse, puis se détend au moment du coup.
  Sortir de portée pendant la préparation **annule** le coup — c'est ce qui rend
  l'esquive possible
- **Dispersion du tir** de l'Octorok (±5°). Sans elle, un tir dirigé sur la
  position courante du joueur ne peut pas être esquivé par quelqu'un qui avance
  vers le tireur : sur cet axe, se déplacer ne change rien à l'interception
- **Traînée de lame** à chaque coup : dorée quand le coup porte, bleu pâle et
  retombante quand il part dans le vide. Elle matérialise aussi la portée réelle
  de l'épée, que rien n'indiquait auparavant
- **Renvoi des projectiles au coup d'épée.** Une balle parée change de camp :
  elle vise l'ennemi vivant le plus proche, vire à l'or (le même que la traînée
  d'un coup qui porte) et inflige un point de dégât. Évalué une fois par swing
  et par projectile, jamais par test de fenêtre
- **Cœurs lâchés** par 40 % des ennemis vaincus. Ils se posent sur le relief via
  le même échantillonneur que le terrain, flottent, palpitent en fin de vie, et
  ne sont consommés que si le joueur a quelque chose à soigner

### Interface
- HUD : cœurs, rappel des contrôles
- Flash rouge à chaque coup encaissé, clignotement du joueur pendant les i-frames
- Écran de Game Over avec nombre d'ennemis vaincus et bouton de relance
- **Minimap** en haut à gauche : fond de carte pré-rendu avec ombrage de relief,
  position et cap du joueur, **ennemis vivants**, **monuments** (losange doré,
  affiché avant d'être découvert : c'est ce qui donne une destination), nom du
  biome courant
- **Calque de combat** en canvas 2D par-dessus la scène :
  - barres de vie segmentées (un segment = un coup d'épée) au-dessus des ennemis
    engagés ou récemment blessés, dimensionnées par la perspective ;
  - chevrons d'alerte au sol pour les tirs venus de hors cadre, posés du côté
    d'où vient la menace et pointant vers le joueur
- Cinq cœurs au lieu de trois
- Bandeau de découverte d'un lieu, animé en CSS pur, sans état piloté depuis React
- **Réceptacle de cœur** sur l'autel du temple : un cœur maximal de plus et la
  vie refaite, ramassé en marchant jusqu'à l'autel. Bandeau dédié, rouge, décalé
  sous celui de la découverte — les deux se déclenchent à quelques secondes
  d'intervalle au temple
- Les barres de vie sont **masquées par le relief** : le segment caméra → ennemi
  est sondé sur `sampleHeight`, donc un ennemi derrière une colline n'affiche
  plus sa vie par-dessus la pierre
- Rangée de réglages en haut à droite : son, qualité graphique, langue

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
| Calque de combat en canvas 2D, hors du Canvas 3D | Un billboard par ennemi ajouterait un draw call et un matériau transparent par ennemi, donc du tri de transparence ; `<Html>` de drei reprojetterait des nœuds DOM à chaque frame. Ici tout tient dans un canvas et une boucle. Même raisonnement que la minimap. |
| Terrasse d'un monument creusée dans `sampleHeight`, jamais posée sous le modèle | Le mesh, le collider Rapier, le semis et la minimap interrogent tous `sampleHeight`. Y mettre la plate-forme garantit qu'ils voient la même. Un socle côté modèle 3D aurait été une seconde source de vérité : le joueur aurait marché à côté du sol qu'il voit. |
| La caméra est fixe et regarde le nord : un monument haut présente sa façade au **sud** | Le joueur qui aborde un monument par le nord l'a dans le dos, et le marqueur posé de ce côté disparaît derrière la pierre. La règle « la façade regarde le centre de la carte » cède devant celle-ci dès que le monument est assez haut pour se masquer lui-même. |
| Un solide décoratif **mord** dans celui qu'il habille | Deux faces coplanaires de même orientation clignotent — le tampon de profondeur ne peut pas les départager. Affleurer est donc interdit ; `Z_FIGHT_LIFT` donne l'écart minimal. |
| Une terrasse peut avoir un rayon **nul** | Le sommet de l'île est déjà plat à la valeur près (6,100 sur 5,2 unités de rayon, le masque d'île y sature). Y poser une terrasse *raidissait* le flanc de 1,00 à 1,50 : le fondu maintient la hauteur au-dessus de la pente naturelle, qui doit ensuite rattraper plus bas. Aplanir n'est donc pas toujours améliorer, et le cas se vérifie avant de trancher. |
| L'ancre d'interaction est portée par le marqueur, pas par le centre du monument | Un marqueur lumineux promet au joueur que quelque chose est possible *ici*. Si la zone qui déclenche l'invite était ailleurs, il mentirait : on se plante devant la flamme et rien ne se passe. `Landmark.interact` est donc calculé depuis la position locale du marqueur, une seule constante pour les deux. |
| Collider d'escalier en **rampe**, pas en marches | Le personnage est piloté en vélocité, sans autostep. Sur l'arête d'une marche la normale de contact est quasi horizontale : elle repousse, elle ne soulève pas — mesuré, le joueur restait bloqué contre un gradin de 0,22. Une rampe donne une normale verticale, et la résolution de pénétration le fait monter, comme sur le flanc de la montagne. |
| Matrice view-projection publiée dans `cameraView` | Le calque doit reprojeter des points monde alors qu'il vit hors de React. On publie la seule chose dont il a besoin, pas la caméra entière. |
| Projection écrite à la main plutôt que `Vector3.applyMatrix4` | Cette dernière divise par `w` sans en garder le signe : un point **derrière** la caméra ressort projeté devant, en miroir. C'est justement le cas qui compte — un tireur hors cadre est presque toujours dans le dos du joueur. |
| Chevron d'alerte posé dans le monde, pas en 2D | Placé au sol sur un cercle autour du joueur puis projeté, il hérite de la perspective sans qu'on ait à calculer l'ellipse qu'un cercle devient à l'écran. |
| Traînée de lame en `ShaderMaterial` | Le dégradé tête-queue et l'affinement des bords sont calculés par pixel : la traînée se réduit à 40 segments de géométrie, sans texture à charger, et reste nette à toute taille. |
| Préparation d'attaque en **drapeau consommé** | Un `windupPending` booléen, jamais un test « sommes-nous dans la fenêtre de préparation ? ». Voir la famille de bugs ci-dessous. |
| Effacement de la canopée par **tramage** et non par transparence | La végétation est instanciée : passer un `InstancedMesh` en `transparent` obligerait le renderer à trier des milliers d'instances entre elles, ce qu'il ne sait pas faire — la canopée se mettrait à clignoter selon l'ordre de rendu. En jetant un pixel sur N, le matériau reste opaque, continue d'écrire dans le tampon de profondeur et se trie normalement. |
| L'arbre effacé **projette toujours son ombre** | La passe d'ombres utilise un matériau de profondeur distinct, qui ne reçoit pas le patch. Le corriger coûterait un second matériau ; et c'est l'ombre qui dit au joueur que l'arbre est encore là. |
| Occultation des barres de vie par sondage de `sampleHeight`, pas par raycast Rapier | Le calque de combat vit hors de R3F et n'a pas le monde physique sous la main. Un raycast coûterait une requête physique par ennemi et par frame pour voir en plus les troncs — or un tronc est trop fin pour cacher une barre plus d'une fraction de seconde. Le relief est l'occultant qui gêne, et `sampleHeight` est déjà la source de vérité de tout le monde. |
| Écume tirée d'une carte de profondeur **cuite au démarrage** | Le shader n'a pas accès au bruit du relief, qui est du JavaScript. Cuire `sampleHeight` une fois garantit que la ligne de rivage de l'écume est celle du mesh, du collider et de la minimap. L'alternative — lire le tampon de profondeur — coûte une passe de rendu de plus pour une frange de deux unités de large. |
| Balle renvoyée portée par le **même pool**, avec un drapeau | Un second pool dupliquerait l'intégration du mouvement, la collision avec le relief et le rendu instancié, pour un objet qui ne diffère que par son camp. |
| Collision de la balle renvoyée testée dans `Enemy.tsx`, pas dans la boucle des projectiles | Les PV vivent dans le composant de l'ennemi. Les tester ailleurs créerait une seconde source de vérité ; le projectile, lui, n'a qu'à être désactivé. |
| Son **synthétisé**, jamais échantillonné | Même promesse que la végétation, le ciel et les illustrations : rien à télécharger. Un pas et un coup d'épée ne sont que du bruit filtré et une enveloppe. |
| Son **coupé par défaut** | Un portfolio qui souffle du vent sans prévenir est agaçant — et le geste par lequel le visiteur allume le son est précisément celui qui autorise l'audio au regard de la politique d'autoplay. |
| Découpage du bundle par **vitesse de changement**, pas par graphe de dépendances | Le total téléchargé ne bouge pas : une scène 3D a besoin de tout dès la première frame. Ce qu'on gagne est le cache du navigateur — le code du jeu change à chaque commit, `three` et Rapier une ou deux fois par an. |
| Cœurs et projectiles en pools hors React et hors Rapier | Même raison : durée de vie courte, aucune allocation en cours de partie, et le redémarrage n'a qu'à vider les pools. |

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

**Étoiles invisibles.** Le rayon des étoiles était exprimé en unités de cellule
du champ procédural, pas en angle : à l'échelle utilisée, chaque étoile faisait
moins d'un pixel. Le ciel paraissait vide malgré des milliers d'étoiles
calculées. Corrigé en donnant le rayon en radians, converti en unités de cellule
dans le shader.

**Ciel coupé en deux.** Le terrain lointain s'estompait vers une brume claire
tandis que le ciel restait sombre juste au-dessus : la ligne d'horizon formait
une frontière nette. Ce n'était pas un défaut du ciel mais un désaccord entre
deux couleurs — celle de la brume et celle du ciel à l'horizon doivent être
appariées à la main. Les transitions du dégradé ont aussi été étalées : la
bande de ciel visible ne fait que 7°, tout palier plus court s'y lit comme une
cassure.

**Ciel invisible, deuxième fois.** La caméra plongeait de 35° pour un demi-FOV
de 17° : l'horizon ne pouvait mathématiquement pas entrer dans le cadre. C'est
la **visée** (`lookAtHeight`), pas la position de la caméra, qui décide du
cadrage — la relever fait apparaître le ciel sans renoncer au point de vue en
surplomb.

**Verdict du coup calculé dans sa propre fenêtre d'affichage.** La traînée de
lame décide de sa couleur selon que le coup a porté ou non. Ce verdict était
calculé à l'intérieur du test d'affichage — or la traînée ne dure que 230 ms.
Sur une machine lente, aucune frame ne tombe dans cet intervalle : le verdict
n'était jamais rendu et le retour visuel disparaissait exactement là où il sert
le plus. Le verdict est maintenant établi avant le test d'affichage. Variante du
même piège de famille, un cran plus subtile : ce n'était pas l'événement qui
était échantillonné, mais le moment où on décidait de le regarder.

**Tir impossible à esquiver de face.** L'Octorok visait exactement la position
courante du joueur. Sur l'axe qui relie les deux, se déplacer ne change rien à
l'interception : un joueur qui charge le tireur est touché à tous les coups.
Mesuré sur le vrai code de tir, 800 tirs par cas — voir le tableau plus bas.
Corrigé par une dispersion angulaire de ±5°, qui s'ouvre avec la distance.

**Faces horizontales qui clignotent (z-fighting).** Sur la pyramide, le bandeau
sombre qui ceinture chaque gradin avait sa face supérieure **exactement dans le
plan** de celle du gradin. Deux surfaces à la même profondeur et de même
orientation : le tampon de profondeur n'a pas de départage, et elles clignotent
selon l'angle de vue. Mesuré en inspectant la géométrie fusionnée depuis la
page — six paires de faces coplanaires qui se recouvrent, à y = 1,35 / 2,70 /
4,05 / 5,40 / 6,75 / 8,10, soit les six sommets de gradins. Même situation sur
les volées d'escalier, dont une marche sur deux tombait sur une cote de gradin.

Corrigé par une règle générale : **un solide décoratif mord dans celui qu'il
habille**, il n'affleure jamais avec lui (`Z_FIGHT_LIFT` dans `solids.ts`). Le
contrôle est reproductible et vaut pour tout futur monument : lister les plans
des faces tournées vers le haut, par teinte, et vérifier qu'aucun n'est partagé
par deux teintes avec recouvrement en XZ. Les cinq monuments passent à zéro.

À noter : **le symptôme ne se reproduit pas en rendu logiciel**. Comparaison de
frames au même point de vue, avec et sans le correctif : 0,52 % contre 0,67 %
de pixels instables, l'écart étant du bruit de bord sous-pixel — pour repère, la
canopée agitée par le vent est à 9,1 % et le ciel fixe à 0,04 %. C'est la
géométrie qui prouve le défaut, pas l'image.

**Pièces d'un empilement qui flottent.** Trouvées en auditant la même classe
d'erreur : les socles des fûts des ruines étaient 18 cm au-dessus du dallage, la
dalle de l'autel 22 cm au-dessus de lui, et la tête de l'idole laissait un jour
de 2,5 cm au cou. Cause commune : une arithmétique d'empilement recalculée de
proche en proche à chaque ligne. Corrigé en nommant les cotes de sommet.

**Marches infranchissables.** Le stylobate du temple avait des gradins de 0,22,
soit moins que le rayon de la capsule du joueur (0,35) : on pouvait croire
qu'elle roulerait par-dessus. Mesuré en pilotant le jeu, elle n'en franchissait
aucune — le joueur restait collé au socle, vitesse nulle. La hauteur n'est pas
en cause : c'est le mode de déplacement. Vélocité imposée en XZ, Y laissé à la
gravité, aucun autostep — la normale de contact sur une arête est presque
horizontale, donc elle repousse au lieu de soulever. Corrigé en remplaçant les
marches de l'entrée par une volée fine dont le collider est **une seule rampe à
9,5°**. À retenir pour tout futur décor praticable : dans ce jeu, une marche est
un mur, seule une pente se monte.

**Ennemis increvables dans le dos.** Sans souris ni caméra libre, il n'existe
aucun moyen de se retourner sur place : un ennemi passé derrière le joueur ne
pouvait plus jamais être touché. Mesuré : dix coups d'affilée dans le vide.
Corrigé par une visée assistée circulaire.

**`manualChunks` n'est qu'une indication sous Rolldown.** Le découpage du bundle
a d'abord semblé ne rien faire : la fonction était bien appelée, `three` y était
bien assigné au groupe « three », et il se retrouvait quand même fondu dans le
chunk de physique, qui pesait alors 3,1 Mo à lui seul — c'est-à-dire tout le
bundle moins des miettes. Deux choses à retenir : utiliser `advancedChunks`, qui
fait des groupes fermes, et se méfier de l'ordre des règles — un groupe
`three` écrit `/(three|@react-three)/` et placé après `physics` renvoyait de
nouveau tout le moteur du mauvais côté, parce que le chemin de
`@react-three/rapier` contient lui aussi « three ». La règle qui marche cible
`node_modules/three/` seul, et passe en premier.

**Deux commentaires GLSL qui cassaient la compilation TypeScript.** Les shaders
sont écrits dans des littéraux gabarits. Un commentaire de shader contenant un
mot entre accents graves — l'idiome du reste du projet pour citer un
identifiant — ferme le littéral au milieu du code. Le message d'erreur (`','
expected`) ne pointe évidemment pas sur la cause. Dans un bloc `/* glsl */`, on
cite sans accents graves.

---

### Taux de touche d'un tir d'Octorok, mesuré

800 tirs par case, sur le vrai `fireProjectile` avec sa dispersion et sa
compensation balistique. C'est ce tableau qui a fixé la dispersion à ±5°.

| Comportement du joueur | 4 u | 8 u | 11 u | 15 u |
| --- | --- | --- | --- | --- |
| Immobile | 100 % | 88 % | 67 % | 45 % |
| Pas de côté, 3,5 u/s | 14 % | 0 % | 0 % | 0 % |
| Pas de côté, 7 u/s | 0 % | 0 % | 0 % | 0 % |
| **Charge droit sur le tireur, 7 u/s** | **100 %** | **100 %** | **86 %** | **50 %** |
| Approche en diagonale, 7 u/s | 0 % | 0 % | 0 % | 0 % |

Ce que ça donne comme jeu : rester planté ou foncer tout droit est puni,
approcher en diagonale ne l'est pas. C'est une règle qui s'apprend en une
rencontre, et le temps de préparation plus le chevron d'alerte donnent le
signal pour l'appliquer.

---

## 4. Ce qu'il reste à faire

> Le chantier **points d'intérêt interactifs** (dialogue portfolio au temple,
> socle i18n, horloge de jeu unique, phase `paused`) a son plan détaillé dans
> [`docs/plan-poi-portfolio.md`](docs/plan-poi-portfolio.md) — tâches, code des
> parties porteuses, vérifications, et informations manquantes à trancher.

### Priorité 1 — équilibrage et lisibilité du combat — **fait**
- [x] Barres de vie au-dessus des ennemis engagés
- [x] Indicateur de direction quand on se fait tirer dessus hors écran
- [x] Retour visuel quand un coup part dans le vide (traînée de lame)
- [x] Cœurs lâchés par les ennemis vaincus
- [x] Équilibrage : cinq cœurs, temps de préparation avant chaque attaque,
      portée de tir de l'Octorok ramenée de 22 à 15 unités pour neuf unités
      d'approche à découvert, dispersion du tir, rayon de collision des
      projectiles ramené de 0,85 à 0,62 (la capsule du joueur n'en fait que 0,35)

Reste ouvert sur ce chantier, et il ne se referme qu'en jouant :
- [ ] Vérifier la difficulté **manette en main**. Toutes les mesures de timing
      ont été faites en rendu logiciel headless à ~1 fps, où le déplacement
      tourne vingt fois moins vite que les délais d'attaque. Les leviers sont
      `MAX_HEARTS`, `HEART_DROP_CHANCE`, `telegraphMs` et `spread`
- [x] Barres de vie non occultées — fait : le segment caméra → ennemi est sondé
      sur `sampleHeight`, une douzaine de points, et seulement pour les ennemis
      qui ont déjà passé les filtres d'engagement et de distance. Limite connue :
      un tronc ne masque pas la barre, seul le relief le fait
- [x] Renvoyer les projectiles d'un coup d'épée — fait : la balle parée vise
      l'ennemi vivant le plus proche, vire à l'or et inflige un point

### Priorité 2 — confort et finition
- [x] **Occlusion des arbres** — fait : fondu par tramage dans le fragment
      shader des familles hautes, sur un test de cône œil → joueur. Rien n'est
      retiré de la carte, ni collider ni ombre — le prop redevient plein dès
      qu'il sort de l'axe
- [x] **Point d'intérêt au sommet de la montagne** — Temple du Sommet, fait
- [x] Point d'intérêt sur l'île — fait : les Ruines de l'Île portent la section
      contact
- [x] Donner une **raison de monter** au temple — fait : il présente les projets
- [x] Donner une **récompense** au temple — fait : un réceptacle de cœur sur
      l'autel, un cœur maximal de plus et la vie refaite
- [ ] Vérifier **manette en main** que le sommet vaut le déplacement : l'accès
      n'a été mesuré que par la pente (0,24 à 0,36 sur la crête sud-ouest, contre
      1,25 sur les trois autres flancs), jamais joué
- [x] Écume au bord de l'eau — fait
- [x] Corps céleste dans le ciel — fait : une lune procédurale. La planète
      annelée reste écartée, c'est son anneau qui posait problème
- [x] Son : ambiance, pas, épée — fait, entièrement synthétisé

### Priorité 3 — performance et livraison
- [x] **Double horloge — réglée.** Une horloge de jeu unique
      (`src/state/gameClock.ts`) cumule les deltas clampés et s'arrête hors de
      `playing`. La mise en pause du panneau portfolio l'a rendue inévitable :
      sans elle, un dialogue ouvert trente secondes faisait expirer tous les
      cœurs au sol et déclenchait toutes les attaques à la fermeture. Détail du
      problème d'origine, conservé pour mémoire :

- [x] ~~**Double horloge.**~~ Le déplacement avance en temps *simulé* (`delta`
      clampé à 0,05 s pour éviter la téléportation après un changement
      d'onglet), tandis que cooldowns, temps de préparation, i-frames et durées
      de vie sont lus sur `performance.now()`, donc en temps *réel*. Sous
      20 fps le clamp mord et les deux horloges divergent : tout se déplace au
      ralenti pendant que les ennemis continuent d'attaquer à cadence normale,
      et les cœurs au sol expirent avant d'avoir touché terre. Mesuré en rendu
      logiciel à 1 fps, où le facteur atteint 20. Atteignable sur un GPU
      intégré. Correctif : tenir une horloge de jeu unique, cumulant les
      `delta` clampés, et y rapporter tous les délais de gameplay
- [x] Bundle en un seul chunk — découpé. Le total est inchangé (3,6 Mo, 1,2 Mo
      gzip : une scène 3D a besoin de tout dès la première frame), mais il est
      réparti en `physics` 2,4 Mo, `three` 729 ko, `index` 200 ko, `react`
      178 ko et `postfx` 87 ko. Ce qu'on gagne est le cache du navigateur entre
      deux déploiements, pas des octets
- [x] Prévoir un **réglage de qualité** — fait : deux niveaux, quatre leviers
      (densité de végétation, shadow map, post-traitement, lumière ponctuelle),
      persistés, avec estimation de départ
- [ ] **Mesurer le framerate sur GPU intégré.** Le réglage existe mais le seuil
      à partir duquel il devient nécessaire n'a jamais été relevé sur une vraie
      machine modeste : le poste de développement ne rend qu'en logiciel, à
      ~1 fps quel que soit le niveau, ce qui ne dit rien d'utile. À faire sur
      une machine, pas depuis un test
- [ ] Les ennemis coûtent ~150 draw calls à 26 unités : instancier les parties
      communes **si** le framerate décroche. Volontairement pas fait tant que le
      point précédent n'a pas donné de chiffre — c'est une optimisation qui
      complique le code des modèles, elle doit être justifiée par une mesure
- [x] Le cristal du temple ajoute la seule lumière ponctuelle de la scène, donc
      une passe d'éclairage supplémentaire dans *tous* les shaders — elle est
      maintenant coupée par le réglage de qualité réduite
- [x] Écran de chargement — fait (`BootScreen`, `#boot` dans `index.html`)

### Plus tard
- [ ] Quêtes, dialogues
- [ ] **Portée de l'arme.** Le katana est plus long à l'écran seulement : la
      hitbox et la traînée dérivent de `ATTACK.reach`, et `SwordArc` construit
      sa géométrie **une fois pour toutes** au chargement. Faire varier la
      portée avec l'arme demande de reconstruire cet anneau à chaque équipement,
      donc de sortir `ATTACK.reach` de la constante — à faire le jour où une
      deuxième arme le justifie, pas pour une seule
- [ ] **Autel plutôt que coffre pour les armes.** Le katana sort d'un coffre de
      bois comme la tenue du clan, parce que toute la séquence de révélation
      (couvercle, colonne de lumière, éclats, objet qui s'élève, carte) vit dans
      `TreasureChest.tsx` et qu'elle est réglée. Une lame plantée dans une
      pierre se lirait mieux ; ça demande de séparer la machine à états du
      trésor de la géométrie du coffre
- [ ] Modèles `.glb` riggés + animations Mixamo pour le héros
- [ ] Cycle jour/nuit
- [ ] Réceptacles de cœur sur les autres monuments : l'infrastructure est
      générique (`HeartContainer`, `heartContainers` dans le store), il ne
      manque qu'un emplacement par monument. Volontairement laissé au temple
      seul pour l'instant — cinq réceptacles feraient dix cœurs, et
      l'équilibrage du combat n'a toujours pas été joué

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
| Relief, position de la montagne, des îles, du gué | `src/config/world.ts` |
| Tracé, largeur et ancrages du pont de Nakano | `src/config/bridge.ts` |
| Charpente du pont, torii, piles, garde-corps | `src/components/environment/Bridge.tsx` |
| Cotes, étages et toitures de la pagode | `src/components/environment/Pagoda.tsx` |
| Couleurs d'un biome | `src/config/biomes.ts` |
| Position, cap, terrasse et rayon de découverte d'un monument | `src/config/landmarks.ts` |
| Géométrie, cotes et colliders du temple | `src/components/environment/Temple.tsx` |
| Ajouter un monument | `src/config/landmarks.ts` + un composant, monté dans `src/components/environment/Landmarks.tsx` |
| Bandeau « Lieu découvert » | `src/components/HUD.tsx` + `.discovery` dans `src/index.css` |
| Apparence du marqueur d'interaction | `src/components/environment/InteractionMarker.tsx` |
| Emplacement du marqueur et zone d'interaction | `TEMPLE_MARKER_Z` et `interact` dans `src/config/landmarks.ts` |
| Textes affichés, dans les deux langues | `src/i18n/fr.json` et `src/i18n/en.json` |
| Projets montrés par le temple | `featured` dans `src/i18n/*.json` |
| Apparence des illustrations de projet | `src/components/portfolio/illustration/` |
| Panneau portfolio (mise en page, navigation) | `src/components/portfolio/PortfolioDialog.tsx` + `.portfolio*` dans `src/index.css` |
| Touche d'interaction, rayon d'ouverture | `src/config/controls.ts`, `interactRadius` dans `src/config/landmarks.ts` |
| Délais de gameplay, pause | `src/state/gameClock.ts` |
| Densité et nature de la végétation | `src/components/environment/Vegetation.tsx` |
| Bloom, tilt-shift, vignette | `src/components/PostFX.tsx` |
| Ciel, Voie lactée, étoiles | `src/components/environment/StarrySky.tsx` |
| Lumières, ombres | `src/components/Environment.tsx` |
| Animation du personnage | `src/components/models/HeroPlaceholder.tsx` |
| Minimap | `src/components/Minimap.tsx` |
| Vie, phase de partie, score | `src/store/useGameStore.ts` |
| Effets d'un objet : cœurs bonus, multiplicateur d'attaque, silhouette, lame | `src/config/items.ts` |
| Dégâts d'un coup d'épée arme nue | `SWORD_DAMAGE` dans `src/store/useGameStore.ts` |
| Emplacements d'équipement (un par famille d'objet) | `ItemKind` dans `src/config/items.ts` |
| Contenu et position d'un coffre | `src/config/chests.ts` |
| Géométrie des armes tenues en main | `Sword` et `Katana` dans `src/components/models/HeroPlaceholder.tsx` |
| Statistiques et placement des ennemis | `src/config/enemies.ts` |
| IA, dégâts, recul, mort | `src/components/Enemy.tsx` |
| Apparence des ennemis | `src/components/enemies/models.tsx` |
| Cœurs, flash de dégâts, Game Over | `src/components/HUD.tsx` + `src/index.css` |
| Nombre de cœurs de départ | `src/store/useGameStore.ts` (`MAX_HEARTS`) |
| Fréquence des cœurs lâchés | `src/config/enemies.ts` (`HEART_DROP_CHANCE`) |
| Temps de préparation, dispersion du tir, portées | `src/config/enemies.ts` |
| Barres de vie, chevrons d'alerte | `src/components/CombatOverlay.tsx` |
| Traînée de lame (couleurs, ouverture, inclinaison) | `src/components/SwordArc.tsx` |
| Apparence et durée de vie des cœurs au sol | `src/components/Pickups.tsx` + `src/state/pickups.ts` |
| Rayon et opacité de l'effacement de la canopée | `RADIUS` et `MIN_ALPHA` dans `src/components/environment/occlusionFade.ts` |
| Quelles familles de props s'effacent | `withOcclusionFade(...)` dans `materials`, `src/components/environment/Vegetation.tsx` |
| Largeur et aspect de l'écume | `FOAM_DEPTH` dans `src/components/environment/shoreDepth.ts`, bandes dans `src/components/environment/Water.tsx` |
| Position, taille et teinte de la lune | `MOON_DIRECTION`, `MOON_RADIUS` dans `src/components/environment/StarrySky.tsx` |
| Renvoi des projectiles (rayon, vitesse, portée de visée) | `src/state/projectiles.ts` |
| Réceptacle de cœur : emplacement, rayon | `<HeartContainer>` dans `src/components/environment/Temple.tsx` |
| Ce que change chaque niveau de qualité | `QUALITY` dans `src/store/useQualityStore.ts` |
| Sons : timbre, volume, cadence des pas | `src/audio/sfx.ts`, `STRIDE_LENGTH` dans `src/components/Player.tsx` |
| Découpage du bundle | `advancedChunks` dans `vite.config.ts` |
