import { useFrame } from '@react-three/fiber'
import { advance } from '../state/gameClock'
import { useGameStore } from '../store/useGameStore'

/**
 * Avance l'horloge de jeu, une fois par frame et avant tout le monde.
 *
 * La priorité `-100` sert **uniquement à l'ordre**. react-three-fiber trie ses
 * abonnés par priorité croissante : un ennemi qui lirait l'horloge avant
 * qu'elle n'ait avancé travaillerait sur la frame précédente, et tous les
 * délais de gameplay auraient une frame de retard.
 *
 * On lit souvent qu'une priorité positive « reprend la main sur la boucle de
 * rendu et laisse l'écran noir ». Vérifié dans ce projet : c'est faux ici.
 * `<PostFX />` monte un `<EffectComposer>` qui s'abonne déjà avec
 * `renderPriority = 1`, donc r3f est **déjà** en rendu manuel et le composer
 * dessine l'image quoi qu'il arrive. Le contrôle a été fait en passant à
 * `100` : la scène s'affiche normalement, seul l'ordre se dérègle. Le signe
 * reste donc le bon choix, mais pas pour la raison qu'on croit.
 *
 * Le clamp est le même que celui du déplacement du joueur, et c'est tout
 * l'intérêt de la manœuvre : les deux avancent désormais du même pas.
 */
export function GameClock() {
  useFrame((_, rawDelta) => {
    if (useGameStore.getState().phase !== 'playing') return
    advance(Math.min(rawDelta, 0.05))
  }, -100)

  return null
}
