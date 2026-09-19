# Lynel argenté — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un boss final garde la rotonde de l'Île Céleste — un Lynel argenté de 4,3 unités, six attaques réparties sur trois phases, contre lequel le joueur dispose d'une parade au timing serré, signalée à l'écran.

**Architecture:** Le Lynel est un composant **à part** (`components/Lynel.tsx`), pas une troisième entrée dans la machine à états d'`Enemy.tsx` : celle-ci décrit une espèce par *une* attaque et ne sait ni enchaîner des séquences ni changer de phase. Il réutilise en revanche tout ce qui est partagé — registre de minimap, calque de combat, projectiles, horloge de jeu, gel du coup fatal — en s'inscrivant sous un `EnemyKind` de plus. La parade vit dans un singleton hors React (`state/parry.ts`) sur le modèle de `playerTransform` : le joueur y écrit son appui, le Lynel y dépose son offre, le calque de combat y lit ce qu'il doit dessiner. Aucun des trois ne connaît les deux autres.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`, `noUnusedLocals`), three 0.185, @react-three/fiber 9, @react-three/rapier 2, zustand 5, Vite 8. **Pas de test runner** : la vérification est `npm run build` (qui inclut `tsc -b`), `npm run lint` (oxlint), et des contrôles au navigateur pilotés par les crochets `window.__*` exposés en développement.

**Maquette :** `docs/maquettes/2026-09-19-lynel-argente.html` — **lire ce fichier est obligatoire** pour les tâches 2 et 3. Il contient la géométrie exacte, déjà réglée et validée à l'écran, ainsi que les six poses. Les tâches y renvoient par numéro de ligne. Le porter, ce n'est pas le réinventer : c'est remplacer ses `new THREE.X` par du JSX et ses matériaux locaux par ceux du projet.

## Décisions prises

| Question de la maquette | Réponse |
|---|---|
| 01 — touche de parade | **Ni `E`, ni `ShiftLeft`.** Voir Task 1, Step 1. |
| 05 — caméra du jeu pour un boss | **Caméra d'arène rapprochée**, activée à l'entrée du combat. Task 4. |
| Signal de fenêtre de parade | **Demandé en plus** : anneau au sol sous le joueur, dans le calque de combat. Task 1, Step 5. |

## Questions encore ouvertes

Elles ne bloquent aucune tâche avant celle qui les porte, et chacune a un défaut assumé dans le plan. À confirmer avant d'attaquer la tâche indiquée.

| # | Question | Défaut retenu | Tâche concernée |
|---|---|---|---|
| 02 | La parade marche-t-elle sur les Moblins ? | **Non pour l'instant.** La touche et la mécanique sont générales ; seules les attaques qui appellent `offerParry()` sont parables, et seul le Lynel le fait. Étendre au Moblin sera une ligne dans `Enemy.tsx`. | Task 1 |
| 03 | Trois phases ou deux ? | **Trois**, mais la phase III est la Task 6 et rien d'autre n'en dépend : la retirer, c'est ne pas faire la tâche. | Task 6 |
| 04 | Que donne la victoire ? | **Un réceptacle de cœur**, qui réutilise `claimHeartContainer()` et `<HeartContainer>` tels quels. La quatrième tenue coûte un `ItemId`, une illustration d'inventaire (~400 lignes, cf. `ItemIllustration.tsx`) et deux entrées i18n. | Task 7 |

---

## Global Constraints

- **Aucune dépendance ajoutée** — `package.json` reste inchangé.
- **i18n en miroir** : toute clé ajoutée à `src/i18n/fr.json` doit l'être à l'identique dans `src/i18n/en.json`. `DICTIONARIES_MIRROR` dans `src/i18n/index.ts` casse la compilation sinon. Le français fait foi.
- **Commentaires en français**, à la densité du fichier voisin : ils expliquent *pourquoi*, jamais *quoi*. Un nombre mesuré s'accompagne de la mesure.
- **TypeScript** : imports de types via `import type` (`verbatimModuleSyntax`). Aucune variable ni aucun paramètre inutilisé (`noUnusedLocals`, `noUnusedParameters`).
- **Facettage** : `MeshToonMaterial` n'accepte pas `flatShading`. Passer chaque géométrie qui doit être facettée par `faceted()` de `src/components/environment/faceted.ts`.
- **Le dégradé toon** vient de `src/components/models/toonGradient.ts` et se passe en `gradientMap` à tout matériau toon.
- **Pas de `pointLight`** : elle ajoute une passe d'éclairage dans *tous* les shaders de la scène. Le bloom du post-traitement fait le halo à partir de l'émissif.
- **Horloge** : tout délai de gameplay se mesure sur `now()` de `src/state/gameClock.ts`, qui s'arrête en pause et pendant le gel. Seules les animations CSS et ce qui doit jouer *pendant* une pause utilisent `performance.now()`.
- **Écriture dans le store depuis un `useFrame`** : lire avec `useGameStore.getState()`, jamais avec le hook — ces composants ne doivent pas se re-rendre.
- **Fenêtres temporelles** : une fenêtre de gameplay est un **drapeau consommé**, jamais un intervalle testé à chaque frame. Tester « sommes-nous dans la fenêtre ? » revient à échantillonner quelques centaines de millisecondes dans une boucle à cadence variable ; sur une machine lente, une frame sur deux tombe à côté. Le piège est déjà payé trois fois sur ce projet — voir les commentaires de `Enemy.tsx:396` et `Enemy.tsx:525`.
- **Vérification de fin de tâche** : `npm run build` et `npm run lint` passent, plus les contrôles navigateur listés. `npm run dev` sert sur http://localhost:5173.
- **Pour se rendre sur l'île en développement**, dans la console :
  ```js
  __store.getState().triggerAnnihilation()
  // attendre ~4 s que l'onde vide la carte et que le portail s'ouvre
  __playerBody.current.setTranslation({ x: 66, y: 8, z: -66 }, true)
  // franchir le portail avec F, puis une fois sur l'île :
  __playerBody.current.setTranslation({ x: 0, y: 9, z: 6 }, true)  // la rotonde
  ```

---

## File Structure

| Fichier | Création / Modif | Responsabilité |
|---|---|---|
| `src/config/controls.ts` | Modifier | La commande `parry` et son rappel de touche. |
| `src/state/parry.ts` | Créer | L'état de parade partagé hors React : l'offre, la garde, la récupération. |
| `src/config/parry.ts` | Créer | Les cinq durées de la parade, et rien d'autre. |
| `src/state/touchInput.ts` | Modifier | Le drapeau `parryRequested`. |
| `src/components/Player.tsx` | Modifier | Abonnement à la touche, appel de `pressParry()`, pose de garde. |
| `src/components/TouchControls.tsx` | Modifier | Le troisième bouton. |
| `src/index.css` | Modifier | Style du bouton de parade. |
| `src/components/CombatOverlay.tsx` | Modifier | L'anneau de parade au sol. |
| `src/components/models/HeroPlaceholder.tsx` | Modifier | La pose de garde du héros. |
| `src/audio/sfx.ts` | Modifier | `playParry`, `playParrySuccess`, `playImpact`. |
| `src/i18n/fr.json` / `en.json` | Modifier | `ui.hud.parry`, `ui.touch.parry`, `ui.boss.*`. |
| `src/types/game.ts` | Modifier | `'lynel'` dans `EnemyKind` ; `LynelPhase`, `LynelAttackId`. |
| `src/config/enemies.ts` | Modifier | L'entrée `ENEMIES.lynel` — ce que les systèmes partagés ont besoin de savoir. |
| `src/config/lynel.ts` | Créer | La table des six attaques, les seuils de phase, les cotes de l'arène. |
| `src/components/enemies/models.tsx` | Modifier | La palette `lynel` dans `PALETTES`. |
| `src/components/enemies/LynelModel.tsx` | Créer | La géométrie du Lynel, portée de la maquette, et son rig de poses. |
| `src/components/enemies/lynelMaterials.ts` | Créer | Les matériaux propres au Lynel (or, métal, corne, acier, sabot, cuir). |
| `src/components/Lynel.tsx` | Créer | Corps physique, machine à états, séquences d'attaques, phases. |
| `src/components/skyisland/SkyIsland.tsx` | Modifier | Monte le Lynel dans la rotonde. |
| `src/store/useGameStore.ts` | Modifier | `bossState`, `startBossFight()`, `endBossFight()`. |
| `src/config/gameplay.ts` | Modifier | `CAMERA.arena`. |
| `src/components/CameraRig.tsx` | Modifier | Interpolation entre caméra de jeu et caméra d'arène. |
| `src/components/skyisland/ArenaGate.tsx` | Créer | Les deux barrières violettes des travées écroulées. |
| `src/analytics/index.ts` | Modifier | Événements `boss_engaged`, `boss_defeated`, `boss_parry`. |
| `ROADMAP.md` | Modifier | Entrée de la fonctionnalité. |

---

## Task 1 : la parade, côté joueur

La mécanique complète, sans aucun ennemi qui la sollicite. À la fin de cette tâche, `__parry.offer(600)` dans la console allume l'anneau au sol sous le joueur pendant 600 ms, la touche lève une garde visible, et marteler la touche verrouille la parade. C'est autonome et c'est vérifiable sans le boss.

**Files:**
- Create: `src/config/parry.ts`
- Create: `src/state/parry.ts`
- Modify: `src/config/controls.ts`
- Modify: `src/state/touchInput.ts`
- Modify: `src/components/Player.tsx`
- Modify: `src/components/TouchControls.tsx`
- Modify: `src/index.css`
- Modify: `src/components/CombatOverlay.tsx`
- Modify: `src/components/models/HeroPlaceholder.tsx`
- Modify: `src/audio/sfx.ts`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`
- Modify: `src/state/playerTransform.ts`

**Interfaces:**
- Consumes: `now()` de `src/state/gameClock.ts` ; `playerTransform` ; `projectToScreen`, `makeScreenPoint` de `src/state/cameraView.ts`.
- Produces:
  - `PARRY` (objet `as const` : `windowMs`, `recoveryMs`, `cueLeadMs`, `punishMs`, `hitStopMs`)
  - `parry` (singleton mutable : `offerFrom`, `offerUntil`, `offerBy`, `guardUntil`, `recoveryUntil`, `succeededAt`, `whiffedAt`)
  - `offerParry(by: string, impactAt: number): void`
  - `cancelParry(by: string): void`
  - `parryOffered(now: number): boolean`
  - `pressParry(now: number): 'guard' | 'guarding' | 'locked'`
  - `consumeParry(now: number): boolean`
  - `resetParry(): void`

---

- [ ] **Step 1 : la touche**

Modifier `src/config/controls.ts`. Ajouter `'parry'` à l'union `Control`, l'entrée dans `controlMap`, et le rappel dans `getControlHints`.

```ts
export type Control =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'jump'
  | 'attack'
  | 'interact'
  | 'parry'
```

Dans `controlMap`, après l'entrée `interact` :

```ts
  /*
    `KeyR`, et le choix mérite ses deux refus.

    Pas `KeyE` : l'attaque y est déjà, et fusionner les deux supprimerait le
    seul vrai choix du combat — risquer un coup d'épée au lieu de parer. Une
    touche qui fait deux choses selon le contexte ne laisse plus arbitrer.

    Pas `ShiftLeft`, qui était le candidat évident : Windows ouvre la boîte de
    dialogue des touches rémanentes au bout de **cinq appuis rapprochés** sur
    Maj. Un combat de boss à la parade en produit cinq en dix secondes, et la
    boîte vole le focus — donc la partie. Aucun code ne peut l'empêcher depuis
    une page web.

    `KeyR` est un code physique : même emplacement en AZERTY et en QWERTY, sous
    l'index gauche qui tient déjà ZQSD, libre, et voisin immédiat de la touche
    d'attaque.
  */
  { name: 'parry', keys: ['KeyR'] },
```

Dans `getControlHints`, après l'entrée `attack` :

```ts
    { keys: 'R', label: dict.ui.hud.parry },
```

- [ ] **Step 2 : les durées**

Créer `src/config/parry.ts`.

```ts
/**
 * Les cinq durées de la parade.
 *
 * Elles se tiennent les unes les autres, et c'est pour ça qu'elles vivent
 * ensemble : la fenêtre doit être assez courte pour que réussir compte, assez
 * longue pour être humaine, et la récupération doit être assez longue pour que
 * marteler la touche ne puisse jamais tomber juste par accident.
 */
export const PARRY = {
  /**
   * Durée de la garde ouverte par un appui.
   *
   * Le signal paraît `cueLeadMs` avant l'impact, donc il faut appuyer entre 160
   * et 420 ms après l'avoir vu. Le temps de réaction simple médian est d'environ
   * 250 ms : la fenêtre est *centrée* dessus, elle ne le frôle pas. C'est
   * difficile, jamais injuste.
   */
  windowMs: 260,
  /**
   * Immobilisation de la parade après la fin d'une garde qui n'a rien arrêté.
   *
   * La pièce maîtresse de tout l'équilibrage. Un appui qui part trop tôt ne rate
   * pas la parade : il la *consomme*. 450 ms de récupération après 260 ms de
   * garde, c'est 710 ms sans défense — plus que le plus long télégraphe du
   * Lynel. Un appui anticipé ne peut donc pas couvrir le coup qu'il anticipait.
   *
   * Et un appui *pendant* la récupération la relance (voir `pressParry`) : qui
   * martèle reste verrouillé tant qu'il martèle. C'est la seule règle qui rende
   * la mécanique incontournable plutôt que décorative.
   */
  recoveryMs: 450,
  /**
   * Avance du signal sur l'impact.
   *
   * 420 ms pour une fenêtre de 260 : la bande réactive utile est
   * `[impact − 260, impact]`, atteinte en réagissant entre 160 et 420 ms.
   */
  cueLeadMs: 420,
  /** Ouverture offerte par une parade réussie. Deux coups d'épée y rentrent. */
  punishMs: 1300,
  /**
   * Gel du monde sur une parade réussie.
   *
   * Le jeu gèle déjà 80 ms sur la mort d'un ennemi (`HIT_STOP_MS`). Une parade
   * doit taper plus fort que la mort d'un Octorok, sans quoi le geste le plus
   * difficile du jeu est celui qui se sent le moins.
   */
  hitStopMs: 110,
} as const
```

- [ ] **Step 3 : l'état partagé**

Créer `src/state/parry.ts`.

```ts
import { PARRY } from '../config/parry'
import { now as gameNow } from './gameClock'

/**
 * L'état de la parade, partagé **hors de React**.
 *
 * Même raison que `playerTransform` : trois boucles `useFrame` y touchent à
 * chaque frame — le joueur y écrit son appui, le boss y dépose son offre, le
 * calque de combat y lit ce qu'il doit dessiner. Un state React re-rendrait le
 * HUD soixante fois par seconde pour allumer un cercle.
 *
 * Aucun des trois ne connaît les deux autres, et c'est ce qui permettra
 * d'étendre la parade au Moblin sans toucher au joueur ni au calque : il
 * suffira que `Enemy.tsx` appelle `offerParry()`.
 */
export const parry = {
  /** Début de la fenêtre où le signal est allumé. */
  offerFrom: -Infinity,
  /** Instant de l'impact annoncé. Après lui, l'offre est caduque. */
  offerUntil: -Infinity,
  /**
   * Qui a fait l'offre.
   *
   * Sans ce champ, un ennemi tué pendant sa préparation laisserait une offre
   * derrière lui : le signal resterait allumé sous le joueur jusqu'à expiration,
   * et une parade partirait dans le vide en croyant couvrir quelque chose.
   */
  offerBy: '',
  /** Fin de la garde active. Un coup qui arrive avant est paré. */
  guardUntil: -Infinity,
  /** Fin de l'immobilisation. Aucune garde ne peut s'ouvrir avant. */
  recoveryUntil: -Infinity,
  /** Dernière parade réussie, pour le retour visuel. */
  succeededAt: -Infinity,
  /** Dernier appui refusé par la récupération, pour le retour visuel. */
  whiffedAt: -Infinity,
}

/**
 * Le boss annonce un coup parable qui touchera à `impactAt`.
 *
 * L'offre commence `cueLeadMs` avant l'impact et non à l'appel : le télégraphe
 * du balayage dure 620 ms, dont seules les 420 dernières sont réactives.
 * Allumer le signal dès le début du télégraphe donnerait 200 ms pendant
 * lesquelles appuyer *paraît* juste et ne l'est pas — la pire des leçons.
 */
export function offerParry(by: string, impactAt: number) {
  parry.offerBy = by
  parry.offerFrom = impactAt - PARRY.cueLeadMs
  parry.offerUntil = impactAt
}

/** Retire l'offre — coup annulé, ou mort de celui qui l'avait faite. */
export function cancelParry(by: string) {
  if (parry.offerBy !== by) return
  parry.offerBy = ''
  parry.offerFrom = -Infinity
  parry.offerUntil = -Infinity
}

/** Le signal doit-il être allumé ? */
export function parryOffered(now: number) {
  return now >= parry.offerFrom && now <= parry.offerUntil
}

/**
 * Le joueur appuie.
 *
 * Une seule formule, et elle produit gratuitement le comportement
 * anti-martèlement : un appui ouvre la garde puis la récupération qui la suit,
 * et un appui pendant la récupération la **relance**. Marteler à 4 Hz revient
 * donc à ne jamais sortir de la récupération.
 *
 * C'est plus simple que ce que décrivait la maquette, qui distinguait l'appui
 * « avant le signal » de l'appui « après » avec deux durées différentes. La
 * distinction était inutile : la même formule punit déjà l'anticipation, parce
 * que 260 + 450 = 710 ms dépassent le plus long télégraphe du Lynel.
 */
export function pressParry(now: number): 'guard' | 'guarding' | 'locked' {
  if (now < parry.recoveryUntil) {
    parry.recoveryUntil = now + PARRY.recoveryMs
    parry.whiffedAt = now
    return 'locked'
  }
  // Déjà en garde : un second appui ne la prolonge pas. Sans cette branche, on
  // pourrait tenir la garde ouverte indéfiniment en appuyant tous les 250 ms.
  if (now < parry.guardUntil) return 'guarding'

  parry.guardUntil = now + PARRY.windowMs
  parry.recoveryUntil = parry.guardUntil + PARRY.recoveryMs
  return 'guard'
}

/**
 * Le coup arrive : la garde le couvre-t-elle ?
 *
 * Consomme la garde en cas de succès, pour qu'une garde ne pare qu'un coup —
 * sinon les trois flèches du triple tir passeraient toutes sur un seul appui.
 */
export function consumeParry(now: number): boolean {
  if (now > parry.guardUntil) return false
  parry.guardUntil = -Infinity
  parry.recoveryUntil = -Infinity
  parry.succeededAt = now
  return true
}

/** Remet tout à plat au redémarrage d'une partie. Même rôle que `resetCombat`. */
export function resetParry() {
  parry.offerBy = ''
  parry.offerFrom = -Infinity
  parry.offerUntil = -Infinity
  parry.guardUntil = -Infinity
  parry.recoveryUntil = -Infinity
  parry.succeededAt = -Infinity
  parry.whiffedAt = -Infinity
}

/*
  Crochets de développement.

  Même raison que `__lastSwing` et `__projectiles` : la fenêtre dure 260 ms et
  le rendu headless tourne à ~1 fps. On ne peut pas *jouer* la situation, il
  faut pouvoir la poser — d'où `offer()`, qui simule une attaque parable sans
  qu'aucun ennemi n'existe.
*/
if (import.meta.env.DEV) {
  const hooks = window as unknown as Record<string, unknown>
  hooks.__parry = {
    state: parry,
    /** Annonce un coup parable qui touchera dans `inMs`. */
    offer: (inMs = 620) => offerParry('__dev', gameNow() + inMs),
  }
}
```

- [ ] **Step 4 : l'appui, côté joueur**

Modifier `src/state/touchInput.ts` — ajouter le drapeau à côté des deux autres :

```ts
  jumpRequested: false,
  attackRequested: false,
  parryRequested: false,
```

Modifier `src/state/playerTransform.ts` — `resetCombat()` doit remettre la parade à plat elle aussi :

```ts
import { resetParry } from './parry'
```

et à la fin du corps de `resetCombat()` :

```ts
  // Les horodatages de la parade vivent sur la même horloge, qui repart de zéro
  // à chaque partie : sans cette remise à plat, une garde ouverte dans la partie
  // précédente reste dans le « futur » de la nouvelle horloge et la parade est
  // verrouillée jusqu'à ce que le temps la rattrape. Piège déjà payé sur
  // `attackStartedAt` — voir l'en-tête de cette fonction.
  resetParry()
```

Modifier `src/components/Player.tsx`. Près de `const attackRequested = useRef(false)` (ligne 126) :

```ts
  const parryRequested = useRef(false)
```

Dans le `useEffect` d'abonnement clavier (ligne 141-157), ajouter un troisième abonnement et le désabonnement correspondant :

```ts
    const unsubscribeParry = subscribeKeys(
      (state) => state.parry,
      (pressed) => {
        if (pressed) parryRequested.current = true
      },
    )
```

```ts
      unsubscribeJump()
      unsubscribeAttack()
      unsubscribeParry()
```

Là où les drapeaux sont remis à plat en début de partie (lignes 188 et 194), ajouter :

```ts
      parryRequested.current = false
```
```ts
      touchInput.parryRequested = false
```

Et juste après le bloc « 4. Attaque » (ligne 320), ajouter le bloc 4 bis :

```ts
    // --- 4 bis. Parade --------------------------------------------------------
    // Événementielle comme l'attaque, et pour la même raison : sondée dans la
    // boucle, une pression plus courte qu'une frame serait perdue — et une
    // parade *est* plus courte qu'une frame sur une machine chargée.
    //
    // Aucune condition de contexte : la touche marche partout, même sans
    // ennemi. C'est ce qui permet au joueur d'apprendre le geste avant d'en
    // avoir besoin, et à `pressParry` de le punir s'il en abuse.
    if (parryRequested.current || touchInput.parryRequested) {
      parryRequested.current = false
      touchInput.parryRequested = false
      if (pressParry(gameNow()) === 'guard') playParry()
    }
```

Imports à ajouter en tête de `Player.tsx` :

```ts
import { pressParry } from '../state/parry'
import { playParry } from '../audio/sfx'
```

> `playSwing` est déjà importé de `../audio/sfx` : ajouter `playParry` à cet import existant plutôt que d'en écrire un second.

Les trois sons du combat vont dans `src/audio/sfx.ts`, après `playHit`, à la signature des voisins — `tone(forme, fréquence de départ, fréquence d'arrivée, durée, gain, délai?)` et `noiseBurst(filtre, de, à, q, durée, gain)`. Les écrire tous ici évite aux Tasks 3 et 5 de toucher ce fichier.

```ts
/** La garde qui s'ouvre : bref, sec, métallique. Distinct du coup d'épée. */
export function playParry() {
  tone('square', 880, 1320, 0.07, 0.06)
}

/**
 * La parade qui porte : l'acier contre l'acier, puis une quinte montante.
 *
 * Le seul son du jeu qui *récompense* un geste défensif. Il doit s'entendre
 * au-dessus de tout le reste, gel compris — c'est pour ça qu'il est aigu.
 */
export function playParrySuccess() {
  noiseBurst('highpass', 3200, 5200, 1.6, 0.09, 0.2)
  tone('triangle', 740, 740, 0.12, 0.16)
  tone('triangle', 1110, 1110, 0.18, 0.16, 0.07)
}

/** La charge qui finit contre l'enceinte : sourd, grave, long. */
export function playImpact() {
  noiseBurst('lowpass', 900, 120, 0.7, 0.35, 0.3)
  tone('sine', 90, 40, 0.4, 0.3)
}
```

- [ ] **Step 5 : le signal au sol**

Modifier `src/components/CombatOverlay.tsx`. Le calque dessine déjà un chevron au sol autour du joueur pour les tirs hors cadre (`drawThreatArrows`, ligne 190) : l'anneau de parade réutilise la même projection et le même repère de pieds.

Constantes, à ajouter près de `PLAYER_FEET_DROP` (ligne 34) :

```ts
/** Rayon de l'anneau de parade, en unités monde. Il cerne le joueur sans le cacher. */
const PARRY_RING_RADIUS = 1.35
/** Nombre de segments de l'anneau projeté. En dessous de 24, on voit le polygone. */
const PARRY_RING_SEGMENTS = 32
```

Fonction, à ajouter après `drawThreatArrows` :

```ts
/**
 * L'anneau de parade, au sol, sous le joueur.
 *
 * Il dit **trois** choses successives avec une seule forme, et c'est voulu :
 * un joueur en train de lire un télégraphe ne peut pas en plus lire une
 * interface.
 *
 *  - violet **pulsé** : un coup parable arrive, la fenêtre est réactive ;
 *  - or **plein** : la garde est ouverte — c'est là qu'on apprend la longueur
 *    de sa propre fenêtre, ce qu'aucun texte n'enseignerait ;
 *  - rouge **bref** : l'appui est parti dans la récupération, il n'a rien gardé.
 *
 * Posé dans le monde et projeté, comme le chevron de menace : la perspective du
 * sol s'applique toute seule et l'anneau reste d'accord avec le décor. Dessiné
 * en ellipse 2D, il se décrocherait du sol dès que la caméra d'arène change
 * d'angle.
 *
 * Il est aussi la réponse à une objection simple : le signal diégétique du
 * Lynel — crinière et yeux qui s'allument — demande de regarder la bête. Un
 * joueur qui surveille ses cœurs, ou que le boss a passé dans le dos, ne le
 * verra pas. L'anneau est sous lui, toujours.
 */
function drawParryRing(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const now = gameNow()
  const offered = parryOffered(now)
  const guarding = now < parry.guardUntil
  const whiffed = now - parry.whiffedAt < 260

  if (!offered && !guarding && !whiffed) return

  const playerX = playerTransform.position.x
  const playerY = playerTransform.position.y - PLAYER_FEET_DROP
  const playerZ = playerTransform.position.z

  let color: string
  let lineWidth: number
  let alpha: number

  if (guarding) {
    // Or plein, sans pulsation : la garde est un état, pas une alerte.
    color = '#f3d789'
    lineWidth = 5
    alpha = 0.95
  } else if (offered) {
    // Le violet du cristal, celui du portail et des yeux du Lynel. La
    // pulsation accélère à mesure que l'impact approche : c'est une horloge,
    // pas un clignotant.
    const left = Math.max(0, parry.offerUntil - now)
    const urgency = 1 - Math.min(1, left / PARRY.cueLeadMs)
    color = '#b083ff'
    lineWidth = 3 + urgency * 2
    alpha = 0.55 + 0.45 * Math.sin(now * (0.012 + urgency * 0.03))
  } else {
    color = '#d0563f'
    lineWidth = 3
    alpha = 0.7 * (1 - (now - parry.whiffedAt) / 260)
  }

  context.save()
  context.globalAlpha = Math.max(0, Math.min(1, alpha))
  context.strokeStyle = color
  context.lineWidth = lineWidth
  context.beginPath()

  let started = false
  for (let i = 0; i <= PARRY_RING_SEGMENTS; i++) {
    const angle = (i / PARRY_RING_SEGMENTS) * Math.PI * 2
    projectToScreen(
      playerX + Math.cos(angle) * PARRY_RING_RADIUS,
      playerY,
      playerZ + Math.sin(angle) * PARRY_RING_RADIUS,
      width,
      height,
      point,
    )
    // Un point derrière la caméra se projette n'importe où : on coupe le tracé
    // plutôt que de tirer un trait à travers l'écran.
    if (point.behind) {
      started = false
      continue
    }
    if (!started) {
      context.moveTo(point.x, point.y)
      started = true
    } else {
      context.lineTo(point.x, point.y)
    }
  }

  context.stroke()
  context.restore()
}
```

Imports à ajouter en tête de `CombatOverlay.tsx` :

```ts
import { PARRY } from '../config/parry'
import { parry, parryOffered } from '../state/parry'
```

Enfin, appeler `drawParryRing` dans la boucle de dessin du calque, **après** `drawThreatArrows` (l'anneau doit passer au-dessus des chevrons, qui sont plus grands). Repérer l'appel existant à `drawThreatArrows(context, width, height, focal)` et ajouter juste après :

```ts
    drawParryRing(context, width, height)
```

- [ ] **Step 6 : la garde sur le héros**

Modifier `src/components/models/HeroPlaceholder.tsx` — c'est lui qui anime, pas `HeroModel.tsx`, qui n'est que le chargeur `.glb` avec repli sur ce modèle procédural. Le bras armé est `armR`, animé dans le `useFrame` du composant, bloc « Bras » (lignes 382-395).

Juste après le calcul de `attacking` (ligne 375) :

```ts
    // --- Garde ---------------------------------------------------------------
    // Le seul retour *diégétique* de la parade : l'anneau au sol dit quand, le
    // bras dit quoi. Une garde sans geste laisserait croire que la touche n'a
    // rien fait. Elle décroît sur la fenêtre, pour que la lame redescende au
    // moment exact où la garde se ferme — c'est ce qui enseigne sa longueur.
    const guardLeft = parry.guardUntil - gameNow()
    const guard = guardLeft > 0 ? Math.min(1, guardLeft / PARRY.windowMs) : 0
```

Puis remplacer le `if (attacking) { … } else { … }` du bloc « Bras » par :

```ts
    if (guard > 0) {
      // La garde l'emporte sur le swing et ne s'y additionne jamais : deux
      // poses additionnées donnent un bras disloqué. On ne pare pas au milieu
      // d'un coup, et si les deux se chevauchent d'une frame, c'est la garde
      // qu'il faut voir. Lame en travers du torse, à hauteur d'épaule.
      armR.current.rotation.x = -1.15 * guard
      armR.current.rotation.z = 0.95 * guard
      torso.current.rotation.y = MathUtils.damp(torso.current.rotation.y, -0.35, 18, delta)
    } else if (attacking) {
      // L'attaque écrase complètement le balancier sur le bras armé.
      armR.current.rotation.x = keyframe(attackProgress, SWING_ARM)
      armR.current.rotation.z = keyframe(attackProgress, SWING_TWIST)
      torso.current.rotation.y = keyframe(attackProgress, SWING_TORSO)
    } else {
      armR.current.rotation.x = ground * stride * 0.65 * run + air * 0.7
      armR.current.rotation.z = MathUtils.damp(armR.current.rotation.z, 0, 12, delta)
      torso.current.rotation.y = MathUtils.damp(torso.current.rotation.y, 0, 12, delta)
    }
```

Imports à ajouter :

```ts
import { PARRY } from '../../config/parry'
import { parry } from '../../state/parry'
```

> Limite connue : si un `.glb` est un jour fourni pour le héros, `HeroModel` ne passe plus par ce composant et la garde n'aura pas de geste. L'anneau au sol, lui, reste — la parade reste jouable, elle perd seulement son retour sur le personnage.

- [ ] **Step 7 : le bouton tactile**

Modifier `src/components/TouchControls.tsx`. Après le bouton d'attaque (ligne 189-198), ajouter le troisième :

```tsx
        <button
          type="button"
          className="touch-button touch-button--parry"
          aria-label={dict.ui.touch.parry}
          onPointerDown={() => {
            touchInput.parryRequested = true
          }}
        >
          {/* Un bouclier, et non une épée barrée : le geste est défensif et
              doit se distinguer du bouton d'attaque au coup d'œil, pouce posé
              dessus. */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 3l7 3v5.5c0 4.2-2.9 7.7-7 8.5-4.1-.8-7-4.3-7-8.5V6l7-3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
```

> Reprendre exactement la forme du bouton d'attaque voisin pour le `onPointerDown` et l'enveloppe SVG : s'il utilise `onTouchStart` ou une autre prop, faire pareil.

Modifier `src/index.css`. Dans la section des contrôles tactiles, à côté de `.touch-button--attack` :

```css
/*
  Le bouton de parade, sous celui d'attaque et plus petit.

  Plus petit parce que c'est le geste le moins fréquent des trois, et surtout
  parce qu'il ne doit jamais être touché par erreur à la place de l'attaque :
  au pouce, un bouton de même taille collé à un autre est un bouton qu'on
  manque une fois sur dix.
*/
.touch-button--parry {
  width: 56px;
  height: 56px;
  background: rgba(109, 47, 208, 0.28);
  border-color: rgba(176, 131, 255, 0.55);
  color: #e6ccff;
}
```

> Relever les valeurs exactes de `.touch-button` et `.touch-button--attack` dans le fichier et n'écrire ici que les écarts.

- [ ] **Step 8 : les libellés**

Modifier `src/i18n/fr.json` :

```json
    "hud": {
      "move": "se déplacer",
      "jump": "sauter",
      "attack": "attaquer",
      "parry": "parer",
      "interact": "interagir",
```
```json
    "touch": {
      "move": "se déplacer",
      "attack": "attaquer",
      "parry": "parer",
      "jump": "sauter",
```

Modifier `src/i18n/en.json`, aux mêmes emplacements :

```json
      "parry": "parry",
```
(dans `hud` et dans `touch`)

- [ ] **Step 9 : vérifier**

```bash
npm run build && npm run lint
```

Attendu : les deux passent, aucune sortie d'erreur.

Contrôles navigateur, `npm run dev` puis dans la console :

```js
// 1. L'anneau s'allume, pulse de plus en plus vite, puis s'éteint.
__parry.offer(620)

// 2. Appuyer sur R pendant la pulsation : l'anneau passe en or 260 ms,
//    le héros met la lame en travers.

// 3. Marteler R sans offre : l'anneau clignote rouge à chaque appui et la
//    garde ne s'ouvre jamais.
__parry.state.guardUntil   // reste à -Infinity
__parry.state.recoveryUntil // repoussé à chaque appui

// 4. Attendre 1 s sans toucher, puis un seul appui : la garde s'ouvre.
```

Vérifier aussi, sur mobile ou en émulation tactile, que le troisième bouton apparaît et lève la garde.

- [ ] **Step 10 : commit**

```bash
git add src/config/parry.ts src/state/parry.ts src/config/controls.ts \
  src/state/touchInput.ts src/state/playerTransform.ts \
  src/components/Player.tsx src/components/TouchControls.tsx src/index.css \
  src/components/CombatOverlay.tsx src/components/models/HeroPlaceholder.tsx \
  src/audio/sfx.ts src/i18n/fr.json src/i18n/en.json
git commit -m "feat: la parade, et l'anneau qui dit quand elle est possible

Une touche, R, et une regle : un appui ouvre 260 ms de garde puis 450 ms de
recuperation, et un appui pendant la recuperation la relance. Marteler revient
donc a ne jamais sortir de la recuperation, ce qui est la seule facon de rendre
la mecanique incontournable plutot que decorative.

L'anneau au sol dit les trois etats avec une seule forme : violet pulse quand
un coup parable arrive, or plein pendant la garde, rouge bref sur un appui
perdu. Il est sous le joueur et non sur l'ennemi, parce qu'un joueur qui
surveille ses coeurs ne regarde pas la bete, et qu'un boss passe dans le dos
n'a plus aucun signal a offrir.

Personne ne fait encore d'offre : __parry.offer() la simule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2 : le Lynel se tient dans la rotonde

Le modèle, porté de la maquette, planté au centre de l'arène. Aucune IA, aucun collider de combat : il tourne lentement sur lui-même pour qu'on puisse le regarder sous tous les angles dans le vrai moteur, avec le vrai post-traitement. C'est la tâche qui valide que le cel-shading, le bloom et la brume du jeu ne le trahissent pas.

**Files:**
- Create: `src/components/enemies/lynelMaterials.ts`
- Create: `src/components/enemies/LynelModel.tsx`
- Modify: `src/types/game.ts`
- Modify: `src/config/enemies.ts`
- Modify: `src/components/enemies/models.tsx`
- Modify: `src/components/skyisland/SkyIsland.tsx`

**Interfaces:**
- Consumes: `useEnemyMaterials(kind)` et `EnemyMaterials` de `src/components/enemies/models.tsx` ; `faceted()` ; `toonGradient`.
- Produces:
  - `EnemyKind` gagne `'lynel'`
  - `LynelPose` (union : `'repos' | 'garde' | 'balayage' | 'charge' | 'cabre' | 'brise'`)
  - `useLynelMaterials(): LynelMaterials`
  - `LynelModel` — props `{ materials: EnemyMaterials }` ; ref impérative `LynelRig`.
  - `LynelRig` — `{ setPose(pose: LynelPose): void; setRage(on: boolean): void }`. La Task 2 livre `setPose` et `setRage` **vides** ; la Task 3 remplit `setPose`, la Task 6 `setRage`. Les poses ne sont pas des props : `Lynel.tsx` les change dans son `useFrame`, et une prop re-rendrait le modèle entier soixante fois par seconde.

---

- [ ] **Step 1 : lire la maquette**

Ouvrir `docs/maquettes/2026-09-19-lynel-argente.html` et lire **les lignes 1014 à 1812** — des cotes à la crinière. C'est la géométrie à porter, déjà réglée et validée à l'écran. Les commentaires y expliquent les huit corrections qui ont été nécessaires ; les relire évite de les refaire.

Repères :

| Section | Lignes |
|---|---|
| Cotes (les huit constantes dont tout descend) | 1014–1064 |
| Matériaux et contour | 1066–1170 |
| Tronc quadrupède | 1283–1317 |
| Jambes (`buildLeg`) | 1318–1378 |
| Queue | 1379–1403 |
| Buste, ceinture, harnais | 1404–1457 |
| Épaulières (`buildPauldron`) | 1458–1481 |
| Bras (`buildArm`) | 1482–1514 |
| Épée (`buildSword`) | 1515–1579 |
| Bouclier et arc | 1580–1615 |
| Tête | 1616–1694 |
| Cornes (`buildHorn`) | 1695–1741 |
| Crinière | 1742–1812 |
| Les six poses | 1957–2056 |

- [ ] **Step 2 : le type et les statistiques partagées**

Modifier `src/types/game.ts` :

```ts
/** Familles d'ennemis. Ajouter une variante ici suffit à l'enregistrer. */
export type EnemyKind = 'octorok' | 'moblin' | 'lynel'
```

et, plus bas :

```ts
/**
 * Les trois phases du Lynel.
 *
 * Elles ne changent pas ses statistiques, elles changent la *liste* de ce qu'il
 * peut faire. Un boss qui devient plus rapide est le même boss en moins
 * lisible ; un boss qui apprend une attaque de plus est un autre combat.
 */
export type LynelPhase = 'sword' | 'arena' | 'rage'

/** Les six attaques. La table vit dans `config/lynel.ts`. */
export type LynelAttackId =
  | 'sweep'
  | 'thrust'
  | 'stomp'
  | 'charge'
  | 'volley'
  | 'breath'
```

Modifier `src/config/enemies.ts` — ajouter l'entrée `lynel` à `ENEMIES`, **après** `moblin` :

```ts
  /*
    Le Lynel, dans la table commune.

    Il n'y est pas parce que sa machine à états serait celle d'`Enemy.tsx` —
    elle ne l'est pas, il a la sienne. Il y est parce que quatre systèmes
    partagés lisent `ENEMIES[kind]` sans rien savoir de l'ennemi qu'ils
    affichent : la minimap pour la couleur du point, le calque de combat pour
    la hauteur de la barre de vie, le registre pour les PV, et la caméra de
    menace pour le rayon. Lui donner une entrée coûte dix lignes ; ne pas lui
    en donner obligerait à ouvrir ces quatre-là.

    Les champs d'attaque décrivent le **balayage**, qui est son coup de base et
    le seul dont ces systèmes aient besoin. Les six attaques complètes vivent
    dans `config/lynel.ts`.
  */
  lynel: {
    kind: 'lynel',
    label: 'Lynel argenté',
    /*
      36, et le nombre a une unité : ce sont des coups d'épée non bonifiés.
      Douze fois le Moblin. Il est calibré pour qu'un combat mené proprement —
      c'est-à-dire une poignée de parades réussies, chacune valant deux coups à
      dégâts triplés — dure entre deux et trois minutes.
    */
    hp: 36,
    speed: 3.2,
    patrolSpeed: 1.4,
    /*
      L'arène fait 11,5 de rayon : une détection à 14 couvre tout le dallage et
      s'arrête avant l'arcade. Le joueur ne déclenche donc rien depuis le seuil.
    */
    detectRadius: 14,
    attackRange: 3.6,
    attackCooldownMs: 2200,
    telegraphMs: 620,
    damage: 2,
    /*
      Volontairement plus étroit que le modèle, qui fait 1,3 de large aux
      épaules : on doit pouvoir frôler la croupe sans être bloqué. Un collider
      qui épouse un boss transforme l'esquive latérale en collision.
    */
    radius: 1.15,
    halfHeight: 1.0,
    minimapColor: '#d8dce6',
    ranged: false,
  },
```

Modifier `src/components/enemies/models.tsx` — ajouter la palette. `PALETTES` est un `Record<EnemyKind, …>` : sans cette entrée, la compilation casse.

```ts
const PALETTES: Record<EnemyKind, { body: string; dark: string; accent: string }> = {
  octorok: { body: '#d9534a', dark: '#8f3630', accent: '#f6e7c9' },
  moblin: { body: '#9a6b3f', dark: '#5d3f27', accent: '#e4d8bd' },
  /*
    Le Lynel passe par le même hook que les deux autres, et ce n'est pas une
    contrainte de typage qu'on subit : c'est le flash blanc qu'on récupère
    gratuitement. `Enemy.tsx` fait clignoter un ennemi touché en écrasant
    `materials.body.color` et `materials.dark.color` ; en tenant son pelage, ses
    marques et sa crinière dans ces trois matériaux-là, le Lynel encaisse
    visuellement comme tout le monde sans une ligne de plus.

    Le reste de sa matière — or, métal, corne, acier, sabot, cuir — vit dans
    `lynelMaterials.ts`, et ne flashe pas. C'est correct : ce qui doit blanchir
    sous le coup, c'est la chair.
  */
  lynel: { body: '#dfe4ee', dark: '#5a6378', accent: '#f4f6fb' },
}
```

- [ ] **Step 3 : les matériaux propres au Lynel**

Créer `src/components/enemies/lynelMaterials.ts`. Porter le bloc `MAT` de la maquette (lignes 1090–1130) en ne gardant **que** ce qui n'est pas déjà dans `EnemyMaterials`.

```ts
import { useMemo } from 'react'
import { Color, MeshBasicMaterial, MeshToonMaterial } from 'three'
import { toonGradient } from '../models/toonGradient'

/**
 * Les couleurs du Lynel qui ne passent pas par `useEnemyMaterials`.
 *
 * Deux contraintes se sont rencontrées ici. L'argent doit se détacher d'une
 * arène en pierre grise — or c'est la même famille de gris, d'où un pelage
 * décalé vers le **bleu** (#dfe4ee contre #c2c1b2 pour la pierre) : à valeur
 * égale, c'est la teinte qui sépare, et aucun écart de luminosité n'y arrive
 * sans faire ressembler la bête à un fantôme.
 *
 * Et elle doit appartenir au lieu. D'où l'or, exactement celui des ruines,
 * émissif compris : son armure est faite du métal de la forteresse, elle n'est
 * pas venue d'ailleurs. Et le violet, exactement celui du cristal et du portail
 * — la seule couleur de la scène qu'aucune pierre ne porte, donc la seule qu'on
 * ne puisse pas confondre avec du décor.
 */
export const LYNEL_COLORS = {
  hoof: 0x2f3446,
  horn: 0xe8e2d2,
  hornDark: 0x9a927c,
  metal: 0x717a96,
  gold: 0xd9a441,
  goldDim: 0x8a6c33,
  goldBright: 0xf3d789,
  leather: 0x8a6a4e,
  steel: 0xcfd8e8,
  steelDark: 0x76809a,
  glow: 0x8b3ff0,
  glowPale: 0xe6ccff,
} as const

export interface LynelMaterials {
  hoof: MeshToonMaterial
  horn: MeshToonMaterial
  hornDark: MeshToonMaterial
  metal: MeshToonMaterial
  gold: MeshToonMaterial
  goldDim: MeshToonMaterial
  goldBright: MeshToonMaterial
  leather: MeshToonMaterial
  steel: MeshToonMaterial
  steelDark: MeshToonMaterial
  /** Les yeux : non éclairés, donc toujours au-dessus du seuil de bloom. */
  glow: MeshBasicMaterial
  /** Halo des yeux et veine de la lame. Son opacité monte en phase III. */
  halo: MeshBasicMaterial
}

/**
 * Construits par instance, comme `useEnemyMaterials`.
 *
 * Il n'y a qu'un Lynel, donc l'argument du partage ne tient pas ; celui de la
 * symétrie, si. Un jeu de matériaux par créature est ce qui permet d'en
 * modifier un — l'émissif de la crinière en phase III — sans repeindre
 * silencieusement une autre partie de la scène qui partagerait l'objet.
 */
export function useLynelMaterials(): LynelMaterials {
  return useMemo(() => {
    const toon = (color: number, options?: { emissive?: number; intensity?: number }) =>
      new MeshToonMaterial({
        color: new Color(color),
        gradientMap: toonGradient,
        ...(options?.emissive !== undefined
          ? { emissive: new Color(options.emissive), emissiveIntensity: options.intensity ?? 0.32 }
          : {}),
      })

    return {
      hoof: toon(LYNEL_COLORS.hoof),
      horn: toon(LYNEL_COLORS.horn),
      hornDark: toon(LYNEL_COLORS.hornDark),
      metal: toon(LYNEL_COLORS.metal),
      // L'or porte un émissif, la pierre non : dans un rendu cel-shadé à trois
      // marches, c'est le seul moyen de faire *briller* quelque chose plutôt que
      // de le peindre en jaune. Même réglage que les ruines de l'île.
      gold: toon(LYNEL_COLORS.gold, { emissive: LYNEL_COLORS.gold, intensity: 0.32 }),
      goldDim: toon(LYNEL_COLORS.goldDim),
      goldBright: toon(LYNEL_COLORS.goldBright, {
        emissive: LYNEL_COLORS.gold,
        intensity: 0.55,
      }),
      leather: toon(LYNEL_COLORS.leather),
      steel: toon(LYNEL_COLORS.steel),
      steelDark: toon(LYNEL_COLORS.steelDark),
      glow: new MeshBasicMaterial({ color: new Color(LYNEL_COLORS.glowPale) }),
      halo: new MeshBasicMaterial({
        color: new Color(LYNEL_COLORS.glow),
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    }
  }, [])
}
```

- [ ] **Step 4 : le modèle**

Créer `src/components/enemies/LynelModel.tsx`. Porter la géométrie de la maquette en JSX.

Règles de portage, à tenir sans exception :

1. **Les cotes en tête, une seule fois.** Recopier le bloc des lignes 1014–1064 tel quel, constantes de module. Tout le reste en descend, et le jour où le buste change de hauteur, un seul nombre change.
2. **`<Outlines>` de drei remplace le shader de contour de la maquette** — c'est ce qu'utilisent déjà `OctorokModel` et `MoblinModel`. Épaisseur **0,045** contre 0,03 pour les ennemis ordinaires : c'est le seul réglage de rendu qui distingue le boss, et il ne coûte rien. **Pas de contour** sur les géométries facettées ni sur la lame extrudée : leurs normales divergent aux arêtes et le trait se fend (voir la note de la maquette, ligne 1527).
3. **Les groupes posables sont des `useRef<Group>`**, exposés en bloc par `useImperativeHandle`. La maquette les appelle « le rig » (ligne 1239) ; ce sont les mêmes quinze.
4. **Les boucles de la maquette (`buildLeg`, `buildHorn`, la crinière) deviennent des composants ou des tableaux mémoïsés** — pas des boucles dans le rendu. Une corne, ce sont neuf tronçons dont la position dépend du précédent : la calculer à chaque rendu React serait du gaspillage pur. `useMemo` sur un tableau de `{ position, quaternion, geometry }`, puis un `.map()`.

Squelette à compléter :

```tsx
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { Outlines } from '@react-three/drei'
import { Group } from 'three'
import type { EnemyMaterials } from './models'
import { useLynelMaterials } from './lynelMaterials'

/* --- Cotes ---------------------------------------------------------------- */
/* Recopiées de la maquette, lignes 1014-1064. Tout le squelette en descend. */

/** Axe du tronc quadrupède. */
const BODY_Y = 1.52
/** Rayon du tronc. */
const BODY_R = 0.62
/** Demi-écartement des jambes. */
const HIP_X = 0.46
/** Antérieurs. */
const FORE_Z = 0.86
/** Postérieurs. */
const HIND_Z = -0.9
/** Naissance du buste, sur le garrot avant. */
const BUST: [number, number, number] = [0, 1.9, 0.78]
/** Inclinaison du buste : 6° vers l'arrière. */
const BUST_LEAN = -0.1
/** Épaules, dans le repère du buste. */
const SHOULDER_Y = 1.15
/** Tête, dans le repère du buste. */
const HEAD_Y = 1.58

/** Épaisseur du contour. Les ennemis ordinaires sont à 0,03 : le boss pèse plus. */
const OUTLINE = 0.045
const OUTLINE_THIN = 0.022
const OUTLINE_COLOR = '#20160f'

export type LynelPose = 'repos' | 'garde' | 'balayage' | 'charge' | 'cabre' | 'brise'

/**
 * Ce que `Lynel.tsx` peut demander au modèle.
 *
 * Deux méthodes et non quinze groupes : les articulations sont un détail du
 * modèle, et les exposer obligerait le composant de combat à connaître le
 * squelette. Il dit « garde », le modèle sait quels bras bougent.
 *
 * Par ref plutôt que par props : les poses changent dans un `useFrame`, et une
 * prop re-rendrait le boss soixante fois par seconde pour tourner un bras.
 */
export interface LynelRig {
  setPose: (pose: LynelPose) => void
  setRage: (on: boolean) => void
}

interface LynelModelProps {
  /** Pelage, marques et crinière — ceux qui flashent en blanc sous le coup. */
  materials: EnemyMaterials
}

/**
 * Le Lynel argenté.
 *
 * Géométrie originale, portée de `docs/maquettes/2026-09-19-lynel-argente.html`
 * — aucun asset sous licence. L'avant du modèle est **+Z**, comme le joueur et
 * comme les deux autres ennemis.
 *
 * Quatre masses, et c'est le rapport entre elles qui fait le Lynel plutôt que
 * le détail de chacune : un buste d'homme trop petit sur un corps de bête trop
 * gros. Le rapport qui compte tient en un nombre — **le buste vaut deux têtes
 * et demie**. La maquette l'a raté trois fois de suite en corrigeant la
 * crinière, le masque et le cou, alors que le défaut était là : un crâne de
 * 0,88 de haut pour un torse de 0,86 donne une figurine, et aucun détail ne
 * rattrape ça.
 */
export const LynelModel = forwardRef<LynelRig, LynelModelProps>(function LynelModel(
  { materials },
  ref,
) {
  const mats = useLynelMaterials()

  const root = useRef<Group>(null)
  const bust = useRef<Group>(null)
  const head = useRef<Group>(null)
  // … un ref par articulation

  // Vides à cette tâche : la Task 3 remplit `setPose`, la Task 6 `setRage`.
  // Elles existent déjà pour que l'interface ne change plus d'ici là.
  useImperativeHandle(ref, () => ({
    setPose: () => {},
    setRage: () => {},
  }))

  return (
    <group ref={root}>
      {/* --- Le tronc quadrupède (maquette 1283-1317) --------------------- */}
      <mesh castShadow position={[0, BODY_Y, -0.05]} rotation={[Math.PI / 2, 0, 0]} material={materials.body}>
        <capsuleGeometry args={[BODY_R, 1.02, 5, 14]} />
        <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
      </mesh>

      {/* … le reste, section par section, dans l'ordre de la maquette */}
    </group>
  )
})
```

Compléter section par section, dans l'ordre du tableau du Step 1. Ne pas réordonner : la maquette pose les pièces dans l'ordre où elles se recouvrent, et changer l'ordre change ce qui passe devant quoi sur les faces transparentes (halos des yeux, veine de la lame).

- [ ] **Step 5 : le planter dans la rotonde**

Modifier `src/components/skyisland/SkyIsland.tsx`. Import et montage, **provisoires** — la Task 3 les remplace par le vrai composant.

```tsx
import { LynelPreview } from '../enemies/LynelPreview'
```
```tsx
      {/* Provisoire — remplacé par <Lynel> à la tâche suivante. */}
      <LynelPreview />
```

Créer `src/components/enemies/LynelPreview.tsx` :

```tsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { LynelModel } from './LynelModel'
import { useEnemyMaterials } from './models'

/**
 * Le Lynel posé au centre de l'arène, sans IA ni collider, tournant lentement.
 *
 * Provisoire, et il a une raison d'exister le temps d'une tâche : c'est le seul
 * moyen de juger le modèle sous le **vrai** rendu — le cel-shading à trois
 * marches, le bloom à 0,82, la brume de l'île, la lumière du ciel étoilé. Une
 * maquette en page isolée ne dit rien de ce que le post-traitement fera de l'or
 * émissif ni du violet des yeux.
 */
export function LynelPreview() {
  const spin = useRef<Group>(null)
  const materials = useEnemyMaterials('lynel')

  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.25
  })

  // CORE_Y : l'altitude du plateau de la rotonde, depuis `config/skyIsland.ts`.
  return (
    <group ref={spin} position={[0, 7.2, 0]}>
      <LynelModel materials={materials} />
    </group>
  )
}
```

- [ ] **Step 6 : vérifier**

```bash
npm run build && npm run lint
```

Attendu : les deux passent.

Contrôles navigateur, `npm run dev`, en se rendant à la rotonde avec la recette des contraintes globales :

- Le Lynel est au centre du dallage, sur la mosaïque, et tourne lentement.
- Il mesure environ **2,7 fois** le joueur. Se placer à côté pour le mesurer à l'œil : son dos arrive juste au-dessus de la tête du personnage.
- Les yeux brillent en violet et **franchissent le bloom** ; l'or de l'armure aussi, sur les faces éclairées seulement.
- Le contour est visible et continu sur le corps, le buste et la tête. S'il se fend quelque part, c'est qu'un contour a été posé sur une géométrie facettée : le retirer.
- La crinière fait **masse** et ne laisse pas voir le crâne au travers.
- Basculer la qualité graphique (bouton du HUD) : rien ne disparaît ni ne clignote.

- [ ] **Step 7 : commit**

```bash
git add src/types/game.ts src/config/enemies.ts src/components/enemies/models.tsx \
  src/components/enemies/lynelMaterials.ts src/components/enemies/LynelModel.tsx \
  src/components/enemies/LynelPreview.tsx src/components/skyisland/SkyIsland.tsx
git commit -m "feat: le Lynel argente, porte de la maquette dans le moteur

La geometrie validee, en JSX, avec les materiaux du jeu. Il passe par
useEnemyMaterials pour son pelage, ses marques et sa criniere : c'est ce qui lui
donne gratuitement le flash blanc a l'impact, qu'Enemy.tsx applique en ecrasant
materials.body.color. Le reste de sa matiere vit a part et ne flashe pas — ce
qui doit blanchir sous le coup, c'est la chair.

Contour a 0,045 contre 0,03 sur les ennemis ordinaires. C'est le seul reglage de
rendu qui distingue le boss, et il ne coute rien.

Monte par un composant provisoire qui le fait tourner sur lui-meme : le seul
moyen de juger l'or emissif et le violet des yeux sous le vrai bloom.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3 : phase I — l'épée, et la parade qui sert enfin

Le Lynel devient un adversaire : corps physique, poursuite, deux attaques parables, et les 36 points de vie. À la fin de cette tâche, le combat est jouable de bout en bout avec un seul jeu d'attaques, et c'est déjà un combat.

**Files:**
- Create: `src/config/lynel.ts`
- Create: `src/components/Lynel.tsx`
- Delete: `src/components/enemies/LynelPreview.tsx`
- Modify: `src/components/skyisland/SkyIsland.tsx`
- Modify: `src/components/enemies/LynelModel.tsx` (ajout du calque « rage »)

**Interfaces:**
- Consumes: `LynelRig`, `LynelModel` ; `offerParry`, `cancelParry`, `consumeParry`, `parry` ; `enemyRegistry`, `updateEnemyMarker` ; `hitStop`, `isHitStopped`, `now` ; `shake` ; `playerTransform` ; `ENEMIES.lynel`.
- Produces:
  - `LYNEL` (cotes de combat : `arenaRadius`, `arenaCenter`, `phaseThresholds`, `recenterRadius`, `punishMultiplier`)
  - `LYNEL_ATTACKS: Record<LynelAttackId, LynelAttack>`
  - `LynelAttack` (interface : `id`, `telegraphMs`, `reach`, `arc`, `damage`, `parryable`, `phase`, `cooldownMs`)
  - `phaseOf(hp: number): LynelPhase`
  - `<Lynel>` — aucune prop.

---

- [ ] **Step 1 : la table des attaques**

Créer `src/config/lynel.ts`.

```ts
import { CORE_Y } from './skyIsland'
import type { LynelAttackId, LynelPhase } from '../types/game'

/**
 * Le combat du Lynel — ses cotes, et la table de ses six attaques.
 *
 * Une **règle de lecture unique** tient tout l'ensemble, et elle vaut mieux
 * qu'une documentation : *ce qui est paré est annoncé par la crinière, ce qui
 * ne l'est pas est annoncé par les pattes.* Le joueur n'a donc jamais à
 * mémoriser six animations — il regarde d'abord où naît le mouvement. Toute
 * attaque ajoutée ici doit respecter ça, sans quoi l'ensemble redevient six
 * cas particuliers.
 */

/** Rayon du dallage de la rotonde. Repris de `components/skyisland/Ruins.tsx`. */
export const ARENA_R = 11.5
/** Centre de l'arène, en coordonnées monde de l'île. */
export const ARENA_CENTER: [number, number, number] = [0, CORE_Y, 0]

/**
 * Les trois anneaux d'or incrustés dans le dallage.
 *
 * Ils sont déjà dans le dépôt, et ils n'ont jamais été de l'ornement : le
 * commentaire de `Ruins.tsx` les décrit comme des repères de distance pour « le
 * futur boss ». Les portées ci-dessous tombent dessus, et c'est le seul moyen
 * qu'a le joueur de juger une distance d'esquive sans qu'aucun texte ne la lui
 * donne.
 *
 * Attention : un repère au sol est une règle graduée depuis le **centre de
 * l'arène**, pas depuis la bête. Il ne dit donc la portée du souffle et de
 * l'onde que si le Lynel part de l'origine — d'où `RECENTER_RADIUS`, qui a
 * l'air arbitraire et ne l'est pas.
 */
export const ARENA_RINGS = [3.4, 6.6, 9.6] as const

/**
 * Au-delà de cette distance au centre, le Lynel y revient entre deux séquences.
 *
 * Ça lui donne une démarche de gardien plutôt que de poursuivant, ça laisse au
 * joueur les trois secondes qu'il faut pour se soigner ou se replacer, et ça
 * fait des anneaux une information vraie au lieu d'une décoration.
 */
export const RECENTER_RADIUS = 4

/** Multiplicateur des dégâts pendant l'ouverture d'une parade réussie. */
export const PUNISH_MULTIPLIER = 3

/**
 * Seuils de phase, en points de vie restants.
 *
 * 36 → 24 → 12 → 0 : trois tiers égaux. Un découpage inégal se défend, mais il
 * demande alors une raison, et il n'y en a pas ici — chaque phase doit avoir le
 * temps d'enseigner ce qu'elle ajoute.
 */
export const PHASE_THRESHOLDS = { arena: 24, rage: 12 } as const

export function phaseOf(hp: number): LynelPhase {
  if (hp > PHASE_THRESHOLDS.arena) return 'sword'
  if (hp > PHASE_THRESHOLDS.rage) return 'arena'
  return 'rage'
}

export interface LynelAttack {
  id: LynelAttackId
  /** Durée visible de préparation, en millisecondes. */
  telegraphMs: number
  /** Portée en unités monde, mesurée depuis le centre du Lynel. */
  reach: number
  /** Demi-angle du cône touché, en radians. `Math.PI` = tout autour. */
  arc: number
  /** Cœurs retirés au joueur. */
  damage: number
  /**
   * Parable ?
   *
   * C'est ce drapeau, et lui seul, qui décide si l'attaque appelle
   * `offerParry()`. Étendre la parade au Moblin, ce sera ajouter le même
   * drapeau dans `EnemyStats` — pas retoucher le joueur ni le calque.
   */
  parryable: boolean
  /** Première phase où elle est disponible. */
  phase: LynelPhase
  /** Délai avant de pouvoir la relancer, en millisecondes. */
  cooldownMs: number
}

export const LYNEL_ATTACKS: Record<LynelAttackId, LynelAttack> = {
  /*
    Le coup de base, et le cours de parade.

    L'arc de 170° interdit le contournement : on pare, ou on sort de portée,
    jamais les deux. Un balayage esquivable sur le côté n'apprendrait rien —
    le joueur contournerait tout le combat sans jamais découvrir la touche R.
  */
  sweep: {
    id: 'sweep',
    telegraphMs: 620,
    reach: 3.6,
    arc: 1.48,
    damage: 2,
    parryable: true,
    phase: 'sword',
    cooldownMs: 2200,
  },
  /*
    Le plus rapide et le plus long. Il punit le joueur qui recule pour souffler :
    le pas en arrière cesse d'être une échappatoire gratuite, ce qui est la
    condition pour que la parade soit un choix plutôt qu'un dernier recours.
  */
  thrust: {
    id: 'thrust',
    telegraphMs: 400,
    reach: 4.4,
    arc: 0.26,
    damage: 2,
    parryable: true,
    phase: 'sword',
    cooldownMs: 1800,
  },
  /*
    Il se cabre et retombe. La seule attaque qui se *franchit* au lieu de
    s'esquiver : l'onde rase le sol, le saut la passe. Le jeu a un saut qui ne
    servait jusqu'ici qu'à grimper.

    Elle atteint l'anneau 6,6 — le repère du milieu — et c'est ce qui fait de
    cet anneau une information utilisable.
  */
  stomp: {
    id: 'stomp',
    telegraphMs: 760,
    reach: 6.6,
    arc: Math.PI,
    damage: 2,
    parryable: false,
    phase: 'rage',
    cooldownMs: 4200,
  },
  /*
    Un pas de côté, et il finit dans un pilier : 1,4 s d'étourdissement, la plus
    grosse ouverture du combat. Se lit au grattement du sabot antérieur, jamais
    à la crinière — c'est la règle de lecture.

    `reach` vaut le diamètre de l'arène : la charge traverse, elle ne s'arrête
    pas au joueur.
  */
  charge: {
    id: 'charge',
    telegraphMs: 900,
    reach: ARENA_R * 2,
    arc: 0.3,
    damage: 3,
    parryable: false,
    phase: 'arena',
    cooldownMs: 5200,
  },
  /*
    Trois flèches, et pas une ligne de neuf à écrire : le système de projectiles
    existe, et la parade d'épée du jeu les renvoie déjà. Une flèche renvoyée
    coûte 2 au tireur — le double d'un projectile d'Octorok, parce qu'elle
    revient de bien plus loin et qu'il faut que ça vaille le geste.
  */
  volley: {
    id: 'volley',
    telegraphMs: 700,
    reach: 18,
    arc: 0.12,
    damage: 1,
    parryable: false,
    phase: 'arena',
    cooldownMs: 3600,
  },
  /*
    Casser la ligne, et se souvenir que le sol reste dangereux après : c'est ce
    qui rétrécit l'arène sans y poser un seul obstacle, donc sans rien enlever à
    l'esquive.
  */
  breath: {
    id: 'breath',
    telegraphMs: 850,
    reach: 6.6,
    arc: 0.42,
    damage: 2,
    parryable: false,
    phase: 'rage',
    cooldownMs: 5600,
  },
}

/** Les attaques disponibles dans une phase donnée, dans l'ordre de la table. */
export function attacksFor(phase: LynelPhase): LynelAttack[] {
  const unlocked: LynelPhase[] =
    phase === 'sword' ? ['sword'] : phase === 'arena' ? ['sword', 'arena'] : ['sword', 'arena', 'rage']
  return Object.values(LYNEL_ATTACKS).filter((attack) => unlocked.includes(attack.phase))
}
```

- [ ] **Step 2 : le composant**

Créer `src/components/Lynel.tsx`. Prendre `src/components/Enemy.tsx` comme modèle pour tout ce qui est partagé — inscription au registre, coup d'épée du joueur, projectile renvoyé, gel du coup fatal, mort — et **ne pas** reprendre sa machine à états.

Points qui n'existent pas dans `Enemy.tsx` et qui doivent être écrits :

```tsx
interface LynelRuntime {
  hp: number
  phase: LynelPhase
  /** Attaque en préparation, ou `null`. Drapeau consommé, jamais un intervalle. */
  pending: LynelAttack | null
  pendingStartedAt: number
  /** Instant d'impact de l'attaque en préparation. Sert aussi d'offre de parade. */
  pendingImpactAt: number
  /** Dernier lancement, par attaque : chacune a son propre temps de recharge. */
  lastUsedAt: Record<LynelAttackId, number>
  /** Fin de l'étourdissement — parade réussie, ou charge dans un pilier. */
  staggerUntil: number
  lastHitSwing: number
  hitFlashUntil: number
  deathAt: number
  popped: boolean
  yaw: number
  pose: LynelPose
}
```

Le cœur de la boucle, à écrire littéralement ainsi :

```tsx
    // --- Préparation d'attaque ------------------------------------------------
    // Drapeau consommé, comme dans `Enemy.tsx` : un intervalle testé à chaque
    // frame serait échantillonné dans une boucle à cadence variable, et une
    // frame sur deux tomberait à côté sur une machine lente.
    if (
      state.pending === null &&
      now > state.staggerUntil &&
      !frozen &&
      distance < stats.detectRadius
    ) {
      const choice = pickAttack(state, now, distance)
      if (choice) {
        state.pending = choice
        state.pendingStartedAt = now
        state.pendingImpactAt = now + choice.telegraphMs
        state.pose = choice.id === 'charge' ? 'charge' : choice.id === 'stomp' ? 'cabre' : 'garde'
        /*
          L'offre part ici, à l'ouverture du télégraphe, mais la fenêtre ne
          s'ouvrira que `cueLeadMs` avant l'impact : `offerParry` calcule
          `offerFrom` depuis l'instant d'impact, pas depuis l'appel. C'est ce qui
          permet à un télégraphe de 620 ms de n'offrir que ses 420 dernières
          millisecondes — les 200 premières ne sont pas réactives, et les
          signaler donnerait au joueur 200 ms pendant lesquelles appuyer paraît
          juste sans l'être.
        */
        if (choice.parryable) offerParry(SPAWN_ID, state.pendingImpactAt)
      }
    }

    // Un télégraphe s'annule si le joueur sort de portée — c'est tout l'intérêt
    // du temps de préparation. Sans annulation, il ne fait que retarder un coup
    // de toute façon inévitable.
    //
    // L'offre de parade part avec lui : sinon l'anneau resterait allumé sous les
    // pieds d'un joueur qui n'a plus rien à parer, et lui apprendrait à appuyer
    // pour rien.
    if (
      state.pending !== null &&
      (frozen || distance > state.pending.reach + 2 || now < state.staggerUntil)
    ) {
      state.pending = null
      cancelParry(SPAWN_ID)
      state.pose = 'repos'
    }

    // --- Résolution -----------------------------------------------------------
    if (state.pending !== null && now >= state.pendingImpactAt) {
      const attack = state.pending
      state.pending = null
      state.lastUsedAt[attack.id] = now

      if (attack.parryable && consumeParry(now)) {
        /*
          Parade réussie.

          Trois retours, tous en temps **réel** et non en temps de jeu : ils
          doivent jouer pendant le gel, qui est précisément le moment où ils
          portent. Même raison que la mort d'un ennemi — voir `Enemy.tsx:152`.
        */
        state.staggerUntil = now + PARRY.punishMs
        state.pose = 'brise'
        hitStop(PARRY.hitStopMs)
        shake(0.12, 150)
        playParrySuccess()
        track('boss_parry', { attack: attack.id })
      } else if (attackHits(attack, position, state.yaw)) {
        useGameStore.getState().damagePlayer(attack.damage)
        state.pose = attack.id === 'charge' ? 'charge' : 'balayage'
      } else {
        state.pose = 'balayage'
      }
    }
```

Le coup d'épée du joueur reprend celui d'`Enemy.tsx:396-430` **à une différence près**, qui est toute la récompense de la parade :

```tsx
      if (Math.hypot(position.x - hitX, position.z - hitZ) < reach) {
        playerTransform.lastLandedSwing = swing
        /*
          Dégâts triplés pendant l'ouverture.

          C'est ce qui fait qu'une parade réussie vaut six à neuf coups
          ordinaires, et donc que le combat se gagne en lisant plutôt qu'en
          frappant. Sans le multiplicateur, la parade ne serait qu'un moyen de
          ne pas perdre de cœurs : utile, mais optionnelle.
        */
        const punishing = now < state.staggerUntil
        const amount = store.swordDamage() * (punishing ? PUNISH_MULTIPLIER : 1)
        // …
      }
```

Imports des sons, écrits à la Task 1 :

```tsx
import { playHit, playDefeat, playImpact, playParrySuccess } from '../audio/sfx'
```

Le choix d'attaque :

```tsx
/**
 * Quelle attaque lancer, maintenant.
 *
 * Tirage pondéré parmi celles qui sont déchargées et à portée, et **non** une
 * rotation fixe : un boss qui enchaîne toujours dans le même ordre s'apprend
 * par cœur en trois tentatives, et le combat devient une récitation. Le tirage
 * se fait avec `Math.random` et non la graine du monde — une graine fixe
 * rendrait les enchaînements identiques d'une partie à l'autre, soit exactement
 * ce qu'on veut éviter.
 */
function pickAttack(state: LynelRuntime, now: number, distance: number): LynelAttack | null {
  const candidates = attacksFor(state.phase).filter(
    (attack) =>
      now - state.lastUsedAt[attack.id] > attack.cooldownMs &&
      // Une attaque de mêlée lancée hors de portée est un coup dans le vide qui
      // dure une seconde : le joueur apprend à rester loin et le combat s'arrête.
      (attack.reach >= distance - 1 || attack.phase !== 'sword'),
  )
  if (candidates.length === 0) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}
```

Et le test de portée :

```tsx
/**
 * Le coup touche-t-il le joueur ?
 *
 * Testé **à l'instant de l'impact** et non pendant toute l'animation : c'est ce
 * qui rend l'esquive possible, puisque sortir du cône pendant le télégraphe
 * suffit. Un cône testé en continu toucherait le joueur qui traverse.
 */
function attackHits(
  attack: LynelAttack,
  position: { x: number; y: number; z: number },
  yaw: number,
) {
  const dx = playerTransform.position.x - position.x
  const dz = playerTransform.position.z - position.z
  const distance = Math.hypot(dx, dz)
  if (distance > attack.reach) return false
  if (attack.arc >= Math.PI) return true
  // Écart angulaire entre le cap du Lynel et la direction du joueur, ramené
  // dans [-π, π] — sinon un joueur à 179° et un à -179° seraient à 358° l'un de
  // l'autre et le cône se replierait sur lui-même.
  let delta = Math.atan2(dx, dz) - yaw
  delta = ((delta + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  return Math.abs(delta) <= attack.arc
}
```

La mort doit retirer l'offre : ajouter `cancelParry(SPAWN_ID)` dans la branche de mort, **avant** le `return`. Sans ça, tuer le Lynel pendant son télégraphe laisse l'anneau allumé pour l'éternité.

`SPAWN_ID` est une constante de module : `const SPAWN_ID = 'lynel'`. Il n'y a qu'un Lynel, et son identité sert au registre comme à l'offre de parade.

- [ ] **Step 3 : les poses**

Modifier `src/components/enemies/LynelModel.tsx` pour accepter une pose. Porter la table `POSES` de la maquette (lignes 1957–2056) telle quelle, et l'interpolation de sa boucle (lignes 2199–2210) :

```tsx
    // Amortissement exponentiel, et non un facteur constant par frame : celui-ci
    // serait deux fois plus rapide à 120 Hz qu'à 60. Même règle que le lissage
    // de la caméra et celui du cap des ennemis.
    const k = 1 - Math.exp(-delta * 9)
```

La pose est passée par une méthode de la ref (`setPose`) et non par une prop : `Lynel.tsx` la change dans son `useFrame`, et une prop re-rendrait le modèle entier.

- [ ] **Step 4 : le monter pour de bon**

Modifier `src/components/skyisland/SkyIsland.tsx` : remplacer `<LynelPreview />` par `<Lynel />`, et supprimer `src/components/enemies/LynelPreview.tsx`.

```bash
git rm src/components/enemies/LynelPreview.tsx
```

- [ ] **Step 5 : vérifier**

```bash
npm run build && npm run lint
```

Contrôles navigateur, à la rotonde :

- Le Lynel poursuit le joueur dans l'arène et revient au centre quand on s'éloigne.
- Le balayage s'annonce sur 620 ms ; l'anneau de parade s'allume **au milieu** du télégraphe, pas à son début. Le vérifier :
  ```js
  __parry.state.offerFrom - __parry.state.offerUntil  // doit valoir -420
  ```
- Parer : le monde gèle brièvement, le Lynel recule, deux coups d'épée rentrent.
- Vérifier le triplement :
  ```js
  __enemies().find((e) => e.kind === 'lynel').hp
  ```
  avant et après un coup placé dans l'ouverture : l'écart doit valoir trois fois celui d'un coup placé hors ouverture.
- Sortir de portée pendant un télégraphe : le coup s'annule **et** l'anneau s'éteint.
- Tuer le Lynel pendant un télégraphe (`__enemies()` puis lui retirer ses PV par des coups) : l'anneau ne reste pas allumé.
- La barre de vie du calque de combat s'affiche au-dessus de lui, à la bonne hauteur.
- Le point argenté apparaît sur la minimap.

- [ ] **Step 6 : commit**

```bash
git add -A src/config/lynel.ts src/components/Lynel.tsx \
  src/components/enemies/LynelModel.tsx src/components/skyisland/SkyIsland.tsx
git commit -m "feat: phase I du Lynel — deux attaques, et la parade qui sert

Une machine a etats a part, et non une troisieme entree dans celle d'Enemy.tsx :
celle-ci decrit une espece par une attaque et ne sait ni enchainer des sequences
ni changer de phase. Tout ce qui est partage est repris tel quel — registre,
coup d'epee du joueur, projectile renvoye, gel du coup fatal.

L'offre de parade part a l'ouverture du telegraphe mais ne s'allume que 420 ms
avant l'impact. Les 200 premieres millisecondes d'un balayage ne sont pas
reactives : les signaler donnerait au joueur un moment ou appuyer parait juste
sans l'etre, ce qui est la pire des lecons.

Degats tripes pendant l'ouverture. Sans ca la parade ne serait qu'un moyen de ne
pas perdre de coeurs — utile, et optionnelle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4 : la caméra d'arène, et le verrou

Deux choses qui n'ont de sens qu'ensemble : on referme l'arène, et on rapproche la caméra. C'est la tâche qui transforme un gros ennemi en combat de boss.

**Files:**
- Modify: `src/config/gameplay.ts`
- Modify: `src/store/useGameStore.ts`
- Modify: `src/components/CameraRig.tsx`
- Create: `src/components/skyisland/ArenaGate.tsx`
- Modify: `src/components/skyisland/SkyIsland.tsx`
- Modify: `src/components/Lynel.tsx`
- Modify: `src/analytics/index.ts`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`

**Interfaces:**
- Consumes: `CAMERA` ; `useGameStore` ; `ARENA_R`, `ARENA_CENTER`.
- Produces:
  - `CAMERA.arena` (`{ offset, lookAtHeight, lookAtHeightMobile }`)
  - store : `bossState: 'idle' | 'fighting' | 'defeated'`, `startBossFight()`, `endBossFight(defeated: boolean)`
  - `<ArenaGate>` — aucune prop.

---

- [ ] **Step 1 : les cotes de la caméra d'arène**

Modifier `src/config/gameplay.ts`, à la fin de l'objet `CAMERA` :

```ts
  /**
   * La caméra du combat de boss.
   *
   * Elle existe pour une raison mesurée, et la maquette la donne : avec les
   * cotes ordinaires — 11 de haut, 21 de recul, demi-champ de 24° — une
   * créature de 4,3 unités occupe **un cinquième** de la hauteur de l'image.
   * Un boss qui tient dans un cinquième de l'écran est un jouet, quelle que
   * soit la qualité de son modèle.
   *
   * Rapprochée à 13 de recul et 7 de haut, elle lui en donne un tiers. La
   * plongée passe de 17° à 21°, ce qui reste sous le demi-champ : l'horizon
   * entre toujours dans le cadre, et le rendu diorama tient. Descendre encore
   * le recul ferait sortir les cornes du cadre dès qu'on s'approche à portée
   * d'épée — ce qui est exactement le moment où il faut les voir.
   *
   * La visée est relevée plus haut que d'ordinaire (5,5 contre 4,5), parce que
   * ce qu'il faut lire n'est plus le sol devant le joueur mais l'épaule du
   * Lynel, à 3 unités de haut.
   */
  arena: {
    offset: [0, 7, 13] as [number, number, number],
    lookAtHeight: 5.5,
    lookAtHeightMobile: 3.2,
  },
```

- [ ] **Step 2 : l'état de combat dans le store**

Modifier `src/store/useGameStore.ts`. Dans l'interface d'état, près de `location` (ligne 221) :

```ts
  /**
   * Où en est le combat de boss.
   *
   * Dans le store et non dans `Lynel.tsx`, parce que trois consommateurs qui ne
   * se connaissent pas en dépendent : la caméra, les barrières de l'arène, et
   * le portail du retour. Le tenir dans le composant du boss obligerait chacun
   * d'eux à aller le chercher là-bas.
   */
  bossState: 'idle' | 'fighting' | 'defeated'
```

Dans l'état initial (près de la ligne 428) :

```ts
  bossState: 'idle' as 'idle' | 'fighting' | 'defeated',
```

Dans l'interface des actions (près de `enterMap`, ligne 386) :

```ts
  startBossFight: () => void
  endBossFight: (defeated: boolean) => void
```

Et les implémentations :

```ts
  startBossFight: () => {
    // Idempotent : le Lynel l'appelle depuis sa boucle, donc potentiellement à
    // soixante frames par seconde tant que le joueur est dans l'arène.
    if (get().bossState !== 'idle') return
    set({ bossState: 'fighting' })
    track('boss_engaged', { phase: 'sword' })
  },

  endBossFight: (defeated: boolean) => {
    /*
      `defeated` distingue les deux sorties, et elles ne sont pas symétriques.

      Vaincu, le combat ne peut plus reprendre : les barrières s'ouvrent, la
      caméra se rouvre, et l'état reste `defeated` pour toute la partie. Mort,
      le joueur repart du continent et le Lynel remonte avec ses 36 points de
      vie — d'où le retour à `idle`, qui autorise un second engagement.
    */
    if (get().bossState !== 'fighting') return
    set({ bossState: defeated ? 'defeated' : 'idle' })
    if (defeated) track('boss_defeated', { hearts: get().hearts })
  },
```

Ajouter `bossState: 'idle'` à ce que `reset()` remet à plat — le repérer dans le fichier et l'y insérer.

Modifier `src/analytics/index.ts`, dans le type `Events` :

```ts
  boss_engaged: { phase: 'sword' }
  boss_defeated: { hearts: number }
  boss_parry: { attack: string }
```

- [ ] **Step 3 : la caméra bascule**

Modifier `src/components/CameraRig.tsx`. Aujourd'hui `OFFSET` est une constante de module (ligne 11) : la basculer demande de la rendre variable, mais **sans** casser le lissage.

Remplacer la constante par deux cibles et un vecteur de travail :

```ts
/** Les deux cadrages : celui du jeu, et celui du combat de boss. */
const FREE_OFFSET = new Vector3(...CAMERA.offset)
const ARENA_OFFSET = new Vector3(...CAMERA.arena.offset)
/** Décalage courant, interpolé entre les deux. */
const offset = new Vector3().copy(FREE_OFFSET)
```

Dans le `useFrame`, avant le calcul de `desiredPosition` :

```ts
    /*
      Le passage d'un cadrage à l'autre, et pourquoi il n'y a pas de transition
      à écrire.

      Le rig lisse déjà la position et le point visé à chaque frame, avec
      `1 - exp(-lambda * dt)`. Il suffit donc de déplacer la *cible* : le
      lissage existant fait le mouvement, au même rythme que n'importe quel
      suivi de joueur, et un passage d'arène ne se distingue pas d'un pas de
      côté un peu ample.

      Lerper le décalage lui-même plutôt que la position finale a une raison :
      la position finale suit déjà le joueur, et y mélanger un second lissage
      ferait dépendre la vitesse du changement de cadrage de la vitesse de
      course. On veut l'inverse — le cadrage change au même rythme qu'on
      marche ou qu'on soit à l'arrêt.
    */
    const arena = useGameStore.getState().bossState === 'fighting'
    offset.lerp(arena ? ARENA_OFFSET : FREE_OFFSET, t)
    const lookHeight = arena
      ? isTouch
        ? CAMERA.arena.lookAtHeightMobile
        : CAMERA.arena.lookAtHeight
      : isTouch
        ? CAMERA.lookAtHeightMobile
        : CAMERA.lookAtHeight
```

Remplacer `desiredPosition.copy(playerTransform.position).add(OFFSET)` par `.add(offset)`, et la ligne de visée par :

```ts
    desiredTarget.y += lookHeight
```

Import à ajouter :

```ts
import { useGameStore } from '../store/useGameStore'
```

- [ ] **Step 4 : les barrières**

Créer `src/components/skyisland/ArenaGate.tsx`.

```tsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { DoubleSide, Mesh, MeshBasicMaterial } from 'three'
import { SKY_COLORS } from '../../config/skyIsland'
import { ARENA_R } from '../../config/lynel'
import { now as gameNow } from '../../state/gameClock'
import { useGameStore } from '../../store/useGameStore'

/*
  Les deux travées écroulées de la rotonde sont ses entrées — et ses sorties.

  Les laisser ouvertes pendant le combat, c'est pouvoir fuir se soigner et
  revenir : un combat qu'on ne peut pas perdre mais qu'on peut rater longtemps,
  ce qui est la pire des deux choses. Les fermer, c'est un boss de jeu vidéo, et
  c'est assumé.

  Le voile est le violet du cristal, celui du portail : le joueur a déjà appris
  que cette couleur sépare deux endroits. On ne lui enseigne rien de neuf, on
  réutilise ce qu'il sait.
*/

/** Les deux travées écroulées. Repris de `RUINED_BAYS` dans `Ruins.tsx`. */
const RUINED_BAYS = [3, 7]
const PIERS = 10
/** Hauteur du voile. Au-dessus de l'arcade, donc infranchissable au saut. */
const GATE_H = 6
/** Largeur d'une travée, à ce rayon. */
const GATE_W = (2 * Math.PI * ARENA_R) / PIERS

export function ArenaGate() {
  const fighting = useGameStore((state) => state.bossState === 'fighting')
  const veils = useRef<Mesh[]>([])

  useFrame(() => {
    // Ondulation lente de l'opacité : un voile parfaitement stable se lit comme
    // une vitre, et une vitre n'a pas l'air de pouvoir s'ouvrir.
    const pulse = 0.28 + 0.1 * Math.sin(gameNow() * 0.003)
    for (const veil of veils.current) {
      if (veil) (veil.material as MeshBasicMaterial).opacity = pulse
    }
  })

  if (!fighting) return null

  return (
    <>
      {RUINED_BAYS.map((bay) => {
        const angle = (bay / PIERS) * Math.PI * 2
        const x = Math.sin(angle) * ARENA_R
        const z = Math.cos(angle) * ARENA_R
        return (
          <group key={bay} position={[x, 0, z]} rotation={[0, angle, 0]}>
            <mesh
              ref={(mesh) => {
                if (mesh) veils.current.push(mesh)
              }}
              position={[0, GATE_H / 2, 0]}
            >
              <planeGeometry args={[GATE_W, GATE_H]} />
              <meshBasicMaterial
                color={SKY_COLORS.crystal}
                transparent
                opacity={0.3}
                side={DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {/* Le collider est un corps fixe et non un capteur : il doit
                arrêter le joueur, pas le signaler. */}
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider args={[GATE_W / 2, GATE_H / 2, 0.3]} position={[0, GATE_H / 2, 0]} />
            </RigidBody>
          </group>
        )
      })}
    </>
  )
}
```

> Le `y` des barrières est relatif au plateau de la rotonde : les monter dans le même groupe que la rotonde, ou ajouter `CORE_Y` à leur position. Vérifier dans `Ruins.tsx` comment le plateau est positionné et faire pareil.

Modifier `src/components/skyisland/SkyIsland.tsx` : monter `<ArenaGate />` à côté de `<Lynel />`.

- [ ] **Step 5 : le Lynel déclenche et referme**

Modifier `src/components/Lynel.tsx`. Dans la boucle, après le calcul de `distance` :

```tsx
    /*
      L'engagement se mesure sur la distance du **joueur au centre de l'arène**,
      et non sur sa distance au Lynel.

      La différence compte : mesurée sur le Lynel, l'entrée en combat dépendrait
      de l'endroit où il se trouve au moment où le joueur franchit l'arcade, et
      les barrières se fermeraient parfois derrière le joueur, parfois devant.
      Mesurée sur le centre, elle se déclenche toujours au même endroit — c'est
      le lieu qui engage, pas la bête.
    */
    const fromCenter = Math.hypot(
      playerTransform.position.x - ARENA_CENTER[0],
      playerTransform.position.z - ARENA_CENTER[2],
    )
    if (fromCenter < ARENA_R - 1.5) store.startBossFight()
```

Et dans la branche de mort, à l'endroit où le corps disparaît (le `if (!state.popped)` repris d'`Enemy.tsx:301`) :

```tsx
        useGameStore.getState().endBossFight(true)
```

Enfin, la mort du joueur doit rouvrir l'arène. Dans `useGameStore.ts`, là où la phase passe à `'gameover'`, ajouter :

```ts
      // Le combat s'arrête avec le joueur : sans ça, les barrières restent
      // fermées et la caméra reste serrée sur l'écran de fin.
      bossState: state.bossState === 'fighting' ? 'idle' : state.bossState,
```

- [ ] **Step 6 : vérifier**

```bash
npm run build && npm run lint
```

Contrôles navigateur :

- Franchir l'arcade de la rotonde : les deux travées écroulées se voilent de violet, et la caméra se rapproche **progressivement**, sans à-coup.
  ```js
  __store.getState().bossState  // 'fighting'
  ```
- Essayer de sortir par une travée voilée : on est bloqué. Essayer de sauter par-dessus : impossible, le voile monte à 6.
- Le Lynel occupe maintenant environ **un tiers** de la hauteur de l'image, contre un cinquième avant.
- Mourir (`__store.getState().damagePlayer(20)`) : les barrières disparaissent, la caméra se rouvre, `bossState` revient à `'idle'`.
- Tuer le Lynel : mêmes effets, mais `bossState` reste à `'defeated'` et ne se relance pas si on repasse dans l'arène.
- En émulation tactile, vérifier que le joueur reste au-dessus de la bande de contrôles avec `lookAtHeightMobile` d'arène.

- [ ] **Step 7 : commit**

```bash
git add src/config/gameplay.ts src/store/useGameStore.ts src/components/CameraRig.tsx \
  src/components/skyisland/ArenaGate.tsx src/components/skyisland/SkyIsland.tsx \
  src/components/Lynel.tsx src/analytics/index.ts src/i18n/fr.json src/i18n/en.json
git commit -m "feat: la camera d'arene, et les barrieres qui referment la rotonde

Mesure sur la maquette : avec les cotes ordinaires — 11 de haut, 21 de recul —
une creature de 4,3 unites occupe un cinquieme de la hauteur de l'image. Un boss
qui tient dans un cinquieme de l'ecran est un jouet quelle que soit la qualite de
son modele. A 13 de recul et 7 de haut, il en occupe un tiers, et la plongee
reste sous le demi-champ : l'horizon entre toujours dans le cadre.

Aucune transition a ecrire : le rig lisse deja la position et la visee a chaque
frame, il suffit de deplacer la cible. Le decalage est lerpe plutot que la
position finale, sinon la vitesse du changement de cadrage dependrait de la
vitesse de course.

L'engagement se mesure sur la distance du joueur au centre de l'arene et non au
Lynel : c'est le lieu qui engage, pas la bete, et les barrieres se ferment
toujours au meme endroit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5 : phase II — l'arène sert

La charge et le triple tir. C'est ce qui fait enfin servir les onze unités de rayon de la rotonde, et ce qui donne aux piliers un rôle autre que décoratif.

**Files:**
- Modify: `src/components/Lynel.tsx`
- Modify: `src/config/lynel.ts`

**Interfaces:**
- Consumes: `fireProjectile`, `PROJECTILE_HIT_RADIUS` de `src/state/projectiles.ts` ; `LYNEL_ATTACKS`.
- Produces: rien de nouveau — les deux attaques existent déjà dans la table.

---

- [ ] **Step 1 : la charge**

Ajouter à `LynelRuntime` :

```tsx
  /** Direction figée de la charge en cours, ou `null`. */
  chargeDir: { x: number; z: number } | null
  chargeUntil: number
```

Et, à la résolution de l'attaque `charge`, au lieu d'infliger des dégâts immédiatement :

```tsx
      if (attack.id === 'charge') {
        /*
          La direction est figée **à l'impact du télégraphe**, pas suivie.

          Une charge qui corrige son cap est infaisable à esquiver, et le joueur
          finit par conclure que l'attaque n'a pas de parade — ce qui est vrai —
          ni d'esquive — ce qui serait faux et injuste. Figée, elle se lit : on
          voit où il va, on s'écarte.
        */
        const dx = playerTransform.position.x - position.x
        const dz = playerTransform.position.z - position.z
        const length = Math.hypot(dx, dz) || 1
        state.chargeDir = { x: dx / length, z: dz / length }
        state.chargeUntil = now + (ARENA_R * 2) / CHARGE_SPEED * 1000
      }
```

Avec, en tête de fichier :

```tsx
/** Vitesse de la charge, en unités/seconde. Trois fois sa vitesse de poursuite. */
const CHARGE_SPEED = 11
/**
 * Étourdissement quand la charge finit dans un pilier.
 *
 * Volontairement plus long que l'ouverture d'une parade (1,3 s) : c'est la plus
 * grosse récompense du combat, et elle doit se sentir comme telle. Elle est
 * aussi la seule qu'on obtienne sans avoir rien à parer, ce qui donne une
 * porte d'entrée à qui n'a pas encore compris la parade.
 */
const CHARGE_STUN_MS = 1400
```

Le déplacement pendant la charge, dans la section « Déplacement » :

```tsx
    if (state.chargeDir !== null) {
      velocityX = state.chargeDir.x * CHARGE_SPEED
      velocityZ = state.chargeDir.z * CHARGE_SPEED
      targetYaw = Math.atan2(state.chargeDir.x, state.chargeDir.z)
      state.pose = 'charge'

      // Le joueur pris dans la trajectoire.
      if (
        Math.hypot(
          playerTransform.position.x - position.x,
          playerTransform.position.z - position.z,
        ) < stats.radius + 0.8
      ) {
        store.damagePlayer(LYNEL_ATTACKS.charge.damage)
      }

      /*
        Fin de charge : le bord de l'arène, ou le temps.

        Le bord et non une requête physique contre les piliers — un raycast par
        frame pour une attaque qui sort toutes les cinq secondes serait cher, et
        le dallage est un disque : quitter le disque, c'est avoir heurté
        l'enceinte, quel que soit l'endroit.
      */
      const fromCenter = Math.hypot(position.x - ARENA_CENTER[0], position.z - ARENA_CENTER[2])
      if (fromCenter > ARENA_R - 1.2 || now > state.chargeUntil) {
        state.chargeDir = null
        state.staggerUntil = now + CHARGE_STUN_MS
        state.pose = 'brise'
        shake(0.16, 220)
        playImpact()
      }
    }
```

- [ ] **Step 2 : le triple tir**

À la résolution de l'attaque `volley` :

```tsx
      if (attack.id === 'volley') {
        /*
          Trois flèches, et pas une ligne de neuf à écrire : `fireProjectile`
          existe, et la parade d'épée du jeu les renvoie déjà — le joueur n'a
          rien de neuf à apprendre, il réutilise un geste qu'il connaît depuis
          le premier Octorok.

          La dispersion est appliquée par tir et non une fois pour les trois :
          trois flèches parallèles sont une seule flèche large, et se dodgent
          d'un pas. Étalées, elles obligent à choisir un côté.
        */
        muzzle.set(position.x, position.y + 1.4, position.z)
        for (const offset of [-VOLLEY_SPREAD, 0, VOLLEY_SPREAD]) {
          aim.copy(playerTransform.position)
          // Rotation du vecteur de visée autour de Y, dans le plan horizontal.
          const dx = aim.x - muzzle.x
          const dz = aim.z - muzzle.z
          const cos = Math.cos(offset)
          const sin = Math.sin(offset)
          aim.x = muzzle.x + dx * cos - dz * sin
          aim.z = muzzle.z + dx * sin + dz * cos
          fireProjectile(muzzle, aim, 0)
        }
      }
```

Avec :

```tsx
/** Écart entre deux flèches du triple tir, en radians. ±7°. */
const VOLLEY_SPREAD = 0.122
```

et les vecteurs de travail au niveau du module, comme dans `Enemy.tsx:45-48` :

```tsx
const muzzle = new Vector3()
const aim = new Vector3()
```

- [ ] **Step 3 : vérifier**

```bash
npm run build && npm run lint
```

Contrôles navigateur :

- Amener le Lynel sous 24 PV pour passer en phase II :
  ```js
  __enemies().find((e) => e.kind === 'lynel')  // lire les PV
  ```
- La charge s'annonce, part en ligne droite, ne corrige pas son cap, et finit contre l'enceinte avec une secousse et 1,4 s d'étourdissement.
- Se placer dans la trajectoire : 3 cœurs.
- Le triple tir part en éventail. Les trois flèches sont renvoyables au coup d'épée — vérifier qu'une flèche renvoyée retire 2 PV au Lynel.
  ```js
  __projectiles  // pour inspecter l'état des tirs
  ```
- En phase II, le balayage et l'estoc sortent toujours : les attaques s'ajoutent, elles ne se remplacent pas.

- [ ] **Step 4 : commit**

```bash
git add src/components/Lynel.tsx src/config/lynel.ts
git commit -m "feat: phase II — la charge et le triple tir font servir l'arene

La direction de la charge est figee a la fin du telegraphe, jamais suivie. Une
charge qui corrige son cap est infaisable a esquiver, et le joueur en conclut
que l'attaque n'a ni parade — ce qui est vrai — ni esquive — ce qui serait faux.

Elle finit contre l'enceinte et non contre un pilier : le dallage est un disque,
quitter le disque c'est avoir heurte quelque chose, et ca evite un raycast par
frame pour une attaque qui sort toutes les cinq secondes. 1,4 s d'etourdissement,
plus long que l'ouverture d'une parade — c'est la plus grosse recompense du
combat, et la seule qu'on obtienne sans rien avoir a parer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6 : phase III — la crinière, et la feinte

> **Tâche optionnelle** — voir la question 03 des questions ouvertes. Rien d'autre n'en dépend.

Le souffle, l'onde de choc, et la feinte : la seule mécanique du combat qui demande de *désapprendre*.

**Files:**
- Modify: `src/components/Lynel.tsx`
- Modify: `src/components/enemies/LynelModel.tsx`
- Modify: `src/config/lynel.ts`
- Modify: `src/state/deathPuffs.ts`
- Modify: `src/components/DeathPuffs.tsx`

---

- [ ] **Step 1 : la crinière s'allume**

Modifier `src/components/enemies/LynelModel.tsx` pour accepter `rage: boolean` via la ref (`setRage`), et porter le bloc `setRage` de la maquette (lignes 2153–2170) :

```tsx
  /**
   * La phase III : la crinière et la gouttière de la lame s'allument.
   *
   * Un émissif sur le matériau toon, et non une seconde palette : c'est ce qui
   * fait franchir à la crinière le seuil de bloom du jeu (0,82) sur les seules
   * faces éclairées. Une crinière repeinte en violet serait violette ;
   * celle-ci brûle.
   */
  const setRage = (on: boolean) => {
    materials.accent.emissive.set(on ? LYNEL_COLORS.glow : 0x000000)
    materials.accent.emissiveIntensity = on ? 0.75 : 0
    mats.halo.opacity = on ? 0.9 : 0.45
  }
```

- [ ] **Step 2 : le souffle et ses flaques**

Le souffle inflige ses dégâts dans un cône, puis laisse des flaques qui brûlent. Les flaques réutilisent le pool de `src/state/deathPuffs.ts` pour le visuel — relire ce module d'abord et ajouter un type de particule plutôt que d'en créer un second pool.

```tsx
/** Durée de vie d'une flaque, en millisecondes. */
const PUDDLE_MS = 3000
/** Dégâts d'une flaque, par seconde passée dedans. */
const PUDDLE_DPS = 1
/** Rayon d'une flaque. */
const PUDDLE_R = 1.6
```

```tsx
/*
  Les flaques rétrécissent l'arène sans y poser un seul obstacle.

  C'est toute leur raison d'être : un obstacle de décor gênerait aussi
  l'esquive, donc punirait le joueur en dehors du moment où il a fait une
  erreur. Une flaque ne gêne que là où le Lynel a soufflé, et seulement trois
  secondes — elle rétrécit le terrain *temporairement*, et le joueur choisit de
  la traverser ou non.
*/
```

- [ ] **Step 3 : l'onde de choc**

```tsx
      if (attack.id === 'stomp') {
        /*
          L'onde rase le sol : elle touche qui est à terre, pas qui saute.

          `playerTransform.grounded` est exactement le drapeau qu'il faut, et il
          existe déjà — le raycast sol du joueur l'écrit à chaque frame. Tester
          une hauteur absolue serait plus fragile : le dallage de la rotonde est
          à 7,2, et un seuil en dur y deviendrait faux le jour où l'arène bouge.
        */
        const airborne = !playerTransform.grounded
        if (!airborne && attackHits(attack, position, state.yaw)) {
          store.damagePlayer(attack.damage)
        }
        spawnDeathRing(position.x, groundY, position.z, SHOCK_COLOR, attack.reach)
      }
```

L'onde réutilise le pool d'anneaux de mort (`src/state/deathPuffs.ts:131`) plutôt que d'en créer un second. Aujourd'hui `spawnDeathRing` s'étend toujours de `DEATH_RING_FROM` (0,2) à `DEATH_RING_TO` (1,4) ; lui ajouter un rayon d'arrivée optionnel :

```ts
export function spawnDeathRing(x: number, y: number, z: number, source: Color, to = DEATH_RING_TO) {
```

stocker `to` dans l'entrée du pool, et le lire dans `src/components/DeathPuffs.tsx` à la place de la constante. Les appels existants ne changent pas : le défaut vaut l'ancienne valeur.

```tsx
/*
  Le violet et non le blanc de la mort d'un ennemi : l'onde est une menace, pas
  une disparition, et elle doit se lire dans la même couleur que le reste de ce
  que fait le Lynel.
*/
const SHOCK_COLOR = new Color(LYNEL_COLORS.glow)
```

`groundY` est le `y` du dallage sous le Lynel : `ARENA_CENTER[1]`.

- [ ] **Step 4 : la feinte**

```tsx
/**
 * Probabilité qu'un balayage de phase III soit une feinte.
 *
 * Une fois sur quatre, et pas plus. La feinte existe parce que la parade,
 * apprise, devient gratuite : le joueur ne regarde plus le Lynel, il attend le
 * flash. La réponse n'est pas de raccourcir la fenêtre — ça ne punirait que les
 * écrans lents — mais de mentir parfois.
 *
 * Au-delà d'une fois sur quatre, le signal cesse d'être une information et
 * devient du bruit : le joueur arrête de le regarder, et on a détruit la
 * mécanique qu'on voulait approfondir.
 */
const FEINT_CHANCE = 0.25
/** Retard du vrai coup sur le signal, quand c'est une feinte. */
const FEINT_DELAY_MS = 320
```

La feinte décale `pendingImpactAt` **après** que l'offre a été posée. L'offre garde donc son horaire d'origine : c'est précisément ce qui la rend fausse.

```tsx
        if (choice.parryable) {
          offerParry(SPAWN_ID, state.pendingImpactAt)
          if (state.phase === 'rage' && Math.random() < FEINT_CHANCE) {
            // L'impact recule, l'offre ne bouge pas. Qui pare au signal est en
            // récupération quand le coup arrive — il faut regarder l'épaule,
            // pas la crinière.
            state.pendingImpactAt += FEINT_DELAY_MS
          }
        }
```

- [ ] **Step 5 : vérifier**

```bash
npm run build && npm run lint
```

Contrôles navigateur, sous 12 PV :

- La crinière et la veine de la lame s'allument et **franchissent le bloom**.
- Le souffle laisse des flaques qui blessent pendant 3 s, puis s'éteignent.
- Le piétinement touche au sol et **rate si on saute**. Le vérifier en sautant à l'instant de l'impact.
- Environ un balayage sur quatre est une feinte : parer au signal échoue, et attendre 320 ms de plus réussit.

- [ ] **Step 6 : commit**

```bash
git add src/components/Lynel.tsx src/components/enemies/LynelModel.tsx \
  src/config/lynel.ts src/state/deathPuffs.ts src/components/DeathPuffs.tsx
git commit -m "feat: phase III — le souffle, l'onde, et la feinte

La feinte decale l'impact apres avoir pose l'offre de parade : l'offre garde son
horaire d'origine, et c'est exactement ce qui la rend fausse. Une fois sur
quatre, pas plus — au-dela, le signal cesse d'etre une information et devient du
bruit, le joueur arrete de le regarder, et on detruit la mecanique qu'on voulait
approfondir.

L'onde rase le sol et se franchit au saut : playerTransform.grounded est
exactement le drapeau qu'il faut et il existe deja. Le jeu avait un saut qui ne
servait qu'a grimper.

Les flaques retrecissent l'arene sans y poser d'obstacle — un obstacle de decor
generait aussi l'esquive, donc punirait en dehors du moment de l'erreur.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7 : la récompense, et la trace

> **Confirmer la question 04 avant de commencer.** Le défaut retenu est le réceptacle de cœur.

**Files:**
- Modify: `src/components/Lynel.tsx`
- Modify: `src/types/game.ts`
- Modify: `src/config/landmarks.ts`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json`
- Modify: `ROADMAP.md`

---

- [ ] **Step 1 : le réceptacle**

`claimHeartContainer(id: LandmarkId)` existe déjà dans le store (`useGameStore.ts:568`) et `<HeartContainer>` dans `components/environment/`. Ajouter `'rotunda'` à `LandmarkId`, une entrée dans `config/landmarks.ts`, et faire apparaître le réceptacle au centre de l'arène à la mort du Lynel — là où `endBossFight(true)` est appelé.

```tsx
/*
  Le réceptacle apparaît là où il est tombé, et pas dans un coffre.

  C'est le seul objet du jeu qu'on ne trouve pas en fouillant, et ça doit se
  voir : un coffre qui se matérialise après un boss raconte que la récompense
  était rangée là depuis toujours. Un réceptacle qui reste au sol raconte qu'on
  vient de le lui prendre.
*/
```

- [ ] **Step 2 : les libellés**

`src/i18n/fr.json` :

```json
    "boss": {
      "name": "Lynel argenté",
      "engaged": "Le gardien se dresse",
      "defeated": "Le gardien est tombé"
    },
```

`src/i18n/en.json`, au même emplacement :

```json
    "boss": {
      "name": "Silver Lynel",
      "engaged": "The guardian rises",
      "defeated": "The guardian has fallen"
    },
```

- [ ] **Step 3 : la ROADMAP**

Ajouter une entrée dans la section « Ce qui est fait » de `ROADMAP.md`, sous le monde, et mettre à jour la ligne « Dernière mise à jour ». Reprendre le ton des entrées voisines : ce qui a été fait, et le *pourquoi* des choix qui ne vont pas de soi — la touche `R` et son refus de Maj., l'anneau au sol plutôt que le seul signal diégétique, la caméra d'arène et le cinquième d'écran qui l'a motivée.

- [ ] **Step 4 : vérifier et commiter**

```bash
npm run build && npm run lint
```

Contrôle navigateur : tuer le Lynel, ramasser le réceptacle, vérifier que le cœur maximum passe à 6.

```bash
git add src/components/Lynel.tsx src/types/game.ts src/config/landmarks.ts \
  src/i18n/fr.json src/i18n/en.json ROADMAP.md
git commit -m "feat: le receptacle de la rotonde, et la ROADMAP

Le receptacle reste au sol la ou le Lynel est tombe, et non dans un coffre qui
se materialise : un coffre raconterait que la recompense etait rangee la depuis
toujours, le receptacle raconte qu'on vient de la lui prendre.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Revue du plan

Relecture du plan contre la maquette, faite après rédaction.

**Couverture.** Les six attaques de la maquette sont dans `LYNEL_ATTACKS` (Task 3) et implémentées aux Tasks 3, 5 et 6. La parade complète est Task 1. Les trois phases sont Tasks 3, 5, 6. La caméra d'arène est Task 4. Le verrou d'arène est Task 4. La récompense est Task 7.

**Deux écarts assumés par rapport à la maquette,** parce que l'écriture du code les a rendus visibles :

1. **La règle d'appui de la parade est plus simple.** La maquette distinguait l'appui « avant le signal » (700 ms de récupération) de l'appui « après » (fenêtre de 260 ms). La distinction est inutile : une seule formule — garde de 260 ms puis récupération de 450 ms, relancée par tout appui pendant la récupération — produit le même comportement anti-martèlement, parce que 710 ms dépassent déjà le plus long télégraphe du Lynel. Une règle au lieu de deux, et rien de perdu.
2. **La touche n'est pas Maj. gauche.** Windows ouvre la boîte des touches rémanentes au bout de cinq appuis rapprochés sur Maj, et aucune page web ne peut l'empêcher. `KeyR` à la place.

**Corrigé pendant la revue :** le nom de l'action du réceptacle (`claimHeartContainer`), la signature réelle de `tone()`, trois sons référencés mais jamais définis (tous écrits à la Task 1), un anneau d'onde appelé sans exister (il réutilise maintenant le pool des morts), une condition d'annulation illisible, et une interface de modèle qui annonçait des props là où le corps de la tâche passait par une ref.

**Ce que le plan ne fait pas,** et que la maquette laissait ouvert : la parade n'est pas étendue aux Moblins (question 02), et la récompense n'est pas une quatrième tenue (question 04). Les deux sont des ajouts, pas des reprises.
