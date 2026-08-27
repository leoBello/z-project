import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useIsTouchDevice } from '../config/device'
import { touchInput, resetTouchMove } from '../state/touchInput'
import { useGameStore } from '../store/useGameStore'

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
 * de l'interface ancrée à l'écran. Rendu seulement sur appareil tactile et
 * seulement en jeu ; sinon `null`, et rien n'écrit dans `touchInput`.
 *
 * Monté avant `<PortfolioDialog />` dans `App.tsx` : quand un panneau s'ouvre,
 * la phase passe à `paused`, ce composant se démonte, et son `useEffect` de
 * nettoyage remet le joystick au neutre.
 */
export function TouchControls() {
  const isTouch = useIsTouchDevice()
  const phase = useGameStore((state) => state.phase)

  const joyPointer = useRef<number | null>(null)
  const joyOrigin = useRef({ x: 0, y: 0 })
  const [joy, setJoy] = useState<JoyVisual>(JOY_HIDDEN)

  // Filet : si le composant disparaît alors qu'un pouce est encore posé
  // (changement de phase), le `pointerup` n'arrivera jamais.
  useEffect(() => resetTouchMove, [])

  if (!isTouch || phase !== 'playing') return null

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (joyPointer.current !== null) return
    joyPointer.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
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
    </div>
  )
}
