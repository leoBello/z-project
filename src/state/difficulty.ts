import { difficultyById, type DifficultyId } from '../config/challenge'

/**
 * La difficulté courante de l'Outremonde, partagée **hors de React**.
 *
 * Même idiome que `playerTransform`, `parry`, `rot` et `sanctuary` : un objet
 * mutable, écrit aux transitions, lu par des boucles qui tournent à soixante
 * images par seconde.
 *
 * **Pourquoi hors du store.** Trois lecteurs, et aucun n'est un composant
 * d'interface : `Enemy` et `Lynel` s'en servent pour calibrer leurs points de vie
 * à l'apparition, et `damagePlayer` pour savoir ce qu'un coup coûte. Les faire
 * passer par un abonnement zustand les re-rendrait tous à chaque changement de
 * réglage, pour une valeur qu'ils ne lisent qu'à des instants précis.
 *
 * **Elle ne vaut que sur l'Outremonde**, et c'est l'appelant qui en décide : le
 * store la pose à l'arrivée sur la carte et la remet à un en la quittant. Les
 * trois autres cartes lisent donc toujours des multiplicateurs neutres sans
 * avoir à savoir que ce module existe. C'est la discipline de `sanctuary.ts`,
 * pour la même raison : une règle qui ne vaut qu'ici ne doit pas obliger le
 * reste du jeu à se demander où il est.
 */
export const difficulty = {
  /** Ce que le joueur encaisse, multiplié. */
  damage: 1,
  /** Ce que les bêtes encaissent, multiplié. */
  hp: 1,
  /** Ce que la victoire vaut, multiplié. Lu par le store, pas par les bêtes. */
  score: 1,
}

/** Pose les trois multiplicateurs d'une difficulté nommée. */
export function applyDifficulty(id: DifficultyId) {
  const chosen = difficultyById(id)
  difficulty.damage = chosen.damage
  difficulty.hp = chosen.hp
  difficulty.score = chosen.score
}

/**
 * Remet les multiplicateurs à neutre.
 *
 * Appelée en quittant l'Outremonde. Sans elle, un joueur qui repart du
 * Sanctuaire en difficile emporterait ses dégâts majorés sur le continent :
 * exactement le défaut qu'avait la trêve avant qu'on ne la lève au démontage, et
 * il est encore plus difficile à voir ici — un jeu devenu un peu plus dur ne
 * ressemble pas à un bug.
 */
export function resetDifficulty() {
  difficulty.damage = 1
  difficulty.hp = 1
  difficulty.score = 1
}

/**
 * Les points de vie d'une bête, à la difficulté courante.
 *
 * Arrondis et plancher à un : `Math.round(2 * 0.7)` vaut 1, ce qui est le
 * comportement voulu pour un Octorok en facile — mais un plancher est
 * indispensable, un ennemi à zéro point de vie ne pourrait jamais mourir
 * puisque `hp <= 0` est testé **après** le retrait des dégâts.
 */
export function scaledHp(base: number) {
  return Math.max(1, Math.round(base * difficulty.hp))
}
