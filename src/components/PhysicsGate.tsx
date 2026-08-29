import { useSyncExternalStore, type ReactNode } from 'react'
import { Physics } from '@react-three/rapier'
import { PLAYER } from '../config/gameplay'
import { hitStopSnapshot, subscribeHitStop } from '../state/gameClock'
import { useGameStore } from '../store/useGameStore'

interface PhysicsGateProps {
  debug: boolean
  children: ReactNode
}

/**
 * Hissée en constante de module, et ce n'est pas de la coquetterie : un
 * littéral inline construit un tableau neuf à chaque rendu, ce qui invalide le
 * `useMemo` du contexte de rapier même quand `paused` n'a pas bougé.
 */
const GRAVITY: [number, number, number] = [0, PLAYER.gravity, 0]

/**
 * Seul propriétaire de la prop `paused` de `<Physics>`.
 *
 * Le monde physique se met en pause pour deux raisons — un panneau ouvert, et
 * le gel de 80 ms sur un coup fatal. La première est rare, la seconde tombe à
 * chaque ennemi tué. Basculer la prop depuis `App` re-rendrait tout l'arbre
 * deux fois par kill, les vingt-six ennemis compris.
 *
 * Ce que ce découpage gagne : `App` ne lit plus `phase` du tout, ne connaît plus
 * le gel, et cesse donc de se re-rendre — ni à chaque ouverture d'inventaire, ni
 * deux fois par ennemi tué. Le re-rendu est confiné à ce composant-ci.
 *
 * Ce qu'il ne gagne **pas**, et il vaut mieux l'écrire que laisser un lecteur le
 * déduire de la forme du code : prendre les enfants en `props.children` n'immunise
 * pas le sous-arbre. Le court-circuit sur enfants identiques vaut pour la
 * réconciliation par éléments, pas pour les consommateurs de contexte — et
 * `@react-three/rapier` fait entrer `paused` dans les dépendances du `useMemo`
 * qui construit sa valeur de contexte, que `RigidBody` et les colliders lisent
 * via `useRapier()`. Chaque bascule du gel les re-rend donc tous : les
 * vingt-six ennemis, le joueur, le terrain, le `<RigidBody>` des obstacles de
 * végétation et son collider par tronc, deux fois par ennemi tué. Rien de cela
 * ne se voit à l'écran aujourd'hui ; si une saccade apparaît un jour au moment
 * des kills, c'est ici qu'il faut regarder d'abord.
 */
export function PhysicsGate({ debug, children }: PhysicsGateProps) {
  const phase = useGameStore((state) => state.phase)
  // `useSyncExternalStore` et non un `useState` + effet : le gel est armé
  // depuis une boucle `useFrame`, hors de tout événement React, et c'est
  // exactement le cas que cette API existe pour couvrir.
  const stopped = useSyncExternalStore(subscribeHitStop, hitStopSnapshot, hitStopSnapshot)

  return (
    <Physics gravity={GRAVITY} paused={phase !== 'playing' || stopped} debug={debug}>
      {children}
    </Physics>
  )
}
