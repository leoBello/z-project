import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { landmarkById, type PortfolioSection } from '../../config/landmarks'
import { format } from '../../i18n'
import { useI18n } from '../../i18n/useI18n'
import { useGameStore } from '../../store/useGameStore'
import { ProjectIllustration } from './ProjectIllustration'
import { ProjectStepper } from './ProjectStepper'
import { buildSlides } from './sections'

/** Sélecteur des éléments qui peuvent recevoir le focus dans le panneau. */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/*
  Glyphes tracés plutôt que typographiés.

  Les caractères `×`, `←` et `→` n'occupent pas le centre de leur cadratin et
  varient d'une police système à l'autre : dans un bouton rond, ils tombent
  toujours un peu haut et un peu à gauche, et aucun réglage de `line-height` ne
  rattrape ça de façon portable. Un tracé SVG, lui, est centré par construction.
*/
function CloseIcon() {
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

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
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

interface PortfolioPanelProps {
  section: PortfolioSection
  onClose: () => void
}

/**
 * Le panneau proprement dit.
 *
 * Séparé de `PortfolioDialog` pour une raison précise : le parent le monte avec
 * une `key` égale au lieu ouvert. Passer d'un monument à l'autre remonte donc
 * le composant, ce qui remet l'index à zéro sans écrire une seule ligne de
 * synchronisation — le même mécanisme que `runId` sur le joueur et les ennemis.
 */
function PortfolioPanel({ section, onClose }: PortfolioPanelProps) {
  const { dict } = useI18n()
  const [index, setIndex] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  const slides = useMemo(() => buildSlides(section, dict), [section, dict])
  const total = slides.length

  // Navigation circulaire : une flèche grisée au premier écran oblige le joueur
  // à deviner pourquoi elle ne répond pas.
  const go = useCallback(
    (step: number) => setIndex((previous) => (previous + step + total) % total),
    [total],
  )

  useEffect(() => {
    closeButton.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // Ces deux touches pilotent aussi le déplacement du joueur. Ce n'est pas
        // un conflit : la partie est en pause et `Player` sort de sa boucle dès
        // la première ligne. On les intercepte quand même pour empêcher le
        // défilement de la page.
        event.preventDefault()
        if (total > 1) go(event.key === 'ArrowLeft' ? -1 : 1)
        return
      }
      if (event.key !== 'Tab' || !panel.current) return

      // Piège à focus. Sans lui, `Tab` sort du panneau et va se poser sur le
      // canvas ou la barre d'adresse, alors que le reste de la page est inerte :
      // l'utilisateur au clavier perd sa position sans rien voir.
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
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

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go, onClose, total])

  if (total === 0) return null

  const slide = slides[index]

  return (
    <div className="portfolio">
      <div
        ref={panel}
        className="portfolio__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portfolio-title"
      >
        <button
          ref={closeButton}
          type="button"
          className="portfolio__close"
          aria-label={dict.ui.portfolio.close}
          onClick={onClose}
        >
          <CloseIcon />
        </button>

        <ProjectIllustration
          id={slide.id}
          tags={slide.tags}
          index={slide.accentIndex}
          motif={slide.motif}
        />

        <div className="portfolio__body">
          <span className="portfolio__kicker">{dict.ui.sections[section]}</span>
          <h2 id="portfolio-title" className="portfolio__title">
            {slide.title}
          </h2>
          {slide.meta && <p className="portfolio__meta">{slide.meta}</p>}

          {slide.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="portfolio__description">
              {paragraph}
            </p>
          ))}

          {slide.tags && slide.tags.length > 0 && (
            <ul className="portfolio__tags">
              {slide.tags.map((tag) => (
                <li key={tag} className="portfolio__tag">
                  {tag}
                </li>
              ))}
            </ul>
          )}

          {slide.links && (
            <ul className="portfolio__links">
              {slide.links.map((link) => (
                <li key={link.href}>
                  {/*
                    `noopener` est indispensable sur une cible `_blank` : sans
                    lui, la page ouverte garde une référence à `window.opener` et
                    peut réécrire l'onglet du jeu.
                  */}
                  <a
                    className="portfolio__link"
                    href={link.href}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Une seule diapositive : ni flèches ni pastilles. Des contrôles de
            navigation devant un contenu unique ne font que poser la question de
            ce qu'ils sont censés faire. */}
        {total > 1 && (
          <nav className="portfolio__nav">
            <button
              type="button"
              className="portfolio__arrow"
              aria-label={dict.ui.portfolio.previous}
              onClick={() => go(-1)}
            >
              <ChevronIcon direction="left" />
            </button>

            <ProjectStepper total={total} current={index} onSelect={setIndex} />

            <button
              type="button"
              className="portfolio__arrow"
              aria-label={dict.ui.portfolio.next}
              onClick={() => go(1)}
            >
              <ChevronIcon direction="right" />
            </button>
          </nav>
        )}

        {/*
          Position annoncée aux lecteurs d'écran seulement : visuellement, le
          stepper la donne déjà. `aria-live` la fait relire à chaque changement,
          sinon la navigation aux flèches serait silencieuse.
        */}
        {total > 1 && (
          <p className="portfolio__position" aria-live="polite">
            {format(dict.ui.portfolio.position, { current: index + 1, total })}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Panneau de présentation d'un point d'intérêt.
 *
 * Rendu hors du `<Canvas>`, comme le HUD : c'est de l'interface ancrée à
 * l'écran, pas un objet de la scène. Son ouverture met la partie en pause via
 * le store — voir `openLandmark`.
 */
export function PortfolioDialog() {
  const activeLandmark = useGameStore((state) => state.activeLandmark)
  const closeLandmark = useGameStore((state) => state.closeLandmark)

  if (!activeLandmark) return null

  const landmark = landmarkById(activeLandmark)
  if (!landmark) return null

  return (
    <PortfolioPanel key={activeLandmark} section={landmark.section} onClose={closeLandmark} />
  )
}
