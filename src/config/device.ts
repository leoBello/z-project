import { useEffect, useState } from 'react'

/**
 * Media query « appareil tactile sans souris ».
 *
 * `pointer: coarse` = le pointeur principal est un doigt ; `hover: none` = pas
 * de survol possible. Les deux ensemble visent smartphone et tablette tactile,
 * jamais un desktop — même en petite fenêtre, même avec un écran tactile s'il a
 * aussi une souris (là, `pointer` fin l'emporte). C'est cette query qui garantit
 * que les contrôles tactiles et le recentrage caméra ne s'activent pas sur
 * desktop.
 */
const TOUCH_QUERY = '(pointer: coarse) and (hover: none)'

/** Version pure, utilisable hors React (ex. dans une boucle `useFrame`). */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(TOUCH_QUERY).matches
}

/**
 * Version réactive pour les composants. La query ne change en pratique que
 * lorsqu'on bascule l'émulation d'appareil dans les devtools — assez pour
 * tester sans recharger la page.
 */
export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(isTouchDevice)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(TOUCH_QUERY)
    const onChange = () => setTouch(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return touch
}
