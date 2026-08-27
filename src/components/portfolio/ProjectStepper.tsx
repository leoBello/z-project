import { format } from '../../i18n'
import { useI18n } from '../../i18n/useI18n'

interface ProjectStepperProps {
  total: number
  /** Index courant, à partir de 0. */
  current: number
  onSelect: (index: number) => void
}

/**
 * Pastilles de progression du panneau.
 *
 * Une liste ordonnée et non une rangée de `<div>` : c'est une séquence, et
 * l'ordre est la seule information qu'elle porte. Chaque pastille reste un
 * bouton — pouvoir sauter directement au quatrième projet évite trois clics
 * sur la flèche, et c'est ce que tout le monde essaie de faire.
 *
 * La pastille visible est un `<span>` à l'intérieur du bouton, et non le bouton
 * lui-même : la cible cliquable fait alors 24 px de haut pendant que le point
 * n'en fait que 8. Un bouton de 8 px est en dessous de tout seuil de confort au
 * doigt, et le jeu se joue aussi sur téléphone.
 */
export function ProjectStepper({ total, current, onSelect }: ProjectStepperProps) {
  const { dict } = useI18n()

  return (
    <ol className="portfolio__stepper">
      {Array.from({ length: total }, (_, index) => {
        const active = index === current
        return (
          <li key={index}>
            <button
              type="button"
              className={`portfolio__dot${active ? ' portfolio__dot--active' : ''}`}
              // `aria-current="step"` dit *lequel* est courant ; sans lui, un
              // lecteur d'écran ne verrait que des boutons numérotés.
              aria-current={active ? 'step' : undefined}
              aria-label={format(dict.ui.portfolio.position, {
                current: index + 1,
                total,
              })}
              onClick={() => onSelect(index)}
            >
              <span className="portfolio__dot-mark" aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ol>
  )
}
