import { useEffect } from 'react'
import { controlMap } from '../config/controls'

/**
 * Relâche les touches quand la fenêtre perd le focus.
 *
 * `KeyboardControls` de drei n'écoute que `keydown` et `keyup`, sur la fenêtre.
 * Un Alt+Tab — ou un changement d'onglet, ou un clic dans l'éditeur à côté —
 * touche encore enfoncée emporte donc le `keyup` : la commande reste
 * *enfoncée* dans l'état interne de drei, et rien ne viendra jamais l'en
 * sortir.
 *
 * Deux conséquences, et c'est la seconde qui mord :
 *
 *  - le personnage continue de marcher tout seul au retour sur l'onglet ;
 *  - **l'appui suivant sur cette touche ne fait rien.** Tout ce qui dépend de
 *    la touche d'interaction — ouvrir un coffre, ouvrir un panneau de lieu —
 *    réagit à la *transition* relâché → enfoncé. Sur une commande restée
 *    enfoncée, le `keydown` suivant ne transitionne pas : il est avalé en
 *    silence, et il faut presser une seconde fois. C'est le « parfois F ne
 *    marche pas » : ça arrive après être passé par une autre fenêtre, donc
 *    n'importe où sur la carte, et sans rien qui le laisse deviner.
 *
 * On renvoie donc un `keyup` de synthèse pour chaque touche déclarée. Passer
 * par l'événement plutôt que par l'état de drei est délibéré : cet état n'est
 * pas exposé, et ce `keyup` est exactement ce que la fenêtre aurait reçu si
 * elle n'avait pas perdu le focus. Un événement fabriqué n'est par ailleurs
 * pas « de confiance » pour le navigateur : il ne déclenche aucune action par
 * défaut, et ne peut donc pas actionner au passage un bouton du HUD qui aurait
 * le focus.
 *
 * Même famille que les appuis perdus du saut et de l'attaque (voir la roadmap) :
 * un événement d'entrée qu'on n'a pas vu passer ne se rattrape pas après coup.
 */

/** Toutes les touches déclarées, à plat. La table des commandes fait foi. */
const ALL_KEYS = controlMap.flatMap((entry) => entry.keys)

export function KeyboardGuard() {
  useEffect(() => {
    const release = () => {
      for (const code of ALL_KEYS) {
        // drei résout une touche par `keyMap[event.key] || keyMap[event.code]`.
        // La table ne contient que des codes physiques, le second chemin suffit.
        window.dispatchEvent(new KeyboardEvent('keyup', { code }))
      }
    }
    // Les deux, et pas seulement `blur` : selon le navigateur, passer d'un
    // onglet à l'autre ne produit pas toujours un `blur` sur la fenêtre.
    const onVisibility = () => {
      if (document.hidden) release()
    }

    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
