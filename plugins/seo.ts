import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { umamiTag, umamiWebsiteId } from './analytics.ts'
import {
  buildFallback,
  buildJsonLd,
  buildLlmsTxt,
  buildProfilePage,
  LOCALES,
  profilePath,
  type Dict,
  type Dicts,
  type Locale,
} from './seo-content.ts'

/**
 * Référencement d'une application 100 % rendue côté client.
 *
 * Le portfolio est une scène WebGL : sans JavaScript, un robot d'indexation ne
 * voit qu'un `<div id="root">` vide — et *avec* JavaScript, il voit un
 * `<canvas>`, ce qui n'est pas mieux. Ce plugin comble les deux trous au build
 * (et en dev) à partir d'une seule source de vérité — `src/i18n/*.json`, les
 * mêmes fichiers que le jeu affiche :
 *
 *   1. il écrit une version HTML sémantique du portfolio **à l'intérieur de
 *      `#root`**. React 19 vide le conteneur à son premier rendu : ce contenu
 *      ne subsiste que pour les visiteurs sans JS ;
 *   2. il génère **`/profil/` et `/en/profile/`**, deux vraies pages texte
 *      statiques et indexables, appariées par `hreflang`. Ce sont elles qui
 *      portent le référencement : elles survivent au rendu, se chargent en
 *      quelques kilo-octets, et un lien réel de l'accueil y mène ;
 *   3. il publie **`/llms.txt`**, résumé Markdown pour les moteurs génératifs ;
 *   4. il injecte le JSON-LD adapté à chaque page (`WebPage` sur l'accueil,
 *      `ProfilePage` + `FAQPage` sur les pages texte).
 *
 * Tout ce qui est statique (title, meta, Open Graph…) reste écrit à la main dans
 * `index.html` : seul le contenu dérivé des données passe par ici, pour ne
 * jamais désynchroniser la page et le portfolio. La construction du contenu
 * vit dans `seo-content.ts` ; ce fichier ne fait que la brancher sur Vite.
 */

const here = dirname(fileURLToPath(import.meta.url))

/** La langue de l'accueil, donc celle du repli injecté dans `#root`. */
const DEFAULT_LOCALE: Locale = 'fr'

function readDict(locale: Locale): Dict {
  const path = resolve(here, '../src/i18n', `${locale}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as Dict
}

/**
 * Les dictionnaires sont relus à chaque appel, jamais mis en cache : en dev,
 * corriger une phrase dans `fr.json` doit se voir au rechargement suivant.
 */
function readDicts(): Dicts {
  return { fr: readDict('fr'), en: readDict('en') }
}

/**
 * Un `<` littéral fermerait la balise `<script>` qui porte le JSON-LD. Aucune
 * donnée actuelle n'en contient, mais la première bio qui écrira « <3 » ne
 * devra pas casser silencieusement la page.
 */
function inlineJson(json: string): string {
  return json.replace(/</g, '\\u003c')
}

/**
 * `tracking` est passé au build et jamais par le middleware de développement :
 * les dizaines de rechargements d'une session de travail n'ont rien à faire
 * dans les statistiques. C'est le pendant de `apply: 'build'` sur le plugin
 * `analytics`, que ces pages-ci ne traversent pas — elles sont écrites à la
 * main, pas transformées par Vite.
 */
function profileHtml(locale: Locale, tracking: string): string {
  const dict = readDict(locale)
  return buildProfilePage(dict, locale, inlineJson(buildJsonLd(dict, locale)), tracking)
}

/** Chemins servis en dev, avec ou sans barre finale. */
function matches(path: string, target: string): boolean {
  return path === `/${target}` || path === `/${target.replace(/\/$/, '')}`
}

export function seo(): Plugin {
  let tracking = ''

  return {
    name: 'seo-fallback',

    configResolved(config) {
      tracking = umamiTag(umamiWebsiteId(config.env))
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const dict = readDict(DEFAULT_LOCALE)
        const jsonLd = inlineJson(buildJsonLd(dict, 'home'))

        return html
          .replace('<div id="root"></div>', `<div id="root">${buildFallback(dict)}</div>`)
          .replace(
            '</head>',
            `    <script type="application/ld+json">${jsonLd}</script>\n  </head>`,
          )
      },
    },

    /**
     * En dev, ces fichiers n'existent sur aucun disque : on les sert à la volée
     * pour pouvoir les relire et les valider sans lancer un build complet.
     */
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]

        if (path === '/llms.txt') {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(buildLlmsTxt(readDicts()))
          return
        }

        const locale = LOCALES.find((candidate) => matches(path, profilePath(candidate)))
        if (!locale) {
          next()
          return
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(profileHtml(locale, ''))
      })
    },

    generateBundle() {
      for (const locale of LOCALES) {
        this.emitFile({
          type: 'asset',
          fileName: `${profilePath(locale)}index.html`,
          source: profileHtml(locale, tracking),
        })
      }

      this.emitFile({
        type: 'asset',
        fileName: 'llms.txt',
        source: buildLlmsTxt(readDicts()),
      })
    },
  }
}
