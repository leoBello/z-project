import { useMemo } from 'react'
import { seededRandom } from '../../config/world'
import { boundsOf, isoBox, pointsAttribute, shadesFrom, type Facet } from './illustration/isometry'
import { buildMotif, motifForTags } from './illustration/motifs'

/**
 * Teintes d'accent, **toutes prélevées sur le jeu** : ardoise du toit du
 * temple, cristal de l'autel, feuillage de jungle, sable d'île, parme du ciel,
 * patine, terres arides, haut-fond, fleur de prairie. L'illustration tire au
 * sort, mais elle ne peut pas sortir de la charte — c'est ce qui garantit que
 * dix projets donnent dix images appartenant quand même au même monde.
 */
const ACCENTS = [
  '#4f5878',
  '#ffb43c',
  '#3d8442',
  '#d8c890',
  '#9fb0e8',
  '#5b9a90',
  '#c9a468',
  '#4f9dc4',
  '#f4c6d9',
] as const

/** Pierres du socle : celles du temple, plus la roche de montagne. */
const PLINTHS = ['#cfc5ae', '#a3a3a8', '#7b7264'] as const

/**
 * Recette d'une illustration.
 *
 * L'accent vient de l'**index**, tout le reste d'un tirage amorcé par
 * l'identifiant. Ce mélange est une correction, mesurée deux fois.
 *
 * Premier essai : accent tiré au sort dans une palette de six. Sur les cinq
 * projets retenus, **trois tombaient sur la même teinte** — c'est le paradoxe
 * des anniversaires, cinq tirages dans six cases collisionnent plus d'une fois
 * sur deux. Deuxième essai : palette élargie à neuf, plus deux axes de
 * variation supplémentaires. Deux missions React/TypeScript au stack identique
 * partageaient encore accent *et* nombre d'éléments, une chance sur vingt-sept
 * qui s'est présentée du premier coup.
 *
 * La leçon est que le hasard ne garantit rien. Une palette catégorielle
 * s'assigne par index, jamais par hachage — c'est la règle en visualisation de
 * données, et pour la même raison : on veut la séparation *garantie*, pas
 * probable. Les axes secondaires restent tirés de l'identifiant, où une
 * collision occasionnelle ne coûte rien.
 *
 * Contrepartie assumée : la couleur d'un projet dépend de sa place dans
 * `experience`. L'ordre de ce tableau est déjà un contrat documenté
 * (antéchronologique), et y insérer une mission décale les teintes suivantes.
 */
interface Recipe {
  accent: string
  plinth: string
  /** Socle à deux redans, comme le stylobate du temple, plutôt qu'un bloc plein. */
  stepped: boolean
}

/**
 * Hash de chaîne vers un entier (FNV-1a), pour amorcer le générateur.
 *
 * `seededRandom` attend un entier ; l'identifiant du projet est une chaîne.
 * N'importe quel hash déterministe ferait l'affaire, celui-ci ne dépend
 * d'aucune bibliothèque et tient en quatre lignes.
 */
function hashString(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193)
  }
  return hash >>> 0
}

/** Le socle sur lequel le motif est posé. */
function buildPlinth(recipe: Recipe): Facet[] {
  const shade = shadesFrom(recipe.plinth)
  if (!recipe.stepped) {
    return isoBox(-0.6, -0.9, -0.6, 4.6, 0.9, 4.6, shade)
  }
  // Deux redans : le rappel direct du stylobate du Temple du Sommet.
  return [
    ...isoBox(-0.9, -0.9, -0.9, 5.2, 0.45, 5.2, shade),
    ...isoBox(-0.55, -0.45, -0.55, 4.5, 0.45, 4.5, shade),
  ]
}

interface ProjectIllustrationProps {
  /** Identifiant du projet. Amorce le tirage : même projet, mêmes formes. */
  id: string
  tags: readonly string[]
  /**
   * Position du projet dans le tableau `experience` **complet**, et non dans la
   * sélection affichée : sinon masquer un projet reteindrait tous les suivants.
   */
  index: number
}

/** Air laissé autour de la composition, en unités de la projection. */
const MARGIN = 16

export function ProjectIllustration({ id, tags, index }: ProjectIllustrationProps) {
  const { facets, viewBox } = useMemo(() => {
    const random = seededRandom(hashString(id))
    const recipe: Recipe = {
      accent: ACCENTS[index % ACCENTS.length],
      plinth: PLINTHS[Math.floor(random() * PLINTHS.length)],
      stepped: random() < 0.5,
    }
    // Le socle d'abord : il est derrière tout le reste, et il n'y a pas de tri
    // de profondeur — voir la note dans `isoBox`.
    const built: Facet[] = [
      ...buildPlinth(recipe),
      ...buildMotif(motifForTags(tags), random, shadesFrom(recipe.accent)),
    ]

    // Cadrage calculé sur les formes réellement produites, jamais écrit à la
    // main : un motif de six nœuds n'occupe pas la même boîte qu'un de trois.
    const { minX, minY, maxX, maxY } = boundsOf(built)
    return {
      facets: built,
      viewBox: [
        minX - MARGIN,
        minY - MARGIN,
        maxX - minX + MARGIN * 2,
        maxY - minY + MARGIN * 2,
      ]
        .map((value) => value.toFixed(1))
        .join(' '),
    }
  }, [id, tags, index])

  return (
    <svg
      className="portfolio__illustration"
      viewBox={viewBox}
      role="img"
      // L'image ne porte aucune information que le texte voisin ne donne pas :
      // la décrire aux lecteurs d'écran serait du bruit, pas de l'accessibilité.
      aria-hidden="true"
    >
      {facets.map((facet, position) => (
        <polygon key={position} points={pointsAttribute(facet.points)} fill={facet.fill} />
      ))}
    </svg>
  )
}
