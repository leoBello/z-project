/**
 * Le téléchargement du fragment du Marais d'Aeonia, déclenché à la demande.
 *
 * Jumeau exact de `skyisland/preload.ts`, et pour les mêmes raisons — voir son
 * en-tête, qui les expose au long. En résumé : ce fichier ne contient **que**
 * l'`import()` paresseux, pour que le store et le voile de transition puissent
 * demander le fragment sans importer le composant, ce qui créerait un cycle.
 *
 * Le corollaire vaut d'être répété : **rien du tronc commun ne doit importer un
 * module de `rot/` autre que celui-ci.** Un seul import statique suffirait à
 * tirer tout le Marais — et bientôt Malenia — dans le bundle d'accueil du site.
 * C'est le fragment le plus lourd des trois cartes, et personne ne le
 * remarquerait sans regarder l'onglet réseau.
 */
let pending: Promise<unknown> | null = null

export function preloadRotMarsh() {
  if (!pending) {
    pending = import('./RotMarsh').catch((error) => {
      // La mémoïsation ne doit pas mémoïser un échec : sans cette remise à zéro,
      // un réseau qui tousse une fois condamnerait le Marais pour toute la
      // session. Même raisonnement que pour l'île.
      pending = null
      throw error
    })
  }
  return pending
}
