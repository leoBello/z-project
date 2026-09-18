import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { linkTarget, track } from '../../analytics'
import { landmarkById, type PortfolioSection } from '../../config/landmarks'
import { format } from '../../i18n'
import { useI18n } from '../../i18n/useI18n'
import { useGameStore } from '../../store/useGameStore'
import { ChevronIcon, CloseIcon } from './icons'
import { PhotoLightbox } from './PhotoLightbox'
import { ProjectStepper } from './ProjectStepper'
import { buildSlides } from './sections'
import { SlideFigure } from './SlideFigure'

/** Sélecteur des éléments qui peuvent recevoir le focus dans le panneau. */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

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
  const [photo, setPhoto] = useState(0)
  // Un `Set` partagé par toutes les diapositives : un chemin est unique à un
  // projet, et une capture morte le reste quand on revient dessus.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const [zoomed, setZoomed] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const lightbox = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const openButton = useRef<HTMLButtonElement>(null)

  const slides = useMemo(() => buildSlides(section, dict), [section, dict])
  const total = slides.length

  // `at()` plutôt qu'un accès direct : ces trois valeurs sont lues par les
  // hooks ci-dessous, donc calculées avant le garde de sortie, et rien ne
  // garantit qu'il y ait une diapositive à ce moment-là.
  const slide = slides.at(index)
  // Une capture en échec sort de la liste, les autres restent : un projet dont
  // un fichier sur trois manque n'a pas à perdre les deux autres.
  const photos = slide?.photos?.filter((one) => !failed.has(one.src)) ?? []
  // La liste a pu rétrécir sous l'index : on le borne ici plutôt que de laisser
  // passer un `undefined` jusqu'à `<img src>`.
  const current = photos.length > 0 ? Math.min(photo, photos.length - 1) : 0

  // Navigation circulaire : une flèche grisée au premier écran oblige le joueur
  // à deviner pourquoi elle ne répond pas.
  //
  // Les deux chemins qui changent de diapositive remettent la photo à zéro —
  // sans ça, on ouvrirait le projet suivant sur la troisième photo du
  // précédent.
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

  // Le garde évite un rendu pour rien quand un chemin est signalé deux fois,
  // et surtout la boucle : l'effet ci-dessous dépend de `failed`, donc un
  // ensemble d'identité neuve à chaque signalement le relancerait sans fin.
  const markFailed = useCallback((src: string) => {
    setFailed((previous) => (previous.has(src) ? previous : new Set(previous).add(src)))
  }, [])

  const closeZoom = useCallback(() => setZoomed(false), [])

  /*
    Vérification des captures, faite ici et pas sur les `<img>` affichées.

    L'attribut `onError` de React s'est révélé inutilisable pour ça, et ce n'est
    pas une supposition : sur le build de production, en coupant une capture, le
    navigateur émet bien un événement `error` — on le voit depuis un écouteur de
    capture posé sur `document` — mais le gestionnaire React n'en fait rien et
    l'image morte reste affichée.

    Une `Image` construite à la main n'a pas ce problème : c'est du DOM nu, son
    `onerror` part toujours. Elle ne coûte rien de plus en réseau, le navigateur
    servant la même URL à la balise affichée et à cette sonde depuis la même
    entrée de cache.

    Les chemins déjà signalés sont sautés, sans quoi l'effet se relancerait
    indéfiniment sur sa propre dépendance.
  */
  useEffect(() => {
    if (!slide?.photos) return
    let alive = true
    for (const one of slide.photos) {
      if (failed.has(one.src)) continue
      const probe = new Image()
      probe.onerror = () => {
        if (alive) markFailed(one.src)
      }
      probe.src = one.src
    }
    return () => {
      alive = false
    }
  }, [slide, failed, markFailed])

  useEffect(() => {
    closeButton.current?.focus()
  }, [])

  /*
    Retour du focus après le plein écran.

    Dans un effet et non dans le gestionnaire de fermeture : au moment du clic,
    le panneau porte encore `inert`, et un élément inerte refuse le focus — la
    tabulation repartait donc de `<body>`, c'est-à-dire du haut de la page,
    alors que le panneau était toujours ouvert. Ici, React a déjà retiré
    l'attribut.

    Le drapeau évite de voler le focus au montage, où il revient au bouton de
    fermeture du panneau.
  */
  const wasZoomed = useRef(false)
  useEffect(() => {
    if (zoomed) {
      wasZoomed.current = true
      return
    }
    if (!wasZoomed.current) return
    wasZoomed.current = false
    openButton.current?.focus()
  }, [zoomed])

  useEffect(() => {
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
      // Il suit l'écran du dessus : tant que le plein écran est ouvert, c'est
      // lui qui retient le focus, et le panneau est `inert`.
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

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeZoom, go, onClose, photos.length, total, zoomed])

  if (!slide) return null

  return (
    <div className="portfolio">
      <div
        ref={panel}
        className="portfolio__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portfolio-title"
        // Tant que le plein écran est ouvert, les boutons du panneau ne doivent
        // être atteignables ni au pointeur ni à la tabulation.
        inert={zoomed}
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

        <SlideFigure
          slide={slide}
          photos={photos}
          current={current}
          onSelect={setPhoto}
          onOpen={() => {
            setZoomed(true)
            track('project_photo_opened', { project: slide.id, index: current })
          }}
          openRef={openButton}
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
                    /*
                      `onClick` et non `onAuxClick` ou un écouteur de navigation :
                      la cible est `_blank`, donc la page du jeu n'est jamais
                      déchargée et l'événement a tout le temps de partir.
                    */
                    onClick={() => track('outbound_link', { target: linkTarget(link.href) })}
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

            <ProjectStepper total={total} current={index} onSelect={showSlide} />

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

      {/* Frère du panneau et non son enfant : il le recouvre entièrement, et le
          panneau devient `inert` derrière lui. */}
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
  // Un lieu sans section ne devrait jamais arriver ici — il n'a ni braise ni
  // zone d'interaction, et ne figure pas au menu de téléportation. Le garde est
  // là pour que ça reste vrai : le jour où un tel lieu deviendrait ouvrable, on
  // n'ouvrirait pas un panneau vide, on ne l'ouvrirait pas du tout.
  if (!landmark || landmark.section === null) return null

  return (
    <PortfolioPanel key={activeLandmark} section={landmark.section} onClose={closeLandmark} />
  )
}
