import type { HtmlTagDescriptor, Plugin } from 'vite'

/**
 * Injection des scripts de mesure d'audience — Umami, et Google Analytics 4.
 *
 * Les deux sont posés côte à côte et reçoivent les mêmes événements ; ce qui
 * distingue le second est écrit plus bas, à la section qui le construit.
 *
 * Ce plugin couvre `index.html`. Les pages texte `/profil/` et `/en/profile/`
 * sont écrites à la main par `plugins/seo.ts` et n'ont donc rien à voir avec
 * `transformIndexHtml` : elles récupèrent les mêmes balises par
 * `trackingTags()`, exporté plus bas.
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
 * Sans `VITE_UMAMI_WEBSITE_ID` ni identifiant de mesure Google, le plugin
 * n'injecte rien : le site se construit et se déploie normalement, simplement
 * sans mesure. C'est l'état permanent de quiconque clone le projet, et chaque
 * collecteur s'éteint séparément — vider une seule des deux variables laisse
 * l'autre en place.
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
  let measurementId: string | undefined

  return {
    name: 'analytics',
    apply: 'build',

    configResolved(config) {
      // `config.env` porte les variables `VITE_*` déjà chargées par Vite depuis
      // les fichiers `.env*` **et** l'environnement du processus — c'est par ce
      // second chemin qu'arrive la variable définie dans le tableau de bord
      // Vercel, où aucun fichier `.env` n'existe.
      websiteId = umamiWebsiteId(config.env)
      measurementId = gaMeasurementId(config.env)
    },

    transformIndexHtml() {
      // Les deux collecteurs sont indépendants : l'un configuré sans l'autre
      // doit donner une mesure partielle, jamais une page sans mesure.
      const tags: HtmlTagDescriptor[] = []

      if (websiteId) {
        tags.push({ tag: 'script', injectTo: 'head', attrs: { defer: true, ...attrs(websiteId) } })
      }
      if (measurementId) {
        // `children` et non `src` : la balise porte son propre garde de domaine,
        // voir `googleSnippet()`.
        tags.push({ tag: 'script', injectTo: 'head', children: googleSnippet(measurementId) })
      }

      return tags
    },
  }
}

/* --- Google Analytics 4 ------------------------------------------------------ */

/**
 * Le second collecteur, posé à côté d'Umami et non à sa place.
 *
 * Les deux reçoivent exactement les mêmes événements (voir `track()` dans
 * `src/analytics/`), et c'est voulu : Umami donne un tableau de bord d'une page
 * qu'on lit en dix secondes, GA4 donne les entonnoirs, la comparaison de
 * périodes et l'origine du trafic. Débrancher l'un revient à vider sa variable
 * d'environnement ; rien d'autre ne bouge.
 *
 * **Le tag démarre sans cookie, et attend une réponse.**
 * `analytics_storage: 'denied'` est posé dès le premier appel, avant tout
 * `config` : passé lui, un défaut de consentement arrive trop tard et le
 * premier relevé part avec un cookie. Le bandeau du jeu (voir
 * `components/ConsentBanner.tsx`) envoie ensuite l'`update` qui suit la
 * réponse, et le choix est relu ici à chaque visite suivante — sans quoi un
 * visiteur consentant repartirait anonyme pendant toute la première seconde,
 * page vue comprise.
 *
 * **Ce que vaut l'état refusé, et il vaut moins qu'on ne croit.** Un relevé
 * sans cookie ne porte ni identifiant d'utilisateur ni identifiant de session :
 * GA4 ne l'affiche ni en temps réel, ni dans les rapports, ni dans DebugView.
 * Il ne nourrit que la modélisation comportementale, qui exige mille
 * utilisateurs **consentants** par jour pour s'activer — un seuil qu'un
 * portfolio n'atteint pas. Tant que personne n'accepte, Google reçoit tout et
 * ne montre rien. C'est précisément ce qui a rendu ce bandeau nécessaire.
 *
 * Umami, lui, ne dépend d'aucun de ces réglages : sans cookie ni identifiant
 * persistant, il compte tout le monde, y compris ceux qui refusent ici.
 */

/**
 * Où le choix du visiteur est rangé, et **la même chaîne que
 * `src/store/useConsentStore.ts`**.
 *
 * Elle est recopiée plutôt qu'importée, et c'est le seul endroit du projet où
 * une valeur l'est : ce fichier tourne dans Node au build et produit du texte,
 * l'autre tourne dans le navigateur. Les faire se rejoindre demanderait un
 * module partagé compilé pour les deux mondes, pour une chaîne de dix-sept
 * caractères. Le test de `plugins/analytics.test.ts` compare les deux fichiers
 * et casse si l'une des deux bouge sans l'autre — c'est lui, la couture.
 */
const CONSENT_KEY = 'z-project:consent'

/** Préfixe de l'identifiant de flux GA4. Une ancienne clé `UA-` ne vaut rien. */
const GA_PREFIX = 'G-'

/**
 * Où lire l'identifiant de mesure, dans l'ordre.
 *
 * `VITE_FIREBASE_MEASUREMENT_ID` sert de repli parce que la propriété GA4 de ce
 * projet a été créée **depuis la console Firebase** : l'identifiant y figure
 * déjà, et exiger de le recopier sous un second nom n'aurait servi qu'à créer
 * l'occasion de recopier une faute. `VITE_GA_MEASUREMENT_ID` reste prioritaire
 * pour le jour où la mesure quitterait Firebase.
 */
const GA_ENV_KEYS = ['VITE_GA_MEASUREMENT_ID', 'VITE_FIREBASE_MEASUREMENT_ID'] as const

/** Lit l'identifiant de flux GA4. `undefined` s'il est absent ou mal formé. */
export function gaMeasurementId(env: Record<string, unknown>): string | undefined {
  for (const key of GA_ENV_KEYS) {
    const id = env[key]
    if (typeof id === 'string' && id.startsWith(GA_PREFIX)) return id
  }
  return undefined
}

/**
 * Le script d'amorçage, en une seule balise inline.
 *
 * On aurait pu poser la balise `<script async src="…/gtag/js?id=…">` que Google
 * donne dans sa documentation, puis la configurer juste après. Ce n'est pas
 * possible ici, pour une raison qu'Umami règle par un attribut : **Vercel
 * publie une préproduction par commit**, et ces domaines `*.vercel.app` sont de
 * vrais builds de production. `data-domains` écarte ces visites côté Umami ;
 * gtag.js n'a pas d'équivalent, la seule barrière est donc de ne pas charger le
 * script du tout — d'où le `return` en tête, avant la moindre requête.
 *
 * Le reste suit l'ordre imposé par Google : `dataLayer` d'abord, le
 * consentement **avant** `config` (une fois la configuration passée, un défaut
 * de consentement arrive trop tard et le premier relevé part avec un cookie),
 * le script en dernier — les commandes empilées dans `dataLayer` avant son
 * arrivée sont rejouées au chargement.
 */
function googleSnippet(measurementId: string): string {
  const allowed = JSON.stringify(DOMAINS.split(','))
  return `(function(){
if(${allowed}.indexOf(location.hostname)===-1)return;
var granted=false;try{granted=localStorage.getItem('${CONSENT_KEY}')==='granted'}catch(e){}
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments)}
window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:granted?'granted':'denied'});
gtag('js',new Date());
gtag('config','${measurementId}');
var s=document.createElement('script');
s.async=true;
s.src='https://www.googletagmanager.com/gtag/js?id=${measurementId}';
document.head.appendChild(s);
})()`
}

/** La balise Google en HTML brut. Chaîne vide sans identifiant. */
export function googleTag(measurementId: string | undefined): string {
  if (!measurementId) return ''
  return `<script>${googleSnippet(measurementId)}</script>
`
}

/**
 * Les deux balises de mesure, pour les pages que Vite ne transforme pas.
 *
 * Un seul point d'entrée plutôt que deux appels côte à côte dans `seo.ts` :
 * ajouter un troisième collecteur un jour ne doit pas demander de se souvenir
 * qu'il existe une seconde famille de pages à servir.
 */
export function trackingTags(env: Record<string, unknown>): string {
  return umamiTag(umamiWebsiteId(env)) + googleTag(gaMeasurementId(env))
}
