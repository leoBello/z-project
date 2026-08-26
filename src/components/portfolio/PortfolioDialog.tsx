import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format } from '../../i18n'
import { useI18n } from '../../i18n/useI18n'
import { useGameStore } from '../../store/useGameStore'
import { ProjectIllustration } from './ProjectIllustration'
import { ProjectStepper } from './ProjectStepper'

/** Sélecteur des éléments qui peuvent recevoir le focus dans le panneau. */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

interface PortfolioPanelProps {
  onClose: () => void
}

/**
 * Le panneau proprement dit.
 *
 * Séparé de `PortfolioDialog` pour une raison précise : le parent le monte
 * avec une `key` égale au lieu ouvert. Changer de lieu remonte donc le
 * composant, ce qui remet l'index à zéro sans écrire une seule ligne de
 * synchronisation — le même mécanisme que `runId` sur le joueur et les ennemis.
 */
function PortfolioPanel({ onClose }: PortfolioPanelProps) {
  const { dict } = useI18n()
  const [index, setIndex] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  /**
   * Les projets mis en avant, **avec leur position d'origine**.
   *
   * L'index conservé est celui du tableau complet et non celui de la sélection :
   * c'est lui qui donne sa teinte à l'illustration, et masquer un projet ne
   * doit pas reteindre tous les suivants.
   */
  const projects = useMemo(
    () =>
      dict.experience
        .map((entry, position) => ({ entry, position }))
        .filter(({ entry }) => entry.featured),
    [dict],
  )

  const total = projects.length
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
        // Ces deux touches pilotent aussi le déplacement du joueur. Ce n'est
        // pas un conflit : la partie est en pause et `Player` sort de sa boucle
        // dès la première ligne. On les intercepte quand même pour empêcher le
        // défilement de la page.
        event.preventDefault()
        go(event.key === 'ArrowLeft' ? -1 : 1)
        return
      }
      if (event.key !== 'Tab' || !panel.current) return

      // Piège à focus. Sans lui, `Tab` sort du panneau et va se poser sur le
      // canvas ou la barre d'adresse, alors que le reste de la page est
      // inerte : l'utilisateur au clavier perd sa position sans rien voir.
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
  }, [go, onClose])

  if (total === 0) return null

  const { entry, position } = projects[index]

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
          {/* Le glyphe est décoratif : c'est `aria-label` qui nomme le bouton. */}
          <span aria-hidden="true">×</span>
        </button>

        <ProjectIllustration id={entry.id} tags={entry.tags} index={position} />

        <div className="portfolio__body">
          <span className="portfolio__kicker">{dict.ui.portfolio.kicker}</span>
          <h2 id="portfolio-title" className="portfolio__title">
            {entry.company}
          </h2>
          <p className="portfolio__meta">
            {entry.role}
            <span className="portfolio__separator" aria-hidden="true">
              ·
            </span>
            {entry.period}
          </p>
          <p className="portfolio__description">{entry.description}</p>
          <ul className="portfolio__tags">
            {entry.tags.map((tag) => (
              <li key={tag} className="portfolio__tag">
                {tag}
              </li>
            ))}
          </ul>
        </div>

        <nav className="portfolio__nav">
          <button
            type="button"
            className="portfolio__arrow"
            aria-label={dict.ui.portfolio.previous}
            onClick={() => go(-1)}
          >
            <span aria-hidden="true">←</span>
          </button>

          <ProjectStepper total={total} current={index} onSelect={setIndex} />

          <button
            type="button"
            className="portfolio__arrow"
            aria-label={dict.ui.portfolio.next}
            onClick={() => go(1)}
          >
            <span aria-hidden="true">→</span>
          </button>
        </nav>

        {/*
          Position annoncée aux lecteurs d'écran seulement : visuellement, le
          stepper la donne déjà. `aria-live` la fait relire à chaque changement,
          sinon la navigation aux flèches serait silencieuse.
        */}
        <p className="portfolio__position" aria-live="polite">
          {format(dict.ui.portfolio.position, { current: index + 1, total })}
        </p>
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

  return <PortfolioPanel key={activeLandmark} onClose={closeLandmark} />
}
