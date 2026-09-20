import { SANCTUARY, SANCTUARY_TRUCE_R } from '../config/beyond'
import { playerTransform } from './playerTransform'

/**
 * La trêve du Sanctuaire, partagée **hors de React**.
 *
 * Même idiome que `playerTransform`, `parry` et `rot` : un objet mutable, écrit
 * une fois par frame, lu par des boucles qui tournent à soixante images par
 * seconde. Un state React aurait re-rendu tous les ennemis de la carte deux fois
 * par franchissement de la lisière.
 *
 * **Pourquoi un drapeau partagé, et non un test dans chaque ennemi.** Chaque
 * bête pourrait comparer la position du joueur au centre du sanctuaire et
 * conclure elle-même : c'est une racine carrée, quatre-vingts fois par frame. Ce
 * n'est pas le coût qui tranche — c'est qu'il y aurait alors quatre-vingts
 * versions de la règle, et que le jour où la zone franche changerait de rayon,
 * il en resterait une pour l'ignorer. La question « la paix règne-t-elle ? » n'a
 * qu'une réponse à un instant donné ; elle est donc calculée une fois.
 *
 * **Ce que la trêve fait, et ce qu'elle ne fait pas.** Elle empêche de
 * *poursuivre* et d'*attaquer*. Elle n'efface pas les ennemis, ne les empêche pas
 * d'exister, et surtout **n'empêche pas de les tuer** : on peut très bien viser
 * depuis le dallage un Moblin qui s'est arrêté à la lisière. C'est voulu — une
 * zone franche qui protégerait aussi l'adversaire serait un mur, et un mur n'a
 * pas besoin d'être expliqué par un vieux maître assis sur une borne.
 */
export const sanctuary = {
  /**
   * Le joueur est-il dans la zone franche ?
   *
   * Faux partout ailleurs que sur l'Outremonde, et c'est le composant du
   * sanctuaire qui l'entretient : il n'est monté que là. Les ennemis des autres
   * cartes lisent donc `false` sans avoir à savoir sur quelle carte ils sont.
   */
  safe: false,
}

/**
 * Recalcule la trêve depuis la position courante du joueur.
 *
 * Appelée par le composant du Sanctuaire, une fois par frame, et par lui seul.
 * Le rayon est celui de la trêve et non celui du dallage — voir
 * `SANCTUARY_TRUCE_R`.
 */
export function updateSanctuary() {
  const { position } = playerTransform
  sanctuary.safe =
    Math.hypot(position.x - SANCTUARY.x, position.z - SANCTUARY.z) < SANCTUARY_TRUCE_R
}

/**
 * Lève la trêve.
 *
 * Appelée au démontage du Sanctuaire, c'est-à-dire en quittant l'Outremonde.
 * Sans elle, un joueur qui repart du dallage par le portail laisserait la paix
 * derrière lui : `safe` resterait à `true` pour toute la partie, et plus aucun
 * ennemi du jeu n'attaquerait jamais. C'est le genre de bug qu'on ne trouve
 * qu'en se demandant pourquoi le jeu est devenu facile.
 */
export function clearSanctuary() {
  sanctuary.safe = false
}
