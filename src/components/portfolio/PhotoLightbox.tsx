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
 * largeur à partir de laquelle une capture d'interface redevient lisible.
 *
 * Le clavier et la fermeture restent au panneau : deux écrans empilés, un seul
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
  // ne ferme pas. Le test sur `currentTarget` fait la différence : un clic sur
  // un enfant remonte jusqu'ici, mais avec une autre `target`.
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
          {many &&
            format(dict.ui.portfolio.position, {
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
        <img
          className="lightbox__image"
          src={photo.src}
          alt={photo.caption}
          decoding="async"
        />
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
