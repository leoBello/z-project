# Animation de défaite d'un ennemi — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUISE — utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les étapes sont en cases à cocher (`- [ ]`).

**Spec :** [`docs/superpowers/specs/2026-08-28-animation-defaite-ennemi-design.md`](../specs/2026-08-28-animation-defaite-ennemi-design.md)

**But :** Faire de la mort d'un ennemi un événement qui se ressent — anticipation, gel du monde, détente, disparition dans un nuage facetté — au lieu de l'effondrement linéaire muet d'aujourd'hui.

**Architecture :** Trois couches indépendantes qu'une quatrième tâche câble ensemble. (1) Le gel du monde s'obtient en arrêtant l'horloge de jeu — que tout le projet lit déjà — et en passant `paused` à `<Physics>`. (2) Les nuages vivent dans un pool hors de React, comme les cœurs et les projectiles, parce qu'ils doivent survivre au démontage du composant `Enemy`. (3) Le son et la secousse sont chronométrés en temps réel pour jouer *pendant* le gel. `Enemy.tsx` ne fait qu'appeler ces trois couches.

**Stack :** React 19, react-three-fiber 9, three 0.185, @react-three/rapier 2, zustand 5, TypeScript, Vite. Aucune dépendance ajoutée.

## Contraintes globales

- **Aucune dépendance ajoutée, aucun fichier audio.** Tout est synthétisé ou généré en code — c'est la promesse tenue par le reste du projet.
- **Ce projet n'a aucune suite de tests.** Pas de vitest, pas de runner dans `package.json`. Le cycle TDD classique ne s'applique pas. La vérification suit la convention déjà établie par `HANDOFF.md` : sondes `window.__*` exposées sous `import.meta.env.DEV`, interrogées depuis la console, plus `npm run lint` et `npm run build`. **Ne jamais annoncer qu'une étape est finie sans avoir lancé les deux commandes.**
- **Ne pas tenter de capturer l'effet en headless.** `HANDOFF.md` le documente : le rendu logiciel tourne à ~1 fps et une capture peut demander une minute. Toute la séquence de mort dure 210 ms — elle ne tombera jamais sur une frame. On la **mesure depuis la page** via les sondes, ou on la fige temporairement dans le code le temps d'une capture, puis on annule.
- **Si un correctif semble sans effet :** `rm -rf node_modules/.vite`, redémarrer `npm run dev`, retester. Vite sert parfois un module périmé, et ça a déjà coûté plusieurs cycles de diagnostic sur ce projet.
- **Les commentaires du code sont en français**, et ils expliquent *pourquoi* plutôt que *quoi*. C'est la norme dans tout `src/`. Les blocs de code de ce plan sont à recopier commentaires compris.
- **Un coup non fatal ne change pas.** Flash blanc de 160 ms, recul, aucun gel, aucune secousse. C'est la régression à surveiller à chaque tâche.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/state/gameClock.ts` *(modifié)* | Possède le gel : l'armer, le sonder, y abonner React. Ne connaît rien du combat. |
| `src/components/GameClock.tsx` *(modifié)* | Sonde le gel une fois par frame et n'avance pas l'horloge pendant. |
| `src/components/PhysicsGate.tsx` *(nouveau)* | Seul propriétaire de la prop `paused` de `<Physics>`. Isole le re-rendu. |
| `src/state/cameraShake.ts` *(nouveau)* | Possède la secousse. Ne connaît que des nombres. |
| `src/components/CameraRig.tsx` *(modifié)* | Applique l'offset de secousse à la caméra. |
| `src/audio/sfx.ts` *(modifié)* | Ajoute `playDefeat()`. |
| `src/state/deathPuffs.ts` *(nouveau)* | Pools des nuages et des anneaux. Données pures, aucun rendu. |
| `src/components/DeathPuffs.tsx` *(nouveau)* | Rend les deux pools. Ne connaît pas les ennemis. |
| `src/config/enemies.ts` *(modifié)* | Constantes de durée de la séquence. |
| `src/components/Enemy.tsx` *(modifié)* | Câble les quatre couches. Nouvelle séquence de mort, cœur différé, correction du culling. |
| `src/components/HUD.tsx` *(modifié)* | Vide le pool des nuages au redémarrage. |
| `src/App.tsx` *(modifié)* | Passe par `<PhysicsGate>`, monte `<DeathPuffs />`. |

Les tâches 1 à 7 sont indépendantes les unes des autres et vérifiables isolément depuis la console, sans qu'aucun ennemi ne meure. La tâche 8 est la seule intégration.

---

### Tâche 1 : Le gel dans l'horloge de jeu

Arme et sonde le gel. Aucun effet visible encore : la physique n'est pas touchée, seuls les délais de jeu se figent.

**Fichiers :**
- Modifier : `src/state/gameClock.ts`
- Modifier : `src/components/GameClock.tsx:24-29`

**Interfaces :**
- Consomme : rien.
- Produit : `hitStop(durationMs: number): void`, `isHitStopped(): boolean`, `pollHitStop(): boolean`, `subscribeHitStop(listener: () => void): () => void`, `hitStopSnapshot(): boolean` — tous exportés depuis `src/state/gameClock.ts`.

- [ ] **Étape 1 : Ajouter le gel à `gameClock.ts`**

À insérer après `export function advance(...)`, avant `resetClock` :

```ts
/**
 * Gel du monde sur un coup fatal — le « hit-stop ».
 *
 * Chronométré en temps **réel** et non sur `now()`, et c'est le point à ne pas
 * rater : un gel qui arrête l'horloge de jeu et se mesurerait sur elle ne
 * finirait jamais. Même raisonnement que la fumée de changement de tenue, qui
 * joue pendant une pause et se chronomètre donc sur `performance.now()`.
 */
let hitStopUntil = -Infinity
/** Dernier état notifié. `useSyncExternalStore` exige un instantané stable. */
let hitStopped = false
const hitStopListeners = new Set<() => void>()

export function hitStop(durationMs: number) {
  // `max` et non affectation : deux morts dans la même frame prolongent le gel
  // jusqu'au plus tardif des deux, elles ne le raccourcissent pas — et elles ne
  // l'empilent pas non plus.
  hitStopUntil = Math.max(hitStopUntil, performance.now() + durationMs)
  notifyHitStop()
}

export function isHitStopped() {
  return performance.now() < hitStopUntil
}

function notifyHitStop() {
  const next = isHitStopped()
  if (next === hitStopped) return
  hitStopped = next
  for (const listener of hitStopListeners) listener()
}

/**
 * Sondage d'une frame. Retourne l'état du gel après notification.
 *
 * Le gel se mesure en temps réel : rien ne se produit à son expiration, il faut
 * donc venir la constater. Appelé une fois par frame depuis `<GameClock />`.
 */
export function pollHitStop() {
  notifyHitStop()
  return hitStopped
}

export function subscribeHitStop(listener: () => void) {
  hitStopListeners.add(listener)
  return () => {
    hitStopListeners.delete(listener)
  }
}

export function hitStopSnapshot() {
  return hitStopped
}
```

- [ ] **Étape 2 : Remettre le gel à zéro au redémarrage**

Remplacer le corps de `resetClock` :

```ts
/** Remise à zéro au redémarrage d'une partie. */
export function resetClock() {
  elapsedMs = 0
  // Un gel en cours au moment d'un Game Over laisserait la physique en pause
  // sur la partie suivante, le temps qu'il expire.
  hitStopUntil = -Infinity
  notifyHitStop()
}
```

- [ ] **Étape 3 : Étendre la sonde de développement**

Remplacer le bloc `import.meta.env.DEV` en fin de `gameClock.ts` :

```ts
if (import.meta.env.DEV) {
  // Exposée pour vérifier depuis la page qu'elle se fige bien en pause : c'est
  // exactement le genre de chose qu'on ne peut pas juger à l'œil. Le gel s'y
  // ajoute pour la même raison — il dure 80 ms, aucune capture ne l'attrapera.
  ;(window as unknown as Record<string, unknown>).__gameClock = {
    now,
    resetClock,
    hitStop,
    isHitStopped,
  }
}
```

- [ ] **Étape 4 : Arrêter l'horloge pendant le gel**

Dans `src/components/GameClock.tsx`, remplacer l'import et le corps du `useFrame` :

```tsx
import { useFrame } from '@react-three/fiber'
import { advance, pollHitStop } from '../state/gameClock'
import { useGameStore } from '../store/useGameStore'
```

```tsx
  useFrame((_, rawDelta) => {
    // Sondé **avant** la garde de phase et sans condition : le gel se mesure en
    // temps réel, il doit pouvoir expirer même quand l'horloge de jeu, elle,
    // n'avance déjà plus.
    if (pollHitStop()) return
    if (useGameStore.getState().phase !== 'playing') return
    advance(Math.min(rawDelta, 0.05))
  }, -100)
```

- [ ] **Étape 5 : Vérifier**

```bash
npm run lint && npm run build
```
Attendu : aucune erreur.

Puis `npm run dev`, ouvrir la page, cliquer pour démarrer, et dans la console :

```js
const t0 = __gameClock.now()
__gameClock.hitStop(1000)
console.log('gelé ?', __gameClock.isHitStopped())          // true
setTimeout(() => console.log('pendant :', __gameClock.now() - t0), 500)   // ≈ 0
setTimeout(() => console.log('après  :', __gameClock.now() - t0), 1500)   // ≈ 500
```

Attendu : l'horloge ne bouge pas pendant la seconde de gel, puis repart. **Le joueur, lui, continue de bouger** — la physique n'est pas encore gelée, c'est la tâche 2.

- [ ] **Étape 6 : Commit**

```bash
git add src/state/gameClock.ts src/components/GameClock.tsx
git commit -m "feat: gel du monde (hit-stop) dans l'horloge de jeu

Chronométré en temps réel : un gel mesuré sur l'horloge qu'il arrête ne
finirait jamais.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 2 : Geler la physique sans re-rendre l'arbre

**Fichiers :**
- Créer : `src/components/PhysicsGate.tsx`
- Modifier : `src/App.tsx:44-49` (lecture de `phase`) et `src/App.tsx:77-89` (bloc `<Physics>`)

**Interfaces :**
- Consomme : `subscribeHitStop`, `hitStopSnapshot` (tâche 1).
- Produit : `<PhysicsGate debug={boolean}>{children}</PhysicsGate>`.

- [ ] **Étape 1 : Créer `src/components/PhysicsGate.tsx`**

```tsx
import { useSyncExternalStore, type ReactNode } from 'react'
import { Physics } from '@react-three/rapier'
import { PLAYER } from '../config/gameplay'
import { hitStopSnapshot, subscribeHitStop } from '../state/gameClock'
import { useGameStore } from '../store/useGameStore'

interface PhysicsGateProps {
  debug: boolean
  children: ReactNode
}

/**
 * Seul propriétaire de la prop `paused` de `<Physics>`.
 *
 * Le monde physique se met en pause pour deux raisons — un panneau ouvert, et
 * le gel de 80 ms sur un coup fatal. La première est rare, la seconde tombe à
 * chaque ennemi tué. Basculer la prop depuis `App` re-rendrait tout l'arbre
 * deux fois par kill, les vingt-six ennemis compris.
 *
 * D'où ce composant, qui prend ses enfants en **`props.children`** : quand le
 * gel bascule, `PhysicsGate` se re-rend mais `children` reste le même objet
 * élément qu'à la frame précédente, et React court-circuite la réconciliation
 * de tout le sous-arbre. C'est le seul intérêt du découpage — sans lui, un
 * simple `useState` dans `App` aurait suffi.
 *
 * Effet de bord bienvenu : `App` ne lit plus `phase` du tout et cesse donc de
 * se re-rendre à chaque ouverture d'inventaire.
 */
export function PhysicsGate({ debug, children }: PhysicsGateProps) {
  const phase = useGameStore((state) => state.phase)
  // `useSyncExternalStore` et non un `useState` + effet : le gel est armé
  // depuis une boucle `useFrame`, hors de tout événement React, et c'est
  // exactement le cas que cette API existe pour couvrir.
  const stopped = useSyncExternalStore(subscribeHitStop, hitStopSnapshot, hitStopSnapshot)

  return (
    <Physics gravity={[0, PLAYER.gravity, 0]} paused={phase !== 'playing' || stopped} debug={debug}>
      {children}
    </Physics>
  )
}
```

- [ ] **Étape 2 : Brancher `App.tsx`**

Remplacer l'import de `Physics` par celui de `PhysicsGate` :

```tsx
import { PhysicsGate } from './components/PhysicsGate'
```

Supprimer l'import `import { Physics } from '@react-three/rapier'`.

Supprimer la lecture de `phase` et son commentaire (`App.tsx:44-49`) :

```tsx
  /**
   * Lu par abonnement, et c'est sans danger : la phase ne change qu'à une
   * transition (pause, Game Over), jamais par frame. Le composant ne se
   * re-rend donc que dans ces rares moments.
   */
  const phase = useGameStore((state) => state.phase)
```

Remplacer le bloc `<Physics>` :

```tsx
          <PhysicsGate debug={DEBUG_PHYSICS}>
            <Environment />
            <Player key={`player-${runId}`} />
            <Enemies key={`enemies-${runId}`} />
            <Projectiles />
            <Pickups />
          </PhysicsGate>
```

Enfin, `PLAYER` n'était utilisé dans `App.tsx` que par la prop `gravity`, qui part avec le bloc. Réduire l'import de la ligne 30 :

```tsx
import { CAMERA } from './config/gameplay'
```

`useGameStore` reste importé : `runId` le lit toujours.

- [ ] **Étape 3 : Vérifier le gel de la physique**

```bash
npm run lint && npm run build
```

Puis dans la console, en jeu, **en maintenant une touche de déplacement** :

```js
__gameClock.hitStop(2000)
```

Attendu : le joueur s'immobilise net pendant deux secondes malgré la touche maintenue, les ennemis aussi, puis tout repart sans à-coup ni rattrapage. La caméra, elle, continue de lisser sa position — c'est normal, elle vit hors de `<Physics>`.

- [ ] **Étape 4 : Vérifier qu'`App` ne se re-rend pas**

Ajouter **temporairement** en tête du corps de `App()` :

```tsx
  if (import.meta.env.DEV) {
    const w = window as unknown as Record<string, number>
    w.__appRenders = (w.__appRenders ?? 0) + 1
  }
```

Recharger, puis dans la console :

```js
__appRenders                        // noter la valeur
__gameClock.hitStop(300)
setTimeout(() => console.log(__appRenders), 1000)   // doit être identique
```

Attendu : le compteur ne bouge pas. **Retirer ce bloc temporaire avant de committer.**

- [ ] **Étape 5 : Commit**

```bash
git add src/components/PhysicsGate.tsx src/App.tsx
git commit -m "feat: geler la physique pendant le hit-stop

PhysicsGate prend ses enfants en props.children : la bascule du gel ne
re-rend pas les vingt-six ennemis.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 3 : Son de défaite

**Fichiers :**
- Modifier : `src/audio/sfx.ts` (à la fin, après `playEquip`)

**Interfaces :**
- Consomme : `noiseBurst`, `tone` (privés au module, déjà présents).
- Produit : `playDefeat(): void`.

- [ ] **Étape 1 : Ajouter `playDefeat`**

```ts
/**
 * Défaite d'un ennemi : le corps qui cède, puis le souffle du nuage.
 *
 * Plus long et plus grave que `playHit` (0,09 s), qui reste le son de l'impact
 * — les deux jouent d'affilée sur un coup fatal, l'un étant ce que l'autre
 * provoque.
 *
 * **Aucune note musicale**, et c'est le point : même raisonnement que
 * `playEquip`. Une mort qui sonne comme une récompense entrerait en
 * concurrence avec la fanfare du coffre, et c'est le coffre qui doit rester la
 * trouvaille de la partie.
 */
export function playDefeat() {
  // Le corps qui cède : passe-bas franchement descendant.
  noiseBurst('lowpass', 3000, 260, 0.9, 0.22, 0.22)
  // La chute, qui donne le poids. Sans elle l'effet n'est qu'un « pfff ».
  tone('triangle', 300, 70, 0.18, 0.3)
  // Le souffle du nuage : montant, léger, il prolonge sans alourdir.
  noiseBurst('highpass', 900, 2600, 1.0, 0.06, 0.18)
}
```

- [ ] **Étape 2 : Vérifier**

```bash
npm run lint && npm run build
```

Puis en jeu, **son activé** (le bouton haut-droit — le son démarre coupé par défaut), dans la console :

```js
// Comparer les deux : la défaite doit s'entendre nettement plus grave et
// plus longue que l'impact, sans jamais sonner comme une récompense.
const m = await import('/src/audio/sfx.ts')
m.playHit(); setTimeout(() => m.playDefeat(), 800)
```

Attendu : deux sons clairement distincts. Vérifier aussi qu'avec le son coupé, `playDefeat()` ne produit rien (la garde `ready()` s'en charge).

- [ ] **Étape 3 : Commit**

```bash
git add src/audio/sfx.ts
git commit -m "feat: son de défaite d'un ennemi

Aucune note musicale : une mort qui sonne comme une récompense
concurrencerait la fanfare du coffre.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 4 : Secousse caméra

**Fichiers :**
- Créer : `src/state/cameraShake.ts`
- Modifier : `src/components/CameraRig.tsx:26-58`

**Interfaces :**
- Consomme : rien.
- Produit : `shake(amplitude: number, durationMs: number): void`, `sampleShake(out: Vector3): Vector3`.

- [ ] **Étape 1 : Créer `src/state/cameraShake.ts`**

```ts
import { Vector3 } from 'three'

/**
 * Secousse de caméra.
 *
 * Singleton mutable hors React, sur le modèle de `playerTransform` : elle est
 * armée depuis une boucle `useFrame` et lue depuis une autre, aucun rendu n'a
 * à en être averti.
 *
 * Chronométrée en temps **réel**, comme le hit-stop et pour la même raison :
 * elle doit trembler *pendant* le gel, qui est précisément le moment où elle
 * porte. Sur l'horloge de jeu, elle ne démarrerait qu'une fois le gel fini et
 * les deux effets se succéderaient au lieu de se superposer.
 */
let amplitude = 0
let durationMs = 0
let startedAt = -Infinity

/**
 * Deux fréquences distinctes, et volontairement non harmoniques : à fréquence
 * égale l'offset décrit une diagonale, et la secousse se lit comme un
 * glissement plutôt que comme un choc.
 */
const FREQUENCY_X = 38
const FREQUENCY_Y = 27

export function shake(nextAmplitude: number, nextDurationMs: number) {
  // Une secousse plus forte remplace celle en cours ; une plus faible ne
  // l'écrase pas. Deux ennemis tués dans la même frame ne doivent pas
  // s'additionner en une secousse deux fois trop violente.
  const running = performance.now() < startedAt + durationMs
  if (running && nextAmplitude < amplitude) return
  amplitude = nextAmplitude
  durationMs = nextDurationMs
  startedAt = performance.now()
}

/** Écrit l'offset courant dans `out`. Zéro quand aucune secousse ne court. */
export function sampleShake(out: Vector3) {
  const elapsed = (performance.now() - startedAt) / 1000
  const k = elapsed / (durationMs / 1000)
  // Le `>= 0` attrape aussi le NaN de l'état initial (`-Infinity`, durée nulle).
  if (!(k >= 0) || k >= 1) return out.set(0, 0, 0)

  // Enveloppe linéaire décroissante : une décroissance exponentielle laisse une
  // traîne qui, sur 120 ms, s'apparente à un flottement de caméra.
  const decay = amplitude * (1 - k)
  return out.set(
    Math.sin(elapsed * FREQUENCY_X * Math.PI * 2) * decay,
    Math.cos(elapsed * FREQUENCY_Y * Math.PI * 2) * decay,
    0,
  )
}

if (import.meta.env.DEV) {
  // La secousse dure 120 ms : impossible à juger sur une capture, il faut
  // pouvoir la déclencher à volonté et la regarder en direct.
  ;(window as unknown as Record<string, unknown>).__cameraShake = { shake, sampleShake }
}
```

- [ ] **Étape 2 : Appliquer l'offset dans `CameraRig.tsx`**

Ajouter aux imports :

```tsx
import { sampleShake } from '../state/cameraShake'
```

Ajouter aux vecteurs de travail du module, sous `desiredTarget` :

```tsx
const shakeOffset = new Vector3()
```

Remplacer le corps du `useFrame` :

```tsx
  /** Position lissée, **sans** la secousse. Voir plus bas. */
  const smoothed = useRef(new Vector3())
  const started = useRef(false)

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const t = 1 - Math.exp(-CAMERA.damping * delta)

    // Premier passage : la caméra est là où la prop `position` du Canvas l'a
    // posée. Lerper depuis un vecteur nul la ferait plonger depuis l'origine.
    if (!started.current) {
      smoothed.current.copy(camera.position)
      started.current = true
    }

    desiredPosition.copy(playerTransform.position).add(OFFSET)
    // Le lissage travaille sur une position **non secouée**, et la secousse
    // n'est ajoutée qu'ensuite. Lerper depuis la position secouée reviendrait à
    // poursuivre le tremblement : le lissage l'absorberait en partie et en
    // laisserait le reste comme une dérive résiduelle.
    smoothed.current.lerp(desiredPosition, t)
    camera.position.copy(smoothed.current)

    desiredTarget.copy(playerTransform.position)
    // Sur mobile, on vise plus bas : le joueur remonte au centre, au-dessus des
    // contrôles tactiles. Le rig lerpe déjà `desiredTarget` chaque frame, donc
    // le changement de valeur s'applique en douceur, sans transition à coder.
    desiredTarget.y += isTouch ? CAMERA.lookAtHeightMobile : CAMERA.lookAtHeight
    lookAt.current.lerp(desiredTarget, t)
    // Visée calculée depuis la position non secouée : la caméra tremble en
    // translation sans se réorienter, et c'est le monde qui bouge à l'écran.
    camera.lookAt(lookAt.current)

    sampleShake(shakeOffset)
    camera.position.add(shakeOffset)

    // Publication de la caméra pour le calque de combat 2D.
    //
    // `lookAt` ne met à jour que le quaternion : sans `updateMatrixWorld`, la
    // matrice monde reste celle de la frame précédente et les barres de vie
    // traînent visiblement derrière les ennemis pendant les déplacements.
    //
    // La secousse est ajoutée **avant** cet appel, et ce n'est pas indifférent :
    // publiée sans elle, `cameraView` garderait la position non secouée et les
    // barres de vie se décrocheraient des ennemis pendant toute la secousse.
    camera.updateMatrixWorld()
    cameraView.viewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    )
    cameraView.position.copy(camera.position)
    cameraView.ready = true
  })
```

- [ ] **Étape 3 : Vérifier**

```bash
npm run lint && npm run build
```

En jeu, se placer face à un ennemi et le frapper **une fois** (pour faire apparaître sa barre de vie), puis dans la console :

```js
__cameraShake.shake(0.08, 120)     // secousse nominale
__cameraShake.shake(0.4, 600)      // exagérée, pour juger l'accrochage des barres
```

Attendu :
1. Secousse brève et sèche, sans dérive : la caméra revient exactement où elle était.
2. Avec la version exagérée, **la barre de vie de l'ennemi reste collée à lui** pendant tout le tremblement. Si elle glisse, c'est que l'offset est appliqué après `updateMatrixWorld`.
3. Aucun résidu : après la secousse, se déplacer donne un suivi caméra identique à avant.

- [ ] **Étape 4 : Commit**

```bash
git add src/state/cameraShake.ts src/components/CameraRig.tsx
git commit -m "feat: secousse de caméra

Chronométrée en temps réel pour trembler pendant le gel, et publiée dans
cameraView avant updateMatrixWorld pour que le calque 2D suive.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 5 : Pools des nuages et des anneaux

Données pures, aucun rendu. Vérifiable entièrement depuis la console.

**Fichiers :**
- Créer : `src/state/deathPuffs.ts`
- Modifier : `src/components/HUD.tsx:4-5` et `HUD.tsx:64-70`

**Interfaces :**
- Consomme : `now` de `src/state/gameClock.ts`.
- Produit :
  - `interface DeathPuff { active: boolean; position: Vector3; color: Color; scale: number; rise: number; spin: number; bornAt: number }`
  - `interface DeathRing { active: boolean; position: Vector3; color: Color; bornAt: number }`
  - `deathPuffs: DeathPuff[]`, `deathRings: DeathRing[]`
  - `spawnDeathPuff(x: number, y: number, z: number, source: Color): void`
  - `spawnDeathRing(x: number, y: number, z: number, source: Color): void`
  - `clearDeathPuffs(): void`
  - `DEATH_PUFF_POOL_SIZE`, `DEATH_RING_POOL_SIZE`, `DEATH_PUFF_MS`, `DEATH_RING_MS`, `DEATH_PUFF_SIZE`, `DEATH_RING_FROM`, `DEATH_RING_TO`

- [ ] **Étape 1 : Créer `src/state/deathPuffs.ts`**

```ts
import { Color, Vector3 } from 'three'
import { now as gameNow } from './gameClock'

/**
 * Nuages et anneaux de mort, gérés en **pools de taille fixe**.
 *
 * Même approche que les cœurs et les projectiles, et pour une raison qui est
 * ici la contrainte fondatrice : le nuage doit **survivre au démontage du
 * composant `Enemy`**. L'ennemi disparaît 150 ms après sa mort, la fumée en
 * vit 600. Tenir la fumée dans le composant obligerait à le garder monté
 * quatre fois trop longtemps pour une raison purement décorative.
 *
 * Rien ici ne connaît les ennemis : le pool reçoit une position et une
 * couleur, un point.
 */
export interface DeathPuff {
  active: boolean
  position: Vector3
  color: Color
  /** Taille finale du nuage, avant le facteur de gonflement. */
  scale: number
  /** Hauteur dont il monte sur sa durée de vie, en unités monde. */
  rise: number
  /** Vitesse de rotation propre. Le signe alterne d'un nuage à l'autre. */
  spin: number
  bornAt: number
}

export interface DeathRing {
  active: boolean
  position: Vector3
  color: Color
  bornAt: number
}

/**
 * Décalages locaux, tailles et rotations d'une bouffée.
 *
 * Les cinq premiers sont repris tels quels de la table `PUFFS` d'`OutfitSmoke`
 * — ils sont déjà réglés et le résultat est déjà validé à l'écran. Le sixième
 * comble le vide arrière-droit, plus visible ici : la fumée de tenue est vue
 * autour du joueur, celle-ci autour d'un corps qui vient de disparaître.
 */
const OFFSETS = [
  { x: 0, y: 0.45, z: 0, scale: 1.15, rise: 0.55, spin: 1.1 },
  { x: 0.36, y: 0.2, z: 0.1, scale: 0.8, rise: 0.4, spin: -1.5 },
  { x: -0.34, y: 0.28, z: -0.12, scale: 0.85, rise: 0.45, spin: 1.7 },
  { x: 0.1, y: 0.7, z: -0.25, scale: 0.6, rise: 0.6, spin: -0.9 },
  { x: -0.18, y: 0.6, z: 0.24, scale: 0.62, rise: 0.62, spin: 1.3 },
  { x: 0.24, y: 0.5, z: -0.3, scale: 0.55, rise: 0.5, spin: -1.8 },
] as const

export const PUFFS_PER_DEATH = OFFSETS.length
/** Six morts simultanées avant que le pool ne recycle. */
export const DEATH_PUFF_POOL_SIZE = PUFFS_PER_DEATH * 8
export const DEATH_RING_POOL_SIZE = 8
/** Durée de vie d'un nuage, en millisecondes de temps de jeu. */
export const DEATH_PUFF_MS = 600
export const DEATH_RING_MS = 350
/** Rayon de la géométrie d'un nuage, avant mise à l'échelle par instance. */
export const DEATH_PUFF_SIZE = 0.4
/** Rayons de départ et d'arrivée de l'anneau, en unités monde. */
export const DEATH_RING_FROM = 0.2
export const DEATH_RING_TO = 1.4

export const deathPuffs: DeathPuff[] = Array.from(
  { length: DEATH_PUFF_POOL_SIZE },
  () => ({
    active: false,
    position: new Vector3(),
    color: new Color(),
    scale: 1,
    rise: 0,
    spin: 0,
    bornAt: 0,
  }),
)

export const deathRings: DeathRing[] = Array.from({ length: DEATH_RING_POOL_SIZE }, () => ({
  active: false,
  position: new Vector3(),
  color: new Color(),
  bornAt: 0,
}))

/** Blanc de référence pour l'éclaircissement de la teinte. */
const WHITE = new Color(1, 1, 1)

/**
 * Teinte de fumée tirée de la couleur de l'ennemi.
 *
 * Éclaircie de 45 % vers le blanc : à teinte pleine, le nuage d'un Octorok se
 * lit comme une gerbe de sang plutôt que comme de la fumée. Éclaircie
 * davantage, les deux espèces meurent dans le même gris et l'effet devient un
 * tampon générique posé sur tout.
 */
function smokeTint(target: Color, source: Color) {
  target.copy(source).lerp(WHITE, 0.45)
}

/**
 * Prend un emplacement libre, ou le plus ancien si le pool est plein.
 *
 * Même arbitrage que les cœurs : un joueur qui vient d'enchaîner huit ennemis
 * mérite la fumée du huitième plus que celle du premier, déjà dissipée aux
 * trois quarts.
 */
function claim<T extends { active: boolean; bornAt: number }>(pool: T[]) {
  return (
    pool.find((slot) => !slot.active) ??
    pool.reduce((oldest, slot) => (slot.bornAt < oldest.bornAt ? slot : oldest))
  )
}

/** Fait éclore une bouffée complète autour d'un point. */
export function spawnDeathPuff(x: number, y: number, z: number, source: Color) {
  const bornAt = gameNow()
  for (const offset of OFFSETS) {
    const slot = claim(deathPuffs)
    slot.active = true
    slot.position.set(x + offset.x, y + offset.y, z + offset.z)
    smokeTint(slot.color, source)
    slot.scale = offset.scale
    slot.rise = offset.rise
    slot.spin = offset.spin
    slot.bornAt = bornAt
  }
}

/** Pose l'anneau de choc. `y` est la hauteur du sol, pas celle du corps. */
export function spawnDeathRing(x: number, y: number, z: number, source: Color) {
  const slot = claim(deathRings)
  slot.active = true
  // Deux centimètres au-dessus du sol : posé dessus, l'anneau se bat avec le
  // terrain dans le tampon de profondeur et clignote par bandes.
  slot.position.set(x, y + 0.02, z)
  smokeTint(slot.color, source)
  slot.bornAt = gameNow()
}

/** Vide les deux pools. Appelé au redémarrage d'une partie. */
export function clearDeathPuffs() {
  for (const puff of deathPuffs) puff.active = false
  for (const ring of deathRings) ring.active = false
}

if (import.meta.env.DEV) {
  // Le pool est le seul moyen de vérifier l'effet sans tuer un ennemi : une
  // mort dure 210 ms, on ne la déclenche pas à la demande au bon moment.
  ;(window as unknown as Record<string, unknown>).__deathPuffs = {
    deathPuffs,
    deathRings,
    spawnDeathPuff,
    spawnDeathRing,
    clearDeathPuffs,
  }
}
```

- [ ] **Étape 2 : Vider le pool au redémarrage**

Dans `src/components/HUD.tsx`, ajouter l'import :

```tsx
import { clearDeathPuffs } from '../state/deathPuffs'
```

Et remplacer `restart` :

```tsx
  const restart = () => {
    // Projectiles en vol, cœurs au sol et fumées en cours survivraient au
    // redémarrage : ils vivent dans des pools hors React, que remonter les
    // composants ne vide pas.
    clearProjectiles()
    clearPickups()
    clearDeathPuffs()
    reset()
  }
```

- [ ] **Étape 3 : Vérifier**

```bash
npm run lint && npm run build
```

En jeu, console :

```js
const { deathPuffs, deathRings, spawnDeathPuff, spawnDeathRing } = __deathPuffs
const { Color } = await import('three')

spawnDeathPuff(0, 0, 0, new Color('#d9534a'))
console.log('actifs :', deathPuffs.filter((p) => p.active).length)   // 6
console.log('teinte :', deathPuffs[0].color.getHexString())          // éclairci vs d9534a

spawnDeathRing(0, 0, 0, new Color('#d9534a'))
console.log('anneaux :', deathRings.filter((r) => r.active).length)  // 1

// Recyclage : dix bouffées dans un pool de 48 doivent en garder 48 actives,
// jamais plus, et aucune ne doit rester coincée.
for (let i = 0; i < 10; i++) spawnDeathPuff(i, 0, 0, new Color('#ffffff'))
console.log('après saturation :', deathPuffs.filter((p) => p.active).length)  // 48
```

Attendu : les valeurs commentées. La teinte doit être visiblement plus claire que `d9534a` sans être blanche.

- [ ] **Étape 4 : Commit**

```bash
git add src/state/deathPuffs.ts src/components/HUD.tsx
git commit -m "feat: pools des nuages et anneaux de mort

Hors React : la fumée vit 600 ms quand l'ennemi se démonte au bout de 150.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 6 : Rendu des nuages

**Fichiers :**
- Créer : `src/components/DeathPuffs.tsx`
- Modifier : `src/App.tsx` (montage à côté de `<SwordArc />` et `<OutfitSmoke />`)

**Interfaces :**
- Consomme : `deathPuffs`, `DEATH_PUFF_MS`, `DEATH_PUFF_POOL_SIZE`, `DEATH_PUFF_SIZE` (tâche 5) ; `faceted` de `src/components/environment/faceted.ts` ; `now` de `gameClock`.
- Produit : `<DeathPuffs />`.

- [ ] **Étape 1 : Créer `src/components/DeathPuffs.tsx`**

```tsx
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Euler,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three'
import { now as gameNow } from '../state/gameClock'
import {
  DEATH_PUFF_MS,
  DEATH_PUFF_POOL_SIZE,
  DEATH_PUFF_SIZE,
  deathPuffs,
} from '../state/deathPuffs'
import { faceted } from './environment/faceted'

const HIDDEN = new Matrix4().makeScale(0, 0, 0)
const matrix = new Matrix4()
const position = new Vector3()
const quaternion = new Quaternion()
const scale = new Vector3()
const euler = new Euler()

/**
 * Matériau des fumées de mort.
 *
 * Un `ShaderMaterial` brut, et c'est le seul choix qui tient. Il faut un
 * `InstancedMesh` — un draw call quel que soit le nombre de morts à l'écran —
 * or **l'opacité par instance n'existe pas** sur les matériaux standard.
 *
 * `Pickups` a contourné le problème analogue en animant l'échelle plutôt que
 * l'opacité, ce qui marche pour un cœur qui palpite ; pour de la fumée, un
 * nuage qui rétrécit se lit comme une bulle qui rentre, pas comme une
 * dissipation. D'où deux attributs d'instance, `aAlpha` et `aColor`, et douze
 * lignes de GLSL — le projet écrit déjà un shader brut pour la traînée d'épée.
 *
 * `instanceMatrix` n'est **pas** déclaré ici : three l'injecte lui-même dans le
 * préfixe du vertex shader dès que l'objet est un `InstancedMesh`. Le
 * redéclarer casse la compilation.
 */
function makePuffMaterial() {
  return new ShaderMaterial({
    transparent: true,
    // Pas d'écriture de profondeur : la fumée doit se superposer au décor et à
    // elle-même, jamais le découper. Le test reste actif pour qu'un relief
    // devant elle la cache normalement. Même réglage que la fumée de tenue.
    depthWrite: false,
    vertexShader: `
      attribute float aAlpha;
      attribute vec3 aColor;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vAlpha = aAlpha;
        vColor = aColor;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        if (vAlpha < 0.01) discard;
        gl_FragColor = vec4(vColor, vAlpha);
      }
    `,
  })
}

/**
 * Fumées laissées par les ennemis vaincus.
 *
 * Rendu hors de `<Physics>`, comme la traînée de lame et la fumée de tenue :
 * ce n'est qu'un effet, il n'a ni collider ni corps à simuler.
 *
 * Chronométré sur l'**horloge de jeu** et non sur `performance.now()` — à
 * l'inverse d'`OutfitSmoke`, et la différence est de fond : un changement de
 * tenue se fait depuis un menu, donc en pause, et doit jouer malgré elle ; une
 * mort est un événement de jeu et doit se figer avec le reste, pause comprise
 * et gel compris. Aucune garde de phase n'est nécessaire ici, contrairement à
 * `Pickups` : l'horloge est déjà arrêtée, donc l'âge des nuages ne bouge pas.
 */
export function DeathPuffs() {
  const mesh = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => {
    // Facettée, comme tout le décor et comme la fumée de tenue.
    const base = faceted(new IcosahedronGeometry(DEATH_PUFF_SIZE, 0))
    base.setAttribute(
      'aAlpha',
      new InstancedBufferAttribute(new Float32Array(DEATH_PUFF_POOL_SIZE), 1),
    )
    base.setAttribute(
      'aColor',
      new InstancedBufferAttribute(new Float32Array(DEATH_PUFF_POOL_SIZE * 3), 3),
    )
    return base
  }, [])

  const material = useMemo(makePuffMaterial, [])

  useFrame(() => {
    const instanced = mesh.current
    if (!instanced) return

    const now = gameNow()
    const alpha = geometry.getAttribute('aAlpha') as InstancedBufferAttribute
    const colors = geometry.getAttribute('aColor') as InstancedBufferAttribute

    for (let i = 0; i < deathPuffs.length; i++) {
      const puff = deathPuffs[i]
      const k = puff.active ? (now - puff.bornAt) / DEATH_PUFF_MS : 1
      if (puff.active && k >= 1) puff.active = false

      if (!puff.active) {
        instanced.setMatrixAt(i, HIDDEN)
        alpha.setX(i, 0)
        continue
      }

      // Gonflement rapide puis dissipation lente. L'inverse se lirait comme une
      // bulle qui éclate, pas comme un nuage qui se disperse.
      const grow = Math.min(k * 3.2, 1)
      position.set(puff.position.x, puff.position.y + puff.rise * k, puff.position.z)
      euler.set(k * puff.spin, k * puff.spin * 1.4, 0)
      quaternion.setFromEuler(euler)
      scale.setScalar(puff.scale * (0.25 + grow * 0.95))
      matrix.compose(position, quaternion, scale)
      instanced.setMatrixAt(i, matrix)

      alpha.setX(i, 0.85 * (1 - k * k))
      colors.setXYZ(i, puff.color.r, puff.color.g, puff.color.b)
    }

    instanced.instanceMatrix.needsUpdate = true
    alpha.needsUpdate = true
    colors.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, DEATH_PUFF_POOL_SIZE]}
      // Après la traînée de lame (2) : sur un coup fatal les deux se
      // superposent, et c'est la fumée qui doit passer devant.
      renderOrder={3}
      // Les fumées sont dispersées sur toute la carte : recalculer un volume
      // englobant commun à chaque frame coûterait plus cher que de les dessiner.
      frustumCulled={false}
    />
  )
}
```

- [ ] **Étape 2 : Monter le composant dans `App.tsx`**

Ajouter l'import :

```tsx
import { DeathPuffs } from './components/DeathPuffs'
```

Et l'ajouter au bloc hors `<Physics>` :

```tsx
          {/* Hors de <Physics> : la traînée de lame, la fumée de changement de
              tenue et les fumées de mort ne sont que des effets visuels, elles
              n'ont ni collider ni corps à simuler. */}
          <SwordArc />
          <OutfitSmoke />
          <DeathPuffs />
```

- [ ] **Étape 3 : Vérifier**

```bash
npm run lint && npm run build
```

En jeu, se placer sur du terrain dégagé, puis dans la console :

```js
const { Color } = await import('three')
const p = playerTransform.position
// Devant le joueur, à hauteur de poitrine.
__deathPuffs.spawnDeathPuff(p.x, p.y - 0.4, p.z + 3, new Color('#d9534a'))
```

Attendu : une bouffée rouge pâle gonfle vite, monte, tourne, et se dissipe en ~0,6 s. Répéter avec `#9a6b3f` — la fumée doit être visiblement brune.

Si rien n'apparaît : vérifier la console pour une erreur de compilation GLSL. Une redéclaration d'`instanceMatrix` est la cause la plus probable.

Vérifier aussi la pause : lancer une bouffée, puis ouvrir l'inventaire dans la seconde. La fumée doit **se figer**, pas continuer.

- [ ] **Étape 4 : Commit**

```bash
git add src/components/DeathPuffs.tsx src/App.tsx
git commit -m "feat: rendu des fumées de mort

InstancedMesh + ShaderMaterial : l'opacité par instance n'existe pas sur
les matériaux standard, et une fumée qui rétrécit n'est pas une fumée qui
se dissipe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 7 : Anneau de choc au sol

**Tâche à part, et c'est délibéré : c'est la seule qu'on peut abandonner.** `SwordArc` documente que la caméra ne voit un objet couché au sol que sous 28°, et que l'anneau d'épée s'y lisait comme une flaque avant d'être redressé. Un anneau de choc devrait mieux passer — il est concentrique et en expansion, sa forme se devine même écrasée — mais ça se tranche à l'écran. **Si l'étape 3 montre qu'il se lit mal, abandonner la tâche et retirer `spawnDeathRing` de `deathPuffs.ts`** plutôt que de le garder par acquit de conscience.

**Fichiers :**
- Modifier : `src/components/DeathPuffs.tsx`

**Interfaces :**
- Consomme : `deathRings`, `DEATH_RING_MS`, `DEATH_RING_POOL_SIZE`, `DEATH_RING_FROM`, `DEATH_RING_TO` (tâche 5) ; `makePuffMaterial` (tâche 6, à passer de fonction locale à fonction partagée dans le même fichier — elle l'est déjà).
- Produit : rien de nouveau vers l'extérieur.

- [ ] **Étape 1 : Étendre les imports**

```tsx
import {
  Euler,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import {
  DEATH_PUFF_MS,
  DEATH_PUFF_POOL_SIZE,
  DEATH_PUFF_SIZE,
  DEATH_RING_FROM,
  DEATH_RING_MS,
  DEATH_RING_POOL_SIZE,
  DEATH_RING_TO,
  deathPuffs,
  deathRings,
} from '../state/deathPuffs'
```

- [ ] **Étape 2 : Ajouter le composant `DeathRings` dans le même fichier**

À ajouter après `DeathPuffs`, et à rendre depuis `DeathPuffs` (voir étape 3) :

```tsx
/** Couché à plat : la géométrie d'anneau naît dans le plan XY. */
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0))

/**
 * Anneau de choc, posé au sol sous l'ennemi vaincu.
 *
 * Il partage le shader des fumées : même besoin d'opacité et de teinte par
 * instance, aucune raison d'en écrire un second.
 *
 * L'anneau est **la première chose à couper** si l'effet ne se lit pas.
 * `SwordArc` documente que la caméra, à 11 unités de haut pour 21 de recul, ne
 * voit un objet couché que sous 28° : elle n'en présente qu'un peu plus du
 * tiers de la surface. Le pari est qu'une forme concentrique en expansion
 * survit à cet écrasement là où un ruban ne survivait pas — mais c'est un
 * pari, pas une certitude.
 */
function DeathRings() {
  const mesh = useRef<InstancedMesh>(null)

  const geometry = useMemo(() => {
    // Rayon unitaire : c'est l'échelle d'instance qui fait grandir l'anneau,
    // pas une géométrie régénérée à chaque frame.
    const base = new RingGeometry(0.86, 1, 36)
    base.setAttribute(
      'aAlpha',
      new InstancedBufferAttribute(new Float32Array(DEATH_RING_POOL_SIZE), 1),
    )
    base.setAttribute(
      'aColor',
      new InstancedBufferAttribute(new Float32Array(DEATH_RING_POOL_SIZE * 3), 3),
    )
    return base
  }, [])

  const material = useMemo(() => {
    const shared = makePuffMaterial()
    // Visible des deux côtés : sur une pente, la caméra peut passer sous le
    // plan de l'anneau, et un anneau qui disparaît selon l'inclinaison du
    // terrain se lit comme un bug.
    shared.side = DoubleSide
    return shared
  }, [])

  useFrame(() => {
    const instanced = mesh.current
    if (!instanced) return

    const now = gameNow()
    const alpha = geometry.getAttribute('aAlpha') as InstancedBufferAttribute
    const colors = geometry.getAttribute('aColor') as InstancedBufferAttribute

    for (let i = 0; i < deathRings.length; i++) {
      const ring = deathRings[i]
      const k = ring.active ? (now - ring.bornAt) / DEATH_RING_MS : 1
      if (ring.active && k >= 1) ring.active = false

      if (!ring.active) {
        instanced.setMatrixAt(i, HIDDEN)
        alpha.setX(i, 0)
        continue
      }

      // Expansion en sortie cubique : l'onde part vite et s'essouffle, ce qui
      // est le mouvement d'un choc. Linéaire, elle se lit comme un halo qui
      // grandit.
      const ease = 1 - (1 - k) ** 3
      const radius = DEATH_RING_FROM + (DEATH_RING_TO - DEATH_RING_FROM) * ease
      position.copy(ring.position)
      scale.set(radius, radius, radius)
      matrix.compose(position, FLAT, scale)
      instanced.setMatrixAt(i, matrix)

      // Extinction plus rapide que l'expansion : l'anneau doit avoir disparu
      // avant d'atteindre sa taille maximale, sinon il stationne.
      alpha.setX(i, 0.7 * (1 - k) ** 2)
      colors.setXYZ(i, ring.color.r, ring.color.g, ring.color.b)
    }

    instanced.instanceMatrix.needsUpdate = true
    alpha.needsUpdate = true
    colors.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, DEATH_RING_POOL_SIZE]}
      renderOrder={3}
      frustumCulled={false}
    />
  )
}
```

Ajouter `DoubleSide` à l'import depuis `three`.

- [ ] **Étape 3 : Rendre les deux ensemble**

Transformer le `return` de `DeathPuffs` pour qu'il rende aussi les anneaux — et renommer le corps existant en composant interne. Le plus simple, et le moins intrusif : garder `DeathPuffs` comme composant exporté qui rend les deux.

Renommer la fonction exportée existante en `SmokeClouds` (fonction locale, non exportée), puis ajouter en fin de fichier :

```tsx
/**
 * Effets laissés par les ennemis vaincus : les fumées et l'anneau de choc.
 *
 * Deux `InstancedMesh` et non un seul : les géométries diffèrent, et une
 * géométrie par instance n'existe pas. Deux draw calls pour toutes les morts
 * de l'écran, quel qu'en soit le nombre.
 */
export function DeathPuffs() {
  return (
    <>
      <SmokeClouds />
      <DeathRings />
    </>
  )
}
```

`App.tsx` n'a rien à changer : il monte toujours `<DeathPuffs />`.

- [ ] **Étape 4 : Juger l'anneau, et décider**

```bash
npm run lint && npm run build
```

En jeu, sur terrain plat puis sur une pente :

```js
const { Color } = await import('three')
const p = playerTransform.position
__deathPuffs.spawnDeathRing(p.x, p.y - 0.8, p.z + 3, new Color('#d9534a'))
// Puis les deux ensemble, comme à la mort :
__deathPuffs.spawnDeathPuff(p.x, p.y - 0.4, p.z + 3, new Color('#d9534a'))
__deathPuffs.spawnDeathRing(p.x, p.y - 0.8, p.z + 3, new Color('#d9534a'))
```

**La question à trancher :** l'anneau ajoute-t-il de la lisibilité à l'impact, ou n'est-il qu'une tache pâle sous la fumée ? Le tester aussi sur une pente et dans l'herbe haute.

- Si **oui** : passer à l'étape 5.
- Si **non** : `git checkout src/components/DeathPuffs.tsx`, puis retirer de `src/state/deathPuffs.ts` les exports `deathRings`, `spawnDeathRing`, `DeathRing`, `DEATH_RING_*` et leur usage dans `clearDeathPuffs`. Committer ce retrait, noter la décision, et **sauter la ligne `spawnDeathRing` de la tâche 8**.

- [ ] **Étape 5 : Commit**

```bash
git add src/components/DeathPuffs.tsx
git commit -m "feat: anneau de choc au sol à la mort d'un ennemi

Partage le shader des fumées. DoubleSide : sur une pente la caméra peut
passer sous le plan de l'anneau.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 8 : La séquence de mort

L'intégration. Tout ce qui précède est câblé ici.

**Fichiers :**
- Modifier : `src/config/enemies.ts:94-97` (constantes)
- Modifier : `src/components/Enemy.tsx` — imports, `EnemyRuntime`, `damageEnemy`, initialisation du runtime, branche « Mort », ordre du culling

**Interfaces :**
- Consomme : `hitStop` (tâche 1), `playDefeat` (tâche 3), `shake` (tâche 4), `spawnDeathPuff` / `spawnDeathRing` (tâche 5), `sampleHeight` de `src/config/world.ts`.
- Produit : `window.__lastDeath` en développement.

- [ ] **Étape 1 : Les constantes**

Dans `src/config/enemies.ts`, remplacer :

```ts
/** Durée de l'effondrement à la mort, avant disparition. */
export const DEATH_FADE_MS = 500
```

par :

```ts
/**
 * Gel du monde sur le coup fatal, en millisecondes de temps **réel**.
 *
 * En dessous de ~60 ms le gel ne se lit pas ; au-delà de ~110 ms il ne se lit
 * plus comme un effet mais comme un à-coup de framerate.
 */
export const HIT_STOP_MS = 80
/**
 * Fin de la pose d'anticipation, en temps de **jeu**.
 *
 * Volontairement court, et ce n'est pas un oubli : le gel tient déjà cette pose
 * 80 ms de temps réel, pendant lesquelles l'horloge de jeu ne bouge pas. Les
 * deux durées s'additionnent à l'écran. Réglée « proprement » à 90 ms, la pose
 * en paraîtrait 170 et la mort deviendrait molle.
 */
export const DEATH_SQUASH_MS = 40
/** Pic de la détente : le corps disparaît, la fumée naît. */
export const DEATH_POP_MS = 130
/** Démontage du composant, quelques frames après le pic. */
export const DEATH_REMOVE_MS = 150
/** Amplitude de la secousse caméra, en unités monde. */
export const DEATH_SHAKE_AMPLITUDE = 0.08
/** Durée de la secousse, en millisecondes de temps réel. */
export const DEATH_SHAKE_MS = 120
```

- [ ] **Étape 2 : Les imports d'`Enemy.tsx`**

Remplacer le bloc d'imports depuis `../config/enemies` :

```tsx
import {
  DEATH_POP_MS,
  DEATH_REMOVE_MS,
  DEATH_SHAKE_AMPLITUDE,
  DEATH_SHAKE_MS,
  DEATH_SQUASH_MS,
  ENEMIES,
  HEART_DROP_CHANCE,
  HIT_FLASH_MS,
  HIT_KNOCKBACK,
  HIT_STOP_MS,
} from '../config/enemies'
```

Et ajouter :

```tsx
import { playDefeat, playHit } from '../audio/sfx'
import { sampleHeight } from '../config/world'
import { shake } from '../state/cameraShake'
import { spawnDeathPuff, spawnDeathRing } from '../state/deathPuffs'
import { hitStop, now as gameNow } from '../state/gameClock'
```

(`playHit` et `gameNow` étaient déjà importés — fusionner, ne pas dupliquer les lignes d'import.)

- [ ] **Étape 3 : Les deux champs de runtime**

Dans `interface EnemyRuntime`, après `deathAt` :

```ts
  /**
   * Tiré à la mort, consommé au pic.
   *
   * Le tirage reste à l'instant de la mort — seul le lâcher est différé, pour
   * que le cœur se lise comme jaillissant de la fumée plutôt que du corps.
   */
  dropsHeart: boolean
  /** Vrai une fois la fumée émise : elle ne doit l'être qu'une fois. */
  popped: boolean
```

Et dans l'initialisation `useRef<EnemyRuntime>({...})`, après `deathAt: -Infinity,` :

```ts
    dropsHeart: false,
    popped: false,
```

- [ ] **Étape 4 : La sonde de développement**

Au niveau module d'`Enemy.tsx`, après la constante `WHITE` :

```tsx
/**
 * Dernière mort en date, pour vérification depuis la page.
 *
 * Même raison que `__lastSwing` : la séquence dure 210 ms, aucune capture ne
 * l'attrapera et le rendu headless tourne à 1 fps. Ce qui se mesure, ce sont
 * les horodatages et les drapeaux.
 */
const lastDeath = {
  spawnId: '',
  deathAt: -Infinity,
  poppedAt: -Infinity,
  dropsHeart: false,
}
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__lastDeath = lastDeath
}
```

- [ ] **Étape 5 : `damageEnemy` — armer la mort**

Remplacer le bloc final de `damageEnemy` (à partir de `state.state = 'dead'`) :

```ts
  state.state = 'dead'
  state.deathAt = now
  state.popped = false
  // Le tirage se fait ici, à l'instant de la mort, et avec `Math.random` et non
  // la graine du monde — une graine fixe rendrait les lâchers identiques à
  // chaque partie, et le joueur apprendrait quels ennemis « donnent » un cœur.
  // Seul le lâcher est différé, jusqu'au pic de la détente.
  state.dropsHeart = Math.random() < HEART_DROP_CHANCE
  useGameStore.getState().registerKill()

  // Les trois retours qui font la différence entre « l'ennemi a disparu » et
  // « je l'ai eu ». Tous trois chronométrés en temps réel : ils doivent jouer
  // pendant le gel, qui est le moment où ils portent.
  playDefeat()
  hitStop(HIT_STOP_MS)
  shake(DEATH_SHAKE_AMPLITUDE, DEATH_SHAKE_MS)

  if (import.meta.env.DEV) {
    lastDeath.spawnId = spawnId
    lastDeath.deathAt = now
    lastDeath.poppedAt = -Infinity
    lastDeath.dropsHeart = state.dropsHeart
  }

  return true
}
```

Le `dropPickup` et son commentaire disparaissent d'ici — ils remontent dans la branche de mort. Si `dropPickup` n'est plus référencé dans `damageEnemy`, l'import reste nécessaire (la branche de mort l'utilise).

- [ ] **Étape 6 : La branche de mort, déplacée avant le culling**

Dans `useFrame`, **supprimer** l'ancienne branche `if (state.state === 'dead') {...}` (qui suit `updateEnemyMarker`) et **insérer** la nouvelle juste après `const position = rb.translation()`, donc **avant** le calcul de `toPlayer` et avant le test de culling :

```tsx
    // --- Mort ---------------------------------------------------------------
    // Placée **avant** le test de culling, et c'est une correction : un ennemi
    // tué puis quitté au-delà d'ACTIVE_RADIUS n'atteignait jamais cette
    // branche. Il restait figé en `dead` pour le reste de la partie, ne se
    // démontait jamais, et son entrée de registre restait en mémoire.
    if (state.state === 'dead') {
      const age = now - state.deathAt

      // Le corps reste blanc jusqu'au bout. L'affectation du flash est plus
      // bas, après ce `return` : sans ces deux lignes, un cadavre reprendrait
      // sa couleur d'origine au milieu de sa propre mort.
      materials.body.color.copy(WHITE)
      materials.dark.color.copy(WHITE)

      if (age < DEATH_SQUASH_MS) {
        // Anticipation : le corps se ramasse. C'est la pose que le gel tient,
        // donc la frame que le joueur regarde vraiment.
        group.scale.set(1.35, 0.6, 1.35)
        group.position.y = 0
        group.position.z = 0
      } else if (age < DEATH_POP_MS) {
        // Détente, en sortie cubique : une rampe linéaire donne un étirement
        // mou, qui se lit comme un objet qu'on tire et non comme un ressort
        // qu'on lâche.
        const t = (age - DEATH_SQUASH_MS) / (DEATH_POP_MS - DEATH_SQUASH_MS)
        const ease = 1 - (1 - t) ** 3
        group.scale.set(1.35 - 0.75 * ease, 0.6 + 0.9 * ease, 1.35 - 0.75 * ease)
        group.position.y = ease * 0.2
        group.position.z = 0
      } else if (!state.popped) {
        state.popped = true
        group.visible = false
        spawnDeathPuff(position.x, position.y, position.z, materials.base.body)
        // L'anneau se pose sur la surface **visible** du terrain, pas sous le
        // centre de la capsule : même échantillonneur que le mesh, le collider
        // et les cœurs, donc aucune seconde source de vérité.
        spawnDeathRing(
          position.x,
          sampleHeight(position.x, position.z),
          position.z,
          materials.base.body,
        )
        // Le cœur part de la poitrine, pas des pieds : le petit saut le rend
        // visible par-dessus les herbes hautes avant qu'il ne retombe.
        if (state.dropsHeart) dropPickup(position.x, position.y + 0.3, position.z)
        // Le point quitte la minimap au pic et non au démontage : la carte et
        // l'écran doivent dire la même chose au même moment.
        enemyRegistry.delete(spawn.id)
        if (import.meta.env.DEV) lastDeath.poppedAt = now
      }

      rb.setLinvel({ x: 0, y: rb.linvel().y, z: 0 }, false)
      if (age >= DEATH_REMOVE_MS) setRemoved(true)
      return
    }
```

Si la tâche 7 a été abandonnée, retirer l'appel `spawnDeathRing` et son import.

- [ ] **Étape 7 : Vérifier la séquence**

```bash
npm run lint && npm run build
```

En jeu, tuer un Octorok (2 coups) puis un Moblin (3 coups). Attendu à l'œil :

1. Le monde se fige net sur le dernier coup, avec la caméra qui tremble et le son grave.
2. Le corps repart vers le haut en s'étirant.
3. Il disparaît dans une fumée à sa couleur, avec l'anneau au sol.
4. Le cœur, quand il tombe, sort de la fumée et non du corps.

Puis dans la console, juste après une mort :

```js
__lastDeath
// { spawnId, deathAt, poppedAt, dropsHeart }
console.log('pic à', __lastDeath.poppedAt - __lastDeath.deathAt, 'ms de jeu')  // ≈ 130
console.log('ennemi encore en registre ?', !!__enemyRegistry.get(__lastDeath.spawnId))  // false
```

- [ ] **Étape 8 : Vérifier la non-régression d'un coup non fatal**

Frapper un Moblin **une seule fois** (il en faut trois).

Attendu : flash blanc, recul, **aucun gel**, **aucune secousse**, **aucune fumée**, et sa barre de vie s'affiche normalement. C'est la régression principale à ne pas laisser passer.

```js
__gameClock.isHitStopped()   // false, en frappant sans tuer
```

- [ ] **Étape 9 : Vérifier la correction du culling**

```js
// Tuer un ennemi, puis se téléporter loin dans la même seconde.
const { deathPuffs } = __deathPuffs
// (tuer l'ennemi au corps à corps, puis immédiatement :)
__playerBody.setTranslation({ x: 200, y: 40, z: 200 }, true)
setTimeout(() => console.log('registre :', __enemies().length), 1000)
```

Attendu : le compte d'ennemis ne contient pas de fantôme figé en `dead`. Avant la correction, l'ennemi tué serait resté indéfiniment dans `__enemies()`.

- [ ] **Étape 10 : Commit**

```bash
git add src/config/enemies.ts src/components/Enemy.tsx
git commit -m "feat: séquence de mort d'un ennemi

Anticipation tenue par le gel, détente en sortie cubique, disparition au
pic dans une fumée à la couleur de l'espèce. Le cœur part du pic, pas de
l'instant de la mort.

Corrige au passage un ennemi tué puis quitté au-delà d'ACTIVE_RADIUS :
sa branche de mort n'était jamais atteinte et il ne se démontait jamais.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 9 : Passe de vérification d'ensemble

Les huit tâches précédentes vérifient chacune leur pièce. Celle-ci vérifie les interactions, qui sont là où les bugs restent.

**Fichiers :** aucun, sauf correction.

- [ ] **Étape 1 : Dérouler les dix points de la spec**

Chacun se coche depuis la page, jamais à l'œil seul quand une sonde existe.

1. **Le gel se termine, focus perdu compris.** Tuer un ennemi et basculer d'onglet dans la foulée. Revenir : le jeu doit tourner, pas être figé. (`requestAnimationFrame` est suspendu dans un onglet caché, donc `pollHitStop` ne tourne pas — mais `isHitStopped()` étant calculé à la lecture, la reprise le voit expiré. Le vérifier tout de même.)
2. **Rien ne bouge pendant le gel.** `__gameClock.hitStop(2000)` en maintenant une direction : joueur immobile, ennemis immobiles, projectiles en vol immobiles, `__gameClock.now()` constant.
3. **Deux morts dans la même frame.** Attirer deux ennemis, les tuer d'un même swing si possible ; sinon `__gameClock.hitStop(80); __cameraShake.shake(0.08, 120)` deux fois de suite. Attendu : un seul gel, une seule secousse d'amplitude nominale, deux fumées distinctes.
4. **Douze morts d'affilée.** `for (let i = 0; i < 12; i++) __deathPuffs.spawnDeathPuff(i * 2, 0, 0, new Color('#fff'))` — puis `__deathPuffs.deathPuffs.filter(p => p.active).length` doit plafonner à 48 et retomber à 0 après 0,6 s.
5. **Mort puis éloignement.** Couvert par la tâche 8, étape 9. Le refaire ici.
6. **Le cœur sort de la fumée.** Tuer des ennemis jusqu'à en voir un lâcher un cœur (40 % de chance). Le cœur doit apparaître *après* la disparition du corps.
7. **Mort pendant l'ouverture de l'inventaire.** Tuer un ennemi et ouvrir l'inventaire dans la demi-seconde. La fumée doit **se figer**, et reprendre à la fermeture.
8. **`App` ne se re-rend pas.** Réinsérer temporairement le compteur de la tâche 2, étape 4, tuer cinq ennemis, vérifier que `__appRenders` n'a pas bougé. **Retirer le compteur.**
9. **Qualité réduite.** Couper le post-traitement via le bouton qualité, tuer un ennemi : l'effet doit rester lisible sans le bloom.
10. **Mobile.** Émuler un appareil tactile (devtools), tuer un ennemi : le gel ne doit pas produire de rattrapage visible à la reprise.

- [ ] **Étape 2 : Vérification finale**

```bash
npx tsc -b && npm run lint && npm run build
```

Attendu : aucune erreur. C'est la barre que `HANDOFF.md` fixe avant d'annoncer qu'une étape est finie.

- [ ] **Étape 3 : Vérifier qu'aucune sonde temporaire ne subsiste**

```bash
git diff main --stat
grep -rn "__appRenders" src/
```

Attendu : le `grep` ne retourne rien. Les sondes `__gameClock`, `__cameraShake`, `__deathPuffs` et `__lastDeath` restent — elles sont sous `import.meta.env.DEV` et suivent la convention du projet.

- [ ] **Étape 4 : Mettre `HANDOFF.md` à jour**

Ajouter à la liste des crochets de diagnostic, en respectant le ton des entrées existantes :

```markdown
- `window.__cameraShake` — déclencher une secousse de caméra à la demande.
  Elle dure 120 ms : impossible à juger sur une capture
- `window.__deathPuffs` — les pools de fumée et d'anneaux, plus leurs
  `spawn*`. C'est le seul moyen de regarder l'effet de mort sans tuer un
  ennemi au bon moment
- `window.__lastDeath` — horodatages de la dernière mort (instant du coup
  fatal, instant du pic) et cœur lâché ou non. Même raison que `__lastSwing` :
  la séquence dure 210 ms
```

Et à `window.__gameClock`, préciser qu'il expose désormais `hitStop` et `isHitStopped`.

- [ ] **Étape 5 : Commit**

```bash
git add HANDOFF.md
git commit -m "docs: crochets de diagnostic de l'animation de défaite

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Ordre et dépendances

```
1 (horloge) ─┬─> 2 (physique) ─┐
             │                 │
3 (son) ─────┼─────────────────┼─> 8 (séquence) ──> 9 (vérification)
             │                 │
4 (secousse)─┤                 │
             │                 │
5 (pools) ───┴─> 6 (fumées) ───┴─> 7 (anneau, optionnel)
```

Les tâches 1, 3, 4 et 5 sont mutuellement indépendantes et peuvent se faire dans n'importe quel ordre. La 8 les consomme toutes.
