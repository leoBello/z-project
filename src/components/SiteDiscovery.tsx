import { useFrame } from '@react-three/fiber'
import { SITES_BY_MAP } from '../config/sites'
import { playerTransform } from '../state/playerTransform'
import { useGameStore } from '../store/useGameStore'

/**
 * La découverte des lieux remarquables, sur les quatre cartes.
 *
 * Le pendant de `LandmarkProximity` pour tout ce qui n'est pas un monument —
 * un gué, un pont, une rotonde, une porte, un sommet, une chaussée, deux
 * bassins. La table vit dans `config/sites.ts` ; ce composant n'est que la
 * boucle qui la balaie.
 *
 * **Il est monté par `<Environment>` hors du branchement de carte**, et c'est
 * ce qui le distingue de son aîné : les monuments sont une affaire de
 * continent, les lieux remarquables sont partout. Le monter dans chacun des
 * quatre décors aurait demandé quatre exemplaires de la même boucle, dont
 * trois dans des fragments chargés à la demande — et le jour où l'on en oublie
 * un, la carte concernée cesse silencieusement de se nommer.
 *
 * Deux disciplines reprises telles quelles de `LandmarkProximity`, pour les
 * mêmes raisons :
 *
 *  - `getState()` plutôt qu'un abonnement : ce composant ne se re-rend jamais,
 *    donc la boucle ne coûte que ses quelques hypoténuses ;
 *  - écriture **sur transition seulement** : le store n'est touché qu'à
 *    l'instant où un lieu passe de l'inconnu au connu.
 */
export function SiteDiscovery() {
  useFrame(() => {
    const store = useGameStore.getState()

    /*
      Rien ne se découvre tant que la partie n'a pas la main, et ce garde-là
      n'existe pas chez les monuments parce qu'il ne leur servait pas.

      Trois des quatre cartes s'abordent par un portail, et deux des lieux de
      cette table sont à portée du point d'arrivée — la chaussée du Marais, le
      sommet de la montagne quand on revient du Marais. Or le voyage se fait
      derrière un voile opaque, `phase` valant `paused` du départ à l'arrivée :
      sans ce test, le bandeau se déclenchait sous le voile et son animation
      était à moitié consommée quand le joueur reprenait la main. Une
      découverte annoncée à un écran violet n'a été annoncée à personne.
    */
    if (store.phase !== 'playing') return

    for (const site of SITES_BY_MAP[store.location]) {
      if (store.discovered.includes(site.id)) continue
      // Distance au sol, comme pour les monuments : on découvre le sommet en
      // arrivant sur son plateau, pas en atteignant son altitude exacte.
      const distance = Math.hypot(
        playerTransform.position.x - site.x,
        playerTransform.position.z - site.z,
      )
      if (distance < site.radius) store.discoverPlace(site.id)
    }
  })

  // Rien à rendre : c'est une boucle, pas un objet de la scène.
  return null
}
