import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * Référencement d'une application 100 % rendue côté client.
 *
 * Le portfolio est une scène WebGL : sans JavaScript, un robot d'indexation ne
 * voit qu'un `<div id="root">` vide. Ce plugin comble ce trou au build (et en
 * dev) à partir d'une seule source de vérité — `src/i18n/fr.json`, le même
 * fichier que le jeu affiche :
 *
 *   1. il écrit une version HTML sémantique du portfolio (bio, compétences,
 *      expériences, formation, contact) **à l'intérieur de `#root`**. React 19
 *      vide le conteneur à son premier rendu, donc ce contenu disparaît dès que
 *      l'application démarre ; il ne subsiste que pour les visiteurs sans JS et
 *      pour les robots qui n'exécutent pas de script ;
 *   2. il injecte un bloc JSON-LD `Person` + `WebSite` dans le `<head>`.
 *
 * Tout ce qui est statique (title, meta, Open Graph…) reste écrit à la main dans
 * `index.html` : seul le contenu dérivé des données passe par ici, pour ne
 * jamais désynchroniser la page et le portfolio.
 */

const here = dirname(fileURLToPath(import.meta.url))

const SITE_URL = 'https://leobello.dev'
const DEFAULT_LOCALE = 'fr'

interface Experience {
  company: string
  role: string
  period: string
  location: string
  description: string
  tags: readonly string[]
  featured: boolean
}

interface Dict {
  about: { name: string; title: string; location: string; bio: string; website: string }
  experience: readonly Experience[]
  education: readonly { school: string; degree: string; period: string }[]
  certifications: readonly { name: string; issuer: string }[]
  skills: Record<string, readonly string[]>
  contact: {
    email: string
    linkedin: string
    github: string
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
  skills: 'Compétences',
  experience: 'Expérience professionnelle',
  education: 'Formation',
  contact: 'Contact',
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

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readDict(): Dict {
  const path = resolve(here, '../src/i18n', `${DEFAULT_LOCALE}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as Dict
}

/** Toutes les compétences, dédoublonnées, dans l'ordre des familles. */
function allSkills(dict: Dict): string[] {
  const seen = new Set<string>()
  for (const group of SKILL_GROUPS) {
    for (const skill of dict.skills[group] ?? []) seen.add(skill)
  }
  return [...seen]
}

/** Contenu de repli injecté dans `#root` — lu par les robots, jamais par un humain avec JS. */
function buildFallback(dict: Dict): string {
  const { about, experience, education, certifications, ui } = dict

  const bio = about.bio
    .split('\n\n')
    .map((paragraph) => `<p>${esc(paragraph)}</p>`)
    .join('')

  const skills = SKILL_GROUPS.map((group) => {
    const items = (dict.skills[group] ?? []).map((skill) => `<li>${esc(skill)}</li>`).join('')
    return `<section><h3>${esc(ui.skillGroups[group])}</h3><ul>${items}</ul></section>`
  }).join('')

  const jobs = experience
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

  const schools = education
    .map((entry) => {
      const period = entry.period ? ` (${esc(entry.period)})` : ''
      return `<li>${esc(entry.school)} — ${esc(entry.degree)}${period}</li>`
    })
    .join('')

  const certs = certifications
    .map((cert) => `<li>${esc(cert.name)} — ${esc(cert.issuer)}</li>`)
    .join('')

  const contact = [
    `<li>E-mail : <a href="mailto:${esc(dict.contact.email)}">${esc(dict.contact.email)}</a></li>`,
    `<li>LinkedIn : <a href="${esc(dict.contact.linkedin)}" rel="noopener">${esc(dict.contact.linkedin)}</a></li>`,
    `<li>GitHub : <a href="${esc(dict.contact.github)}" rel="noopener">${esc(dict.contact.github)}</a></li>`,
    `<li>Site web : <a href="https://${esc(dict.contact.website)}">${esc(dict.contact.website)}</a></li>`,
  ].join('')

  return (
    `<div id="seo-fallback">` +
    `<main>` +
    `<header><h1>${esc(about.name)}</h1><p>${esc(about.title)}</p>` +
    `<p>${esc(about.location)}</p></header>` +
    `<section><h2>${HEADINGS.bio}</h2>${bio}</section>` +
    `<section><h2>${HEADINGS.skills}</h2>${skills}</section>` +
    `<section><h2>${HEADINGS.experience}</h2>${jobs}</section>` +
    `<section><h2>${HEADINGS.education}</h2><ul>${schools}</ul>` +
    `<h3>${esc(ui.background.certifications)}</h3><ul>${certs}</ul></section>` +
    `<section><h2>${HEADINGS.contact}</h2><ul>${contact}</ul></section>` +
    `<p><small>Portfolio interactif en 3D — activez JavaScript pour l'explorer en jeu.</small></p>` +
    `</main></div>`
  )
}

/** Données structurées schema.org : identité, réseaux, compétences, site. */
function buildJsonLd(dict: Dict): string {
  const { about, contact } = dict
  const intro = about.bio.split('\n\n')[0]

  const graph = [
    {
      '@type': 'Person',
      '@id': `${SITE_URL}/#person`,
      name: about.name,
      jobTitle: about.title,
      description: intro,
      url: SITE_URL,
      email: `mailto:${contact.email}`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Marseille',
        addressRegion: 'Provence-Alpes-Côte d’Azur',
        addressCountry: 'FR',
      },
      sameAs: [contact.linkedin, contact.github],
      knowsAbout: allSkills(dict),
      knowsLanguage: ['fr', 'en'],
      alumniOf: [
        { '@type': 'CollegeOrUniversity', name: 'Université Grenoble Alpes' },
      ],
      worksFor: {
        '@type': 'Organization',
        name: dict.experience.find((job) => job.featured)?.company ?? 'Freelance',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: `${about.name} — Portfolio`,
      url: SITE_URL,
      inLanguage: 'fr',
      author: { '@id': `${SITE_URL}/#person` },
    },
  ]

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
}

export function seo(): Plugin {
  return {
    name: 'seo-fallback',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const dict = readDict()
        const fallback = buildFallback(dict)
        const jsonLd = buildJsonLd(dict)

        return html
          .replace('<div id="root"></div>', `<div id="root">${fallback}</div>`)
          .replace(
            '</head>',
            `    <script type="application/ld+json">${jsonLd}</script>\n  </head>`,
          )
      },
    },
  }
}
