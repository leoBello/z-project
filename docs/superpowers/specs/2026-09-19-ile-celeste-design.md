# Île Céleste — design

**Date :** 2026-09-19
**Branche :** `feature/ile-celeste`
**Maquette :** `docs/maquettes/2026-09-19-ile-celeste.html` (publiée sur
https://claude.ai/artifact/G9nzumiPugJT8tYwwNgRru)

## Objectif

Franchir le portail violet posé devant le Temple de Nakano emmène le joueur sur
une **seconde carte** : une île flottante inspirée de Laputa, dans *Le Château
dans le Ciel*. Les vestiges dorés d'une civilisation prospère, rendus à la
végétation, posés sur trois terrasses et portés par un socle de roche inversé.

L'île est **vide de gameplay** à ce stade : pas d'ennemi, pas d'objet, pas
d'énigme. Ce lot livre le terrain, les vestiges praticables, la transition entre
les deux cartes, et de quoi revenir. L'énigme puis le boss final viendront s'y
loger dans des lots suivants.

Le portail existe déjà (`src/components/environment/Portal.tsx`,
`src/config/portal.ts`), s'ouvre quand la carte est vidée de ses ennemis, et ne
propose aujourd'hui aucune interaction. Ce lot lui en donne une.

## Non-objectifs (YAGNI)

- **Aucun ennemi, aucun combat sur l'île.** `<Enemies>` n'est pas monté quand on
  y est.
- Aucun objet à ramasser, aucun coffre, aucun réceptacle de cœur.
- Aucune énigme, aucun mécanisme, aucun boss — le lot suivant.
- **Pas d'intérieur.** Tout est à ciel ouvert : on circule entre des murs et
  sous des arches, jamais sous un toit. Une salle couverte demanderait un second
  jeu de colliders et poserait à la caméra un problème d'occlusion qu'aucun
  système du projet ne traite aujourd'hui.
- Pas de cycle jour/nuit propre à l'île : elle réutilise le ciel du continent.
- Pas de météo, pas de son d'ambiance dédié (le bruit d'eau viendra avec
  l'énigme, si elle s'en sert).
- Pas de minimap animée de l'île au-delà d'un fond statique et du triangle du
  joueur.
- Aucune dépendance ajoutée.
- **Pas de refonte de `config/world.ts`.** Voir « Ce qu'on ne fait pas » plus bas.

## Décisions validées

| Sujet | Décision |
|---|---|
| Forme générale | Trois terrasses concentriques — prairie (r 34→55, alt. 0), enceinte (r 16→32, alt. +3,6), rotonde (r 0→14, alt. +7,2). Socle inversé de 46 de profondeur. Diamètre 110. |
| Franchissement | Falaise de pente 1,8 partout, sauf trois couloirs de rampe par marche, de pente 0,45. Les rampes du haut sont décalées de 60° de celles du bas. |
| Arrivée | Plein sud, en `(0, 0, 48)`. Imposé par la caméra, fixe et tournée vers le nord. |
| Vestiges | Enceinte crevée de brèches, porte au sud dans l'axe de la rampe, quatre tours, salle à colonnes, rotonde à coupole en encorbellement, aqueduc de sept travées, allée de statues. |
| Dorures | Six pièces seulement : frise d'enceinte, tympan de la porte, flèche de la grande tour, chapiteaux, coupole plaquée, mosaïque de l'arène. Elles ne subsistent que sur les pans restés debout. |
| Eau | Une source (bassin au pied de l'arbre), trois canaux le long des rampes, l'aqueduc, quatre cascades avec lame, écume et brume. |
| Arbre | Cime à 26, donc **hors du cadre de la caméra** depuis toute l'île. Assumé : c'est la sensation du film. |
| Chargement | Deux exemplaires — une silhouette toujours chargée, l'île réelle en fragment dynamique. |

## Décisions prises par défaut, à contredire si besoin

Ces deux-là n'ont pas été tranchées à la validation de la maquette. Elles sont
implémentées de la façon la plus simple qui rende la carte jouable ; les changer
plus tard coûte quelques lignes chacune.

| Sujet | Défaut retenu | Pourquoi | Ce que coûterait l'autre choix |
|---|---|---|---|
| Chute dans le vide | **Réapparition au point d'arrivée**, sans dégât, après un fondu violet court. | L'île est vide : mourir d'une chute sur une carte sans enjeu punit une exploration qu'on encourage par ailleurs. Et ça évite d'avoir à poser un parapet, donc de rogner la silhouette de la lèvre — qui est ce qui fait le vertige. | Une mort sèche : remplacer l'appel de réapparition par `damagePlayer(hearts)`. Un retour au continent : par la transition inverse. |
| Portail du retour | **Jumeau du portail de Nakano, au point d'arrivée, actif tout de suite.** | Sans boss, une île sans sortie est un cul-de-sac : le joueur devrait recharger la page. | Le réserver à la victoire sur le boss : un garde `if (!bossDefeated) return` dans son interaction, quand le boss existera. |

## Ce qu'on ne fait pas : la refonte de `config/world.ts`

L'analyse de chargement présentée avec la maquette concluait que « le vrai
chantier est dans `config/world.ts` », qui décrit le continent en dur et que
quatre systèmes interrogent sans se connaître. **Cette conclusion est revue à la
baisse, et il faut dire pourquoi.**

Le terrain de l'île **ne peut pas** passer par la même tuyauterie, quel que soit
le degré d'abstraction qu'on lui donne :

- le continent est un **champ de hauteurs sur une grille carrée**
  (`sampleHeight(x, z)`, `PlaneGeometry`, `HeightfieldCollider`). L'île est une
  **surface radiale** dont le contour est irrégulier ;
- surtout, l'île a un **dessous**. Un champ de hauteurs ne peut pas représenter
  un surplomb, par construction : à chaque `(x, z)` il n'associe qu'une altitude.
  Le socle inversé est un surplomb sur toute sa surface.

Généraliser `sampleHeight` pour couvrir les deux produirait une abstraction qui
ne sert qu'une fois et qui mentirait sur la seconde carte. On fait donc
l'inverse : **l'île apporte son propre terrain, son propre collider et son propre
fond de minimap**, et le seul concept partagé est « sur quelle carte est-on ».

Ce concept tient en un champ de store (`location`) et trois branchements —
`<Environment>`, `<Minimap>`, le point d'apparition du joueur. `config/world.ts`
n'est pas modifié.

## Architecture

### Le champ `location`

```ts
export type MapId = 'continent' | 'sky'
```

Dans le store : `location: MapId`, et `transit: MapId | null` pendant le voyage.
`reset()` les remet à `'continent'` / `null`.

### La transition

Elle réutilise le principe de `TeleportOverlay` — un voile plein écran séquencé
en **temps réel** (`setTimeout`), pendant que la phase est `paused` — mais avec
son propre composant et sa propre palette : violet, pas braises. Deux
téléportations qui se ressemblent seraient une confusion, l'une déplace dans une
carte, l'autre en change.

Chronologie, en millisecondes de temps réel :

| Palier | Ce qui se passe |
|---|---|
| 0 | `enterMap(to)` : `phase: 'paused'`, `transit: to`, le fragment de l'île commence à se télécharger. |
| 0 → 780 | Le violet monte et couvre l'écran. |
| 780 | Écran couvert. On **attend** que le fragment soit arrivé, puis `location: to`, le joueur est posé au point d'apparition de la carte d'arrivée. |
| → +900 | Le violet se retire. |
| fin | `phase: 'playing'`, `transit: null`. |

Le palier de 780 ms est un **plancher, pas une durée** : si le fragment n'est pas
encore là, le voile reste opaque. C'est la seule façon de ne jamais montrer un
écran vide, et c'est gratuit — sur une connexion normale le fragment arrive bien
avant.

### Le chargement différé

```
src/components/skyisland/SkyIsland.tsx   ← le point d'entrée, chargé en lazy
src/components/skyisland/*.tsx           ← tiré dans le même fragment
src/config/skyIsland.ts                  ← idem
```

`React.lazy(() => import('./skyisland/SkyIsland'))` suffit à ce que Vite en fasse
un fragment séparé. `enterMap` appelle en plus une fonction `preloadSkyIsland()`
qui déclenche le même `import()` : la promesse est mémoïsée, les deux chemins
partagent donc un seul téléchargement.

### La silhouette lointaine

`src/components/environment/SkyIslandDistant.tsx`, monté avec le continent et
jamais avec l'île. Une seule géométrie fusionnée à couleurs par sommet, un seul
matériau, `fog: false`, pas de physique, pas d'animation.

Placement, mesuré sur la caméra du jeu (`CAMERA` dans `config/gameplay.ts`) :
elle plonge de 17° pour un demi-champ vertical de 24°, donc **le bord haut de
l'image est à 7° au-dessus de l'horizontale** et la ligne d'horizon tombe aux
85 % de la hauteur d'écran. Tout ce qui dépasse 7° est hors cadre en permanence.

L'île est donc posée **à 500 unités au nord de la pagode de Nakano et 38 au-dessus
du niveau de la mer**, soit 2,7° d'élévation — au milieu du bandeau visible. Elle
est décalée de 90 unités à l'est de l'axe de la pagode : au centre du cadre elle
se lirait comme une cible de visée.

Sa position est **fixe dans le monde**, pas accrochée à la caméra : elle grossit
donc à mesure qu'on marche vers le nord.

### Le terrain de l'île

Toute la géométrie dérive de quatre fonctions pures dans `src/config/skyIsland.ts`,
portées telles quelles depuis la maquette :

| Fonction | Rôle |
|---|---|
| `rimRadius(theta)` | Rayon du bord, irrégulier. |
| `topHeight(r, theta)` | Altitude du dessus. Somme de deux marches et de la lèvre. |
| `underRadius(t, theta)` / `underHeight(t, theta)` | Le socle, paramétré de 1 (lèvre) à 0 (pointe). |

Le mesh visible est tiré à 128 secteurs × 64 anneaux. **Le collider est tiré des
mêmes fonctions, à 48 × 24**, et c'est délibéré : un `TrimeshCollider` sur le
maillage visible ferait 24 000 triangles pour une surface que le joueur parcourt
à pied, alors que 2 300 suffisent à ce qu'aucune marche ne se sente. Les deux
restent une seule source de vérité puisqu'ils échantillonnent la même fonction.

Le **socle n'a pas de collider** : on ne marche pas dessous.

### Les colliders des vestiges

Un `CuboidCollider` par pièce porteuse — pans d'enceinte, tours, piédroits de la
porte, piliers de la rotonde, piles d'aqueduc, socles de statue. Environ
quatre-vingt-dix, tous fixes, tous dans un seul `<RigidBody type="fixed">`.

Les pièces décoratives n'en ont pas : arcs, corniches, coupole, frises, mosaïque,
blocs tombés, végétation. On passe donc *sous* les arches, ce qui est le but, et
on marche *sur* les blocs tombés sans les escalader — un bloc d'une unité de haut
serait un mur pour un personnage sans autostep.

### La chute

Un `useFrame` dans l'île : si `playerTransform.position.y < -20`, réapparition au
point d'arrivée. Le seuil est sous la lèvre (−1,2) et bien au-dessus du cristal
(−34) : on tombe assez longtemps pour comprendre qu'on est tombé, jamais assez
pour traverser le socle.

## Palette

Nouvelles valeurs, à ajouter à côté de celles des biomes. La pierre est
**grise**, pas blonde : le calcaire chaud est celui des ruines du continent, et
l'île céleste ne doit pas avoir l'air de venir du même monde.

| Rôle | Valeur |
|---|---|
| Pelouse / pelouse sombre | `#8fbf63` / `#5f9147` |
| Pierre / pierre moyenne / pierre sombre | `#c2c1b2` / `#9d9d8e` / `#6c6d62` |
| Mousse | `#6f9a4e` |
| Or / or terni / or vif | `#d9a441` / `#8a6c33` / `#f3d789` |
| Roche du socle / pointe | `#7d7365` / `#3d3548` |
| Écorce / feuillage / feuillage sombre | `#6b5540` / `#4f9a4a` / `#36753f` |
| Eau / eau profonde / écume | `#cfe6f5` / `#8ec4e8` / `#f2fbff` |

L'or porte un **émissif faible** (0,2 à 0,55 selon la pièce) et c'est le seul
moyen de le faire briller : le cel-shading à trois marches écrase les
demi-teintes, un métal traité comme de la pierre jaune reste mat. L'émissif lui
fait franchir le seuil de bloom du jeu (0,82) sur les faces éclairées, et
seulement sur elles.

## Mesure d'audience

Un seul événement, `sky_island_entered { via: 'portal' }`, à l'arrivée sur
l'île. Il répond à la seule question qui compte tant qu'il n'y a rien à y
faire : est-ce que les gens qui ouvrent le portail le franchissent ?

## Vérification

Pas de test runner dans le dépôt. Chaque tâche se vérifie par
`npm run build` (qui inclut `tsc -b`), `npm run lint` (oxlint), et des contrôles
manuels au navigateur listés dans le plan.

Pour atteindre l'île en développement sans vider la carte :

```js
__store.getState().triggerAnnihilation()   // vide la carte, ouvre le portail
__playerBody.current.setTranslation({ x: 66, y: 8, z: -66 }, true)  // devant le portail
```

Deux mesures chiffrées à relever en fin de lot, dans l'onglet réseau et dans
`renderer.info` :

- le fragment de l'île n'est **pas** téléchargé à l'ouverture de la page ;
- sur le continent, la silhouette lointaine ajoute **un** appel de dessin.
