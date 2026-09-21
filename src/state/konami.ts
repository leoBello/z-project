/**
 * Reconnaissance du code Konami — ↑ ↑ ↓ ↓ ← → ← → B A.
 *
 * Séparé du composant, et pas pour la forme : c'est de la logique de chaîne de
 * caractères, elle se teste sans React ni partie en cours, et la version
 * précédente — un simple compteur d'avancement dans le composant — avait un
 * défaut que seul un test de séquence complète pouvait attraper. Voir plus bas.
 */

/**
 * La séquence, en **lettres** et non en codes physiques.
 *
 * C'est l'exception à la règle du projet — la table des commandes déclare des
 * codes (`KeyW`, `KeyA`) pour que WASD devienne ZQSD en AZERTY sans réglage.
 * Ici c'est l'inverse qu'il faut : le code Konami se finit par « B, A », deux
 * *lettres*, et un joueur sur clavier AZERTY qui cherche le A appuie sur la
 * touche marquée A. Raisonner en position physique lui demanderait d'appuyer
 * sur Q. On lit donc `event.key`, qui rend la lettre réellement produite par la
 * disposition active.
 *
 * Les deux graphies sont acceptées malgré tout, `key` puis `code` : sur une
 * disposition exotique où la lettre B ne se trouve nulle part, la position
 * physique reste un dernier recours plutôt qu'une impasse.
 */
export const SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const

/**
 * Ce qu'on retient d'un appui : de quoi rejouer `matches`, et rien de plus.
 *
 * On recopie les deux champs plutôt que de garder l'événement : l'historique
 * vit aussi longtemps que la partie, et retenir dix `KeyboardEvent` retient
 * avec eux dix `target`, donc dix nœuds du DOM.
 */
export type Keystroke = Pick<KeyboardEvent, 'key' | 'code'>

/** Vrai si cet appui est celui qu'attend l'étape `step` de la séquence. */
function matches(stroke: Keystroke, step: number) {
  const expected = SEQUENCE[step]
  if (expected.startsWith('Arrow')) return stroke.key === expected
  // Lettre : la disposition d'abord, la position physique en second recours.
  return stroke.key.toLowerCase() === expected || stroke.code === `Key${expected.toUpperCase()}`
}

/**
 * Suivi de la saisie, appui par appui. `push` rend `true` sur le dernier appui
 * d'un code complet.
 *
 * **Une fenêtre glissante sur les dix derniers appuis, et non un compteur
 * d'avancement.** C'est le fond de la correction, et ça mérite l'explication
 * parce que le compteur avait l'air juste.
 *
 * Il tenait l'étape atteinte, et repartait de zéro au premier faux pas — sauf
 * si ce faux pas était lui-même un ↑, auquel cas il repartait de un. Cette
 * nuance ne suffit pas : après un échec, il faut re-tester la touche courante
 * contre la nouvelle étape, et recommencer tant que ça échoue. Sans cette
 * boucle, **un seul ↑ de trop avant le code le condamne en entier** :
 *
 *     ↑ (le joueur marchait) → étape 1
 *     ↑ (début du code)      → étape 2
 *     ↑                      → on attendait ↓ ; retour à l'étape 1
 *     ↓                      → on attendait ↑ ; retour à l'étape 0
 *     ↓ ← → ← → B A          → plus rien ne rattrape, le code est perdu
 *
 * Le joueur retape alors le code, qui part cette fois d'un compteur propre et
 * fonctionne. C'était le « des fois il ne marche qu'à la deuxième ».
 *
 * Et le cas mordait pour de bon : ↑ est la touche pour **avancer** (voir
 * `config/controls.ts`), donc il suffisait d'avoir marché vers le nord juste
 * avant de taper. Même chose pour le ↑ hésitant d'un joueur qui se reprend, que
 * l'ancien en-tête croyait justement traiter.
 *
 * Comparer les dix derniers appuis à la séquence supprime la question : il n'y
 * a plus d'état à rattraper, donc plus de rattrapage à rater. Dix comparaisons
 * par touche, c'est-à-dire rien.
 */
export function createKonamiTracker() {
  const recent: Keystroke[] = []

  return {
    push(stroke: Keystroke): boolean {
      recent.push({ key: stroke.key, code: stroke.code })
      if (recent.length > SEQUENCE.length) recent.shift()
      if (recent.length < SEQUENCE.length) return false

      for (let i = 0; i < SEQUENCE.length; i++) {
        if (!matches(recent[i], i)) return false
      }

      // Vidée : le code se retape en entier pour frapper une seconde fois, il
      // ne se rejoue pas sur sa dernière touche.
      recent.length = 0
      return true
    },
  }
}
