/**
 * Les couleurs du Marais d'Aeonia — et celles de Malenia.
 *
 * Deux familles, et rien entre les deux : l'**or**, qui est le sien, et
 * l'**écarlate**, qui est ce qui la mange. Le décor est entièrement dans la
 * seconde ; c'est donc l'or qui la détache du lieu, exactement comme le pelage
 * bleuté du Lynel argenté le détachait de la pierre grise de la rotonde.
 *
 * Les deux vivent dans le même fichier, et ce n'est pas un rangement paresseux :
 * c'est la seule façon de garantir que l'écart de température entre la bête et
 * son arène reste celui qu'on a choisi. Les séparer aurait permis de retoucher
 * l'eau sans voir qu'on venait de la rapprocher de la couleur de ses cheveux.
 *
 * L'or est **exactement** celui du jeu : celui des ruines de l'île, du Lynel
 * doré et des frises. Elle n'est pas d'un autre monde que le reste du jeu, et
 * c'est le seul fil qui relie cette carte aux deux autres.
 */
export const ROT_COLORS = {
  /* --- L'or : armure, prothèses, heaume ---------------------------------- */
  gold: '#d9a441',
  goldBright: '#f3d789',
  goldDim: '#8a6c33',
  goldDeep: '#6a5220',

  /*
    L'armure sous l'or, et les sangles.

    Pas du noir. Sur une carte sans soleil, le noir mange ses propres ombres et
    la pièce devient un trou dans la silhouette — un bronze très désaturé garde
    des ombres lisibles à la même valeur apparente.
  */
  bronze: '#4a4038',
  bronzeDark: '#2e2823',
  leather: '#6b5340',

  /*
    La chair, volontairement pâle et froide.

    C'est ce qui laisse les veines écarlates s'y lire sans avoir à crier — et en
    phase II, où tout le corps est à nu, c'est la seule valeur claire qui reste
    sur le modèle.
  */
  skin: '#e8c3a2',
  skinShade: '#c98d7a',

  /* --- L'écarlate : cheveux, tissu, ailes, eau, fleur --------------------- */
  rotDeep: '#8e1f2a',
  rot: '#c9304a',
  rotBright: '#e8776f',
  hair: '#9e2b2b',
  hairDark: '#6b1c1e',

  /*
    L'eau du marais.

    Plus sombre et plus brune que l'écarlate des ailes, et c'est indispensable :
    si la nappe et la bête partagent la même valeur, la silhouette disparaît dès
    qu'elle passe devant le sol. L'écart est le même que celui qui sépare le
    pelage du Lynel argenté de la pierre de la rotonde — sauf qu'ici il est
    payé en luminosité et non en teinte, parce que tout est rouge.
  */
  water: '#7d1b26',
  mud: '#4a3b2e',

  /*
    Racine et os : l'or de l'armure, mais mort.

    Le même ton que la cuirasse, désaturé et éteint. L'arbre est ce qu'elle
    deviendra, et la palette le dit avant que le joueur ne l'ait formulé.
  */
  root: '#b8a878',
  rootDark: '#8a7a52',
  bark: '#6e6a4e',
  barkDark: '#4c4835',

  /* --- L'acier de la Main de Malenia -------------------------------------- */
  steel: '#cfd8e8',
  steelDark: '#76809a',

  /*
    La pierre d'Elphaël.

    **C'est ce qui manquait au premier jet, et le retour de la première partie
    l'a dit en une phrase : « le biome est sombre mais beau, là il y a beaucoup
    trop de marécage ».** Le diagnostic était juste et la cause était dans cette
    table : il n'y avait que de la vase, de l'eau et du bois mort, c'est-à-dire
    trois teintes de pourriture et aucune de ce qui a pourri.

    Un blanc très légèrement rosé, presque lumineux sous un ciel sombre. C'est
    la seule valeur claire du lieu en dehors de l'or, et c'est elle qui fait la
    beauté : la pourriture n'est belle que si elle mange quelque chose de beau.
  */
  stone: '#d8cfc4',
  stoneWorn: '#b9ada0',
  stoneDark: '#6f6459',

  /*
    Le feuillage de l'Arbre blafard.

    Il n'en avait **aucun** : un tronc nu de cent vingt unités, ce qui donnait un
    piquet géant et non un arbre sacré. Ces deux teintes-là sont l'autre moitié
    de la réponse au « sombre mais beau » — un or pâle qui luit faiblement, et
    qui est la seule source de lumière de tout le paysage.
  */
  foliage: '#e6d79a',
  foliageGlow: '#fff3c4',

  /* --- La minimap --------------------------------------------------------- */
  /*
    Les trois teintes du fond de carte sont **plus claires** que celles de la
    scène, et c'est la même règle que le violet du portail sur la minimap : une
    vignette de cent cinquante pixels n'a pas la place de jouer sur des écarts
    subtils, et le rouge sombre de l'eau y rendait le cadre entier illisible.
  */
  minimapWater: '#6e1a23',
  minimapRoot: '#b3a476',
  minimapStone: '#cfc6ba',
  minimapBark: '#5f5c44',
} as const
