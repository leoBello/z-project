/**
 * Contenu de référencement, dérivé du dictionnaire français.
 *
 * Trois sorties, construites ici et posées par `seo.ts` :
 *
 *   - le **repli** injecté dans `#root` (visiteurs sans JavaScript) ;
 *   - la **page texte** `/profil/`, un vrai document HTML indexable — c'est
 *     elle qui porte le référencement, voir la note ci-dessous ;
 *   - le **JSON-LD** des deux pages.
 *
 * ## Pourquoi une page texte séparée
 *
 * Le robot de Google exécute le JavaScript. Il voit donc la page *rendue* :
 * React vide `#root`, le repli disparaît, et il ne reste qu'un `<canvas>` sans
 * un mot de texte. Le repli ne protège que le cas « sans JS », qui n'est plus
 * le cas majoritaire des robots. `/profil/` est la réponse : un document
 * statique, complet et honnête — le même contenu que le jeu affiche, en HTML —
 * atteignable par un lien réel depuis l'accueil et déclaré au sitemap.
 *
 * ## GEO (référencement dans les moteurs génératifs)
 *
 * Un modèle de langage cite ce qu'il peut lire et vérifier : des phrases
 * complètes, factuelles, qui répondent à une question posée en langage naturel.
 * D'où la FAQ (« Qui est… », « Est-il disponible… », « Comment le contacter »)
 * et le bloc des prestations : ce sont les formulations qu'un moteur reprendra,
 * et elles sont adossées au même JSON-LD pour lever toute ambiguïté d'identité.
 */

export const SITE_URL = 'https://leobello.dev'

/** Emplacement de la page texte, en une seule constante : sitemap, lien, canonique. */
export const PROFILE_PATH = 'profil/'
export const PROFILE_URL = `${SITE_URL}/${PROFILE_PATH}`

interface Experience {
  company: string
  role: string
  period: string
  location: string
  description: string
  tags: readonly string[]
  featured: boolean
}

export interface Dict {
  about: { name: string; title: string; location: string; bio: string; website: string }
  experience: readonly Experience[]
  education: readonly { school: string; degree: string; period: string }[]
  certifications: readonly { name: string; issuer: string }[]
  skills: Record<string, readonly string[]>
  contact: {
    email: string
    linkedin: string
    github: string
    malt: string
    website: string
    location: string
  }
  ui: {
    sections: Record<string, string>
    skillGroups: Record<string, string>
    background: { certifications: string }
  }
}

/** Titres du repli. Volontairement littéraux : « Projets » côté jeu désigne les
 * missions, mais un robot (et un recruteur) attend « Expérience » ici. */
const HEADINGS = {
  bio: 'À propos',
  services: 'Prestations',
  skills: 'Compétences',
  experience: 'Expérience professionnelle',
  education: 'Formation',
  contact: 'Contact',
  faq: 'Questions fréquentes',
} as const

/** Ordre d'affichage des familles de compétences, aligné sur `sections.ts`. */
const SKILL_GROUPS = [
  'frontend',
  'backend',
  'cloud_devops',
  'data_ml',
  'tools_methods',
  'soft_skills',
] as const

/**
 * Prestations proposées en freelance.
 *
 * Seul contenu de ce fichier qui ne sort pas du dictionnaire : le jeu ne
 * présente pas d'offre de services, mais c'est exactement ce qu'une recherche
 * (« développeur React freelance ») et un moteur génératif cherchent à lire.
 * Les intitulés reprennent ceux du profil Malt pour que les deux pages
 * décrivent la même personne dans les mêmes termes.
 */
const SERVICES = [
  {
    name: 'Développement d’applications React et Next.js',
    description:
      'Conception et réalisation d’interfaces React / Next.js en TypeScript : architecture de composants, gestion d’état, formulaires avancés, rendu côté serveur.',
  },
  {
    name: 'Intégration d’API et de briques d’IA',
    description:
      'Branchement d’API REST, de back-ends Node.js et de services d’intelligence artificielle dans un produit existant, avec une attention particulière aux états de chargement, aux erreurs et au coût réel des appels.',
  },
  {
    name: 'Reprise et fiabilisation d’un front-end existant',
    description:
      'Audit d’une base de code, remise à plat de l’architecture, ajout de tests unitaires et de composants, réduction de la dette technique sans geler les livraisons.',
  },
  {
    name: 'Back-end et données',
    description:
      'API Node.js, modèles PostgreSQL / Supabase, Firebase Firestore : de la modélisation des données jusqu’à leur affichage dans l’interface.',
  },
  {
    name: 'Performance et qualité web',
    description:
      'Mesure et amélioration des Core Web Vitals, mise en place de tests automatisés et de pipelines CI/CD qui vérifient chaque livraison.',
  },
] as const

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Toutes les compétences, dédoublonnées, dans l'ordre des familles. */
export function allSkills(dict: Dict): string[] {
  const seen = new Set<string>()
  for (const group of SKILL_GROUPS) {
    for (const skill of dict.skills[group] ?? []) seen.add(skill)
  }
  return [...seen]
}

/** Premier paragraphe de la bio : sert de description partout. */
function intro(dict: Dict): string {
  return dict.about.bio.split('\n\n')[0]
}

/** La mission en cours, celle que la FAQ et `worksFor` citent. */
function currentJob(dict: Dict): Experience | undefined {
  return dict.experience.find((job) => job.featured)
}

/**
 * Questions et réponses en langage naturel.
 *
 * Chaque réponse est une phrase complète et autonome : reprise hors contexte
 * par un moteur génératif, elle reste vraie et attribuable. Les faits viennent
 * du dictionnaire, jamais d'une copie figée ici — une mission ajoutée au
 * portfolio met la FAQ à jour au prochain build.
 */
function buildFaq(dict: Dict): { question: string; answer: string }[] {
  const { about, contact } = dict
  const job = currentJob(dict)

  const entries = [
    {
      question: `Qui est ${about.name} ?`,
      answer:
        `${about.name}, ${about.title}, travaille depuis ${contact.location}. ` + intro(dict),
    },
    {
      question: `Quelles technologies ${about.name} utilise-t-il ?`,
      answer: SKILL_GROUPS.filter((group) => (dict.skills[group] ?? []).length > 0)
        .map((group) => `${dict.ui.skillGroups[group]} : ${dict.skills[group].join(', ')}`)
        .join('. ') + '.',
    },
    {
      question: `${about.name} est-il disponible pour une mission freelance ?`,
      answer:
        `Oui. ${about.name} est ouvert aux missions front-end et full-stack, en freelance, ` +
        `depuis ${contact.location} et à distance. Son profil freelance, avec ses tarifs et ` +
        `ses recommandations, est publié sur Malt : ${contact.malt}`,
    },
    {
      question: `Comment contacter ${about.name} ?`,
      answer:
        `Par e-mail à ${contact.email}, via son profil Malt (${contact.malt}), ` +
        `sur LinkedIn (${contact.linkedin}) ou sur GitHub (${contact.github}). ` +
        `Son portfolio est en ligne sur https://${contact.website}.`,
    },
    {
      question: `Quelles prestations ${about.name} propose-t-il ?`,
      answer: SERVICES.map((service) => service.name).join(' ; ') + '.',
    },
    {
      question: `Qu’est-ce que le portfolio ${contact.website} ?`,
      answer:
        `Un portfolio interactif : un mini-monde 3D à explorer dans le navigateur, développé ` +
        `en React, TypeScript et Three.js (React Three Fiber), avec la physique Rapier. Cinq ` +
        `monuments y ouvrent les cinq sections du portfolio — présentation, compétences, ` +
        `parcours, expérience et contact. La page ${PROFILE_URL} en donne la version texte.`,
    },
  ]

  if (job) {
    entries.splice(4, 0, {
      question: `Sur quoi ${about.name} travaille-t-il actuellement ?`,
      answer: `${job.role} chez ${job.company} (${job.period}, ${job.location}). ${job.description}`,
    })
  }

  return entries
}

/* -------------------------------------------------------------------------- */
/* Fragments HTML partagés par le repli et la page texte                       */
/* -------------------------------------------------------------------------- */

function bioHtml(dict: Dict): string {
  return dict.about.bio
    .split('\n\n')
    .map((paragraph) => `<p>${esc(paragraph)}</p>`)
    .join('')
}

function servicesHtml(): string {
  return SERVICES.map(
    (service) =>
      `<article><h3>${esc(service.name)}</h3><p>${esc(service.description)}</p></article>`,
  ).join('')
}

function skillsHtml(dict: Dict): string {
  return SKILL_GROUPS.map((group) => {
    const items = (dict.skills[group] ?? []).map((skill) => `<li>${esc(skill)}</li>`).join('')
    return `<section><h3>${esc(dict.ui.skillGroups[group])}</h3><ul>${items}</ul></section>`
  }).join('')
}

function experienceHtml(dict: Dict): string {
  return dict.experience
    .map((job) => {
      const tags = job.tags.length
        ? `<p>${job.tags.map((tag) => esc(tag)).join(', ')}</p>`
        : ''
      return (
        `<article><h3>${esc(job.role)} — ${esc(job.company)}</h3>` +
        `<p>${esc(job.period)} · ${esc(job.location)}</p>` +
        `<p>${esc(job.description)}</p>${tags}</article>`
      )
    })
    .join('')
}

function educationHtml(dict: Dict): string {
  const schools = dict.education
    .map((entry) => {
      const period = entry.period ? ` (${esc(entry.period)})` : ''
      return `<li>${esc(entry.school)} — ${esc(entry.degree)}${period}</li>`
    })
    .join('')

  const certs = dict.certifications
    .map((cert) => `<li>${esc(cert.name)} — ${esc(cert.issuer)}</li>`)
    .join('')

  return (
    `<ul>${schools}</ul>` +
    `<h3>${esc(dict.ui.background.certifications)}</h3><ul>${certs}</ul>`
  )
}

/**
 * Liens de contact.
 *
 * `rel="me"` n'est pas décoratif : il déclare que ces comptes sont la même
 * personne que l'auteur de la page. C'est ce qui permet à un moteur de
 * rattacher le portfolio, le profil Malt, LinkedIn et GitHub à une seule
 * entité au lieu de quatre homonymes.
 */
function contactHtml(dict: Dict): string {
  const { contact } = dict
  const external = (href: string, label: string) =>
    `<a href="${esc(href)}" rel="me noopener" target="_blank">${esc(label)}</a>`

  return (
    '<ul>' +
    `<li>E-mail : <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></li>` +
    `<li>Malt (profil freelance) : ${external(contact.malt, contact.malt)}</li>` +
    `<li>LinkedIn : ${external(contact.linkedin, contact.linkedin)}</li>` +
    `<li>GitHub : ${external(contact.github, contact.github)}</li>` +
    '</ul>'
  )
}

function faqHtml(dict: Dict): string {
  return buildFaq(dict)
    .map((entry) => `<article><h3>${esc(entry.question)}</h3><p>${esc(entry.answer)}</p></article>`)
    .join('')
}

/* -------------------------------------------------------------------------- */
/* Repli injecté dans #root                                                    */
/* -------------------------------------------------------------------------- */

/** Contenu de repli injecté dans `#root` — lu par les robots sans JS, jamais par un humain. */
export function buildFallback(dict: Dict): string {
  const { about } = dict

  return (
    `<div id="seo-fallback">` +
    `<main>` +
    `<header><h1>${esc(about.name)}</h1><p>${esc(about.title)}</p>` +
    `<p>${esc(about.location)}</p></header>` +
    `<section><h2>${HEADINGS.bio}</h2>${bioHtml(dict)}</section>` +
    `<section><h2>${HEADINGS.services}</h2>${servicesHtml()}</section>` +
    `<section><h2>${HEADINGS.skills}</h2>${skillsHtml(dict)}</section>` +
    `<section><h2>${HEADINGS.experience}</h2>${experienceHtml(dict)}</section>` +
    `<section><h2>${HEADINGS.education}</h2>${educationHtml(dict)}</section>` +
    `<section><h2>${HEADINGS.contact}</h2>${contactHtml(dict)}</section>` +
    `<p><a href="/${PROFILE_PATH}">Version texte complète du portfolio</a></p>` +
    `<p><small>Portfolio interactif en 3D — activez JavaScript pour l'explorer en jeu.</small></p>` +
    `</main></div>`
  )
}

/* -------------------------------------------------------------------------- */
/* Page texte /profil/                                                         */
/* -------------------------------------------------------------------------- */

const PROFILE_TITLE = 'Léo Bello — Développeur web freelance React, Next.js & TypeScript à Marseille'
const PROFILE_DESCRIPTION =
  'Profil complet de Léo Bello, développeur web full-stack freelance à Marseille : ' +
  'React, Next.js, TypeScript, Node.js, PostgreSQL, intégration d’API et d’IA. ' +
  'Prestations, compétences, expérience, formation et contact.'

/** Feuille de style de la page texte : sobre, lisible, aucune requête réseau. */
const PROFILE_STYLE = `
  :root { color-scheme: dark; }
  body {
    margin: 0;
    padding: 3rem 1.5rem 5rem;
    background: #10161b;
    color: #d8d2c0;
    font: 16px/1.65 system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  main { max-width: 46rem; margin: 0 auto; }
  h1 { margin: 0 0 .3rem; font-size: clamp(1.6rem, 5vw, 2.1rem); color: #f5dc95; }
  h2 { margin: 2.6rem 0 .6rem; font-size: 1.2rem; color: #f5dc95; }
  h3 { margin: 1.4rem 0 .3rem; font-size: 1rem; }
  p, li { margin: .4rem 0; }
  ul { padding-left: 1.2rem; }
  a { color: #7fb8e6; }
  header p { margin: .2rem 0; color: #b9b3a2; }
  .lede { margin: 1.6rem 0; padding: 1rem 1.2rem; border-left: 3px solid #f5dc95; background: #161d24; }
  footer { margin-top: 3.5rem; padding-top: 1.2rem; border-top: 1px solid #2a333c; font-size: .9rem; color: #b9b3a2; }
`

/**
 * Page texte autonome.
 *
 * Elle ne charge ni script ni police distante : c'est volontaire. La page qui
 * porte le référencement doit s'afficher instantanément, quelle que soit la
 * connexion, là où le jeu 3D coûte plusieurs mégaoctets.
 */
export function buildProfilePage(dict: Dict, jsonLd: string): string {
  const { about } = dict

  return (
    `<!doctype html>\n<html lang="fr">\n<head>\n` +
    `<meta charset="UTF-8" />\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n` +
    `<title>${esc(PROFILE_TITLE)}</title>\n` +
    `<meta name="description" content="${esc(PROFILE_DESCRIPTION)}" />\n` +
    `<meta name="author" content="${esc(about.name)}" />\n` +
    `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />\n` +
    `<link rel="canonical" href="${PROFILE_URL}" />\n` +
    `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />\n` +
    `<meta property="og:type" content="profile" />\n` +
    `<meta property="og:title" content="${esc(PROFILE_TITLE)}" />\n` +
    `<meta property="og:description" content="${esc(PROFILE_DESCRIPTION)}" />\n` +
    `<meta property="og:url" content="${PROFILE_URL}" />\n` +
    `<meta property="og:image" content="${SITE_URL}/og-image.png" />\n` +
    `<meta property="og:locale" content="fr_FR" />\n` +
    `<meta name="twitter:card" content="summary_large_image" />\n` +
    `<style>${PROFILE_STYLE}</style>\n` +
    `<script type="application/ld+json">${jsonLd}</script>\n` +
    `</head>\n<body>\n<main>\n` +
    `<header><h1>${esc(about.name)}</h1>` +
    `<p>${esc(about.title)}</p><p>${esc(about.location)}</p></header>` +
    `<p class="lede">Version texte du portfolio. ` +
    `<a href="/">Explorer le portfolio interactif en 3D</a> — ` +
    `<a href="${esc(dict.contact.malt)}" rel="me noopener" target="_blank">voir le profil Malt</a>.</p>` +
    `<section><h2>${HEADINGS.bio}</h2>${bioHtml(dict)}</section>` +
    `<section><h2>${HEADINGS.services}</h2>${servicesHtml()}</section>` +
    `<section><h2>${HEADINGS.skills}</h2>${skillsHtml(dict)}</section>` +
    `<section><h2>${HEADINGS.experience}</h2>${experienceHtml(dict)}</section>` +
    `<section><h2>${HEADINGS.education}</h2>${educationHtml(dict)}</section>` +
    `<section><h2>${HEADINGS.contact}</h2>${contactHtml(dict)}</section>` +
    `<section><h2>${HEADINGS.faq}</h2>${faqHtml(dict)}</section>` +
    `<footer><p><a href="/">Portfolio interactif</a> · ` +
    `<a href="https://${esc(dict.contact.website)}">${esc(dict.contact.website)}</a></p></footer>` +
    `</main>\n</body>\n</html>\n`
  )
}

/* -------------------------------------------------------------------------- */
/* Données structurées schema.org                                              */
/* -------------------------------------------------------------------------- */

/** Identité : un seul nœud `Person`, référencé par `@id` partout ailleurs. */
function personNode(dict: Dict) {
  const { about, contact } = dict
  const job = currentJob(dict)

  return {
    '@type': 'Person',
    '@id': `${SITE_URL}/#person`,
    name: about.name,
    givenName: 'Léo',
    familyName: 'Bello',
    jobTitle: about.title,
    description: intro(dict),
    url: SITE_URL,
    // La page texte est la référence canonique de l'entité : c'est elle qu'un
    // robot peut lire en entier, pas la scène WebGL.
    mainEntityOfPage: { '@id': `${PROFILE_URL}#profilepage` },
    image: `${SITE_URL}/og-image.png`,
    email: `mailto:${contact.email}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Marseille',
      addressRegion: 'Provence-Alpes-Côte d’Azur',
      addressCountry: 'FR',
    },
    // Déclare que ces comptes sont la même personne : c'est ce qui rattache le
    // profil Malt au portfolio dans l'index d'un moteur.
    sameAs: [contact.linkedin, contact.github, contact.malt],
    knowsAbout: allSkills(dict),
    knowsLanguage: ['fr', 'en'],
    alumniOf: dict.education.map((entry) => ({
      '@type': 'EducationalOrganization',
      name: entry.school,
    })),
    hasCredential: dict.certifications.map((cert) => ({
      '@type': 'EducationalOccupationalCredential',
      name: cert.name,
      credentialCategory: 'certificate',
      recognizedBy: { '@type': 'Organization', name: cert.issuer },
    })),
    hasOccupation: {
      '@type': 'Occupation',
      name: 'Développeur web full-stack',
      // Code O*NET « Web Developers », celui que Google attend ici.
      occupationalCategory: '15-1254.00',
      skills: allSkills(dict).join(', '),
      occupationLocation: { '@type': 'City', name: 'Marseille' },
    },
    ...(job
      ? { worksFor: { '@type': 'Organization', name: job.company } }
      : {}),
    makesOffer: { '@id': `${SITE_URL}/#services` },
  }
}

/** Offre de services : le nœud que vise une recherche « développeur React freelance ». */
function serviceNode(dict: Dict) {
  return {
    '@type': 'Service',
    '@id': `${SITE_URL}/#services`,
    name: 'Développement web freelance — React, Next.js, TypeScript',
    serviceType: 'Développement d’applications web',
    provider: { '@id': `${SITE_URL}/#person` },
    areaServed: [
      { '@type': 'City', name: 'Marseille' },
      { '@type': 'Country', name: 'France' },
    ],
    availableChannel: {
      '@type': 'ServiceChannel',
      name: 'Profil Malt',
      serviceUrl: dict.contact.malt,
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Prestations',
      itemListElement: SERVICES.map((service) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: service.name,
          description: service.description,
        },
      })),
    },
  }
}

function websiteNode(dict: Dict) {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: `${dict.about.name} — Portfolio`,
    url: SITE_URL,
    inLanguage: ['fr', 'en'],
    author: { '@id': `${SITE_URL}/#person` },
    publisher: { '@id': `${SITE_URL}/#person` },
  }
}

/**
 * Données structurées de la page demandée.
 *
 * Les deux pages partagent l'identité (`Person`, `Service`, `WebSite`) et ne
 * diffèrent que par le nœud de page. La FAQ n'est déclarée que sur `/profil/`,
 * où les questions sont réellement affichées : annoncer une FAQ absente de la
 * page est une raison de sanction, pas un raccourci.
 */
export function buildJsonLd(dict: Dict, page: 'home' | 'profile'): string {
  const shared = [personNode(dict), serviceNode(dict), websiteNode(dict)]

  const pageNodes =
    page === 'home'
      ? [
          {
            '@type': 'WebPage',
            '@id': `${SITE_URL}/#webpage`,
            url: `${SITE_URL}/`,
            name: `${dict.about.name} — Portfolio`,
            description: intro(dict),
            inLanguage: 'fr',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            about: { '@id': `${SITE_URL}/#person` },
            primaryImageOfPage: `${SITE_URL}/og-image.png`,
          },
        ]
      : [
          {
            '@type': 'ProfilePage',
            '@id': `${PROFILE_URL}#profilepage`,
            url: PROFILE_URL,
            name: PROFILE_TITLE,
            description: PROFILE_DESCRIPTION,
            inLanguage: 'fr',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            mainEntity: { '@id': `${SITE_URL}/#person` },
          },
          {
            '@type': 'FAQPage',
            '@id': `${PROFILE_URL}#faq`,
            isPartOf: { '@id': `${PROFILE_URL}#profilepage` },
            mainEntity: buildFaq(dict).map((entry) => ({
              '@type': 'Question',
              name: entry.question,
              acceptedAnswer: { '@type': 'Answer', text: entry.answer },
            })),
          },
        ]

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [...pageNodes, ...shared] })
}
