import { ROTUNDA_CHEST } from '../../config/chests'
import { useGameStore } from '../../store/useGameStore'
import { SkyChest } from './SkyChest'

/**
 * Le coffre que la chute du gardien rend atteignable.
 *
 * Il est l'exact contraire du réceptacle de cœur posé à côté. Le réceptacle
 * tombe **avec** le Lynel, à l'endroit du corps : il raconte qu'on vient de le
 * lui prendre. Le coffre, lui, était là depuis toujours — dans l'axe d'une
 * travée écroulée, au vu de qui traversait l'arène — et seule la mort du gardien
 * le rend approchable. Les deux récompenses disent donc deux choses différentes,
 * et c'est ce qui justifie qu'il y en ait deux.
 *
 * Tout ce que ce composant ajoute à `SkyChest`, c'est **sa condition
 * d'existence**. La détection de proximité, elle, est commune aux deux coffres
 * de l'île depuis que celui de la Voie existe : voir `SkyChest`, qui la porte.
 * Le montage conditionnel suffit à ce que rien ne tourne avant la victoire —
 * un coffre absent de l'arbre n'a pas de boucle.
 */
export function RotundaChest() {
  const defeated = useGameStore((state) => state.bossState === 'defeated')
  if (!defeated) return null

  return <SkyChest chest={ROTUNDA_CHEST} />
}
