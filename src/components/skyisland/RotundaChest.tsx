import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { ROTUNDA_CHEST } from '../../config/chests'
import { playerTransform } from '../../state/playerTransform'
import { useGameStore } from '../../store/useGameStore'
import { TreasureChest } from '../environment/TreasureChest'

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
 * **Il porte sa propre détection de proximité**, contrairement aux cinq coffres
 * du continent qui sont balayés par la boucle de `Landmarks`. Cette boucle-là
 * n'existe pas sur l'Île Céleste : elle vit dans le composant des monuments, et
 * il n'y a pas de monument ici. Deux précautions en découlent :
 *
 *  - **elle ne parle que de son coffre.** Elle ne remet l'invite à zéro que si
 *    c'est bien celui-ci qui l'occupe, pour ne jamais effacer une invite posée
 *    par la boucle du continent si les deux venaient à tourner ensemble ;
 *  - **elle nettoie derrière elle au démontage.** Le composant disparaît avec la
 *    carte quand le joueur franchit le portail ; sans ce nettoyage, une invite
 *    « Ouvrir le coffre » laissée allumée au moment du départ survivrait au
 *    voyage et resterait affichée sur le continent, sans coffre sous la main.
 */
export function RotundaChest() {
  const defeated = useGameStore((state) => state.bossState === 'defeated')

  useEffect(() => {
    return () => {
      const store = useGameStore.getState()
      if (store.nearbyChest === ROTUNDA_CHEST.id) store.setNearbyChest(null)
    }
  }, [])

  useFrame(() => {
    if (!defeated) return
    const store = useGameStore.getState()
    const occupied = store.nearbyChest === ROTUNDA_CHEST.id

    // Un coffre ouvert ne propose plus rien : même règle que sur le continent,
    // l'invite s'éteint d'elle-même et ne se rallume jamais.
    if (store.openedChests.includes(ROTUNDA_CHEST.id)) {
      if (occupied) store.setNearbyChest(null)
      return
    }

    // Distance au sol : l'arène est plate, mais le joueur peut sauter, et une
    // invite qui clignote au sommet d'un saut serait un défaut gratuit.
    const near =
      Math.hypot(
        playerTransform.position.x - ROTUNDA_CHEST.world.x,
        playerTransform.position.z - ROTUNDA_CHEST.world.z,
      ) < ROTUNDA_CHEST.interactRadius

    // Écriture sur transition seulement : `getState()` évite l'abonnement, donc
    // ce composant ne se re-rend jamais depuis sa propre boucle. Sans ce soin,
    // on re-rendrait le HUD soixante fois par seconde pour réafficher la même
    // invite — la discipline de `LandmarkProximity`, et pour la même raison.
    if (near !== occupied) store.setNearbyChest(near ? ROTUNDA_CHEST.id : null)
  })

  if (!defeated) return null

  return <TreasureChest chest={ROTUNDA_CHEST} />
}
