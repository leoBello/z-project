# Animation de défaite d'un ennemi — design

**Date :** 2026-08-28
**Branche :** `feature/enemies-defeat-animation`

## Objectif

Faire de la mort d'un ennemi un événement qui se ressent, alors qu'elle se
constate aujourd'hui.

Dans l'état actuel (`Enemy.tsx`, branche « Mort »), la mort tient en trois
lignes : le groupe est écrasé linéairement pendant 500 ms puis le composant se
démonte. Aucun son dédié — `playHit()`, le son du coup ordinaire, est le dernier
bruit entendu. Aucune particule, aucun flash, aucune ponctuation. **Le coup fatal
sonne et se voit exactement comme un coup qui ne tue pas.** Le joueur apprend
qu'il a tué en constatant une absence.

La direction retenue est la **bouffée** : anticipation, détente, disparition au
pic dans un nuage facetté aux couleurs de l'ennemi. C'est la convention du genre,
elle se comprend sans explication, et elle réutilise la grammaire visuelle déjà
posée par `OutfitSmoke` et le décor facetté.

Quatre ingrédients de « juice » l'accompagnent, indépendants du parti pris
visuel : hit-stop sur le coup fatal, son de défaite dédié, secousse caméra
courte, et cœur lâché après le pic plutôt qu'à l'instant de la mort.

## Non-objectifs (YAGNI)

- Pas d'animation de mort par espèce : Octorok et Moblin partagent la séquence,
  seule la teinte du nuage diffère. La machine à états d'`Enemy.tsx` est commune,
  la mort le reste.
- Pas de ragdoll, pas de démembrement, pas d'éclats de corps. Le projet est
  d'abord un portfolio.
- Pas de shader de dissolution sur les matériaux des ennemis.
- Pas de compteur de combo, de score affiché ni de série de kills.
- Pas de ralenti progressif : le hit-stop est un gel binaire, pas une rampe.
- Aucune dépendance ajoutée. Aucun fichier audio.
- Pas de retour visuel supplémentaire sur les coups **non** fatals : le flash
  blanc et le recul existants restent tels quels.

## Séquence

Deux horloges se succèdent, et c'est volontaire. Le gel se compte en temps
**réel** ; tout le reste se compte en temps **de jeu**, qui ne coule pas pendant
le gel. La pose d'anticipation est donc tenue deux fois : une fois par le gel,
une fois par les premières millisecondes de jeu qui suivent.

| Horloge de jeu (ms) | Ce qui se passe |
|---|---|
| 0 | PV à zéro. Flash blanc, `playDefeat()`, hit-stop armé, secousse armée. **Le monde se fige 80 ms de temps réel** : corps écrasé (1,35 / 0,60 / 1,35) et blanc, la caméra tremble, le son joue |
| 0 → 40 | Le gel est fini, la pose d'anticipation est tenue encore un peu |
| 40 → 130 | Le corps se détend vers (0,60 / 1,50 / 0,60) et monte de 0,2 unité |
| 130 | Corps masqué. Nuage + anneau. Cœur lâché. Point retiré de la minimap |
| 130 → 730 | Le nuage gonfle vite puis se dissipe, hors du composant `Enemy` |
| 150 | Le composant `Enemy` se démonte |

Perçu bout à bout : 80 ms de gel, puis 130 ms de mouvement, puis six dixièmes de
dissipation.

L'anticipation avant la détente est ce qui fait exister la mort comme un *geste*
plutôt que comme une disparition. Le hit-stop tombe exactement sur la pose
d'anticipation : c'est la frame que le joueur regarde.

Le corps est **masqué** à t=130 et le composant se démonte à t=150. Le nuage,
lui, vit dans un pool hors de React et survit au démontage — c'est la contrainte
qui structure toute l'architecture ci-dessous.

## Architecture

| Élément | Rôle |
|---|---|
| `src/state/gameClock.ts` *(modifié)* | Ajoute `hitStop(ms)` et `isHitStopped()`, mesurés en temps réel. |
| `src/components/GameClock.tsx` *(modifié)* | N'avance plus l'horloge de jeu pendant le gel. |
| `src/components/PhysicsGate.tsx` *(nouveau)* | Possède `phase` et le gel, rend `<Physics paused>`. Prend ses enfants en `props.children`. |
| `src/state/cameraShake.ts` *(nouveau)* | Singleton mutable hors React : `shake(amplitude, ms)` + lecture de l'offset courant. |
| `src/components/CameraRig.tsx` *(modifié)* | Applique l'offset de secousse. |
| `src/state/deathPuffs.ts` *(nouveau)* | Pool de taille fixe des nuages et anneaux, hors de React. |
| `src/components/DeathPuffs.tsx` *(nouveau)* | Rend le pool : deux `InstancedMesh` + un `ShaderMaterial`. |
| `src/audio/sfx.ts` *(modifié)* | Ajoute `playDefeat()`. |
| `src/config/enemies.ts` *(modifié)* | Nouvelles constantes de durée. |
| `src/components/Enemy.tsx` *(modifié)* | Nouvelle séquence de mort, cœur différé, correction du culling. |
| `src/App.tsx` *(modifié)* | Passe par `<PhysicsGate>`, monte `<DeathPuffs />`. |

Les frontières sont nettes : le pool ne connaît pas les ennemis, l'ennemi ne
connaît pas le rendu du nuage, la secousse ne connaît que la caméra.

## Hit-stop

### Horloge

`gameClock.ts` gagne :

```ts
/** Fin du gel, en temps réel. Le gel doit finir même quand le temps de jeu ne coule plus. */
let hitStopUntil = -Infinity

export function hitStop(durationMs: number) {
  hitStopUntil = Math.max(hitStopUntil, performance.now() + durationMs)
}

export function isHitStopped() {
  return performance.now() < hitStopUntil
}
```

`performance.now()` et non `now()` : un gel chronométré sur l'horloge de jeu,
qu'il arrête lui-même, ne finirait jamais. C'est le même raisonnement que celui
déjà documenté dans `OutfitSmoke` pour la fumée de changement de tenue.

`Math.max` et non affectation : deux morts rapprochées prolongent le gel jusqu'au
plus tardif au lieu de le raccourcir, mais ne l'empilent pas.

`resetClock()` remet `hitStopUntil` à `-Infinity`.

`<GameClock />` ajoute le gel à sa garde existante :

```ts
if (useGameStore.getState().phase !== 'playing' || isHitStopped()) return
```

Tout le jeu lit `gameNow()` pour ses délais : figer l'horloge fige d'un coup les
cooldowns, les temps de préparation, les i-frames, la traînée de lame et
l'animation de mort elle-même. Aucun autre appelant à modifier.

### Physique

`<Physics paused>` sert déjà la pause d'inventaire, le comportement est donc
éprouvé dans le projet. Mais `paused` est une prop : la basculer depuis `App`
re-rendrait tout l'arbre deux fois par kill, ennemis compris.

D'où `<PhysicsGate>`, qui prend ses enfants en `props.children` :

```tsx
export function PhysicsGate({ children }: { children: ReactNode }) {
  const phase = useGameStore((state) => state.phase)
  const stopped = useHitStopped() // useSyncExternalStore sur gameClock
  return (
    <Physics gravity={[0, PLAYER.gravity, 0]} paused={phase !== 'playing' || stopped} debug={DEBUG_PHYSICS}>
      {children}
    </Physics>
  )
}
```

Quand le gel bascule, `PhysicsGate` se re-rend mais `children` est le **même
objet élément** qu'à la frame précédente : React court-circuite la réconciliation
du sous-arbre. Bonus : `App` ne lit plus `phase` et cesse donc de se re-rendre à
chaque pause.

`gameClock` expose pour cela un abonnement minimal (`subscribe(listener)` appelé
au passage du drapeau, dans `hitStop()` et depuis `<GameClock />` à l'expiration)
consommé par `useSyncExternalStore`. Pas de zustand : le gel n'est pas un état de
jeu, il ne survit pas à une frame et n'a aucun autre lecteur React.

### Déclenchement

Uniquement sur le **coup fatal**, dans `damageEnemy` après `state.hp <= 0`.
Jamais sur un coup ordinaire : le combat bégaierait en permanence.

`HIT_STOP_MS = 80`. En dessous de ~60 ms le gel ne se lit pas, au-dessus
de ~110 ms il se lit comme un à-coup de framerate.

## Le nuage

### Pourquoi un shader

`OutfitSmoke` anime cinq meshes séparés, chacun avec son `meshBasicMaterial`
dont l'opacité varie. Pour un pool de morts simultanées il faut un
`InstancedMesh` — et l'opacité par instance n'existe pas.

`Pickups` a contourné le problème analogue en animant l'échelle plutôt que
l'opacité. Ça marche pour un cœur qui palpite ; pour de la fumée, un nuage qui
rétrécit se lit comme une bulle qui rentre, pas comme une dissipation.

La sortie est déjà dans le vocabulaire du projet : `SwordArc` écrit un
`ShaderMaterial` brut. Donc **un `InstancedMesh` d'icosaèdres facettés, plus deux
`InstancedBufferAttribute` : `aAlpha` et `aColor`.** Un seul draw call, opacité et
teinte par instance.

```glsl
// vertex
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
// → gl_Position habituel avec instanceMatrix

// fragment
if (vAlpha < 0.01) discard;
gl_FragColor = vec4(vColor, vAlpha);
```

Matériau `transparent`, `depthWrite: false` — même raison que la fumée de tenue :
le nuage doit se superposer au décor et à lui-même, jamais le découper. Le test
de profondeur reste actif pour qu'un relief le cache normalement.

Géométrie : `faceted(new IcosahedronGeometry(0.4, 0))`, exactement celle
d'`OutfitSmoke`, facettée comme tout le décor.

### Teinte

`materials.base.body` de l'ennemi mort, éclaircie vers le blanc (~0,45) pour que
la fumée reste de la fumée. Un Octorok rouge et un Moblin brun ne meurent pas
dans le même nuage — c'est ce qui empêche l'effet de devenir un tampon générique
posé sur tout.

### Pool

`src/state/deathPuffs.ts`, sur le modèle de `state/pickups.ts` : tableau de
taille fixe, emplacements inactifs à l'échelle zéro, remplacement du plus ancien
quand c'est plein.

```ts
export interface DeathPuff {
  active: boolean
  position: Vector3   // décalage local déjà appliqué
  color: Color
  scale: number       // taille finale
  rise: number
  spin: number
  bornAt: number      // temps de jeu
}

export const PUFFS_PER_DEATH = 6
export const DEATH_PUFF_POOL_SIZE = 48   // six morts simultanées
export const DEATH_PUFF_MS = 600
```

`spawnDeathPuff(x, y, z, color)` remplit six emplacements avec les décalages
locaux, tailles et vitesses de rotation repris de la table `PUFFS` d'`OutfitSmoke`
— ils sont déjà réglés et le résultat est déjà validé à l'écran.

`clearDeathPuffs()` vide le pool, appelé au redémarrage d'une partie comme
`clearPickups()`.

### Animation

Reprise d'`OutfitSmoke`, chronométrée cette fois sur `gameNow()` et non sur
`performance.now()` : la mort est un événement de jeu, elle doit se figer avec le
reste pendant la pause et pendant le hit-stop.

```
k = (now - bornAt) / DEATH_PUFF_MS
grow  = min(k * 3.2, 1)
scale = puff.scale * (0.25 + grow * 0.95)
alpha = 0.85 * (1 - k * k)
```

Gonflement rapide puis dissipation lente. L'inverse se lirait comme une bulle qui
éclate.

`frustumCulled={false}`, comme `Pickups` : les nuages sont dispersés, recalculer
un volume englobant commun chaque frame coûterait plus cher que de les dessiner.

### Anneau au sol

Second `InstancedMesh`, `RingGeometry` couchée à plat aux pieds de l'ennemi, même
shader et même pool (`DEATH_RING_POOL_SIZE = 6`, un par mort). Rayon de 0,2 à
1,4 unité en 350 ms, alpha en décroissance rapide.

**C'est la première chose à couper si le test montre qu'il se lit mal.**
`SwordArc` documente que la caméra ne voit un objet couché au sol que sous 28°,
et que l'anneau d'épée s'y lisait comme une flaque avant d'être redressé. Un
anneau de choc reste plus lisible qu'une traînée d'épée — il est concentrique et
en expansion, sa forme se devine même écrasée — mais le doute est réel et se
tranche à l'écran, pas ici.

## Son

```ts
/**
 * Défaite d'un ennemi : le corps qui cède, puis le souffle du nuage.
 *
 * Aucune note musicale — même raisonnement que `playEquip` : une mort qui sonne
 * comme une récompense entrerait en concurrence avec la fanfare du coffre, et
 * c'est le coffre qui doit rester la trouvaille de la partie.
 */
export function playDefeat() {
  noiseBurst('lowpass', 3000, 260, 0.9, 0.22, 0.22)
  tone('triangle', 300, 70, 0.18, 0.3)
  noiseBurst('highpass', 900, 2600, 1.0, 0.06, 0.18)
}
```

Plus long et plus grave que `playHit` (0,09 s), sans le motif de quinte montante
de `playPickup`. Web Audio est en temps réel : le son joue pendant le gel, ce qui
est précisément l'effet recherché.

`playHit()` continue de jouer sur le coup fatal, juste avant : c'est l'impact,
`playDefeat` est ce qu'il provoque.

## Secousse caméra

`src/state/cameraShake.ts`, singleton mutable hors React sur le modèle de
`playerTransform` :

```ts
export function shake(amplitude: number, durationMs: number)
export function sampleShake(out: Vector3)  // écrit l'offset courant, (0,0,0) si fini
```

Chronométrée en `performance.now()` : elle doit trembler **pendant** le gel.

Deux sinusoïdes de fréquences différentes sur X et Y (≈ 38 Hz et 27 Hz), enveloppe
linéaire décroissante. `DEATH_SHAKE_AMPLITUDE = 0.08` unité,
`DEATH_SHAKE_MS = 120`. À doser bas : la vue 3/4 est fixe, toute secousse y est
très lisible.

Dans `CameraRig`, l'offset s'ajoute **après le lerp et avant
`camera.updateMatrixWorld()`**. Placé après, `cameraView` garderait la position
non secouée et les barres de vie du calque de combat 2D se décrocheraient
visiblement des ennemis pendant la secousse — exactement le symptôme que
`CameraRig` documente déjà pour le quaternion de `lookAt`.

## `Enemy.tsx`

### Runtime

Deux champs ajoutés à `EnemyRuntime` :

```ts
/** Tiré à la mort, consommé au pic : le cœur jaillit du nuage, pas du corps. */
dropsHeart: boolean
/** Vrai une fois le nuage émis, pour ne l'émettre qu'une fois. */
popped: boolean
```

### `damageEnemy`, au passage à zéro

```ts
state.state = 'dead'
state.deathAt = now
state.dropsHeart = Math.random() < HEART_DROP_CHANCE
state.popped = false
useGameStore.getState().registerKill()
playDefeat()
hitStop(HIT_STOP_MS)
shake(DEATH_SHAKE_AMPLITUDE, DEATH_SHAKE_MS)
```

Le tirage du cœur reste ici, à l'instant de la mort ; seul le `dropPickup` est
différé. Le commentaire existant sur `Math.random` plutôt que la graine du monde
reste valable et reste en place.

### Branche « Mort »

```
age = now - deathAt   // temps de jeu : vaut 0 pendant toute la durée du gel

age < DEATH_SQUASH_MS (40)   → écrasement (1.35, 0.60, 1.35), y = 0
age < DEATH_POP_MS (130)     → détente vers (0.60, 1.50, 0.60), y monte à 0.2
age >= DEATH_POP_MS          → si !popped : émission
age >= DEATH_REMOVE_MS (150) → setRemoved(true)
```

`DEATH_SQUASH_MS` est court **parce que le gel tient déjà la pose**. Réglé sur la
seule horloge de jeu il paraîtrait deux fois trop long : le gel et lui
s'additionnent à l'écran.

L'interpolation de la détente est cubique en sortie (`1 - (1-t)³`) : une rampe
linéaire donnerait un étirement mou.

Le corps reste **blanc** pendant toute la séquence. Aujourd'hui l'affectation du
flash est placée après le `return` de la branche de mort, donc un cadavre reprend
sa couleur : la branche de mort force elle-même `materials.body.color` et
`materials.dark.color` à blanc.

À l'émission (`popped = true`) :

```ts
state.popped = true
spawnDeathPuff(position.x, position.y, position.z, materials.base.body)
// L'anneau se pose sur la surface visible du terrain, pas sous le centre de la
// capsule : même échantillonneur que le mesh, le collider et les cœurs.
spawnDeathRing(position.x, sampleHeight(position.x, position.z), position.z, materials.base.body)
if (state.dropsHeart) dropPickup(position.x, position.y + 0.3, position.z)
enemyRegistry.delete(spawn.id)
group.visible = false
```

Le point disparaît de la minimap au pic et non au démontage : la carte et l'écran
doivent dire la même chose au même moment.

Aucun timer, aucun `setTimeout` : la boucle de frame est déjà là et elle se fige
correctement en pause. C'est le principe déjà tenu partout dans le fichier.

### Correction du culling

Le test `distance < ACTIVE_RADIUS` passe aujourd'hui **avant** la branche de
mort. Un ennemi tué juste avant que le joueur ne s'éloigne à plus de 85 unités
reste figé en `dead` pour toujours : sa branche de mort n'est jamais atteinte, il
ne se démonte jamais, et son entrée de registre reste en mémoire.

La branche de mort passe **devant** le test de culling. Elle est bornée
(190 ms) et ne coûte rien.

## Constantes

Dans `config/enemies.ts`, à côté de `HIT_FLASH_MS` :

```ts
/** Gel du monde sur le coup fatal. */
export const HIT_STOP_MS = 80
/**
 * Fin de la pose d'anticipation, en temps de jeu.
 * Court parce que le gel tient déjà la pose : les deux s'additionnent à l'écran.
 */
export const DEATH_SQUASH_MS = 40
/** Pic de la détente : le corps disparaît, le nuage naît. */
export const DEATH_POP_MS = 130
/** Démontage du composant, une poignée de frames après le pic. */
export const DEATH_REMOVE_MS = 150
/** Amplitude et durée de la secousse caméra. */
export const DEATH_SHAKE_AMPLITUDE = 0.08
export const DEATH_SHAKE_MS = 120
```

`DEATH_FADE_MS` (500) disparaît : plus rien ne s'en sert.

## Vérification

Le projet n'a pas de suite de tests ; la vérification est manuelle et
instrumentée, comme le documente `HANDOFF.md`.

**Sondes de développement** — sur le modèle du `__lastSwing` de `SwordArc`, une
mort dure 190 ms et ne se capture pas de façon fiable à l'écran. En `DEV`, exposer
`window.__lastDeath = { at, popped, puffsActive, heartDropped }` et
`window.__gameClock.isHitStopped`.

**À vérifier :**

1. Le gel dure ~80 ms et se termine, y compris si l'onglet perd le focus pendant
   le gel.
2. Pendant le gel : le joueur ne bouge pas, les ennemis ne bougent pas, les
   projectiles n'avancent pas, l'horloge de jeu n'avance pas, le son joue, la
   caméra tremble.
3. Deux ennemis tués dans la même frame : un seul gel, pas de double secousse
   empilée, deux nuages distincts.
4. Douze ennemis tués coup sur coup : le pool tourne sans emplacement perdu.
5. Un ennemi tué puis quitté à plus de 85 unités se démonte bien, et son entrée
   de `enemyRegistry` disparaît.
6. Le cœur apparaît bien après le pic et à travers le nuage.
7. Une mort pendant l'ouverture de l'inventaire : le nuage se fige avec le reste
   et reprend à la fermeture.
8. `App` ne se re-rend pas quand le gel bascule (compteur de rendu en `DEV`).
9. En qualité réduite (`postProcessing` coupé) l'effet reste lisible.
10. Sur mobile : le gel ne provoque pas de rattrapage visible à la reprise.

**Régression :** un coup non fatal doit rester strictement identique à
aujourd'hui — flash 160 ms, recul, aucun gel, aucune secousse.
