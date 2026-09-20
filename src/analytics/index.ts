import type { LandmarkId, LynelAttackId, MaleniaPhase } from '../types/game'

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
  /**
   * Une capture de projet est ouverte en plein écran.
   *
   * Répond à la seule question que posent les captures : est-ce qu'on les
   * regarde. `index` dit si les gens vont au-delà de la première — une série
   * qu'on ne parcourt jamais ne mérite pas qu'on la remplisse.
   *
   * Émis à l'ouverture seulement, jamais à chaque changement de photo :
   * l'offre gratuite d'Umami compte les événements, et parcourir une série de
   * cinq en produirait cinq pour une seule intention.
   */
  project_photo_opened: { project: string; index: number }
  /** Un lien sortant du portfolio est cliqué (contact, projet, réseau). */
  outbound_link: { target: string }
  /**
   * La carte est vidée de ses ennemis et le portail de l'Île Céleste s'ouvre.
   *
   * `via` est toute la mesure : il sépare ceux qui sont allés au bout des
   * vingt-six combats de ceux qui ont trouvé le code de triche. Les deux
   * comptent, mais pas la même chose — le premier chiffre dit si le jeu tient
   * sur la durée, le second si l'œuf de Pâques se découvre.
   */
  portal_opened: { via: 'combat' | 'cheat' }
  /**
   * Le joueur franchit le portail et arrive sur l'Île Céleste.
   *
   * Le pendant de `portal_opened`, et c'est le **rapport entre les deux** qui
   * intéresse : ouvrir le portail est une conséquence du jeu, le franchir est
   * une décision. Un portail qu'on ouvre sans jamais y entrer dirait que la
   * promesse n'a pas pris — et c'est la seule chose mesurable tant qu'il n'y a
   * rien à faire sur l'île.
   */
  sky_island_entered: { via: 'portal' }
  /**
   * Une parade reussie sur le Lynel, et laquelle de ses attaques elle a cassee.
   *
   * C'est la seule mesure qui dise si la mecanique la plus difficile du jeu est
   * comprise : un combat gagne sans une seule parade se voit ici en creux, et
   * `attack` dit laquelle de ses annonces se lit vraiment.
   */
  boss_parry: { attack: LynelAttackId }
  /**
   * Le joueur entre dans l'arène de la rotonde et engage le Lynel.
   *
   * Le pendant de `sky_island_entered` : arriver sur l'île est une découverte,
   * franchir l'arcade est une décision. L'écart entre les deux dit combien
   * reculent devant la bête.
   */
  boss_engaged: { phase: 'sword' }
  /**
   * Le Lynel tombe, et avec combien de cœurs il restait au joueur.
   *
   * C'est le seul chiffre qui dise si le combat est trop dur ou trop facile :
   * une majorité de victoires à un cœur et il est au bord de l'injuste, une
   * majorité à pleine vie et il ne demande rien.
   */
  boss_defeated: { hearts: number }
  /**
   * Les trois Lynels de l'épreuve sont tombés, et le cœur est donné.
   *
   * L'écart entre `boss_defeated` et celui-ci dit combien de joueurs, une fois
   * le gardien vaincu, ont trouvé qu'il restait quelque chose à faire —
   * c'est-à-dire si le journal de quêtes se lit.
   */
  /**
   * Le joueur entre dans le bassin du Marais et Malenia se lève.
   *
   * Le pendant de `boss_engaged` pour le dernier combat. L'écart avec
   * `golden_slain` dit combien de joueurs, une fois le Lynel doré tombé, ont
   * franchi le portail du sommet — c'est-à-dire si le troisième monde se trouve.
   */
  malenia_engaged: { phase: MaleniaPhase }
  /**
   * Elle tombe à mi-vie et se relève sans armure.
   *
   * C'est le seul chiffre qui dise si la phase I est à la bonne difficulté :
   * rapporté à `malenia_engaged`, il donne le taux de joueurs qui voient
   * seulement la métamorphose. S'il est très bas, la première moitié du combat
   * est trop dure pour ce qu'elle enseigne.
   */
  malenia_morph: { hearts: number }
  /**
   * Une parade réussie contre elle, et sur quelle attaque.
   *
   * Le pendant de `boss_parry`, et il mesure autre chose : contre elle, la
   * parade est le seul moyen d'avancer sans lui rendre de vie. Un joueur qui
   * n'en réussit aucune ne perd pas le combat, il ne le finit jamais.
   */
  malenia_parry: { attack: string }
  /**
   * Elle tombe, et avec combien de cœurs il restait au joueur.
   *
   * La fin du jeu. Rapporté à `malenia_engaged`, c'est le taux d'achèvement.
   */
  malenia_defeated: { hearts: number }
  trial_cleared: { hearts: number }
  /**
   * Le Lynel doré tombe au sommet de la montagne de l'ouest.
   *
   * C'est le dernier écran du jeu, et le seul chiffre qui dise si la montée
   * valait le détour : l'écart avec `trial_cleared` mesure combien de joueurs,
   * herse levée, sont allés voir ce qu'elle fermait. S'il est grand, c'est le
   * chemin qui ne se voit pas — pas le combat qui décourage, puisqu'on ne peut
   * pas décourager de ce qu'on n'a pas trouvé.
   */
  golden_slain: { hearts: number }
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
