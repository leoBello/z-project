import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Chest } from '../../config/chests'
import { playerTransform } from '../../state/playerTransform'
import { useGameStore } from '../../store/useGameStore'
import { TreasureChest } from '../environment/TreasureChest'

/**
 * Un coffre de l'Île Céleste, **avec sa propre détection de proximité**.
 *
 * Les cinq coffres du continent sont balayés par une boucle unique, celle de
 * `Landmarks`. Cette boucle-là n'existe pas ici : elle vit dans le composant
 * des monuments, et il n'y a pas de monument sur cette carte. Chaque coffre
 * céleste porte donc la sienne — mais **une seule fois**, dans ce composant,
 * et non recopiée dans chacun d'eux. La discipline qui suit est délicate, et
 * deux copies auraient divergé à la première correction.
 *
 * Trois précautions, et chacune répare un défaut qu'on ne voit qu'en jouant :
 *
 *  - **le composant ne parle que de son coffre.** Il ne remet l'invite à zéro
 *    que si c'est bien le sien qui l'occupe. L'île en compte deux — celui de la
 *    Voie et celui de la rotonde — et sans cette garde, celui qu'on vient de
 *    quitter éteindrait l'invite que l'autre vient d'allumer ;
 *  - **il nettoie derrière lui au démontage.** Il disparaît avec la carte quand
 *    le joueur franchit le portail ; sans ce nettoyage, une invite « ouvrir le
 *    coffre » laissée allumée au moment du départ survivrait au voyage et
 *    resterait affichée sur le continent, sans coffre sous la main ;
 *  - **il n'écrit dans le store que sur transition.** `getState()` évite
 *    l'abonnement, donc il ne se re-rend jamais depuis sa propre boucle. Sans
 *    ce soin, on re-rendrait le HUD soixante fois par seconde pour réafficher
 *    la même invite. C'est la discipline de `LandmarkProximity`, et pour la
 *    même raison.
 */
export function SkyChest({ chest }: { chest: Chest }) {
  useEffect(() => {
    return () => {
      const store = useGameStore.getState()
      if (store.nearbyChest === chest.id) store.setNearbyChest(null)
    }
  }, [chest.id])

  useFrame(() => {
    const store = useGameStore.getState()
    const occupied = store.nearbyChest === chest.id

    // Un coffre ouvert ne propose plus rien : même règle que sur le continent,
    // l'invite s'éteint d'elle-même et ne se rallume jamais.
    if (store.openedChests.includes(chest.id)) {
      if (occupied) store.setNearbyChest(null)
      return
    }

    // Distance au sol : les deux emplacements sont plats, mais le joueur peut
    // sauter, et une invite qui clignote au sommet d'un saut serait un défaut
    // gratuit.
    const near =
      Math.hypot(
        playerTransform.position.x - chest.world.x,
        playerTransform.position.z - chest.world.z,
      ) < chest.interactRadius

    if (near !== occupied) store.setNearbyChest(near ? chest.id : null)
  })

  return <TreasureChest chest={chest} />
}
