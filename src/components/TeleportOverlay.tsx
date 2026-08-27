import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { PLAYER } from '../config/gameplay'
import { landmarkById } from '../config/landmarks'
import { playerBody } from '../state/playerBody'
import { playerTransform } from '../state/playerTransform'
import { useGameStore } from '../store/useGameStore'

/** Décalages des huit braises, en pixels, autour du centre de l'écran. */
const EMBER_OFFSETS: ReadonlyArray<[number, number]> = [
  [-120, -40],
  [100, -60],
  [-60, -110],
  [130, 30],
  [-140, 20],
  [40, -130],
  [-30, 110],
  [110, 90],
]

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

      const x = landmark.interact.x
      const z = landmark.interact.z
      // Même relation que `Player.tsx` entre la hauteur du sol et le centre
      // de la capsule : le joueur atterrit posé, ni enfoncé ni flottant.
      const y = landmark.altitude + PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius
      // Face au monument, pas de dos.
      const yaw = Math.atan2(landmark.x - x, landmark.z - z)

      playerBody.current?.setTranslation({ x, y, z }, true)
      playerBody.current?.setLinvel({ x: 0, y: 0, z: 0 }, true)

      // `Player.tsx` n'écrit `playerTransform` que dans son propre
      // `useFrame`, qui ne fait rien tant que la phase n'est pas `playing`.
      // Sans cette écriture manuelle, `CameraRig` — qui n'a lui aucune garde
      // de phase — continuerait de suivre l'ancienne position pendant toute
      // la lecture de la modale.
      playerTransform.position.set(x, y, z)
      playerTransform.yaw = yaw
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
