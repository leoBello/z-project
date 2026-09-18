# Carrousel photo des panneaux projet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre plusieurs photos par projet dans le panneau portfolio, avec une pellicule de vignettes défilante sous la capture et un plein écran où l'on navigue dans la même série.

**Architecture:** Le panneau (`PortfolioPanel`) devient la seule source de vérité : il tient l'index de diapositive, l'index de photo, l'ensemble des photos en échec de chargement et l'état du plein écran. Trois composants présentationnels lisent cet état — `SlideFigure` (la capture, ses chevrons, son bouton d'agrandissement), `PhotoStrip` (la rangée de vignettes, réutilisée telle quelle dans les deux écrans) et `PhotoLightbox` (le plein écran). Un seul écouteur `keydown`, celui qui existe déjà, branche sur l'état `zoomed` plutôt que d'en ajouter un second qui se battrait pour `Escape`.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax`, `noUnusedLocals`), Vite, zustand. Pas de test runner dans le repo : la vérification est `npm run build` (qui inclut `tsc -b`), `npm run lint` (oxlint) et des contrôles manuels dans le navigateur.

**Spec :** `docs/superpowers/specs/2026-09-18-carrousel-photos-projets-design.md`
**Maquettes :** https://claude.ai/artifact/YM6ScmLSWbxa33mDwZGsyy

## Global Constraints

- **Aucune dépendance ajoutée** — `package.json` reste inchangé.
- **i18n en miroir** : toute clé ajoutée à `src/i18n/fr.json` doit l'être à l'identique (même forme) dans `src/i18n/en.json`. `DICTIONARIES_MIRROR` dans `src/i18n/index.ts` casse la compilation sinon. Le français fait foi.
- **Nommage BEM existant** : `.portfolio__*` pour ce qui vit dans le panneau, `.lightbox__*` pour le plein écran, qui est un bloc à part comme `.gameover`.
- **Doré du jeu = `#f5dc95`**, valeur exacte, celle des pastilles du stepper et du repère de monument. Texte du HUD = `var(--hud-fg)`.
- **Les chevrons de photo et le bouton d'agrandissement ne doivent jamais ressembler aux pastilles rondes du pied de panneau** : celles-ci pilotent les 7 diapositives, pas les photos.
- **Sous `@media (hover: none)`**, tout ce qui n'apparaît qu'au survol doit être visible en permanence — il n'y a pas de survol au doigt.
- **TypeScript** : imports de types via `import type` (`verbatimModuleSyntax`). Aucune variable ni aucun paramètre inutilisé (`noUnusedLocals`, `noUnusedParameters`).
- **Commentaires en français**, au niveau de densité du fichier voisin : ils expliquent *pourquoi*, jamais *quoi*.
- **Vérification de fin de tâche** : `npm run build` et `npm run lint` passent, plus les contrôles manuels listés dans la tâche. `npm run dev` sert sur http://localhost:5173.
- **Pour atteindre le panneau en développement** : ouvrir le jeu, puis utiliser le menu de téléportation pour aller au lieu « Projets ». La console expose `__i18n` pour changer de langue sans cliquer.

---

## File Structure

| Fichier | Création / Modif | Responsabilité |
|---|---|---|
| `public/projects/signflow-2.png` | Renommer depuis `signFlow2.png` | Casse cohérente avec les trois autres fichiers. Vercel sert depuis un FS sensible à la casse. |
| `src/i18n/fr.json` / `en.json` | Modifier | `projects[].screenshots` remplace `screenshot`. Six libellés sous `ui.portfolio`. |
| `src/components/portfolio/sections.ts` | Modifier | `PortfolioPhoto`, champ `photos` à la place de `image`. |
| `src/components/portfolio/icons.tsx` | Créer | `CloseIcon`, `ChevronIcon` (sortis de `PortfolioDialog`) et `ExpandIcon`. Trois fichiers les utilisent désormais. |
| `src/components/portfolio/SlideFigure.tsx` | Créer | La capture courante, ses deux chevrons, son bouton d'agrandissement, le repli illustration. Purement présentationnel. |
| `src/components/portfolio/PhotoStrip.tsx` | Créer | La rangée de vignettes, avec défilement automatique vers l'active. Deux variantes de style, une seule logique. |
| `src/components/portfolio/PhotoLightbox.tsx` | Créer | Le plein écran : photo, légende, chevrons, pellicule, fermeture. |
| `src/components/portfolio/PortfolioDialog.tsx` | Modifier | Tient `index`, `photo`, `failed`, `zoomed`. Arbitre le clavier et le piège à focus. |
| `src/index.css` | Modifier | Sections « Carrousel photo du panneau » et « Photo en plein écran ». |
| `src/analytics/index.ts` | Modifier | Événement `project_photo_opened`. |

---

## Task 1 : la donnée porte plusieurs photos

Le panneau continue d'afficher une seule capture, la première. Cette tâche ne change rien à l'écran : elle change la forme de la donnée et le type, de sorte que les tâches suivantes n'aient plus qu'à consommer un tableau.

**Files:**
- Rename: `public/projects/signFlow2.png` → `public/projects/signflow-2.png`
- Modify: `src/i18n/fr.json:150-176`, `src/i18n/en.json:150-176`
- Modify: `src/components/portfolio/sections.ts:19-50`, `:74-95`
- Modify: `src/components/portfolio/PortfolioDialog.tsx:12-45`

**Interfaces:**
- Produces: `PortfolioPhoto { src: string; caption: string }` exporté depuis `sections.ts` ; `PortfolioSlide.photos?: readonly PortfolioPhoto[]`. Les tâches 3 et 4 en dépendent.

- [ ] **Step 1 : renommer la capture SignFlow**

Le fichier est encore non suivi par git, donc `mv` et non `git mv`.

```bash
mv public/projects/signFlow2.png public/projects/signflow-2.png
ls public/projects/
```

Attendu : `prospeo.png  prospeo2.png  signflow-2.png  signflow.png`

- [ ] **Step 2 : remplacer `screenshot` par `screenshots` dans `fr.json`**

Dans `src/i18n/fr.json`, l'entrée `projects[0]` (`prospeo`), remplacer la ligne 156 :

```json
      "screenshot": "/projects/prospeo.png",
```

par :

```json
      "screenshots": [
        {
          "src": "/projects/prospeo.png",
          "caption": "Fiche prospect — SIRET apparié au registre SIRENE, coordonnées, présence web, et le détail du score sur 100 ligne par ligne."
        },
        {
          "src": "/projects/prospeo2.png",
          "caption": "Le même écran en thème sombre : le produit suit le thème du système."
        }
      ],
```

Et l'entrée `projects[1]` (`signflow`), remplacer la ligne 167 :

```json
      "screenshot": "/projects/signflow.png",
```

par :

```json
      "screenshots": [
        {
          "src": "/projects/signflow.png",
          "caption": "Le brief du matin : les offres du jour au-dessus du seuil, puis toute la veille avec ses filtres."
        },
        {
          "src": "/projects/signflow-2.png",
          "caption": "Le détail d'une offre — son rang, les critères qui l'ont produit, et où en est la candidature."
        }
      ],
```

- [ ] **Step 3 : faire le même remplacement dans `en.json`**

Mêmes emplacements, mêmes `src`, légendes traduites :

```json
      "screenshots": [
        {
          "src": "/projects/prospeo.png",
          "caption": "Prospect record — SIRET matched against the SIRENE registry, contact details, web presence, and the score broken down line by line."
        },
        {
          "src": "/projects/prospeo2.png",
          "caption": "The same screen in dark theme: the product follows the system theme."
        }
      ],
```

```json
      "screenshots": [
        {
          "src": "/projects/signflow.png",
          "caption": "The morning brief: today's listings above the threshold, then the whole watch list with its filters."
        },
        {
          "src": "/projects/signflow-2.png",
          "caption": "One listing in detail — its rank, the criteria that produced it, and where the application stands."
        }
      ],
```

- [ ] **Step 4 : déclarer le type dans `sections.ts`**

Dans `src/components/portfolio/sections.ts`, sous `PortfolioLink` (ligne 19), ajouter :

```ts
export interface PortfolioPhoto {
  /** Chemin servi depuis `public/`. Sensible à la casse en production. */
  src: string
  /**
   * Légende de la photo.
   *
   * Elle sert deux fois : attribut `alt` de l'image, et ligne affichée sous la
   * photo en plein écran. Un `alt` dérivé du nom du projet — « Prospeo —
   * Prospection automatisée » — ne dit pas ce qu'on regarde ; une légende
   * écrite, si.
   */
  caption: string
}
```

Puis dans `PortfolioSlide`, remplacer le champ `image` et son commentaire (lignes 36-45 environ) par :

```ts
  /**
   * Captures du produit, quand il y en a.
   *
   * Elles prennent la place de l'illustration générée — montrer les écrans
   * réels d'un produit qu'on a mis en ligne dit plus qu'un motif isométrique,
   * mais seulement pour les produits personnels : une mission client n'a pas
   * d'écran qu'on puisse publier.
   *
   * Plusieurs plutôt qu'une : un produit ne se raconte pas depuis un seul
   * écran, et le panneau sait maintenant les faire défiler.
   */
  photos?: readonly PortfolioPhoto[]
```

- [ ] **Step 5 : alimenter `photos` dans `buildSlides`**

Toujours dans `sections.ts`, cas `'projects'`, remplacer les trois lignes `image:` :

```ts
        // Chemin vide = pas de capture disponible, on retombe sur l'illustration.
        image: project.screenshot
          ? { src: project.screenshot, alt: `${project.name} — ${project.tagline}` }
          : undefined,
```

par :

```ts
        // Tableau vide = pas de capture disponible, on retombe sur
        // l'illustration. `undefined` plutôt qu'un tableau vide : le panneau
        // n'a alors qu'un seul cas d'absence à connaître.
        photos: project.screenshots.length > 0 ? project.screenshots : undefined,
```

- [ ] **Step 6 : adapter `SlideFigure` sans changer ce qu'on voit**

Dans `src/components/portfolio/PortfolioDialog.tsx`, remplacer le corps de `SlideFigure` (lignes 20-45) par :

```tsx
function SlideFigure({ slide }: { slide: PortfolioSlide }) {
  // Un `Set` et non un seul chemin : une capture en échec ne doit pas faire
  // tomber les autres avec elle.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const photos = slide.photos?.filter((photo) => !failed.has(photo.src)) ?? []
  const photo = photos[0]

  if (photo) {
    return (
      <img
        className="portfolio__shot"
        src={photo.src}
        alt={photo.caption}
        loading="lazy"
        decoding="async"
        onError={() => setFailed((previous) => new Set(previous).add(photo.src))}
      />
    )
  }

  return (
    <ProjectIllustration
      id={slide.id}
      tags={slide.tags}
      index={slide.accentIndex}
      motif={slide.motif}
    />
  )
}
```

- [ ] **Step 7 : vérifier la compilation et le lint**

```bash
npm run build && npm run lint
```

Attendu : build réussi, aucune erreur oxlint. Si `tsc` se plaint d'une clé manquante dans `en.json`, c'est `DICTIONARIES_MIRROR` qui fait son travail — comparer les deux fichiers.

- [ ] **Step 8 : vérifier à l'écran**

```bash
npm run dev
```

Ouvrir le jeu, téléporter au lieu « Projets ». Attendu : le panneau est **exactement** comme avant — capture Prospeo, puis SignFlow à la diapositive suivante. Aucune vignette, aucun chevron : c'est normal à ce stade.

- [ ] **Step 9 : commit**

```bash
git add public/projects src/i18n/fr.json src/i18n/en.json src/components/portfolio/sections.ts src/components/portfolio/PortfolioDialog.tsx
git commit -m "feat: chaque projet porte plusieurs captures

Le champ screenshot devient screenshots, un tableau de { src, caption }.
La legende n'est pas facultative : elle sert d'attribut alt et de ligne
sous la photo en plein ecran, la ou un alt derive du nom du projet ne
dirait pas ce qu'on regarde.

signFlow2.png est renomme signflow-2.png : Vercel sert depuis un systeme
de fichiers sensible a la casse, la majuscule aurait tenu en local et
renvoye 404 en production.

L'ecran ne change pas encore : le panneau affiche la premiere photo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2 : icônes partagées

`CloseIcon` et `ChevronIcon` vivent dans `PortfolioDialog.tsx`. Trois fichiers vont en avoir besoin. Refactoring pur : rien ne change à l'écran.

**Files:**
- Create: `src/components/portfolio/icons.tsx`
- Modify: `src/components/portfolio/PortfolioDialog.tsx:48-86`

**Interfaces:**
- Produces: `CloseIcon()`, `ChevronIcon({ direction: 'left' | 'right' })`, `ExpandIcon()`. Les tâches 3 et 4 les importent.

- [ ] **Step 1 : créer `icons.tsx`**

```tsx
/*
  Glyphes tracés plutôt que typographiés.

  Les caractères `×`, `←` et `→` n'occupent pas le centre de leur cadratin et
  varient d'une police système à l'autre : dans un bouton rond, ils tombent
  toujours un peu haut et un peu à gauche, et aucun réglage de `line-height` ne
  rattrape ça de façon portable. Un tracé SVG, lui, est centré par construction.

  Sortis du panneau le jour où le carrousel photo est arrivé : le plein écran et
  la figure en avaient besoin aussi, et trois copies d'un même chemin SVG sont
  trois occasions d'en corriger une seule.
*/

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={direction === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Quatre coins écartés. Dit « ça s'ouvre en grand » sans mot, et ne ressemble
 * à aucun autre bouton du panneau — surtout pas aux chevrons, qui déplacent
 * au lieu d'agrandir.
 */
export function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```

- [ ] **Step 2 : retirer les deux fonctions de `PortfolioDialog.tsx`**

Supprimer le bloc de commentaire « Glyphes tracés plutôt que typographiés » et les fonctions `CloseIcon` et `ChevronIcon` (lignes 48-86). Ajouter l'import en tête de fichier, après l'import de `ProjectIllustration` :

```tsx
import { ChevronIcon, CloseIcon } from './icons'
```

- [ ] **Step 3 : vérifier**

```bash
npm run build && npm run lint
```

Attendu : build réussi. Rien ne change à l'écran — c'est le but.

- [ ] **Step 4 : commit**

```bash
git add src/components/portfolio/icons.tsx src/components/portfolio/PortfolioDialog.tsx
git commit -m "refactor: les glyphes du panneau sortent dans icons.tsx

Le plein ecran et la figure vont s'en servir aussi. Trois copies d'un
meme chemin SVG sont trois occasions d'en corriger une seule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3 : la pellicule dans le panneau

À la fin de cette tâche, un projet à deux photos montre une rangée de vignettes et deux chevrons sur la capture, et on navigue entre les photos sans quitter le panneau. Le plein écran n'existe pas encore.

**Files:**
- Create: `src/components/portfolio/PhotoStrip.tsx`
- Create: `src/components/portfolio/SlideFigure.tsx`
- Modify: `src/components/portfolio/PortfolioDialog.tsx`
- Modify: `src/i18n/fr.json`, `src/i18n/en.json` (bloc `ui.portfolio`)
- Modify: `src/index.css` (après la règle `.portfolio__illustration`, et dans les deux media queries de fin de section)

**Interfaces:**
- Consumes: `PortfolioPhoto` (tâche 1), `ChevronIcon`, `ExpandIcon` (tâche 2).
- Produces: `PhotoStrip({ photos, current, onSelect, variant })` et `SlideFigure({ slide, photos, current, onSelect, onOpen, onFailed, openRef })`. La tâche 4 réutilise `PhotoStrip` avec `variant="lightbox"` et ne touche pas à `SlideFigure`.

- [ ] **Step 1 : ajouter les libellés dans `fr.json`**

Dans `src/i18n/fr.json`, bloc `ui.portfolio`, après `"position": "{current} sur {total}"` — ajouter une virgule à cette ligne :

```json
      "photoPrevious": "Photo précédente",
      "photoNext": "Photo suivante",
      "photoSelect": "Voir la photo {current} sur {total}",
      "photoOpen": "Agrandir la photo",
      "photoClose": "Fermer le plein écran",
      "photoHint": "← → naviguer · Échap fermer"
```

- [ ] **Step 2 : ajouter les mêmes clés dans `en.json`**

```json
      "photoPrevious": "Previous photo",
      "photoNext": "Next photo",
      "photoSelect": "View photo {current} of {total}",
      "photoOpen": "Enlarge photo",
      "photoClose": "Close full screen",
      "photoHint": "← → navigate · Esc to close"
```

- [ ] **Step 3 : créer `PhotoStrip.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { format } from '../../i18n'
import { useI18n } from '../../i18n/useI18n'
import type { PortfolioPhoto } from './sections'

interface PhotoStripProps {
  photos: readonly PortfolioPhoto[]
  /** Index de la photo courante, à partir de 0. */
  current: number
  onSelect: (index: number) => void
  /** `panel` dans la colonne figure, `lightbox` par-dessus. */
  variant?: 'panel' | 'lightbox'
}

/**
 * Rangée de vignettes du carrousel photo.
 *
 * Des images et non des points : le pied du panneau porte déjà des pastilles
 * rondes pour les diapositives, et deux rangées de points sur le même écran ne
 * diraient plus lequel on pilote. Une vignette dit en plus *ce qu'il y a* dans
 * la photo suivante, ce qu'aucun point ne fait.
 *
 * La rangée déborde à partir de quatre photos et défile. L'amorce de la
 * vignette suivante au bord droit est ce qui l'annonce — c'est aussi pour ça
 * que la barre de défilement est masquée : elle couperait la rangée en deux
 * pour dire la même chose, en moins joli.
 */
export function PhotoStrip({ photos, current, onSelect, variant = 'panel' }: PhotoStripProps) {
  const { dict } = useI18n()
  const active = useRef<HTMLLIElement>(null)

  // Changer de photo au chevron ou au clavier doit amener sa vignette sous les
  // yeux : sans ça, le liseré doré se pose hors champ et la rangée paraît
  // n'avoir pas bougé. `nearest` sur les deux axes pour ne déplacer que ce
  // qu'il faut — le panneau lui-même défile, et on ne veut pas l'emporter.
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])

  return (
    <ol className={`portfolio__strip portfolio__strip--${variant}`}>
      {photos.map((photo, index) => {
        const isActive = index === current
        return (
          <li
            key={photo.src}
            ref={isActive ? active : null}
            className="portfolio__strip-item"
          >
            <button
              type="button"
              className={`portfolio__thumb${isActive ? ' portfolio__thumb--active' : ''}`}
              // `aria-current` dit *laquelle* est affichée ; sans lui, un
              // lecteur d'écran ne verrait qu'une suite de boutons numérotés.
              aria-current={isActive ? 'true' : undefined}
              aria-label={format(dict.ui.portfolio.photoSelect, {
                current: index + 1,
                total: photos.length,
              })}
              onClick={() => onSelect(index)}
            >
              {/* `alt` vide : le bouton porte déjà le libellé, et une vignette
                  annoncée deux fois est une vignette annoncée en trop. */}
              <img src={photo.src} alt="" loading="lazy" decoding="async" />
            </button>
          </li>
        )
      })}
    </ol>
  )
}
```

- [ ] **Step 4 : créer `SlideFigure.tsx`**

```tsx
import type { RefObject } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { ChevronIcon, ExpandIcon } from './icons'
import { PhotoStrip } from './PhotoStrip'
import { ProjectIllustration } from './ProjectIllustration'
import type { PortfolioPhoto, PortfolioSlide } from './sections'

interface SlideFigureProps {
  slide: PortfolioSlide
  /** Photos encore chargeables. Filtrées par le panneau, pas ici. */
  photos: readonly PortfolioPhoto[]
  current: number
  onSelect: (index: number) => void
  onOpen: () => void
  onFailed: (src: string) => void
  /** Le panneau y rend le focus quand le plein écran se ferme. */
  openRef: RefObject<HTMLButtonElement | null>
}

/**
 * La figure de la diapositive : capture du produit si le contenu en fournit
 * une, illustration générée sinon.
 *
 * Le repli ne sert pas qu'aux diapositives sans capture — un fichier absent ou
 * illisible y bascule aussi. La figure occupe une zone de la grille du
 * panneau : la laisser vide y ouvrirait un trou, alors que le motif
 * isométrique, lui, ne dépend d'aucun fichier et est toujours calculable.
 *
 * Purement présentationnel : l'index courant, les échecs de chargement et
 * l'ouverture du plein écran sont au panneau. C'est ce qui permet au plein
 * écran de partager exactement la même photo que la vignette.
 */
export function SlideFigure({
  slide,
  photos,
  current,
  onSelect,
  onOpen,
  onFailed,
  openRef,
}: SlideFigureProps) {
  const { dict } = useI18n()

  if (photos.length === 0) {
    return (
      <ProjectIllustration
        id={slide.id}
        tags={slide.tags}
        index={slide.accentIndex}
        motif={slide.motif}
      />
    )
  }

  const photo = photos[current]
  // Une seule photo : ni chevrons ni pellicule. Des contrôles de navigation
  // devant un contenu unique ne font que poser la question de ce qu'ils sont
  // censés faire — la même règle qu'au pied du panneau.
  const many = photos.length > 1
  const go = (step: number) => onSelect((current + step + photos.length) % photos.length)

  return (
    <div className="portfolio__figure">
      <div className="portfolio__frame">
        {/*
          Toute la capture est la cible d'agrandissement. Viser une icône de
          26 px quand on a 290 px d'image sous le curseur n'aurait aucun sens ;
          l'icône n'est qu'un indice de ce que fait le clic.
        */}
        <button
          ref={openRef}
          type="button"
          className="portfolio__open"
          aria-label={dict.ui.portfolio.photoOpen}
          onClick={onOpen}
        >
          <img
            className="portfolio__shot"
            src={photo.src}
            alt={photo.caption}
            loading="lazy"
            decoding="async"
            onError={() => onFailed(photo.src)}
          />
          <span className="portfolio__expand" aria-hidden="true">
            <ExpandIcon />
          </span>
        </button>

        {/*
          Les chevrons sont frères du bouton, pas ses enfants : un bouton dans
          un bouton n'est pas du HTML valide, et le clic du plus petit serait
          avalé par le plus grand.
        */}
        {many && (
          <>
            <button
              type="button"
              className="portfolio__photo-arrow portfolio__photo-arrow--prev"
              aria-label={dict.ui.portfolio.photoPrevious}
              onClick={() => go(-1)}
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              className="portfolio__photo-arrow portfolio__photo-arrow--next"
              aria-label={dict.ui.portfolio.photoNext}
              onClick={() => go(1)}
            >
              <ChevronIcon direction="right" />
            </button>
          </>
        )}
      </div>

      {many && <PhotoStrip photos={photos} current={current} onSelect={onSelect} />}
    </div>
  )
}
```

- [ ] **Step 5 : brancher le panneau**

Dans `src/components/portfolio/PortfolioDialog.tsx` :

Supprimer entièrement la fonction locale `SlideFigure` (celle laissée par la tâche 1) et les imports devenus inutiles (`ProjectIllustration`). Les imports en tête deviennent :

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { linkTarget, track } from '../../analytics'
import { landmarkById, type PortfolioSection } from '../../config/landmarks'
import { format } from '../../i18n'
import { useI18n } from '../../i18n/useI18n'
import { useGameStore } from '../../store/useGameStore'
import { CloseIcon } from './icons'
import { ProjectStepper } from './ProjectStepper'
import { SlideFigure } from './SlideFigure'
import { buildSlides } from './sections'
```

Dans `PortfolioPanel`, juste après `const [index, setIndex] = useState(0)`, ajouter :

```tsx
  const [photo, setPhoto] = useState(0)
  // Un `Set` partagé par toutes les diapositives : un chemin est unique à un
  // projet, et une capture morte le reste quand on revient dessus.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const openButton = useRef<HTMLButtonElement>(null)
```

Après `const slides = useMemo(...)` et `const total = slides.length`, mais **avant** le `if (total === 0) return null`, on ne peut rien calculer qui dépende de `slide`. Déplacer le calcul des photos après `const slide = slides[index]`, en bas du composant — c'est du code de rendu, pas un hook :

```tsx
  const slide = slides[index]
  // Une capture en échec sort de la liste, les autres restent : un projet dont
  // un fichier sur trois manque n'a pas à perdre les deux autres.
  const photos = slide.photos?.filter((one) => !failed.has(one.src)) ?? []
  // La liste a pu rétrécir sous l'index : on le borne ici plutôt que de laisser
  // passer un `undefined` jusqu'à `<img src>`.
  const current = photos.length > 0 ? Math.min(photo, photos.length - 1) : 0
```

Remplacer `go` par une version qui remet la photo à zéro, et ajouter `showSlide` :

```tsx
  // Navigation circulaire : une flèche grisée au premier écran oblige le joueur
  // à deviner pourquoi elle ne répond pas.
  //
  // Les deux chemins remettent la photo à zéro — sans ça, on ouvrirait le
  // projet suivant sur la troisième photo du précédent.
  const go = useCallback(
    (step: number) => {
      setIndex((previous) => (previous + step + total) % total)
      setPhoto(0)
    },
    [total],
  )

  const showSlide = useCallback((next: number) => {
    setIndex(next)
    setPhoto(0)
  }, [])

  const markFailed = useCallback((src: string) => {
    setFailed((previous) => new Set(previous).add(src))
  }, [])
```

Remplacer l'appel `<SlideFigure slide={slide} />` par :

```tsx
        <SlideFigure
          slide={slide}
          photos={photos}
          current={current}
          onSelect={setPhoto}
          onOpen={() => undefined}
          onFailed={markFailed}
          openRef={openButton}
        />
```

`onOpen` ne fait rien à ce stade : la tâche 4 le remplit. Et brancher le stepper sur `showSlide` :

```tsx
            <ProjectStepper total={total} current={index} onSelect={showSlide} />
```

- [ ] **Step 6 : ajouter le CSS de la pellicule**

Dans `src/index.css`, juste après la règle `.portfolio__illustration { … }` et avant `.portfolio__body { … }`, insérer :

```css
/* --- Carrousel photo du panneau -------------------------------------------- */

/*
  La capture occupait la zone `figure` toute seule. Elle a maintenant un
  contenant — capture, chevrons, pellicule — qui prend sa place dans la grille.
  L'illustration générée, elle, continue d'y aller directement : c'est le seul
  cas où la figure n'a rien autour d'elle.
*/
.portfolio__figure {
  grid-area: figure;
  align-self: start;
  min-width: 0;
}

.portfolio__frame {
  position: relative;
}

/*
  Le cadre de la capture est porté par le bouton et non par l'image : c'est lui
  qu'on survole, lui qui reçoit le focus, et c'est sa découpe qui doit retenir
  le léger agrandissement de l'image au survol.
*/
.portfolio__open {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 14px;
  overflow: hidden;
  background: #101712;
  box-shadow:
    0 10px 26px rgba(0, 0, 0, 0.32),
    inset 0 0 0 1px rgba(255, 255, 255, 0.09);
}

/*
  Quatre coins, en bas à droite, discrets au repos. Ils disent que la capture
  s'ouvre en grand sans mettre un bouton en travers de l'image.
*/
.portfolio__expand {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(8, 12, 9, 0.6);
  backdrop-filter: blur(6px);
  color: var(--hud-fg);
  opacity: 0.45;
  transition: opacity 180ms ease, background 140ms ease;
}

.portfolio__expand svg {
  display: block;
  width: 13px;
  height: 13px;
}

.portfolio__open:hover .portfolio__expand,
.portfolio__open:focus-visible .portfolio__expand {
  opacity: 1;
  background: rgba(8, 12, 9, 0.8);
}

/*
  Chevrons de photo : ronds comme ceux du pied de panneau mais 10 px plus
  petits, posés sur l'image et invisibles au repos. Ils ne doivent pas
  concurrencer la navigation entre diapositives, qui est la navigation
  principale du panneau.
*/
.portfolio__photo-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  background: rgba(8, 12, 9, 0.62);
  backdrop-filter: blur(6px);
  color: var(--hud-fg);
  opacity: 0;
  transition: opacity 180ms ease, background 140ms ease, border-color 140ms ease,
    color 140ms ease;
}

.portfolio__photo-arrow--prev { left: 8px; }
.portfolio__photo-arrow--next { right: 8px; }

.portfolio__photo-arrow svg {
  display: block;
  width: 15px;
  height: 15px;
}

/* `focus-within` et pas seulement `hover` : au clavier, les chevrons doivent
   apparaître quand la tabulation entre dans la figure. */
.portfolio__frame:hover .portfolio__photo-arrow,
.portfolio__frame:focus-within .portfolio__photo-arrow {
  opacity: 1;
}

.portfolio__photo-arrow:hover {
  background: rgba(245, 220, 149, 0.16);
  border-color: rgba(245, 220, 149, 0.5);
  color: #f5dc95;
}

/* La rangée de vignettes. */
.portfolio__strip {
  display: flex;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scroll-behavior: smooth;
  /* La barre système, claire et épaisse, couperait la rangée en deux pour dire
     ce que l'amorce de la vignette suivante dit déjà. */
  scrollbar-width: none;
}

.portfolio__strip::-webkit-scrollbar { display: none; }

/*
  Une seule règle pour les deux cas de figure.

  `flex-basis: 30%` : trois vignettes pleines par rangée et la quatrième
  amorcée au bord droit quand il y a beaucoup de photos — c'est cette amorce
  qui annonce qu'il y en a d'autres, sans ajouter de chrome.

  `flex-grow: 1` : quand il en reste peu, elles occupent toute la largeur. À
  deux photos chacune prend la moitié de la colonne, 142 px au lieu de 87 —
  une capture d'interface y est encore lisible.

  `flex-shrink: 0` : sans lui, cinq vignettes se tasseraient à 54 px au lieu de
  déborder, et redeviendraient les rectangles gris qu'on cherche à éviter.
*/
.portfolio__strip-item {
  flex: 1 0 30%;
  display: flex;
  scroll-snap-align: start;
}

.portfolio__thumb {
  flex-grow: 1;
  padding: 0;
  border: none;
  border-radius: 8px;
  overflow: hidden;
  background: #101712;
  opacity: 0.42;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  transition: opacity 160ms ease, box-shadow 160ms ease;
}

.portfolio__thumb img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  /* Le haut d'une capture — en-tête et premières cartes — est ce à quoi on
     reconnaît un écran. Le même cadrage que la grande capture. */
  object-position: top center;
}

.portfolio__thumb:hover { opacity: 0.75; }

/* Liseré doré plutôt qu'une bordure ajoutée : `inset` ne prend pas de place et
   la rangée ne sursaute pas d'une vignette à l'autre. Même doré que la pastille
   courante du stepper — c'est le même code couleur pour « vous êtes ici ». */
.portfolio__thumb--active,
.portfolio__thumb--active:hover {
  opacity: 1;
  box-shadow: inset 0 0 0 1.5px #f5dc95;
}

/* Pas de survol au doigt : ce qui ne se montre qu'au survol ne se montrerait
   jamais. */
@media (hover: none) {
  .portfolio__photo-arrow,
  .portfolio__expand { opacity: 0.9; }
}
```

- [ ] **Step 7 : modifier `.portfolio__shot` et les deux media queries**

La capture n'est plus l'élément de grille et n'a plus à porter le cadre — le bouton le porte. Remplacer la règle `.portfolio__shot { … }` existante (et garder son commentaire au-dessus) par :

```css
.portfolio__shot {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  object-position: top center;
  transition: transform 300ms cubic-bezier(0.22, 0.8, 0.28, 1);
}

/* Un glissement d'échelle, pas un saut : la capture répond au survol sans
   quitter son cadre, que `overflow: hidden` sur le bouton retient. */
.portfolio__open:hover .portfolio__shot {
  transform: scale(1.02);
}
```

Dans `@media (max-width: 720px)`, remplacer :

```css
  .portfolio__illustration,
  .portfolio__shot { max-width: 260px; justify-self: center; }
```

par :

```css
  .portfolio__illustration,
  .portfolio__figure { max-width: 260px; justify-self: center; }
```

Dans `@media (prefers-reduced-motion: reduce)`, ajouter à la liste des sélecteurs qui suppriment les transitions :

```css
  .portfolio__shot,
  .portfolio__expand,
  .portfolio__photo-arrow,
  .portfolio__thumb { transition: none; }
  .portfolio__strip { scroll-behavior: auto; }
```

- [ ] **Step 8 : ajouter les contours de focus**

Dans la règle existante qui groupe `.portfolio__close:focus-visible, .portfolio__arrow:focus-visible, .portfolio__dot:focus-visible`, ajouter trois sélecteurs :

```css
.portfolio__close:focus-visible,
.portfolio__arrow:focus-visible,
.portfolio__dot:focus-visible,
.portfolio__open:focus-visible,
.portfolio__photo-arrow:focus-visible,
.portfolio__thumb:focus-visible {
  outline: 2px solid #f5dc95;
  outline-offset: 2px;
}
```

- [ ] **Step 9 : vérifier la compilation et le lint**

```bash
npm run build && npm run lint
```

Attendu : build réussi, aucune erreur oxlint.

- [ ] **Step 10 : vérifier à l'écran**

```bash
npm run dev
```

Panneau « Projets », diapositive Prospeo. Attendu, point par point :

1. Deux vignettes sous la capture, chacune prenant la moitié de la colonne.
2. La première porte un liseré doré ; la seconde est à 42 % d'opacité.
3. Cliquer la seconde change la grande capture et déplace le liseré.
4. Survoler la capture fait apparaître deux chevrons et l'icône d'agrandissement ; les chevrons tournent entre les deux photos.
5. `←` et `→` changent toujours de **diapositive**, jamais de photo.
6. Passer à SignFlow puis revenir à Prospeo : la photo est revenue à la première.
7. Au clavier, `Tab` atteint la capture, les chevrons et les vignettes, chacun avec un contour doré.
8. Diapositives sans photo (missions client, Compétences, Parcours) : illustration générée, aucune vignette.
9. Réduire la fenêtre sous 720 px : la figure passe au-dessus du texte, centrée, chevrons visibles en permanence.

- [ ] **Step 11 : commit**

```bash
git add src/components/portfolio src/i18n src/index.css
git commit -m "feat: pellicule de vignettes sous la capture du panneau

Trois vignettes pleines par rangee et la quatrieme amorcee au bord quand
il y a beaucoup de photos ; elles s'etalent sur toute la largeur quand il
y en a peu. Une seule regle CSS couvre les deux cas.

Des images et non des points : le pied du panneau porte deja des
pastilles rondes pour les sept diapositives, et deux rangees de points
sur le meme ecran ne diraient plus laquelle on pilote.

L'index de photo, les captures en echec et l'index de diapositive vivent
tous dans le panneau : c'est ce qui permettra au plein ecran de partager
exactement la meme photo que la vignette.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4 : le plein écran

**Files:**
- Create: `src/components/portfolio/PhotoLightbox.tsx`
- Modify: `src/components/portfolio/PortfolioDialog.tsx`
- Modify: `src/analytics/index.ts:31-46`
- Modify: `src/index.css` (nouvelle section en fin de bloc portfolio, plus la media query 720 px)

**Interfaces:**
- Consumes: `PortfolioPhoto` (tâche 1), `CloseIcon` / `ChevronIcon` (tâche 2), `PhotoStrip` (tâche 3).
- Produces: `PhotoLightbox({ photos, current, title, onSelect, onClose, rootRef })`.

- [ ] **Step 1 : déclarer l'événement d'audience**

Dans `src/analytics/index.ts`, dans l'interface `Events`, après `landmark_opened` :

```ts
  /**
   * Une capture de projet est ouverte en plein écran.
   *
   * Répond à la seule question que posent les captures : est-ce qu'on les
   * regarde. `index` dit si les gens vont au-delà de la première — une série
   * qu'on ne parcourt jamais ne mérite pas qu'on la remplisse.
   *
   * Émis à l'ouverture seulement, jamais à chaque changement de photo :
   * l'offre gratuite d'Umami compte les événements, et parcourir une série de
   * cinq en produirait cinq pour une seule intention.
   */
  project_photo_opened: { project: string; index: number }
```

- [ ] **Step 2 : créer `PhotoLightbox.tsx`**

```tsx
import type { MouseEvent, RefObject } from 'react'
import { useEffect, useRef } from 'react'
import { format } from '../../i18n'
import { useI18n } from '../../i18n/useI18n'
import { ChevronIcon, CloseIcon } from './icons'
import { PhotoStrip } from './PhotoStrip'
import type { PortfolioPhoto } from './sections'

interface PhotoLightboxProps {
  photos: readonly PortfolioPhoto[]
  current: number
  /** Nom du projet, en tête d'écran : on doit savoir ce qu'on regarde. */
  title: string
  onSelect: (index: number) => void
  onClose: () => void
  /** Le panneau y branche son piège à focus tant que cet écran est ouvert. */
  rootRef: RefObject<HTMLDivElement | null>
}

/**
 * La capture en grand, par-dessus le panneau.
 *
 * La vignette du panneau recadre pour tenir sa colonne ; ici la photo est en
 * `contain`, jamais rognée — c'est précisément l'endroit où l'on vient voir
 * l'écran entier. La pellicule y reprend du service à 116 px par vignette,
 * largeur à laquelle une capture d'interface redevient lisible.
 *
 * Le clavier et la fermeture sont au panneau : deux écrans empilés, un seul
 * écouteur, sinon `Escape` aurait deux candidats et l'ordre dépendrait de
 * l'ordre de montage.
 */
export function PhotoLightbox({
  photos,
  current,
  title,
  onSelect,
  onClose,
  rootRef,
}: PhotoLightboxProps) {
  const { dict } = useI18n()
  const closeButton = useRef<HTMLButtonElement>(null)
  const photo = photos[current]
  const many = photos.length > 1

  useEffect(() => {
    closeButton.current?.focus()
  }, [])

  const go = (step: number) => onSelect((current + step + photos.length) % photos.length)

  // Un clic à côté de la photo ferme, un clic sur la photo ou sur une vignette
  // ne ferme pas. Le test sur `currentTarget` est ce qui fait la différence :
  // un clic sur un enfant remonte jusqu'ici, mais avec une autre `target`.
  const closeOnBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div
      ref={rootRef}
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={closeOnBackdrop}
    >
      <div className="lightbox__bar">
        <span className="lightbox__kicker">{title}</span>
        <span className="lightbox__position">
          {many && format(dict.ui.portfolio.position, {
            current: current + 1,
            total: photos.length,
          })}
        </span>
        <button
          ref={closeButton}
          type="button"
          className="lightbox__close"
          aria-label={dict.ui.portfolio.photoClose}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="lightbox__stage" onClick={closeOnBackdrop}>
        <img className="lightbox__image" src={photo.src} alt={photo.caption} decoding="async" />
        {many && (
          <>
            <button
              type="button"
              className="lightbox__arrow lightbox__arrow--prev"
              aria-label={dict.ui.portfolio.photoPrevious}
              onClick={() => go(-1)}
            >
              <ChevronIcon direction="left" />
            </button>
            <button
              type="button"
              className="lightbox__arrow lightbox__arrow--next"
              aria-label={dict.ui.portfolio.photoNext}
              onClick={() => go(1)}
            >
              <ChevronIcon direction="right" />
            </button>
          </>
        )}
      </div>

      <p className="lightbox__caption">{photo.caption}</p>

      {many && (
        <PhotoStrip
          photos={photos}
          current={current}
          onSelect={onSelect}
          variant="lightbox"
        />
      )}

      {/* Les raccourcis existent, autant les dire. Assez pâles pour ne pas
          disputer l'attention à la photo. */}
      {many && <p className="lightbox__hint">{dict.ui.portfolio.photoHint}</p>}
    </div>
  )
}
```

- [ ] **Step 3 : monter le plein écran dans le panneau**

Dans `src/components/portfolio/PortfolioDialog.tsx`, ajouter l'import :

```tsx
import { PhotoLightbox } from './PhotoLightbox'
```

Dans `PortfolioPanel`, après `const [failed, setFailed] = useState(...)`, ajouter :

```tsx
  const [zoomed, setZoomed] = useState(false)
  const lightbox = useRef<HTMLDivElement>(null)
```

Après `markFailed`, ajouter :

```tsx
  const closeZoom = useCallback(() => {
    setZoomed(false)
    // Le focus doit revenir d'où il est parti. Sans ça il retombe sur `<body>`
    // et la tabulation suivante repart du haut de la page, alors que le
    // panneau, lui, est toujours ouvert.
    openButton.current?.focus()
  }, [])
```

Remplacer `onOpen={() => undefined}` par :

```tsx
          onOpen={() => {
            setZoomed(true)
            track('project_photo_opened', { project: slide.id, index: current })
          }}
```

Ajouter `inert` sur le panneau — tant que le plein écran est ouvert, ses boutons ne doivent être atteignables ni au pointeur ni à la tabulation :

```tsx
      <div
        ref={panel}
        className="portfolio__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portfolio-title"
        inert={zoomed}
      >
```

Et, juste avant la fermeture du `<div className="portfolio">`, après le `</div>` du panneau :

```tsx
      {zoomed && photos.length > 0 && (
        <PhotoLightbox
          rootRef={lightbox}
          photos={photos}
          current={current}
          title={slide.title}
          onSelect={setPhoto}
          onClose={closeZoom}
        />
      )}
```

- [ ] **Step 4 : arbitrer le clavier**

Toujours dans `PortfolioPanel`, remplacer le corps de `onKeyDown` dans le `useEffect` existant par :

```tsx
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        // Deux écrans empilés, une seule touche : elle ferme le plus haut.
        if (zoomed) closeZoom()
        else onClose()
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // Ces deux touches pilotent aussi le déplacement du joueur. Ce n'est pas
        // un conflit : la partie est en pause et `Player` sort de sa boucle dès
        // la première ligne. On les intercepte quand même pour empêcher le
        // défilement de la page.
        //
        // Elles changent de photo en plein écran et de diapositive dans le
        // panneau : une touche, un sens, selon ce qui est ouvert.
        event.preventDefault()
        const step = event.key === 'ArrowLeft' ? -1 : 1
        if (zoomed) {
          if (photos.length > 1) {
            setPhoto((previous) => (previous + step + photos.length) % photos.length)
          }
        } else if (total > 1) {
          go(step)
        }
        return
      }
      if (event.key !== 'Tab') return

      // Piège à focus. Sans lui, `Tab` sort du panneau et va se poser sur le
      // canvas ou la barre d'adresse, alors que le reste de la page est inerte :
      // l'utilisateur au clavier perd sa position sans rien voir.
      //
      // Le piège suit l'écran du dessus : tant que le plein écran est ouvert,
      // c'est lui qui retient le focus, et le panneau est `inert`.
      const scope = zoomed ? lightbox.current : panel.current
      if (!scope) return
      const focusable = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
```

Et corriger le tableau de dépendances du `useEffect`, qui devient :

```tsx
  }, [closeZoom, go, onClose, photos.length, total, zoomed])
```

**Attention :** `photos` est calculé après `if (total === 0) return null`, donc après les hooks. Il faut le remonter. Déplacer le calcul de `slide`, `photos` et `current` **au-dessus** du `useEffect` du clavier, et rendre `slide` sûr avant le garde :

```tsx
  const slides = useMemo(() => buildSlides(section, dict), [section, dict])
  const total = slides.length
  // `at()` plutôt qu'un accès direct : entre deux rendus, `total` peut valoir 0
  // le temps d'un changement de langue, et les hooks ci-dessous doivent quand
  // même s'exécuter — on ne peut pas sortir avant eux.
  const slide = slides.at(index)
  const photos = slide?.photos?.filter((one) => !failed.has(one.src)) ?? []
  const current = photos.length > 0 ? Math.min(photo, photos.length - 1) : 0
```

Et le garde devient, après tous les hooks :

```tsx
  if (!slide) return null
```

- [ ] **Step 5 : ajouter le CSS du plein écran**

Dans `src/index.css`, à la fin de la section portfolio — après la règle `:focus-visible` groupée et **avant** `@media (max-width: 720px)` — insérer :

```css
/* --- Photo en plein écran --------------------------------------------------- */

/*
  Troisième écran modal du jeu, posé par-dessus le panneau. Même grammaire de
  voile que `.portfolio`, en nettement plus sombre : ce qu'on vient voir ici est
  une image, et tout ce qui reste visible autour lui vole de la lumière.
*/
.lightbox {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 22px 28px 26px;
  background: radial-gradient(
    120% 90% at 50% 42%,
    rgba(9, 14, 11, 0.93) 0%,
    rgba(3, 6, 4, 0.985) 100%
  );
  backdrop-filter: blur(10px);
  color: var(--hud-fg);
  animation: portfolio-in 180ms ease-out;
}

.lightbox__bar {
  display: flex;
  align-items: center;
  gap: 14px;
}

.lightbox__kicker {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #f5dc95;
  opacity: 0.8;
}

/* Pousse le bouton de fermeture à droite, et tient la position quand il y a
   plusieurs photos. Chiffres tabulaires : sinon la ligne se décale d'un demi-
   caractère entre « 1 / 4 » et « 2 / 4 ». */
.lightbox__position {
  flex-grow: 1;
  font-size: 11px;
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
  opacity: 0.55;
}

.lightbox__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(12, 18, 14, 0.5);
  color: var(--hud-fg);
  opacity: 0.8;
  transition: opacity 140ms ease, background 140ms ease, border-color 140ms ease,
    transform 140ms ease;
}

.lightbox__close svg {
  display: block;
  width: 17px;
  height: 17px;
}

.lightbox__close:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.26);
}

.lightbox__close:active { transform: scale(0.94); }

/* `min-height: 0` : sans lui, un élément flex ne descend pas sous la hauteur de
   son contenu, et une capture haute pousserait la légende hors de l'écran. */
.lightbox__stage {
  position: relative;
  flex-grow: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  margin-top: 10px;
}

/*
  `contain` et non `cover` : la vignette du panneau recadre pour tenir sa
  colonne, le plein écran est justement l'endroit où l'on voit l'écran entier.
*/
.lightbox__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 12px;
  background: #101712;
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.55),
    inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  animation: portfolio-panel-in 220ms cubic-bezier(0.22, 0.8, 0.28, 1);
}

/* Plus grands que ceux du panneau : ici il y a la place, et ce sont les seuls
   contrôles de l'écran. */
.lightbox__arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(8, 12, 9, 0.62);
  backdrop-filter: blur(6px);
  color: var(--hud-fg);
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.lightbox__arrow--prev { left: 6px; }
.lightbox__arrow--next { right: 6px; }

.lightbox__arrow svg {
  display: block;
  width: 24px;
  height: 24px;
}

.lightbox__arrow:hover {
  background: rgba(245, 220, 149, 0.16);
  border-color: rgba(245, 220, 149, 0.5);
  color: #f5dc95;
}

.lightbox__caption {
  margin: 18px 0 0;
  text-align: center;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.72;
}

/*
  La pellicule reprend du service à 116 px : c'est la largeur à partir de
  laquelle une capture d'interface redevient lisible, et la raison pour laquelle
  elle n'a pas cette taille dans le panneau.

  `width: fit-content` + `margin auto` plutôt que `justify-content: center` :
  centrer un conteneur qui défile coupe son début, qui devient inatteignable.
*/
.portfolio__strip--lightbox {
  gap: 8px;
  margin: 16px auto 0;
  width: fit-content;
  max-width: 100%;
}

.portfolio__strip--lightbox .portfolio__strip-item {
  flex: 0 0 116px;
}

.lightbox__hint {
  margin: 16px 0 0;
  text-align: center;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.34;
}

.lightbox__close:focus-visible,
.lightbox__arrow:focus-visible {
  outline: 2px solid #f5dc95;
  outline-offset: 2px;
}
```

- [ ] **Step 6 : adapter le plein écran au mobile**

Dans `@media (max-width: 720px)`, ajouter :

```css
  .lightbox { padding: 16px 12px 22px; }
  /* Au doigt, des flèches au milieu des bords de l'écran ne se touchent pas
     d'une main. Elles descendent au bas de la photo, où le pouce arrive. */
  .lightbox__arrow {
    top: auto;
    bottom: 8px;
    transform: none;
    width: 48px;
    height: 48px;
  }
  .lightbox__arrow--prev { left: 12px; }
  .lightbox__arrow--next { right: 12px; }
  /* 116 px de vignette ne tiennent pas dans 390 px d'écran, et les réduire
     redonnerait les rectangles gris. Le compteur en haut suffit. */
  .portfolio__strip--lightbox { display: none; }
  /* Les raccourcis clavier ne concernent personne ici. */
  .lightbox__hint { display: none; }
```

Dans `@media (prefers-reduced-motion: reduce)`, ajouter :

```css
  .lightbox { animation-duration: 1ms; }
  .lightbox__image { animation-duration: 1ms; }
  .lightbox__close,
  .lightbox__arrow { transition: none; }
```

- [ ] **Step 7 : vérifier la compilation et le lint**

```bash
npm run build && npm run lint
```

Attendu : build réussi, aucune erreur oxlint. Si `tsc` refuse `inert={zoomed}`, vérifier que `@types/react` est bien en 19 (`npm ls @types/react`) — l'attribut n'existe dans les types qu'à partir de cette version.

- [ ] **Step 8 : vérifier à l'écran**

```bash
npm run dev
```

Panneau « Projets », diapositive Prospeo. Attendu, point par point :

1. Cliquer la capture ouvre le plein écran ; la photo n'est pas rognée.
2. Le nom du projet est en haut à gauche, le compteur `1 / 2` à côté, la fermeture à droite.
3. La légende sous la photo est celle de la photo affichée, et change avec elle.
4. Les deux grands chevrons tournent entre les photos ; la pellicule du bas suit.
5. `←` et `→` changent de photo et **pas** de diapositive.
6. `Échap` ferme le plein écran et laisse le panneau ouvert ; un second `Échap` ferme le panneau.
7. À la fermeture, le contour de focus est revenu sur la capture du panneau.
8. `Tab` tourne en boucle dans le plein écran seul : il n'atteint jamais les pastilles du panneau derrière.
9. Cliquer le fond noir, à côté de la photo, ferme. Cliquer la photo ne ferme pas.
10. Ouvrir le plein écran sur la seconde photo, fermer : la vignette du panneau est restée sur la seconde.
11. Sous 720 px : les flèches sont en bas de la photo, la pellicule et la ligne de raccourcis ont disparu.
12. Dans la console, `window.umami` est absent en développement — normal, `track()` ne fait rien. Vérifier l'appel en posant un point d'arrêt sur `onOpen`, ou en lisant le tableau de bord Umami après déploiement.

- [ ] **Step 9 : commit**

```bash
git add src/components/portfolio src/analytics/index.ts src/index.css
git commit -m "feat: la capture d'un projet s'ouvre en plein ecran

La photo y est en contain, jamais rognee : la vignette recadre pour tenir
sa colonne, le plein ecran est l'endroit ou l'on voit l'ecran entier. La
pellicule y passe a 116 px par vignette, largeur a partir de laquelle une
capture d'interface redevient lisible.

Un seul ecouteur clavier, celui du panneau, qui branche sur l'etat :
fleches aux diapositives dans le panneau, aux photos en plein ecran, et
Echap ferme le plus haut des deux. Deux ecouteurs se seraient disputes
Echap selon l'ordre de montage.

Le panneau passe inert tant que le plein ecran est ouvert, et le focus
revient sur la capture a la fermeture.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Vérification finale

- [ ] **Step 1 : build et lint propres depuis zéro**

```bash
npm run build && npm run lint
```

- [ ] **Step 2 : parcourir les cinq sections du portfolio**

Ouvrir chacune via le menu de téléportation — Projets, Bio, Compétences, Parcours, Contact — et vérifier qu'aucune n'a régressé : les quatre dernières n'ont pas de photo et doivent afficher l'illustration générée, sans pellicule ni chevrons.

- [ ] **Step 3 : vérifier le repli sur capture manquante**

Renommer temporairement un fichier :

```bash
mv public/projects/prospeo2.png public/projects/prospeo2.png.bak
```

Recharger, ouvrir Prospeo. Attendu : une seule photo, aucune vignette, aucun chevron, la capture reste agrandissable. Puis restaurer :

```bash
mv public/projects/prospeo2.png.bak public/projects/prospeo2.png
```

- [ ] **Step 4 : vérifier les deux langues**

Dans la console : `__i18n` est exposé en développement. Basculer en anglais via le sélecteur du HUD et vérifier que les six libellés photo sont traduits (survoler un chevron, une vignette, la capture).

---

## Notes d'exécution

- **Ne pas ajouter de geste de balayage tactile.** C'est un non-objectif explicite de la spec : un `pointermove` maison entrerait en concurrence avec le défilement horizontal natif de la pellicule.
- **Ne pas convertir les PNG en WebP** dans ce lot. C'est signalé dans la spec comme hors périmètre.
- **`prospeo.png` et `prospeo2.png` sont le même écran en thème clair puis sombre.** C'est assumé et les légendes le disent. Ne pas « corriger » les légendes pour faire croire à deux écrans différents.
