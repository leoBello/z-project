import { useFrame } from '@react-three/fiber'
import { CHESTS } from '../../config/chests'
import { LANDMARKS } from '../../config/landmarks'
import { PORTAL } from '../../config/portal'
import { playerTransform } from '../../state/playerTransform'
import { useGameStore } from '../../store/useGameStore'
import type { ChestId, LandmarkId } from '../../types/game'
import { Pagoda } from './Pagoda'
import { Portal } from './Portal'
import { Pyramid } from './Pyramid'
import { Ruins } from './Ruins'
import { Statue } from './Statue'
import { Stele } from './Stele'
import { Temple } from './Temple'
import { TreasureChest } from './TreasureChest'

/**
 * Les coffres de cette carte-ci.
 *
 * Filtré une fois au chargement du module et non à chaque rendu : la table est
 * constante. Le coffre de la rotonde vit sur l'Île Céleste, à 7,2 d'altitude ;
 * posé ici, il flotterait au-dessus du continent et son invite s'allumerait
 * sous les pieds du joueur qui passerait dessous. C'est `RotundaChest` qui le
 * monte, avec sa propre détection de proximité.
 */
const CONTINENT_CHESTS = CHESTS.filter((chest) => chest.map === 'continent')

/**
 * Découverte et mise à portée des points d'intérêt.
 *
 * Le test tourne à chaque frame mais ne touche au store **que sur transition** :
 * `getState()` évite l'abonnement, donc ce composant ne se re-rend jamais. Sans
 * ce soin, on re-rendrait le HUD soixante fois par seconde pour réafficher la
 * même invite.
 */
function LandmarkProximity() {
  useFrame(() => {
    const store = useGameStore.getState()
    const { position } = playerTransform

    let nearest: LandmarkId | null = null
    let nearestDistance = Infinity

    for (const landmark of LANDMARKS) {
      // Distance au sol : on peut découvrir le temple sans être à son altitude,
      // sinon le lieu ne se déclencherait qu'une fois l'escalier gravi.
      const distance = Math.hypot(position.x - landmark.x, position.z - landmark.z)

      if (distance < landmark.discoverRadius && !store.discovered.includes(landmark.id)) {
        store.discoverLandmark(landmark.id)
      }
      // Un lieu sans section n'ouvre rien : il se découvre et paraît sur la
      // minimap, mais il n'a ni braise ni promesse à tenir. On saute donc son
      // test de proximité plutôt que de lui inventer une ancre.
      if (landmark.section === null) continue

      // L'interaction se mesure sur son **ancre** et non sur le centre du
      // monument : c'est le marqueur lumineux qui promet quelque chose au
      // joueur, donc c'est autour de lui que la promesse doit être tenue.
      const toAnchor = Math.hypot(
        position.x - landmark.interact.x,
        position.z - landmark.interact.z,
      )
      if (toAnchor < landmark.interactRadius && toAnchor < nearestDistance) {
        nearest = landmark.id
        nearestDistance = toAnchor
      }
    }

    if (nearest !== store.nearbyLandmark) store.setNearbyLandmark(nearest)

    // Coffres : même discipline, dans la même boucle. Un second `useFrame` les
    // aurait fait balayer dans un ordre non garanti par rapport à celui-ci, et
    // la règle de priorité de `currentInteraction` aurait pu lire un état
    // vieux d'une frame.
    let chest: ChestId | null = null
    for (const candidate of CONTINENT_CHESTS) {
      // Un coffre ouvert ne propose plus rien : on saute le test, l'invite
      // disparaît d'elle-même.
      if (store.openedChests.includes(candidate.id)) continue
      const distance = Math.hypot(
        position.x - candidate.world.x,
        position.z - candidate.world.z,
      )
      if (distance < candidate.interactRadius) {
        chest = candidate.id
        break
      }
    }
    if (chest !== store.nearbyChest) store.setNearbyChest(chest)
  })

  return null
}

/**
 * Le portail du continent : celui qui s'ouvre quand la carte est vidée.
 *
 * Un composant d'une ligne, mais il porte l'abonnement à `portalOpenedAt` — et
 * c'est tout son intérêt. Le mettre dans `<Landmarks>` ferait re-rendre les six
 * monuments et les quatre coffres à l'ouverture du portail ; ici, le re-rendu ne
 * touche que lui.
 */
function ContinentPortal() {
  const openedAt = useGameStore((state) => state.portalOpenedAt)
  return <Portal at={PORTAL} openedAt={openedAt} to="sky" />
}

/** Tous les monuments de la carte, leurs coffres, et la logique de proximité. */
export function Landmarks() {
  return (
    <>
      <Temple />
      <Pyramid />
      <Stele />
      <Statue />
      <Ruins />
      <Pagoda />
      {/* Monté ici et non dans `Pagoda` bien qu'il appartienne à son parvis :
          la pagode décrit un bâtiment, le portail est un événement de partie
          qui se trouve posé devant. Les mélanger ferait dépendre la géométrie
          du temple de l'état du jeu. Même raison que les coffres, juste en
          dessous. */}
      <ContinentPortal />
      {/* Les coffres sont posés en coordonnées monde, dérivées du repère de
          leur monument (voir `config/chests.ts`) : ils sont donc montés ici, à
          plat, et non à l'intérieur du composant du monument qui les porte. */}
      {CONTINENT_CHESTS.map((chest) => (
        <TreasureChest key={chest.id} chest={chest} />
      ))}
      <LandmarkProximity />
    </>
  )
}
