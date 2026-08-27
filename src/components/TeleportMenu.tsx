import { useState } from 'react'
import type { ReactNode } from 'react'
import { isTouchDevice, useIsTouchDevice } from '../config/device'
import { LANDMARKS } from '../config/landmarks'
import { useI18n } from '../i18n/useI18n'
import { useTouchHintsVisible } from '../state/touchHints'
import { useGameStore } from '../store/useGameStore'
import type { LandmarkId } from '../types/game'

/**
 * Tracés des cinq icônes, un par monument — style "traits dorés" validé en
 * maquette. `currentColor` sur le `<svg>` parent suit la couleur du texte du
 * bouton : la ligne active se recolore par CSS seul, sans prop de couleur.
 */
const LANDMARK_ICONS: Record<LandmarkId, ReactNode> = {
  temple: <path d="M4 20h16M6 20V9l6-5 6 5v11M9 20v-6h6v6" />,
  pyramid: <path d="M12 4l9 16H3z" />,
  stele: <path d="M8 3h8l2 6-6 12L6 9z" />,
  statue: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M7 21c0-4 2-7 5-7s5 3 5 7" />
    </>
  ),
  ruins: <path d="M4 21V11l4-6h8l4 6v10M8 21v-6h8v6" />,
}

/**
 * Menu de téléportation rapide vers les cinq points d'intérêt.
 *
 * Tablette rétractable sur le bord gauche, ouverte par défaut. Doit être
 * montée après `<PortfolioDialog />` dans `App.tsx` : le projet n'utilise
 * aucun `z-index`, l'empilement suit l'ordre du DOM, et ce menu doit rester
 * cliquable même quand une modale est ouverte plein écran — c'est ce qui
 * permet de sauter d'une section à l'autre sans repasser par la fermeture.
 */
export function TeleportMenu() {
  const { dict } = useI18n()
  const phase = useGameStore((state) => state.phase)
  const activeLandmark = useGameStore((state) => state.activeLandmark)
  const teleportTo = useGameStore((state) => state.teleportTo)
  // Ouvert par défaut sur desktop. Sur mobile il démarre replié : le panneau
  // déployé recouvrirait le coin haut-gauche de la zone du joystick, et un pouce
  // posé là déclencherait une téléportation au lieu d'un déplacement. L'onglet
  // vertical reste visible et le menu s'ouvre au toucher.
  const [open, setOpen] = useState(() => !isTouchDevice())
  // Replié, l'onglet vertical ne ressemble pas à un menu : rien n'indique qu'il
  // s'ouvre, et sur mobile il n'y a ni survol ni curseur pour le suggérer. Une
  // bulle le dit, puis s'efface au premier contact avec l'écran, où qu'il ait
  // lieu — pas seulement sur l'onglet.
  const isTouch = useIsTouchDevice()
  const showHint = useTouchHintsVisible()

  // À l'écran de fin, un menu de voyage rapide n'a plus de sens.
  if (phase === 'gameover') return null

  return (
    <div className="teleport-menu">
      <button
        type="button"
        className="teleport-menu__tab"
        aria-expanded={open}
        aria-label={dict.ui.teleport.tab}
        onClick={() => setOpen((value) => !value)}
      >
        {dict.ui.teleport.tab}
      </button>

      {/* Jamais par-dessus une modale ouverte : ce menu passe devant tout le
          reste du DOM (voir l'en-tête du fichier), la bulle irait donc se poser
          au milieu d'un panneau de portfolio. */}
      {isTouch && showHint && !open && phase === 'playing' && (
        <p className="touch-hint touch-hint--teleport">
          <svg
            className="touch-hint__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 5l6 7-6 7M13 5l6 7-6 7" />
          </svg>
          {dict.ui.teleport.hint}
        </p>
      )}

      {open && (
        <nav className="teleport-menu__panel" aria-label={dict.ui.teleport.group}>
          {LANDMARKS.map((landmark) => {
            const isActive = activeLandmark === landmark.id
            return (
              <button
                key={landmark.id}
                type="button"
                className={`teleport-menu__item${isActive ? ' teleport-menu__item--active' : ''}`}
                aria-current={isActive || undefined}
                aria-label={`${dict.ui.landmarks[landmark.id].name} — ${dict.ui.landmarks[landmark.id].action}`}
                onClick={() => {
                  teleportTo(landmark.id)
                  // Sur mobile, le panneau déployé recouvre la modale qui vient
                  // de s'ouvrir : sur un écran étroit, il n'y a pas la place
                  // pour les deux. On le replie donc après la téléportation,
                  // l'onglet restant là pour sauter à la section suivante. Sur
                  // desktop il reste ouvert — la modale ne le touche pas.
                  if (isTouch) setOpen(false)
                }}
              >
                <svg
                  className="teleport-menu__icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  aria-hidden="true"
                >
                  {LANDMARK_ICONS[landmark.id]}
                </svg>
                {dict.ui.sections[landmark.section]}
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
