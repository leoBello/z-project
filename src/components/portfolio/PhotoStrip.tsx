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
 * diraient plus laquelle on pilote. Une vignette dit en plus *ce qu'il y a*
 * dans la photo suivante, ce qu'aucun point ne fait.
 *
 * La rangée déborde à partir de quatre photos et défile. L'amorce de la
 * vignette suivante au bord droit est ce qui l'annonce — c'est aussi pour ça
 * que la barre de défilement est masquée : elle couperait la rangée en deux
 * pour dire la même chose, en moins discret.
 */
export function PhotoStrip({
  photos,
  current,
  onSelect,
  variant = 'panel',
}: PhotoStripProps) {
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
              <img
                src={photo.src}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </button>
          </li>
        )
      })}
    </ol>
  )
}
