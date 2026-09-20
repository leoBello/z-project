import { ROT } from '../config/rotBlight'
import { now as gameNow } from './gameClock'

/**
 * La jauge de pourriture écarlate, partagée **hors de React**.
 *
 * Même raison que `parry` et `playerTransform` : trois boucles y touchent à
 * chaque frame — le marais y verse quand le joueur a les pieds dedans, Malenia
 * y verse à chaque coup de la phase II, et le bandeau du HUD y lit ce qu'il doit
 * dessiner. Un state React re-rendrait tout le HUD soixante fois par seconde
 * pour faire bouger une barre de quelques pixels.
 *
 * **C'est une jauge, pas un dégât par seconde**, et c'était la question 03 de la
 * maquette. La version pauvre — un cœur toutes les trois secondes tant qu'on a
 * les pieds dans l'eau — coûtait presque rien et supprimait tout ce qui rend ce
 * personnage intéressant : l'accumulation. Une jauge qu'on voit monter change la
 * façon dont on traverse une flaque ; un dégât périodique ne change que la
 * vitesse à laquelle on la traverse.
 *
 * Elle ne fait **rien** tant qu'elle n'est pas pleine. Et quand elle l'est, elle
 * ne se négocie plus : la contamination part, et sortir de l'eau ne l'arrête
 * pas. C'est la seule mécanique du jeu où l'erreur est déjà commise au moment où
 * on la voit.
 */
export const rot = {
  /** Niveau courant, de 0 à `ROT.max`. */
  level: 0,
  /** Dernier versement, quelle qu'en soit la source. Commande le délai de reflux. */
  lastSoakAt: -Infinity,
  /** Fin de la contamination en cours, ou `-Infinity` si elle ne court pas. */
  contaminatedUntil: -Infinity,
  /** Dernier cœur prélevé par la contamination. */
  lastTickAt: -Infinity,
  /**
   * Instant du dernier déclenchement, pour le retour visuel du HUD.
   *
   * Séparé de `contaminatedUntil` parce que le bandeau doit pouvoir rejouer son
   * animation : une durée de fin ne dit pas *quand* ça a commencé.
   */
  contaminatedAt: -Infinity,
}

/**
 * Solde une contamination arrivée à son terme : la jauge repart de zéro.
 *
 * Extraite parce que **deux** entrées peuvent en constater la fin, et que
 * l'ordre dans lequel elles tombent ne se décide pas ici : `RotBlight` verse
 * avant de sonder, donc dès que le joueur a encore les pieds dans l'eau à la
 * seconde où la contamination expire, c'est `soakRot` qui voit l'expiration en
 * premier.
 *
 * Tant que `tickRot` était seule à savoir solder, ce versement-là retrouvait une
 * jauge encore pleine — `level` vaut `ROT.max` pendant toute la contamination —
 * et en rallumait donc une deuxième pour dix secondes, puis une troisième, sans
 * fin tant qu'on pataugeait. C'est-à-dire exactement pendant qu'on cherche à
 * sortir, et la sortie est à plusieurs secondes de nage.
 */
function settleContamination(now: number) {
  if (rot.contaminatedUntil === -Infinity || now < rot.contaminatedUntil) return
  rot.level = 0
  rot.contaminatedUntil = -Infinity
}

/**
 * Verser de la pourriture.
 *
 * Appelée par le marais (au temps passé dans l'eau) comme par Malenia (à la
 * touche). Les deux sources sont volontairement indiscernables ici : la jauge ne
 * retient pas d'où ça vient, seulement combien.
 *
 * **Sans effet pendant une contamination.** Sinon la jauge se remplirait pendant
 * les dix secondes où elle se vide déjà en cœurs, et le joueur qui a le malheur
 * d'être contaminé dans l'eau y enchaînerait deux contaminations d'affilée sans
 * avoir eu la moindre fenêtre pour en sortir.
 */
export function soakRot(amount: number, now = gameNow()) {
  if (now < rot.contaminatedUntil) return
  // Celle qui vient de finir est soldée avant d'accepter quoi que ce soit :
  // sans cette ligne, le versement de la frame d'expiration retombe sur une
  // jauge pleine et rechaîne. Voir `settleContamination`.
  settleContamination(now)
  rot.lastSoakAt = now
  rot.level = Math.min(ROT.max, rot.level + amount)
  if (rot.level >= ROT.max) {
    rot.contaminatedAt = now
    rot.contaminatedUntil = now + ROT.contaminationMs
    // Le premier cœur part **tout de suite**, et pas au bout d'un intervalle :
    // le seuil doit se sentir à l'instant où il est franchi. Sans ça, la jauge
    // se remplit, le bandeau s'allume, et il ne se passe rien pendant deux
    // secondes et demie — ce qui apprend au joueur que le seuil est inoffensif.
    rot.lastTickAt = -Infinity
  }
}

/**
 * Le reflux et la contamination, une fois par frame.
 *
 * Rend le nombre de cœurs à retirer à cette frame — zéro presque toujours. Le
 * prélèvement lui-même n'est pas fait ici : ce module ne connaît pas le store,
 * et c'est ce qui permet de le tester sans partie en cours.
 *
 * `delta` est en **secondes**, comme celui de `useFrame` : le reflux est un
 * débit, et le multiplier par autre chose que du temps le rendrait dépendant du
 * taux de rafraîchissement.
 */
export function tickRot(now: number, delta: number): number {
  if (now < rot.contaminatedUntil) {
    if (now - rot.lastTickAt < ROT.tickMs) return 0
    rot.lastTickAt = now
    return 1
  }

  // La contamination vient de finir : la jauge repart de zéro. Elle a été payée.
  // Le plus souvent `soakRot` a déjà soldé, dans la même frame et quelques
  // lignes plus haut chez l'appelant — mais pas quand le joueur est sorti de
  // l'eau entre-temps, auquel cas plus personne ne verse et c'est ici que ça se
  // passe.
  settleContamination(now)

  // Le reflux ne commence qu'après un délai sans versement : traverser une
  // flaque en courant ne doit pas revenir gratuit parce qu'on en est sorti.
  if (now - rot.lastSoakAt < ROT.refluxDelayMs) return 0
  rot.level = Math.max(0, rot.level - ROT.refluxPerSecond * delta)
  return 0
}

/**
 * La purge — un cœur ramassé nettoie tout.
 *
 * C'est la seule sortie, et c'est ce qui donne aux créatures de la traversée une
 * raison d'exister : elles ne sont pas là pour le défi, elles sont là pour que le
 * joueur arrive avec une réserve. Elle annule aussi une contamination en cours,
 * ce qui fait du cœur ramassé au bon moment le geste le plus rentable du combat.
 */
export function purgeRot() {
  rot.level = 0
  rot.contaminatedUntil = -Infinity
  rot.lastSoakAt = -Infinity
}

/** Remet tout à plat : nouvelle partie, ou départ du Marais. */
export function resetRot() {
  rot.level = 0
  rot.lastSoakAt = -Infinity
  rot.contaminatedUntil = -Infinity
  rot.contaminatedAt = -Infinity
  rot.lastTickAt = -Infinity
}

/*
  Crochets de développement.

  Même raison que `__parry` : la jauge met une dizaine de secondes à se remplir
  au rythme du marais, et la contamination en dure dix de plus. On ne peut pas
  *jouer* la situation à chaque essai, il faut pouvoir la poser.
*/
if (import.meta.env.DEV) {
  const hooks = window as unknown as Record<string, unknown>
  hooks.__rot = {
    state: rot,
    soak: soakRot,
    purge: purgeRot,
    /** Remplit la jauge d'un coup et déclenche la contamination. */
    fill: () => soakRot(ROT.max),
  }
}
