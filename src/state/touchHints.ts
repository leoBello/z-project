import { useEffect, useSyncExternalStore } from 'react'

/**
 * Visibilité partagée des bulles d'aide tactiles.
 *
 * Sur un écran tactile, rien ne se devine : pas de touche à lire dans le HUD,
 * pas de survol pour révéler une affordance. Deux gestes doivent donc être
 * annoncés au premier contact — l'onglet des lieux se déplie, et le joystick
 * naît sous le pouce n'importe où dans la moitié basse gauche.
 *
 * Un seul drapeau pour les deux bulles, et non un par bulle : elles
 * disparaissent ensemble dès que l'écran est touché, où que ce soit. Le
 * premier contact est justement la preuve que le visiteur a compris qu'on
 * touche cet écran — continuer à le lui écrire n'apprendrait plus rien et
 * masquerait le jeu.
 *
 * L'état vit hors de React parce qu'il est lu par deux composants sans
 * ancêtre commun utile (`TouchControls` et `TeleportMenu`, montés à deux
 * endroits d'`App`), et parce qu'un `useState` ne survivrait pas au démontage
 * de `TouchControlsOverlay` à chaque ouverture de panneau : la bulle du
 * joystick reviendrait derrière chaque modale refermée.
 *
 * Volontairement en mémoire seulement, sans `localStorage` : la portée est la
 * visite en cours. Un rechargement de page réaffiche les bulles, ce qui est le
 * bon compromis pour un portfolio où l'on revient rarement dans la minute.
 */
let dismissed = false

const listeners = new Set<() => void>()

function getDismissed() {
  return dismissed
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Efface les bulles, définitivement pour la visite. Idempotent. */
function dismissTouchHints() {
  if (dismissed) return
  dismissed = true
  for (const listener of listeners) listener()
}

/**
 * Vrai tant que les bulles doivent rester à l'écran.
 *
 * Pose aussi l'écoute qui les efface : un `pointerdown` sur `window`, en
 * phase de capture, attrape le premier contact **où qu'il ait lieu** — canvas,
 * zone du joystick, onglet des lieux ou bouton d'action — là où un écouteur
 * posé sur un élément précis raterait tous les autres. Elle se retire d'
 * elle-même au premier appel : l'effet dépend de `visible`, qui vient de
 * passer à faux.
 *
 * Le garde sur `#boot` compte : l'écran de chargement (défini dans
 * `index.html`, retiré par `BootScreen`) recouvre encore tout. Un doigt posé
 * dessus pendant le chargement effacerait des bulles que personne n'a jamais
 * vues.
 */
export function useTouchHintsVisible(): boolean {
  const visible = !useSyncExternalStore(subscribe, getDismissed)

  useEffect(() => {
    if (!visible) return
    const onPointerDown = () => {
      if (document.getElementById('boot')) return
      dismissTouchHints()
    }
    window.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => window.removeEventListener('pointerdown', onPointerDown, { capture: true })
  }, [visible])

  return visible
}
