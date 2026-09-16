import type { LandmarkId } from '../types/game'

/**
 * Mesure d'audience.
 *
 * Le portfolio est une scène 3D servie à une seule URL : compter les *pages
 * vues* n'apprendrait rien, tout le monde arrive sur `/` et en repart. Ce qui
 * se mesure ici, ce sont des **événements** — franchir l'écran de chargement,
 * ouvrir un monument, cliquer un lien de contact.
 *
 * Le fournisseur est Umami (offre gratuite), choisi pour trois raisons :
 * un script de ~2 ko, aucun cookie ni identifiant persistant — donc **pas de
 * bandeau de consentement** à poser devant une expérience plein écran —, et des
 * événements nommés compris dans l'offre gratuite. Le script lui-même est posé
 * au build par `plugins/analytics.ts` — sur `index.html`, et sur les pages
 * texte `/profil/` via `plugins/seo.ts` ; ce module ne fait que lui parler.
 *
 * **Tout est facultatif.** Sans script chargé — développement, déploiement de
 * prévisualisation, bloqueur de publicité, variable d'environnement absente —
 * `window.umami` n'existe pas et `track()` ne fait rien. Aucun appel d'ici ne
 * doit donc jamais être placé sur un chemin dont dépend le jeu.
 */

/**
 * Événements émis par le site, et la forme de leurs données.
 *
 * Déclarés en un seul endroit plutôt qu'écrits au fil des appels : un nom
 * d'événement mal orthographié ne casse rien, il crée silencieusement une
 * seconde ligne dans le tableau de bord — une erreur qu'on ne découvre qu'au
 * moment de lire les chiffres, des semaines plus tard.
 */
interface Events {
  /**
   * L'écran de chargement s'efface, le monde est jouable.
   *
   * L'événement le plus important du site : rapporté au nombre de pages vues,
   * il donne le taux d'abandon pendant le téléchargement des ~3,6 Mo du bundle,
   * qui est le principal risque de l'accueil. `outcome: 'timeout'` signale un
   * chargement qui n'a jamais abouti et dont le filet de sécurité a pris le
   * relais — un échec, pas une réussite lente.
   */
  boot_complete: { ms: number; outcome: 'ready' | 'timeout' }
  /** Le panneau d'un monument s'ouvre : une section du portfolio est lue. */
  landmark_opened: { landmark: LandmarkId; via: 'walk' | 'teleport' }
  /** Un lien sortant du portfolio est cliqué (contact, projet, réseau). */
  outbound_link: { target: string }
}

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void }
  }
}

export function track<E extends keyof Events>(event: E, data: Events[E]): void {
  // `?.` sur les deux niveaux : le script peut être absent, mais aussi en cours
  // de chargement (`defer`) au moment du tout premier événement.
  window.umami?.track?.(event, data)
}

/**
 * Clé stable pour un lien sortant, dérivée de l'URL et **jamais du libellé**.
 *
 * Les libellés sont traduits : « Profil Malt » et « Malt profile » scinderaient
 * les statistiques d'un même lien en deux lignes, proportionnellement au
 * partage des langues plutôt qu'à l'intérêt réel. Le domaine, lui, ne change
 * pas de langue.
 */
export function linkTarget(href: string): string {
  if (href.startsWith('mailto:')) return 'email'
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    // Lien relatif ou malformé : on garde le chemin brut plutôt que de perdre
    // l'événement.
    return href
  }
}
