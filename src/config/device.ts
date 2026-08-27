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

/**
 * `MediaQueryList` construit **une seule fois** au chargement du module.
 *
 * `isTouchDevice()` est appelé à chaque frame par `Player` : recréer un
 * `MediaQueryList` à chaque appel ferait travailler le GC pour rien dans la
 * boucle la plus chaude de l'app. `.matches` reste vivant (le navigateur le
 * tient à jour), donc la réactivité n'est pas perdue.
 */
const touchQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(TOUCH_QUERY)
    : null

/** Version pure, utilisable hors React (ex. dans une boucle `useFrame`). */
export function isTouchDevice(): boolean {
  return touchQuery?.matches ?? false
}

/**
 * Version réactive pour les composants. La query ne change en pratique que
 * lorsqu'on bascule l'émulation d'appareil dans les devtools — assez pour
 * tester sans recharger la page.
 */
export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(isTouchDevice)

  useEffect(() => {
    if (!touchQuery) return
    const onChange = () => setTouch(touchQuery.matches)
    touchQuery.addEventListener('change', onChange)
    return () => touchQuery.removeEventListener('change', onChange)
  }, [])

  return touch
}
