import { landmarkById } from '../config/landmarks'
import type { Dictionary } from '../i18n'
import type { ChestId, GamePhase, LandmarkId } from '../types/game'
import { useGameStore } from './useGameStore'

/**
 * Ce que la touche d'interaction déclenche à l'instant présent.
 *
 * Quatre endroits ont besoin de le savoir : le raccourci clavier, le bouton
 * tactile, l'invite du HUD qui annonce l'action, et le libellé accessible de ce
 * bouton. Ils le calculaient chacun de leur côté tant qu'il n'y avait qu'une
 * sorte de cible ; avec les coffres, quatre copies de la règle de priorité
 * auraient fini par diverger — et le pire cas d'une divergence, c'est une
 * invite qui promet une action et une touche qui en fait une autre.
 */

export type Interaction =
  | { kind: 'landmark'; id: LandmarkId }
  | { kind: 'chest'; id: ChestId }
  | null

/**
 * La règle de priorité, écrite une seule fois.
 *
 * **Le coffre l'emporte sur le monument.** Les deux zones sont trop éloignées
 * pour se recouvrir (voir la note de cotes sur `PYRAMID_CHEST`), donc ce
 * départage ne devrait jamais servir — mais un coffre est une action qui ne se
 * produit qu'une fois, alors qu'un panneau de portfolio se rouvre à volonté :
 * en cas d'égalité, c'est l'irréversible qui doit gagner.
 */
function pick(
  phase: GamePhase,
  nearbyChest: ChestId | null,
  nearbyLandmark: LandmarkId | null,
): Interaction {
  if (phase !== 'playing') return null
  if (nearbyChest) return { kind: 'chest', id: nearbyChest }
  if (nearbyLandmark) return { kind: 'landmark', id: nearbyLandmark }
  return null
}

/**
 * Cible d'interaction courante, **lue sans abonnement**.
 *
 * Pour les gestionnaires d'événement, qui ont besoin de la valeur à l'instant
 * du clic et n'ont rien à re-rendre.
 */
export function currentInteraction(): Interaction {
  const { phase, nearbyChest, nearbyLandmark } = useGameStore.getState()
  return pick(phase, nearbyChest, nearbyLandmark)
}

/**
 * Même chose, **avec abonnement**, pour les composants qui affichent l'invite.
 *
 * Les trois valeurs lues ne changent qu'à une transition — jamais par frame,
 * voir la discipline d'écriture de `LandmarkProximity` — donc s'y abonner ne
 * coûte pas un rendu par image.
 */
export function useInteraction(): Interaction {
  const phase = useGameStore((state) => state.phase)
  const nearbyChest = useGameStore((state) => state.nearbyChest)
  const nearbyLandmark = useGameStore((state) => state.nearbyLandmark)
  return pick(phase, nearbyChest, nearbyLandmark)
}

/**
 * Libellé de l'action proposée : « Ouvrir le coffre », « Lire la présentation »…
 *
 * Le libellé d'un monument est celui de **sa section**, pas du monument : les
 * cinq lieux qui en ont une proposent chacun d'ouvrir une page différente, et
 * ranger la phrase à côté du nom du lieu revenait à écrire deux fois la même
 * table. La chaîne vide couvre le cas d'un lieu sans section — il n'a alors ni
 * braise ni zone d'interaction, et ne peut donc pas être la cible ici.
 */
export function interactionLabel(target: Interaction, dict: Dictionary): string {
  if (!target) return ''
  if (target.kind === 'chest') return dict.ui.chest.action
  const section = landmarkById(target.id)?.section
  return section ? dict.ui.sectionActions[section] : ''
}

/**
 * Déclenche l'interaction courante. Sans effet s'il n'y en a pas.
 *
 * Appelée par le clavier comme par le bouton tactile : c'est le seul chemin
 * vers l'ouverture d'un coffre ou d'un panneau, donc les deux entrées ne
 * peuvent pas se comporter différemment.
 */
export function triggerInteraction() {
  const target = currentInteraction()
  if (!target) return
  const store = useGameStore.getState()
  if (target.kind === 'chest') store.openChest(target.id)
  else store.openLandmark(target.id)
}
