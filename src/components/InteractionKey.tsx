import { useEffect } from 'react'
import { useKeyboardControls } from '@react-three/drei'
import type { Control } from '../config/controls'
import { triggerInteraction } from '../store/interaction'
import { useGameStore } from '../store/useGameStore'

/**
 * La touche d'interaction, pour toutes les cartes.
 *
 * Elle vivait dans `<Landmarks>`, et c'était un défaut de rangement dont la
 * conséquence n'est apparue qu'avec la seconde carte : `<Landmarks>` n'est monté
 * que sur le continent, donc **plus rien n'écoutait F sur l'Île Céleste** — le
 * portail du retour affichait son invite et ne répondait pas. Le joueur était
 * enfermé sur l'île, avec un bouton qui promettait une sortie.
 *
 * Ce composant ne parle pas des monuments : il parle de la *touche*. Sa place
 * est donc auprès du joueur, pas auprès d'un décor. C'est la même leçon que le
 * filet de chute de `Player.tsx`, qui pointait sur le point d'apparition du
 * continent parce qu'il avait été écrit quand il n'y avait qu'une carte.
 *
 * Abonnement et non sondage dans `useFrame` : un appui plus court qu'une frame
 * serait perdu. C'est le piège déjà payé sur le saut et sur l'attaque, et il ne
 * coûte rien de ne pas le repayer.
 */
export function InteractionKey() {
  const [subscribeKeys] = useKeyboardControls<Control>()

  useEffect(
    () =>
      subscribeKeys(
        (state) => state.interact,
        (pressed) => {
          if (!pressed) return
          const store = useGameStore.getState()

          if (store.phase === 'playing') {
            // Une seule source de vérité pour « que fait la touche ici ? »,
            // partagée avec le bouton tactile et l'invite du HUD.
            triggerInteraction()
            return
          }

          /*
            Hors de la phase `playing`, F ne peut que *fermer* un panneau — et
            encore, seulement s'il y en a un.

            Les deux gardes couvrent les deux voyages : pendant une
            téléportation entre monuments comme pendant un passage d'une carte à
            l'autre, `phase === 'paused'` ne signifie pas qu'un panneau est
            ouvert. Sans eux, F relancerait la partie — physique et ennemis —
            derrière un voile encore opaque.
          */
          if (store.phase === 'paused' && store.teleporting === null && store.transit === null) {
            store.closeLandmark()
          }
        },
      ),
    [subscribeKeys],
  )

  return null
}
