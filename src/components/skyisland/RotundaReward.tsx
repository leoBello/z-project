import { CORE_Y } from '../../config/skyIsland'
import { useGameStore } from '../../store/useGameStore'
import { HeartContainer } from '../environment/HeartContainer'

/**
 * Ce que laisse le Lynel en tombant.
 *
 * Un réceptacle de cœur, posé **là où il est tombé**, et pas dans un coffre. Le
 * jeu en a cinq, tous à ouvrir : un sixième qui se matérialise après un boss
 * raconterait que la récompense était rangée là depuis toujours. Au sol, il
 * raconte qu'on vient de la lui prendre.
 *
 * Il n'apparaît qu'une fois le gardien vaincu, et `bossState` reste à
 * `defeated` pour toute la partie — y compris après un aller-retour par le
 * portail, puisque l'état vit dans le store et non dans le fragment de l'île.
 * Une fois ramassé, `HeartContainer` cesse de se rendre de lui-même.
 *
 * Le rayon de ramassage est celui du temple (3,2 par défaut) : le dallage de
 * l'arène est nu et rien n'y gêne l'approche.
 */
export function RotundaReward() {
  const defeated = useGameStore((state) => state.bossState === 'defeated')
  if (!defeated) return null

  // Un mètre au-dessus du dallage : à hauteur de poitrine, pas dans les pieds.
  return <HeartContainer sourceId="rotunda" position={[0, CORE_Y + 1, 0]} />
}
