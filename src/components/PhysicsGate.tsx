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
 * Seul propriétaire de la prop `paused` de `<Physics>`.
 *
 * Le monde physique se met en pause pour deux raisons — un panneau ouvert, et
 * le gel de 80 ms sur un coup fatal. La première est rare, la seconde tombe à
 * chaque ennemi tué. Basculer la prop depuis `App` re-rendrait tout l'arbre
 * deux fois par kill, les vingt-six ennemis compris.
 *
 * D'où ce composant, qui prend ses enfants en **`props.children`** : quand le
 * gel bascule, `PhysicsGate` se re-rend mais `children` reste le même objet
 * élément qu'à la frame précédente, et React court-circuite la réconciliation
 * de tout le sous-arbre. C'est le seul intérêt du découpage — sans lui, un
 * simple `useState` dans `App` aurait suffi.
 *
 * Effet de bord bienvenu : `App` ne lit plus `phase` du tout et cesse donc de
 * se re-rendre à chaque ouverture d'inventaire.
 */
export function PhysicsGate({ debug, children }: PhysicsGateProps) {
  const phase = useGameStore((state) => state.phase)
  // `useSyncExternalStore` et non un `useState` + effet : le gel est armé
  // depuis une boucle `useFrame`, hors de tout événement React, et c'est
  // exactement le cas que cette API existe pour couvrir.
  const stopped = useSyncExternalStore(subscribeHitStop, hitStopSnapshot, hitStopSnapshot)

  return (
    <Physics gravity={[0, PLAYER.gravity, 0]} paused={phase !== 'playing' || stopped} debug={debug}>
      {children}
    </Physics>
  )
}
