import { useEffect } from 'react'
import { CHEST_SEQUENCE, chestById } from '../../config/chests'
import { useGameStore } from '../../store/useGameStore'
import { ItemCard } from './ItemCard'

/**
 * Volet DOM de l'ouverture d'un coffre.
 *
 * Il ne dessine rien du coffre lui-même — couvercle, colonne de lumière,
 * éclats et objet flottant vivent dans la scène 3D (`TreasureChest`). Son seul
 * travail est de **tenir le minuteur** et d'ouvrir la carte au bon moment.
 *
 * Séquencé en `setTimeout`, jamais sur l'horloge de jeu : celle-ci est gelée
 * dès l'appui, la phase passant à `paused` (voir `openChest`). C'est la même
 * contrainte que `TeleportOverlay`, et le même remède.
 *
 * Le voile sombre qui accompagne la séquence est ici et non dans le Canvas :
 * il doit assombrir toute la page, HUD compris, pour que rien ne dispute
 * l'attention à ce qui sort du coffre.
 */
export function ChestReveal() {
  const chestReveal = useGameStore((state) => state.chestReveal)
  const activeItem = useGameStore((state) => state.activeItem)
  const resolveChest = useGameStore((state) => state.resolveChest)
  const finishChest = useGameStore((state) => state.finishChest)

  useEffect(() => {
    if (!chestReveal) return
    const timer = setTimeout(resolveChest, CHEST_SEQUENCE.cardAt)
    // Nettoyé au démontage : sans ça, un redémarrage de partie déclenché
    // pendant la séquence rouvrirait une carte sur la partie suivante.
    return () => clearTimeout(timer)
  }, [chestReveal, resolveChest])

  if (!chestReveal) return null
  const chest = chestById(chestReveal)
  if (!chest) return null

  return (
    <>
      <div className="chest-reveal" aria-hidden="true" />
      {/*
        La carte n'apparaît qu'à `resolveChest`, pas dès l'ouverture : la
        montrer plus tôt reviendrait à jouer l'animation derrière un rideau.
        Sa fermeture — et elle seule — fait entrer l'objet à l'inventaire et
        rend la main au jeu.
      */}
      {activeItem && <ItemCard id={activeItem} context="reveal" onClose={finishChest} />}
    </>
  )
}
