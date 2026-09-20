import { AEONIA_KING_CHEST, AEONIA_THIEF_CHEST } from '../../config/chests'
import { ARENA_R } from '../../config/rotMarsh'
import { useGameStore } from '../../store/useGameStore'
import { HeartContainer } from '../environment/HeartContainer'
import { MapChest } from '../environment/MapChest'

/**
 * Ce que laisse Malenia en tombant — un réceptacle, et deux coffres.
 *
 * Le jumeau de `RotundaReward` et de `SummitChests` réunis, et il en partage la
 * seule raison d'être : la **condition d'existence**. Tout le reste — la
 * détection de proximité, le nettoyage de l'invite au démontage, l'écriture du
 * store sur transition seulement — vit dans `MapChest` et `HeartContainer`, où
 * il est écrit une fois pour tous les coffres et tous les réceptacles du jeu.
 *
 * L'abonnement est **vivant**, contrairement à l'instantané que `RotMarsh` prend
 * d'elle : un coffre n'a pas de corps à retirer ni de mort à jouer, il doit
 * paraître à la seconde où elle tombe. C'est la discipline de `RotundaChest`,
 * pour la même raison.
 *
 * **Trois récompenses pour un combat, et c'est un cas unique dans le jeu.** Le
 * gardien de la rotonde en donne deux (un réceptacle et un coffre), le Lynel
 * doré deux également. Celle-ci en donne trois parce que c'est le dernier
 * combat : il n'y a rien après lui à quoi réserver quoi que ce soit, et une
 * dernière victoire qui rendrait moins que l'avant-dernière se sentirait comme
 * une erreur de comptage.
 */
export function MarshRewards() {
  const slain = useGameStore((state) => state.maleniaSlainAt !== null)
  const fellAt = useGameStore((state) => state.maleniaFellAt)
  if (!slain) return null

  /*
    Le réceptacle à l'endroit du corps, et non au centre du bassin.

    Le store retient le point de chute parce que le composant du boss se démonte
    avec lui. Le repli au centre couvre deux cas : une partie reprise d'un état
    où elle était déjà morte, et un point de chute aberrant — elle se replace sur
    le joueur au milieu de ses séquences, et un dernier coup porté au bord
    pourrait la laisser hors du dallage. Un réceptacle posé dans l'eau serait
    ramassable, mais il ferait monter la pourriture pendant qu'on le prend.
  */
  const [x, , z] = fellAt ?? [0, 0, 0]
  const onFloor = Math.hypot(x, z) < ARENA_R - 1.5

  return (
    <>
      {/* Un mètre au-dessus du dallage : à hauteur de poitrine, pas dans les
          pieds. Le dallage du bassin est à 0,45, d'où 1,45. */}
      <HeartContainer
        sourceId="malenia"
        position={onFloor ? [x, 1.45, z] : [0, 1.45, 0]}
      />

      {/* Deux coffres et non un, exactement pour la raison des coffres du
          sommet : la séquence d'ouverture présente **un** objet, et lui en faire
          présenter deux aurait demandé de refaire la carte de trouvaille pour un
          gain nul. Deux couvercles à six pas l'un de l'autre racontent la même
          chose, et mieux. */}
      <MapChest chest={AEONIA_KING_CHEST} />
      <MapChest chest={AEONIA_THIEF_CHEST} />
    </>
  )
}
