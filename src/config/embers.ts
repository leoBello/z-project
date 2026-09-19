/**
 * La constellation des braises du voyage.
 *
 * Huit décalages en pixels, autour du centre de l'écran. Ils vivent dans leur
 * propre module pour une raison simple : **les deux voyages du jeu doivent
 * partager la même constellation**, et deux tables identiques recopiées auraient
 * divergé au premier réglage. Le joueur aurait alors appris, sans pouvoir le
 * formuler, que la téléportation entre monuments et le passage d'une carte à
 * l'autre ne sont pas le même geste — alors qu'ils le sont.
 *
 * Ici plutôt qu'à côté de l'un des deux composants : un fichier qui exporte une
 * constante *et* un composant casse le rafraîchissement à chaud de React.
 */
export const EMBER_OFFSETS: ReadonlyArray<[number, number]> = [
  [-120, -40],
  [100, -60],
  [-60, -110],
  [130, 30],
  [-140, 20],
  [40, -130],
  [-30, 110],
  [110, 90],
]
