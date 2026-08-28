import { useCallback, useEffect, useRef } from 'react'
import { itemById } from '../../config/items'
import { useI18n } from '../../i18n/useI18n'
import { useGameStore } from '../../store/useGameStore'
import { ItemCard } from './ItemCard'
import { ItemIcon } from './ItemIcon'
import { useDialogFocus } from './useDialogFocus'

/**
 * Nombre d'emplacements affichés, objets compris.
 *
 * Douze, alors qu'il n'y a qu'un objet à trouver aujourd'hui. Les cases vides
 * ne sont pas du remplissage : un sac qui n'affiche que ce qu'il contient se
 * lit comme une liste et ne promet rien, alors qu'une grille à trous dit qu'il
 * reste des choses à trouver. C'est la seule indication du jeu qu'un trésor
 * existe quelque part — il n'y a volontairement aucun repère de coffre sur la
 * minimap.
 */
const SLOTS = 12

/** Ne rien faire — voir le désarmement du piège à focus plus bas. */
const NOOP = () => {}

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

/**
 * Grille de l'inventaire.
 *
 * Rendue hors du `<Canvas>` comme le HUD et le portfolio : c'est de l'interface
 * ancrée à l'écran. Son ouverture met la partie en pause via le store — voir
 * `openInventory`, qui porte la même garde que `openLandmark`.
 */
export function InventoryPanel() {
  const { dict } = useI18n()
  const inventoryOpen = useGameStore((state) => state.inventoryOpen)
  const items = useGameStore((state) => state.items)
  const equipped = useGameStore((state) => state.equipped)
  const activeItem = useGameStore((state) => state.activeItem)
  const chestReveal = useGameStore((state) => state.chestReveal)
  const closeInventory = useGameStore((state) => state.closeInventory)
  const showItem = useGameStore((state) => state.showItem)
  const hideItem = useGameStore((state) => state.hideItem)

  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => closeInventory(), [closeInventory])
  // Le piège à focus de la grille est désarmé pendant qu'une carte d'objet est
  // ouverte par-dessus : deux pièges concurrents se voleraient `Tab` et `Échap`,
  // et c'est la carte, qui est au-dessus, qui doit les recevoir.
  useDialogFocus(panel, activeItem ? NOOP : close)

  useEffect(() => {
    if (inventoryOpen) closeButton.current?.focus()
  }, [inventoryOpen])

  // La carte d'objet peut vivre sans la grille : c'est le cas de la révélation
  // au coffre, qui n'ouvre pas l'inventaire. Elle est alors rendue par
  // `ChestReveal`, pas ici.
  if (!inventoryOpen) return null

  return (
    <div className="inventory">
      <div
        ref={panel}
        className="inventory__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-title"
      >
        <button
          ref={closeButton}
          type="button"
          className="inventory__close"
          aria-label={dict.ui.inventory.close}
          onClick={close}
        >
          <CloseIcon />
        </button>

        <h2 id="inventory-title" className="inventory__title">
          {dict.ui.inventory.title}
        </h2>

        <ul className="inventory__grid">
          {Array.from({ length: SLOTS }, (_, index) => {
            const id = items[index]
            const item = id ? itemById(id) : undefined

            if (!id || !item) {
              return (
                <li key={`empty-${index}`} className="inventory__slot" aria-hidden="true">
                  <span className="inventory__slot-empty" />
                </li>
              )
            }

            const isWorn = equipped[item.kind] === id
            const wornSuffix = isWorn ? ' — ' + dict.ui.inventory.equipped : ''

            return (
              <li key={id} className="inventory__slot inventory__slot--filled">
                <button
                  type="button"
                  className={`inventory__item${isWorn ? ' inventory__item--worn' : ''}`}
                  style={{ '--item-accent': item.accent } as React.CSSProperties}
                  aria-label={dict.ui.items[id].name + wornSuffix}
                  onClick={() => showItem(id)}
                >
                  <ItemIcon id={id} accent={item.accent} />
                  {isWorn && <span className="inventory__worn">{dict.ui.inventory.equipped}</span>}
                </button>
              </li>
            )
          })}
        </ul>

        {items.length === 0 && <p className="inventory__empty">{dict.ui.inventory.empty}</p>}
      </div>

      {/*
        La carte se monte par-dessus la grille et non à sa place : refermer la
        carte doit ramener au sac, pas au jeu. `chestReveal` la neutralise ici —
        pendant une révélation, c'est `ChestReveal` qui la possède.
      */}
      {activeItem && chestReveal === null && (
        <ItemCard key={activeItem} id={activeItem} context="inventory" onClose={hideItem} />
      )}
    </div>
  )
}
