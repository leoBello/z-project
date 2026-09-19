import { useEffect, useState } from 'react'
import { arrivalFor, arrivalYaw } from '../config/portal'
import { playerBody } from '../state/playerBody'
import { playerTransform } from '../state/playerTransform'
import { useGameStore } from '../store/useGameStore'
import type { MapId } from '../types/game'
import { EmberVeil } from './EmberVeil'
import { preloadSkyIsland } from './skyisland/preload'

/**
 * Le passage d'une carte à l'autre.
 *
 * Même voile de braises que la téléportation entre monuments — voir l'en-tête
 * d'`EmberVeil` pour la raison — mais un séquencement qui lui est propre, et la
 * différence est de fond : `TeleportOverlay` joue une ligne de temps fermée,
 * celle-ci doit **rester couverte aussi longtemps qu'il faut**.
 *
 * Trois choses doivent se produire sous le voile, et deux d'entre elles n'ont
 * pas de durée connue d'avance :
 *
 *  1. le fragment de l'île doit arriver — selon le réseau, quelques
 *     millisecondes ou plusieurs secondes ;
 *  2. React doit démonter le continent entier — terrain, végétation et ses
 *     colliders — et monter l'île ;
 *  3. le navigateur doit avoir **effectivement dessiné** une frame de la carte
 *     d'arrivée.
 *
 * Le troisième point est celui qu'on oublie, et c'est lui qui faisait « casser »
 * le jeu : la frame du basculement est de loin la plus lourde de la partie, et
 * elle se jouait pendant que le voile se retirait déjà. On attend donc deux
 * rafraîchissements après la bascule — le premier laisse React livrer son
 * rendu, le second garantit qu'une image l'a suivi — avant de découvrir quoi que
 * ce soit.
 *
 * Séquencé en **temps réel**, jamais sur l'horloge de jeu : celle-ci est
 * arrêtée, la phase étant passée à `paused` dès la demande de voyage.
 */

/** Montée du voile jusqu'à l'opacité pleine, en millisecondes de temps réel. */
const COVER_MS = 700
/**
 * Retrait du voile, une fois la carte montée et dessinée.
 *
 * Plus long que la montée, et volontairement : on quitte un lieu qu'on connaît
 * et on découvre un lieu qu'on ne connaît pas. Le temps de la découverte n'est
 * pas celui du départ.
 */
const REVEAL_MS = 900

/** Attend qu'une image ait réellement été dessinée. Voir l'en-tête. */
function afterPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/**
 * Le voyage lui-même, **remonté à chaque départ** grâce à sa `key`.
 *
 * C'est ce qui permet à `phase` de naître à `covering` au lieu d'être remise là
 * par un effet : un `setState` synchrone dans un effet relance un rendu pour
 * rien, et dit surtout que l'état aurait dû être dérivé plutôt que corrigé. Ici
 * le départ d'un voyage *est* une nouvelle instance — le remontage n'est pas un
 * artifice, c'est la description exacte de ce qui se passe.
 */
function Transit({ to }: { to: MapId }) {
  const arriveOnMap = useGameStore((state) => state.arriveOnMap)
  const finishTransit = useGameStore((state) => state.finishTransit)
  const [phase, setPhase] = useState<'covering' | 'revealing'>('covering')
  const transit = to

  useEffect(() => {
    let cancelled = false
    let endTimer: ReturnType<typeof setTimeout> | undefined

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
          comportement acceptable : sans ce rattrapage, la promesse rejetée n'est
          reprise nulle part, le voyage ne se termine jamais, et le joueur se
          retrouve enfermé derrière un écran opaque et une partie en pause
          qu'aucune touche ne réveille. Il n'a plus qu'à recharger la page, et il
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

      arriveOnMap()

      /*
        On attend que la carte soit montée **avant** de poser le joueur, et
        l'ordre est tout sauf indifférent.

        Le joueur était posé juste après `arriveOnMap()`, donc avant que React
        n'ait commité quoi que ce soit — et il se retrouvait au point de départ
        du continent, au centre de la carte, alors qu'il venait d'arriver dans
        le ciel. La raison tient au chargement différé : au tout premier rendu,
        `lazy()` suspend le temps de résoudre sa promesse, même quand le module
        est déjà en mémoire. React remonte alors le sous-arbre suspendu, le
        `<RigidBody>` du joueur est recréé, et il reprend la position littérale
        de sa prop — `PLAYER.spawn`. Notre `setTranslation` était écrasé.

        Le retour vers le continent ne montrait rien, puisque rien n'y est
        chargé en différé, donc rien n'y suspend : le défaut n'apparaissait que
        dans un sens, ce qui est exactement ce qui le rendait difficile à lire.

        Après le premier `afterPaint`, tout est monté et plus rien ne peut
        déplacer le joueur à notre place.
      */
      await afterPaint()
      if (cancelled) return

      const spawn = arrivalFor(transit)
      playerBody.current?.setTranslation(spawn, true)
      playerBody.current?.setLinvel({ x: 0, y: 0, z: 0 }, true)
      // `Player.tsx` n'écrit `playerTransform` que dans son propre `useFrame`,
      // qui ne fait rien hors de la phase `playing`. Sans cette écriture
      // manuelle, `CameraRig` — qui n'a lui aucune garde de phase — suivrait
      // l'ancienne position pendant tout le retrait du voile, et la carte se
      // découvrirait de travers.
      playerTransform.position.set(spawn.x, spawn.y, spawn.z)
      // Dos au portail, dans les deux sens — voir `arrivalYaw`.
      playerTransform.yaw = arrivalYaw(transit)

      // Une seconde image, pour que la caméra ait rattrapé le joueur avant
      // qu'on ne découvre quoi que ce soit.
      await afterPaint()
      if (cancelled) return

      setPhase('revealing')
      endTimer = setTimeout(finishTransit, REVEAL_MS)
    }

    void run()

    return () => {
      cancelled = true
      clearTimeout(endTimer)
    }
  }, [transit, arriveOnMap, finishTransit])

  return <EmberVeil phase={phase} durationMs={phase === 'covering' ? COVER_MS : REVEAL_MS} />
}

export function WorldTransition() {
  const transit = useGameStore((state) => state.transit)
  if (!transit) return null
  return <Transit key={transit} to={transit} />
}
