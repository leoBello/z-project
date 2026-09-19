import { SKY_PORTAL } from '../../config/portal'
import { Portal } from '../environment/Portal'
import { Ruins } from './Ruins'
import { SkyTerrain } from './Terrain'
import { useSkyMaterials } from './palette'

/**
 * L'Île Céleste — le point d'entrée du fragment chargé à la demande.
 *
 * Tout ce que ce composant importe entre dans le même morceau de bundle, et
 * c'est le but : l'accueil du site ne télécharge pas l'île. Le découpage est
 * fait par Vite à partir de l'`import()` de `preload.ts` ; il n'y a rien à
 * configurer, mais il y a une règle à tenir — voir l'en-tête de ce fichier-là.
 *
 * L'export est **par défaut**, parce que `React.lazy` n'accepte que ça.
 *
 * Les matériaux sont créés ici, une fois, et descendus en props. Chaque pièce
 * pourrait les construire de son côté ; elle en fabriquerait alors un jeu
 * complet, et l'île en compterait quatre ou cinq exemplaires pour un résultat
 * identique. C'est aussi ce qui garantit qu'une retouche de la pierre se voie
 * partout à la fois.
 */
export default function SkyIsland() {
  const materials = useSkyMaterials()

  return (
    <>
      <SkyTerrain materials={materials} />
      <Ruins materials={materials} />

      {/* Le jumeau de celui de Nakano, au point d'arrivée. Le même composant :
          deux portails qui divergeraient au premier réglage de l'anneau
          seraient un défaut qu'on ne verrait qu'en faisant l'aller-retour. */}
      <Portal at={SKY_PORTAL} openedAt={ALREADY_OPEN} />
    </>
  )
}

/**
 * Instant d'ouverture du portail du retour.
 *
 * `0` et non l'horloge courante : la valeur ne sert qu'à l'animation de
 * dépliement, qui la compare au temps de jeu. Un zéro la place très loin dans le
 * passé, donc l'anneau est déjà déplié à la première frame — ce qu'on veut,
 * puisque le joueur vient d'en sortir. Le voir se percer derrière soi n'aurait
 * aucun sens.
 */
const ALREADY_OPEN = 0
