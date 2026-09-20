/**
 * Le téléchargement du fragment de l'Outremonde, déclenché à la demande.
 *
 * Jumeau exact de `skyisland/preload.ts` et de `rot/preload.ts`, et pour les
 * mêmes raisons — voir l'en-tête du premier, qui les expose au long. En résumé :
 * ce fichier ne contient **que** l'`import()` paresseux, pour que le store et le
 * voile de transition puissent demander le fragment sans importer le composant,
 * ce qui créerait un cycle.
 *
 * Le corollaire vaut d'être répété une troisième fois, parce que c'est ici qu'il
 * est le plus facile à enfreindre : **rien du tronc commun ne doit importer un
 * module de `beyond/` autre que celui-ci.** La tentation est réelle — la carte
 * peuple ses ennemis depuis `config/beyondEnemies.ts`, qui importe la
 * configuration du Lynel, elle-même liée à celle de l'île. Un seul import
 * statique depuis `App.tsx` ou le HUD tirerait la moitié du jeu dans le bundle
 * d'accueil du site, et personne ne le remarquerait sans regarder l'onglet
 * réseau.
 *
 * Deux exceptions, et elles sont dans `config/` et non ici : `config/beyond.ts`
 * (la géographie, que le portail, la minimap et le filet de chute lisent) et
 * `config/challenge.ts` (les durées, que le HUD lit). Ce sont des constantes et
 * des fonctions pures, sans une ligne de `three` — quelques centaines d'octets.
 */
let pending: Promise<unknown> | null = null

export function preloadBeyond() {
  if (!pending) {
    pending = import('./Beyond').catch((error) => {
      // La mémoïsation ne doit pas mémoïser un échec : sans cette remise à zéro,
      // un réseau qui tousse une fois condamnerait l'Outremonde pour toute la
      // session. Même raisonnement que pour l'île et le Marais.
      pending = null
      throw error
    })
  }
  return pending
}
