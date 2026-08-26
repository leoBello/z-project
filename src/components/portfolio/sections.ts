import type { PortfolioSection } from '../../config/landmarks'
import { format, type Dictionary } from '../../i18n'
import type { MotifId } from './illustration/motifs'

/**
 * Normalisation du contenu du portfolio en « diapositives ».
 *
 * Cinq lieux montrent cinq natures de contenu — des missions, une biographie,
 * des listes de compétences, un cursus, des liens. Les rendre chacun avec sa
 * mise en page aurait donné cinq panneaux à maintenir et cinq façons de
 * naviguer à apprendre pour le joueur.
 *
 * Tout se ramène donc ici à une seule forme : un titre, une ligne de contexte,
 * des paragraphes, des étiquettes, des liens — chaque champ optionnel. Le
 * panneau ne connaît que cette forme, et ajouter un lieu revient à ajouter un
 * `case` dans la fonction ci-dessous.
 */

export interface PortfolioLink {
  label: string
  href: string
}

export interface PortfolioSlide {
  /** Clé stable. Amorce le tirage de l'illustration et sert de `key` React. */
  id: string
  /**
   * Rang de la teinte d'accent.
   *
   * Assigné, jamais tiré au sort : c'est ce qui garantit que deux diapositives
   * voisines n'ont pas la même couleur (voir `ProjectIllustration`). Pour les
   * projets c'est la position dans `experience`, ailleurs le rang dans la
   * section.
   */
  accentIndex: number
  /** Motif imposé, quand le contenu ne porte pas d'étiquettes exploitables. */
  motif?: MotifId
  title: string
  meta?: string
  paragraphs?: readonly string[]
  tags?: readonly string[]
  links?: readonly PortfolioLink[]
}

/**
 * Ordre d'affichage des familles de compétences.
 *
 * Écrit à la main plutôt que dérivé de `Object.keys` : l'ordre d'un objet JSON
 * n'est pas un contrat, et on veut le front-end en premier — c'est le sujet du
 * poste visé, pas une catégorie parmi six.
 */
const SKILL_GROUPS = [
  'frontend',
  'backend',
  'cloud_devops',
  'data_ml',
  'tools_methods',
  'soft_skills',
] as const

export function buildSlides(section: PortfolioSection, dict: Dictionary): PortfolioSlide[] {
  switch (section) {
    case 'projects':
      // L'index conservé est celui du tableau **complet** : masquer un projet
      // ne doit pas reteindre tous les suivants.
      return dict.experience
        .map((entry, position) => ({ entry, position }))
        .filter(({ entry }) => entry.featured)
        .map(({ entry, position }) => ({
          id: entry.id,
          accentIndex: position,
          title: entry.company,
          meta: `${entry.role} · ${entry.period}`,
          paragraphs: [entry.description],
          tags: entry.tags,
        }))

    case 'bio':
      return [
        {
          id: 'bio',
          accentIndex: 0,
          motif: 'lattice',
          title: dict.about.name,
          meta: `${dict.about.title} · ${dict.about.location}`,
          // La biographie est rédigée en deux blocs séparés par une ligne vide.
          // On respecte ce découpage plutôt que de tout couler en un pavé.
          paragraphs: dict.about.bio.split('\n\n'),
        },
      ]

    case 'skills':
      // Pas de motif imposé : les étiquettes d'une famille sont justement ce qui
      // doit décider de sa forme. « PyTorch » donne un treillis, « PostgreSQL »
      // des strates — la famille se reconnaît donc à sa silhouette.
      return SKILL_GROUPS.map((group, index) => ({
        id: `skills-${group}`,
        accentIndex: index,
        title: dict.ui.skillGroups[group],
        tags: dict.skills[group],
      }))

    case 'background': {
      const education = dict.education.map((entry, index) => ({
        id: `education-${index}`,
        accentIndex: index,
        motif: 'strata' as const,
        title: entry.school,
        // Un diplôme du tableau n'a pas de période : la ligne est alors omise
        // plutôt qu'affichée vide.
        meta: entry.period || undefined,
        paragraphs: [entry.degree],
      }))

      return [
        ...education,
        {
          id: 'certifications',
          accentIndex: education.length,
          motif: 'pipeline' as const,
          title: dict.ui.background.certifications,
          paragraphs: dict.certifications.map((certification) =>
            format(dict.ui.background.issuedBy, { issuer: certification.issuer }),
          ),
          tags: dict.certifications.map((certification) => certification.name),
        },
      ]
    }

    case 'contact':
      return [
        {
          id: 'contact',
          accentIndex: 0,
          motif: 'pipeline',
          title: dict.about.name,
          meta: dict.about.title,
          paragraphs: [
            format(dict.ui.contactLabels.intro, { location: dict.contact.location }),
          ],
          links: [
            { label: dict.ui.contactLabels.email, href: `mailto:${dict.contact.email}` },
            { label: dict.ui.contactLabels.linkedin, href: dict.contact.linkedin },
            { label: dict.ui.contactLabels.github, href: dict.contact.github },
            { label: dict.ui.contactLabels.website, href: `https://${dict.contact.website}` },
          ],
        },
      ]
  }
}
