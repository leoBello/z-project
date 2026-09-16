import type { Plugin } from 'vite'

/**
 * Injection du script de mesure d'audience (Umami).
 *
 * Ce plugin couvre `index.html`. Les pages texte `/profil/` et `/en/profile/`
 * sont écrites à la main par `plugins/seo.ts` et n'ont donc rien à voir avec
 * `transformIndexHtml` : elles récupèrent la même balise par `umamiTag()`,
 * exporté plus bas.
 *
 * Trois décisions valent d'être expliquées.
 *
 * **Pourquoi une balise dans le HTML, et non un `import` depuis `main.tsx`.**
 * Chargé depuis le bundle, le script ne s'exécuterait qu'après le
 * téléchargement des ~3,6 Mo de moteur 3D : un visiteur qui abandonne pendant
 * le chargement ne serait jamais compté, et le taux d'abandon — la mesure la
 * plus utile de ce site — deviendrait précisément la seule impossible à lire.
 * Dans le `<head>`, la page vue part immédiatement, et `boot_complete`
 * (voir `src/analytics/`) se compare à elle.
 *
 * **Pourquoi `apply: 'build'`.** En développement, le jeu est rechargé des
 * dizaines de fois par heure : ces visites gonfleraient les chiffres sans rien
 * dire de personne.
 *
 * **Pourquoi `data-domains` malgré ça.** Vercel publie une préproduction pour
 * chaque commit, sur un domaine `*.vercel.app` : ce sont de vrais builds de
 * production, donc `apply: 'build'` ne les filtre pas. Umami n'émet que depuis
 * les domaines listés ici, ce qui les écarte sans configuration côté Vercel.
 *
 * Sans `VITE_UMAMI_WEBSITE_ID`, le plugin n'injecte rien : le site se construit
 * et se déploie normalement, simplement sans mesure. C'est l'état du dépôt tant
 * que l'identifiant n'est pas renseigné dans les variables d'environnement
 * Vercel, et l'état permanent de quiconque clone le projet.
 */

/** Point de collecte de l'offre hébergée d'Umami. */
const SCRIPT_URL = 'https://cloud.umami.is/script.js'

/**
 * Seuls domaines depuis lesquels le script émet. Sans protocole.
 *
 * **Cette ligne est couplée au domaine canonique servi par Vercel, et le
 * couplage est muet.** Umami compare `location.hostname` à cette liste par
 * égalité stricte, sans retirer le moindre préfixe. Le 16 septembre 2026, la
 * production servait `www.leobello.dev` alors que seule la forme nue figurait
 * ici : le script se chargeait sur chaque page, puis abandonnait chaque
 * événement sans un mot. Pas d'erreur en console, pas de requête en échec dans
 * l'onglet réseau — un tableau de bord vide, et rien qui indique où chercher.
 *
 * Les deux formes sont listées alors qu'une seule sert aujourd'hui : `www` est
 * redirigé en 308 vers la forme nue, donc aucune page n'y est jamais rendue.
 * C'est délibérément une ceinture de sécurité. Le sens de cette redirection est
 * un réglage du tableau de bord Vercel, invisible depuis le dépôt, et il a déjà
 * changé une fois.
 */
const DOMAINS = 'leobello.dev,www.leobello.dev'

/** Nom de la variable d'environnement portant l'identifiant du site Umami. */
const ENV_KEY = 'VITE_UMAMI_WEBSITE_ID'

/**
 * Attributs de la balise, définis une seule fois.
 *
 * Le script doit être posé sur deux familles de pages construites par des
 * chemins sans rapport — `index.html`, que Vite transforme, et les pages texte
 * `/profil/` que `plugins/seo.ts` écrit à la main. Les faire diverger ferait
 * remonter deux jeux de statistiques aux règles différentes sans que rien ne
 * le signale.
 */
function attrs(websiteId: string): Record<string, string> {
  return {
    src: SCRIPT_URL,
    'data-website-id': websiteId,
    'data-domains': DOMAINS,
  }
}

/** Lit l'identifiant dans l'environnement résolu par Vite. `undefined` si absent. */
export function umamiWebsiteId(env: Record<string, unknown>): string | undefined {
  const id = env[ENV_KEY]
  return typeof id === 'string' && id !== '' ? id : undefined
}

/**
 * La balise en HTML brut, pour les pages que Vite ne transforme pas.
 *
 * Chaîne vide si aucun identifiant n'est configuré — l'appelant l'insère alors
 * sans condition et n'ajoute rien.
 */
export function umamiTag(websiteId: string | undefined): string {
  if (!websiteId) return ''
  const rendered = Object.entries(attrs(websiteId))
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ')
  return `<script defer ${rendered}></script>
`
}

export function analytics(): Plugin {
  let websiteId: string | undefined

  return {
    name: 'analytics',
    apply: 'build',

    configResolved(config) {
      // `config.env` porte les variables `VITE_*` déjà chargées par Vite depuis
      // les fichiers `.env*` **et** l'environnement du processus — c'est par ce
      // second chemin qu'arrive la variable définie dans le tableau de bord
      // Vercel, où aucun fichier `.env` n'existe.
      websiteId = umamiWebsiteId(config.env)
    },

    transformIndexHtml() {
      if (!websiteId) return

      return [{ tag: 'script', injectTo: 'head', attrs: { defer: true, ...attrs(websiteId) } }]
    },
  }
}
