/**
 * Contenu de référencement, dérivé des dictionnaires du jeu.
 *
 * Quatre sorties, construites ici et posées par `seo.ts` :
 *
 *   - le **repli** injecté dans `#root` (visiteurs sans JavaScript) ;
 *   - deux **pages texte**, `/profil/` et `/en/profile/` — ce sont elles qui
 *     portent le référencement, voir la note ci-dessous ;
 *   - **`/llms.txt`**, un résumé en Markdown à destination des moteurs
 *     génératifs ;
 *   - le **JSON-LD** de chaque page.
 *
 * ## Pourquoi des pages texte séparées
 *
 * Le robot de Google exécute le JavaScript. Il voit donc la page *rendue* :
 * React vide `#root`, le repli disparaît, et il ne reste qu'un `<canvas>` sans
 * un mot de texte. Le repli ne protège que le cas « sans JS », qui n'est plus
 * le cas majoritaire des robots. Les pages texte sont la réponse : des
 * documents statiques, complets et honnêtes — le même contenu que le jeu
 * affiche, en HTML — atteignables par un lien réel depuis l'accueil et
 * déclarés au sitemap.
 *
 * ## Pourquoi deux langues
 *
 * Le jeu est bilingue derrière un sélecteur, à une seule URL : un moteur ne
 * peut donc en indexer qu'une version. Les deux pages texte donnent à chaque
 * langue son adresse propre, appariées par `hreflang`. Ça ouvre la moitié
 * anglophone des recherches, et ça compte doublement côté moteurs génératifs,
 * dont l'essentiel des questions techniques sont posées en anglais.
 *
 * ## GEO (référencement dans les moteurs génératifs)
 *
 * Un modèle de langage cite ce qu'il peut lire et vérifier : des phrases
 * complètes, factuelles, qui répondent à une question posée en langage naturel.
 * D'où la FAQ (« Qui est… », « Est-il disponible… », « Comment le contacter »),
 * le bloc des prestations et `llms.txt` : ce sont les formulations qu'un moteur
 * reprendra, et elles sont adossées au même JSON-LD pour lever toute ambiguïté
 * d'identité.
 */

export const SITE_URL = 'https://leobello.dev'

export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * Date de dernière évolution du **contenu** du portfolio.
 *
 * Écrite à la main plutôt que prise sur l'horloge du build : `dateModified` et
 * `lastmod` annoncent une mise à jour éditoriale, et un robot qui les voit
 * bouger à chaque déploiement sans qu'un mot ait changé finit par ne plus les
 * croire. À bouger quand le dictionnaire change, pas quand le code change.
 */
export const CONTENT_UPDATED = '2026-09-12'

interface Experience {
  company: string
  role: string
  period: string
  location: string
  description: string
  tags: readonly string[]
  featured: boolean
}

/** Produit personnel : conçu, développé et mis en ligne de bout en bout. */
interface Project {
  id: string
  name: string
  tagline: string
  period: string
  summary: string
  approach: string
  outcome: string
  tags: readonly string[]
}

export interface Dict {
  about: { name: string; title: string; location: string; bio: string; website: string }
  projects: readonly Project[]
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
    portfolio: { personalProject: string }
  }
}

/** Les deux dictionnaires, pour les sorties qui parlent des deux langues. */
export type Dicts = Record<Locale, Dict>

/** Ordre d'affichage des familles de compétences, aligné sur `sections.ts`. */
const SKILL_GROUPS = [
  'frontend',
  'backend',
  'cloud_devops',
  'data_ml',
  'tools_methods',
  'soft_skills',
] as const

interface Service {
  name: string
  description: string
}

interface Copy {
  /** Chemin de la page texte, sans barre de tête : URL, canonique et nom de fichier. */
  path: string
  htmlLang: string
  ogLocale: string
  title: string
  description: string
  /**
   * Titres de section. Volontairement littéraux : « Projets » côté jeu désigne
   * les missions, mais un robot — et un recruteur — attend « Expérience » ici.
   */
  headings: {
    bio: string
    services: string
    projects: string
    skills: string
    experience: string
    education: string
    contact: string
    faq: string
  }
  services: readonly Service[]
  /** Chapô de la page texte, avec ses liens sortants. */
  lede: { prefix: string; game: string; separator: string; malt: string }
  labels: {
    technologies: string
    email: string
    maltProfile: string
    otherLanguage: string
    textVersion: string
    noScript: string
  }
  faq: (dict: Dict) => readonly { question: string; answer: string }[]
}

/* -------------------------------------------------------------------------- */
/* Outils partagés                                                             */
/* -------------------------------------------------------------------------- */

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

/**
 * Compétences déclarées **plus** technologies réellement employées dans les
 * produits personnels.
 *
 * Vite, Zod, Astro ou RLS n'apparaissent dans aucune famille de compétences,
 * alors qu'ils portent un projet entier. Les ajouter ici n'invente rien : le
 * projet qui les emploie est décrit sur la même page, juste au-dessus.
 */
function knowsAbout(dict: Dict): string[] {
  const seen = new Set(allSkills(dict))
  for (const project of dict.projects) {
    for (const tag of project.tags) seen.add(tag)
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
 * La pile technique seule, sans l'intitulé de poste qui la précède.
 *
 * `about.title` s'écrit « Développeur Full-Stack — React, Next.js, … » : posé
 * tel quel au milieu d'une phrase, il donne « is a Full-Stack Developer —
 * React, …, working from Marseille ». On ne garde donc que ce qui suit le
 * tiret, et le titre entier quand il n'y en a pas.
 */
function stack(dict: Dict): string {
  const [, rest] = dict.about.title.split(/\s+—\s+/)
  return rest ?? dict.about.title
}

/** « Front-end : React, TypeScript… Back-end : Node.js… », en une phrase. */
function skillSentence(dict: Dict, separator: string): string {
  return (
    SKILL_GROUPS.filter((group) => (dict.skills[group] ?? []).length > 0)
      .map((group) => `${dict.ui.skillGroups[group]}${separator}${dict.skills[group].join(', ')}`)
      .join('. ') + '.'
  )
}

/* -------------------------------------------------------------------------- */
/* Copie éditoriale, par langue                                                */
/* -------------------------------------------------------------------------- */

/**
 * Prestations proposées en freelance.
 *
 * Le seul contenu de ce fichier qui ne sorte pas du dictionnaire : le jeu ne
 * présente pas d'offre de services, mais c'est exactement ce qu'une recherche
 * (« développeur React freelance ») et un moteur génératif cherchent à lire.
 * Les intitulés reprennent ceux du profil Malt pour que les deux pages
 * décrivent la même personne dans les mêmes termes.
 */
const SERVICES_FR: readonly Service[] = [
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
]

const SERVICES_EN: readonly Service[] = [
  {
    name: 'React and Next.js application development',
    description:
      'Designing and building React / Next.js interfaces in TypeScript: component architecture, state management, complex forms, server-side rendering.',
  },
  {
    name: 'API and AI integration',
    description:
      'Wiring REST APIs, Node.js back-ends and AI services into an existing product, with real attention to loading states, failure paths and the actual cost of each call.',
  },
  {
    name: 'Rescuing and stabilising an existing front-end',
    description:
      'Auditing a codebase, reworking its architecture, adding unit and component tests, paying down technical debt without freezing delivery.',
  },
  {
    name: 'Back-end and data',
    description:
      'Node.js APIs, PostgreSQL / Supabase models, Firebase Firestore: from data modelling through to what the interface finally shows.',
  },
  {
    name: 'Web performance and quality',
    description:
      'Measuring and improving Core Web Vitals, setting up automated tests and CI/CD pipelines that check every release.',
  },
]

/**
 * Questions et réponses en langage naturel.
 *
 * Chaque réponse est une phrase complète et autonome : reprise hors contexte
 * par un moteur génératif, elle reste vraie et attribuable. Les faits viennent
 * du dictionnaire, jamais d'une copie figée ici — une mission ajoutée au
 * portfolio met la FAQ à jour au prochain build.
 */
function faqFr(dict: Dict) {
  const { about, contact } = dict
  const job = currentJob(dict)

  return [
    {
      question: `Qui est ${about.name} ?`,
      answer: `${about.name}, ${about.title}, travaille depuis ${contact.location}. ` + intro(dict),
    },
    {
      question: `Quelles technologies ${about.name} utilise-t-il ?`,
      answer: skillSentence(dict, ' : '),
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
    ...(job
      ? [
          {
            question: `Sur quoi ${about.name} travaille-t-il actuellement ?`,
            answer: `${job.role} chez ${job.company} (${job.period}, ${job.location}). ${job.description}`,
          },
        ]
      : []),
    {
      question: `Quelles prestations ${about.name} propose-t-il ?`,
      answer: SERVICES_FR.map((service) => service.name).join(' ; ') + '.',
    },
    {
      question: `Quels projets personnels ${about.name} a-t-il développés ?`,
      answer: dict.projects
        .map(
          (project) =>
            `${project.name} (${project.tagline}, ${project.period}) : ${project.summary} ` +
            `Technologies : ${project.tags.join(', ')}.`,
        )
        .join(' '),
    },
    {
      question: `Qu’est-ce que le portfolio ${contact.website} ?`,
      answer:
        `Un portfolio interactif : un mini-monde 3D à explorer dans le navigateur, développé ` +
        `en React, TypeScript et Three.js (React Three Fiber), avec la physique Rapier. Cinq ` +
        `monuments y ouvrent les cinq sections du portfolio — présentation, compétences, ` +
        `parcours, projets et contact. La page ${SITE_URL}/profil/ en donne la version texte.`,
    },
  ]
}

function faqEn(dict: Dict) {
  const { about, contact } = dict
  const job = currentJob(dict)

  return [
    {
      question: `Who is ${about.name}?`,
      answer:
        `${about.name} is a freelance full-stack web developer based in ${contact.location}, ` +
        `working with ${stack(dict)}. ` + intro(dict),
    },
    {
      question: `Which technologies does ${about.name} work with?`,
      answer: skillSentence(dict, ': '),
    },
    {
      question: `Is ${about.name} available for freelance work?`,
      answer:
        `Yes. ${about.name} takes on front-end and full-stack freelance engagements, from ` +
        `${contact.location} and remotely. The freelance profile, with rates and client ` +
        `recommendations, is published on Malt: ${contact.malt}`,
    },
    {
      question: `How can I contact ${about.name}?`,
      answer:
        `By email at ${contact.email}, through the Malt profile (${contact.malt}), ` +
        `on LinkedIn (${contact.linkedin}) or on GitHub (${contact.github}). ` +
        `The portfolio is online at https://${contact.website}.`,
    },
    ...(job
      ? [
          {
            question: `What is ${about.name} working on right now?`,
            answer: `${job.role} at ${job.company} (${job.period}, ${job.location}). ${job.description}`,
          },
        ]
      : []),
    {
      question: `What services does ${about.name} offer?`,
      answer: SERVICES_EN.map((service) => service.name).join('; ') + '.',
    },
    {
      question: `Which personal projects has ${about.name} built?`,
      answer: dict.projects
        .map(
          (project) =>
            `${project.name} (${project.tagline}, ${project.period}): ${project.summary} ` +
            `Technologies: ${project.tags.join(', ')}.`,
        )
        .join(' '),
    },
    {
      question: `What is the ${contact.website} portfolio?`,
      answer:
        `An interactive portfolio: a small 3D world to explore in the browser, built with ` +
        `React, TypeScript and Three.js (React Three Fiber), with Rapier physics. Five ` +
        `monuments open the five portfolio sections — about, skills, background, projects ` +
        `and contact. ${SITE_URL}/en/profile/ is the text version.`,
    },
  ]
}

const COPY: Record<Locale, Copy> = {
  fr: {
    path: 'profil/',
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    title: 'Léo Bello — Développeur web freelance React, Next.js & TypeScript à Marseille',
    description:
      'Profil complet de Léo Bello, développeur web full-stack freelance à Marseille : ' +
      'React, Next.js, TypeScript, Node.js, PostgreSQL, intégration d’API et d’IA. ' +
      'Prestations, projets personnels, compétences, expérience, formation et contact.',
    headings: {
      bio: 'À propos',
      services: 'Prestations',
      projects: 'Projets personnels',
      skills: 'Compétences',
      experience: 'Expérience professionnelle',
      education: 'Formation',
      contact: 'Contact',
      faq: 'Questions fréquentes',
    },
    services: SERVICES_FR,
    lede: {
      prefix: 'Version texte du portfolio.',
      game: 'Explorer le portfolio interactif en 3D',
      separator: ' — ',
      malt: 'voir le profil Malt',
    },
    labels: {
      technologies: 'Technologies',
      email: 'E-mail',
      maltProfile: 'Malt (profil freelance)',
      otherLanguage: 'This page in English',
      textVersion: 'Version texte complète du portfolio',
      noScript: 'Portfolio interactif en 3D — activez JavaScript pour l’explorer en jeu.',
    },
    faq: faqFr,
  },
  en: {
    path: 'en/profile/',
    htmlLang: 'en',
    ogLocale: 'en_US',
    title: 'Léo Bello — Freelance React, Next.js & TypeScript developer in Marseille',
    description:
      'Full profile of Léo Bello, freelance full-stack web developer based in Marseille, ' +
      'France: React, Next.js, TypeScript, Node.js, PostgreSQL, API and AI integration. ' +
      'Services, personal projects, skills, experience, education and contact.',
    headings: {
      bio: 'About',
      services: 'Services',
      projects: 'Personal projects',
      skills: 'Skills',
      experience: 'Professional experience',
      education: 'Education',
      contact: 'Contact',
      faq: 'Frequently asked questions',
    },
    services: SERVICES_EN,
    lede: {
      prefix: 'Text version of the portfolio.',
      game: 'Explore the interactive 3D portfolio',
      separator: ' — ',
      malt: 'see the Malt profile',
    },
    labels: {
      technologies: 'Technologies',
      email: 'Email',
      maltProfile: 'Malt (freelance profile)',
      otherLanguage: 'Cette page en français',
      textVersion: 'Full text version of the portfolio',
      noScript: 'Interactive 3D portfolio — enable JavaScript to explore it as a game.',
    },
    faq: faqEn,
  },
}

export function profileUrl(locale: Locale): string {
  return `${SITE_URL}/${COPY[locale].path}`
}

export function profilePath(locale: Locale): string {
  return COPY[locale].path
}

function other(locale: Locale): Locale {
  return locale === 'fr' ? 'en' : 'fr'
}

/* -------------------------------------------------------------------------- */
/* Fragments HTML partagés par le repli et les pages texte                     */
/* -------------------------------------------------------------------------- */

function bioHtml(dict: Dict): string {
  return dict.about.bio
    .split('\n\n')
    .map((paragraph) => `<p>${esc(paragraph)}</p>`)
    .join('')
}

function servicesHtml(copy: Copy): string {
  return copy.services
    .map(
      (service) =>
        `<article><h3>${esc(service.name)}</h3><p>${esc(service.description)}</p></article>`,
    )
    .join('')
}

/**
 * Produits personnels.
 *
 * Le seul endroit du site où une compétence est adossée à une réalisation
 * nommée, datée et chiffrée. C'est ce qu'un moteur — classique ou génératif —
 * peut citer sans avoir à croire sur parole une liste de technologies.
 */
function projectsHtml(dict: Dict, copy: Copy): string {
  return dict.projects
    .map((project) => {
      const tags = project.tags.map((tag) => esc(tag)).join(', ')
      return (
        `<article><h3>${esc(project.name)} — ${esc(project.tagline)}</h3>` +
        `<p>${esc(dict.ui.portfolio.personalProject)} · ${esc(project.period)}</p>` +
        `<p>${esc(project.summary)}</p>` +
        `<p>${esc(project.approach)}</p>` +
        `<p>${esc(project.outcome)}</p>` +
        `<p>${esc(copy.labels.technologies)} : ${tags}.</p></article>`
      )
    })
    .join('')
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
      const tags = job.tags.length ? `<p>${job.tags.map((tag) => esc(tag)).join(', ')}</p>` : ''
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

  return `<ul>${schools}</ul><h3>${esc(dict.ui.background.certifications)}</h3><ul>${certs}</ul>`
}

/**
 * Liens de contact.
 *
 * `rel="me"` n'est pas décoratif : il déclare que ces comptes sont la même
 * personne que l'auteur de la page. C'est ce qui permet à un moteur de
 * rattacher le portfolio, le profil Malt, LinkedIn et GitHub à une seule
 * entité au lieu de quatre homonymes.
 */
function contactHtml(dict: Dict, copy: Copy): string {
  const { contact } = dict
  const external = (href: string, label: string) =>
    `<a href="${esc(href)}" rel="me noopener" target="_blank">${esc(label)}</a>`

  return (
    '<ul>' +
    `<li>${esc(copy.labels.email)} : <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></li>` +
    `<li>${esc(copy.labels.maltProfile)} : ${external(contact.malt, contact.malt)}</li>` +
    `<li>LinkedIn : ${external(contact.linkedin, contact.linkedin)}</li>` +
    `<li>GitHub : ${external(contact.github, contact.github)}</li>` +
    '</ul>'
  )
}

function faqHtml(dict: Dict, copy: Copy): string {
  return copy
    .faq(dict)
    .map((entry) => `<article><h3>${esc(entry.question)}</h3><p>${esc(entry.answer)}</p></article>`)
    .join('')
}

/* -------------------------------------------------------------------------- */
/* Repli injecté dans #root                                                    */
/* -------------------------------------------------------------------------- */

/** Contenu de repli injecté dans `#root` — lu par les robots sans JS, jamais par un humain. */
export function buildFallback(dict: Dict): string {
  const copy = COPY.fr
  const { about } = dict

  return (
    `<div id="seo-fallback">` +
    `<main>` +
    `<header><h1>${esc(about.name)}</h1><p>${esc(about.title)}</p>` +
    `<p>${esc(about.location)}</p></header>` +
    `<section><h2>${esc(copy.headings.bio)}</h2>${bioHtml(dict)}</section>` +
    `<section><h2>${esc(copy.headings.services)}</h2>${servicesHtml(copy)}</section>` +
    `<section><h2>${esc(copy.headings.projects)}</h2>${projectsHtml(dict, copy)}</section>` +
    `<section><h2>${esc(copy.headings.skills)}</h2>${skillsHtml(dict)}</section>` +
    `<section><h2>${esc(copy.headings.experience)}</h2>${experienceHtml(dict)}</section>` +
    `<section><h2>${esc(copy.headings.education)}</h2>${educationHtml(dict)}</section>` +
    `<section><h2>${esc(copy.headings.contact)}</h2>${contactHtml(dict, copy)}</section>` +
    `<p><a href="/${copy.path}">${esc(copy.labels.textVersion)}</a> · ` +
    `<a href="/${COPY.en.path}" hreflang="en">${esc(COPY.en.labels.textVersion)}</a></p>` +
    `<p><small>${esc(copy.labels.noScript)}</small></p>` +
    `</main></div>`
  )
}

/* -------------------------------------------------------------------------- */
/* Pages texte                                                                 */
/* -------------------------------------------------------------------------- */

/** Feuille de style des pages texte : sobre, lisible, aucune requête réseau. */
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
export function buildProfilePage(dict: Dict, locale: Locale, jsonLd: string): string {
  const copy = COPY[locale]
  const twin = COPY[other(locale)]
  const { about } = dict
  const url = profileUrl(locale)

  // `hreflang` apparie les deux pages texte, et rien d'autre : l'accueil sert
  // les deux langues à une seule URL, il n'est la traduction de personne.
  const alternates =
    LOCALES.map(
      (candidate) =>
        `<link rel="alternate" hreflang="${COPY[candidate].htmlLang}" href="${profileUrl(candidate)}" />`,
    ).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${profileUrl('fr')}" />`

  return (
    `<!doctype html>\n<html lang="${copy.htmlLang}">\n<head>\n` +
    `<meta charset="UTF-8" />\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n` +
    `<title>${esc(copy.title)}</title>\n` +
    `<meta name="description" content="${esc(copy.description)}" />\n` +
    `<meta name="author" content="${esc(about.name)}" />\n` +
    `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />\n` +
    `<link rel="canonical" href="${url}" />\n` +
    `${alternates}\n` +
    `<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png" />\n` +
    `<meta property="og:type" content="profile" />\n` +
    `<meta property="og:title" content="${esc(copy.title)}" />\n` +
    `<meta property="og:description" content="${esc(copy.description)}" />\n` +
    `<meta property="og:url" content="${url}" />\n` +
    `<meta property="og:image" content="${SITE_URL}/og-image.png" />\n` +
    `<meta property="og:locale" content="${copy.ogLocale}" />\n` +
    `<meta name="twitter:card" content="summary_large_image" />\n` +
    `<style>${PROFILE_STYLE}</style>\n` +
    `<script type="application/ld+json">${jsonLd}</script>\n` +
    `</head>\n<body>\n<main>\n` +
    `<header><h1>${esc(about.name)}</h1>` +
    `<p>${esc(about.title)}</p><p>${esc(about.location)}</p></header>` +
    `<p class="lede">${esc(copy.lede.prefix)} ` +
    `<a href="/">${esc(copy.lede.game)}</a>${esc(copy.lede.separator)}` +
    `<a href="${esc(dict.contact.malt)}" rel="me noopener" target="_blank">${esc(copy.lede.malt)}</a>.<br />` +
    `<a href="/${twin.path}" hreflang="${twin.htmlLang}">${esc(copy.labels.otherLanguage)}</a></p>` +
    `<section><h2>${esc(copy.headings.bio)}</h2>${bioHtml(dict)}</section>` +
    `<section><h2>${esc(copy.headings.services)}</h2>${servicesHtml(copy)}</section>` +
    `<section><h2>${esc(copy.headings.projects)}</h2>${projectsHtml(dict, copy)}</section>` +
    `<section><h2>${esc(copy.headings.skills)}</h2>${skillsHtml(dict)}</section>` +
    `<section><h2>${esc(copy.headings.experience)}</h2>${experienceHtml(dict)}</section>` +
    `<section><h2>${esc(copy.headings.education)}</h2>${educationHtml(dict)}</section>` +
    `<section><h2>${esc(copy.headings.contact)}</h2>${contactHtml(dict, copy)}</section>` +
    `<section><h2>${esc(copy.headings.faq)}</h2>${faqHtml(dict, copy)}</section>` +
    `<footer><p><a href="/">${esc(copy.lede.game)}</a> · ` +
    `<a href="https://${esc(dict.contact.website)}">${esc(dict.contact.website)}</a></p></footer>` +
    `</main>\n</body>\n</html>\n`
  )
}

/* -------------------------------------------------------------------------- */
/* llms.txt                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Résumé Markdown à la racine, pour les moteurs génératifs.
 *
 * Même idée que `robots.txt`, mais à l'endroit : plutôt que d'interdire des
 * chemins, on offre une lecture courte et sans ambiguïté du site, dans un
 * format qu'un modèle ingère sans avoir à démêler du HTML. Rédigé en anglais,
 * la langue dans laquelle ces moteurs raisonnent, avec les deux pages texte en
 * tête pour qu'un modèle aille y chercher le détail.
 */
export function buildLlmsTxt(dicts: Dicts): string {
  const dict = dicts.en
  const { about, contact } = dict
  const job = currentJob(dict)

  return [
    `# ${about.name} — freelance full-stack web developer (${stack(dict)})`,
    '',
    `> Freelance full-stack web developer based in ${contact.location}, available for ` +
      `front-end and full-stack engagements, on site and remotely. ${intro(dict)}`,
    '',
    `Last updated: ${CONTENT_UPDATED}.`,
    '',
    '## Profile pages',
    '',
    `- [Profile (English)](${profileUrl('en')}): full text profile — services, projects, skills, experience, contact.`,
    `- [Profil (français)](${profileUrl('fr')}): the same profile in French.`,
    `- [Interactive portfolio](${SITE_URL}/): the portfolio as an explorable 3D world (needs JavaScript and WebGL).`,
    '',
    '## Profiles elsewhere',
    '',
    `- [Malt freelance profile](${contact.malt}): rates, availability and client recommendations.`,
    `- [LinkedIn](${contact.linkedin})`,
    `- [GitHub](${contact.github})`,
    '',
    '## Services',
    '',
    ...SERVICES_EN.map((service) => `- **${service.name}**: ${service.description}`),
    '',
    '## Personal projects',
    '',
    ...dict.projects.map(
      (project) =>
        `- **${project.name}** — ${project.tagline} (${project.period}). ${project.summary} ` +
        `${project.outcome} Built with: ${project.tags.join(', ')}.`,
    ),
    '',
    '## Skills',
    '',
    ...SKILL_GROUPS.map(
      (group) => `- **${dict.ui.skillGroups[group]}**: ${dict.skills[group].join(', ')}`,
    ),
    '',
    '## Current engagement',
    '',
    job
      ? `- ${job.role} at ${job.company} (${job.period}, ${job.location}). ${job.description}`
      : '- Available for new engagements.',
    '',
    '## Contact',
    '',
    `- Email: ${contact.email}`,
    `- Malt: ${contact.malt}`,
    `- Based in ${contact.location}, works remotely.`,
    '',
  ].join('\n')
}

/* -------------------------------------------------------------------------- */
/* Données structurées schema.org                                              */
/* -------------------------------------------------------------------------- */

/** Identité : un seul nœud `Person`, référencé par `@id` partout ailleurs. */
function personNode(dict: Dict, locale: Locale) {
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
    mainEntityOfPage: { '@id': `${profileUrl(locale)}#profilepage` },
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
    knowsAbout: knowsAbout(dict),
    knowsLanguage: [...LOCALES],
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
      skills: knowsAbout(dict).join(', '),
      occupationLocation: { '@type': 'City', name: 'Marseille' },
    },
    ...(job ? { worksFor: { '@type': 'Organization', name: job.company } } : {}),
    makesOffer: { '@id': `${SITE_URL}/#services` },
  }
}

function projectId(project: Project): string {
  return `${SITE_URL}/#project-${project.id}`
}

/**
 * Un nœud par produit personnel.
 *
 * `WebApplication` plutôt que `CreativeWork` : ce sont des applications web, et
 * le type précis est ce qui permet à un moteur de répondre « il a construit une
 * plateforme de prospection » plutôt que « il a publié quelque chose ».
 * `author` pointe vers la même personne que tout le reste du graphe — c'est
 * cette arête qui attribue le travail.
 */
function projectNodes(dict: Dict, locale: Locale) {
  return dict.projects.map((project) => ({
    '@type': 'WebApplication',
    '@id': projectId(project),
    name: project.name,
    disambiguatingDescription: project.tagline,
    description: `${project.summary} ${project.approach}`,
    abstract: project.outcome,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    dateCreated: project.period,
    inLanguage: COPY[locale].htmlLang,
    keywords: project.tags.join(', '),
    author: { '@id': `${SITE_URL}/#person` },
    creator: { '@id': `${SITE_URL}/#person` },
    isPartOf: { '@id': `${SITE_URL}/#website` },
  }))
}

/** Offre de services : le nœud que vise une recherche « développeur React freelance ». */
function serviceNode(dict: Dict, locale: Locale) {
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
      itemListElement: COPY[locale].services.map((service) => ({
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
    inLanguage: [...LOCALES],
    author: { '@id': `${SITE_URL}/#person` },
    publisher: { '@id': `${SITE_URL}/#person` },
  }
}

/**
 * Données structurées de la page demandée.
 *
 * Toutes les pages partagent l'identité (`Person`, `Service`, `WebSite`, les
 * projets) et ne diffèrent que par le nœud de page. La FAQ n'est déclarée que
 * sur les pages texte, où les questions sont réellement affichées : annoncer
 * une FAQ absente de la page est une raison de sanction, pas un raccourci.
 */
export function buildJsonLd(dict: Dict, page: 'home' | Locale): string {
  const locale: Locale = page === 'home' ? 'fr' : page
  const copy = COPY[locale]
  const shared = [
    personNode(dict, locale),
    serviceNode(dict, locale),
    websiteNode(dict),
    ...projectNodes(dict, locale),
  ]

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
            dateModified: CONTENT_UPDATED,
          },
        ]
      : [
          {
            '@type': 'ProfilePage',
            '@id': `${profileUrl(locale)}#profilepage`,
            url: profileUrl(locale),
            name: copy.title,
            description: copy.description,
            inLanguage: copy.htmlLang,
            isPartOf: { '@id': `${SITE_URL}/#website` },
            mainEntity: { '@id': `${SITE_URL}/#person` },
            hasPart: dict.projects.map((project) => ({ '@id': projectId(project) })),
            // Google lit explicitement ces deux dates sur une ProfilePage.
            dateCreated: '2026-08-27',
            dateModified: CONTENT_UPDATED,
          },
          {
            '@type': 'FAQPage',
            '@id': `${profileUrl(locale)}#faq`,
            inLanguage: copy.htmlLang,
            isPartOf: { '@id': `${profileUrl(locale)}#profilepage` },
            mainEntity: copy.faq(dict).map((entry) => ({
              '@type': 'Question',
              name: entry.question,
              acceptedAnswer: { '@type': 'Answer', text: entry.answer },
            })),
          },
        ]

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [...pageNodes, ...shared] })
}
