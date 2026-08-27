import { useEffect, useRef } from 'react'
import { useProgress } from '@react-three/drei'

/**
 * Retrait de l'écran de chargement `#boot` (défini dans `index.html`).
 *
 * `#boot` est rendu dès le HTML initial, hors de `#root`, et recouvre le contenu
 * de repli SEO jusqu'à ce que la scène soit prête. Ce composant ne rend rien :
 * il observe le gestionnaire de chargement de three via `useProgress` et efface
 * `#boot` quand plus rien ne charge.
 *
 * Trois garde-fous :
 *  - `total === 0` : aucune ressource déclarée (tous les modèles ont un repli
 *    procédural) — on considère la scène prête ;
 *  - `MIN_VISIBLE_MS` : durée d'affichage minimale, pour que l'écran ne
 *    clignote pas sur un chargement instantané ;
 *  - `SAFETY_MS` : retrait forcé, pour ne jamais bloquer le visiteur si le
 *    chargement n'aboutit pas (le CSS a lui aussi son propre filet à 12 s).
 */

const MIN_VISIBLE_MS = 800
const SAFETY_MS = 8000

export function BootScreen() {
  const { active, progress, total } = useProgress()
  const removedRef = useRef(false)
  const mountedAtRef = useRef(0)

  // `performance.now()` est impur : on le lit dans un effet, pas au rendu.
  useEffect(() => {
    mountedAtRef.current = performance.now()
  }, [])

  useEffect(() => {
    if (removedRef.current) return

    const dismiss = () => {
      if (removedRef.current) return
      removedRef.current = true
      const el = document.getElementById('boot')
      if (!el) return
      el.classList.add('boot--done')
      window.setTimeout(() => el.remove(), 600)
    }

    const safety = window.setTimeout(dismiss, SAFETY_MS)

    const ready = !active && (total === 0 || progress >= 100)
    let minTimer: number | undefined
    if (ready) {
      const remaining = MIN_VISIBLE_MS - (performance.now() - mountedAtRef.current)
      minTimer = window.setTimeout(dismiss, Math.max(0, remaining))
    }

    return () => {
      window.clearTimeout(safety)
      if (minTimer !== undefined) window.clearTimeout(minTimer)
    }
  }, [active, progress, total])

  return null
}
