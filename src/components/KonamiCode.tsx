import { useEffect, useRef } from 'react'
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
 * premier appui qu'un code est en train d'être tapé.
 */

/**
 * La séquence, en **lettres** et non en codes physiques.
 *
 * C'est l'exception à la règle du projet — la table des commandes déclare des
 * codes (`KeyW`, `KeyA`) pour que WASD devienne ZQSD en AZERTY sans réglage.
 * Ici c'est l'inverse qu'il faut : le code Konami se finit par « B, A », deux
 * *lettres*, et un joueur sur clavier AZERTY qui cherche le A appuie sur la
 * touche marquée A. Raisonner en position physique lui demanderait d'appuyer
 * sur Q. On lit donc `event.key`, qui rend la lettre réellement produite par la
 * disposition active.
 *
 * Les deux graphies sont acceptées malgré tout, `key` puis `code` : sur une
 * disposition exotique où la lettre B ne se trouve nulle part, la position
 * physique reste un dernier recours plutôt qu'une impasse.
 */
const SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const

/** Vrai si cet appui est celui qu'attend l'étape `step` de la séquence. */
function matches(event: KeyboardEvent, step: number) {
  const expected = SEQUENCE[step]
  if (expected.startsWith('Arrow')) return event.key === expected
  // Lettre : la disposition d'abord, la position physique en second recours.
  return event.key.toLowerCase() === expected || event.code === `Key${expected.toUpperCase()}`
}

export function KonamiCode() {
  /**
   * Avancement dans la séquence.
   *
   * Un `useRef` et non un `useState` : le compteur ne s'affiche nulle part, et
   * le re-rendre à chaque touche ferait recalculer l'arbre à la cadence de
   * frappe du joueur pour ne rien changer à l'écran.
   */
  const step = useRef(0)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Une touche maintenue ne compte qu'une fois : sans ce garde, garder la
      // flèche haut enfoncée validerait les deux premières étapes toutes
      // seules, puis ferait avorter la suite au premier appui réel.
      if (event.repeat) return

      if (matches(event, step.current)) {
        step.current++
        if (step.current < SEQUENCE.length) return

        step.current = 0
        useGameStore.getState().triggerAnnihilation()
        return
      }

      // Faux pas : on repart de zéro — sauf si cet appui est lui-même un
      // premier pas valable. Sans cette nuance, taper ↑ ↑ ↑ ↓ ↓ … échouerait,
      // alors que la troisième flèche haut est un début de code parfaitement
      // légitime. C'est la faute de saisie la plus courante sur ce code.
      step.current = matches(event, 0) ? 1 : 0
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return null
}
