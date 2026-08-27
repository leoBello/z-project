import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useIsTouchDevice } from '../config/device'
import { touchInput, resetTouchMove } from '../state/touchInput'
import { useGameStore } from '../store/useGameStore'
import { useI18n } from '../i18n/useI18n'

/** Rayon (px) au-delà duquel l'amplitude du stick est bornée à 1. */
const JOY_RADIUS = 60
/** Rayon (px) en-deçà duquel le stick est considéré au neutre. */
const JOY_DEADZONE = 8

type JoyVisual = { active: boolean; x: number; y: number; dx: number; dy: number }
const JOY_HIDDEN: JoyVisual = { active: false, x: 0, y: 0, dx: 0, dy: 0 }

/**
 * Contrôles tactiles, façon émulateur GBA — **mobile uniquement**.
 *
 * En HTML superposé au Canvas (comme `HUD`), pas via `<Html>` de drei : c'est
 * de l'interface ancrée à l'écran.
 *
 * Ce composant n'est qu'une porte : il ne rend `<TouchControlsOverlay />` que
 * sur appareil tactile **et** en jeu. Le corps (refs du joystick, state, gestes)
 * vit dans l'overlay, donc un changement de phase le **démonte vraiment** — son
 * `useEffect` de nettoyage remet alors le joystick au neutre et les refs de
 * suivi de pointeur repartent de zéro au remontage. Sans cette séparation, un
 * simple `return null` laisserait un `pointerId` capturé et périmé bloquer le
 * joystick jusqu'au rechargement de la page.
 *
 * Monté avant `<PortfolioDialog />` dans `App.tsx` : quand un panneau s'ouvre,
 * la phase passe à `paused` et l'overlay disparaît proprement.
 */
export function TouchControls() {
  const isTouch = useIsTouchDevice()
  const phase = useGameStore((state) => state.phase)

  if (!isTouch || phase !== 'playing') return null

  return <TouchControlsOverlay />
}

/**
 * Corps des contrôles tactiles. Monté/démonté par `TouchControls` selon la
 * phase — jamais rendu directement, jamais exporté (garde `only-export-components`
 * satisfait). Sur desktop il n'est jamais instancié : `useGameStore` n'y est donc
 * abonné à rien et `useI18n` non plus.
 */
function TouchControlsOverlay() {
  const nearbyLandmark = useGameStore((state) => state.nearbyLandmark)
  const { dict } = useI18n()

  const joyPointer = useRef<number | null>(null)
  const joyOrigin = useRef({ x: 0, y: 0 })
  const [joy, setJoy] = useState<JoyVisual>(JOY_HIDDEN)

  // Filet : au démontage (changement de phase pendant qu'un pouce est posé), le
  // `pointerup` n'arrivera jamais — on relâche le joystick à la main.
  useEffect(() => resetTouchMove, [])

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (joyPointer.current !== null) return
    joyPointer.current = e.pointerId
    // `setPointerCapture` peut lever `InvalidPointerId` si le pointeur a déjà
    // disparu (tap très bref + geste système) : la capture est un confort, la
    // zone étant une grande région fixe, on continue sans elle si ça échoue.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointeur déjà parti — sans importance ici */
    }
    joyOrigin.current = { x: e.clientX, y: e.clientY }
    setJoy({ active: true, x: e.clientX, y: e.clientY, dx: 0, dy: 0 })
  }

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointer.current) return
    const rawX = e.clientX - joyOrigin.current.x
    const rawY = e.clientY - joyOrigin.current.y
    const dist = Math.hypot(rawX, rawY)
    const clamped = Math.min(dist, JOY_RADIUS)
    const ux = dist > 0 ? rawX / dist : 0
    const uy = dist > 0 ? rawY / dist : 0
    const dx = ux * clamped
    const dy = uy * clamped

    setJoy((j) => ({ ...j, dx, dy }))

    if (dist < JOY_DEADZONE) {
      resetTouchMove()
    } else {
      touchInput.moveX = dx / JOY_RADIUS
      touchInput.moveY = dy / JOY_RADIUS
    }
  }

  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointer.current) return
    joyPointer.current = null
    resetTouchMove()
    setJoy(JOY_HIDDEN)
  }

  return (
    <div className="touch-controls">
      <div
        className="touch-joystick__zone"
        role="application"
        aria-label={dict.ui.touch.move}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      {joy.active && (
        <div className="touch-joystick__base" style={{ left: joy.x, top: joy.y }}>
          <div
            className="touch-joystick__thumb"
            style={{ transform: `translate(${joy.dx}px, ${joy.dy}px)` }}
          />
        </div>
      )}

      <div className="touch-buttons">
        {nearbyLandmark && (
          <button
            type="button"
            className="touch-button touch-button--interact"
            // Libellé = l'action précise du monument (« Voir les projets »…),
            // le même texte que l'invite clavier `.hud__prompt` côté desktop.
            aria-label={dict.ui.landmarks[nearbyLandmark].action}
            onPointerDown={() => {
              // Appel direct du store : c'est un vrai événement pointeur, pas un
              // sondage par frame — aucun risque de le perdre, donc pas besoin
              // de passer par un drapeau dans `touchInput`. Même garde que
              // `LandmarkInteraction` côté clavier.
              const store = useGameStore.getState()
              if (store.phase === 'playing' && store.nearbyLandmark) {
                store.openLandmark(store.nearbyLandmark)
              }
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="touch-button touch-button--jump"
          aria-label={dict.ui.touch.jump}
          onPointerDown={() => {
            touchInput.jumpRequested = true
          }}
        >
          B
        </button>
        <button
          type="button"
          className="touch-button touch-button--attack"
          aria-label={dict.ui.touch.attack}
          onPointerDown={() => {
            touchInput.attackRequested = true
          }}
        >
          A
        </button>
      </div>
    </div>
  )
}
