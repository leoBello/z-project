import { sampleHeight } from '../config/world'

/**
 * Le sol de la carte courante, partagé **hors de React**.
 *
 * Même idiome que `playerTransform`, `sanctuary` et `difficulty` : un objet
 * mutable, écrit aux transitions de carte, lu par des boucles qui tournent à
 * soixante images par seconde.
 *
 * **Le défaut qu'il corrige.** Les pools intégrés à la main — les cœurs, et rien
 * d'autre pour l'instant — sont montés une seule fois, dans `App.tsx`, donc
 * vivent au-dessus des quatre cartes. Ils interrogeaient `sampleHeight`, c'est-à-
 * dire le relief du **continent**, en dur. Tant que le continent était le seul
 * monde à lâcher des cœurs, c'était exact ; l'Outremonde est un second champ de
 * hauteurs (voir `BEYOND_SHAPE`), et sur quarante-neuf des soixante-sept postes
 * de ses bêtes les deux reliefs s'écartent assez pour sortir le cœur de la portée
 * verticale du ramassage — jusqu'à onze unités d'écart. Le
 * cœur se posait donc à l'altitude qu'aurait eue le continent à ces coordonnées :
 * enfoncé sous le sol visible, ou suspendu au-dessus, et dans les deux cas hors
 * de portée du joueur. Trois cœurs sur quatre ne soignaient pas, ce qui se lit en
 * jouant comme « parfois ça ne marche pas » — la pire forme d'un bug.
 *
 * **Pourquoi un pointeur partagé plutôt qu'une lecture de `location`.** Choisir
 * la forme depuis le store obligerait `Pickups` à importer `config/beyond.ts`,
 * donc tirerait la configuration de l'Outremonde dans le bundle d'accueil —
 * exactement ce que le découpage en fragments protège. Ici c'est la carte qui se
 * déclare, au montage, comme le Sanctuaire déclare sa trêve : les composants
 * partagés n'ont jamais à savoir où ils sont.
 *
 * **Le continent est le défaut**, et pas un `null` à tester : les deux autres
 * cartes — l'Île Céleste et le Marais — ne lâchent aucun cœur, donc personne n'y
 * lit ce sol. Le jour où l'une d'elles en lâchera, elle posera le sien au
 * montage, et c'est la seule ligne qu'elle aura à écrire.
 */
export const ground = {
  /** Altitude du sol visible en (x, z), sur la carte où l'on se trouve. */
  height: sampleHeight as (x: number, z: number) => number,
}

/**
 * Déclare le relief de la carte qu'on vient de monter.
 *
 * Appelée par le composant racine de cette carte-là, et par lui seul. La
 * fonction passée est celle de sa `WorldShape` : une seule source de vérité du
 * relief par monde, celle que le terrain, l'eau et le semis lisent déjà.
 */
export function applyGround(height: (x: number, z: number) => number) {
  ground.height = height
}

/**
 * Rend le sol au continent.
 *
 * Appelée au démontage de la carte qui l'avait pris, c'est-à-dire en la
 * quittant. Sans elle, un joueur qui repart de l'Outremonde emporterait son
 * relief sur le continent, et le défaut changerait simplement de carte.
 */
export function resetGround() {
  ground.height = sampleHeight
}
