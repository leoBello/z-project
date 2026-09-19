/**
 * Le téléchargement du fragment de l'Île Céleste, déclenché à la demande.
 *
 * Ce fichier ne contient **que** l'`import()` paresseux, et c'est la raison de
 * son existence : le store l'appelle au départ du voyage, le voile de transition
 * l'attend, et ni l'un ni l'autre ne doit pour autant importer le composant de
 * l'île. Mettre cette fonction dans `SkyIsland.tsx` créerait un cycle —
 * `useGameStore` → `SkyIsland` → `useGameStore` — qu'ESM résout mais qui casse
 * au premier import qui change d'ordre.
 *
 * Le corollaire vaut d'être écrit : **rien du tronc commun ne doit importer un
 * module de `skyisland/` autre que celui-ci.** Un seul import statique suffirait
 * à tirer toute l'île dans le bundle d'accueil, et le découpage ne se verrait
 * plus que dans l'onglet réseau — c'est-à-dire nulle part, tant que personne ne
 * regarde.
 *
 * La promesse est mémoïsée. Deux `import()` sur le même module se résolvent
 * certes au même objet, mais l'appelant ne peut pas le savoir : sans
 * mémoïsation, le voile séquencerait sa propre attente au lieu de partager
 * celle qui court déjà.
 */
let pending: Promise<unknown> | null = null

export function preloadSkyIsland() {
  if (!pending) {
    pending = import('./SkyIsland').catch((error) => {
      // **La mémoïsation ne doit pas mémoïser un échec.** Sans cette remise à
      // zéro, un réseau qui tousse une seule fois condamnerait l'île pour toute
      // la session : chaque tentative suivante recevrait la même promesse déjà
      // rejetée, sans jamais retenter le téléchargement. Le joueur verrait le
      // voile se lever, retomber, et n'aurait aucun moyen de comprendre.
      pending = null
      throw error
    })
  }
  return pending
}
