import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { spawnFor } from '../config/portal'
import { playerBody } from '../state/playerBody'
import { playerTransform } from '../state/playerTransform'
import { useGameStore } from '../store/useGameStore'
import { preloadSkyIsland } from './skyisland/preload'

/**
 * Le passage d'une carte à l'autre.
 *
 * Même principe que `TeleportOverlay` — un voile plein écran séquencé en temps
 * **réel**, pendant que la phase est `paused` et que l'horloge de jeu est donc
 * arrêtée — mais un composant et une palette à part, et ce n'est pas de la
 * duplication : les deux gestes ne disent pas la même chose. Les braises
 * déplacent *dans* une carte, le violet en *change*. Les confondre apprendrait
 * au joueur que les deux sont interchangeables, et il finirait par chercher
 * l'île dans le menu de téléportation.
 *
 * **Le palier opaque est un plancher, pas une durée.** À 780 ms le voile couvre
 * l'écran ; la bascule n'a lieu qu'une fois le fragment de l'île réellement
 * arrivé. Sur une connexion normale il est là bien avant et rien ne se voit ;
 * sur une connexion lente, le voile reste opaque au lieu de découvrir un monde
 * vide. C'est la seule garantie qui tienne, et elle ne coûte rien dans le cas
 * courant.
 */

/** Montée du voile jusqu'à l'opacité pleine, en millisecondes de temps réel. */
const COVER_MS = 780
/**
 * Retrait du voile, une fois la carte basculée.
 *
 * Plus long que la montée, et volontairement : on quitte un lieu qu'on connaît
 * et on découvre un lieu qu'on ne connaît pas. Le temps de la découverte n'est
 * pas celui du départ.
 */
const REVEAL_MS = 900

export function WorldTransition() {
  const transit = useGameStore((state) => state.transit)
  const arriveOnMap = useGameStore((state) => state.arriveOnMap)
  const finishTransit = useGameStore((state) => state.finishTransit)

  useEffect(() => {
    if (!transit) return

    let cancelled = false
    let revealTimer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      // Les deux attentes en parallèle : le voile doit avoir couvert l'écran, et
      // le fragment doit être là. La plus longue des deux commande.
      try {
        await Promise.all([
          new Promise((resolve) => setTimeout(resolve, COVER_MS)),
          transit === 'sky' ? preloadSkyIsland() : Promise.resolve(),
        ])
      } catch {
        /*
          Le fragment n'est pas arrivé — réseau coupé, ou déploiement passé
          entre-temps et l'ancienne adresse n'existe plus.

          **On repose le voile et on reste où on est.** C'est le seul
          comportement acceptable : sans ce rattrapage, la promesse rejetée
          n'est reprise nulle part, le voyage ne se termine jamais, et le joueur
          se retrouve enfermé derrière un écran opaque et une partie en pause
          qu'aucune touche ne réveille. Il n'a plus qu'à recharger la page et il
          perd sa progression.

          On ne dit rien à l'écran, et c'est délibéré : le joueur revient
          exactement là où il était, devant un portail qu'il peut retenter. Une
          modale d'erreur sur un jeu de portfolio coûterait plus d'attention
          qu'elle n'en vaut, et le second essai réussit presque toujours — voir
          la remise à zéro de la mémoïsation dans `preload.ts`.
        */
        if (!cancelled) finishTransit()
        return
      }
      if (cancelled) return

      const spawn = spawnFor(transit)
      arriveOnMap()

      playerBody.current?.setTranslation(spawn, true)
      playerBody.current?.setLinvel({ x: 0, y: 0, z: 0 }, true)
      // `Player.tsx` n'écrit `playerTransform` que dans son propre `useFrame`,
      // qui ne fait rien hors de la phase `playing`. Sans cette écriture
      // manuelle, `CameraRig` — qui n'a lui aucune garde de phase — suivrait
      // l'ancienne position pendant tout le retrait du voile, et l'île se
      // découvrirait de travers.
      playerTransform.position.set(spawn.x, spawn.y, spawn.z)
      // Cap au nord, dans les deux sens : la caméra regarde le nord, le joueur
      // doit donc arriver face à ce qu'elle montre.
      playerTransform.yaw = Math.PI

      revealTimer = setTimeout(finishTransit, REVEAL_MS)
    }

    void run()

    return () => {
      cancelled = true
      clearTimeout(revealTimer)
    }
  }, [transit, arriveOnMap, finishTransit])

  if (!transit) return null

  return (
    <div
      className="world-transition"
      aria-hidden="true"
      style={{ '--cover': `${COVER_MS}ms` } as CSSProperties}
    >
      <div className="world-transition__veil" />
    </div>
  )
}
