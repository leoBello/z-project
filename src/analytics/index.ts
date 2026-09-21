import type { EnemyKind, LandmarkId, LynelAttackId, MaleniaPhase, MapId } from '../types/game'

/**
 * Mesure d'audience.
 *
 * Le portfolio est une scène 3D servie à une seule URL : compter les *pages
 * vues* n'apprendrait rien, tout le monde arrive sur `/` et en repart. Ce qui
 * se mesure ici, ce sont des **événements** — franchir l'écran de chargement,
 * ouvrir un monument, cliquer un lien de contact.
 *
 * **Deux collecteurs reçoivent les mêmes événements.** Umami (offre gratuite)
 * pour un script de ~2 ko et un tableau de bord qui se lit d'un coup d'œil ;
 * Google Analytics 4 pour les entonnoirs, la comparaison de périodes et
 * l'origine du trafic. Aucun des deux ne pose de cookie — c'est natif chez
 * Umami, et obtenu chez Google par le mode consentement, ce qui épargne au site
 * un bandeau posé devant une expérience plein écran. Les deux scripts sont mis
 * en place au build par `plugins/analytics.ts` — sur `index.html`, et sur les
 * pages texte `/profil/` via `plugins/seo.ts` ; ce module ne fait que leur
 * parler.
 *
 * **Tout est facultatif.** Sans script chargé — développement, déploiement de
 * prévisualisation, bloqueur de publicité, variable d'environnement absente —
 * ni `window.umami` ni `window.gtag` n'existent, et `track()` ne fait rien.
 * Aucun appel d'ici ne doit donc jamais être placé sur un chemin dont dépend le
 * jeu.
 *
 * **Un paramètre d'événement n'apparaît pas tout seul dans GA4.** C'est le
 * piège de cette maison-là, et il est silencieux : Google reçoit et conserve
 * `landmark`, `hearts` ou `attack`, mais ne les affiche nulle part tant qu'ils
 * n'ont pas été déclarés dans *Admin > Définitions personnalisées* — en
 * dimension pour un texte, en métrique pour un nombre. Rien ne le signale, et
 * les données d'avant la déclaration ne remontent pas rétroactivement. La liste
 * de ce qu'il y a à déclarer est dans le README, à la section « Mesure
 * d'audience ».
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
   * Une diapositive du panneau est atteinte — un projet, une école, un contact.
   *
   * `landmark_opened` dit quelle rubrique s'ouvre ; celui-ci dit **ce qu'on y
   * lit vraiment**. Les cinq monuments n'ont pas le même nombre de pages, et la
   * question posée n'est pas « le panneau Projets est-il ouvert » — il l'est
   * toujours, c'est le plus proche du départ — mais « va-t-on au-delà du
   * premier projet ». Un projet qu'aucune statistique n'atteint jamais est un
   * projet placé trop loin dans la pile, pas un projet sans intérêt.
   *
   * Émis une fois par diapositive et par ouverture : revenir en arrière puis
   * repartir en avant ne recompte pas. Sans ça, un aller-retour aux flèches
   * ferait passer la première diapositive pour la plus lue du site.
   */
  portfolio_slide_viewed: { landmark: LandmarkId; slide: string; index: number }
  /**
   * Le panneau se referme, après combien de temps et combien de diapositives.
   *
   * C'est la mesure qui manquait le plus : une rubrique ouverte puis fermée en
   * deux secondes et une rubrique lue pendant une minute comptent aujourd'hui
   * pour la même chose. Les deux champs se lisent ensemble — beaucoup de
   * diapositives en peu de temps, c'est un survol aux flèches ; une seule
   * diapositive longtemps, c'est une lecture.
   *
   * En secondes et non en millisecondes, contrairement à `boot_complete` : on
   * mesure ici une lecture humaine, pas un temps de chargement, et une moyenne
   * affichée en dizaines de milliers de millisecondes ne se lit pas.
   */
  landmark_closed: { landmark: LandmarkId; seconds: number; slides: number }
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
  /**
   * Le joueur franchit l'anneau du Marais et découvre l'Outremonde.
   *
   * Rapporté à `malenia_defeated`, il mesure une seule chose : combien de
   * joueurs, une fois le jeu fini, ont eu envie d'aller voir ce qu'il y avait
   * après. C'est le chiffre qui dit si l'après-partie valait d'être écrite.
   */
  beyond_entered: { hearts: number }
  /**
   * Le joueur tombe : plus un cœur, et l'écran de fin s'affiche.
   *
   * Le contrepoint de toute la série des `*_defeated` : les victoires seules
   * décrivent un jeu que personne ne perd. `from` nomme ce qui a porté le
   * dernier coup et `location` dit où — les deux ensemble disent si la
   * difficulté vient des bêtes du continent, d'un boss, ou d'une chute.
   *
   * L'Outremonde n'en émet jamais : on n'y meurt pas, on y est relevé au
   * Sanctuaire (voir `damagePlayer`).
   */
  player_died: { from: EnemyKind | 'unknown'; location: MapId }
  /**
   * La langue est changée à la main, depuis le bouton du coin.
   *
   * La langue *initiale* vient du navigateur et ne s'apprend pas ici — GA la
   * rapporte déjà. Ce qui s'apprend ici est le **désaccord** : chaque événement
   * est un visiteur à qui la détection automatique a servi la mauvaise langue.
   * Beaucoup de `fr` émis dirait qu'une part du public anglophone détecté ne
   * l'est pas.
   */
  language_changed: { locale: string }
  /**
   * Un score est enregistré au classement.
   *
   * Rapporté à `challenge_ended` sans `failed`, il donne la seule chose qu'on
   * veuille savoir du classement : combien de joueurs, une course finie et le
   * formulaire sous les yeux, prennent la peine de taper un pseudo. S'il est
   * très bas, c'est le tableau qui ne donne envie de rien.
   */
  score_submitted: { difficulty: string; duration: string; score: number }
  /**
   * Un défi est accepté, avec ses réglages.
   *
   * Les deux champs sont le seul moyen de savoir si les douze catégories servent
   * ou si onze d'entre elles sont du décor. C'est la question qu'on se pose
   * toujours après avoir ajouté des options : le joueur choisit-il, ou prend-il
   * ce qui est proposé en premier ?
   */
  challenge_started: { difficulty: string; duration: string }
  /**
   * Un défi se termine, avec son score et ce qui l'a arrêté.
   *
   * Les deux chiffres ne se lisent qu'ensemble : un score moyen bas avec
   * beaucoup de `failed` dit que la carte tue trop, un score moyen bas sans
   * `failed` dit qu'elle est trop vide. Le même nombre, deux corrections
   * opposées.
   */
  challenge_ended: {
    score: number
    kills: number
    failed: boolean
    difficulty: string
    duration: string
  }
}

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, unknown>) => void }
    /**
     * Posé par le script d'amorçage de `plugins/analytics.ts`.
     *
     * Il existe **avant** que gtag.js n'arrive du réseau : les commandes sont
     * empilées dans `dataLayer` et rejouées au chargement. Un événement émis
     * pendant la première seconde n'est donc pas perdu — à condition que le
     * script d'amorçage ait tourné, ce qui n'est le cas ni en développement ni
     * sur les préproductions.
     */
    gtag?: {
      (command: 'event', event: string, data?: Record<string, unknown>): void
      /** Le mode consentement — voir `analytics/consent.ts`. */
      (command: 'consent', action: 'default' | 'update', params: Record<string, string>): void
    }
  }
}

/**
 * Traduit les données d'un événement pour Google.
 *
 * GA4 ne transporte que des chaînes et des nombres. Un booléen y arrive sous
 * une forme qui dépend de la version de gtag.js, et dans le pire des cas le
 * paramètre est simplement abandonné en route — sans erreur, sans trace, et on
 * s'en aperçoit des semaines plus tard devant une colonne vide. `failed` est le
 * seul concerné aujourd'hui ; il vaut mieux que la règle existe avant le second.
 *
 * Umami, lui, reçoit les données telles quelles : il stocke le booléen sans
 * broncher et l'affiche « true » / « false ».
 */
function forGoogle(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    out[key] = typeof value === 'boolean' ? String(value) : value
  }
  return out
}

/**
 * Émet un événement vers les deux collecteurs.
 *
 * Aucun des deux appels n'est conditionné à l'autre : un bloqueur de publicité
 * coupe couramment Google sans toucher à Umami, et l'inverse existe aussi. Ce
 * sont deux mesures partielles et indépendantes, jamais une seule à deux
 * endroits — leurs totaux ne coïncideront pas, et c'est normal.
 */
export function track<E extends keyof Events>(event: E, data: Events[E]): void {
  // `?.` sur les deux niveaux : le script peut être absent, mais aussi en cours
  // de chargement (`defer`) au moment du tout premier événement.
  window.umami?.track?.(event, data)
  window.gtag?.('event', event, forGoogle(data))
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
