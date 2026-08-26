# Points d'intérêt interactifs — plan d'implémentation

> **Pour un agent qui exécute ce plan :** les étapes sont en cases à cocher.
> Traiter les tâches **dans l'ordre** — chacune dépend des précédentes.
> Lire d'abord `ROADMAP.md`, puis `README.md`, puis `src/config/`.

**Objectif.** Rendre les points d'intérêt interactifs. Le Temple du Sommet ouvre
un dialogue qui présente les projets, illustration générée à l'appui,
navigable aux flèches avec un stepper, et qui met le jeu en pause. Les autres
lieux (stèle, pyramide, statue…) réutiliseront le même socle, chacun câblé sur
une section du portfolio.

**Architecture.** Trois socles indépendants posés avant la fonctionnalité
elle-même : un **dictionnaire i18n typé** sans dépendance, une **horloge de jeu
unique** qui rend la pause possible, et une **phase `paused`** dans le store.
Le dialogue est du HTML superposé au canvas, comme le HUD — pas de `<Html>`
drei : il est ancré à l'écran, pas à un point 3D. L'illustration est un **SVG
isométrique généré** depuis l'identifiant et les tags du projet, dont chaque
solide est peint en trois bandes — la transposition en 2D du `toonGradient`
du jeu.

**Pile.** Aucune dépendance nouvelle. React 19, TypeScript 6, zustand 5,
@react-three/fiber 9, @react-three/rapier 2. Les fichiers de traduction sont
du JSON importé, typé à la compilation.

## Journal d'exécution — 26 août 2026

Tâches **1 à 7 faites**. Restent la 8 (documentation, en cours ici) et la 9
(Vitest, optionnelle, non faite).

Le plan s'est trompé sur quatre points, tous trouvés en exécutant. Ils sont
corrigés dans le code ; ce journal les garde parce qu'un plan qu'on ne
confronte jamais à son exécution ne s'améliore pas.

**1. Le tableau de bascule vers l'horloge de jeu était incomplet — trois
fichiers manquants, trois bugs réels.** `src/state/pickups.ts` et
`src/state/projectiles.ts` écrivent `bornAt` **à la source**, pas dans les
composants où le plan les situait ; les suivre à la lettre donnait
`age = gameNow() - performance.now()`, très négatif, donc `age > LIFETIME`
jamais vrai : **cœurs et projectiles immortels**. Et
`src/components/models/HeroPlaceholder.tsx` comparait `attackStartedAt` (en
temps de jeu) à `performance.now()`, ce qui rendait `attacking` toujours faux :
**l'animation de coup d'épée ne se jouait plus**, sur le modèle justement
affiché puisque `link.glb` est absent. Leçon : chercher les *écritures* d'un
horodatage, pas seulement ses lectures.

**2. L'exception « `HUD.tsx` garde `performance.now()` » n'existait pas.**
`HUD.tsx` n'appelait jamais cette fonction ; il se sert de `lastHitAt` comme
`key` React, et le passage à l'horloge de jeu y est transparent.

**3. La justification de la priorité `-100` était fausse.** Le plan affirmait
qu'une priorité positive laisserait l'écran noir. Contrôle fait en passant à
`100` : la scène s'affiche normalement. `<PostFX />` monte un
`<EffectComposer>` qui s'abonne déjà avec `renderPriority = 1`, donc r3f est
**déjà** en rendu manuel et le composer dessine quoi qu'il arrive. La priorité
négative reste le bon choix, mais pour la seule raison de l'**ordre** : les
abonnés sont triés par priorité croissante, donc `100` ferait avancer l'horloge
après tous ses consommateurs — une frame de retard sur chaque délai.

**4. L'illustration a demandé deux correctifs, tous deux trouvés en mesurant.**
La couleur d'accent était tirée au sort dans une palette de six : **trois des
cinq projets retenus tombaient sur la même teinte**, et deux partageaient aussi
le motif. Élargir la palette et ajouter des axes n'a pas suffi — une seconde
collision est tombée du premier coup. Le hasard ne garantit rien : une palette
catégorielle s'assigne **par index**, comme en visualisation de données.
Séparément, le `viewBox` fixe était mal placé — un tiers de hauteur vide en
haut, socle rogné en bas — et ne pouvait de toute façon pas convenir puisque le
nombre d'éléments varie. Il est désormais **calculé** sur la boîte englobante
des formes produites.

Deux ajouts hors plan, tous deux des défauts constatés :

- Le gel du joueur figeait la dernière frame écrite. Une pause déclenchée sur
  une frame de clignotement d'i-frames laissait le héros **invisible** pendant
  tout le dialogue, et `playerTransform.speed` gardait sa valeur, donc le
  personnage **marchait sur place**. Corrigé dans la branche de pause.
- `Pickups` et `Projectiles` intègrent leur mouvement hors de Rapier : le
  `paused` du moteur physique ne les atteignait pas, et un projectile continuait
  de traverser l'écran derrière le panneau. Ils ont désormais leur propre garde
  de phase.

**Ajout post-livraison : le marqueur d'interaction.** Rien dans le panneau ne
disait au joueur qu'il *pouvait* ouvrir quelque chose : l'invite du HUD
n'apparaît qu'une fois déjà à portée, donc trop tard pour guider. Une braise
bleue est posée sur le parvis, devant l'escalier
(`src/components/environment/InteractionMarker.tsx`).

Cet ajout a déplacé une décision du plan : la zone d'interaction était centrée
sur l'autel, or le marqueur est à l'escalier. Les laisser dissociés aurait fait
mentir le marqueur. `Landmark.interact` porte désormais une ancre en
coordonnées monde, dérivée de la même constante que la géométrie du marqueur ;
le rayon passe de 4,5 à 3. Conséquence de jeu à assumer : **on consulte les
projets depuis le parvis, sans monter**. L'autel et son cristal restent la
récompense visuelle de la montée, plus le déclencheur.

Deux détails mesurés au passage : la première version de la braise arrivait au
genou du héros et se perdait dans le champ de rochers du sommet — agrandie de
moitié et remontée à hauteur de poitrine. Et le cristal de l'autel tournait
encore pendant la pause, parce qu'il lisait l'horloge de r3f et non celle du
jeu ; corrigé, c'était le dernier survivant de la bascule.

Enfin, le typage croisé des dictionnaires s'est révélé **asymétrique** : une clé
manquante dans `en.json` casse la compilation, une clé **en trop** y passait
inaperçue (`en` est un binding importé, pas un littéral frais, donc pas de
détection de propriétés excédentaires). Fermé par la constante
`DICTIONARIES_MIRROR`, qui force la vérification dans les deux sens — et dont
le mordant a été prouvé en ajoutant une clé orpheline.

---

## Contraintes globales

Elles s'appliquent à **toutes** les tâches, sans être répétées à chaque fois.

- **Commentaires en français**, et ils expliquent le *pourquoi*. Un commentaire
  qui paraphrase la ligne suivante est du bruit.
- **Rien de réactif à 60 fps.** Tout ce qui est lu ou écrit chaque frame vit
  hors de React. Le store zustand ne porte que ce que l'UI affiche, et on n'y
  écrit **que sur transition**.
- **Aucune dépendance npm ajoutée**, sauf la tâche 9, qui est optionnelle.
- `verbatimModuleSyntax` est actif : `import type` pour les types.
- Les entrées clavier ponctuelles passent par un **abonnement**, jamais par un
  sondage dans `useFrame` — c'est un bug déjà payé (voir `ROADMAP.md` §3).
- **Le français fait foi.** `fr.json` définit le type du dictionnaire ;
  `en.json` doit s'y conformer, sinon la compilation échoue.
- Chaque tâche se termine par `npx tsc -b` **et** `npm run build` passants, et
  par un commit.

---

## 0. Ce sur quoi on s'appuie

Déjà en place, à ne pas réinventer :

| Existant | Où | Ce que ça donne au plan |
| --- | --- | --- |
| Table des points d'intérêt | `src/config/landmarks.ts` | Il suffit d'y ajouter des champs, la terrasse, l'exclusion de végétation et le repère de minimap suivent |
| Détection de découverte par frame | `src/components/environment/Landmarks.tsx` | La boucle de proximité existe, on l'étend |
| Gel sur `phase !== 'playing'` | `src/components/Enemy.tsx:206`, `CombatOverlay.tsx:70` | Une phase `paused` gèle déjà les ennemis et le calque de combat, gratuitement |
| Bandeau animé remonté par `key` | `HUD.tsx`, `.discovery` dans `index.css` | Le motif d'animation CSS sans état React est déjà établi |
| Générateur déterministe `seededRandom` | `src/config/world.ts` | Réutilisé tel quel pour l'illustration |
| Crochets de diagnostic `window.*` | partout, sous `import.meta.env.DEV` | C'est la méthode de vérification du projet |

### Décisions arrêtées avec le propriétaire

1. **Illustration : SVG procédural inline.** Zéro asset, zéro poids de bundle,
   net à toute taille, déterministe. Le mini-diorama 3D dans un second canvas
   reste la voie de montée si le rendu 2D déçoit — le composant d'illustration
   est isolé derrière une seule interface, précisément pour ça.
2. **Contenu : sélection curée.** Un champ `featured` par expérience ; le temple
   ne montre que celles marquées. Le reste du dictionnaire reste disponible pour
   les futurs lieux.
3. **i18n : tout le texte visible.** HUD, Game Over, rappels de touches, noms de
   biomes, noms de lieux, dialogue. L'anglais devient réellement utilisable, ce
   qui est le but pour un portfolio.

### Écart assumé par rapport à la méthode de la skill

La skill `writing-plans` demande un cycle TDD par tâche. **Ce projet n'a aucun
harnais de test** : ni runner, ni script `test`. Plutôt que d'inventer des
commandes qui n'existent pas, chaque tâche se vérifie par la méthode déjà
documentée dans `HANDOFF.md` — type-check, build, et **mesure depuis la page**
via un crochet `window.*`, jamais à l'œil. La tâche 9 propose d'ajouter Vitest
sur les fonctions pures, qui s'y prêtent bien ; elle est optionnelle et aucune
autre tâche n'en dépend.

De même, le code est donné **en entier pour les parties porteuses** (horloge,
typage i18n, projection isométrique, motifs, détection de proximité, décalage
de phase) et **par interface exacte** pour le JSX et le CSS de rendu. Un plan de
quatre mille lignes cesserait d'être de la documentation.

---

## 1. Informations manquantes

À trancher par le propriétaire. Aucune ne bloque le démarrage : la tâche 1
répare et intègre ce qui a été fourni, les points ci-dessous se règlent avant la
tâche 8.

| # | Manque | Conséquence | Proposition |
| --- | --- | --- | --- |
| 1 | **Pas de projets personnels** dans le JSON. `experience` ne contient que des missions. `z-project` lui-même et `leobello.dev` n'y sont pas | Le temple montrera dix missions client, aucune réalisation propre — dommage pour un portfolio de dev | Ajouter deux entrées `experience` avec `"company": "z-project"` / `"leobello.dev"` et `featured: true`, ou créer un tableau `projects` distinct (schéma identique) |
| 2 | **URL LinkedIn probablement fausse** : `https://www.linkedin.com/in/leobellolinkedurl` | Lien mort dans le futur point d'intérêt « contact » | Fournir la vraie URL |
| 3 | **`cv.file` pointe vers `/cv/leo-bello-cv-fr.pdf`**, or `public/cv/` n'existe pas (`public/` ne contient que `favicon.svg` et `icons.svg`) | Bouton de téléchargement en 404 | Déposer les deux PDF, ou retirer la clé `cv` |
| 4 | **Pas de dates machine** (`startDate` / `endDate`), seulement `"Février 2026 — Aujourd'hui"` | Impossible de trier ou de filtrer autrement que par l'ordre du tableau | L'ordre du tableau est déjà antéchronologique : on s'en sert, et on le documente comme contrat |
| 5 | **Sélection `featured` à valider.** Je propose : Saisoneo, Bleu Tomate, FDJ/Sopra Steria, Yooz, LIG | Cinq étapes, hiérarchie lisible, et le stage de recherche en robotique fait un bon dernier écran | Confirmer ou corriger la liste |
| 6 | **`public/models/link.glb` absent** — erreur console à chaque chargement, préexistante, rattrapée par le repli de `SafeModel` | Une erreur rouge en console sur un portfolio, ça se voit | Fournir le `.glb` ou retirer le chemin de `LinkModel.tsx` |
| 7 | **Deux missions simultanément « Aujourd'hui »** (Saisoneo et Bleu Tomate) | Normal en freelance, mais deux écrans afficheront « en cours » | Rien à corriger, à garder en tête au maquettage |

**Encodage.** Les deux fichiers livrés sont de l'UTF-8 relu en Latin-1 :
`LÃ©o Bello`, `Ã ` pour `à`, `â` pour les tirets cadratins, `Ã§` pour `ç`.
La tâche 1 les réencode ; c'est une étape explicite, pas un détail.

---

## 2. Structure de fichiers

```
src/i18n/
  fr.json                   dictionnaire de référence (définit le type)
  en.json                   traduction, contrainte à la même forme
  index.ts                  Locale, Dictionary, dictionaries, format()
  useI18n.ts                hook de lecture : { locale, setLocale, dict }
src/store/
  useLocaleStore.ts         langue courante + persistance localStorage
  useGameStore.ts           MODIFIÉ : phase 'paused', lieu proche, lieu ouvert
src/state/
  gameClock.ts              horloge de jeu unique
src/components/
  GameClock.tsx             avance l'horloge, une fois par frame, en premier
  LanguageToggle.tsx        sélecteur FR / EN
  HUD.tsx                   MODIFIÉ : i18n, invite d'interaction
  Minimap.tsx               MODIFIÉ : i18n (nom de biome)
  Player.tsx                MODIFIÉ : gel en pause, horloge de jeu
  Enemy.tsx                 MODIFIÉ : horloge de jeu
  SwordArc.tsx              MODIFIÉ : horloge de jeu
  Pickups.tsx               MODIFIÉ : horloge de jeu
  Projectiles.tsx           MODIFIÉ : horloge de jeu
  environment/
    Landmarks.tsx           MODIFIÉ : proximité + touche d'interaction
  portfolio/
    PortfolioDialog.tsx     panneau, navigation, accessibilité
    ProjectStepper.tsx      pastilles de progression
    ProjectIllustration.tsx <svg> généré, seule interface publique
    illustration/
      isometry.ts           projection, isoBox, nuancier trois bandes
      motifs.ts             MotifId, règles tag → motif, formes
src/config/
  controls.ts               MODIFIÉ : action 'interact'
  landmarks.ts              MODIFIÉ : interactRadius, section ; label retiré
src/types/game.ts           MODIFIÉ : GamePhase gagne 'paused'
src/index.css               MODIFIÉ : .portfolio*, .hud__prompt, .language
tsconfig.app.json           MODIFIÉ : resolveJsonModule
```

**Pourquoi ce découpage.** `illustration/` est séparé de `ProjectIllustration.tsx`
parce que la projection et les motifs sont des fonctions pures, testables et
réutilisables, alors que le composant n'est que du câblage. `useLocaleStore` est
distinct de `useGameStore` parce que la langue survit à une partie et n'a rien à
faire dans un état remis à zéro par `reset()`.

---

## Tâche 1 — Socle i18n

**Fichiers**
- Créer : `src/i18n/fr.json`, `src/i18n/en.json`, `src/i18n/index.ts`, `src/i18n/useI18n.ts`
- Créer : `src/store/useLocaleStore.ts`
- Modifier : `tsconfig.app.json`

**Interfaces produites** — les tâches suivantes en dépendent :
- `type Locale = 'fr' | 'en'`
- `type Dictionary = typeof fr`
- `const dictionaries: Record<Locale, Dictionary>`
- `function format(template: string, values: Record<string, string | number>): string`
- `function useI18n(): { locale: Locale; setLocale: (l: Locale) => void; dict: Dictionary }`

- [ ] **Étape 1 : déposer les deux JSON en UTF-8 réel**

Partir des fichiers fournis par le propriétaire et **réparer l'encodage** : ils
sont en UTF-8 relu en Latin-1. Sous PowerShell, la conversion se fait en une
passe et se vérifie par l'absence de `Ã` :

```powershell
# `Resolve-Path` est obligatoire : les API .NET résolvent les chemins relatifs
# sur le répertoire courant du *processus*, qui ne suit pas les `cd` de
# PowerShell. Sans lui, le script lit et écrit ailleurs, sans erreur.
foreach ($file in @('fr', 'en')) {
  $path = (Resolve-Path "src/i18n/$file.json").Path
  $mojibake = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($path))
  $repaired = [System.Text.Encoding]::UTF8.GetString(
    [System.Text.Encoding]::GetEncoding(1252).GetBytes($mojibake))
  # UTF8Encoding($false) : sans BOM. Un BOM en tête d'un JSON importé par Vite
  # casse le parseur.
  [System.IO.File]::WriteAllText($path, $repaired, (New-Object System.Text.UTF8Encoding($false)))
}
```

**Piège rencontré en écrivant ce plan, à ne pas répéter.** Réécrire ces fichiers
en mode texte depuis un script court peut ne pas prendre effet — l'écriture
paraît réussir, une relecture dans le même processus confirme, et le fichier sur
disque n'a pas changé. Vérifier **dans une commande séparée**, et de préférence
au niveau des octets :

```powershell
(Get-Content -Raw -Encoding Byte src/i18n/fr.json | Where-Object { $_ -eq 0xC3 }).Count
```

Contrôle : `Select-String -Path src/i18n/*.json -Pattern 'Ã|â'` ne doit **rien**
retourner. `Léo Bello`, `Côte d'Azur`, `Française des Jeux` et les tirets
cadratins doivent se lire normalement.

- [ ] **Étape 2 : ajouter `featured` sur les dix expériences**

Chaque entrée reçoit `"featured": true` ou `"featured": false` — **toutes**, pas
seulement celles retenues. Une clé présente partout donne un type d'élément de
tableau homogène ; une clé optionnelle ferait diverger le type inféré de
`fr.json` et de `en.json`, et `en` cesserait d'être assignable à `Dictionary`.

À `true` : `saisoneo`, `bleu-tomate`, `sopra-steria`, `yooz`, `lig`.
À `false` : les cinq autres.

- [ ] **Étape 3 : ajouter la section `ui`, identique de forme dans les deux fichiers**

```json
"ui": {
  "hud": {
    "move": "se déplacer",
    "jump": "sauter",
    "attack": "attaquer",
    "interact": "interagir"
  },
  "gameover": {
    "title": "Game Over",
    "noKills": "Aucun ennemi vaincu.",
    "killsOne": "{count} ennemi vaincu.",
    "killsMany": "{count} ennemis vaincus.",
    "restart": "Rejouer"
  },
  "discovery": { "kicker": "Lieu découvert" },
  "minimap": { "north": "N" },
  "biomes": {
    "shallows": "Haut-fond",
    "beach": "Plage",
    "meadow": "Prairie",
    "jungle": "Jungle",
    "badlands": "Terres arides",
    "mountain": "Montagne",
    "island": "Île"
  },
  "landmarks": {
    "temple": { "name": "Temple du Sommet", "action": "Voir les projets" }
  },
  "portfolio": {
    "kicker": "Projets",
    "previous": "Projet précédent",
    "next": "Projet suivant",
    "close": "Fermer",
    "position": "{current} sur {total}",
    "current": "En cours"
  },
  "language": { "label": "Langue", "fr": "Français", "en": "English" }
}
```

Version anglaise correspondante : `move` → `move`, `jump` → `jump`,
`attack` → `attack`, `interact` → `interact`, `noKills` → `No enemies defeated.`,
`killsOne` → `{count} enemy defeated.`, `killsMany` → `{count} enemies defeated.`,
`restart` → `Play again`, `kicker` (découverte) → `Place discovered`,
biomes → `Shallows / Beach / Meadow / Jungle / Badlands / Mountain / Island`,
temple → `{ "name": "Summit Temple", "action": "View the projects" }`,
portfolio → `Projects / Previous project / Next project / Close / {current} of {total} / Ongoing`.

- [ ] **Étape 4 : activer l'import de JSON**

Dans `tsconfig.app.json`, sous `/* Bundler mode */`, ajouter :

```json
"resolveJsonModule": true,
```

`moduleResolution: "bundler"` l'autorise mais ne l'active pas.

- [ ] **Étape 5 : écrire `src/i18n/index.ts`**

```ts
import en from './en.json'
import fr from './fr.json'

export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * Le français fait foi : c'est lui qui définit la forme du dictionnaire, et la
 * traduction anglaise doit s'y conformer. Une clé oubliée dans `en.json`
 * devient une erreur de compilation, pas un trou à l'écran découvert en démo.
 */
export type Dictionary = typeof fr

export const dictionaries: Record<Locale, Dictionary> = { fr, en }

/**
 * Substitution `{clé}` dans une chaîne traduite.
 *
 * Volontairement minimal. Le projet n'a besoin ni de pluriels ICU ni de
 * formatage de dates — les deux seuls cas pluriels ont leur propre clé. Une
 * bibliothèque d'internationalisation coûterait plus que les six lignes
 * ci-dessous, pour un jeu dont tout le texte tient en une page.
 */
export function format(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}
```

- [ ] **Étape 6 : écrire `src/store/useLocaleStore.ts`**

```ts
import { create } from 'zustand'
import { LOCALES, type Locale } from '../i18n'

const STORAGE_KEY = 'z-project:locale'

/**
 * Langue de départ : le choix précédent du visiteur, sinon celle de son
 * navigateur, sinon le français.
 *
 * Les accès à `localStorage` sont sous `try` parce qu'ils *lèvent* — et pas
 * seulement renvoient `null` — quand le stockage de site est bloqué. Une
 * préférence de langue ne doit jamais empêcher le jeu de démarrer.
 */
function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale
    }
  } catch {
    // Stockage indisponible : on retombe sur la langue du navigateur.
  }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'fr'
}

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: initialLocale(),
  setLocale: (locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // Non persistée, mais appliquée : la langue change quand même.
    }
    document.documentElement.lang = locale
    set({ locale })
  },
}))
```

- [ ] **Étape 7 : écrire `src/i18n/useI18n.ts`**

```ts
import { useLocaleStore } from '../store/useLocaleStore'
import { dictionaries, type Dictionary, type Locale } from './index'

/**
 * Accès au dictionnaire courant.
 *
 * Pas de fonction `t('a.b.c')` : le dictionnaire est exposé tel quel et se lit
 * par propriété (`dict.ui.portfolio.next`). TypeScript vérifie alors chaque
 * clé sans qu'on ait à écrire de typage de chemins pointés, et une clé
 * renommée casse la compilation partout où elle est lue. C'est la même
 * approche que les objets de configuration du projet.
 */
export function useI18n(): {
  locale: Locale
  setLocale: (locale: Locale) => void
  dict: Dictionary
} {
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)
  return { locale, setLocale, dict: dictionaries[locale] }
}
```

- [ ] **Étape 8 : exposer le crochet de diagnostic**

À la fin de `src/i18n/index.ts` :

```ts
// Exposé en développement pour basculer la langue depuis la console ou depuis
// un test navigateur, sans avoir à cliquer dans le HUD.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__i18n = { LOCALES, dictionaries }
}
```

- [ ] **Étape 9 : vérifier**

```bash
npx tsc -b && npm run build
```
Attendu : les deux passent. Puis, page ouverte, dans la console :
`__i18n.dictionaries.en.ui.portfolio.kicker` → `"Projects"`, et
`__i18n.dictionaries.fr.experience.filter(e => e.featured).length` → `5`.

Contrôle négatif, à faire une fois puis annuler : supprimer une clé de
`en.json` et relancer `npx tsc -b`. Il **doit** échouer. Si ce n'est pas le cas,
`resolveJsonModule` n'est pas actif ou le typage a été contourné.

- [ ] **Étape 10 : commit**

```bash
git add src/i18n src/store/useLocaleStore.ts tsconfig.app.json
git commit -m "feat(i18n): socle de traduction typé, sans dépendance"
```

---

## Tâche 2 — Passer l'interface existante à l'i18n

**Fichiers**
- Modifier : `src/components/HUD.tsx`, `src/components/Minimap.tsx`,
  `src/config/controls.ts`, `src/config/biomes.ts`, `src/config/landmarks.ts`
- Créer : `src/components/LanguageToggle.tsx`
- Modifier : `src/App.tsx`, `src/index.css`

**Interfaces produites**
- `BiomeStyle.label` **supprimé** ; le libellé se lit dans `dict.ui.biomes[id]`
- `Landmark.label` **supprimé** ; il se lit dans `dict.ui.landmarks[id].name`
- `controlHints` devient `getControlHints(dict)` et renvoie
  `{ keys: string; label: string }[]`

- [ ] **Étape 1 : retirer les libellés des fichiers de configuration**

Un libellé traduit n'a rien à faire dans un fichier de configuration : il en
existe désormais deux versions. `biomes.ts` ne décrit plus que des couleurs,
`landmarks.ts` que de la géographie. Supprimer `label` des deux interfaces et de
toutes leurs entrées ; le compilateur signalera les trois lectures à corriger.

- [ ] **Étape 2 : `controls.ts` — libellés paramétrés**

```ts
import type { Dictionary } from '../i18n'

/**
 * Rappels de touches du HUD.
 *
 * Devenu une fonction : les libellés sont traduits, les codes de touche ne le
 * sont pas. Les codes restent en dur ici — ce sont des positions physiques sur
 * le clavier, pas du texte.
 */
export function getControlHints(dict: Dictionary) {
  return [
    { keys: 'ZQSD / WASD', label: dict.ui.hud.move },
    { keys: 'Espace', label: dict.ui.hud.jump },
    { keys: 'E', label: dict.ui.hud.attack },
    { keys: 'F', label: dict.ui.hud.interact },
  ]
}
```

L'entrée `F` anticipe la tâche 5 ; l'action clavier correspondante y est ajoutée.

- [ ] **Étape 3 : `HUD.tsx` — brancher le dictionnaire**

`const { dict } = useI18n()`, puis remplacer :
`Game Over` → `dict.ui.gameover.title` ; le texte de score par
`kills === 0 ? dict.ui.gameover.noKills : format(kills === 1 ? dict.ui.gameover.killsOne : dict.ui.gameover.killsMany, { count: kills })` ;
`Rejouer` → `dict.ui.gameover.restart` ; `Lieu découvert` →
`dict.ui.discovery.kicker` ; `landmarkById(id)?.label` →
`dict.ui.landmarks[lastDiscovery].name` ; `controlHints` → `getControlHints(dict)`.

- [ ] **Étape 4 : `Minimap.tsx` — nom de biome et rose des vents**

`BIOMES[biome].label` → `dict.ui.biomes[biome]`, `N` → `dict.ui.minimap.north`.
Ne rien changer d'autre : le fond de carte est pré-rendu une seule fois et ne
contient aucun texte.

- [ ] **Étape 5 : `LanguageToggle.tsx`**

Deux boutons `FR` / `EN` dans un `<div class="language" role="group">` étiqueté
par `dict.ui.language.label`. Le bouton actif porte `aria-pressed="true"`.
Monté dans `App.tsx` à côté de `<HUD />`. Classe CSS `.language`, ancrée en haut
à droite, même fond que `--hud-bg`, `pointer-events: auto` — c'est le seul
élément cliquable du HUD hors Game Over.

- [ ] **Étape 6 : vérifier**

```bash
npx tsc -b && npm run build && npm run lint
```
Puis, page ouverte : `__store.getState()` inchangé, clic sur `EN` → cœurs, nom
de biome, rappels de touches et écran de Game Over en anglais. Rechargement :
la langue est conservée. `grep -rn "Game Over\|Rejouer\|se déplacer" src/components src/config`
ne doit plus rien retourner.

- [ ] **Étape 7 : commit**

```bash
git commit -am "feat(i18n): tout le texte visible passe par le dictionnaire"
```

---

## Tâche 3 — Horloge de jeu unique

C'est la **priorité 3 de la roadmap** (« double horloge »). La pause la rend
inévitable : sans elle, un dialogue laissé ouvert trente secondes fait expirer
tous les cœurs au sol et déclenche toutes les attaques d'un coup à la fermeture.

**Fichiers**
- Créer : `src/state/gameClock.ts`, `src/components/GameClock.tsx`
- Modifier : `src/components/Player.tsx`, `Enemy.tsx`, `SwordArc.tsx`,
  `Pickups.tsx`, `Projectiles.tsx`, `CombatOverlay.tsx`,
  `src/store/useGameStore.ts`, `src/App.tsx`

**Interfaces produites**
- `function now(): number` — temps de jeu écoulé, en millisecondes
- `function advance(deltaSeconds: number): void`
- `function resetClock(): void`

- [ ] **Étape 1 : `src/state/gameClock.ts`**

```ts
/**
 * Horloge de jeu.
 *
 * Le projet lisait `performance.now()` pour tous les délais de gameplay —
 * cooldowns, temps de préparation, i-frames, durées de vie — pendant que le
 * déplacement avançait en temps *simulé*, avec un `delta` clampé à 0,05 s.
 * Sous 20 fps le clamp mord et les deux horloges divergent : tout se déplace au
 * ralenti pendant que les ennemis continuent d'attaquer à cadence normale.
 *
 * Une seule horloge, donc, qui cumule exactement les mêmes deltas clampés que
 * le déplacement, et qui n'avance pas hors de la phase `playing`. La mise en
 * pause en découle sans code supplémentaire : le temps de jeu s'arrête, donc
 * aucun délai ne court.
 *
 * `performance.now()` ne reste légitime que pour ce qui doit suivre le temps
 * *réel* : les animations d'interface en CSS, et rien d'autre.
 */
let elapsedMs = 0

/** Temps de jeu écoulé. Ne recule jamais, ne saute jamais, s'arrête en pause. */
export function now() {
  return elapsedMs
}

/** Avancé une fois par frame, et une seule — voir `<GameClock />`. */
export function advance(deltaSeconds: number) {
  elapsedMs += deltaSeconds * 1000
}

/** Remise à zéro au redémarrage d'une partie. */
export function resetClock() {
  elapsedMs = 0
}

if (import.meta.env.DEV) {
  // Exposée pour vérifier depuis la page qu'elle se fige bien en pause : c'est
  // exactement le genre de chose qu'on ne peut pas juger à l'œil.
  ;(window as unknown as Record<string, unknown>).__gameClock = { now, resetClock }
}
```

- [ ] **Étape 2 : `src/components/GameClock.tsx`**

```tsx
import { useFrame } from '@react-three/fiber'
import { advance } from '../state/gameClock'
import { useGameStore } from '../store/useGameStore'

/**
 * Avance l'horloge de jeu, une fois par frame et avant tout le monde.
 *
 * La priorité **négative** garantit l'ordre : un ennemi qui lirait l'horloge
 * avant qu'elle n'ait avancé travaillerait sur la frame précédente. Attention,
 * le signe compte — dans react-three-fiber une priorité *positive* reprend la
 * main sur la boucle de rendu et il faudrait alors appeler `gl.render`
 * soi-même. Une priorité négative ne fait qu'ordonner.
 *
 * Le clamp est le même que celui du déplacement du joueur, et c'est tout
 * l'intérêt de la manœuvre : les deux avancent désormais du même pas.
 */
export function GameClock() {
  useFrame((_, rawDelta) => {
    if (useGameStore.getState().phase !== 'playing') return
    advance(Math.min(rawDelta, 0.05))
  }, -100)

  return null
}
```

Monter dans `App.tsx` **à l'intérieur de `<Canvas>` et avant `<Physics>`**.

- [ ] **Étape 3 : basculer les consommateurs**

Remplacer `performance.now()` par `gameClock.now()` — importer
`import { now as gameNow } from '../state/gameClock'` pour ne pas masquer
`performance.now` — dans :

| Fichier | Ce qui bascule |
| --- | --- |
| `Enemy.tsx` | `const now = performance.now()` ligne ~116, donc `lastAttackAt`, `windupStartedAt`, `hitFlashUntil`, `deathAt`, `patrolUntil`, `stateSince` |
| `Player.tsx` | `attackStartedAt`, le test de rejeu d'attaque, le clignotement d'i-frames |
| `SwordArc.tsx` | la progression du coup, lue depuis `attackStartedAt` |
| `Pickups.tsx` | flottement, expiration, clignotement d'avertissement |
| `Projectiles.tsx` | `bornAt` et la durée de vie |
| `CombatOverlay.tsx` | l'atténuation des barres de vie sur `lastHitAt` |
| `useGameStore.ts` | `lastHitAt` et `isInvulnerable()` |

**Une seule exception à conserver en temps réel** : dans `HUD.tsx`, `lastHitAt`
sert de `key` React pour rejouer l'animation CSS du flash rouge. La valeur
change quand même à chaque coup, donc la `key` continue de fonctionner — ne
rien changer là.

- [ ] **Étape 4 : remettre l'horloge à zéro au redémarrage**

Dans `useGameStore.reset()`, appeler `resetClock()` avant le `set`. Sans ça, une
seconde partie démarre avec une horloge à plusieurs minutes ; les sentinelles
`-Infinity` encaissent, mais les cœurs lâchés juste avant le Game Over
expireraient instantanément.

- [ ] **Étape 5 : vérifier**

```bash
npx tsc -b && npm run build
```
Puis, page ouverte, mesurer — ne pas juger à l'œil :

```js
const a = __gameClock.now(); await new Promise(r => setTimeout(r, 2000)); __gameClock.now() - a
```
Attendu : proche de 2000 en jeu normal ; **strictement supérieur à 0**, sinon
`<GameClock />` n'est pas monté ou la phase n'est pas `playing`.

`grep -rn "performance.now()" src` ne doit plus renvoyer que `HUD.tsx` (aucune
occurrence si l'étape 3 a été suivie), et rien dans `Enemy.tsx`.

- [ ] **Étape 6 : commit**

```bash
git commit -am "refactor: horloge de jeu unique, corrige la double horloge"
```

---

## Tâche 4 — Phase `paused`

**Fichiers**
- Modifier : `src/types/game.ts`, `src/store/useGameStore.ts`,
  `src/App.tsx`, `src/components/Player.tsx`

**Interfaces produites**
- `type GamePhase = 'playing' | 'paused' | 'gameover'`
- `activeLandmark: LandmarkId | null`, `nearbyLandmark: LandmarkId | null`
- `openLandmark(id: LandmarkId): void`, `closeLandmark(): void`,
  `setNearbyLandmark(id: LandmarkId | null): void`

- [ ] **Étape 1 : étendre `GamePhase`**

```ts
/** Phase globale de la partie. Pilote le HUD, les écrans plein écran, et le gel. */
export type GamePhase = 'playing' | 'paused' | 'gameover'
```

`Enemy.tsx` et `CombatOverlay.tsx` testent déjà `phase !== 'playing'` : ils
gèlent en pause sans une ligne de plus. C'est la raison d'être de ce nommage.

- [ ] **Étape 2 : champs et actions du store**

```ts
  activeLandmark: LandmarkId | null
  nearbyLandmark: LandmarkId | null
```
dans `initialState`, à `null` tous les deux. Puis :

```ts
  /**
   * Ouvre le panneau d'un lieu et met la partie en pause.
   *
   * Refusé hors de `playing` : sans ce garde, une invite encore affichée à
   * l'instant du Game Over pourrait rouvrir un dialogue par-dessus l'écran de
   * fin, et `closeLandmark` remettrait alors la phase à `playing` avec zéro
   * cœur.
   */
  openLandmark: (id) => {
    if (get().phase !== 'playing') return
    set({ activeLandmark: id, phase: 'paused' })
  },

  closeLandmark: () => {
    if (get().phase !== 'paused') return
    set({ activeLandmark: null, phase: 'playing' })
  },

  /** Écrit uniquement sur transition — voir l'appelant dans `Landmarks.tsx`. */
  setNearbyLandmark: (id) => set({ nearbyLandmark: id }),
```

- [ ] **Étape 3 : geler la physique**

Dans `App.tsx` : `const phase = useGameStore((state) => state.phase)`, puis

```tsx
<Physics gravity={[0, PLAYER.gravity, 0]} paused={phase !== 'playing'} debug={DEBUG_PHYSICS}>
```

Le composant ne se re-rend qu'au changement de phase, pas par frame.

- [ ] **Étape 4 : geler le joueur**

Au tout début du `useFrame` de `Player.tsx`, après `if (!rb) return` :

```ts
    if (useGameStore.getState().phase !== 'playing') {
      // Les demandes en attente sont consommées, pas conservées : sinon la
      // touche qui ferme le dialogue déclencherait le saut mis en file juste
      // avant la pause, et le personnage bondirait à la réouverture du jeu.
      jumpRequested.current = false
      attackRequested.current = false
      return
    }
```

- [ ] **Étape 5 : vérifier**

```bash
npx tsc -b && npm run build
```
Page ouverte, depuis la console :

```js
__store.setState({ phase: 'paused' })
const a = __gameClock.now(); const p = { ...playerTransform.position }
await new Promise(r => setTimeout(r, 3000))
;[__gameClock.now() - a, playerTransform.position.x - p.x]
```
Attendu : `[0, 0]` — l'horloge ne bouge pas, le joueur non plus, touches
maintenues comprises. Remettre `__store.setState({ phase: 'playing' })` et
vérifier que tout repart.

- [ ] **Étape 6 : commit**

```bash
git commit -am "feat: phase paused, gel de la physique et du joueur"
```

---

## Tâche 5 — Interaction de proximité

**Fichiers**
- Modifier : `src/config/controls.ts`, `src/config/landmarks.ts`,
  `src/components/environment/Landmarks.tsx`, `src/components/HUD.tsx`,
  `src/index.css`

**Interfaces produites**
- `Control` gagne `'interact'`
- `Landmark` gagne `interactRadius: number` et `section: 'projects'`

- [ ] **Étape 1 : action clavier**

```ts
  | 'interact'
```
dans `Control`, et dans `controlMap` :
```ts
  { name: 'interact', keys: ['KeyF', 'Enter'] },
```

`KeyF` et non `KeyE` : `E` est déjà l'attaque. `Enter` en second parce que c'est
la touche que tout le monde essaie devant un dialogue.

- [ ] **Étape 2 : champs de la table des lieux**

Sur `TEMPLE`, ajouter :

```ts
  /**
   * Rayon d'interaction, mesuré au centre du monument.
   *
   * 4,5 place l'invite quand le joueur est **à l'autel** : le collider de
   * l'autel l'arrête déjà à 2,75 du centre (rayon de l'assise + rayon de la
   * capsule), donc l'invite s'allume au moment précis où il ne peut plus
   * avancer. Un rayon large aurait fait clignoter l'invite depuis la terrasse.
   */
  interactRadius: 4.5,
  /** Section du portfolio présentée par ce lieu. */
  section: 'projects',
```

Le type `section` est déclaré `'projects'` seul pour l'instant ; il s'élargira
en union quand la stèle et la pyramide arriveront.

- [ ] **Étape 3 : étendre la boucle de proximité**

Dans `Landmarks.tsx`, remplacer le corps du `useFrame` de `LandmarkDiscovery` :

```tsx
  useFrame(() => {
    const store = useGameStore.getState()
    const { position } = playerTransform

    let nearest: LandmarkId | null = null
    let nearestDistance = Infinity

    for (const landmark of LANDMARKS) {
      // Distance au sol : on peut découvrir le temple sans être à son altitude,
      // sinon le lieu ne se déclencherait qu'une fois l'escalier gravi.
      const distance = Math.hypot(position.x - landmark.x, position.z - landmark.z)

      if (distance < landmark.discoverRadius && !store.discovered.includes(landmark.id)) {
        store.discoverLandmark(landmark.id)
      }
      if (distance < landmark.interactRadius && distance < nearestDistance) {
        nearest = landmark.id
        nearestDistance = distance
      }
    }

    // Écriture dans le store **seulement sur transition**, comme le nom de
    // biome de la minimap. Sans ce test, on re-rendrait le HUD soixante fois
    // par seconde pour réafficher la même invite.
    if (nearest !== store.nearbyLandmark) store.setNearbyLandmark(nearest)
  })
```

- [ ] **Étape 4 : abonnement clavier**

Dans le même fichier, un composant `LandmarkInteraction` :

```tsx
function LandmarkInteraction() {
  const [subscribeKeys] = useKeyboardControls<Control>()

  useEffect(
    () =>
      subscribeKeys(
        (state) => state.interact,
        (pressed) => {
          if (!pressed) return
          // Abonnement et non sondage dans `useFrame` : un appui plus court
          // qu'une frame serait perdu. C'est le même piège que le saut et
          // l'attaque, déjà payé une fois.
          const store = useGameStore.getState()
          if (store.phase === 'playing' && store.nearbyLandmark) {
            store.openLandmark(store.nearbyLandmark)
          } else if (store.phase === 'paused') {
            store.closeLandmark()
          }
        },
      ),
    [subscribeKeys],
  )

  return null
}
```

Monté dans `<Landmarks />`, à côté de `<LandmarkDiscovery />`.

- [ ] **Étape 5 : invite dans le HUD**

Dans `HUD.tsx`, lire `nearbyLandmark` et `phase`, et n'afficher que si
`phase === 'playing'` :

```tsx
{phase === 'playing' && nearbyLandmark && (
  <div className="hud__prompt">
    <kbd>F</kbd>
    {dict.ui.landmarks[nearbyLandmark].action}
  </div>
)}
```

CSS `.hud__prompt` : centré bas, au-dessus de `.hud__controls`, même fond que
`--hud-bg`, apparition en fondu de 160 ms, `pointer-events: none`.

- [ ] **Étape 6 : vérifier**

```bash
npx tsc -b && npm run build
```
Mesure en page, sans avoir à marcher jusqu'au temple :

```js
playerTransform.position.set(-22, 18.86, -46)   // au pied de l'autel
await new Promise(r => requestAnimationFrame(r))
__store.getState().nearbyLandmark               // → "temple"
```
Puis appui sur `F` : `__store.getState().phase` → `"paused"`,
`activeLandmark` → `"temple"`. Nouvel appui : retour à `"playing"`.

- [ ] **Étape 7 : commit**

```bash
git commit -am "feat: interaction de proximité sur les points d'intérêt"
```

---

## Tâche 6 — Illustration procédurale

**Fichiers**
- Créer : `src/components/portfolio/illustration/isometry.ts`,
  `src/components/portfolio/illustration/motifs.ts`,
  `src/components/portfolio/ProjectIllustration.tsx`

**Interfaces produites**
- `interface Facet { points: string; fill: string }`
- `interface Shade { top: string; left: string; right: string }`
- `function shadesFrom(base: string): Shade`
- `function isoBox(x, y, z, w, h, d, shade: Shade): Facet[]`
- `type MotifId = 'panels' | 'strata' | 'lattice' | 'pipeline'`
- `function motifForTags(tags: readonly string[]): MotifId`
- `function buildMotif(motif: MotifId, random: () => number, shade: Shade): Facet[]`
- `function ProjectIllustration(props: { id: string; tags: readonly string[] }): JSX.Element`

- [ ] **Étape 1 : `isometry.ts` — projection et nuancier**

```ts
/**
 * Projection isométrique 2:1 et découpage en trois bandes.
 *
 * C'est ici que se joue la parenté avec le jeu. Le rendu 3D utilise un
 * `meshToonMaterial` sur une rampe de trois texels — ombre, demi-ton, lumière —
 * ce qui donne des bandes franches plutôt qu'un dégradé. On transpose
 * littéralement : chaque solide est peint en trois aplats, un par orientation
 * de face. Aucun dégradé, aucune ombre douce, la même lecture facettée.
 */

/** Pixels par unité, sur chaque axe de la projection. */
const ISO_X = 15
const ISO_Y = 7.5
const ISO_H = 15

export interface Facet {
  /** Attribut `points` d'un `<polygon>` SVG. */
  points: string
  fill: string
}

export interface Shade {
  top: string
  left: string
  right: string
}

/** Éclaircit ou assombrit une couleur `#rrggbb` d'un facteur multiplicatif. */
function scale(hex: string, factor: number) {
  const value = parseInt(hex.slice(1), 16)
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * factor)))
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

/**
 * Les trois bandes d'un solide.
 *
 * Le dessus prend la lumière, la face droite reste au demi-ton, la face gauche
 * passe à l'ombre. L'écart entre les trois est volontairement large : un écart
 * faible redonnerait un dégradé, donc annulerait l'effet.
 */
export function shadesFrom(base: string): Shade {
  return { top: scale(base, 1.28), right: scale(base, 1), left: scale(base, 0.68) }
}

/** Coordonnées écran d'un point du repère isométrique. */
function project(x: number, y: number, z: number): [number, number] {
  return [(x - z) * ISO_X, (x + z) * ISO_Y - y * ISO_H]
}

const polygon = (points: Array<[number, number]>) =>
  points.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ')

/**
 * Un pavé isométrique, en trois facettes.
 *
 * `(x, y, z)` est le coin bas-arrière, `y` la hauteur. L'ordre de retour
 * compte : dessus, face gauche, face droite. Les facettes sont dessinées dans
 * l'ordre du tableau final, sans tri de profondeur — les motifs sont donc
 * écrits du plus lointain au plus proche, ce qui suffit pour des compositions
 * de cette taille et évite d'écrire un tri.
 */
export function isoBox(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  shade: Shade,
): Facet[] {
  const top = y + h
  return [
    {
      points: polygon([
        project(x, top, z),
        project(x + w, top, z),
        project(x + w, top, z + d),
        project(x, top, z + d),
      ]),
      fill: shade.top,
    },
    {
      points: polygon([
        project(x, top, z + d),
        project(x + w, top, z + d),
        project(x + w, y, z + d),
        project(x, y, z + d),
      ]),
      fill: shade.left,
    },
    {
      points: polygon([
        project(x + w, top, z),
        project(x + w, top, z + d),
        project(x + w, y, z + d),
        project(x + w, y, z),
      ]),
      fill: shade.right,
    },
  ]
}
```

- [ ] **Étape 2 : `motifs.ts` — du contenu du projet vers une forme**

```ts
import { isoBox, type Facet, type Shade } from './isometry'

export type MotifId = 'panels' | 'strata' | 'lattice' | 'pipeline'

/**
 * Diacritiques combinants, ceux que `normalize('NFD')` détache des lettres.
 *
 * La plage est **construite depuis ses points de code**, et non écrite en clair
 * dans un littéral de gabarit. Ces caractères sont des marques invisibles :
 * écrits tels quels, un copier-coller, un formateur ou un éditeur qui
 * renormalise le fichier les efface sans laisser de trace, et la règle cesse
 * silencieusement de fonctionner. C'est exactement ce qui est arrivé pendant la
 * rédaction de ce plan, trois fois de suite.
 */
const DIACRITICS = new RegExp(
  `[${String.fromCodePoint(0x300)}-${String.fromCodePoint(0x36f)}]`,
  'g',
)

/** Minuscules sans accents : « Robotique » et « Robotics » doivent se croiser. */
const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(DIACRITICS, '')

/**
 * Règles tag → motif, **dans l'ordre de priorité**.
 *
 * Les deux orthographes sont listées parce que les tags sont traduits : le
 * dictionnaire français dit « Robotique », l'anglais « Robotics ». Résoudre le
 * motif depuis la langue affichée ferait changer l'illustration en basculant
 * FR/EN, ce qui serait absurde pour une image censée identifier un projet.
 *
 * La première règle qui trouve un tag gagne : un projet de robotique reste un
 * projet de robotique même s'il est aussi taggé React.
 */
const MOTIF_RULES: ReadonlyArray<{ motif: MotifId; tags: readonly string[] }> = [
  {
    motif: 'lattice',
    tags: [
      'machine learning', 'deep learning', 'pytorch', 'robotique', 'robotics',
      'reseaux de neurones', 'neural networks',
    ],
  },
  {
    motif: 'pipeline',
    tags: ['microservices', 'event-driven', 'ci/cd', 'oauth 2.0', 'sso', 'automatisation', 'automation'],
  },
  {
    motif: 'strata',
    tags: ['postgresql', 'supabase', 'rest api', 'node.js', 'java ee', 'firebase firestore'],
  },
  {
    motif: 'panels',
    tags: ['react', 'typescript', 'next.js', 'angular', 'javascript', 'wordpress'],
  },
]

/** Motif d'un projet. `panels` par défaut : le projet est front-end avant tout. */
export function motifForTags(tags: readonly string[]): MotifId {
  const normalized = new Set(tags.map(normalize))
  for (const rule of MOTIF_RULES) {
    if (rule.tags.some((tag) => normalized.has(tag))) return rule.motif
  }
  return 'panels'
}

/**
 * Les formes d'un motif.
 *
 * Écrites du plus lointain au plus proche — voir la note d'ordre dans
 * `isoBox`. Le générateur `random` est déterministe et dérivé de
 * l'identifiant du projet : deux ouvertures du même projet donnent exactement
 * la même image, et deux projets différents n'ont pas la même.
 */
export function buildMotif(motif: MotifId, random: () => number, shade: Shade): Facet[] {
  switch (motif) {
    // Strates : des assises empilées qui rétrécissent. Lecture « données ».
    case 'strata':
      return [0, 1, 2, 3].flatMap((level) => {
        const inset = level * 0.35
        return isoBox(inset, level * 0.55, inset, 3.4 - inset * 2, 0.5, 3.4 - inset * 2, shade)
      })

    // Panneaux : trois plans flottants et décalés. Lecture « interface ».
    case 'panels':
      return [0, 1, 2].flatMap((index) =>
        isoBox(
          index * 0.5 + random() * 0.3,
          index * 0.85,
          2 - index * 0.6,
          2.4,
          0.22,
          1.6,
          shade,
        ),
      )

    // Treillis : des nœuds à hauteurs irrégulières. Lecture « réseau ».
    case 'lattice':
      return [
        [0, 0], [1.4, 0.2], [2.8, 0], [0.4, 1.6], [1.9, 1.8], [3.1, 1.5],
      ].flatMap(([x, z]) =>
        isoBox(x, 0.2 + random() * 1.1, z, 0.7, 0.7, 0.7, shade),
      )

    // Chaîne : des blocs alignés de hauteur croissante. Lecture « pipeline ».
    case 'pipeline':
      return [0, 1, 2, 3].flatMap((index) =>
        isoBox(index * 0.95, 0, 1, 0.7, 0.5 + index * 0.42, 0.7, shade),
      )
  }
}
```

- [ ] **Étape 3 : `ProjectIllustration.tsx`**

```tsx
import { useMemo } from 'react'
import { seededRandom } from '../../config/world'
import { isoBox, shadesFrom } from './illustration/isometry'
import { buildMotif, motifForTags } from './illustration/motifs'

/**
 * Teintes d'accent, **toutes prélevées sur le jeu** : ardoise du toit du
 * temple, cristal de l'autel, feuillage de jungle, sable d'île, parme du
 * ciel, patine. L'illustration tire au sort, mais elle ne peut pas sortir de
 * la charte.
 */
const ACCENTS = ['#4f5878', '#ffb43c', '#3d8442', '#d8c890', '#9fb0e8', '#5b9a90'] as const
/** Pierre du temple : le socle de l'illustration est celui du monument. */
const PLINTH = '#cfc5ae'

/** Hash de chaîne vers un entier, pour amorcer le générateur déterministe. */
function hashString(value: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193)
  }
  return hash >>> 0
}

interface ProjectIllustrationProps {
  /** Identifiant du projet. Amorce le tirage : même projet, même image. */
  id: string
  tags: readonly string[]
}

export function ProjectIllustration({ id, tags }: ProjectIllustrationProps) {
  const facets = useMemo(() => {
    const random = seededRandom(hashString(id))
    const accent = ACCENTS[Math.floor(random() * ACCENTS.length)]
    // Le socle d'abord : il est derrière tout le reste, et il n'y a pas de tri
    // de profondeur — voir la note dans `isoBox`.
    return [
      ...isoBox(-0.6, -0.9, -0.6, 4.6, 0.9, 4.6, shadesFrom(PLINTH)),
      ...buildMotif(motifForTags(tags), random, shadesFrom(accent)),
    ]
  }, [id, tags])

  return (
    <svg
      className="portfolio__illustration"
      viewBox="-120 -140 240 200"
      role="img"
      // L'image ne porte aucune information que le texte voisin ne donne pas :
      // la décrire aux lecteurs d'écran serait du bruit.
      aria-hidden="true"
    >
      {facets.map((facet, index) => (
        <polygon key={index} points={facet.points} fill={facet.fill} />
      ))}
    </svg>
  )
}
```

- [ ] **Étape 4 : vérifier**

```bash
npx tsc -b && npm run build
```
La vérification visuelle vient avec la tâche 7. Ici on vérifie le
**déterminisme** et la **couverture des motifs**, depuis la console :

```js
const { motifForTags } = await import('/src/components/portfolio/illustration/motifs.ts')
__i18n.dictionaries.fr.experience.map(e => [e.id, motifForTags(e.tags)])
```
Attendu : `lig` → `lattice`, `saisoneo` → `pipeline`, `yooz` → `strata`,
`bleu-tomate` → `panels`. Les quatre motifs doivent être représentés ; si l'un
manque, les règles sont mal ordonnées et toutes les illustrations se
ressembleront.

- [ ] **Étape 5 : commit**

```bash
git add src/components/portfolio
git commit -m "feat(portfolio): illustration isométrique générée par projet"
```

---

## Tâche 7 — Dialogue portfolio

**Fichiers**
- Créer : `src/components/portfolio/PortfolioDialog.tsx`,
  `src/components/portfolio/ProjectStepper.tsx`
- Modifier : `src/App.tsx`, `src/index.css`

- [ ] **Étape 1 : `ProjectStepper.tsx`**

Interface : `{ total: number; current: number; onSelect: (index: number) => void }`.
Rend `<ol class="portfolio__stepper">` de `total` `<button class="portfolio__dot">`,
l'actif portant `aria-current="step"` et la classe `portfolio__dot--active`.
Chaque bouton a un `aria-label` issu de
`format(dict.ui.portfolio.position, { current: index + 1, total })`.

- [ ] **Étape 2 : `PortfolioDialog.tsx` — structure**

Rendu **uniquement** si `activeLandmark !== null`. Liste des projets :
`dict.experience.filter((entry) => entry.featured)`.

L'index courant est un `useState` local et non un champ du store : il ne
survit pas à la fermeture, et personne d'autre n'en a besoin.

```
<div class="portfolio" role="dialog" aria-modal="true" aria-labelledby="portfolio-title">
  <div class="portfolio__panel">
    <button class="portfolio__close" aria-label={dict.ui.portfolio.close}>×</button>
    <ProjectIllustration id={project.id} tags={project.tags} />
    <div class="portfolio__body">
      <span class="portfolio__kicker">{dict.ui.portfolio.kicker}</span>
      <h2 id="portfolio-title" class="portfolio__title">{project.company}</h2>
      <p class="portfolio__meta">{project.role} · {project.period} · {project.location}</p>
      <p class="portfolio__description">{project.description}</p>
      <ul class="portfolio__tags">…<li class="portfolio__tag">…</li></ul>
    </div>
    <nav class="portfolio__nav">
      <button class="portfolio__arrow" aria-label={dict.ui.portfolio.previous}>←</button>
      <ProjectStepper … />
      <button class="portfolio__arrow" aria-label={dict.ui.portfolio.next}>→</button>
    </nav>
  </div>
</div>
```

Navigation **circulaire** : `(index + 1) % total` et `(index - 1 + total) % total`.
Les flèches ne se désactivent donc jamais — un bouton grisé au premier écran
demande au joueur de deviner pourquoi.

- [ ] **Étape 3 : clavier**

Un `useEffect` sur `window` `keydown`, actif seulement quand le dialogue est
ouvert : `ArrowLeft` / `ArrowRight` naviguent, `Escape` ferme.
Appeler `event.preventDefault()` sur ces trois touches.

Note : `ArrowLeft` et `ArrowRight` sont **aussi** liées au déplacement dans
`controlMap`. Ce n'est pas un conflit — `Player.tsx` sort immédiatement de sa
boucle en pause (tâche 4, étape 4). Il n'y a donc rien à désactiver, et surtout
rien à démonter : démonter `<KeyboardControls>` perdrait l'état des touches
maintenues et le joueur repartirait en marche automatique à la fermeture.

- [ ] **Étape 4 : focus**

À l'ouverture, donner le focus au bouton de fermeture (`useEffect` + `ref`).
À la fermeture, le rendre au `document.body`. Piéger `Tab` dans le panneau en
bouclant sur le premier et le dernier élément focusable — le canvas derrière ne
doit jamais recevoir le focus pendant la pause.

- [ ] **Étape 5 : CSS**

Ajouter une section `/* --- Dialogue portfolio --- */` dans `index.css`, après
le bandeau de découverte. Points imposés :

- `.portfolio` : `position: absolute; inset: 0`, fond
  `rgba(10, 16, 12, 0.62)` et `backdrop-filter: blur(3px)` — mêmes valeurs que
  `.gameover`, pour que les deux écrans modaux se ressemblent ;
  `pointer-events: auto`.
- `.portfolio__panel` : `max-width: 860px`, grille deux colonnes
  `minmax(220px, 300px) 1fr`, qui repasse à une colonne sous 720 px.
  Fond `rgba(18, 26, 20, 0.9)`, `border-radius: 16px`.
- `.portfolio__illustration` : `width: 100%`, `height: auto`, fond en dégradé
  vertical `#2c3560` → `#6b7cba` — **les couleurs du ciel du jeu**, pour que
  l'illustration paraisse prise dans le même monde.
- `.portfolio__title` : 26 px, `--hud-fg`. `.portfolio__meta` : 12 px,
  `opacity: 0.7`. `.portfolio__tag` : pastilles arrondies, 11 px, bordure
  `rgba(255,255,255,0.18)`.
- `.portfolio__dot--active` : `#f5dc95` — la couleur du repère de monument sur
  la minimap, déjà établie.
- Animation d'ouverture de 180 ms, neutralisée sous
  `@media (prefers-reduced-motion: reduce)`, comme les deux animations
  existantes.

- [ ] **Étape 6 : monter dans `App.tsx`**

`<PortfolioDialog />` **après** `<HUD />`, hors du `<Canvas>`. Le dialogue doit
passer devant le HUD, y compris devant l'invite d'interaction.

- [ ] **Étape 7 : vérifier**

```bash
npx tsc -b && npm run build && npm run lint
```
Puis, en page :

```js
playerTransform.position.set(-22, 18.86, -46)
__store.getState().openLandmark('temple')
```
Contrôles attendus : le panneau s'ouvre ; `←`/`→` font tourner les cinq projets
en boucle ; le stepper suit ; l'illustration change à chaque projet et **ne
change pas** si l'on revient sur le même ; `Échap` ferme et
`__store.getState().phase` revient à `"playing"` ; `__gameClock.now()` est resté
figé pendant toute la durée d'ouverture ; bascule FR/EN, tout le panneau suit.

- [ ] **Étape 8 : commit**

```bash
git commit -am "feat(portfolio): dialogue des projets au Temple du Sommet"
```

---

## Tâche 8 — Documentation

**Fichiers** — Modifier : `ROADMAP.md`, `README.md`, `HANDOFF.md`

- [ ] **Étape 1 : `ROADMAP.md`**

- §1, sous « Points d'intérêt » : le temple est interactif, dialogue portfolio,
  socle i18n, phase `paused`.
- §2 : trois entrées — « libellés hors des fichiers de configuration »,
  « horloge de jeu unique », « illustration en trois bandes, transposition 2D du
  `toonGradient` ».
- §3 : rien de neuf sauf si un bug est trouvé en route — auquel cas l'y écrire,
  c'est le rôle de cette section.
- §4, priorité 3 : **cocher la double horloge**, réglée par la tâche 3.
- §6 : lignes pour `src/i18n/`, `src/state/gameClock.ts`,
  `src/components/portfolio/`.
- Ajouter en tête de §4 un lien vers ce document.

- [ ] **Étape 2 : `README.md`** — arborescence : `src/i18n/`,
  `src/components/portfolio/`, `src/state/gameClock.ts`, `docs/`.

- [ ] **Étape 3 : `HANDOFF.md`** — ajouter aux crochets de diagnostic
  `window.__i18n` et `window.__gameClock`, et à la section des pièges :
  « les délais de gameplay se lisent sur `gameClock.now()`, jamais sur
  `performance.now()` ».

- [ ] **Étape 4 : commit**

```bash
git commit -am "docs: points d'intérêt interactifs et horloge de jeu"
```

---

## Tâche 9 — Vitest sur les fonctions pures *(optionnelle)*

Aucune autre tâche n'en dépend. À faire si le propriétaire veut un filet sur la
partie logique — c'est la seule du lot qui s'y prête vraiment : projection,
motifs, formatage et horloge sont des fonctions pures sans DOM ni WebGL.

- [ ] **Étape 1** : `npm i -D vitest@^3`, script `"test": "vitest run"`.
- [ ] **Étape 2** : `src/i18n/index.test.ts` — `format` substitue, laisse
      intacte une clé absente, et gère plusieurs occurrences.
- [ ] **Étape 3** : `src/components/portfolio/illustration/motifs.test.ts` —
      `motifForTags(['Robotique'])` et `motifForTags(['Robotics'])` renvoient
      tous deux `'lattice'` ; la priorité l'emporte sur l'ordre des tags ;
      un tableau vide renvoie `'panels'`.
- [ ] **Étape 4** : `src/state/gameClock.test.ts` — `advance` cumule,
      `resetClock` remet à zéro, `now` ne recule jamais.
- [ ] **Étape 5** : `npm test` passe, puis commit.

---

## Ordre et dépendances

```
1 i18n ──► 2 UI traduite ──────────────┐
                                       ├──► 7 dialogue ──► 8 doc
3 horloge ──► 4 pause ──► 5 proximité ─┤
                                       │
6 illustration ────────────────────────┘

9 tests (optionnelle, sans dépendance)
```

Les tâches 1-2 et 3-4-5 sont **indépendantes** l'une de l'autre et peuvent être
menées en parallèle. La tâche 6 ne dépend que de `seededRandom`, déjà présent.

## Ce que ce plan ne couvre pas

- **Les autres points d'intérêt** (stèle, pyramide, statue). Le socle est prévu
  pour eux — `Landmark.section` s'élargit en union, le dialogue lit une section
  du dictionnaire — mais leur géométrie et leur mise en scène feront l'objet
  d'un plan séparé, un par lieu.
- **La récompense du temple** (cœur maximal supplémentaire), restée ouverte en
  §4 de la roadmap.
- **Le découpage du bundle**, toujours en priorité 3. Ce lot n'ajoute aucune
  dépendance, donc n'aggrave rien, mais ne l'améliore pas non plus.
- **Le contenu manquant** listé en §1 : c'est au propriétaire de trancher.
