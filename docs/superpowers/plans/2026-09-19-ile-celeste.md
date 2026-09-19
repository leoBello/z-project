# Île Céleste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Franchir le portail violet de Nakano emmène le joueur sur une seconde carte — une île flottante inspirée de Laputa, avec ses vestiges dorés praticables — qu'on ne télécharge qu'au franchissement mais qu'on aperçoit dès l'écran de départ.

**Architecture:** Un champ `location: 'continent' | 'sky'` dans le store commande trois branchements — le décor, la minimap, le point d'apparition du joueur. L'île apporte **son propre terrain, son propre collider et son propre fond de carte** plutôt que de passer par `config/world.ts`, qui décrit un champ de hauteurs sur grille carrée et ne peut pas représenter un surplomb (le socle inversé en est un sur toute sa surface). Tout le module de l'île est chargé par `import()` dynamique derrière le voile de transition ; seule une silhouette d'environ 1 400 triangles, fusionnée en une géométrie et un appel de dessin, reste chargée en permanence pour être visible depuis le continent.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`, `noUnusedLocals`), three 0.185, @react-three/fiber 9, @react-three/rapier 2, zustand 5, Vite 8. Pas de test runner : la vérification est `npm run build` (qui inclut `tsc -b`), `npm run lint` (oxlint) et des contrôles manuels au navigateur.

**Spec :** `docs/superpowers/specs/2026-09-19-ile-celeste-design.md`
**Maquette :** `docs/maquettes/2026-09-19-ile-celeste.html` — **lire ce fichier est obligatoire** pour les tâches 2 à 6. Il contient la géométrie exacte, déjà réglée et déjà validée à l'écran ; les tâches y renvoient par numéro de ligne. Le porter, ce n'est pas le réinventer : c'est remplacer ses appels `new THREE.X` par les utilitaires du projet et le découper en composants.

## Global Constraints

- **Aucune dépendance ajoutée** — `package.json` reste inchangé.
- **`src/config/world.ts` n'est pas modifié.** Voir la section « Ce qu'on ne fait pas » de la spec.
- **i18n en miroir** : toute clé ajoutée à `src/i18n/fr.json` doit l'être à l'identique dans `src/i18n/en.json`. `DICTIONARIES_MIRROR` dans `src/i18n/index.ts` casse la compilation sinon. Le français fait foi.
- **Commentaires en français**, à la densité du fichier voisin : ils expliquent *pourquoi*, jamais *quoi*. Un nombre mesuré s'accompagne de la mesure.
- **TypeScript** : imports de types via `import type` (`verbatimModuleSyntax`). Aucune variable ni aucun paramètre inutilisé (`noUnusedLocals`, `noUnusedParameters`).
- **Facettage** : `MeshToonMaterial` n'accepte pas `flatShading`. Passer chaque géométrie par `faceted()` de `src/components/environment/faceted.ts`, qui déplie l'index pour donner sa normale à chaque triangle.
- **Le dégradé toon** vient de `src/components/models/toonGradient.ts` et se passe en `gradientMap` à tout matériau toon.
- **Pas de `pointLight`** : elle ajoute une passe d'éclairage dans *tous* les shaders de la scène, végétation instanciée comprise. Le bloom du post-traitement fait le halo à partir de l'émissif. Voir l'en-tête de `InteractionMarker.tsx`.
- **Horloge** : tout délai de gameplay se mesure sur `now()` de `src/state/gameClock.ts`, qui s'arrête en pause. Seules les animations d'interface en CSS et les séquences jouées *pendant* une pause utilisent `performance.now()`.
- **Écriture dans le store depuis un `useFrame`** : lire avec `useGameStore.getState()`, jamais avec le hook — ces composants ne doivent pas se re-rendre.
- **Palette** : les valeurs exactes sont dans le tableau « Palette » de la spec. Ne pas en inventer d'autres.
- **Vérification de fin de tâche** : `npm run build` et `npm run lint` passent, plus les contrôles manuels listés. `npm run dev` sert sur http://localhost:5173.
- **Pour atteindre le portail en développement**, dans la console :
  ```js
  __store.getState().triggerAnnihilation()
  // attendre ~4 s que l'onde balaie la carte et que le portail s'ouvre
  __playerBody.current.setTranslation({ x: 66, y: 8, z: -66 }, true)
  ```

---

## File Structure

| Fichier | Création / Modif | Responsabilité |
|---|---|---|
| `src/types/game.ts` | Modifier | `MapId`. |
| `src/store/useGameStore.ts` | Modifier | `location`, `transit`, `enterMap`, `arriveOnMap`, `finishTransit`. |
| `src/analytics/index.ts` | Modifier | Événement `sky_island_entered`. |
| `src/components/WorldTransition.tsx` | Créer | Le voile violet, son séquencement, et l'attente du fragment. |
| `src/index.css` | Modifier | Section « Transition de carte ». |
| `src/i18n/fr.json` / `en.json` | Modifier | `ui.portal.action`, `ui.portal.back`, `ui.maps.*`. |
| `src/store/interaction.ts` | Modifier | Le portail devient une cible d'interaction. |
| `src/components/environment/Portal.tsx` | Modifier | Portail bidirectionnel : lit `location`, déclenche `enterMap`. |
| `src/config/portal.ts` | Modifier | Ajoute le point d'apparition et le portail de retour de l'île. |
| `src/App.tsx` | Modifier | Monte `<WorldTransition>`, branche `<Enemies>` sur `location`. |
| `src/components/Environment.tsx` | Modifier | Branche continent / île, monte la silhouette lointaine. |
| `src/components/Player.tsx` | Modifier | Point d'apparition selon la carte. |
| `src/config/skyIsland.ts` | Créer | Les cotes et les quatre fonctions pures du relief. |
| `src/components/skyisland/SkyIsland.tsx` | Créer | Point d'entrée du fragment : assemble tout, gère la chute. |
| `src/components/skyisland/Terrain.tsx` | Créer | Dessus, socle, collider. |
| `src/components/skyisland/Ruins.tsx` | Créer | Enceinte, porte, tours, salle, rotonde, aqueduc, statues, dorures, colliders. |
| `src/components/skyisland/Flora.tsx` | Créer | Arbre, bosquets, touffes, mousse, lianes, racines. |
| `src/components/skyisland/Water.tsx` | Créer | Bassin, canaux, cascades, brume. |
| `src/components/skyisland/palette.ts` | Créer | Couleurs et matériaux partagés du fragment. |
| `src/components/environment/SkyIslandDistant.tsx` | Créer | La silhouette lointaine, hors du fragment. |
| `src/components/Minimap.tsx` | Modifier | Fond de carte selon `location`. |
| `ROADMAP.md` | Modifier | Entrée de la fonctionnalité. |

---

## Task 1 : aller sur l'île et en revenir

Le portail devient franchissable, la transition se joue, et l'île est un disque de placeholder. À la fin de cette tâche, l'aller-retour marche et le fragment dynamique est en place — tout le reste viendra le remplir.

**Files:**
- Modify: `src/types/game.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `src/analytics/index.ts`
- Modify: `src/config/portal.ts`
- Modify: `src/store/interaction.ts`
- Modify: `src/components/environment/Portal.tsx`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`
- Modify: `src/index.css`
- Modify: `src/App.tsx`, `src/components/Environment.tsx`, `src/components/Player.tsx`
- Create: `src/components/WorldTransition.tsx`
- Create: `src/components/skyisland/SkyIsland.tsx`

**Interfaces:**
- Produces: `MapId = 'continent' | 'sky'` ; `GameState.location: MapId` ; `GameState.transit: MapId | null` ; `enterMap(to: MapId): boolean` ; `arriveOnMap(): void` ; `finishTransit(): void` ; `SKY_SPAWN: { x: number; y: number; z: number }` et `SKY_PORTAL: { x, y, z, yaw }` depuis `config/portal.ts` ; `preloadSkyIsland(): Promise<unknown>` depuis `SkyIsland.tsx`. Les tâches 2 à 7 en dépendent.

- [ ] **Step 1 : le type de carte**

Dans `src/types/game.ts`, sous le type `GamePhase` :

```ts
/**
 * Carte sur laquelle se joue la partie.
 *
 * Deux et pas davantage, et c'est volontairement un type fermé plutôt qu'une
 * table extensible : chaque carte apporte son terrain, son collider et son fond
 * de minimap, donc en ajouter une n'est pas une ligne de configuration mais un
 * module. Le type fermé oblige à traiter le cas à l'endroit où il faut.
 */
export type MapId = 'continent' | 'sky'
```

- [ ] **Step 2 : les points d'apparition de l'île**

Dans `src/config/portal.ts`, à la fin du fichier :

```ts
/**
 * Où le portail dépose sur l'île, en coordonnées monde de la carte céleste.
 *
 * Plein sud, et c'est forcé : la caméra du jeu est fixe et regarde le nord
 * (voir la note de cap des monuments dans `landmarks.ts`). Arriver par le sud
 * met l'île entière dans le cadre, la porte de l'enceinte dans l'axe et l'arbre
 * au-dessus ; arriver par le nord mettrait tout cela dans le dos.
 *
 * L'altitude est celle de la prairie plus la demi-hauteur de la capsule et son
 * rayon — la même relation qu'utilise `TeleportOverlay` pour poser le joueur
 * sans l'enfoncer ni le faire flotter.
 */
export const SKY_SPAWN = {
  x: 0,
  y: PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius,
  z: 48,
}

/**
 * Le portail du retour, jumeau de celui de Nakano.
 *
 * Quatre unités et demie derrière le point d'apparition : le joueur en sort
 * face au nord, donc face à l'île, et le portail reste dans son dos — exactement
 * ce qu'on attend d'une porte qu'on vient de franchir. Il est actif tout de
 * suite : sans boss à vaincre, une île sans sortie serait un cul-de-sac dont on
 * ne sortirait qu'en rechargeant la page.
 */
export const SKY_PORTAL = {
  x: SKY_SPAWN.x,
  y: 0,
  z: SKY_SPAWN.z + 4.5,
  yaw: Math.PI,
}
```

Ajouter en tête du fichier : `import { PLAYER } from './gameplay'`.

- [ ] **Step 3 : l'événement de mesure**

Dans `src/analytics/index.ts`, après `portal_opened` :

```ts
  /**
   * Le joueur franchit le portail et arrive sur l'Île Céleste.
   *
   * Le pendant de `portal_opened`, et c'est le rapport entre les deux qui
   * intéresse : ouvrir le portail est une conséquence du jeu, le franchir est
   * une décision. Un portail qu'on ouvre sans jamais y entrer dirait que la
   * promesse n'a pas pris.
   */
  sky_island_entered: { via: 'portal' }
```

- [ ] **Step 4 : l'état de carte dans le store**

Dans `src/store/useGameStore.ts`, ajouter à l'interface `GameState`, après `teleporting` :

```ts
  /**
   * Carte courante. Pilote le décor, la minimap et le point d'apparition.
   *
   * Trois consommateurs seulement, et c'est le but du découpage : l'île
   * n'essaie pas de passer par la tuyauterie du continent — elle apporte son
   * terrain, son collider et son fond de carte. Ce champ ne dit que « lequel
   * des deux mondes est monté ».
   */
  location: MapId
  /**
   * Carte vers laquelle un voyage est en cours, ou `null`.
   *
   * Distinct de `location`, exactement comme `teleporting` l'est de
   * `activeLandmark` : tant qu'il est non nul, le voile est à l'écran et la
   * carte d'arrivée n'est pas encore montée. Il pilote aussi l'anti-spam — un
   * second franchissement pendant le voyage est refusé.
   */
  transit: MapId | null
```

Et aux actions, après `finishTeleport` :

```ts
  /**
   * Part vers l'autre carte : gèle la partie et lève le voile.
   *
   * Retourne faux si le voyage est refusé — partie non en cours, voyage déjà
   * en vol, ou destination déjà courante.
   */
  enterMap: (to: MapId) => boolean
  /** Bascule effectivement de carte, sous le voile opaque. */
  arriveOnMap: () => void
  /** Efface l'état de voyage, en fin d'animation. */
  finishTransit: () => void
```

Dans `initialState` :

```ts
  location: 'continent' as MapId,
  transit: null as MapId | null,
```

Et l'implémentation, après `finishTeleport` :

```ts
  // --- Voyage entre les cartes ----------------------------------------------

  enterMap: (to) => {
    const { phase, transit, location } = get()
    if (phase !== 'playing' || transit !== null || location === to) return false

    // Le fragment commence à descendre **maintenant**, pas au palier opaque :
    // sur une connexion lente, les 780 ms du voile ne suffiraient pas et le
    // joueur attendrait devant un écran violet. Ici le téléchargement court
    // pendant que le voile monte.
    if (to === 'sky') void preloadSkyIsland()

    playPortal()
    set({ phase: 'paused', transit: to })
    return true
  },

  /**
   * Bascule de carte. Appelée par `<WorldTransition>` quand le voile est opaque
   * **et** que le fragment est arrivé — jamais sur un simple délai.
   *
   * Ne touche pas à `phase` : la partie reste en pause jusqu'à ce que le voile
   * se soit retiré, sinon la physique reprendrait derrière un écran encore
   * opaque et le joueur pourrait tomber avant d'avoir vu où il est.
   */
  arriveOnMap: () => {
    const { transit } = get()
    if (transit === null) return
    if (transit === 'sky') track('sky_island_entered', { via: 'portal' })
    set({ location: transit })
  },

  finishTransit: () => set({ transit: null, phase: 'playing' }),
```

Ajouter les imports : `import type { MapId } from '../types/game'` (dans le bloc de types existant) et `import { preloadSkyIsland } from '../components/skyisland/SkyIsland'`.

- [ ] **Step 5 : le portail devient une cible d'interaction**

Dans `src/store/interaction.ts`, étendre le type et la règle de priorité :

```ts
export type Interaction =
  | { kind: 'landmark'; id: LandmarkId }
  | { kind: 'chest'; id: ChestId }
  | { kind: 'portal' }
  | null
```

Dans `pick`, **avant** le coffre :

```ts
function pick(
  phase: GamePhase,
  nearbyChest: ChestId | null,
  nearbyLandmark: LandmarkId | null,
  nearbyPortal: boolean,
): Interaction {
  if (phase !== 'playing') return null
  // Le portail passe devant tout : c'est la seule cible qui change de carte, et
  // aucune des deux autres n'existe à moins de six unités d'un portail. Le
  // départage ne devrait donc jamais servir — mais en cas d'égalité, c'est ce
  // qui emmène ailleurs qui doit gagner sur ce qui ouvre un panneau.
  if (nearbyPortal) return { kind: 'portal' }
  if (nearbyChest) return { kind: 'chest', id: nearbyChest }
  if (nearbyLandmark) return { kind: 'landmark', id: nearbyLandmark }
  return null
}
```

Répercuter dans `currentInteraction()` et `useInteraction()` (qui lisent un nouveau champ `nearbyPortal` du store — l'ajouter à `GameState` comme `nearbyPortal: boolean`, à `initialState` comme `false`, avec l'action `setNearbyPortal: (near: boolean) => void` sur le modèle de `setNearbyChest`).

Dans `interactionLabel` :

```ts
  if (target.kind === 'portal') return dict.ui.portal.action
```

Dans `triggerInteraction` :

```ts
  if (target.kind === 'portal') {
    store.enterMap(store.location === 'continent' ? 'sky' : 'continent')
    return
  }
```

- [ ] **Step 6 : les libellés**

Dans `src/i18n/fr.json`, sous `ui.portal` (la clé existe déjà avec `kicker`, `name`, `hint`) :

```json
      "action": "Franchir le portail",
      "back": "Revenir sur le continent"
```

Dans `src/i18n/en.json`, au même endroit :

```json
      "action": "Step through the portal",
      "back": "Return to the mainland"
```

`ui.portal.back` sert au portail de l'île. Dans `interactionLabel`, renvoyer `dict.ui.portal.back` quand `location === 'sky'` — la fonction prend déjà le dictionnaire, elle lit `useGameStore.getState().location`.

- [ ] **Step 7 : le portail, des deux côtés**

Dans `src/components/environment/Portal.tsx` : le composant est aujourd'hui posé en dur sur `PORTAL` et n'apparaît qu'avec `portalOpenedAt`. Le rendre paramétrable :

```tsx
interface PortalProps {
  /** Position et cap, en coordonnées monde de la carte où il est posé. */
  at: { x: number; y: number; z: number; yaw: number }
  /**
   * Le portail est-il ouvert ? Sur le continent c'est `portalOpenedAt` qui le
   * dit ; sur l'île il l'est toujours — on n'y arrive que par lui.
   */
  openedAt: number | null
}
```

Remplacer les lectures de `PORTAL` par `at`, et `useGameStore.getState().portalOpenedAt` par la prop `openedAt`. Ajouter, dans le `useFrame` existant, la mise à jour de la proximité :

```tsx
    // Même discipline que les monuments et les coffres : écriture sur
    // transition uniquement, jamais à chaque frame.
    const near = Math.hypot(
      playerTransform.position.x - at.x,
      playerTransform.position.z - at.z,
    ) < PORTAL_NEAR_RADIUS
    const store = useGameStore.getState()
    if (near !== store.nearbyPortal) store.setNearbyPortal(near)
```

- [ ] **Step 8 : le voile de transition**

Créer `src/components/WorldTransition.tsx` :

```tsx
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { SKY_SPAWN } from '../config/portal'
import { PLAYER } from '../config/gameplay'
import { playerBody } from '../state/playerBody'
import { playerTransform } from '../state/playerTransform'
import { preloadSkyIsland } from './skyisland/SkyIsland'
import { useGameStore } from '../store/useGameStore'

/**
 * Le passage d'une carte à l'autre.
 *
 * Même principe que `TeleportOverlay` — un voile plein écran séquencé en temps
 * réel pendant que la phase est `paused` — mais un composant et une palette à
 * part, et ce n'est pas de la duplication : les deux gestes ne disent pas la
 * même chose. Les braises déplacent dans une carte, le violet en change. Les
 * confondre apprendrait au joueur que les deux sont interchangeables.
 *
 * **Le palier opaque est un plancher, pas une durée.** À 780 ms le voile couvre
 * l'écran ; la bascule n'a lieu qu'une fois le fragment de l'île arrivé. Sur une
 * connexion normale il est là bien avant et rien ne se voit ; sur une connexion
 * lente, le voile reste opaque au lieu de découvrir un monde vide. C'est la
 * seule garantie qui tienne, et elle est gratuite.
 */

/** Montée du voile jusqu'à l'opacité pleine, en millisecondes de temps réel. */
const COVER_MS = 780
/** Retrait du voile, une fois la carte basculée. */
const REVEAL_MS = 900

export function WorldTransition() {
  const transit = useGameStore((state) => state.transit)
  const arriveOnMap = useGameStore((state) => state.arriveOnMap)
  const finishTransit = useGameStore((state) => state.finishTransit)

  useEffect(() => {
    if (!transit) return
    let cancelled = false
    let revealTimer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      // Les deux attentes en parallèle : le voile doit avoir couvert l'écran,
      // et le fragment être là. La plus longue des deux commande.
      await Promise.all([
        new Promise((resolve) => setTimeout(resolve, COVER_MS)),
        transit === 'sky' ? preloadSkyIsland() : Promise.resolve(),
      ])
      if (cancelled) return

      const spawn = transit === 'sky'
        ? SKY_SPAWN
        : {
            x: PLAYER.spawn[0],
            y: PLAYER.spawn[1],
            z: PLAYER.spawn[2],
          }

      arriveOnMap()
      playerBody.current?.setTranslation(spawn, true)
      playerBody.current?.setLinvel({ x: 0, y: 0, z: 0 }, true)
      // `Player.tsx` n'écrit `playerTransform` que dans son propre `useFrame`,
      // qui ne fait rien hors de la phase `playing`. Sans cette écriture, la
      // caméra suivrait l'ancienne position pendant tout le retrait du voile.
      playerTransform.position.set(spawn.x, spawn.y, spawn.z)
      playerTransform.yaw = 0

      revealTimer = setTimeout(finishTransit, REVEAL_MS)
    }

    void run()
    return () => {
      cancelled = true
      clearTimeout(revealTimer)
    }
  }, [transit, arriveOnMap, finishTransit])

  if (!transit) return null

  return (
    <div
      className="world-transition"
      aria-hidden="true"
      style={{ '--cover': `${COVER_MS}ms` } as CSSProperties}
    >
      <div className="world-transition__veil" />
    </div>
  )
}
```

- [ ] **Step 9 : le style du voile**

Dans `src/index.css`, après la section de l'embrasement de l'annihilation :

```css
/* --- Transition de carte ---------------------------------------------------- */

/*
  Le voile du passage d'une carte à l'autre.

  Il **ne se retire pas tout seul** : son animation s'arrête à l'opacité pleine
  et y reste, parce que le retrait ne doit commencer qu'une fois la carte
  d'arrivée montée — ce que le CSS ne peut pas savoir. C'est le retrait de la
  classe, côté React, qui rend la main. D'où `forwards` et un `@keyframes` qui
  ne redescend jamais.
*/
.world-transition {
  position: fixed;
  inset: 0;
  pointer-events: auto;
}

.world-transition__veil {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    120% 90% at 50% 45%,
    rgba(139, 63, 240, 0.96) 0%,
    rgba(26, 12, 54, 1) 70%
  );
  opacity: 0;
  animation: world-transition-cover var(--cover) ease-in forwards;
}

@keyframes world-transition-cover {
  from { opacity: 0; }
  to { opacity: 1; }
}

/*
  Mouvement réduit : le voile se pose presque instantanément et sans dégradé
  mouvant. Il n'est pas supprimé — il porte l'information « on change de
  monde », et sans lui la carte changerait d'un coup sans explication.
*/
@media (prefers-reduced-motion: reduce) {
  .world-transition__veil { animation-duration: 120ms; }
}
```

- [ ] **Step 10 : le fragment, avec une île de placeholder**

Créer `src/components/skyisland/SkyIsland.tsx` :

```tsx
import { CuboidCollider, RigidBody } from '@react-three/rapier'

/**
 * L'Île Céleste — le point d'entrée du fragment chargé à la demande.
 *
 * Tout ce que ce composant importe entre dans le même morceau de bundle, et
 * c'est le but : l'accueil du site ne télécharge pas l'île. Le découpage est
 * fait par Vite à partir de l'`import()` de `preloadSkyIsland`, il n'y a rien à
 * configurer.
 *
 * Ne rien importer d'ici qui soit déjà dans le tronc commun sans raison : une
 * dépendance partagée tire le module dans le fragment *et* le laisse dans le
 * tronc, ce qui ne coûte rien, mais l'inverse — importer le fragment depuis le
 * tronc — annulerait tout le découpage.
 */
export default function SkyIsland() {
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      {/* Placeholder : un disque plat de 110 de diamètre, le temps que la
          tâche 2 apporte le vrai terrain. */}
      <CuboidCollider args={[55, 0.5, 55]} position={[0, -0.5, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[55, 48]} />
        <meshToonMaterial color="#8fbf63" />
      </mesh>
    </RigidBody>
  )
}

/**
 * Déclenche — ou récupère — le téléchargement du fragment.
 *
 * La promesse est mémoïsée : le store l'appelle au départ du voyage et le voile
 * l'attend, les deux chemins partagent donc un seul téléchargement. Sans
 * mémoïsation, deux `import()` sur le même module se résolvent au même objet
 * mais le code appelant ne peut pas le savoir, et on se retrouverait à
 * séquencer deux attentes au lieu d'une.
 */
let pending: Promise<unknown> | null = null

export function preloadSkyIsland() {
  if (!pending) pending = import('./SkyIsland')
  return pending
}
```

- [ ] **Step 11 : brancher le décor**

Dans `src/components/Environment.tsx` :

```tsx
const SkyIsland = lazy(() => import('./skyisland/SkyIsland'))

export function Environment() {
  const location = useGameStore((state) => state.location)

  return (
    <>
      <StarrySky />
      <Lighting />
      {location === 'continent' ? (
        <>
          <Terrain />
          <Water />
          <Vegetation />
          <Bridge />
          <Landmarks />
        </>
      ) : (
        <SkyIsland />
      )}
    </>
  )
}
```

`<Suspense>` est déjà posé autour de l'arbre dans `App.tsx` : `lazy` y trouve sa frontière sans qu'on en ajoute une. Ajouter les imports `lazy` depuis `react` et `useGameStore`.

- [ ] **Step 12 : pas d'ennemi sur l'île, et le voile dans l'arbre**

Dans `src/App.tsx` : lire `location` et ne monter `<Enemies>` que sur le continent.

```tsx
  const location = useGameStore((state) => state.location)
```

```tsx
            {location === 'continent' && <Enemies key={`enemies-${runId}`} />}
```

Et monter `<WorldTransition />` juste après `<TeleportOverlay />`, avant `<BootScreen />`.

- [ ] **Step 13 : le point d'apparition du joueur**

Dans `src/components/Player.tsx`, le `<RigidBody position={PLAYER.spawn}>` est lu au montage. Le joueur n'est **pas** remonté au changement de carte — c'est `WorldTransition` qui le téléporte. Il n'y a donc rien à changer ici, mais il faut le vérifier : le `useEffect` de réinitialisation ligne ~370 replace le joueur sur `PLAYER.spawn` ; s'assurer qu'il ne se déclenche que sur `runId`, pas sur `location`.

- [ ] **Step 14 : vérifier**

```bash
npm run build && npm run lint
```
Attendu : les deux passent sans erreur.

Contrôles manuels, `npm run dev` :
1. Onglet réseau, filtre JS, **recharger** : aucun fragment contenant `SkyIsland` n'est téléchargé.
2. Console : `__store.getState().triggerAnnihilation()`, attendre le portail.
3. `__playerBody.current.setTranslation({ x: 66, y: 8, z: -66 }, true)` puis marcher jusqu'au portail : l'invite « Franchir le portail » apparaît.
4. Appuyer sur F : le voile violet monte, l'écran se couvre, **le fragment apparaît alors dans l'onglet réseau**, et on se retrouve sur un disque vert.
5. Le portail de retour est derrière soi. F dessus : retour sur le continent, au point de départ.
6. Pendant le voile, marteler F : aucun second voyage ne se déclenche.

- [ ] **Step 15 : commit**

```bash
git add -A
git commit -m "feat: le portail de Nakano mene sur une seconde carte"
```

---

## Task 2 : le terrain de l'île

Le disque de placeholder devient le vrai relief — trois terrasses, six rampes, un socle inversé — avec son collider et le traitement de la chute dans le vide.

**Files:**
- Create: `src/config/skyIsland.ts`
- Create: `src/components/skyisland/palette.ts`
- Create: `src/components/skyisland/Terrain.tsx`
- Modify: `src/components/skyisland/SkyIsland.tsx`
- Reference: `docs/maquettes/2026-09-19-ile-celeste.html:764-1090`

**Interfaces:**
- Consumes: rien des tâches précédentes.
- Produces: depuis `config/skyIsland.ts` — `ISLAND` (les cotes), `rimRadius(theta: number): number`, `topHeight(r: number, theta: number): number`, `underRadius(t: number, theta: number): number`, `underHeight(t: number, theta: number): number`, `groundAt(r: number, theta: number): Vector3`, `RAMPS_INNER`, `RAMPS_OUTER`, `rampFactor(theta, centers)`, `islandNoise(a, b)`, `FALL_LIMIT`. Depuis `palette.ts` — `SKY` (les couleurs) et `useSkyMaterials()`. Les tâches 3 à 7 en dépendent.

- [ ] **Step 1 : les cotes et les fonctions pures**

Créer `src/config/skyIsland.ts`. Porter **tel quel** le bloc `docs/maquettes/2026-09-19-ile-celeste.html:700-800` (les constantes `R`, `DEPTH`, `RIM_DROP`, `ARRIVAL_Z`, `WALL_R`, `WALL_H`, `ARCH_CLEAR`, `TREE_TOP`, `RAMPS_OUTER`, `RAMPS_INNER`, `RAMP_HALF`, et les fonctions `noise`, `smoothstep`, `rampFactor`, `step`, `topHeight`, `rimRadius`) puis `:1001-1010` (`underRadius`, `underHeight`), en :

- les typant (`function topHeight(r: number, theta: number): number`) ;
- renommant `noise` en `islandNoise` et en important `smoothstep` depuis `config/world.ts`, qui l'exporte déjà — pas de seconde copie ;
- gardant **tous** les commentaires de la maquette : ils portent les mesures.

Ajouter en fin de fichier :

```ts
/**
 * Position au sol, en un point polaire de l'île.
 *
 * Le seul chemin par lequel les vestiges, la végétation et l'eau se posent sur
 * le terrain. Tout ce qui se pose ailleurs flottera ou s'enfoncera au premier
 * réglage du relief.
 */
export function groundAt(r: number, theta: number) {
  return new Vector3(Math.sin(theta) * r, topHeight(r, theta), Math.cos(theta) * r)
}

/**
 * Altitude sous laquelle on est tombé de l'île.
 *
 * Sous la lèvre (−1,2) et bien au-dessus du cristal (−34) : on tombe assez
 * longtemps pour comprendre qu'on est tombé, jamais assez pour traverser le
 * socle et le voir de l'intérieur.
 */
export const FALL_LIMIT = -20
```

- [ ] **Step 2 : la palette du fragment**

Créer `src/components/skyisland/palette.ts` avec les couleurs du tableau « Palette » de la spec, et un hook qui construit les matériaux une fois :

```ts
/**
 * Les matériaux de l'île, construits une seule fois pour tout le fragment.
 *
 * Un `useMemo` au niveau du composant racine plutôt que des constantes de
 * module : le fragment est monté et démonté à chaque aller-retour, et des
 * matériaux de module survivraient au démontage sans être libérés. Les
 * géométries, elles, restent en constantes de module — elles sont pures et leur
 * construction est le poste coûteux.
 */
export function useSkyMaterials() { /* ... */ }
```

- [ ] **Step 3 : le terrain**

Créer `src/components/skyisland/Terrain.tsx`. Porter `buildTop()` (`:958-1000`) et `buildUnder()` (`:1011-1060`) de la maquette, en remplaçant la fin de chaque fonction par `faceted(geometry)` du projet.

Ajouter le collider, qui est la partie neuve :

```tsx
/**
 * Résolution du maillage **visible**.
 *
 * Cent vingt-huit secteurs pour que la lèvre irrégulière ne se lise pas en
 * segments droits, soixante-quatre anneaux pour que les talus soient des pentes
 * et non des marches.
 */
const VIEW_SECTORS = 128
const VIEW_RINGS = 64

/**
 * Résolution du maillage de **collision**, cinq fois plus grossière.
 *
 * Vingt-quatre mille triangles de trimesh pour une surface qu'on parcourt à
 * pied, ce serait payer une précision que le personnage ne peut pas ressentir :
 * sa capsule fait 0,68 d'emprise, et à 48 × 24 la maille fait 1,4 sur la lèvre
 * et moins au centre. Aucune marche ne se sent.
 *
 * Les deux maillages restent **une seule source de vérité** : ils échantillonnent
 * la même `topHeight`. C'est la résolution qui diffère, pas la forme — la nuance
 * est ce qui distingue cette optimisation d'un second terrain.
 */
const HULL_SECTORS = 48
const HULL_RINGS = 24
```

Le socle n'a pas de collider : on ne marche pas dessous, et un trimesh de plus doublerait le coût pour une surface inatteignable.

```tsx
export function SkyTerrain() {
  const materials = useSkyMaterials()
  const { top, under, hull } = useMemo(buildIslandGeometry, [])

  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={1}>
        <TrimeshCollider args={[hull.vertices, hull.indices]} />
      </RigidBody>
      <mesh geometry={top} material={materials.terrain} receiveShadow castShadow />
      <mesh geometry={under} material={materials.terrain} />
    </>
  )
}
```

`buildIslandGeometry` renvoie les trois : le dessus facetté, le socle facetté, et le casque de collision sous forme `{ vertices: Float32Array, indices: Uint32Array }` — un trimesh Rapier prend des tableaux bruts, pas une `BufferGeometry`.

- [ ] **Step 4 : la chute**

Dans `src/components/skyisland/SkyIsland.tsx`, remplacer le placeholder et ajouter :

```tsx
/**
 * Rattrape le joueur tombé dans le vide.
 *
 * Réapparition au point d'arrivée, sans dégât : l'île n'a pas encore d'enjeu,
 * et punir une chute sur une carte qu'on explore découragerait exactement ce
 * qu'on veut encourager. Le jour où le boss existe, remplacer l'appel par
 * `damagePlayer()` suffit — c'est une ligne, et elle est ici.
 *
 * Le test est dans un `useFrame` et non dans un capteur physique : un capteur
 * demanderait un collider de la taille de l'île à une altitude arbitraire, pour
 * répondre à une question qu'une comparaison de nombre tranche.
 */
function FallGuard() {
  useFrame(() => {
    if (playerTransform.position.y > FALL_LIMIT) return
    playerBody.current?.setTranslation(SKY_SPAWN, true)
    playerBody.current?.setLinvel({ x: 0, y: 0, z: 0 }, true)
    playerTransform.position.set(SKY_SPAWN.x, SKY_SPAWN.y, SKY_SPAWN.z)
  })
  return null
}
```

- [ ] **Step 5 : vérifier**

```bash
npm run build && npm run lint
```

Contrôles manuels : franchir le portail. Attendu —
1. Trois terrasses visibles, la prairie en bas, l'arène dallée au centre.
2. Monter par la rampe sud : on y arrive à pied. Essayer de monter par la falaise à côté : on n'y arrive pas.
3. Depuis la terrasse du jardin, la rampe intérieure est **ailleurs** qu'en face : il faut longer.
4. Marcher jusqu'au bord et tomber : on réapparaît au point d'arrivée en moins de deux secondes.
5. `?debug` dans l'URL : le trimesh épouse le dessus, et il n'y a **rien** sous l'île.

- [ ] **Step 6 : commit**

```bash
git add -A
git commit -m "feat: le relief de l'ile celeste, ses rampes et son socle"
```

---

## Task 3 : les vestiges et leurs dorures

L'enceinte, la porte, les tours, la salle à colonnes, la rotonde, l'aqueduc, les statues — avec leurs colliders, et les six pièces d'or.

**Files:**
- Create: `src/components/skyisland/Ruins.tsx`
- Modify: `src/components/skyisland/SkyIsland.tsx`
- Modify: `src/components/skyisland/palette.ts`
- Reference: `docs/maquettes/2026-09-19-ile-celeste.html:1093-1628`

**Interfaces:**
- Consumes: `topHeight`, `groundAt`, `WALL_R`, `WALL_H`, `ARCH_CLEAR`, `RAMPS_INNER` de `config/skyIsland.ts` ; `useSkyMaterials()` de `palette.ts`.
- Produces: `<Ruins />`.

- [ ] **Step 1 : porter la géométrie**

Créer `src/components/skyisland/Ruins.tsx` en portant les sept blocs de la maquette, dans cet ordre et avec leurs commentaires :

| Bloc | Lignes de la maquette |
|---|---|
| L'enceinte et ses brèches | `1093-1130` |
| La porte, son tympan doré, son parvis | `1131-1206` |
| Les quatre tours et la flèche dorée | `1207-1253` |
| La salle à colonnes | `1254-1314` |
| La rotonde, sa coupole en encorbellement, sa mosaïque | `1315-1488` |
| L'aqueduc | `1489-1566` |
| Les statues | `1567-1608` |
| Les blocs tombés | `1609-1627` |

Remplacements systématiques : `new THREE.X(...)` → `new X(...)` avec import nommé depuis `three` ; chaque géométrie passe par `faceted()` ; `MAT.stone` etc. deviennent `materials.stone` issus de `useSkyMaterials()`.

Toutes les pièces sont construites dans un `useMemo` qui renvoie un `Group` three, monté par `<primitive object={...} />` — c'est ce que fait déjà `InteractionMarker` pour ses géométries, et ça évite un composant React par bloc de pierre.

- [ ] **Step 2 : les colliders**

Ajouter, dans le même composant, un `<RigidBody type="fixed">` portant un `CuboidCollider` par pièce **porteuse** :

```tsx
/*
  Seules les pièces qui doivent arrêter le joueur ont un collider : pans
  d'enceinte, tours, piédroits de la porte, piliers de la rotonde, piles
  d'aqueduc, socles de statue. Environ quatre-vingt-dix cuboïdes fixes, ce qui
  n'est rien pour Rapier.

  Ce qui n'en a **pas**, et chaque cas est un choix :
   - les arcs et les corniches, parce qu'on doit passer dessous ;
   - la coupole, pour la même raison ;
   - les blocs tombés et les fûts couchés, parce qu'un obstacle d'une unité de
     haut est un mur pour un personnage sans autostep — on marche par-dessus,
     et le collider du terrain suffit ;
   - toute la végétation et toutes les dorures, qui ne sont pas de la matière.
*/
```

Les positions et dimensions sont celles des pièces correspondantes. Les tours cylindriques prennent un `CylinderCollider`.

- [ ] **Step 3 : vérifier**

```bash
npm run build && npm run lint
```

Contrôles manuels :
1. Monter la rampe sud : on arrive face à la porte, tympan doré dans l'axe.
2. Franchir l'arche : on passe, sans sauter.
3. Longer l'enceinte : deux pans sur cinq manquent, et on passe par les brèches.
4. Se cogner à un pan debout : il arrête.
5. Passer sous une travée d'aqueduc.
6. Dans l'arène : la mosaïque dorée a trois anneaux et douze rais, et la coupole est ouverte au-dessus.
7. `?debug` : aucun collider sur les arcs, les corniches, la coupole, les blocs tombés.

- [ ] **Step 4 : commit**

```bash
git add -A
git commit -m "feat: les vestiges dores de l'ile celeste"
```

---

## Task 4 : la végétation

L'arbre, les bosquets, les touffes, la mousse sur la maçonnerie, les lianes qui débordent de la lèvre, les racines sur le socle.

**Files:**
- Create: `src/components/skyisland/Flora.tsx`
- Modify: `src/components/skyisland/SkyIsland.tsx`
- Reference: `docs/maquettes/2026-09-19-ile-celeste.html:1628-1820` et `:1960-2040` (l'arbre)

**Interfaces:**
- Consumes: `topHeight`, `rimRadius`, `underRadius`, `underHeight`, `rampFactor`, `RAMPS_*` ; `useSkyMaterials()`.
- Produces: `<Flora />`.

- [ ] **Step 1 : porter**

Porter les blocs : bosquets (`:1628-1675`), touffes instanciées (`:1676-1698`), mousse (`:1699-1721`), lianes (`:1722-1785`), racines du socle (`:1786-1820`), l'arbre (`:1960-2040`).

Remplacer `seeded(...)` par `seededRandom(...)` de `config/world.ts`, qui existe déjà et fait la même chose — pas de second générateur.

Les touffes restent un `InstancedMesh` : quatre cent vingt cônes en autant de meshes seraient quatre cent vingt appels de dessin.

- [ ] **Step 2 : aucun collider**

Ajouter le commentaire qui l'explique :

```tsx
/*
  Rien ici n'a de collider, et c'est un choix et non un oubli.

  Sur le continent, `Vegetation.tsx` pose un collider par tronc d'arbre, parce
  que la forêt y est dense et qu'un joueur qui la traverse en ligne droite
  perdrait tout sens du terrain. L'île est un parcours, pas une étendue : ses
  bosquets bordent des chemins déjà délimités par des falaises et des murs. Y
  ajouter cinquante colliders coûterait sans rien fermer.
*/
```

- [ ] **Step 3 : vérifier**

```bash
npm run build && npm run lint
```

Contrôles manuels :
1. L'arbre sort de la coupole ; ses racines s'agrippent à la maçonnerie.
2. Debout dans la prairie, la cime est **hors du cadre** — c'est le résultat attendu, pas un défaut (voir la spec).
3. Les lianes suivent le galbe du socle, elles ne pendent pas droit dans le vide.
4. La mousse est au pied des murs, pas au milieu de la pelouse.
5. Rien ne pousse dans l'axe des six rampes.
6. Traverser un bosquet : on passe au travers.

- [ ] **Step 4 : commit**

```bash
git add -A
git commit -m "feat: la vegetation de l'ile celeste et ses lianes"
```

---

## Task 5 : l'eau

La source, les trois canaux, l'aqueduc alimenté, les quatre cascades avec leur écume et leur brume.

**Files:**
- Create: `src/components/skyisland/Water.tsx`
- Modify: `src/components/skyisland/SkyIsland.tsx`
- Reference: `docs/maquettes/2026-09-19-ile-celeste.html:1821-1959`

**Interfaces:**
- Consumes: `topHeight`, `rimRadius`, `RAMPS_INNER`, `RAMPS_OUTER` ; `useSkyMaterials()`.
- Produces: `<SkyWater />`. Nom préfixé : `Water` existe déjà dans `environment/` et c'est la mer du continent.

- [ ] **Step 1 : porter**

Porter le bassin (`:1821-1841`), les canaux (`:1842-1883`), les cascades (`:1884-1959`). Les matériaux `WATER`, `FOAM` et `FALL` rejoignent `useSkyMaterials()`.

Garder le commentaire d'en-tête de la maquette sur la source et le trajet : c'est le raisonnement qui justifie tout le bloc.

- [ ] **Step 2 : l'animation**

L'eau de la maquette est figée. Ajouter un `useFrame` qui fait descendre les lames et dériver la brume :

```tsx
  useFrame(() => {
    // Horloge de jeu : l'eau se fige avec le reste du monde quand un panneau
    // est ouvert. Une cascade qui continue de couler pendant une pause dit au
    // joueur que la pause n'en est pas une.
    const t = gameNow() / 1000
    for (const fall of falls.current) {
      // Le décalage de texture serait le moyen propre, mais les lames n'ont pas
      // de texture : on fait descendre l'écume et onduler la brume, ce qui
      // suffit à ce que l'œil lise un écoulement.
      fall.crest.scale.setScalar(1 + Math.sin(t * 3.1 + fall.phase) * 0.12)
      fall.mist.position.y = fall.baseY + Math.sin(t * 0.7 + fall.phase) * 0.9
    }
  })
```

- [ ] **Step 3 : vérifier**

```bash
npm run build && npm run lint
```

Contrôles manuels :
1. Le bassin doré est au pied de l'arbre, dans l'arène.
2. Suivre un canal depuis le bassin : il descend le long d'une rampe, sans jamais la couper.
3. L'aqueduc porte un filet d'eau.
4. Quatre cascades sur la lèvre, chacune avec son écume au départ et sa brume qui s'évapore.
5. On voit le ciel à travers une lame d'eau.
6. Ouvrir l'inventaire : l'eau se fige.

- [ ] **Step 4 : commit**

```bash
git add -A
git commit -m "feat: l'eau de l'ile celeste, de la source aux cascades"
```

---

## Task 6 : la silhouette vue du continent

L'île devient visible depuis l'écran de départ, en une géométrie et un appel de dessin.

**Files:**
- Create: `src/components/environment/SkyIslandDistant.tsx`
- Modify: `src/components/Environment.tsx`
- Reference: `docs/maquettes/2026-09-19-ile-celeste.html:2120-2260`

**Interfaces:**
- Consumes: `rimRadius`, `topHeight`, `underRadius`, `underHeight` de `config/skyIsland.ts`. **Attention** : ce composant vit dans le tronc commun, il importe donc `config/skyIsland.ts` — qui se retrouve dans le tronc et non dans le fragment. C'est voulu et sans coût : ce fichier est de la pure arithmétique, quelques centaines d'octets une fois minifié. Ce qui pèse (les composants, les géométries des vestiges) reste dans le fragment.
- Produces: `<SkyIslandDistant />`.

- [ ] **Step 1 : porter la silhouette**

Porter `tint()` (`:2150-2167`) et `buildImpostor()` (`:2168-2230`). Remplacer `mergeGeometries` par l'import du projet (`three/examples/jsm/utils/BufferGeometryUtils.js`, comme dans `InteractionMarker.tsx`).

- [ ] **Step 2 : le placement**

```tsx
/**
 * Où l'île se tient dans le ciel du continent.
 *
 * Trois nombres, et aucun n'est choisi à l'œil — ils sortent tous du cadrage de
 * la caméra, qui plonge de 17° pour un demi-champ vertical de 24° (voir
 * `CAMERA` dans `config/gameplay.ts`). Le bord haut de l'image est donc à 7°
 * au-dessus de l'horizontale, et la ligne d'horizon tombe aux 85 % de la
 * hauteur d'écran : **tout ce qui dépasse 7° est hors cadre en permanence.**
 *
 * À 500 unités au nord de la pagode et 38 au-dessus du niveau de la mer, l'île
 * se pose à 2,7° — au milieu du bandeau visible. L'instinct dirait de la monter
 * « plus haut dans le ciel » ; ça la ferait purement et simplement disparaître.
 *
 * Le décalage de 90 vers l'est n'est pas une correction mais une composition :
 * pile dans l'axe de la pagode, elle se lirait comme une cible de visée.
 * Légèrement de côté, elle appartient au paysage.
 *
 * La position est **fixe dans le monde**, pas accrochée à la caméra : elle
 * grossit donc à mesure qu'on marche vers le nord, ce qui récompense
 * l'exploration sans une ligne de code de plus.
 */
const DISTANT = {
  x: NAKANO.x + 90,
  y: 38,
  z: NAKANO.z - 500,
}
```

Le matériau porte `fog: false` :

```tsx
/*
  Hors brouillard, et sa brume est peinte dans ses couleurs par sommet.

  Le brouillard du jeu sature à 200 unités (voir le `<fog>` d'`App.tsx`) : une
  île posée à 500 en serait entièrement effacée. On mélange donc chaque couleur
  vers le bleu d'horizon, dans la proportion qu'aurait donnée la perspective
  atmosphérique. C'est la vieille recette des fonds de décor peints, et elle
  coûte zéro à l'exécution.
*/
```

- [ ] **Step 3 : monter**

Dans `Environment.tsx`, dans la branche continent, après `<Landmarks />`.

- [ ] **Step 4 : vérifier**

```bash
npm run build && npm run lint
```

Contrôles manuels :
1. **Recharger la page.** L'île est dans le ciel, au nord-est, dès la première frame — sans avoir rien fait.
2. Marcher vers le nord : elle grossit.
3. Se placer devant le portail de Nakano : elle est droit devant, dans le haut du cadre.
4. Console : `renderer.info.render.calls` avant et après avoir masqué la silhouette (`scene.getObjectByName('sky-island-distant').visible = false`) — **un** appel d'écart.
5. Franchir le portail : elle n'est plus là (on est dessus).

- [ ] **Step 5 : commit**

```bash
git add -A
git commit -m "feat: l'ile celeste se voit depuis le continent"
```

---

## Task 7 : la minimap de l'île

**Files:**
- Modify: `src/components/Minimap.tsx`

**Interfaces:**
- Consumes: `rimRadius`, `topHeight`, `ISLAND` de `config/skyIsland.ts`.

- [ ] **Step 1 : paramétrer le fond**

`renderWorldMap()` est aujourd'hui le continent en dur. Le laisser tel quel et ajouter à côté :

```tsx
/**
 * Fond de carte de l'île, rendu une seule fois comme celui du continent.
 *
 * Un second rendu et non une généralisation du premier : le continent est un
 * champ de hauteurs sur une grille carrée avec des biomes, l'île est un disque
 * avec des terrasses. Une fonction qui couvrirait les deux prendrait en
 * paramètre tout ce qui les distingue, c'est-à-dire tout.
 *
 * Le hors-île est **transparent** et non bleu : il n'y a pas de mer autour, il
 * n'y a rien. C'est ce vide qui dit, d'un coup d'œil sur la carte, qu'on est
 * sur un caillou en l'air.
 */
function renderIslandMap() { /* ... */ }
```

Le cadrage utilise `ISLAND.mapSize = 130` (l'île fait 110, avec une marge) au lieu de `WORLD.size`.

- [ ] **Step 2 : brancher**

`useMemo` sur `location`, et la fonction `toPixels` prend l'étendue de la carte courante. Les boucles ennemis / monuments / portail sont **sautées** hors du continent : il n'y a ni l'un ni l'autre sur l'île.

Le libellé de biome sous la carte devient le nom de la carte quand on est sur l'île — ajouter `ui.maps.sky` (« Île Céleste » / « Sky Island ») aux deux dictionnaires.

- [ ] **Step 3 : vérifier**

```bash
npm run build && npm run lint
```

Contrôles manuels : sur l'île, la minimap montre un disque avec ses trois anneaux de terrasse, le triangle du joueur tourne juste, et le libellé dit « Île Céleste ». De retour sur le continent, l'ancienne carte est revenue avec ses ennemis et son anneau de portail.

- [ ] **Step 4 : commit**

```bash
git add -A
git commit -m "feat: la minimap de l'ile celeste"
```

---

## Task 8 : finitions et mesures

**Files:**
- Modify: `ROADMAP.md`
- Modify: `README.md` si la liste des cartes y figure

- [ ] **Step 1 : relever les deux mesures de la spec**

Onglet réseau, page rechargée : noter la taille du bundle initial et vérifier qu'aucun fragment `SkyIsland` n'y est. Puis franchir le portail et noter la taille du fragment.

- [ ] **Step 2 : la roadmap**

Ajouter la fonctionnalité à `ROADMAP.md`, section « Ce qui est fait », avec les deux mesures relevées et le renvoi à la spec.

- [ ] **Step 3 : dernière vérification complète**

```bash
npm run build && npm run lint
```

Parcours complet : ouvrir la page, voir l'île au loin, vider la carte, aller au portail, le franchir, faire le tour de l'île, monter jusqu'à l'arène, tomber dans le vide, revenir, repartir sur le continent.

- [ ] **Step 4 : commit**

```bash
git add -A
git commit -m "docs: la roadmap decrit l'ile celeste et son chargement"
```

---

## Self-review

**Couverture de la spec.** Les trois terrasses et les six rampes → tâche 2. Les vestiges et les six dorures → tâche 3. La végétation et les lianes → tâche 4. L'eau, de la source aux cascades → tâche 5. La silhouette lointaine et son placement mesuré → tâche 6. Le chargement différé → tâche 1 (le fragment) et tâche 6 (ce qui reste dans le tronc). La chute → tâche 2. Le portail de retour → tâche 1. La mesure d'audience → tâche 1. La minimap → tâche 7. Le non-objectif « pas de refonte de `config/world.ts` » est tenu : aucune tâche ne le touche.

**Cohérence des noms.** `MapId`, `location`, `transit`, `enterMap`, `arriveOnMap`, `finishTransit`, `preloadSkyIsland`, `SKY_SPAWN`, `SKY_PORTAL`, `FALL_LIMIT`, `groundAt`, `islandNoise`, `useSkyMaterials`, `SkyTerrain`, `SkyWater` — chacun est défini dans la tâche qui le produit et repris à l'identique ensuite. `SkyWater` est préfixé parce que `Water` existe déjà pour la mer du continent.

**Un point de vigilance pour l'implémenteur.** La tâche 1 fait importer `preloadSkyIsland` par le store, et le store est dans le tronc commun. Cet import ne doit **pas** tirer le fragment dans le tronc : il porte sur un module qui ne contient que l'`import()` paresseux et le composant, et Vite sait couper là. Si l'onglet réseau montre le fragment au chargement de la page, c'est le premier endroit où regarder — probablement qu'un import a été ajouté depuis un module du tronc vers un module du fragment autre que `SkyIsland.tsx`.
