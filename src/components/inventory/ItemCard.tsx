import { useCallback, useEffect, useRef } from 'react'
import { itemById } from '../../config/items'
import { useI18n } from '../../i18n/useI18n'
import { useGameStore } from '../../store/useGameStore'
import type { ItemId } from '../../types/game'
import { ItemIllustration } from './ItemIllustration'
import { useDialogFocus } from './useDialogFocus'

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

/** Petit cœur doré, repris du tracé du HUD : l'effet se montre, il ne se décrit pas. */
function BonusHeart() {
  return (
    <svg className="item-card__effect-heart" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

interface ItemCardProps {
  id: ItemId
  /**
   * Contexte d'ouverture.
   *
   * `reveal` — la carte sort d'un coffre : pas de bouton d'équipement, et la
   * fermeture rend la main au jeu. On ne demande pas au joueur d'arbitrer sur
   * une tenue qu'il découvre à l'instant ; l'inventaire est là pour ça, et il
   * vient de recevoir la pastille qui le lui dit.
   * `inventory` — la carte est consultée depuis le sac : équipement possible,
   * la fermeture revient à la grille.
   */
  context: 'reveal' | 'inventory'
  onClose: () => void
}

/**
 * Carte de présentation d'un objet.
 *
 * Un seul composant pour les deux chemins d'entrée — la découverte au coffre et
 * la consultation dans l'inventaire. Les dupliquer aurait produit deux cartes
 * qui divergent au premier changement de maquette, alors que c'est exactement
 * le même objet qu'on regarde.
 */
export function ItemCard({ id, context, onClose }: ItemCardProps) {
  const { dict } = useI18n()
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const equipped = useGameStore((state) => state.equipped)
  const equipItem = useGameStore((state) => state.equipItem)
  const unequipItem = useGameStore((state) => state.unequipItem)

  // Mémoïsé : `useDialogFocus` le garde en dépendance de son écouteur clavier,
  // et une fonction recréée à chaque rendu le réabonnerait sans arrêt.
  const close = useCallback(() => onClose(), [onClose])
  useDialogFocus(panel, close)

  useEffect(() => {
    closeButton.current?.focus()
  }, [])

  const item = itemById(id)
  if (!item) return null

  const text = dict.ui.items[id]
  const isWorn = equipped === id

  return (
    <div className={`item-card${context === 'reveal' ? ' item-card--reveal' : ''}`}>
      <div
        ref={panel}
        className="item-card__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-card-title"
        style={{ '--item-accent': item.accent } as React.CSSProperties}
      >
        <button
          ref={closeButton}
          type="button"
          className="item-card__close"
          aria-label={dict.ui.portfolio.close}
          onClick={close}
        >
          <CloseIcon />
        </button>

        <ItemIllustration id={id} />

        <div className="item-card__body">
          <span className="item-card__kicker">
            {context === 'reveal' ? dict.ui.chest.kicker : dict.ui.inventory.kinds[item.kind]}
          </span>
          <h2 id="item-card-title" className="item-card__title">
            {text.name}
          </h2>
          <p className="item-card__meta">{text.meta}</p>
          <p className="item-card__description">{text.description}</p>

          {item.bonusHearts > 0 && (
            <p className="item-card__effect">
              <span className="item-card__effect-label">{dict.ui.inventory.effect}</span>
              {/* Les cœurs sont dessinés en plus du texte, pas à sa place : le
                  nombre doit rester lisible aux lecteurs d'écran, et le dessin
                  fait le lien avec la barre de vie en haut de l'écran. */}
              <span className="item-card__effect-value">
                {Array.from({ length: item.bonusHearts }, (_, index) => (
                  <BonusHeart key={index} />
                ))}
                {text.effect}
              </span>
            </p>
          )}

          {context === 'inventory' && (
            <button
              type="button"
              className={`item-card__action${isWorn ? ' item-card__action--worn' : ''}`}
              onClick={() => (isWorn ? unequipItem() : equipItem(id))}
            >
              {isWorn ? dict.ui.inventory.unequip : dict.ui.inventory.equip}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
