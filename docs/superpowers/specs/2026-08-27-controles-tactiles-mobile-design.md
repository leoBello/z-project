# Contrôles tactiles mobile — design

**Date :** 2026-08-27
**Branche :** `feature/add-phone-control`

## Objectif

Ajouter des contrôles tactiles façon émulateur GBA pour piloter le joueur sur
mobile : un joystick analogique flottant pour le déplacement, deux boutons
d'action (attaquer, sauter) et un bouton d'interaction contextuel. Les contrôles
sont affichés en transparence pour préserver un maximum d'écran visible, et la
caméra est ajustée sur mobile pour que les contrôles ne cachent jamais le joueur.

**Contrainte absolue : la version desktop n'est pas modifiée.** Souris + clavier
doivent se comporter exactement comme aujourd'hui. Tout le code mobile est inerte
quand la détection tactile est fausse.

## Non-objectifs (YAGNI)

- Pas de bouton saut critique au level design (le monde n'a pas de plateforme) —
  le saut reste néanmoins offert (bouton B).
- Pas de touches L/R, Start, Select.
- Pas de refonte de la minimap, du sélecteur de langue ni du menu Lieux sur
  mobile.
- Pas de gestion de l'orientation (portrait/paysage), pas de suggestion de
  rotation d'écran.
- Pas de recul caméra ni de changement de FOV sur mobile — un seul réglage
  bouge (`lookAtHeight`).
- Aucune dépendance ajoutée.

## Architecture

Trois ajouts, aucune modification du chemin desktop.

| Élément | Rôle |
|---|---|
| `src/config/device.ts` | `isTouchDevice()` = `matchMedia('(pointer: coarse) and (hover: none)').matches`. Hook `useIsTouchDevice()` avec listener `change` sur la media query (réagit à l'émulation devtools). |
| `src/state/touchInput.ts` | Singleton mutable hors React, sur le modèle de `src/state/playerTransform.ts`. Forme : voir ci-dessous. |
| `src/components/TouchControls.tsx` | Overlay HTML rendu hors `<Canvas>` (comme `HUD`), monté dans `App.tsx`. Rend `null` si `!useIsTouchDevice()`. Seul écrivain de `touchInput`. |

`Player.tsx` et `CameraRig.tsx` **lisent** `touchInput` / `isTouchDevice()`. Ils ne
dépendent jamais du composant `TouchControls`. Si `isTouchDevice()` est faux,
`touchInput` reste à zéro et le code de lecture est sans effet.

### Forme de `touchInput`

```ts
export const touchInput = {
  /** Axe analogique du joystick, repère écran, -1..1. 0 = relâché. */
  moveX: 0,
  moveY: 0,
  /** Drapeaux ponctuels, levés au pointerdown, consommés par Player. */
  jumpRequested: false,
  attackRequested: false,
  interactRequested: false,
}
```

`moveY` positif = pouce vers le bas de l'écran. La conversion en direction monde
est faite dans `Player.tsx` (voir plus bas).

## Joystick (déplacement)

- **Zone tactile** : moitié gauche de l'écran, tiers inférieur (élément
  transparent, `pointer-events: auto`, `touch-action: none`).
- Au `pointerdown` dans la zone : le stick (base + tête, SVG semi-transparent)
  apparaît centré sur le point de contact. On mémorise `pointerId` et l'origine.
- Au `pointermove` : vecteur origine→position, borné à un rayon max
  `JOY_RADIUS ≈ 60px`, dead-zone `JOY_DEADZONE ≈ 8px`. Normalisé sur
  `JOY_RADIUS` → `touchInput.moveX/moveY` dans `[-1, 1]`. La **magnitude du
  vecteur dose la vitesse** (marche lente près du centre).
- Au `pointerup` / `pointercancel` (même `pointerId`) : `moveX = moveY = 0`, le
  stick disparaît.
- Le suivi par `pointerId` permet joystick + bouton d'action pressés en même
  temps (deux pouces).

### Intégration dans `Player.tsx`

Section « --- 2. Direction voulue, relative à la caméra --- ».

```
si isTouchDevice() et (touchInput.moveX ≠ 0 ou touchInput.moveY ≠ 0) :
    magnitude = min(hypot(moveX, moveY), 1)
    moveDir = camRight * moveX + camForward * (-moveY)      // repère écran → monde
    moveDir.normalize()
    speedScale = magnitude
sinon :
    // code clavier actuel, inchangé
    moveDir composé depuis keys.forward/backward/left/right
    speedScale = 1
```

`speed` final = `speed * speedScale` (le `speed` existant intègre déjà le
ralentissement dans l'eau). Le clavier garde `speedScale = 1` : plein régime,
comportement identique à aujourd'hui.

Le reste de `Player.tsx` est inchangé : détection sol, application de la
vélocité, orientation du modèle (déjà pilotée par `Math.atan2(moveDir.x,
moveDir.z)`), publication de `playerTransform.speed` (hypot de la vélocité réelle,
qui pilote le cycle de marche — fonctionne tel quel en analogique).

## Boutons d'action (bas-droite, transparence)

- **A — Attaquer** et **B — Sauter** : deux boutons ronds permanents, décalés en
  diagonale façon manette. `pointerdown` →
  `touchInput.attackRequested = true` (resp. `jumpRequested`).
- **Interagir — contextuel** : bouton rond affiché uniquement si
  `useGameStore(s => s.nearbyLandmark)` est non nul (même condition que l'invite
  `<F>` du HUD, cf. `HUD.tsx:81`). `pointerdown` → `touchInput.interactRequested`.
- Opacité ≈ `0.35` au repos, ≈ `0.7` en appui (`:active`), transition ≈ 120 ms.
  `pointer-events: auto`, `touch-action: none`, `user-select: none`.
- Chaque bouton porte un `aria-label` traduit.

### Consommation des drapeaux d'action

- **Saut / attaque** : `Player.tsx` tient déjà des refs `jumpRequested` /
  `attackRequested` alimentées par `subscribeKeys`. Dans `useFrame`, on lit
  `jumpRequested.current || touchInput.jumpRequested`, puis on remet les **deux**
  sources à `false` (le ref ET `touchInput.jumpRequested`). Idem attaque. Toute
  la logique existante (saut refusé en l'air, fenêtre d'anti-enchaînement de
  l'attaque, visée assistée) est réutilisée sans changement.
- **Interaction** : à l'implémentation, localiser où la touche `interact` est
  consommée (abonnement `useKeyboardControls` / `subscribeKeys` sur `interact`,
  probablement dans un composant landmark ou l'ouverture du `PortfolioDialog`).
  Y ajouter la lecture de `touchInput.interactRequested`, puis remettre le
  drapeau à `false`. Aucune nouvelle voie d'ouverture de dialogue n'est créée.

## Caméra mobile

Dans `src/config/gameplay.ts`, `CAMERA` : ajout de `lookAtHeightMobile: 2`
(à côté de `lookAtHeight: 4.5`).

`CameraRig.tsx` : remplacer l'usage de `CAMERA.lookAtHeight` par
`isTouchDevice() ? CAMERA.lookAtHeightMobile : CAMERA.lookAtHeight`. Le rig
lerpe déjà `desiredTarget` chaque frame : la valeur mobile s'applique en douceur,
sans code de transition dédié.

Effet : l'axe de visée se relève, le joueur remonte vers le centre du cadre,
au-dessus de la bande de contrôles. Contrepartie assumée : un peu moins de ciel
visible en haut de l'image sur mobile. Position caméra, FOV, damping : inchangés.

## HUD sur mobile

Via `@media (pointer: coarse) and (hover: none)` dans `src/index.css` :

- `.hud__controls` (rappels de touches `ZQSD / Espace / E / F`) : `display: none`.
- `.hud__prompt` (« <F> Voir les projets ») : `display: none` — remplacé par le
  bouton Interagir contextuel.

Minimap, sélecteur de langue, menu Lieux : inchangés.

## i18n

Nouvelles clés dans `src/i18n/fr.json` **et** `src/i18n/en.json` (le type
`DICTIONARIES_MIRROR` vérifie l'égalité des formes à la compilation) :

```
ui.touch.move      "se déplacer"        / "move"
ui.touch.attack    "attaquer"           / "attack"
ui.touch.jump      "sauter"             / "jump"
ui.touch.interact  "interagir"          / "interact"
```

Utilisées en `aria-label` sur les contrôles.

## Style (`src/index.css`)

Nouvelle section `--- Contrôles tactiles ---`. Classes `.touch-controls`,
`.touch-joystick`, `.touch-joystick__base`, `.touch-joystick__thumb`,
`.touch-buttons`, `.touch-button`, `.touch-button--attack`,
`.touch-button--jump`, `.touch-button--interact`.

- Conteneur `position: fixed; inset: 0; pointer-events: none;` — chaque contrôle
  réactive `pointer-events: auto` localement (même principe que `.hud`).
- Respect de `@media (prefers-reduced-motion: reduce)` pour les transitions.
- Le conteneur n'est rendu que sur mobile (garde JS), mais les media queries CSS
  du HUD restent la source de vérité pour masquer `.hud__controls` /
  `.hud__prompt`.

## Tests / vérification

Pas de framework de test dans le repo. Vérification manuelle via devtools
(émulation mobile) :

1. Joystick : déplacement 360°, dosage de la vitesse (lent près du centre).
2. Multi-touch : joystick (pouce gauche) + bouton A/B (pouce droit) simultanés.
3. Bouton Interagir : apparaît à l'approche d'un monument, disparaît en
   s'éloignant, ouvre bien le dialogue.
4. Attaque / saut tactiles : mêmes règles que le clavier (pas d'enchaînement
   d'attaque, pas de saut en l'air).
5. Caméra : le joueur est recentré verticalement, aucun contrôle ne le couvre.
6. **Desktop (souris + clavier, `isTouchDevice()` faux) : comportement
   strictement identique à `main`.** Aucun élément tactile dans le DOM.

`npm run build` (tsc + vite) doit passer. Points sensibles : miroir i18n,
typage de `touchInput`, pas de `noUnusedLocals` cassé.
