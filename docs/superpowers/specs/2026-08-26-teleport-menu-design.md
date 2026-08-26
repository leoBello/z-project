# Menu de téléportation rapide — design

**Objectif.** Un menu latéral, dans la direction artistique du jeu, qui
téléporte le joueur vers l'un des cinq points d'intérêt et ouvre directement
la modale du portfolio correspondante — comme s'il avait marché jusqu'au lieu
et appuyé sur F. Suite directe de la feature précédente
(`docs/plan-poi-portfolio.md`), qui a posé la phase `paused`, l'horloge de
jeu, et l'interaction de proximité sur les cinq monuments.

**Pile.** Aucune dépendance nouvelle. Réutilise l'architecture existante :
`landmark.interact` (ancre monde déjà calculée par lieu), la phase `paused`
du store (gèle physique et joueur sans code neuf), `activeLandmark` /
`PortfolioDialog` pour l'ouverture finale, et les dictionnaires i18n déjà en
place (`dict.ui.sections`, `dict.ui.landmarks`).

---

## 1. Vue d'ensemble

Un nouveau menu HTML, ancré à l'écran comme le HUD (pas au canvas 3D) : une
**tablette rétractable** sur le bord gauche, verticalement centrée, ouverte
par défaut. Elle liste les cinq lieux dans l'ordre de `LANDMARKS` — Projets
(temple), À propos (pyramide), Compétences (stèle), Parcours (statue),
Contact (ruines) — avec les libellés déjà présents dans `dict.ui.sections`,
donc aucune nouvelle clé de contenu.

Cliquer une entrée déclenche :

1. gel immédiat du jeu (phase `paused`) ;
2. une animation de braises dorées qui dissolvent l'écran (~760 ms, temps
   réel — l'horloge de jeu est gelée) ;
3. téléportation du `RigidBody` du joueur devant l'ancre d'interaction du
   lieu choisi, face au monument ;
4. réapparition avec la modale du portfolio déjà ouverte.

Trois fichiers neufs : `src/components/TeleportMenu.tsx`,
`src/components/TeleportOverlay.tsx`, `src/state/playerBody.ts`. Le reste en
modification de fichiers existants : `useGameStore.ts`, `Player.tsx`,
`App.tsx`, `index.css`, `fr.json`/`en.json`.

### Correspondance lieu → entrée de menu

Confirmée avec le propriétaire : c'est la correspondance déjà encodée dans
`src/config/landmarks.ts` (section `PortfolioSection` par monument), qui
recoupe telle quelle les dictionnaires existants. Aucune décision de contenu
à prendre.

| Entrée (libellé = `dict.ui.sections[…]`) | Lieu | `LandmarkId` |
| --- | --- | --- |
| Projets | Temple du Sommet | `temple` |
| À propos | Pyramide de la Jungle | `pyramid` |
| Compétences | Grande Stèle | `stele` |
| Parcours | Idole des Terres Arides | `statue` |
| Contact | Ruines de l'Île | `ruins` |

---

## 2. Store — nouvel état

Dans `useGameStore.ts` :

```ts
/**
 * Lieu en cours de téléportation, ou `null`.
 *
 * Distinct de `activeLandmark` : tant qu'il est non-nul, l'overlay de braises
 * est à l'écran et la modale n'est pas encore visible — elle ne commence son
 * fondu d'ouverture qu'au moment du "warp", à mi-animation (voir
 * `resolveTeleport`).
 */
teleporting: LandmarkId | null
```

Deux actions.

**`teleportTo(id)`** — appelée par le menu. Ignorée dans trois cas : phase
`gameover` ; une téléportation est déjà en cours (`teleporting` non-nul,
anti-spam-clic) ; le lieu demandé est déjà celui affiché
(`phase === 'paused' && activeLandmark === id`, no-op). Sinon :

```ts
set({ phase: 'paused', activeLandmark: null, teleporting: id })
```

Ça gèle tout immédiatement qu'on parte de `playing` (en pleine balade) ou de
`paused` (en train de lire un autre lieu — la modale courante se ferme
instantanément, cachée par les braises qui montent).

**`resolveTeleport()`** — appelée par `TeleportOverlay` à mi-animation, une
fois le joueur physiquement déplacé :

```ts
set((state) => ({ activeLandmark: state.teleporting }))
```

Ne touche pas à `teleporting` : c'est l'overlay qui le remet à `null` en fin
d'animation, pas le store — il porte la temporalité de l'effet visuel, pas
l'état de jeu.

`reset()` doit remettre `teleporting: null`, comme les autres champs de
`initialState`.

---

## 3. La téléportation

### Le pont vers le corps physique

`Player.tsx` ne partage aujourd'hui que `playerTransform` (lecture seule,
écrite dans son propre `useFrame`) ; rien d'extérieur ne peut déplacer le
`RigidBody`. Nouveau fichier `src/state/playerBody.ts`, même idiome que
`playerTransform` / `enemyRegistry` : un objet mutable hors React,

```ts
export const playerBody: { current: RapierRigidBody | null } = { current: null }
```

`Player.tsx` l'alimente une fois, dans un `useEffect` sur son `ref`.

### Séquence, dans `TeleportOverlay.tsx`

Monté dans `App.tsx` à côté de `PortfolioDialog`. Observe `teleporting`. Sur
transition `null → id`, séquence en **temps réel** (`setTimeout`) — jamais
l'horloge de jeu, gelée puisqu'on est en pause :

| t | Événement |
| --- | --- |
| 0 ms | Overlay plein écran : fond assombri (`--hud-bg`) + braises dorées qui montent vers le centre de l'écran. Durée de convergence 380 ms. |
| 380 ms | **Warp.** Écran couvert. Calcul de la position d'arrivée (détail ci-dessous), écriture directe sur le `RigidBody` et sur `playerTransform`, puis `resolveTeleport()`. |
| 380 → 760 ms | Les braises retombent et se dispersent, révélant la modale — déjà en train de faire son propre fondu d'ouverture (`animation: portfolio-in`, existant, 180 ms) sous les braises qui se dissipent. |
| 760 ms | `set({ teleporting: null })`. Fin de séquence. |

### Calcul de la position d'arrivée

```
x, z = landmark.interact.x, landmark.interact.z
y    = landmark.altitude + PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius
yaw  = atan2(landmark.x - interact.x, landmark.z - interact.z)
```

`y` reprend exactement la relation utilisée dans `Player.tsx` entre la
hauteur du sol et le centre de la capsule (`FEET_OFFSET`) : le joueur atterrit
posé, pas enfoncé ni flottant. `yaw` oriente le joueur vers le centre du
monument — il arrive face à lui, pas de dos. Cas des Ruines (`radius = 0,
blend = 0`, terrasse non creusée) : `altitude` y est déjà la hauteur mesurée
du plateau naturel, la formule reste valide sans cas particulier.

Ordre de montage dans `App.tsx` : voir §4, la même contrainte (pas de
`z-index` dans le projet, l'empilement suit le DOM) s'applique ici — les
braises doivent être montées après la modale pour la recouvrir pendant
qu'elle apparaît.

Écriture :

```ts
playerBody.current?.setTranslation({ x, y, z }, true)
playerBody.current?.setLinvel({ x: 0, y: 0, z: 0 }, true)
playerTransform.position.set(x, y, z)
playerTransform.yaw = yaw
```

Écrire aussi `playerTransform` directement (et pas seulement le
`RigidBody`) est nécessaire : `Player.tsx` ne met à jour `playerTransform`
que dans son propre `useFrame`, qui ne fait rien tant que la phase n'est pas
`playing` — sans cette écriture manuelle, `CameraRig` (qui n'a, lui, aucune
garde de phase) continuerait de suivre l'ancienne position pendant toute la
lecture de la modale.

`LandmarkProximity` (déjà sans garde de phase) détecte la nouvelle position
dès la frame suivante et marque le lieu **découvert** au passage — gratuit,
cohérent avec une arrivée à pied.

### Réduction de mouvement

Sous `prefers-reduced-motion: reduce`, l'overlay garde son rôle (cacher le
warp) mais sans les braises animées : fondu opacité seule, durée ramenée à
~200 ms — même traitement que `.portfolio` et `.hud__prompt` dans
`index.css`.

---

## 4. Le menu — `TeleportMenu.tsx`

Tablette rétractable sur le bord gauche, verticalement centrée. Un onglet
affleurant (libellé vertical, `dict.ui.teleport.tab`) bascule un `useState`
local `open`, initialisé à `true`. Ouverte, elle liste les cinq lieux dans
l'ordre de `LANDMARKS` ; chaque ligne : une icône trait doré (SVG inline, un
dessin simple par monument) + le libellé `dict.ui.sections[landmark.section]`.
La ligne du lieu actif (`activeLandmark === landmark.id`) est surlignée en or,
dans le même langage visuel que les autres états actifs du HUD
(`.portfolio__dot--active`, `.language__button--active`).

`onClick` appelle `teleportTo(landmark.id)`. Le menu se rétracte
automatiquement dès que `activeLandmark` ou `teleporting` devient non-nul, et
se rouvre au prochain clic sur l'onglet — évite le chevauchement avec le
panneau portfolio sur les largeurs moyennes, sans imposer d'état à
l'utilisateur au-delà de ce geste.

Entièrement caché si `phase === 'gameover'`. Reste cliquable **pendant**
qu'une modale est ouverte — c'est ce qui permet de sauter d'une section à
l'autre sans repasser par la fermeture.

**Ordre de montage.** Le projet n'utilise aucun `z-index` nulle part dans
`index.css` : l'empilement suit l'ordre du DOM. `<TeleportMenu />` doit donc
être monté **après** `<PortfolioDialog />` dans `App.tsx`, sinon le fond plein
écran de `.portfolio` (qui capte les clics) passerait par-dessus et le menu
deviendrait inatteignable pendant qu'une modale est ouverte. Et
`<TeleportOverlay />` (§3) doit être monté après `<TeleportMenu />`, dernier
élément avant `<Loader />`, pour que les braises recouvrent bien la modale
qui apparaît en dessous : `… <PortfolioDialog /> <TeleportMenu />
<TeleportOverlay /> <Loader />`.

CSS neuf (`.teleport-menu*`), même famille visuelle que `.minimap` /
`.language` (fond `--hud-bg`, `backdrop-filter: blur`), bordure dorée
translucide comme `.hud__prompt`.

---

## 5. i18n et accessibilité

Nouvelle clé, forme identique dans les deux dictionnaires :

```json
"teleport": {
  "tab": "Lieux",
  "group": "Téléportation rapide"
}
```

Anglais : `"Places"`, `"Fast travel"`.

`<nav aria-label={dict.ui.teleport.group}>` autour de la liste. Chaque bouton
reçoit un `aria-label` composé du nom réel du lieu et de son action
(`dict.ui.landmarks[id].name` + `.action`, déjà existants) plutôt que le seul
libellé de section affiché — plus précis pour un lecteur d'écran que
"Compétences" seul. La ligne active porte `aria-current="true"`. Le bouton
d'onglet est étiqueté par `dict.ui.teleport.tab` et porte `aria-expanded`.

Pas de piège à focus ni de gestion `Escape` dédiée : ce n'est pas une modale,
juste une liste de boutons — le comportement clavier standard (Tab,
Entrée/Espace) suffit.

---

## 6. Cas limites

- **Clic sur le lieu déjà actif** : no-op, géré par le garde de `teleportTo`.
- **Double-clic rapide sur deux lieux différents** : le second est ignoré
  tant que `teleporting` est non-nul — pas d'interruption d'une animation en
  cours, le comportement le plus simple à raisonner et à tester.
- **Ruines** (`radius`/`blend = 0`) : couvert ci-dessus, `altitude` reste
  valide tel quel.
- **`reset()` pendant une téléportation** (Game Over déclenché juste avant un
  clic menu) : `teleporting: null` dans l'état réinitialisé efface l'overlay
  au remontage, sans code additionnel.
- **Vérification** : même méthode que le reste du projet —
  `npx tsc -b && npm run build`, puis mesure depuis la console :
  `__store.getState().teleportTo('stele')` puis, après ~800 ms,
  `playerTransform.position` comparé à `landmark.interact` (avec l'altitude
  attendue) pour chacun des cinq lieux, et `__store.getState().activeLandmark`
  qui doit valoir l'identifiant demandé.

---

## Ce qui reste à trancher pendant l'implémentation

Rien de bloquant identifié — les cinq icônes SVG (une par monument) sont un
détail d'exécution, pas une décision de design : elles suivent le style
"traits dorés" déjà validé, tracées à la même main que les icônes qui
existent déjà dans le HUD.
