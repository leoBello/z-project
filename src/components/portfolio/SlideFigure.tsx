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
          26 px quand on a 290 px d'image sous le curseur n'aurait pas de sens ;
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

      {many && (
        <PhotoStrip photos={photos} current={current} onSelect={onSelect} />
      )}
    </div>
  )
}
