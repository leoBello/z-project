import { SUMMIT_ARMOR_CHEST, SUMMIT_SABER_CHEST } from '../../config/chests'
import { useGameStore } from '../../store/useGameStore'
import { MapChest } from '../environment/MapChest'

/**
 * Les deux coffres que la chute du Lynel doré fait paraître au sommet.
 *
 * Le jumeau de `RotundaChest`, et il partage sa seule raison d'être : la
 * **condition d'existence**. Tout le reste — la détection de proximité, le
 * nettoyage de l'invite au démontage, l'écriture du store sur transition
 * seulement — vit dans `SkyChest`, où il est écrit une fois pour les quatre
 * coffres de cette carte.
 *
 * Deux coffres et non un, parce que la récompense est double et que les deux
 * moitiés s'équipent ensemble : l'armure à l'emplacement de tenue, la lame à
 * celui d'arme. Un coffre unique aurait dû rendre deux objets, ce que la
 * séquence d'ouverture ne sait pas faire — `chestReveal` présente **un** objet,
 * et lui en faire présenter deux aurait demandé de refaire la carte de
 * trouvaille pour un gain nul : deux couvercles à trois pas l'un de l'autre
 * racontent la même chose, et mieux.
 *
 * L'abonnement est **vivant**, contrairement aux instantanés que `SkyIsland`
 * prend de ses Lynels : un coffre n'a pas de corps à retirer ni de mort à
 * jouer, il doit paraître à la seconde où la bête tombe. C'est la discipline de
 * `RotundaChest`, pour la même raison.
 */
export function SummitChests() {
  const slain = useGameStore((state) => state.goldenSlainAt !== null)
  if (!slain) return null

  return (
    <>
      <MapChest chest={SUMMIT_ARMOR_CHEST} />
      <MapChest chest={SUMMIT_SABER_CHEST} />
    </>
  )
}
