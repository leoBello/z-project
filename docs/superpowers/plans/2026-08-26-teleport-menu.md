# Menu de téléportation rapide — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un menu rétractable sur le bord gauche de l'écran qui téléporte le
joueur, avec une animation de braises dorées, vers l'un des cinq points
d'intérêt — et ouvre directement sa modale portfolio, comme s'il avait marché
jusque-là et appuyé sur F.

**Architecture:** Trois pièces neuves posées sur l'existant : un pont
(`state/playerBody.ts`) qui expose le `RigidBody` du joueur hors de React,
une action de store (`teleportTo`) qui gèle le jeu et déclenche une séquence
temporisée en temps réel (`TeleportOverlay`) qui déplace le joueur à
mi-animation et ouvre la modale, et un menu (`TeleportMenu`) qui déclenche le
tout. Rien de nouveau côté physique ou rendu 3D : la téléportation est un
appel direct à l'API impérative de Rapier, cachée par un fondu HTML.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`), zustand 5,
@react-three/fiber 9, @react-three/rapier 2. Aucune dépendance nouvelle.

**Spec:** `docs/superpowers/specs/2026-08-26-teleport-menu-design.md`

## Global Constraints

- **Commentaires en français**, et ils expliquent le *pourquoi*, jamais une
  paraphrase de la ligne suivante.
- **Rien de réactif à 60 fps.** Le store zustand ne porte que ce que l'UI
  affiche ; on n'y écrit que sur transition. La séquence de téléportation
  vit en `setTimeout` (temps réel), jamais dans l'horloge de jeu — elle est
  gelée dès que la phase passe à `paused`.
- **Aucune dépendance npm ajoutée.**
- `verbatimModuleSyntax` actif : `import type` pour tous les types
  (`LandmarkId`, `RapierRigidBody`, `CSSProperties`, `ReactNode`…).
- **Le français fait foi** dans les dictionnaires : `fr.json` définit le
  type, `en.json` doit s'y conformer, sinon `npx tsc -b` échoue.
- **Aucun `z-index` dans ce projet** (vérifié : `index.css` n'en contient
  aucun) — l'empilement visuel suit uniquement l'ordre de montage dans
  `App.tsx`. Respecter l'ordre donné dans chaque tâche, pas un `z-index` pour
  compenser un mauvais ordre.
- **Pas de harnais de test dans ce projet** (ni runner, ni script `test` —
  déjà noté et assumé dans `docs/plan-poi-portfolio.md`). Chaque tâche se
  vérifie par la méthode déjà en usage : `npx tsc -b && npm run build`, puis
  une mesure **depuis la page**, via les crochets `window.__store` /
  `window.playerTransform` déjà exposés en développement — jamais à l'œil
  seul pour ce qui se mesure.
- Chaque tâche se termine par `npx tsc -b` **et** `npm run build` passants,
  et par un commit.

---

## Fichiers touchés

```
src/state/
  playerBody.ts              CRÉÉ : pont vers le RigidBody du joueur
src/components/
  Player.tsx                 MODIFIÉ : alimente playerBody
  TeleportOverlay.tsx        CRÉÉ : séquence de l'animation + warp
  TeleportMenu.tsx           CRÉÉ : tablette rétractable, 5 entrées
  App.tsx                    MODIFIÉ : montage des deux composants ci-dessus
src/store/
  useGameStore.ts            MODIFIÉ : teleporting, teleportTo, resolveTeleport, finishTeleport
src/i18n/
  fr.json, en.json           MODIFIÉ : clé ui.teleport
src/index.css                MODIFIÉ : .teleport-menu*, .teleport-overlay*
```

---

## Tâche 1 — État du store et pont vers le corps physique

**Fichiers**
- Créer : `src/state/playerBody.ts`
- Modifier : `src/store/useGameStore.ts`, `src/components/Player.tsx`

**Interfaces produites**
- `playerBody: { current: RapierRigidBody | null }`
- `GameState.teleporting: LandmarkId | null`
- `GameState.teleportTo: (id: LandmarkId) => void`
- `GameState.resolveTeleport: () => void`
- `GameState.finishTeleport: () => void`

Cette tâche ne touche à aucun rendu : elle se vérifie entièrement depuis la
console. Les tâches 2 et 3 la consomment.

- [ ] **Étape 1 : créer `src/state/playerBody.ts`**

```ts
import type { RapierRigidBody } from '@react-three/rapier'

/**
 * Pont vers le `RigidBody` du joueur, hors de React.
 *
 * `Player.tsx` est seul à détenir son propre `ref` : rien d'extérieur ne peut
 * donc déplacer le personnage. Même idiome que `playerTransform` et
 * `enemyRegistry` — un objet mutable, écrit une fois par effet, lu par qui en
 * a besoin. Ici, `TeleportOverlay` au moment du "warp".
 */
export const playerBody: { current: RapierRigidBody | null } = { current: null }
```

- [ ] **Étape 2 : alimenter le pont dans `Player.tsx`**

Ajouter l'import, avec les autres imports de `state/` (après la ligne
`import { playerTransform } from '../state/playerTransform'`) :

```ts
import { playerBody } from '../state/playerBody'
```

Puis, juste après le bloc qui se termine par `}, [subscribeKeys])` (l'effet
qui abonne saut et attaque, avant `useFrame((_, rawDelta) => {`), ajouter un
second effet :

```tsx
  // Pont vers l'extérieur de React : `TeleportOverlay` a besoin de déplacer
  // directement le `RigidBody` du joueur, sans passer par du state React.
  useEffect(() => {
    playerBody.current = body.current
    return () => {
      playerBody.current = null
    }
  }, [])
```

`useEffect` est déjà importé dans ce fichier (utilisé par l'effet
précédent) : ne pas dupliquer l'import.

- [ ] **Étape 3 : étendre `GameState` dans `useGameStore.ts`**

Dans l'interface `GameState`, insérer un nouveau champ juste après
`nearbyLandmark: LandmarkId | null` et avant le commentaire sur `runId` :

```ts
  /**
   * Lieu vers lequel une téléportation est en cours, ou `null`.
   *
   * Distinct de `activeLandmark` : tant qu'il est non-nul, l'overlay de
   * braises est à l'écran et la modale n'a pas encore commencé son fondu
   * d'ouverture — elle ne démarre qu'au "warp", via `resolveTeleport`.
   */
  teleporting: LandmarkId | null
```

Puis, dans le même bloc d'interface, insérer trois signatures d'action juste
après `setNearbyLandmark: (id: LandmarkId | null) => void` et avant
`/** Relance une partie depuis zéro. */` :

```ts
  /**
   * Démarre une téléportation vers `id` : gèle la partie et déclenche
   * l'overlay. Sans effet si une téléportation est déjà en cours, si la
   * partie est terminée, ou si `id` est déjà le lieu affiché.
   */
  teleportTo: (id: LandmarkId) => void
  /** Ouvre la modale du lieu en cours de téléportation, à mi-animation. */
  resolveTeleport: () => void
  /** Efface l'état de téléportation, en fin d'animation. */
  finishTeleport: () => void
```

- [ ] **Étape 4 : ajouter `teleporting` à `initialState`**

Dans `initialState`, ajouter le champ juste après
`nearbyLandmark: null as LandmarkId | null,` :

```ts
  teleporting: null as LandmarkId | null,
```

Il sera donc automatiquement remis à `null` par `reset()`, qui fait
`{ ...initialState, discovered: [], runId: state.runId + 1 }`.

- [ ] **Étape 5 : implémenter les trois actions**

Juste après `setNearbyLandmark: (id) => set({ nearbyLandmark: id }),` et
avant le commentaire qui introduit `reset` :

```ts
  /**
   * Refusée dans trois cas : partie terminée, téléportation déjà en cours
   * (anti-spam-clic), ou lieu déjà affiché. Sinon, gèle tout immédiatement —
   * qu'on parte de `playing` (en pleine balade) ou de `paused` (en train de
   * lire un autre lieu : sa modale se ferme aussitôt, cachée par les
   * braises qui montent).
   */
  teleportTo: (id) => {
    const { phase, activeLandmark, teleporting } = get()
    if (phase === 'gameover' || teleporting !== null) return
    if (phase === 'paused' && activeLandmark === id) return
    set({ phase: 'paused', activeLandmark: null, teleporting: id })
  },

  resolveTeleport: () => set((state) => ({ activeLandmark: state.teleporting })),

  finishTeleport: () => set({ teleporting: null }),

```

- [ ] **Étape 6 : vérifier**

```bash
npx tsc -b && npm run build
```

Puis, page ouverte, depuis la console — sans qu'aucune UI de téléportation
n'existe encore, c'est la mécanique du store qui est mesurée :

```js
__store.getState().teleportTo('stele')
__store.getState().phase          // → "paused"
__store.getState().teleporting    // → "stele"
__store.getState().activeLandmark // → null (pas encore résolu)

__store.getState().resolveTeleport()
__store.getState().activeLandmark // → "stele"

__store.getState().finishTeleport()
__store.getState().teleporting    // → null

__store.setState({ phase: 'playing', activeLandmark: null })
```

Contrôle négatif — le cas "double-clic sur deux lieux différents" :

```js
__store.getState().teleportTo('stele')
__store.getState().teleportTo('temple')   // ignoré : une téléportation est déjà en cours
__store.getState().teleporting            // → "stele", pas écrasé par "temple"

__store.getState().finishTeleport()
__store.setState({ phase: 'playing', activeLandmark: null })
```

- [ ] **Étape 7 : commit**

```bash
git add src/state/playerBody.ts src/components/Player.tsx src/store/useGameStore.ts
git commit -m "feat: état de téléportation et pont vers le RigidBody du joueur"
```

---

## Tâche 2 — Séquence de téléportation (`TeleportOverlay`)

**Fichiers**
- Créer : `src/components/TeleportOverlay.tsx`
- Modifier : `src/index.css`, `src/App.tsx`

**Interfaces consommées** (Tâche 1)
- `useGameStore` : `teleporting`, `resolveTeleport`, `finishTeleport`
- `playerBody` (`src/state/playerBody.ts`)

**Interfaces produites**
- `function TeleportOverlay(): JSX.Element | null`

À la fin de cette tâche, la téléportation fonctionne **de bout en bout**,
déclenchable depuis la console — la Tâche 3 ne fait qu'y brancher un bouton.

- [ ] **Étape 1 : écrire `src/components/TeleportOverlay.tsx`**

```tsx
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { PLAYER } from '../config/gameplay'
import { landmarkById } from '../config/landmarks'
import { playerBody } from '../state/playerBody'
import { playerTransform } from '../state/playerTransform'
import { useGameStore } from '../store/useGameStore'

/** Décalages des huit braises, en pixels, autour du centre de l'écran. */
const EMBER_OFFSETS: ReadonlyArray<[number, number]> = [
  [-120, -40],
  [100, -60],
  [-60, -110],
  [130, 30],
  [-140, 20],
  [40, -130],
  [-30, 110],
  [110, 90],
]

/** Durée entre le déclenchement et le "warp", en millisecondes — écran couvert. */
const WARP_AT_MS = 380
/** Durée totale de la séquence — doit correspondre à `teleport-veil` / `teleport-ember` dans index.css. */
const TOTAL_MS = 760

/**
 * Écran de transition affiché pendant une téléportation lancée depuis le menu.
 *
 * Séquencé en **temps réel** (`setTimeout`), jamais via l'horloge de jeu :
 * elle est gelée pendant toute la durée, la phase étant passée à `paused` dès
 * la demande de téléportation (voir `teleportTo` dans le store).
 */
export function TeleportOverlay() {
  const teleporting = useGameStore((state) => state.teleporting)
  const resolveTeleport = useGameStore((state) => state.resolveTeleport)
  const finishTeleport = useGameStore((state) => state.finishTeleport)

  useEffect(() => {
    if (!teleporting) return

    // À mi-animation, écran couvert : on déplace le joueur et on ouvre la
    // modale, qui commence son propre fondu d'apparition sous les braises
    // encore pleines.
    const warpTimer = setTimeout(() => {
      const landmark = landmarkById(teleporting)
      if (!landmark) return

      const x = landmark.interact.x
      const z = landmark.interact.z
      // Même relation que `Player.tsx` entre la hauteur du sol et le centre
      // de la capsule : le joueur atterrit posé, ni enfoncé ni flottant.
      const y = landmark.altitude + PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius
      // Face au monument, pas de dos.
      const yaw = Math.atan2(landmark.x - x, landmark.z - z)

      playerBody.current?.setTranslation({ x, y, z }, true)
      playerBody.current?.setLinvel({ x: 0, y: 0, z: 0 }, true)

      // `Player.tsx` n'écrit `playerTransform` que dans son propre
      // `useFrame`, qui ne fait rien tant que la phase n'est pas `playing`.
      // Sans cette écriture manuelle, `CameraRig` — qui n'a lui aucune garde
      // de phase — continuerait de suivre l'ancienne position pendant toute
      // la lecture de la modale.
      playerTransform.position.set(x, y, z)
      playerTransform.yaw = yaw

      resolveTeleport()
    }, WARP_AT_MS)

    // Fin de séquence : les braises ont fini de se disperser.
    const endTimer = setTimeout(finishTeleport, TOTAL_MS)

    return () => {
      clearTimeout(warpTimer)
      clearTimeout(endTimer)
    }
  }, [teleporting, resolveTeleport, finishTeleport])

  if (!teleporting) return null

  return (
    <div className="teleport-overlay" aria-hidden="true">
      <div className="teleport-overlay__veil" />
      {EMBER_OFFSETS.map(([dx, dy]) => (
        <span
          key={`${dx}-${dy}`}
          className="teleport-overlay__ember"
          style={{ '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties}
        />
      ))}
    </div>
  )
}
```

- [ ] **Étape 2 : ajouter le CSS, à la fin de `src/index.css`**

```css
/* --- Overlay de téléportation ----------------------------------------------- */

/*
  Braises dorées qui convergent puis se dispersent, sur un fond qui couvre
  entièrement l'écran au pic — c'est ce fond, et non les braises, qui garantit
  qu'aucun "pop" de position n'est visible pendant le warp.
*/
.teleport-overlay {
  position: fixed;
  inset: 0;
  /* Bloque les clics pendant le trajet — redondant avec le garde du store,
     mais évite aussi de cliquer un lien ou un bouton caché dessous. */
  pointer-events: auto;
}

.teleport-overlay__veil {
  position: absolute;
  inset: 0;
  /* Même teinte que le fond de `.gameover` / `.portfolio`, mais opaque au
     pic : c'est un écran de chargement, pas un calque translucide. */
  background: #0a100c;
  opacity: 0;
  animation: teleport-veil 760ms ease-in-out forwards;
}

@keyframes teleport-veil {
  0%, 100% { opacity: 0; }
  50%, 55% { opacity: 1; }
}

.teleport-overlay__ember {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #f5dc95;
  box-shadow: 0 0 8px 2px rgba(245, 220, 149, 0.75);
  opacity: 0;
  animation: teleport-ember 760ms ease-in-out forwards;
}

/* Convergent vers le centre (0 → 38%), restent groupées et lumineuses
   pendant le warp (38 → 55%), puis repartent se disperser en s'effaçant. */
@keyframes teleport-ember {
  0% { opacity: 0; transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0.4); }
  38% { opacity: 1; transform: translate(-50%, -50%) translate(0, 0) scale(1); }
  50%, 55% { opacity: 1; transform: translate(-50%, -50%) translate(0, 0) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0.3); }
}

@media (prefers-reduced-motion: reduce) {
  /* Le voile reste tel quel : un simple fondu d'opacité, pas un mouvement.
     Le raccourcir désynchroniserait sa disparition du "warp" programmé à
     380 ms dans TeleportOverlay, et le pop redeviendrait visible. */
  .teleport-overlay__ember { display: none; }
}
```

- [ ] **Étape 3 : monter le composant dans `App.tsx`**

Ajouter l'import, avec les autres imports de `components/` :

```ts
import { TeleportOverlay } from './components/TeleportOverlay'
```

Puis, dans le JSX, ajouter `<TeleportOverlay />` juste avant `<Loader />`
(dernier élément avant lui) :

```tsx
      <PortfolioDialog />
      <TeleportOverlay />
      <Loader />
```

- [ ] **Étape 4 : vérifier**

```bash
npx tsc -b && npm run build
```

Page ouverte, jeu en cours (phase `playing`), depuis la console :

```js
__store.getState().teleportTo('ruins')
```

Attendu, à l'œil : l'écran s'assombrit avec des braises dorées qui
convergent (~380 ms), puis la modale "Contact" apparaît pendant que les
braises se dispersent, sans jamais montrer le joueur à son ancienne
position.

Mesure, pas seulement à l'œil :

```js
const landmark = __landmarks?.ruins // voir note ci-dessous si absent
await new Promise((r) => setTimeout(r, 900))
playerTransform.position   // x,z doivent coller à landmark.interact ; y ≈ landmark.altitude + 0.8
__store.getState().activeLandmark // → "ruins"
__store.getState().teleporting    // → null
```

`landmarkById` n'est pas exposé sur `window` : si `__landmarks` n'existe pas,
comparer simplement `playerTransform.position` aux valeurs codées dans
`src/config/landmarks.ts` pour `RUINS.interact` (x, z) et `RUINS.altitude`
(y attendu ≈ `6.1 + 0.45 + 0.35 = 6.8`).

Refermer la modale (touche `F` ou `Échap`), puis répéter pour les quatre
autres lieux (`temple`, `pyramid`, `stele`, `statue`) en comparant à leurs
`interact` / `altitude` respectifs dans `landmarks.ts`.

- [ ] **Étape 5 : commit**

```bash
git add src/components/TeleportOverlay.tsx src/index.css src/App.tsx
git commit -m "feat: animation de téléportation, déclenchable par le store"
```

---

## Tâche 3 — Le menu (`TeleportMenu`)

**Fichiers**
- Créer : `src/components/TeleportMenu.tsx`
- Modifier : `src/i18n/fr.json`, `src/i18n/en.json`, `src/index.css`, `src/App.tsx`

**Interfaces consommées**
- `useGameStore` : `phase`, `activeLandmark`, `teleporting`, `teleportTo` (Tâche 1)
- `LANDMARKS` (`src/config/landmarks.ts`, existant)
- `dict.ui.teleport.{tab,group}` (nouveau, cette tâche)
- `dict.ui.sections`, `dict.ui.landmarks` (existants)

**Interfaces produites**
- `function TeleportMenu(): JSX.Element | null`

- [ ] **Étape 1 : ajouter la clé `ui.teleport` dans `fr.json`**

Dans `src/i18n/fr.json`, insérer un nouveau bloc après `"landmarks": { … }`
et avant `"sections": { … }` :

```json
    "teleport": {
      "tab": "Lieux",
      "group": "Téléportation rapide"
    },
```

- [ ] **Étape 2 : la même clé dans `en.json`**

Même emplacement (après `"landmarks"`, avant `"sections"`), dans
`src/i18n/en.json` :

```json
    "teleport": {
      "tab": "Places",
      "group": "Fast travel"
    },
```

- [ ] **Étape 3 : vérifier le typage avant d'aller plus loin**

```bash
npx tsc -b
```

Attendu : passe. `fr.json` définissant le type du dictionnaire, une clé
absente d'`en.json` aurait fait échouer la compilation ici.

- [ ] **Étape 4 : écrire `src/components/TeleportMenu.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { LANDMARKS } from '../config/landmarks'
import { useI18n } from '../i18n/useI18n'
import { useGameStore } from '../store/useGameStore'
import type { LandmarkId } from '../types/game'

/**
 * Tracés des cinq icônes, un par monument — style "traits dorés" validé en
 * maquette. `currentColor` sur le `<svg>` parent suit la couleur du texte du
 * bouton : la ligne active se recolore par CSS seul, sans prop de couleur.
 */
const LANDMARK_ICONS: Record<LandmarkId, ReactNode> = {
  temple: <path d="M4 20h16M6 20V9l6-5 6 5v11M9 20v-6h6v6" />,
  pyramid: <path d="M12 4l9 16H3z" />,
  stele: <path d="M8 3h8l2 6-6 12L6 9z" />,
  statue: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M7 21c0-4 2-7 5-7s5 3 5 7" />
    </>
  ),
  ruins: <path d="M4 21V11l4-6h8l4 6v10M8 21v-6h8v6" />,
}

/**
 * Menu de téléportation rapide vers les cinq points d'intérêt.
 *
 * Tablette rétractable sur le bord gauche, ouverte par défaut. Doit être
 * montée après `<PortfolioDialog />` dans `App.tsx` : le projet n'utilise
 * aucun `z-index`, l'empilement suit l'ordre du DOM, et ce menu doit rester
 * cliquable même quand une modale est ouverte plein écran — c'est ce qui
 * permet de sauter d'une section à l'autre sans repasser par la fermeture.
 */
export function TeleportMenu() {
  const { dict } = useI18n()
  const phase = useGameStore((state) => state.phase)
  const activeLandmark = useGameStore((state) => state.activeLandmark)
  const teleporting = useGameStore((state) => state.teleporting)
  const teleportTo = useGameStore((state) => state.teleportTo)
  const [open, setOpen] = useState(true)

  // Se replie automatiquement dès qu'une modale s'ouvre ou qu'un trajet
  // démarre — évite le chevauchement avec le panneau portfolio — puis se
  // rouvre au prochain clic sur l'onglet.
  useEffect(() => {
    if (activeLandmark || teleporting) setOpen(false)
  }, [activeLandmark, teleporting])

  // À l'écran de fin, un menu de voyage rapide n'a plus de sens.
  if (phase === 'gameover') return null

  return (
    <div className="teleport-menu">
      <button
        type="button"
        className="teleport-menu__tab"
        aria-expanded={open}
        aria-label={dict.ui.teleport.tab}
        onClick={() => setOpen((value) => !value)}
      >
        {dict.ui.teleport.tab}
      </button>

      {open && (
        <nav className="teleport-menu__panel" aria-label={dict.ui.teleport.group}>
          {LANDMARKS.map((landmark) => {
            const isActive = activeLandmark === landmark.id
            return (
              <button
                key={landmark.id}
                type="button"
                className={`teleport-menu__item${isActive ? ' teleport-menu__item--active' : ''}`}
                aria-current={isActive || undefined}
                aria-label={`${dict.ui.landmarks[landmark.id].name} — ${dict.ui.landmarks[landmark.id].action}`}
                onClick={() => teleportTo(landmark.id)}
              >
                <svg
                  className="teleport-menu__icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  aria-hidden="true"
                >
                  {LANDMARK_ICONS[landmark.id]}
                </svg>
                {dict.ui.sections[landmark.section]}
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
```

- [ ] **Étape 5 : ajouter le CSS, à la fin de `src/index.css`**

```css
/* --- Menu de téléportation --------------------------------------------------- */

.teleport-menu {
  position: fixed;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  display: flex;
  align-items: stretch;
  pointer-events: auto;
}

.teleport-menu__tab {
  writing-mode: vertical-rl;
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 14px 5px;
  border: none;
  border-radius: 0 10px 10px 0;
  background: var(--hud-bg);
  backdrop-filter: blur(6px);
  color: #f5dc95;
  cursor: pointer;
}

.teleport-menu__panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  border-radius: 0 14px 14px 0;
  border-left: 2px solid rgba(245, 220, 149, 0.4);
  background: rgba(18, 26, 20, 0.88);
  backdrop-filter: blur(6px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.teleport-menu__item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 14px 7px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--hud-fg);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.teleport-menu__item:hover { background: rgba(255, 255, 255, 0.08); }

.teleport-menu__item--active {
  color: #f5dc95;
  background: rgba(245, 220, 149, 0.14);
}

.teleport-menu__icon {
  width: 18px;
  height: 18px;
  flex: none;
}

.teleport-menu__tab:focus-visible,
.teleport-menu__item:focus-visible {
  outline: 2px solid #f5dc95;
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .teleport-menu__item { transition: none; }
}
```

- [ ] **Étape 6 : monter le composant dans `App.tsx`**

Ajouter l'import, avec les autres imports de `components/` :

```ts
import { TeleportMenu } from './components/TeleportMenu'
```

Puis l'insérer dans le JSX **entre** `<PortfolioDialog />` et
`<TeleportOverlay />` — l'ordre compte, voir le commentaire du composant :

```tsx
      <PortfolioDialog />
      <TeleportMenu />
      <TeleportOverlay />
      <Loader />
```

- [ ] **Étape 7 : vérifier**

```bash
npx tsc -b && npm run build && npm run lint
```

Puis, page ouverte :

- La tablette est visible sur le bord gauche, ouverte, cinq entrées : Projets,
  À propos, Compétences, Parcours, Contact — chacune avec son icône.
- Clic sur l'onglet "Lieux" : la tablette se replie, puis se rouvre au clic
  suivant.
- Clic sur "Compétences" : la tablette se replie automatiquement, l'écran de
  braises joue, puis la modale "Compétences" apparaît, joueur téléporté
  devant la stèle.
- **Sans fermer la modale**, clic sur "Contact" dans le menu (resté
  cliquable par-dessus la modale ouverte) : nouvelle séquence de braises,
  arrivée aux ruines, modale "Contact" ouverte — sans repasser par une
  fermeture manuelle.
- Clic sur l'entrée déjà active ("Contact", modale ouverte) : rien ne se
  passe (pas de double-animation).
- `Tab` depuis l'onglet : le focus visite les cinq boutons dans l'ordre,
  chacun avec un contour doré visible.
- Un Game Over (`__store.getState().damagePlayer(5)`) fait disparaître le
  menu entièrement.

`grep -rn "Voyage rapide\|Fast travel\|Téléportation" src` doit retrouver la
clé `ui.teleport` dans les deux dictionnaires et nulle part ailleurs en dur.

- [ ] **Étape 8 : commit**

```bash
git add src/components/TeleportMenu.tsx src/i18n/fr.json src/i18n/en.json src/index.css src/App.tsx
git commit -m "feat: menu de téléportation rapide vers les points d'intérêt"
```

---

## Vérification finale

Après les trois tâches, sur `main` de `feature/menu-and-teleport` :

```bash
npx tsc -b && npm run build && npm run lint
```

Puis, manuellement, les cinq lieux depuis le menu (pas seulement `ruins` et
`stele` déjà testés) : Projets → temple, À propos → pyramide, Parcours →
statue. Vérifier à chaque fois que le joueur atterrit **face** au monument
(pas de dos) et que `dict.ui.landmarks[id].name` affiché dans la modale
correspond bien au lieu visé.
