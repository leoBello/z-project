# Contrôles tactiles mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un joystick analogique flottant et des boutons d'action tactiles (attaquer, sauter, interagir contextuel) pour piloter le joueur sur mobile, avec un recentrage caméra, sans modifier le comportement desktop.

**Architecture:** Un singleton mutable hors React (`touchInput`, sur le modèle de `playerTransform`) fait le pont entre un overlay HTML (`TouchControls`, comme `HUD`) et la boucle physique de `Player`. Une primitive de détection (`isTouchDevice()` / `useIsTouchDevice()`) via `matchMedia('(pointer: coarse) and (hover: none)')` garde tout le code mobile inerte sur desktop. La caméra lit la même détection pour choisir sa hauteur de visée.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`, `noUnusedLocals`), `@react-three/fiber`, `@react-three/drei` (`useKeyboardControls`), `@react-three/rapier`, `zustand`, Vite. Aucun test runner dans le repo.

## Global Constraints

- **Aucune dépendance ajoutée** — `package.json` reste inchangé.
- **Le chemin desktop n'est pas modifié** : souris + clavier se comportent exactement comme sur `main`. Quand `isTouchDevice()` est faux, aucun élément tactile n'est dans le DOM et le code de lecture de `touchInput` est sans effet.
- **i18n en miroir** : toute clé ajoutée à `src/i18n/fr.json` doit l'être à l'identique (même forme) dans `src/i18n/en.json` — `DICTIONARIES_MIRROR` dans `src/i18n/index.ts` casse la compilation sinon. Le français fait foi.
- **État partagé par frame = singleton mutable hors React**, jamais du state React/zustand (motif `src/state/playerTransform.ts`).
- **Pas de `z-index` dans le projet** : l'empilement suit l'ordre du DOM dans `App.tsx`.
- **Détection mobile = `matchMedia('(pointer: coarse) and (hover: none)')`**, valeur exacte, une seule source (`src/config/device.ts`).
- **Hauteur de visée caméra mobile = `2`** (`CAMERA.lookAtHeightMobile`), à côté de `lookAtHeight: 4.5`.
- **Vérification** : `npm run build` (tsc + vite) doit passer à la fin de chaque tâche, plus les contrôles manuels décrits. Émulation mobile = barre d'outils appareil des devtools Chrome (met `pointer: coarse` + `hover: none`).
- TypeScript : imports de types via `import type` / `type` inline (`verbatimModuleSyntax`). Pas de variable/param inutilisé.

---

## File Structure

| Fichier | Création / Modif | Responsabilité |
|---|---|---|
| `src/config/device.ts` | Créer | `isTouchDevice()` (fonction pure) + `useIsTouchDevice()` (hook réactif). Seule source de la détection. |
| `src/state/touchInput.ts` | Créer | Singleton mutable `{ moveX, moveY, jumpRequested, attackRequested }` + `resetTouchMove()`. Pont overlay → boucle physique. |
| `src/config/gameplay.ts` | Modifier | `CAMERA.lookAtHeightMobile: 2`. |
| `src/components/CameraRig.tsx` | Modifier | Choisit la hauteur de visée selon `useIsTouchDevice()`. |
| `src/components/Player.tsx` | Modifier | Fusionne `touchInput` (joystick analogique + drapeaux saut/attaque) dans le mouvement et les actions, sans toucher au chemin clavier. |
| `src/components/TouchControls.tsx` | Créer | Overlay HTML : zone joystick flottant + boutons A/B + bouton Interagir contextuel. Rend `null` hors mobile ou hors `phase === 'playing'`. Seul écrivain de `touchInput`. |
| `src/App.tsx` | Modifier | Monte `<TouchControls />` après `<HUD />`, avant `<PortfolioDialog />`. |
| `src/i18n/fr.json` / `src/i18n/en.json` | Modifier | `ui.touch.{move,attack,jump,interact}`. |
| `src/index.css` | Modifier | Section `--- Contrôles tactiles ---` + masquage `.hud__controls` / `.hud__prompt` sur mobile. |

---

## Task 1: Primitive de détection tactile

**Files:**
- Create: `src/config/device.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `isTouchDevice(): boolean` — fonction pure, lisible hors React (ex. dans un `useFrame`).
  - `useIsTouchDevice(): boolean` — hook React, réévalue si la media query change.

- [ ] **Step 1: Écrire `src/config/device.ts`**

```ts
import { useEffect, useState } from 'react'

/**
 * Media query « appareil tactile sans souris ».
 *
 * `pointer: coarse` = le pointeur principal est un doigt ; `hover: none` = pas
 * de survol possible. Les deux ensemble visent smartphone et tablette tactile,
 * jamais un desktop — même en petite fenêtre, même avec un écran tactile s'il a
 * aussi une souris (là, `pointer` fin l'emporte). C'est cette query qui garantit
 * que les contrôles tactiles et le recentrage caméra ne s'activent pas sur
 * desktop.
 */
const TOUCH_QUERY = '(pointer: coarse) and (hover: none)'

/** Version pure, utilisable hors React (ex. dans une boucle `useFrame`). */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(TOUCH_QUERY).matches
}

/**
 * Version réactive pour les composants. La query ne change en pratique que
 * lorsqu'on bascule l'émulation d'appareil dans les devtools — assez pour
 * tester sans recharger la page.
 */
export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(isTouchDevice)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(TOUCH_QUERY)
    const onChange = () => setTouch(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return touch
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npm run build`
Expected: succès (`tsc -b` puis `vite build`), aucune erreur.

- [ ] **Step 3: Vérifier manuellement dans le navigateur**

Run: `npm run dev`, ouvrir la page, ouvrir la console.
- `window.matchMedia('(pointer: coarse) and (hover: none)').matches` → `false` sur desktop.
- Activer la barre d'outils appareil (Ctrl+Shift+M dans Chrome), choisir un téléphone, recharger → la même expression renvoie `true`.

- [ ] **Step 4: Commit**

```bash
git add src/config/device.ts
git commit -m "feat: primitive de détection appareil tactile"
```

---

## Task 2: Singleton d'entrées tactiles

**Files:**
- Create: `src/state/touchInput.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `touchInput` — objet mutable :
    - `moveX: number` (-1..1, axe écran horizontal, +1 = droite)
    - `moveY: number` (-1..1, axe écran vertical, +1 = **bas** de l'écran)
    - `jumpRequested: boolean` (drapeau ponctuel, consommé et remis à `false` par `Player`)
    - `attackRequested: boolean` (idem)
  - `resetTouchMove(): void` — remet `moveX` et `moveY` à `0`.

- [ ] **Step 1: Écrire `src/state/touchInput.ts`**

```ts
/**
 * Entrées tactiles partagées **hors de React**, sur le modèle de
 * `playerTransform` : `TouchControls` (overlay HTML) écrit ici à chaque geste,
 * `Player` lit dans son `useFrame`. Passer par un state React re-rendrait le
 * joueur à chaque déplacement du pouce.
 *
 * Inerte sur desktop : `TouchControls` ne monte pas, donc personne n'écrit et
 * tout reste à zéro.
 */
export const touchInput = {
  /** Joystick, repère écran, -1..1. `moveY` positif = pouce vers le bas. */
  moveX: 0,
  moveY: 0,
  /**
   * Drapeaux ponctuels levés au toucher d'un bouton. `Player` les lit dans sa
   * boucle puis les remet à `false` — même protocole que ses refs clavier
   * `jumpRequested` / `attackRequested`, pour ne pas perdre un appui plus court
   * qu'une frame.
   */
  jumpRequested: false,
  attackRequested: false,
}

/** Remet le joystick au neutre (relâchement, annulation, démontage de l'overlay). */
export function resetTouchMove() {
  touchInput.moveX = 0
  touchInput.moveY = 0
}

// Exposé en développement pour piloter le joueur depuis la console sans
// émulateur tactile (ex. `touchInput.moveX = 1`, `touchInput.jumpRequested = true`).
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).touchInput = touchInput
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npm run build`
Expected: succès, aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/state/touchInput.ts
git commit -m "feat: singleton d'entrées tactiles"
```

---

## Task 3: Recentrage caméra sur mobile

**Files:**
- Modify: `src/config/gameplay.ts` (objet `CAMERA`, après `lookAtHeight`)
- Modify: `src/components/CameraRig.tsx`

**Interfaces:**
- Consumes: `useIsTouchDevice` de `src/config/device.ts` (Task 1).
- Produces: `CAMERA.lookAtHeightMobile: number`.

- [ ] **Step 1: Ajouter `lookAtHeightMobile` à `CAMERA`**

Dans `src/config/gameplay.ts`, dans l'objet `CAMERA`, **juste après** le bloc `lookAtHeight: 4.5,` (ligne ~93) et avant `damping: 5,` :

```ts
  /**
   * Hauteur visée sur mobile.
   *
   * Plus basse que `lookAtHeight` : l'axe de visée se relève, le joueur remonte
   * vers le centre du cadre — au-dessus de la bande de contrôles tactiles qui
   * occupe le bas de l'écran. Contrepartie assumée : un peu moins de ciel
   * visible en haut de l'image sur mobile. La position de la caméra, elle, ne
   * bouge pas.
   */
  lookAtHeightMobile: 2,
```

- [ ] **Step 2: Lire cette valeur dans `CameraRig`**

Dans `src/components/CameraRig.tsx` :

Ajouter l'import après la ligne `import { CAMERA } from '../config/gameplay'` :

```ts
import { useIsTouchDevice } from '../config/device'
```

Dans le corps de `CameraRig`, ajouter après `const camera = useThree((state) => state.camera)` :

```ts
  const isTouch = useIsTouchDevice()
```

Dans `useFrame`, remplacer :

```ts
    desiredTarget.copy(playerTransform.position)
    desiredTarget.y += CAMERA.lookAtHeight
```

par :

```ts
    desiredTarget.copy(playerTransform.position)
    // Sur mobile, on vise plus bas : le joueur remonte au centre, au-dessus des
    // contrôles tactiles. Le rig lerpe déjà `desiredTarget` chaque frame, donc
    // le changement de valeur s'applique en douceur, sans transition à coder.
    desiredTarget.y += isTouch ? CAMERA.lookAtHeightMobile : CAMERA.lookAtHeight
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npm run build`
Expected: succès.

- [ ] **Step 4: Vérifier manuellement**

Run: `npm run dev`.
- Desktop (pas d'émulation) : le cadrage est identique à avant — le joueur se pose aux ~3/4 de la hauteur.
- Barre d'outils appareil activée + téléphone + rechargement : le joueur est nettement plus haut, autour du centre vertical ; la transition à l'entrée est douce (pas de saut).

- [ ] **Step 5: Commit**

```bash
git add src/config/gameplay.ts src/components/CameraRig.tsx
git commit -m "feat: recentrage caméra sur mobile"
```

---

## Task 4: Fusion des entrées tactiles dans `Player`

**Files:**
- Modify: `src/components/Player.tsx`

**Interfaces:**
- Consumes:
  - `isTouchDevice` de `src/config/device.ts` (Task 1).
  - `touchInput`, `resetTouchMove` de `src/state/touchInput.ts` (Task 2).
- Produces: rien de nouveau ; le joueur réagit désormais à `touchInput`.

- [ ] **Step 1: Ajouter les imports**

Dans `src/components/Player.tsx`, après `import type { Control } from '../config/controls'` :

```ts
import { isTouchDevice } from '../config/device'
import { touchInput, resetTouchMove } from '../state/touchInput'
```

- [ ] **Step 2: Nettoyer les entrées tactiles quand le jeu n'est pas en cours**

Dans `useFrame`, dans le bloc `if (useGameStore.getState().phase !== 'playing') {`, à la suite de :

```ts
      jumpRequested.current = false
      attackRequested.current = false
```

ajouter :

```ts
      // Mêmes raisons que pour les refs clavier ci-dessus : une demande tactile
      // faite juste avant la pause ne doit pas se déclencher à la reprise. Le
      // joystick est remis au neutre pour ne pas « marcher sur place » si
      // l'overlay a disparu avant le pointerup.
      touchInput.jumpRequested = false
      touchInput.attackRequested = false
      resetTouchMove()
```

- [ ] **Step 3: Brancher le joystick analogique sur le mouvement**

Remplacer ce bloc (lignes ~195-203) :

```ts
    moveDir.set(0, 0, 0)
    if (keys.forward) moveDir.add(camForward)
    if (keys.backward) moveDir.sub(camForward)
    if (keys.right) moveDir.add(camRight)
    if (keys.left) moveDir.sub(camRight)

    const isMoving = moveDir.lengthSq() > 0
    // Normaliser évite le classique "diagonale plus rapide".
    if (isMoving) moveDir.normalize()
```

par :

```ts
    moveDir.set(0, 0, 0)
    // `speedScale` reste à 1 pour le clavier (plein régime) ; le joystick le
    // ramène entre 0 et 1 selon l'amplitude du stick.
    let speedScale = 1

    if (isTouchDevice() && (touchInput.moveX !== 0 || touchInput.moveY !== 0)) {
      // Joystick : l'axe écran est projeté sur les axes caméra (droite / avant).
      // `moveY` positif pointe vers le bas de l'écran, donc vers l'arrière.
      moveDir
        .addScaledVector(camRight, touchInput.moveX)
        .addScaledVector(camForward, -touchInput.moveY)
      // camRight et camForward sont unitaires et perpendiculaires : la longueur
      // de moveDir vaut donc hypot(moveX, moveY) — l'amplitude du stick.
      speedScale = Math.min(moveDir.length(), 1)
    } else {
      if (keys.forward) moveDir.add(camForward)
      if (keys.backward) moveDir.sub(camForward)
      if (keys.right) moveDir.add(camRight)
      if (keys.left) moveDir.sub(camRight)
    }

    const isMoving = moveDir.lengthSq() > 0
    // Normaliser évite le classique "diagonale plus rapide" ; la vitesse est
    // dosée séparément par `speedScale`.
    if (isMoving) moveDir.normalize()
```

- [ ] **Step 4: Appliquer `speedScale` à la vitesse**

Remplacer (ligne ~209) :

```ts
    const speed = wading ? PLAYER.speed * PLAYER.waterSpeedFactor : PLAYER.speed
```

par :

```ts
    const speed =
      (wading ? PLAYER.speed * PLAYER.waterSpeedFactor : PLAYER.speed) * speedScale
```

- [ ] **Step 5: Fusionner le drapeau de saut tactile**

Remplacer :

```ts
    if (jumpRequested.current) {
      // La demande est consommée même si le saut est refusé : sans ça, un appui
      // en l'air se déclencherait à l'atterrissage.
      jumpRequested.current = false
      if (grounded) velocityY = PLAYER.jumpSpeed
    }
```

par :

```ts
    if (jumpRequested.current || touchInput.jumpRequested) {
      // La demande est consommée même si le saut est refusé : sans ça, un appui
      // en l'air se déclencherait à l'atterrissage. Les deux sources (clavier et
      // bouton tactile) sont vidées ensemble.
      jumpRequested.current = false
      touchInput.jumpRequested = false
      if (grounded) velocityY = PLAYER.jumpSpeed
    }
```

- [ ] **Step 6: Fusionner le drapeau d'attaque tactile**

Remplacer :

```ts
    if (attackRequested.current) {
      attackRequested.current = false
      const attackElapsed = gameNow() - playerTransform.attackStartedAt
```

par :

```ts
    if (attackRequested.current || touchInput.attackRequested) {
      attackRequested.current = false
      touchInput.attackRequested = false
      const attackElapsed = gameNow() - playerTransform.attackStartedAt
```

- [ ] **Step 7: Vérifier la compilation**

Run: `npm run build`
Expected: succès.

- [ ] **Step 8: Vérifier manuellement (desktop, chemin clavier inchangé)**

Run: `npm run dev`, sans émulation.
- ZQSD/WASD/flèches : déplacement identique à avant, pleine vitesse.
- Espace saute, E attaque, F interagit devant un monument.
- Console : `touchInput.moveX = 1` ne fait **rien** (car `isTouchDevice()` est faux). Remettre `touchInput.moveX = 0`.

- [ ] **Step 9: Vérifier manuellement (émulation tactile)**

Barre d'outils appareil + téléphone + rechargement. Depuis la console :
- `touchInput.moveX = 1` → le joueur se déplace vers la droite-écran (relatif caméra), à pleine vitesse. `touchInput.moveX = 0.3` → il avance lentement. Remettre `0`.
- `touchInput.moveY = -1` → il avance vers le haut de l'écran. Remettre `0`.
- `touchInput.jumpRequested = true` → un saut, puis le drapeau repasse à `false`.
- `touchInput.attackRequested = true` → un coup d'épée.

- [ ] **Step 10: Commit**

```bash
git add src/components/Player.tsx
git commit -m "feat: le joueur réagit aux entrées tactiles (joystick analogique + saut/attaque)"
```

---

## Task 5: Clés i18n des contrôles tactiles

**Files:**
- Modify: `src/i18n/fr.json`
- Modify: `src/i18n/en.json`

**Interfaces:**
- Consumes: rien.
- Produces: `dict.ui.touch.move`, `dict.ui.touch.attack`, `dict.ui.touch.jump`, `dict.ui.touch.interact` (toutes `string`).

- [ ] **Step 1: Ajouter le bloc `touch` dans `fr.json`**

Dans `src/i18n/fr.json`, dans `ui`, **après** le bloc `"hud": { ... }` (fermé par `},` à la ligne ~8), insérer :

```json
    "touch": {
      "move": "se déplacer",
      "attack": "attaquer",
      "jump": "sauter",
      "interact": "interagir"
    },
```

- [ ] **Step 2: Ajouter le bloc `touch` dans `en.json`, à la même position**

Dans `src/i18n/en.json`, dans `ui`, après le bloc `"hud": { ... }` :

```json
    "touch": {
      "move": "move",
      "attack": "attack",
      "jump": "jump",
      "interact": "interact"
    },
```

- [ ] **Step 3: Vérifier la compilation (miroir i18n)**

Run: `npm run build`
Expected: succès. Si `DICTIONARIES_MIRROR` casse, les clés des deux fichiers diffèrent — comparer.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/fr.json src/i18n/en.json
git commit -m "feat: clés i18n des contrôles tactiles"
```

---

## Task 6: Overlay `TouchControls` — joystick

**Files:**
- Create: `src/components/TouchControls.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes:
  - `useIsTouchDevice` (Task 1), `touchInput` / `resetTouchMove` (Task 2), `dict.ui.touch.*` (Task 5).
  - `useGameStore` : `phase` (`'playing' | 'paused' | 'gameover'`).
  - `useI18n` de `src/i18n/useI18n`.
- Produces: composant `TouchControls` (export nommé), monté dans `App`. Cette tâche pose la structure + le joystick ; les boutons d'action viennent en Task 7.

- [ ] **Step 1: Écrire `src/components/TouchControls.tsx` (joystick seul)**

```tsx
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useIsTouchDevice } from '../config/device'
import { touchInput, resetTouchMove } from '../state/touchInput'
import { useGameStore } from '../store/useGameStore'

/** Rayon (px) au-delà duquel l'amplitude du stick est bornée à 1. */
const JOY_RADIUS = 60
/** Rayon (px) en-deçà duquel le stick est considéré au neutre. */
const JOY_DEADZONE = 8

type JoyVisual = { active: boolean; x: number; y: number; dx: number; dy: number }
const JOY_HIDDEN: JoyVisual = { active: false, x: 0, y: 0, dx: 0, dy: 0 }

/**
 * Contrôles tactiles, façon émulateur GBA — **mobile uniquement**.
 *
 * En HTML superposé au Canvas (comme `HUD`), pas via `<Html>` de drei : c'est
 * de l'interface ancrée à l'écran. Rendu seulement sur appareil tactile et
 * seulement en jeu ; sinon `null`, et rien n'écrit dans `touchInput`.
 *
 * Monté avant `<PortfolioDialog />` dans `App.tsx` : quand un panneau s'ouvre,
 * la phase passe à `paused`, ce composant se démonte, et son `useEffect` de
 * nettoyage remet le joystick au neutre.
 */
export function TouchControls() {
  const isTouch = useIsTouchDevice()
  const phase = useGameStore((state) => state.phase)

  const joyPointer = useRef<number | null>(null)
  const joyOrigin = useRef({ x: 0, y: 0 })
  const [joy, setJoy] = useState<JoyVisual>(JOY_HIDDEN)

  // Filet : si le composant disparaît alors qu'un pouce est encore posé
  // (changement de phase), le `pointerup` n'arrivera jamais.
  useEffect(() => resetTouchMove, [])

  if (!isTouch || phase !== 'playing') return null

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (joyPointer.current !== null) return
    joyPointer.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    joyOrigin.current = { x: e.clientX, y: e.clientY }
    setJoy({ active: true, x: e.clientX, y: e.clientY, dx: 0, dy: 0 })
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointer.current) return
    const rawX = e.clientX - joyOrigin.current.x
    const rawY = e.clientY - joyOrigin.current.y
    const dist = Math.hypot(rawX, rawY)
    const clamped = Math.min(dist, JOY_RADIUS)
    const ux = dist > 0 ? rawX / dist : 0
    const uy = dist > 0 ? rawY / dist : 0
    const dx = ux * clamped
    const dy = uy * clamped

    setJoy((j) => ({ ...j, dx, dy }))

    if (dist < JOY_DEADZONE) {
      resetTouchMove()
    } else {
      touchInput.moveX = dx / JOY_RADIUS
      touchInput.moveY = dy / JOY_RADIUS
    }
  }

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointer.current) return
    joyPointer.current = null
    resetTouchMove()
    setJoy(JOY_HIDDEN)
  }

  return (
    <div className="touch-controls">
      <div
        className="touch-joystick__zone"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {joy.active && (
        <div className="touch-joystick__base" style={{ left: joy.x, top: joy.y }}>
          <div
            className="touch-joystick__thumb"
            style={{ transform: `translate(${joy.dx}px, ${joy.dy}px)` }}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Monter `<TouchControls />` dans `App.tsx`**

Dans `src/App.tsx`, ajouter l'import à côté des autres composants :

```ts
import { TouchControls } from './components/TouchControls'
```

Puis, dans le JSX, insérer entre `<HUD />` et `<LanguageToggle />` :

```tsx
      <HUD />
      {/* Avant <PortfolioDialog /> : le panneau plein écran doit recouvrir les
          contrôles tactiles quand il s'ouvre. */}
      <TouchControls />
      <LanguageToggle />
```

- [ ] **Step 3: Ajouter le CSS du joystick dans `src/index.css`**

À la fin du fichier, ajouter :

```css
/* --- Contrôles tactiles (mobile uniquement) ------------------------------- */

/*
  Le conteneur n'existe dans le DOM que lorsque `useIsTouchDevice()` est vrai
  (cf. TouchControls.tsx). Comme `.hud`, il ne capte pas les pointeurs — chaque
  contrôle réactive `pointer-events` localement.
*/
.touch-controls {
  position: fixed;
  inset: 0;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

/* Zone de saisie du joystick : moitié gauche, bas de l'écran. Le stick naît
   sous le pouce, n'importe où dans cette zone. */
.touch-joystick__zone {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 50%;
  height: 42%;
  pointer-events: auto;
  touch-action: none;
}

/* Base + tête : purement visuels, positionnés en coordonnées écran (le parent
   `.touch-controls` est `inset: 0`, donc `left`/`top` = viewport). */
.touch-joystick__base {
  position: absolute;
  width: 120px;
  height: 120px;
  margin: -60px 0 0 -60px;
  border-radius: 999px;
  background: rgba(18, 26, 20, 0.28);
  border: 1px solid rgba(246, 242, 228, 0.28);
  backdrop-filter: blur(2px);
  pointer-events: none;
}

.touch-joystick__thumb {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 54px;
  height: 54px;
  margin: -27px 0 0 -27px;
  border-radius: 999px;
  background: rgba(246, 242, 228, 0.38);
  border: 1px solid rgba(246, 242, 228, 0.5);
}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npm run build`
Expected: succès.

- [ ] **Step 5: Vérifier manuellement (desktop)**

Run: `npm run dev`, sans émulation.
- Inspecter le DOM : **aucun** élément `.touch-controls`.
- Le jeu se joue au clavier/souris exactement comme avant.

- [ ] **Step 6: Vérifier manuellement (émulation tactile)**

Barre d'outils appareil + téléphone + rechargement. Avec la simulation tactile des devtools :
- Poser le pointeur dans la moitié bas-gauche → une base ronde + une tête apparaissent sous le curseur.
- Glisser → la tête suit, bornée à `JOY_RADIUS`, et le joueur se déplace dans la direction correspondante, vitesse dosée par la distance.
- Relâcher → base et tête disparaissent, le joueur s'arrête.
- Ouvrir un panneau de monument (approcher + touche F) → les contrôles disparaissent ; fermer → ils reviennent, joystick au neutre.

- [ ] **Step 7: Commit**

```bash
git add src/components/TouchControls.tsx src/App.tsx src/index.css
git commit -m "feat: overlay TouchControls avec joystick analogique flottant"
```

---

## Task 7: Boutons d'action (A / B / Interagir contextuel)

**Files:**
- Modify: `src/components/TouchControls.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes:
  - `touchInput.jumpRequested` / `touchInput.attackRequested` (Task 2, consommés par `Player` — Task 4).
  - `useGameStore` : `nearbyLandmark` (`LandmarkId | null`), `openLandmark(id)`, `phase`.
  - `useI18n` → `dict.ui.touch.{attack,jump,interact}` (Task 5).
- Produces: rien de nouveau.

- [ ] **Step 1: Étendre `TouchControls.tsx` avec les boutons**

Ajouter l'import de `useI18n` en tête :

```ts
import { useI18n } from '../i18n/useI18n'
```

Dans le corps du composant, après `const phase = useGameStore((state) => state.phase)` :

```ts
  const nearbyLandmark = useGameStore((state) => state.nearbyLandmark)
  const { dict } = useI18n()
```

Remplacer le `return ( ... )` final par :

```tsx
  return (
    <div className="touch-controls">
      <div
        className="touch-joystick__zone"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {joy.active && (
        <div className="touch-joystick__base" style={{ left: joy.x, top: joy.y }}>
          <div
            className="touch-joystick__thumb"
            style={{ transform: `translate(${joy.dx}px, ${joy.dy}px)` }}
          />
        </div>
      )}

      <div className="touch-buttons">
        {nearbyLandmark && (
          <button
            type="button"
            className="touch-button touch-button--interact"
            aria-label={dict.ui.touch.interact}
            onPointerDown={() => {
              // Appel direct du store : c'est un vrai événement pointeur, pas un
              // sondage par frame — aucun risque de le perdre, donc pas besoin
              // de passer par un drapeau dans `touchInput`. Même garde que
              // `LandmarkInteraction` côté clavier.
              const store = useGameStore.getState()
              if (store.phase === 'playing' && store.nearbyLandmark) {
                store.openLandmark(store.nearbyLandmark)
              }
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="touch-button touch-button--jump"
          aria-label={dict.ui.touch.jump}
          onPointerDown={() => {
            touchInput.jumpRequested = true
          }}
        >
          B
        </button>
        <button
          type="button"
          className="touch-button touch-button--attack"
          aria-label={dict.ui.touch.attack}
          onPointerDown={() => {
            touchInput.attackRequested = true
          }}
        >
          A
        </button>
      </div>
    </div>
  )
```

- [ ] **Step 2: Ajouter le CSS des boutons dans `src/index.css`**

À la suite du CSS du joystick (avant l'éventuel bloc `@media (prefers-reduced-motion)` que l'on ajoute au Step 3) :

```css
/* Boutons d'action : bas-droite, en triangle façon manette. */
.touch-buttons {
  position: absolute;
  right: 22px;
  bottom: 26px;
  display: grid;
  grid-template-columns: repeat(2, 64px);
  grid-template-rows: repeat(2, 64px);
  gap: 12px;
  pointer-events: none;
}

.touch-button {
  grid-column: 1;
  grid-row: 1;
  width: 64px;
  height: 64px;
  border-radius: 999px;
  border: 1px solid rgba(246, 242, 228, 0.4);
  background: rgba(18, 26, 20, 0.32);
  color: var(--hud-fg);
  font: inherit;
  font-weight: 700;
  font-size: 18px;
  opacity: 0.35;
  pointer-events: auto;
  touch-action: none;
  transition: opacity 120ms ease, transform 120ms ease;
}

.touch-button:active {
  opacity: 0.7;
  transform: scale(0.94);
}

/* A en bas-droite, B en haut-gauche : diagonale. Interagir occupe le
   bas-gauche quand il apparaît. */
.touch-button--attack { grid-column: 2; grid-row: 2; }
.touch-button--jump { grid-column: 1; grid-row: 1; }
.touch-button--interact {
  grid-column: 1;
  grid-row: 2;
  border-color: rgba(245, 220, 149, 0.5);
  color: #f5dc95;
  opacity: 0.5;
}

.touch-button--interact svg {
  width: 24px;
  height: 24px;
  fill: currentColor;
}
```

- [ ] **Step 3: Masquer les rappels clavier sur mobile + respecter reduced-motion**

À la toute fin de `src/index.css` :

```css
@media (prefers-reduced-motion: reduce) {
  .touch-button { transition: none; }
}

/* Sur mobile, les rappels de touches et l'invite <F> n'ont pas de sens :
   l'interaction passe par le bouton tactile contextuel. */
@media (pointer: coarse) and (hover: none) {
  .hud__controls,
  .hud__prompt {
    display: none;
  }
}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npm run build`
Expected: succès.

- [ ] **Step 5: Vérifier manuellement (émulation tactile)**

Barre d'outils appareil + téléphone + rechargement :
- Deux boutons `A` et `B` en bas à droite, translucides ; `A` plus bas-droite, `B` plus haut-gauche.
- Appui sur `A` → coup d'épée ; enchaîner deux appuis rapprochés → le second est ignoré tant que l'animation dure (règle existante).
- Appui sur `B` → saut ; en l'air, un second appui ne fait rien.
- Multi-touch : maintenir le joystick d'un pointeur et appuyer `A` d'un autre → le joueur se déplace **et** frappe.
- Approcher d'un monument → un bouton doré (étoile) apparaît en bas-gauche du groupe ; appui → le panneau s'ouvre. S'éloigner → le bouton disparaît.
- Les rappels `ZQSD / Espace / E / F` en bas de l'écran et l'invite `<F> …` ne sont plus affichés.

- [ ] **Step 6: Vérifier manuellement (desktop inchangé)**

Sans émulation : rappels clavier toujours visibles, invite `<F>` toujours affichée près d'un monument, aucun bouton tactile dans le DOM.

- [ ] **Step 7: Commit**

```bash
git add src/components/TouchControls.tsx src/index.css
git commit -m "feat: boutons tactiles attaquer / sauter / interagir contextuel"
```

---

## Task 8: Vérification d'ensemble & non-régression desktop

**Files:** aucun changement de code attendu (tâche de validation ; corriger au besoin).

- [ ] **Step 1: Build complet**

Run: `npm run build`
Expected: succès complet (`tsc -b` + `vite build`).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: pas de nouvelle erreur. (`react/only-export-components` : `device.ts` n'exporte pas de composant, aucun souci attendu.)

- [ ] **Step 3: Parcours desktop complet (référence `main`)**

Run: `npm run dev`, sans émulation.
- Déplacement clavier (ZQSD / WASD / flèches), saut, attaque (avec visée assistée), interaction devant les 5 monuments, ouverture/fermeture des panneaux, menu Lieux, téléportation, changement de langue, Game Over + rejouer.
- DOM : aucun `.touch-controls`.
- Cadrage caméra identique au comportement d'avant la branche.

- [ ] **Step 4: Parcours mobile complet (émulation)**

Barre d'outils appareil + téléphone :
- Joystick 360°, dosage de vitesse, marche dans l'eau (ralentissement) toujours effectif.
- Boutons A/B, multi-touch joystick + bouton.
- Bouton Interagir contextuel sur les 5 monuments.
- Caméra : le joueur reste au centre, jamais masqué par les contrôles, en tout point de la carte (monter la montagne, aller au bord de l'eau).
- Game Over : les contrôles tactiles disparaissent (phase ≠ `playing`).
- Rotation portrait ↔ paysage : les contrôles restent utilisables (position ancrée aux bords).

- [ ] **Step 5: Commit éventuel**

Si des ajustements ont été nécessaires :

```bash
git add -A
git commit -m "fix: ajustements contrôles tactiles après vérification d'ensemble"
```

---

## Self-Review

**Spec coverage :**
- Détection `(pointer: coarse) and (hover: none)` → Task 1. Inerte sur desktop, garanti par le rendu conditionnel (Task 6) + `isTouchDevice()` dans Player (Task 4) / CameraRig (Task 3).
- Singleton `touchInput` façon `playerTransform` → Task 2.
- Joystick flottant, zone bas-gauche, dead-zone, rayon max, dosage vitesse, `pointerId` → Task 6.
- Intégration mouvement analogique dans `Player.tsx` section « Direction voulue », clavier inchangé → Task 4 (Steps 3-4).
- Boutons A = attaquer, B = sauter, drapeaux consommés au même endroit que les refs clavier → Task 4 (Steps 5-6) + Task 7.
- Bouton Interagir contextuel sur `nearbyLandmark`, même garde que `LandmarkInteraction` → Task 7. (Écart assumé vs spec : appel direct du store au lieu d'un drapeau `touchInput.interactRequested` — justifié dans le code, pas de perte sous-frame sur un événement pointeur React. `interactRequested` retiré de `touchInput`.)
- Caméra : `lookAtHeightMobile: 2`, lecture dans `CameraRig`, transition douce par le lerp existant → Task 3.
- HUD : `.hud__controls` et `.hud__prompt` masqués sur mobile → Task 7 (Step 3).
- i18n `ui.touch.*` dans les deux fichiers, miroir vérifié → Task 5.
- Style : section dédiée dans `index.css`, conteneur `pointer-events: none` + réactivation locale, `prefers-reduced-motion` → Tasks 6-7.
- Tests manuels via devtools + non-régression desktop → Task 8.

**Placeholder scan :** aucun TODO/TBD ; tout le code est fourni en entier ; les vérifications sont des commandes ou des gestes précis.

**Type consistency :** `touchInput` = `{ moveX, moveY, jumpRequested, attackRequested }` défini en Task 2, consommé avec ces noms exacts en Tasks 4, 6, 7. `resetTouchMove()` défini Task 2, utilisé Tasks 4 et 6. `isTouchDevice` / `useIsTouchDevice` définis Task 1, utilisés Tasks 3, 4, 6. `CAMERA.lookAtHeightMobile` défini Task 3 Step 1, lu Task 3 Step 2. `dict.ui.touch.{move,attack,jump,interact}` définis Task 5, lus Task 7 (`move` sert de libellé documentaire ; s'il reste inutilisé dans le JSX final, ce n'est pas une erreur TS — c'est une clé de données, pas une variable locale).

---

## Execution Handoff

**Plan complet et sauvegardé dans `docs/superpowers/plans/2026-08-27-controles-tactiles-mobile.md`. Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — je dispatche un subagent frais par tâche, revue entre chaque, itération rapide.

**2. Inline Execution** — j'exécute les tâches dans cette session via executing-plans, par lots avec points de contrôle.

**Quelle approche ?**
