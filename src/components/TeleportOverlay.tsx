import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { EMBER_OFFSETS } from '../config/embers'
import { landmarkArrival, landmarkById } from '../config/landmarks'
import { placePlayer } from '../state/playerBody'
import { useGameStore } from '../store/useGameStore'



/** Durée entre le déclenchement et le "warp", en millisecondes — écran couvert. */
const WARP_AT_MS = 700
/**
 * Durée totale de la séquence, source unique de vérité : injectée dans le CSS
 * via la variable `--teleport-total` (voir le rendu plus bas), qui pilote la
 * durée des animations `teleport-veil` / `teleport-ember` dans index.css. Seuls
 * les paliers en pourcentage à l'intérieur de ces `@keyframes` restent à
 * maintenir à la main s'ils changent : couverture progressive jusqu'à 39 %,
 * palier "écran couvert" (c'est là que le warp se déclenche) de 39 % à 44 %,
 * puis dispersion inverse des braises avec fondu de 44 % à 78 %, et enfin un
 * palier calme "écran dégagé" de 78 % à 100 % qui laisse le temps d'observer
 * la destination avant l'ouverture de la modale.
 */
const TOTAL_MS = 1800

/**
 * Écran de transition affiché pendant une téléportation lancée depuis le menu.
 *
 * Séquencé en **temps réel** (`setTimeout`), jamais via l'horloge de jeu :
 * elle est gelée pendant toute la durée, la phase étant passée à `paused` dès
 * la demande de téléportation (voir `teleportTo` dans le store).
 */
export function TeleportOverlay() {
  const teleporting = useGameStore((state) => state.teleporting)
  const resolveTeleport = useGameStore((state) => state.resolveTeleport)
  const finishTeleport = useGameStore((state) => state.finishTeleport)

  useEffect(() => {
    if (!teleporting) return

    // Écran couvert (palier 39 %–44 %) : on déplace le joueur pendant qu'il
    // est encore caché sous les braises. On ne fait QUE le déplacement
    // physique ici — la modale ne s'ouvre volontairement pas à ce stade, pour
    // laisser l'animation de dispersion se jouer sans être masquée par elle.
    const warpTimer = setTimeout(() => {
      const landmark = landmarkById(teleporting)
      if (!landmark) return

      // Posé devant la braise et face au monument — le même point d'arrivée que
      // le voyage de retour depuis l'Île Céleste, qui appelle la même table.
      const arrival = landmarkArrival(landmark)
      placePlayer(arrival, arrival.yaw)
    }, WARP_AT_MS)

    // Fin de séquence : les braises ont fini de se disperser et le palier
    // calme "écran dégagé" (78 %–100 %) s'est écoulé. Le délai est
    // intentionnel : il laisse le joueur voir la dispersion inverse des
    // braises puis ses nouvelles environs avant que la modale n'apparaisse.
    const endTimer = setTimeout(() => {
      resolveTeleport()
      finishTeleport()
    }, TOTAL_MS)

    return () => {
      clearTimeout(warpTimer)
      clearTimeout(endTimer)
    }
  }, [teleporting, resolveTeleport, finishTeleport])

  if (!teleporting) return null

  return (
    <div
      className="teleport-overlay"
      aria-hidden="true"
      style={{ '--teleport-total': `${TOTAL_MS}ms` } as CSSProperties}
    >
      <div className="teleport-overlay__veil" />
      {EMBER_OFFSETS.map(([dx, dy]) => (
        <span
          key={`${dx}-${dy}`}
          className="teleport-overlay__ember"
          style={{ '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties}
        />
      ))}
    </div>
  )
}
