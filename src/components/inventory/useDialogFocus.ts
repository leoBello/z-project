import { useEffect, type RefObject } from 'react'

/** Sélecteur des éléments qui peuvent recevoir le focus dans un panneau. */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Piège à focus et fermeture au clavier pour un panneau modal.
 *
 * Extrait ici parce que l'inventaire et la carte d'objet en ont besoin tous les
 * deux, et qu'ils peuvent être empilés — la carte s'ouvre par-dessus la grille.
 * Sans piège, `Tab` sortirait du panneau pour aller se poser sur le canvas ou
 * la barre d'adresse alors que le reste de la page est inerte : l'utilisateur
 * au clavier perd sa position sans rien voir à l'écran.
 *
 * `Échap` ferme, et les flèches sont avalées : elles pilotent aussi le
 * déplacement du joueur, et même si la partie est en pause, les laisser passer
 * ferait défiler la page sous le panneau.
 */
export function useDialogFocus(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return

      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, panel])
}
