# Lame maudite et Écailles de l'Homme-Poisson — design

**Date :** 2026-09-19
**Branche :** `feature/lame-maudite-et-ecailles`

## Objectif

Ajouter deux objets ramassables, dans deux coffres neufs, qui font enfin exister
le système à trois emplacements :

- la **Lame maudite** (arme) : dégâts d'épée ×3, dégâts **reçus** ×2 ;
- les **Écailles de l'Homme-Poisson** (babiole) : la mer se traverse à pleine
  vitesse, la terre ferme un peu moins vite.

L'inventaire connaît trois familles depuis toujours — `outfit`, `weapon`,
`trinket` — et la troisième n'a jamais eu d'objet. Les Écailles la remplissent.
Les deux objets occupant des emplacements différents, ils se portent ensemble :
c'est la première fois que le joueur compose un équipement au lieu d'en changer.

## Non-objectifs (YAGNI)

- **Pas de nage ni de profondeur interdite.** La mer est déjà praticable à pied
  de bout en bout (`Player.tsx`, branche `wading`) : les Écailles ne font que
  rendre un multiplicateur, elles n'ouvrent aucun terrain neuf.
- **Pas de cœurs négatifs ni de capacité réduite.** `maxHearts` est documenté
  comme « un acquis définitif de la partie » ; un objet qui l'entame demanderait
  un troisième compteur à côté des rouges et des jaunes.
- **Pas de second emplacement par famille.** Une arme à la fois, une babiole à
  la fois.
- **Pas de nouvel ennemi** pour « justifier » la lame. Les deux espèces
  existantes suffisent à faire sentir l'échange (voir plus bas).
- **Pas de troisième skin.** Aucune silhouette de personnage n'est touchée.
- Aucune dépendance ajoutée.

## Décisions validées

| Sujet | Décision |
|---|---|
| Prix de la lame | Dégâts **reçus** ×2, en miroir de `swordDamage()`. Écartés : retirer un cœur rouge (se bat avec le modèle de la barre), supprimer les cœurs lâchés (coût invisible au moment du choix). |
| Puissance de la lame | `attackMultiplier: 3`. Les deux espèces tombent d'un coup. |
| Prix des écailles | `speed: 0.85` au sol. |
| Emplacement des objets | Lame = `weapon`, Écailles = `trinket`. |
| Coffres | Grande Stèle (lame) et Ruines de l'Île (écailles). |
| Silhouette de la lame | Un `WeaponId: 'cursed'` distinct, pas une reprise du katana. |
| Teintes d'accent | Lame `#b03a3a` (sang séché), écailles `#7fd4e8` (nacre). |

### Pourquoi ×3 et pas ×2

L'octorok a 2 points de vie, le moblin 3, et `SWORD_DAMAGE` vaut 1. Kusanagi
(×2) tue l'octorok en un coup et le moblin en deux. La lame à ×3 tue **les deux
en un coup** : c'est le premier palier qui change quelque chose que Kusanagi ne
change pas déjà. À ×2 les deux armes auraient été le même objet, l'un maudit.

### Pourquoi les dégâts reçus, et pas autre chose

C'est le seul prix qui se lit à la seconde où il se paie, et le seul qui
transforme la façon de jouer plutôt que les chiffres : cinq cœurs, deux fautes.
C'est aussi six lignes de code, en miroir exact d'un mécanisme déjà là.

Une synergie en sort toute seule, et elle est voulue : les deux cœurs jaunes de
la tenue se posent en **fin** de barre, donc ils encaissent le premier coup
doublé. Porter la tenue *et* la lame, c'est acheter une faute de plus. Rien à
coder pour ça — c'est le modèle de barre unique qui le produit.

## Le modèle

### `SkinTraits` s'élargit, et cesse d'appartenir au seul skin

Aujourd'hui `SkinTraits` vaut `{ speed, jump }` et ne vient que de la silhouette
(`skinTraits(outfit)`). Il gagne un troisième champ et devient ce que **tout
l'équipement** produit :

```ts
export interface SkinTraits {
  speed: number
  jump: number
  /** Multiplie `PLAYER.waterSpeedFactor`. Borné à 1 côté joueur. */
  water: number
}

/** Valeurs neutres. Tout objet qui ne touche pas au déplacement porte celles-ci. */
export const NEUTRAL_TRAITS: SkinTraits = { speed: 1, jump: 1, water: 1 }

const SKIN_TRAITS: Record<OutfitId, SkinTraits> = {
  luffy: { speed: 1, jump: 1.2, water: 1 },
  zoro: { speed: 1.18, jump: 1, water: 1 },
}
```

`Item` gagne un champ `traits: SkinTraits`, **requis, jamais optionnel** — même
règle que `attackMultiplier` et pour la même raison, déjà écrite dans le
fichier : « un multiplicateur absent vaudrait `undefined`, et c'est le genre de
valeur qui finit par sortir un `NaN` ». Idem pour `damageMultiplier`. Les deux
objets existants — `ZORO_GARB` et `KUSANAGI` — déclarent donc `traits:
NEUTRAL_TRAITS` et `damageMultiplier: 1` : ils ne changent ni le déplacement ni
les dégâts subis, et le disent explicitement plutôt que par omission.

`skinTraits(outfit)` est remplacée par :

```ts
/**
 * Aptitudes de déplacement de l'équipement courant.
 *
 * Part du skin, puis multiplie par ce que chaque objet porté déclare. Une
 * fonction pure dans `items.ts` et non des sélecteurs dans le store : c'est
 * déjà la doctrine du fichier — `outfitOf` et `weaponOf` y vivent parce que
 * c'est la table des objets qui décide de ce qu'un objet fait, pas le rig ni le
 * contrôleur qui devinent.
 */
export function traitsOf(equipment: Equipment, outfit: OutfitId): SkinTraits
```

Multiplication et non addition : les aptitudes du skin sont déjà des
multiplicateurs de `PLAYER.speed` et `PLAYER.jumpSpeed`, et un facteur se
compose sans que l'ordre compte.

### La table des objets

```ts
export const CURSED_BLADE: Item = {
  id: 'cursed-blade',
  kind: 'weapon',
  bonusHearts: 0,
  attackMultiplier: 3,
  damageMultiplier: 2,
  weapon: 'cursed',
  traits: NEUTRAL_TRAITS,
  accent: '#b03a3a',
}

export const FISHMAN_SCALES: Item = {
  id: 'fishman-scales',
  kind: 'trinket',
  bonusHearts: 0,
  attackMultiplier: 1,
  damageMultiplier: 1,
  traits: { speed: 0.85, jump: 1, water: 2 },
  accent: '#7fd4e8',
}
```

`water: 2` et non `1 / 0.55` : la valeur exacte n'a pas à connaître le réglage
qu'elle corrige. La borne côté joueur fait le travail, et elle protège aussi le
jour où un second objet aquatique existe.

## Le chemin des effets

| Effet | Qui le lit | À faire |
|---|---|---|
| `attackMultiplier` | `swordDamage()` | rien |
| `damageMultiplier` | `damageTaken(amount)` → `damagePlayer` | à ajouter |
| `speed` / `jump` | `Player.tsx` (~l. 133 et l. 267) | remplacer `skinTraits` par `traitsOf` |
| `water` | `Player.tsx` (~l. 267, branche `wading`) | borner le facteur |

### `damageTaken`

```ts
/**
 * Dégâts subis pour une agression de `amount`, équipement compris.
 *
 * Miroir exact de `swordDamage()`, et pour les mêmes raisons : une fonction et
 * non un champ, parce qu'un champ tenu à jour à chaque équipement serait une
 * seconde source de vérité à côté de la table des objets ; arrondie, parce que
 * les cœurs sont des entiers ; plancher à 1, pour qu'un futur objet défensif à
 * ×0,5 réduise les dégâts sans jamais rendre le joueur invulnérable.
 */
damageTaken: (amount: number) => number
```

`damagePlayer` l'appelle avant de soustraire. Le reste de la fonction ne bouge
pas : les i-frames, le `lastHitAt` qui sert de `key` au flash du HUD et le
passage en `gameover` sont inchangés.

### L'eau, côté joueur

```ts
// `traitsOf` construit un objet neuf à chaque appel : dans un sélecteur, il
// re-rendrait le contrôleur à **chaque** notification du store. On s'abonne donc
// à `equipped`, dont la référence ne change qu'à un vrai changement
// d'équipement, et on mémoïse. Le commentaire que remplace cette ligne mettait
// déjà en garde contre exactement ce piège.
const equipped = useGameStore((state) => state.equipped)
const traits = useMemo(() => traitsOf(equipped, outfitOf(equipped)), [equipped])
...
// On ne nage jamais plus vite qu'on ne court : la borne tient quel que soit le
// nombre d'objets aquatiques portés.
const waterFactor = Math.min(1, PLAYER.waterSpeedFactor * traits.water)
const speed = (wading ? topSpeed * waterFactor : topSpeed) * speedScale
```

### La ride du cycle de marche

`HeroPlaceholder` lit `skinTraits(outfit).speed` (~l. 209) pour caler la cadence
des jambes, mais ne reçoit que `outfit` et `weapon` en props : il ne peut pas
appeler `traitsOf`, qui demande l'équipement entier. Il faut donc lui passer la
vitesse de pointe calculée, en prop. Sans ça, les jambes battent la mesure d'un
personnage qui ne court plus à cette allure — visible dès qu'on équipe les
écailles.

## Les deux coffres

C'est ici qu'est l'essentiel du travail, et non dans les statistiques.
`chests.ts` ne pose pas un coffre à l'œil : les notes de cotes des deux coffres
existants donnent le niveau d'exigence attendu. Trois contraintes, à **mesurer**
et à écrire dans le commentaire de chaque coffre :

1. **Hors des colliders du monument.** Vérifiable à l'œil avec `?debug` en
   développement, qui affiche les colliders Rapier.
2. **Sur la partie strictement plate**, angles du coffre compris. Le coffre fait
   1,35 × 0,92, donc sa demi-diagonale vaut ≈ 0,82 : le **centre** doit tenir à
   `rayon_plat − 0,82`.
3. **À plus de `2,6 + interactRadius(lieu)` de la braise**, soit **5,6** pour les
   deux lieux visés (leur `interactRadius` vaut 3). En deçà, `F` devrait
   arbitrer entre ouvrir le coffre et ouvrir le panneau, et l'invite du HUD
   clignoterait dans la zone commune.

### Grande Stèle — la lame

Terrasse de rayon 7, altitude 4, braise en local `[0, 4.5]`. Le centre du coffre
doit donc tenir sous 6,18 du centre et au-delà de 5,6 de la braise.

Point de départ à vérifier : **local `[5.5, 1.0]`** — 5,59 du centre, 6,52 de la
braise. Les deux contraintes passent sur le papier ; restent les colliders de la
stèle, à constater en jeu.

> **Mesuré en jeu, et corrigé : `[-5.5, -1.0]`.** Le point de départ satisfaisait
> les deux premières contraintes et tombait au **nord** du monument, c'est-à-dire
> derrière lui — la caméra est fixe et tournée vers le nord. Une troisième
> contrainte manquait donc à cette liste : **le côté**. Les signes inversés
> donnent `(-21,6 ; 32,4)` pour un centre à `(-25 ; 28)`, au sud-est, et
> améliorent au passage la marge sur la braise (7,78 au lieu de 6,52).

### Ruines de l'Île — les écailles

**Le lieu le plus contraint de la carte.** Les ruines n'ont pas de terrasse
(`radius: 0`) : elles se posent sur le relief naturel, plat *à la valeur près*
jusqu'à **5,2** seulement, puis qui plonge — mesuré, la braise flottait de 21 cm
à 6,3 et de 55 cm à 7,0. Le centre du coffre doit donc tenir sous **4,38**, et
rester à plus de 5,6 de la braise posée en local `[0, 4.8]`.

Point de départ à vérifier : **local `[0, -4.3]`**, soit à l'opposé exact de la
braise — 4,3 du centre, 9,1 de la braise. Les deux contraintes passent
largement, et la mise en scène suit : on arrive par le gué, la braise nous fait
face, le coffre est derrière les ruines.

Le placement raconte quelque chose, et c'est voulu : **l'objet qui rend la mer
gratuite est de l'autre côté de la mer.** La première traversée se fait au
ralenti, toutes les suivantes sont libres. C'est la règle classique du genre, et
l'île est le seul endroit de la carte qui la permette.

### Identifiants

`ChestId` gagne `'stele-chest'` et `'ruins-chest'` ; `ItemId` gagne
`'cursed-blade'` et `'fishman-scales'`.

## Représentations visuelles

Quatre endroits dessinent un objet, et chacun a besoin des deux nouveaux :

- **`ItemIcon`** — la pastille de la grille d'inventaire ;
- **`ItemIllustration`** — le grand dessin de la carte d'objet ;
- **`LootShape`** (dans `TreasureChest.tsx`) — l'objet en réduction qui s'élève
  du coffre. Le fichier le dit : « pas une reproduction fidèle », deux ou trois
  teintes et une silhouette. La lame se lit dressée comme celle de Kusanagi ;
  les écailles se liront couchées, comme la tenue ;
- **`HeroPlaceholder`** — la lame en main, sous `weapon === 'cursed'`, à
  l'endroit où `Katana` et `Sword` sont déjà branchés (~l. 317).

La lame maudite : **plus courte que le katana, ébréchée, au fil sombre.** Une
quarantaine de lignes de boîtes sur le modèle de `Katana`. Elle ne peut pas
reprendre la silhouette du katana : les deux armes se portent au même
emplacement et s'excluent, le joueur doit voir laquelle il a au poing.

## Textes

`fr.json` et `en.json`, sous `ui.items`, quatre clés par objet — `name`, `meta`,
`description`, `effect` — au gabarit des deux entrées existantes. `meta` nomme le
coffre d'origine. `effect` est lu par la carte d'objet, qui n'affiche la ligne
que si `bonusHearts > 0 || attackMultiplier > 1` : **le test devra inclure
`damageMultiplier !== 1` et les `traits` non neutres**, sans quoi les écailles
n'afficheraient aucun effet.

> **Fait, et déplacé.** Le test vit désormais dans `items.ts` (`hasEffect`) et
> non dans la carte : un composant qui énumère lui-même les effets qu'il connaît
> oublie le premier qu'on ajoute. Un champ d'effet ajouté à `Item` se déclare là,
> et nulle part ailleurs.

Le registre des noms suit les deux objets existants : évocateur, jamais le nom
propre de la licence.

## Ce que ça touche

| Fichier | Quoi |
|---|---|
| `src/types/game.ts` | deux unions (`ItemId`, `ChestId`) |
| `src/config/items.ts` | `SkinTraits`, `NEUTRAL_TRAITS`, `traitsOf`, `damageMultiplier`, les deux objets, `WeaponId: 'cursed'` |
| `src/config/chests.ts` | les deux coffres, cotes mesurées et commentées |
| `src/store/useGameStore.ts` | `damageTaken`, appelé par `damagePlayer` |
| `src/components/Player.tsx` | `traitsOf`, borne du facteur d'eau |
| `src/components/models/HeroPlaceholder.tsx` | lame `cursed`, prop de vitesse |
| `src/components/inventory/ItemIcon.tsx` | deux pastilles |
| `src/components/inventory/ItemIllustration.tsx` | deux illustrations |
| `src/components/inventory/ItemCard.tsx` | test d'affichage de la ligne d'effet |
| `src/components/environment/TreasureChest.tsx` | `LootShape` × 2 |
| `src/i18n/fr.json`, `src/i18n/en.json` | huit clés |
| `README.md`, `ROADMAP.md` | arborescence et état du chantier |

## À vérifier en jeu

Les trois premiers points ne se jugent pas à la lecture du code :

1. **Les cotes des deux coffres.** Se téléporter sur place et constater qu'aucun
   angle ne flotte ni ne s'enfonce, que l'invite du coffre et celle du panneau
   ne se disputent jamais la touche `F`, et que le coffre est hors des
   colliders (`?debug`).
2. **Les deux teintes d'accent.** `#b03a3a` voisine avec le rouge des cœurs du
   HUD, `#7fd4e8` avec le jade de Kusanagi (`#4fc9a3`). Les deux se séparent en
   théorie par la saturation ; c'est à l'œil, carte ouverte et pastille
   d'inventaire à côté, que ça se tranche.
3. **La lame maudite tenue en main**, à côté du katana, pour vérifier qu'on les
   distingue en une image.

Outillage disponible en développement : `window.__playerBody` déplace le joueur,
`window.__store` inspecte et pilote la partie, `?debug` affiche les colliders.
