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
const WARP_AT_MS = 380
/** Durée totale de la séquence — doit correspondre à `teleport-veil` / `teleport-ember` dans index.css. */
const TOTAL_MS = 760

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

    // À mi-animation, écran couvert : on déplace le joueur et on ouvre la
    // modale, qui commence son propre fondu d'apparition sous les braises
    // encore pleines.
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

      resolveTeleport()
    }, WARP_AT_MS)

    // Fin de séquence : les braises ont fini de se disperser.
    const endTimer = setTimeout(finishTeleport, TOTAL_MS)

    return () => {
      clearTimeout(warpTimer)
      clearTimeout(endTimer)
    }
  }, [teleporting, resolveTeleport, finishTeleport])

  if (!teleporting) return null

  return (
    <div className="teleport-overlay" aria-hidden="true">
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
