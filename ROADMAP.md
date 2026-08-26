# z-project — état du projet

Mini-jeu 3D navigateur inspiré de Zelda, pour portfolio front-end.
Direction artistique : **diorama low-poly cozy** — cel-shading, FOV étroit,
tilt-shift. La recette caméra + post-traitement du HD-2D, appliquée à de la 3D.

Dernière mise à jour : 26 août 2026 — cinq points d'intérêt, une section de
portfolio chacun.

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

### Points d'intérêt
- Table déclarative dans `src/config/landmarks.ts`. Trois systèmes la lisent
  sans se connaître : `sampleHeight` y creuse la terrasse du monument, le semis
  de végétation s'y interdit de pousser, la minimap y pose un repère
- **Cinq monuments**, un par section du portfolio, chacun dans un biome
  différent et chacun avec sa braise d'interaction :
  Temple du Sommet (montagne) → projets ; Pyramide de la Jungle → présentation ;
  Grande Stèle (jungle) → compétences ; Idole des Terres Arides → parcours ;
  Ruines de l'Île → contact
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

Reste ouvert sur ce chantier, à trancher en jouant :
- [ ] Vérifier la difficulté **manette en main** : toutes les mesures de timing
      ont été faites en rendu logiciel headless à ~1 fps, où le déplacement
      tourne vingt fois moins vite que les délais d'attaque (voir « double
      horloge » en priorité 3). Les leviers sont `MAX_HEARTS`,
      `HEART_DROP_CHANCE`, `telegraphMs` et `spread`
- [ ] Barres de vie non occultées : un ennemi engagé derrière une colline ou un
      tronc affiche quand même sa barre. Limité pour l'instant par le filtre
      « engagé ou blessé récemment, et à moins de 45 unités ». Un rayon vers la
      caméra le corrigerait, au prix d'une requête physique par ennemi et par
      frame
- [ ] Renvoyer les projectiles d'un coup d'épée, comme dans Zelda : le verdict
      du coup et la boucle des projectiles sont déjà en place

### Priorité 2 — confort et finition
- [ ] **Occlusion des arbres** : en jungle, une canopée passe régulièrement entre
      la caméra et le joueur. Solution prévue : fondu par tramage
      (*screen-door*) dans le fragment shader des canopées, en passant la
      position du joueur en uniform. Pas de tri de transparence à gérer.
- [x] **Point d'intérêt au sommet de la montagne** — Temple du Sommet, fait
- [ ] Points d'intérêt sur l'île, pour lui donner une raison d'exister.
      L'infrastructure est posée : ajouter une entrée dans `config/landmarks.ts`
      et un composant de géométrie suffit, terrasse, exclusion de végétation,
      repère de minimap et bandeau de découverte suivent tout seuls
- [x] Donner une **raison de monter** au temple — fait : il présente les projets
- [ ] Donner une **récompense** au temple. Il est aujourd'hui purement
      contemplatif : on y monte, le bandeau s'affiche, et il ne se passe rien.
      Un cœur maximal supplémentaire posé sur l'autel serait le geste le plus
      court, et `MAX_HEARTS` est déjà dans le store
- [ ] Vérifier **manette en main** que le sommet vaut le déplacement : l'accès
      n'a été mesuré que par la pente (0,24 à 0,36 sur la crête sud-ouest, contre
      1,25 sur les trois autres flancs), jamais joué
- [ ] Écume au bord de l'eau
- [ ] Corps céleste dans le ciel : la planète annelée a été retirée (anneau mal
      raccordé au globe, seule la moitié arrière était dessinée). À reprendre
      en dessinant l'anneau devant **et** derrière le globe, ou remplacer par
      une lune simple
- [ ] Son : ambiance, pas, épée

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
- [ ] Bundle à 3,5 Mo (1,2 Mo gzip) en un seul chunk — découper le code
- [ ] Mesurer le framerate sur GPU intégré ; prévoir un réglage de qualité
      (densité de végétation, résolution d'ombres, post-traitement)
- [ ] Les ennemis coûtent ~150 draw calls à 26 unités : instancier les parties
      communes si le framerate décroche
- [ ] Le cristal du temple ajoute **la seule lumière ponctuelle de la scène**,
      donc une passe d'éclairage supplémentaire dans *tous* les shaders,
      végétation instanciée comprise. Gardée parce que c'est elle qui détache la
      colonnade sur la neige, mais c'est le premier candidat à sauter sur GPU
      intégré : la retirer ne change rien à la lisibilité du lieu
      (`src/components/environment/Temple.tsx`, composant `Crystal`)
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
