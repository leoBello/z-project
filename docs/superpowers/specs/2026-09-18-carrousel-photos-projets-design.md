# Carrousel photo dans le panneau portfolio — design

**Date :** 2026-09-18
**Branche :** `feature/carrousel-photos-projets`
**Maquettes :** https://claude.ai/artifact/YM6ScmLSWbxa33mDwZGsyy

## Objectif

Permettre plusieurs photos par projet dans le panneau portfolio. Quand un projet
en porte plus d'une, une pellicule de vignettes défilante apparaît sous la
capture et permet d'en changer sans quitter le panneau. Un clic sur la capture
ouvre un plein écran où l'on navigue dans la même série, au clavier comme à la
souris.

Aujourd'hui un projet porte **une** capture (`screenshot`), affichée par
`SlideFigure` dans `PortfolioDialog.tsx`, avec repli sur l'illustration
isométrique générée si le fichier manque. Ce repli est conservé à l'identique.

## Non-objectifs (YAGNI)

- Pas de zoom ni de déplacement dans la photo en plein écran.
- Pas de geste de balayage tactile : les chevrons restent affichés sous
  `(hover: none)` et la pellicule est cliquable au doigt. Un `pointerdown` /
  `pointermove` maison entrerait en concurrence avec le défilement horizontal de
  la pellicule pour trois lignes de confort.
- Pas de galerie pour les autres sections (Parcours, Compétences, Contact) : ces
  diapositives n'ont pas d'images et gardent l'illustration générée.
- Pas de vidéo, pas de GIF animé.
- Pas de préchargement au-delà de la photo suivante.
- Aucune dépendance ajoutée.

## Décisions validées

| Sujet | Décision |
|---|---|
| Traitement de la vignette | Pellicule de vignettes sous la capture, trois pleines par rangée, la suivante amorcée au bord droit, la rangée défile. |
| Forme de la donnée | `screenshots: [{ src, caption }]`, qui remplace `screenshot`. |
| Clavier | `←`/`→` pilotent les diapositives dans le panneau, les photos en plein écran. `Échap` ferme le plein écran d'abord, le panneau ensuite. |
| Mesure d'audience | Un événement `project_photo_opened { project, index }` à l'ouverture du plein écran, et rien d'autre. |

Trois traitements ont été maquettés et deux écartés : le **liséré segmenté**
(lisible mais ne montre pas le contenu des autres photos) et le **voile**
(compteur en incrustation seul, trop discret au repos). La **pellicule pleine
largeur**, où toutes les vignettes tiennent quoi qu'il arrive, a été écartée
parce qu'à cinq photos chaque vignette tombe à 54 px : une capture d'interface y
devient un rectangle gris.

## Forme de la donnée

Dans `fr.json` et `en.json`, chaque entrée de `projects` remplace `screenshot`
par :

```json
"screenshots": [
  { "src": "/projects/prospeo.png",  "caption": "Fiche prospect — SIRET apparié au registre SIRENE, coordonnées et détail du score." },
  { "src": "/projects/prospeo2.png", "caption": "Le même écran en thème sombre." }
]
```

`caption` n'est pas facultatif. Elle sert deux fois : c'est le texte alternatif
de l'image, et c'est la ligne affichée sous la photo en plein écran. Un `alt`
dérivé du nom du projet (« Prospeo — Prospection automatisée ») ne dit pas ce
qu'on regarde ; une légende écrite, si.

`Dictionary` étant `typeof fr` et `DICTIONARIES_MIRROR` vérifiant le miroir dans
les deux sens, un tableau mal formé ou une clé oubliée côté anglais casse la
compilation — c'est le comportement voulu, rien à ajouter.

Un tableau vide ou absent est traité comme aujourd'hui l'était un `screenshot`
vide : repli sur `ProjectIllustration`.

### Côté `PortfolioSlide`

```ts
export interface PortfolioPhoto {
  src: string
  /** Légende. Sert d'attribut `alt` et de ligne sous la photo en plein écran. */
  caption: string
}

// remplace `image?: { src: string; alt: string }`
photos?: readonly PortfolioPhoto[]
```

`buildSlides` mappe `project.screenshots` sur `photos`, en laissant `undefined`
quand le tableau est vide.

## Architecture

Le panneau fait 300 lignes et `SlideFigure` y est déjà une fonction à part. La
figure devient le gros du travail : elle sort dans son propre fichier, avec la
pellicule et le plein écran à côté. `PortfolioDialog.tsx` ne grossit pas.

| Fichier | Rôle |
|---|---|
| `src/components/portfolio/sections.ts` | `PortfolioPhoto`, `photos` à la place de `image`. |
| `src/components/portfolio/SlideFigure.tsx` *(nouveau)* | Sort de `PortfolioDialog`. Capture courante, chevrons, bouton d'agrandissement, repli illustration, et la pellicule quand il y a plus d'une photo. |
| `src/components/portfolio/PhotoStrip.tsx` *(nouveau)* | La rangée de vignettes. Défilement automatique vers la vignette active. |
| `src/components/portfolio/PhotoLightbox.tsx` *(nouveau)* | Le plein écran : photo, légende, chevrons, pellicule, fermeture. |
| `src/components/portfolio/PortfolioDialog.tsx` | Tient l'index de photo et l'état du plein écran ; arbitre le clavier. |
| `src/components/portfolio/icons.tsx` *(nouveau)* | `CloseIcon` et `ChevronIcon`, aujourd'hui dans `PortfolioDialog`, désormais utilisés par trois fichiers. `ExpandIcon` s'y ajoute. |
| `src/index.css` | Styles de la pellicule et du plein écran. |
| `src/analytics/index.ts` | `project_photo_opened`. |
| `src/i18n/fr.json`, `en.json` | Données `screenshots` et libellés. |

### Où vit l'état

Tout dans `PortfolioPanel`, un seul endroit :

```ts
const [index, setIndex] = useState(0)      // diapositive, existant
const [photo, setPhoto] = useState(0)      // photo courante dans la diapositive
const [zoomed, setZoomed] = useState(false) // plein écran ouvert
```

Changer de diapositive remet `photo` à zéro — sinon on ouvrirait le projet
suivant sur sa troisième photo. Les deux chemins qui changent de diapositive
(`go(step)` et le clic sur une pastille) passent donc par une même fonction
`showSlide(next)` qui fait les deux `setState`.

`photo` vit dans le panneau et non dans la figure : c'est ce qui fait que fermer
le plein écran laisse la vignette sur la photo qu'on y regardait. Le plein écran
et la pellicule lisent et écrivent le même index.

### Clavier

Un seul écouteur `keydown`, celui qui existe déjà dans `PortfolioPanel`. Il
branche sur `zoomed` plutôt que d'ajouter un second écouteur qui se battrait
avec lui pour `Escape` :

| Touche | `zoomed === false` | `zoomed === true` |
|---|---|---|
| `←` / `→` | diapositive précédente / suivante | photo précédente / suivante |
| `Échap` | ferme le panneau | ferme le plein écran, le panneau reste ouvert |
| `Tab` | piège à focus sur le panneau | piège à focus sur le plein écran |

Le piège à focus existant interroge `panel.current`. Il interrogera
`lightbox.current ?? panel.current`. Le panneau reçoit en plus l'attribut
`inert` tant que `zoomed` est vrai : sans lui, ses boutons restent atteignables
au pointeur sous le voile.

Le focus part sur le bouton de fermeture du plein écran à l'ouverture, et
revient sur le bouton d'agrandissement à la fermeture.

### Repli quand une image ne charge pas

`SlideFigure` tient aujourd'hui un `failed: string | null`. Il devient un
`Set<string>` : une photo en échec sort de la liste, les autres restent, et
c'est seulement quand elles ont toutes échoué qu'on retombe sur
`ProjectIllustration`. Un projet dont une capture sur trois manque n'a pas à
perdre les deux autres.

## Mise en page

### Vignette du panneau

La capture ne bouge pas : même zone de grille `figure`, même `aspect-ratio: 4/3`,
`object-fit: cover`, `object-position: top center`, même arrondi de 14 px et même
ombre qu'aujourd'hui.

S'ajoutent, seulement si `photos.length > 1` :

- **Deux chevrons** de 30 px en incrustation aux bords gauche et droit de la
  capture, `opacity: 0` au repos, `1` au survol ou au focus dans la figure, et
  `0.9` en permanence sous `@media (hover: none)`.
- **La pellicule**, une `<ol>` sous la capture, `overflow-x: auto`, sans barre
  de défilement visible, `scroll-snap-type: x proximity`.

La règle qui tient les deux cas est une seule :

```css
.portfolio__strip-item { flex: 1 0 30%; }
```

À deux photos il reste de la place, les vignettes s'étalent et prennent la moitié
de la colonne (≈ 142 px). À cinq il n'y en a plus, elles restent à 30 % (≈ 87 px),
trois tiennent en entier et la quatrième est amorcée au bord droit — c'est
l'amorce qui annonce qu'il y en a d'autres, sans ajouter de chrome.

La vignette active porte un liseré doré `inset 0 0 0 1.5px #f5dc95` et
`opacity: 1` ; les autres `opacity: 0.42`. Changer de photo au chevron ou au
clavier fait défiler la rangée jusqu'à la vignette active
(`scrollIntoView({ block: 'nearest', inline: 'nearest' })`).

**Le bouton d'agrandissement** (quatre coins, 26 px, bas-droit de la capture)
est présent même à une seule photo : une capture unique mérite aussi d'être vue
en grand. La capture entière est le bouton ; l'icône n'est qu'un indice.

### Distinction d'avec le bas du panneau

Le pied du panneau porte déjà des pastilles rondes et deux chevrons pour les
sept diapositives. Rien dans la figure ne doit leur ressembler : c'est la raison
pour laquelle la pellicule montre des images et non des points, et pour laquelle
aucun compteur numérique n'est ajouté sous la capture.

### Plein écran

Un calque au-dessus du panneau, voile
`radial-gradient(120% 90% at 50% 42%, rgba(9,14,11,.93), rgba(3,6,4,.985))` et
`backdrop-filter: blur(10px)` — même grammaire que le voile du panneau, plus
sombre.

De haut en bas : le nom du projet en doré et la position `2 / 4`, à droite un
bouton de fermeture de 44 px ; la photo en `object-fit: contain`, jamais
recadrée, 1080 px de large et 560 px de haut au maximum ; la légende ; la
pellicule, ici à 116 px par vignette, largeur où une capture d'interface
redevient lisible ; et un rappel discret `← → naviguer · Échap fermer`.

Deux chevrons de 54 px aux bords de la zone image. Un clic sur le voile, hors
photo et hors pellicule, ferme.

### Mobile (≤ 720 px)

La règle existante fait déjà passer la figure au-dessus du texte, centrée et
limitée à 260 px. La pellicule suit : `flex: 1 0 30%` y donne des vignettes de
78 px à cinq photos, 127 px à deux. Les chevrons restent affichés.

En plein écran sur mobile, la pellicule disparaît et les deux chevrons passent
en bas, à 48 px, de part et d'autre du compteur — à portée du pouce plutôt qu'aux
bords de l'écran.

## Libellés i18n

Ajouts sous `ui.portfolio`, en français et en anglais :

| Clé | Français |
|---|---|
| `photoPrevious` | Photo précédente |
| `photoNext` | Photo suivante |
| `photoSelect` | Voir la photo {current} sur {total} |
| `photoOpen` | Agrandir la photo |
| `photoClose` | Fermer le plein écran |
| `photoHint` | ← → naviguer · Échap fermer |

`ui.portfolio.position` reste réservé aux diapositives.

## Mesure d'audience

Une entrée dans `Events` :

```ts
/**
 * Une capture de projet est ouverte en plein écran.
 *
 * Répond à la seule question que posent les captures : est-ce qu'on les
 * regarde. L'index dit si les gens vont au-delà de la première.
 */
project_photo_opened: { project: string; index: number }
```

Émis à l'ouverture du plein écran seulement, jamais à chaque changement de
photo : l'offre gratuite d'Umami compte les événements, et parcourir une série
de cinq en produirait cinq pour une seule intention.

## Vérification

- `npm run build` (`tsc -b && vite build`) passe — c'est ce qui vérifie le
  miroir `fr` / `en`.
- `npm run lint` (oxlint) passe.
- À la main, dans le panneau Projets :
  - un projet à deux photos montre la pellicule et les chevrons ;
  - un projet à une seule photo n'en montre aucun, mais la capture s'agrandit ;
  - `←`/`→` changent de diapositive, jamais de photo ;
  - en plein écran, `←`/`→` changent de photo et `Échap` ne ferme que lui ;
  - le focus revient sur le bouton d'agrandissement à la fermeture ;
  - une `src` invalide fait disparaître cette photo seule ;
  - à 390 px de large, la figure est centrée et les chevrons sont visibles.

## Points à traiter avant ou pendant

1. **`signFlow2.png` porte une majuscule.** Les trois autres fichiers sont en
   minuscules. Vercel sert depuis un système de fichiers sensible à la casse :
   une `src` écrite `/projects/signflow2.png` renverrait 404 en production alors
   qu'elle marche en développement sous Windows. À renommer en
   `signflow-2.png`, et à référencer exactement.
2. **`prospeo.png` et `prospeo2.png` sont le même écran**, en thème clair puis
   sombre. En carrousel, deux photos identiques au thème près se lisent comme un
   clignotement. Deux issues : assumer la paire et l'écrire dans les légendes
   (« Le même écran en thème sombre »), ce que fait la maquette, ou remplacer la
   deuxième par un autre écran du produit. La paire SignFlow, elle, montre bien
   deux écrans différents — la liste puis le détail d'une offre.
3. **Poids.** Les quatre PNG font 750 ko à eux seuls. Ils sont dans `public/`,
   donc hors bundle et chargés à la demande, mais une conversion en WebP les
   diviserait par cinq. Hors périmètre de ce lot.
