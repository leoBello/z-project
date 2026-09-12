import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import {
  buildFallback,
  buildJsonLd,
  buildProfilePage,
  PROFILE_PATH,
  type Dict,
} from './seo-content.ts'

/**
 * Référencement d'une application 100 % rendue côté client.
 *
 * Le portfolio est une scène WebGL : sans JavaScript, un robot d'indexation ne
 * voit qu'un `<div id="root">` vide — et *avec* JavaScript, il voit un
 * `<canvas>`, ce qui n'est pas mieux. Ce plugin comble les deux trous au build
 * (et en dev) à partir d'une seule source de vérité — `src/i18n/fr.json`, le
 * même fichier que le jeu affiche :
 *
 *   1. il écrit une version HTML sémantique du portfolio **à l'intérieur de
 *      `#root`**. React 19 vide le conteneur à son premier rendu : ce contenu
 *      ne subsiste que pour les visiteurs sans JS ;
 *   2. il génère **`/profil/`**, une vraie page texte statique et indexable.
 *      C'est elle qui porte le référencement : elle survit au rendu, se charge
 *      en quelques kilo-octets, et un lien réel de l'accueil y mène ;
 *   3. il injecte le JSON-LD adapté à chaque page (`WebPage` + `Person` +
 *      `Service` sur l'accueil, `ProfilePage` + `FAQPage` sur `/profil/`).
 *
 * Tout ce qui est statique (title, meta, Open Graph…) reste écrit à la main dans
 * `index.html` : seul le contenu dérivé des données passe par ici, pour ne
 * jamais désynchroniser la page et le portfolio. La construction du contenu
 * vit dans `seo-content.ts` ; ce fichier ne fait que la brancher sur Vite.
 */

const here = dirname(fileURLToPath(import.meta.url))

const DEFAULT_LOCALE = 'fr'

function readDict(): Dict {
  const path = resolve(here, '../src/i18n', `${DEFAULT_LOCALE}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as Dict
}

/**
 * Un `<` littéral fermerait la balise `<script>` qui porte le JSON-LD. Aucune
 * donnée actuelle n'en contient, mais la première bio qui écrira « <3 » ne
 * devra pas casser silencieusement la page.
 */
function inlineJson(json: string): string {
  return json.replace(/</g, '\\u003c')
}

function profileHtml(): string {
  const dict = readDict()
  return buildProfilePage(dict, inlineJson(buildJsonLd(dict, 'profile')))
}

export function seo(): Plugin {
  return {
    name: 'seo-fallback',

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const dict = readDict()
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
     * En dev, `/profil/` n'existe sur aucun disque : on la sert à la volée pour
     * pouvoir la relire et la valider sans lancer un build complet.
     */
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (path !== `/${PROFILE_PATH}` && path !== `/${PROFILE_PATH.replace(/\/$/, '')}`) {
          next()
          return
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(profileHtml())
      })
    },

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: `${PROFILE_PATH}index.html`,
        source: profileHtml(),
      })
    },
  }
}
