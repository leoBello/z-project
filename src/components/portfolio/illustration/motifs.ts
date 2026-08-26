import { isoBox, type Facet, type Shade } from './isometry'

/**
 * Motifs d'illustration.
 *
 * Un projet n'est pas dessiné à la main : sa forme est *déduite* de ses tags,
 * et son tirage est amorcé par son identifiant. Deux ouvertures du même projet
 * donnent donc exactement la même image, et deux projets différents n'ont pas
 * la même — sans qu'aucune illustration n'ait à être stockée.
 */
export type MotifId = 'panels' | 'strata' | 'lattice' | 'pipeline'

/**
 * Diacritiques combinants, ceux que `normalize('NFD')` détache des lettres.
 *
 * La plage est **construite depuis ses points de code**, et non écrite en clair
 * dans un littéral. Ces caractères sont des marques invisibles : écrits tels
 * quels, un copier-coller, un formateur ou un éditeur qui renormalise le
 * fichier les efface sans laisser de trace, et la règle cesse silencieusement
 * de fonctionner.
 */
const DIACRITICS = new RegExp(
  `[${String.fromCodePoint(0x300)}-${String.fromCodePoint(0x36f)}]`,
  'g',
)

/** Minuscules sans accents : « Robotique » et « Robotics » doivent se croiser. */
const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(DIACRITICS, '')

/**
 * Règles tag → motif, **dans l'ordre de priorité**.
 *
 * Les deux orthographes sont listées parce que les tags sont traduits : le
 * dictionnaire français dit « Robotique », l'anglais « Robotics ». Résoudre le
 * motif depuis la langue affichée ferait changer l'illustration en basculant
 * FR/EN, ce qui serait absurde pour une image censée identifier un projet.
 *
 * La première règle qui trouve un tag gagne : un projet de robotique reste un
 * projet de robotique même s'il est aussi taggé React.
 */
const MOTIF_RULES: ReadonlyArray<{ motif: MotifId; tags: readonly string[] }> = [
  {
    motif: 'lattice',
    tags: [
      'machine learning',
      'deep learning',
      'pytorch',
      'robotique',
      'robotics',
      'reseaux de neurones',
      'neural networks',
    ],
  },
  {
    motif: 'pipeline',
    tags: [
      'microservices',
      'event-driven',
      'ci/cd',
      'oauth 2.0',
      'sso',
      'automatisation',
      'automation',
    ],
  },
  {
    motif: 'strata',
    tags: ['postgresql', 'supabase', 'rest api', 'node.js', 'java ee', 'firebase firestore'],
  },
  {
    motif: 'panels',
    tags: ['react', 'typescript', 'next.js', 'angular', 'javascript', 'wordpress'],
  },
]

/** Motif d'un projet. `panels` par défaut : le projet est front-end avant tout. */
export function motifForTags(tags: readonly string[]): MotifId {
  const normalized = new Set(tags.map(normalize))
  for (const rule of MOTIF_RULES) {
    if (rule.tags.some((tag) => normalized.has(tag))) return rule.motif
  }
  return 'panels'
}

/** Suite d'entiers `0..count-1`, pour composer un motif. */
const times = (count: number) => Array.from({ length: count }, (_, index) => index)

/**
 * Les formes d'un motif.
 *
 * Écrites du plus lointain au plus proche — voir la note d'ordre dans `isoBox`.
 * `random` est déterministe et dérivé de l'identifiant du projet.
 *
 * Le **nombre d'éléments** est tiré au sort, et c'est un correctif mesuré :
 * avec un compte fixe, deux projets de même motif et d'accent proche donnaient
 * des images qu'on ne distinguait pas — le cas s'est présenté sur deux missions
 * React/TypeScript au stack identique. La silhouette est le premier trait que
 * l'œil compare, bien avant la couleur ; la faire varier sépare deux images que
 * la teinte seule ne séparait pas.
 */
export function buildMotif(
  motif: MotifId,
  random: () => number,
  shade: Shade,
): Facet[] {
  switch (motif) {
    // Strates : des assises empilées qui rétrécissent. Lecture « données ».
    case 'strata':
      return times(3 + Math.floor(random() * 3)).flatMap((level) => {
        const inset = level * 0.35
        return isoBox(
          inset,
          level * 0.55,
          inset,
          3.4 - inset * 2,
          0.5,
          3.4 - inset * 2,
          shade,
        )
      })

    // Panneaux : des plans flottants et décalés. Lecture « interface ».
    case 'panels':
      return times(2 + Math.floor(random() * 3)).flatMap((index) =>
        isoBox(
          index * 0.5 + random() * 0.3,
          index * 0.85,
          2 - index * 0.6,
          2.4,
          0.22,
          1.6,
          shade,
        ),
      )

    // Treillis : des nœuds à hauteurs irrégulières. Lecture « réseau ».
    case 'lattice': {
      const nodes = [
        [0, 0],
        [1.4, 0.2],
        [2.8, 0],
        [0.4, 1.6],
        [1.9, 1.8],
        [3.1, 1.5],
      ] as const
      return nodes
        .slice(0, 4 + Math.floor(random() * 3))
        .flatMap(([x, z]) => isoBox(x, 0.2 + random() * 1.1, z, 0.7, 0.7, 0.7, shade))
    }

    // Chaîne : des blocs alignés de hauteur croissante. Lecture « pipeline ».
    case 'pipeline':
      return times(3 + Math.floor(random() * 3)).flatMap((index) =>
        isoBox(index * 0.95, 0, 1, 0.7, 0.5 + index * 0.42, 0.7, shade),
      )
  }
}
