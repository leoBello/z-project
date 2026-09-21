import { useEffect, useRef } from 'react'
import { createKonamiTracker } from '../state/konami'
import { useGameStore } from '../store/useGameStore'

/**
 * Le code Konami — ↑ ↑ ↓ ↓ ← → ← → B A.
 *
 * Écoute directement `keydown` sur la fenêtre, et **pas** via la table des
 * commandes de drei. Deux raisons, et la seconde est la vraie :
 *
 *  - `KeyboardControls` ne connaît que des commandes (`forward`, `attack`…),
 *    pas des touches. Il ne saurait pas distinguer « flèche haut » de « W »,
 *    alors que le code, lui, se tape aux flèches et nulle part ailleurs ;
 *  - une séquence est une suite d'**appuis**, pas un état. Sonder l'état des
 *    commandes dans un `useFrame` perdrait tout appui plus court qu'une frame —
 *    le piège déjà payé sur le saut, sur l'attaque et sur l'interaction.
 *
 * Le code se tape donc par-dessus les commandes : les flèches font aussi
 * marcher le personnage pendant qu'on le saisit. C'est volontairement laissé
 * tel quel — c'est le comportement de tous les jeux qui portent ce code, et
 * neutraliser les touches pendant la saisie obligerait à deviner *avant* le
 * premier appui qu'un code est en train d'être tapé. La reconnaissance, elle,
 * ne s'en laisse plus conter : voir `state/konami.ts`, qui compare les dix
 * derniers appuis plutôt que de tenir un avancement à rattraper.
 *
 * **Il vide les trois cartes, et pas seulement le continent.** Rien n'a changé
 * ici pour ça : le code déclenche la même frappe qu'avant, et ce sont les bêtes
 * qui ont appris à en mourir (voir l'onde d'annihilation dans `Lynel.tsx`).
 * Comme chacune meurt par son chemin normal, l'aiguillage sur le rôle fait le
 * reste — les barrières de la rotonde s'ouvrent, l'épreuve s'achève, le portail
 * du sommet se perce. La triche débouche sur le même état de partie qu'une
 * victoire, ce qui est la seule façon d'en faire un outil de test fiable.
 *
 * Malenia, elle, y survit : la tuer d'un code annulerait le service rendu.
 */
export function KonamiCode() {
  /**
   * L'historique de saisie.
   *
   * Un `useRef` et non un `useState` : il ne s'affiche nulle part, et le
   * re-rendre à chaque touche ferait recalculer l'arbre à la cadence de frappe
   * du joueur pour ne rien changer à l'écran.
   */
  const tracker = useRef(createKonamiTracker())

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Une touche maintenue ne compte qu'une fois : sans ce garde, garder la
      // flèche haut enfoncée remplirait l'historique de ↑ à la cadence de
      // répétition du système, et le code taperait par-dessus les siens.
      if (event.repeat) return
      if (tracker.current.push(event)) useGameStore.getState().triggerAnnihilation()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return null
}
