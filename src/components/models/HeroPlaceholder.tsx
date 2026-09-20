import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Outlines } from '@react-three/drei'
import { DoubleSide, Group, MathUtils } from 'three'
import type { OutfitId, WeaponId } from '../../config/items'
import { ATTACK, PLAYER } from '../../config/gameplay'
import { PARRY } from '../../config/parry'
import { isHitStopped, now as gameNow } from '../../state/gameClock'
import { parry } from '../../state/parry'
import { playerTransform } from '../../state/playerTransform'
import { cloudGeometry } from './cloudGeometry'
import { toonGradient } from './toonGradient'

/**
 * Personnage du joueur, entièrement procédural.
 *
 * Aucun asset externe : la silhouette est construite en primitives et animée
 * à la main (cycle de marche, pose aérienne, coup d'épée). Les proportions
 * sont volontairement "chibi" — grosse tête, petit corps — comme dans
 * Wind Waker : c'est ce qui fait lire la silhouette, pas le nombre de polygones.
 *
 * Convention : l'avant du modèle est +Z, la main droite du personnage est
 * donc du côté -X (right = forward × up en repère main droite).
 *
 * **Les skins sont des habillages d'un rig unique.** Quand le second est
 * arrivé, la tentation était d'écrire un second personnage à côté ; ça aurait
 * fait deux cycles de marche à régler, deux animations d'attaque à garder
 * synchrones, et la garantie qu'elles divergent au premier ajustement. Ce qui
 * change de l'un à l'autre est donc strictement : la palette, la pièce de tête,
 * le vêtement de buste, l'habillage des membres et le visage ; d'une arme à
 * l'autre, seule la géométrie tenue en main droite — et à mains nues, il n'y en
 * a aucune. Le squelette et toutes les animations sont partagés, y compris le
 * coup porté : le bras qui frappe suit la même courbe qu'il tienne une lame ou
 * un poing, seule la traînée de `StrikeArc` change de forme.
 *
 * Les pièces propres à chaque skin sont réunies dans **une seule table**,
 * `SKINS` : buste, visage, pièce de tête et réglages de son ressort. Tant qu'il
 * n'y en avait que deux, elles se choisissaient par un booléen `isZoro` semé
 * dans le corps du composant ; le troisième skin transformait chacun de ces
 * points en « tout le monde sauf celui-là », et un skin ajouté aurait hérité en
 * silence de l'habillage du voisin.
 */

/** Palette d'un skin. Tous les skins déclarent exactement ces teintes. */
interface Palette {
  /** Vêtement de buste : gilet ouvert, ou manteau long. */
  garment: string
  /**
   * Bas du corps : short, pantalon, ou bandes de lin.
   *
   * Le lin du clan habille aussi ses avant-bras : c'est la même pièce de tissu
   * enroulée aux deux endroits, elle n'a donc pas de teinte à elle.
   */
  trouser: string
  /**
   * Ceinture ventrale : écharpe nouée, haramaki, ou ceinture du clan — qui
   * teinte aussi son col montant et un rang de lamelles sur deux.
   */
  belt: string
  skin: string
  /** Peau assombrie. Les cicatrices, et elles seules. */
  scar: string
  hair: string
  boot: string
  blade: string
  guard: string
  grip: string
  /** Ligature du katana : la seule teinte que l'épée de base n'utilise pas. */
  cord: string
  eye: string
  outline: string
  /** Teinte d'appoint : paille du chapeau, laque des fourreaux, ou lamelles. */
  gear: string
  /**
   * Liseré de la pièce d'appoint : ruban du chapeau, tsuba des fourreaux, ou
   * ligature d'or des lamelles.
   */
  gearTrim: string
}

/**
 * Palettes des skins.
 *
 * Chacune reprend exactement les teintes de son `ItemIllustration` quand il en
 * existe un : la carte de l'objet doit montrer ce qu'on va voir courir dans
 * l'herbe.
 *
 * Les skins doivent surtout se distinguer **les uns des autres** en un coup
 * d'œil, à 21 unités de recul. Ils le font par la valeur autant que par la
 * teinte : le premier est clair et chaud sur un buste nu, le second sombre et
 * froid sous un manteau long qui double la largeur de la silhouette, le
 * troisième sombre et *chaud* — le seul dont la masse sombre soit coupée de
 * cramoisi et d'or, et le seul que sa chevelure prolonge jusqu'aux reins.
 */
const OUTFITS: Record<OutfitId, Palette> = {
  luffy: {
    garment: '#d23a33',
    trouser: '#2f62b5',
    belt: '#e5b13c',
    skin: '#f0bd88',
    scar: '#c98a5e',
    hair: '#181520',
    boot: '#8a5a2b',
    blade: '#dde6ef',
    guard: '#d0a53c',
    grip: '#5b3a1e',
    cord: '#2f4f66',
    eye: '#231d1c',
    // Contour prune plutôt que noir : un cerne noir sur du rouge vif fait une
    // découpe d'autocollant, alors que le prune se raccorde au contre-jour
    // parme de la scène.
    outline: '#2a1720',
    gear: '#e8cf8a',
    gearTrim: '#a8332c',
  },
  zoro: {
    garment: '#1f6b3c',
    trouser: '#2b2733',
    // Le haramaki est deux tons au-dessus du manteau, et c'est délibéré : c'est
    // la seule pièce claire du bas du corps, donc la seule qui marque la taille
    // d'une silhouette autrement uniformément sombre.
    belt: '#57a544',
    skin: '#efbb86',
    scar: '#c98a5e',
    hair: '#6fa83c',
    boot: '#1d1a24',
    blade: '#dde6ef',
    guard: '#c9a227',
    // Poignée claire : c'est la seule chose qui distingue la lame tenue en main
    // des deux fourreaux sombres accrochés à la hanche.
    grip: '#f4efe2',
    cord: '#7c1f22',
    eye: '#241d2c',
    outline: '#171226',
    gear: '#1b1822',
    gearTrim: '#d8a93f',
  },
  // Le prune et le cramoisi n'existent nulle part ailleurs dans le jeu : le
  // rouge des cœurs est plus clair et ne vit qu'au HUD, aucune confusion n'est
  // possible, et le contre-jour parme de la scène détache cette silhouette-là
  // du décor mieux qu'aucune autre.
  madara: {
    garment: '#4b4062',
    // Les bandages de lin, qui tiennent lieu de bas et de manches. La teinte
    // est volontairement à peine cassée : du blanc pur aurait brillé plus que
    // la lame de l'épée.
    trouser: '#ece4d4',
    belt: '#7d1f22',
    skin: '#f0c39c',
    scar: '#c98a5e',
    hair: '#1a1723',
    boot: '#2f2a3d',
    blade: '#dde6ef',
    guard: '#d8a93f',
    grip: '#3a2a1e',
    cord: '#2f4f66',
    eye: '#1b1626',
    // Contour plus froid que celui des deux autres : un cerne brun sur du
    // prune vire au marron sale.
    outline: '#161226',
    gear: '#a8302f',
    gearTrim: '#d8a93f',
  },
  // Le seul noir du jeu, et il n'est pas noir : un `#000` franc devient un trou
  // sur le fond parme de l'Île Céleste, où ce skin est trouvé. C'est un noir
  // bleuté, comme les bottes du bretteur. Il ne se confond pas avec le prune du
  // clan, qui est deux fois plus clair et tire sur le violet.
  pain: {
    garment: '#171724',
    // Les bandes de lin des mollets. Le pantalon, lui, n'est pas ici : il prend
    // `grip`, faute d'un champ à lui. Voir la note de `Leg`.
    trouser: '#e9e1d0',
    belt: '#8d2029',
    skin: '#f0cdad',
    // Détourné : ce skin n'a aucune cicatrice de peau. C'est la rayure du
    // bandeau, donc un gris d'acier entaillé et non un brun de chair.
    scar: '#5a6070',
    // La seule teinte orange du jeu entier, et de loin la pièce la plus lisible
    // du personnage en vue de jeu : à 21 unités, c'est elle qu'on reconnaît.
    hair: '#ea7a24',
    boot: '#3b4763',
    blade: '#dde6ef',
    guard: '#aeb7c7',
    // Détourné : le pantalon d'ardoise, qu'on ne voit que par la fente du
    // manteau. Il sert aussi de doublure d'ombre aux orbites du visage.
    grip: '#2f3549',
    // Détourné : les anneaux du regard. Un katana équipé par-dessus ce skin
    // aura donc une ligature violette — un lien de chakra sur une lame
    // légendaire, et c'est le prix d'une palette à quinze champs fixes.
    cord: '#5a4f96',
    eye: '#bcaeea',
    outline: '#120e22',
    gear: '#ab2630',
    gearTrim: '#f2ece1',
  },
  /*
    La seule tenue **pâle** du casting, et c'est ce qui la sépare des quatre
    autres avant toute autre considération : le premier est clair mais chaud sur
    un buste nu, les trois suivants sont sombres. Celle-ci est froide et claire,
    coupée d'une seule masse d'acier — à 21 unités, c'est ce contraste-là qu'on
    lit, pas le détail des plaques.

    Trois champs sont détournés, et c'est le maximum qu'une palette à quinze
    entrées supporte : `scar` porte les rainures de l'armure *et* les marques du
    visage, `grip` l'ardoise des gantelets, `cord` les turquoises du poignet.
    Le dernier a une conséquence visible — un katana équipé par-dessus cette
    tenue aura une ligature turquoise, exactement comme le manteau de l'Aube lui
    en donne une violette. C'est le prix connu de quinze champs fixes, et il
    vaut mieux qu'un seizième que quatre tenues sur cinq laisseraient vide.
  */
  demon: {
    garment: '#b7dcd6',
    trouser: '#242b40',
    // L'acier du plastron, de la ceinture et de la plaque de coude. Un gris
    // moyen et non un charbon : sous un tissu aussi pâle, une masse presque
    // noire faisait un trou au milieu du personnage.
    belt: '#5f6672',
    skin: '#f0c7a2',
    // Détourné : aucune cicatrice de peau ici. Ce sont les rainures d'ombre
    // entre les plaques, les viroles des gantelets, et les marques du visage.
    scar: '#1a1d28',
    hair: '#eef1f4',
    boot: '#7d5636',
    blade: '#dde6ef',
    guard: '#cfa24a',
    // Détourné : l'ardoise des gantelets et des gants. Une épée équipée
    // par-dessus cette tenue aura donc une poignée d'ardoise, ce qui lui va.
    grip: '#3e4450',
    // Détourné : les sept turquoises nouées au poignet. Voir la note ci-dessus.
    cord: '#2fb3a4',
    /*
      Le regard, et c'est le seul blanc pur du jeu.

      Il est rendu **non éclairé** (voir `DemonFace`), donc il ne descend jamais
      dans l'ombre : un blanc éclairé repasserait sous le blanc des cheveux dès
      que la lumière tourne, et le regard s'éteindrait. C'est la même règle que
      les yeux du Lynel, pour la même raison — c'est la pièce qui dit ce qu'est
      ce personnage.
    */
    eye: '#f2f6ff',
    // Bleu nuit : un cerne brun sur du céladon vire au kaki, et un cerne noir
    // sur une tenue pâle la découpe comme un autocollant.
    outline: '#141a2a',
    gear: '#cfa24a',
    gearTrim: '#f3d789',
  },
  /*
    Le second noir du jeu, et il ne se dispute pas avec le premier.

    Celui du manteau de l'Aube est un noir bleuté qui laisse voir un pantalon
    d'ardoise, des bandes de lin claires et une tête orange : c'est une masse
    sombre **ouverte**. Celui-ci est une laque fermée, plus froide et plus
    sourde encore, où rien de clair ne dépasse — ni peau, ni cheveux, ni tissu.
    À 21 unités, les deux ne se confondent pas une seconde : l'un a une couronne
    orange sur la tête, l'autre est une silhouette noire à cape et à casque, la
    seule du casting dont on ne voie **aucun morceau de corps**.

    Ce qui la rend lisible, ce n'est donc pas sa teinte, ce sont ses quatre
    éclats : le plastron de commande rouge sur la poitrine, la ceinture d'acier,
    les cloches d'épaule de graphite, et — si on la porte — la lame écarlate.
    Une tenue entièrement noire sans eux aurait été une ombre, pas un
    personnage.

    Trois champs sont détournés, et c'est le maximum qu'une palette à quinze
    entrées supporte — même compte que la tenue du Dieu Démon, et pour la même
    raison : `skin` porte le cuir des gants **et le dessous du casque**, puisque
    ce personnage n'a pas un centimètre de peau à l'air ; `hair` porte le reflet
    froid de la laque, faute de cheveux à teinter ; `cord` porte le rouge du
    plastron. Le dernier a une conséquence visible — un katana équipé par-dessus
    cette tenue aura une ligature écarlate, exactement comme le manteau de
    l'Aube lui en donne une violette et l'armure du Dieu Démon une turquoise.
  */
  vader: {
    garment: '#14161f',
    // La combinaison matelassée, sous les plaques : deux tons au-dessus de la
    // laque, et c'est tout ce qu'il faut. Une seule valeur de noir sur le corps
    // entier faisait disparaître les jambes dans le tablier.
    trouser: '#23262f',
    belt: '#6a707d',
    // Détourné : aucune peau visible sur ce personnage. C'est le cuir des gants
    // et la nuque du casque — les deux endroits où le rig pose `skin`, et les
    // deux qui doivent rester noirs.
    skin: '#1b1e26',
    // Détourné : ce ne sont pas des cicatrices mais les rainures d'ombre entre
    // les plaques, et les fentes de la grille de bouche.
    scar: '#080a0f',
    // Détourné : pas un cheveu là-dessous. C'est le reflet froid de la laque du
    // dôme, la seule chose qui empêche le casque d'être une boule plate.
    hair: '#2c313c',
    boot: '#191c24',
    blade: '#dde6ef',
    guard: '#8d97ad',
    // Détourné : le graphite des cloches d'épaule et des plaques de tibia.
    grip: '#3a3f4a',
    // Détourné : le rouge du plastron de commande. Voir la note ci-dessus.
    cord: '#d8252b',
    /*
      Les lentilles du masque, et elles sont **sombres**.

      C'est le contraire du regard blanc du Dieu Démon, et c'est délibéré : ce
      masque-là ne regarde pas, il ne rend rien. Deux amandes mortes sous une
      arête de front, c'est la lecture qu'on veut — un œil clair y aurait mis de
      l'expression, et tout l'effet tient à ce qu'il n'y en ait aucune.

      Le ton est celui qu'il a fallu pour qu'elles existent. Deux mesures l'ont
      fixé : un gris franchement plus sombre disparaissait purement et
      simplement dans la laque en capture, et c'est aussi pour ça qu'un cadre
      d'acier les cerne (voir `VaderMask`). Les deux corrections vont ensemble —
      la lentille dit « éteint », le cadre dit « ici ».
    */
    eye: '#525b6b',
    outline: '#080a12',
    gear: '#8d97ad',
    gearTrim: '#cdd3de',
  },

  /*
    Le Roi — une chitine violette, et **aucun vêtement**.

    C'est la première silhouette du casting qui ne porte rien : ce qu'on prend
    pour une armure *est* le corps. Toutes les entrées de vêtement sont donc
    détournées vers des teintes de carapace, et l'écart entre elles ne décrit
    plus une étoffe posée sur une peau mais l'épaisseur d'une plaque sur la
    suivante.

    Le violet est le seul de la table à être franchement **saturé**. Les cinq
    autres skins sont des valeurs — clair et chaud, sombre et froid, sombre et
    chaud, noir. Celui-ci est une teinte, et c'est ce qui le sépare d'eux à
    vingt-et-une unités sans avoir à compter sur sa forme.
  */
  meruem: {
    // La carapace du buste, et les plaques d'épaule.
    garment: '#5d3583',
    // Le bas du corps : plus sombre d'un ton, parce qu'une carapace d'une seule
    // valeur du col aux pieds fait un maillot et non une créature.
    trouser: '#4a2a68',
    // La rainure abdominale — la seule ligne claire du tronc, et ce qui dit
    // que ce ventre est segmenté.
    belt: '#7a4fa8',
    // Détourné : il n'y a pas de peau. C'est la chitine des mains et du cou,
    // soit exactement les deux endroits où le rig pose `skin`.
    skin: '#6b3f93',
    // Détourné : les sutures entre les plaques, et le liseré de la bouche.
    scar: '#2e1740',
    // Détourné : pas un cheveu. C'est le lustre de la crête, la seule chose qui
    // empêche le crâne d'être une masse plate.
    hair: '#8a5fb8',
    boot: '#3b2154',
    blade: '#dfe4ee',
    guard: '#8a5fb8',
    grip: '#3b2154',
    cord: '#e05070',
    /*
      Le regard, et c'est **la seule chose vivante** de toute la silhouette.

      Un cramoisi franc sur une masse violette : c'est le seul endroit du
      personnage qui ne soit pas de la carapace, donc le seul qui dise qu'il y a
      quelqu'un dedans. Le masque de Vador fait l'inverse — ses lentilles sont
      éteintes, et tout l'effet tient à ce qu'elles ne rendent rien.
    */
    eye: '#ff3b5c',
    outline: '#180c22',
    // La queue : ses plaques, puis son dard. Le dard est la seule valeur claire
    // du personnage avec le regard, et il est à l'autre bout du corps — c'est ce
    // qui fait lire la longueur de l'animal.
    gear: '#8a5fb8',
    gearTrim: '#f0e2ff',
  },

  /*
    Le Voleur — noir sur noir, et une fourrure qui porte tout.

    Le manteau est aussi sombre que celui de Vador, et il a fallu le régler
    contre lui : deux silhouettes noires à vingt-et-une unités seraient la même.
    Ce qui les sépare est la **fourrure**, presque blanche, qui double la
    largeur des épaules et n'a aucun équivalent dans le casting. Vador se lit
    par son plastron rouge au centre du corps ; celui-ci se lit par une bande
    claire tout en haut.

    La peau est pâle, et c'est le second écart : c'est le seul personnage du jeu
    dont le visage soit franchement plus clair que sa tenue.
  */
  kuroro: {
    garment: '#15161a',
    trouser: '#1d1f25',
    belt: '#2a2d35',
    skin: '#e8c9a8',
    scar: '#c9a184',
    hair: '#0d0e12',
    boot: '#101216',
    blade: '#dde6ef',
    guard: '#6f7683',
    grip: '#23262d',
    cord: '#b8bec9',
    eye: '#2f3542',
    outline: '#06070a',
    // La fourrure du col, et son ombre. C'est la pièce qui fait la silhouette.
    gear: '#d7d9de',
    gearTrim: '#9a9ea8',
  },
}

/**
 * Habillage d'un skin : ce que le rig monte sur son squelette.
 *
 * Les quatre nombres décrivent le **ressort de la pièce de tête**, le détail
 * qui vend l'animation : elle traîne d'un pas derrière le mouvement. Ils sont
 * ici et pas dans les composants parce qu'ils vivent dans `useFrame`, sur un
 * groupe que le rig anime lui-même — un chapeau posé en équilibre, une coupe
 * courte et une crinière qui descend aux reins n'ont ni la même masse ni la
 * même liberté.
 */
interface Skin {
  torso: (props: { palette: Palette }) => React.JSX.Element
  face: (props: { palette: Palette }) => React.JSX.Element
  headwear: (props: { palette: Palette }) => React.JSX.Element
  /** Inclinaison au repos. Un chapeau est posé à plat, des cheveux non. */
  rest: number
  /** Retard au pas, puis basculement en l'air. */
  swing: number
  air: number
  /**
   * Roulis latéral, qui suit les épaules.
   *
   * Nul pour tout ce qui tient au crâne : une coupe courte qui roule sur l'axe
   * Z se lit comme un défaut, une masse posée ou pendante se lit comme du poids.
   */
  roll: number
}

const SKINS: Record<OutfitId, Skin> = {
  luffy: {
    torso: StrawHatTorso,
    face: StrawHatFace,
    headwear: StrawHat,
    rest: -0.05,
    swing: 0.14,
    air: 0.3,
    roll: 0.05,
  },
  zoro: {
    torso: SwordsmanTorso,
    face: SwordsmanFace,
    headwear: CroppedHair,
    rest: -0.1,
    swing: 0.1,
    air: 0.22,
    roll: 0,
  },
  // La crinière est de loin la plus ample des trois pièces de tête : c'est une
  // masse libre qui descend au bas du dos, alors que le chapeau ne fait que
  // rebondir sur un crâne et la coupe courte que frémir.
  madara: {
    torso: ClanTorso,
    face: ClanFace,
    headwear: Mane,
    rest: -0.06,
    swing: 0.16,
    air: 0.34,
    roll: 0.09,
  },
  // Le ressort le plus sec des quatre : une couronne courte et dure frémit, là
  // où la crinière du clan flotte jusqu'aux reins et où le chapeau de paille
  // rebondit sur un crâne. Les valeurs sont donc à peine au-dessus de celles de
  // la coupe courte du bretteur, et très loin de celles du clan.
  pain: {
    torso: DawnTorso,
    face: DawnFace,
    headwear: SpikedCrown,
    rest: -0.05,
    swing: 0.1,
    air: 0.22,
    roll: 0.04,
  },
  // Le ressort le plus sec des cinq, et de loin : c'est une étoffe **tendue sur
  // un crâne**, pas une masse posée dessus. Une capuche qui rebondirait comme
  // le chapeau de paille aurait l'air de ne pas être enfilée ; celle-ci frémit,
  // et le roulis est presque nul pour la même raison.
  demon: {
    torso: DemonTorso,
    face: DemonFace,
    headwear: DemonHood,
    rest: -0.04,
    swing: 0.09,
    air: 0.2,
    roll: 0.03,
  },
  // Le ressort le plus sec des six, et il est presque nul : **un casque est
  // boulonné**. La capuche du Dieu Démon frémit parce que c'est une étoffe
  // tendue ; celui-ci ne doit rien faire du tout, ou il cesse d'être une pièce
  // rigide pour devenir un chapeau. Les valeurs ne sont pas mises à zéro pour
  // autant : à zéro franc, la tête et le casque forment un bloc mort, et c'est
  // le seul défaut que le rig ne sait pas rattraper ailleurs. Il reste donc le
  // dixième de débattement qui dit qu'il y a une nuque dessous.
  vader: {
    torso: VaderTorso,
    face: VaderMask,
    headwear: VaderHelmet,
    rest: -0.02,
    swing: 0.045,
    air: 0.1,
    roll: 0.015,
  },
  /*
    La crête est de l'os soudé au crâne : son ressort est le plus bas du
    casting, à peine au-dessus de celui du casque de Vador. Un retard marqué
    l'aurait fait lire comme une coiffe posée, or elle pousse de la tête.

    Le roulis est nul, pour la raison donnée sur `Skin` : ce qui tient au crâne
    ne roule pas sur l'axe Z sans se lire comme un défaut.
  */
  meruem: {
    torso: KingTorso,
    face: KingFace,
    headwear: KingCrest,
    rest: -0.03,
    swing: 0.05,
    air: 0.12,
    roll: 0,
  },
  /*
    Des cheveux courts et plaqués : le même registre que la coupe du bretteur,
    dont ils reprennent presque les réglages. Une masse longue aurait demandé le
    ressort de la crinière du clan — et deux crinières dans le casting auraient
    rendu les deux silhouettes cousines de dos.
  */
  kuroro: {
    torso: ThiefTorso,
    face: ThiefFace,
    headwear: ThiefHair,
    rest: -0.08,
    swing: 0.1,
    air: 0.22,
    roll: 0.02,
  },
}

/** Épaisseur du contour cel-shading, en unités monde. */
const OUTLINE = 0.028

/** Hauteurs de référence du "squelette". */
const HIP_Y = 0.44
const SHOULDER_Y = 0.9
const HEAD_Y = 1.2

/**
 * Demi-ouverture du vêtement de buste, en radians.
 *
 * Gilet comme manteau sont **un seul cylindre ouvert** plutôt qu'un assemblage
 * de pans : `cylinderGeometry` sait déjà ne décrire qu'un secteur d'angle, et
 * deux plaques posées côte à côte auraient laissé voir le buste par la tranche
 * dès le moindre pivot du torse.
 *
 * L'ouverture donne sur +Z, donc sur la face du personnage. Elle vaut deux fois
 * cette valeur : à moins de 60° d'ouverture totale, le torse nu disparaissait
 * derrière le vêtement en plongée à 17°, et avec lui les cicatrices — qui sont
 * le seul détail de buste qui survive au recul.
 */
const OPEN_HALF = 0.62
const COAT_OPEN_HALF = 0.5

/**
 * Interpolation sur une suite de clés `[temps, valeur]` avec temps dans [0, 1].
 * Smoothstep entre deux clés : assez pour lire une attaque, et infiniment plus
 * léger qu'un vrai système d'animation.
 */
function keyframe(t: number, frames: readonly (readonly [number, number])[]) {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 1; i < frames.length; i++) {
    const [t1, v1] = frames[i]
    if (t <= t1) {
      const [t0, v0] = frames[i - 1]
      const k = (t - t0) / (t1 - t0)
      return v0 + (v1 - v0) * (k * k * (3 - 2 * k))
    }
  }
  return frames[frames.length - 1][1]
}

/** Bras qui frappe : recul, frappe rapide vers l'avant, retour. */
const SWING_ARM = [
  [0, 0],
  [0.22, 2.5],
  [0.5, -1.2],
  [1, 0],
] as const

/** Torsion du bras pendant le coup, pour un arc plutôt qu'un axe pur. */
const SWING_TWIST = [
  [0, 0],
  [0.22, -0.35],
  [0.5, 0.45],
  [1, 0],
] as const

/** Le buste pivote avec le coup — c'est ce qui donne du poids à la frappe. */
const SWING_TORSO = [
  [0, 0],
  [0.22, 0.55],
  [0.5, -0.7],
  [1, 0],
] as const

interface HeroProps {
  outfit?: OutfitId
  weapon?: WeaponId
  /**
   * Vitesse de pointe du personnage, en unités par seconde.
   *
   * Passée en prop et non recalculée ici : elle ne dépend plus du seul skin
   * depuis qu'une babiole peut la modifier, et ce composant ne reçoit pas
   * l'équipement complet qu'il faudrait pour la déduire. C'est `HeroModel`, qui
   * lit déjà le store, qui la calcule.
   *
   * Le défaut correspond au skin de départ, pour que le rig reste montable seul
   * — dans un banc d'essai ou une page de test, il n'y a pas de store.
   */
  topSpeed?: number
}

export function HeroPlaceholder({
  outfit = 'luffy',
  weapon = 'fists',
  topSpeed = PLAYER.speed,
}: HeroProps) {
  const torso = useRef<Group>(null)
  const head = useRef<Group>(null)
  const headwear = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)

  /** Avance du cycle de marche, en radians. */
  const stridePhase = useRef(0)
  /** Transition sol vers air, lissée pour éviter les sauts de pose. */
  const airBlend = useRef(0)

  const palette = OUTFITS[outfit]
  const skin = SKINS[outfit]
  /** Mains nues : la main droite ne porte rien, et les deux poings grossissent. */
  const barehanded = weapon === 'fists'
  // Majuscules : ce sont des composants, et JSX ne monte que ce qui commence
  // par une capitale — en minuscule, `<skin.torso />` partirait chercher une
  // balise HTML de ce nom.
  const Torso = skin.torso
  const Face = skin.face
  const Headwear = skin.headwear

  useFrame((state, rawDelta) => {
    if (!torso.current || !legL.current || !legR.current) return
    if (!armL.current || !armR.current || !head.current || !headwear.current) return

    // Même gel que dans `Player.tsx` : pendant les 80 ms du coup fatal, le
    // reste du monde tient sa pose, et le cycle de marche ne doit pas
    // continuer sur une vitesse Rapier qui reste figée à sa dernière valeur
    // non nulle. Ce composant ne fait que *lire* `playerTransform` et lisser
    // des refs locales — aucun drapeau ponctuel à consommer, aucun singleton à
    // publier — la garde peut donc se poser juste après les gardes de refs
    // habituelles, sans rien à préserver de plus.
    if (isHitStopped()) return

    const delta = Math.min(rawDelta, 0.05)
    const time = state.clock.elapsedTime

    // Intensité de la marche : 0 à l'arrêt, 1 à pleine vitesse. La référence
    // est la vitesse **du skin porté**, pas celle de `PLAYER` : sinon le skin
    // le plus rapide passerait tout son temps à saturer le clamp, et son
    // ralenti dans l'eau se lirait comme une course à plein régime.
    const run = MathUtils.clamp(playerTransform.speed / topSpeed, 0, 1)

    // La phase avance avec la distance parcourue, pas avec le temps : les pas
    // restent synchronisés au déplacement réel, sans effet de patinage.
    stridePhase.current += playerTransform.speed * delta * 2.6
    const stride = Math.sin(stridePhase.current)

    airBlend.current = MathUtils.damp(
      airBlend.current,
      playerTransform.grounded ? 0 : 1,
      14,
      delta,
    )
    const air = airBlend.current
    const ground = 1 - air

    // --- Attaque ------------------------------------------------------------
    const elapsed = gameNow() - playerTransform.attackStartedAt
    const attackProgress = elapsed / ATTACK.durationMs
    const attacking = attackProgress >= 0 && attackProgress <= 1

    // --- Garde ---------------------------------------------------------------
    // Le seul retour *diégétique* de la parade : l'anneau au sol dit quand, le
    // bras dit quoi. Une garde sans geste laisserait croire que la touche n'a
    // rien fait. Elle décroît sur la fenêtre, pour que la lame redescende au
    // moment exact où la garde se ferme — c'est ce qui enseigne sa longueur.
    const guardLeft = parry.guardUntil - gameNow()
    const guard = guardLeft > 0 ? Math.min(1, guardLeft / PARRY.windowMs) : 0

    // --- Jambes -------------------------------------------------------------
    // Au sol : balancier. En l'air : jambe avant repliée, jambe arrière tendue.
    legL.current.rotation.x = ground * stride * 0.85 * run + air * -0.75
    legR.current.rotation.x = ground * -stride * 0.85 * run + air * 0.45

    // --- Bras ---------------------------------------------------------------
    // Chaque bras oppose la jambe du même côté (démarche naturelle).
    armL.current.rotation.x = ground * -stride * 0.65 * run + air * 0.7

    if (guard > 0) {
      // La garde l'emporte sur le swing et ne s'y additionne jamais : deux
      // poses additionnées donnent un bras disloqué. On ne pare pas au milieu
      // d'un coup, et si les deux se chevauchent d'une frame, c'est la garde
      // qu'il faut voir. Lame en travers du torse, à hauteur d'épaule.
      armR.current.rotation.x = -1.15 * guard
      armR.current.rotation.z = 0.95 * guard
      torso.current.rotation.y = MathUtils.damp(torso.current.rotation.y, -0.35, 18, delta)
    } else if (attacking) {
      // L'attaque écrase complètement le balancier sur le bras armé.
      armR.current.rotation.x = keyframe(attackProgress, SWING_ARM)
      armR.current.rotation.z = keyframe(attackProgress, SWING_TWIST)
      torso.current.rotation.y = keyframe(attackProgress, SWING_TORSO)
    } else {
      armR.current.rotation.x = ground * stride * 0.65 * run + air * 0.7
      armR.current.rotation.z = MathUtils.damp(armR.current.rotation.z, 0, 12, delta)
      torso.current.rotation.y = MathUtils.damp(torso.current.rotation.y, 0, 12, delta)
    }

    // --- Buste et tête ------------------------------------------------------
    // Rebond vertical à chaque pas, respiration lente à l'arrêt.
    const bounce = Math.abs(Math.sin(stridePhase.current)) * 0.035 * run
    const breathe = Math.sin(time * 1.8) * 0.012 * (1 - run)
    torso.current.position.y = HIP_Y + bounce + breathe
    torso.current.rotation.x = 0.14 * run * ground

    // La tête compense l'inclinaison du buste : le regard reste horizontal.
    head.current.rotation.x = -0.1 * run * ground

    // La pièce de tête traîne derrière le mouvement — le détail qui vend
    // l'animation. Toutes partagent ce ressort à un pas de retard ; seules
    // leurs amplitudes diffèrent, et elles sont déclarées par le skin.
    const lag = Math.sin(stridePhase.current - 0.6)
    headwear.current.rotation.x = skin.rest - lag * skin.swing * run - air * skin.air
    headwear.current.rotation.z = lag * skin.roll * run
  })

  return (
    <group>
      {/* --- Jambes : pivot à la hauteur des hanches --- */}
      <group ref={legL} position={[0.12, HIP_Y, 0]}>
        <Leg palette={palette} outfit={outfit} />
      </group>
      <group ref={legR} position={[-0.12, HIP_Y, 0]}>
        <Leg palette={palette} outfit={outfit} />
      </group>

      {/* --- Buste : porte les bras et la tête --- */}
      <group ref={torso} position={[0, HIP_Y, 0]}>
        <Torso palette={palette} />

        {/* --- Bras : pivot à l'épaule --- */}
        <group ref={armL} position={[0.24, SHOULDER_Y - HIP_Y, 0]}>
          <Arm palette={palette} outfit={outfit} fist={barehanded} side={1} />
        </group>
        <group ref={armR} position={[-0.24, SHOULDER_Y - HIP_Y, 0]}>
          <Arm palette={palette} outfit={outfit} fist={barehanded} side={-1} />
          {weapon === 'saber' && <Saber palette={palette} />}
          {weapon === 'cursed' && <CursedBlade palette={palette} />}
          {weapon === 'katana' && <Katana palette={palette} />}
          {weapon === 'sword' && <Sword palette={palette} />}
        </group>

        {/* --- Tête --- */}
        <group ref={head} position={[0, HEAD_Y - HIP_Y, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.26, 18, 16]} />
            <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={palette.outline} />
          </mesh>

          {/* Oreilles rondes, aplaties contre le crâne. */}
          {[0.245, -0.245].map((x) => (
            <mesh key={x} castShadow position={[x, 0, 0]} scale={[0.6, 1, 0.8]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
            </mesh>
          ))}

          <Face palette={palette} />

          {/* Pièce de tête, animée séparément : chapeau, coupe ou crinière. */}
          <group ref={headwear} position={[0, 0.16, 0]} rotation={[skin.rest, 0, 0]}>
            <Headwear palette={palette} />
          </group>
        </group>
      </group>
    </group>
  )
}

/**
 * Jambe : mollet nu sous un short, pantalon sombre dans une botte, ou mollet
 * bandé de lin sur une sandale plate.
 */
function Leg({ palette, outfit }: { palette: Palette; outfit: OutfitId }) {
  if (outfit === 'vader') {
    return (
      <group>
        {/* La combinaison matelassée : trois anneaux qui débordent de la
            cuisse, comme les bandes de lin du clan. Ce sont les interstices,
            et non les anneaux, qui font lire du matelassé plutôt qu'un tube. */}
        <mesh castShadow position={[0, -0.18, 0]}>
          <capsuleGeometry args={[0.082, 0.24, 4, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
        {[-0.08, -0.155, -0.23].map((y) => (
          <mesh key={y} castShadow position={[0, y, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.042, 10]} />
            <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
          </mesh>
        ))}

        {/* La plaque de tibia, en graphite, posée **devant** le mollet et non
            centrée dessus : c'est l'erreur qu'avait faite le plastron du clan à
            sa première version — il faut sortir du volume qu'on habille. */}
        <mesh castShadow position={[0, -0.28, 0.055]}>
          <boxGeometry args={[0.125, 0.19, 0.075]} />
          <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>

        {/* La botte : haute, lourde, et **coiffée d'un revers d'acier**. C'est
            la seule respiration claire de toute la jambe, et sans elle le
            membre entier se lit comme une colonne d'encre. */}
        <mesh castShadow position={[0, -0.355, 0]}>
          <cylinderGeometry args={[0.104, 0.112, 0.06, 12]} />
          <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
        </mesh>
        <mesh castShadow position={[0, -0.43, 0]}>
          <cylinderGeometry args={[0.101, 0.11, 0.14, 12]} />
          <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
        <mesh castShadow position={[0, -0.47, 0.04]}>
          <boxGeometry args={[0.16, 0.08, 0.23]} />
          <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      </group>
    )
  }

  if (outfit === 'demon') {
    return (
      <group>
        {/* Collant d'encre, genouillère d'ardoise. */}
        <mesh castShadow position={[0, -0.2, 0]}>
          <capsuleGeometry args={[0.078, 0.3, 4, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
        <mesh castShadow position={[0, -0.215, 0.062]}>
          <boxGeometry args={[0.105, 0.075, 0.045]} />
          <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
        </mesh>

        {/*
          Le revers de la botte, en or clair, et c'est la seule respiration
          entre deux sombres : le collant et le cuir ont presque la même valeur,
          et sans ce liseré la jambe entière se lisait comme un tube.
        */}
        <mesh castShadow position={[0, -0.335, 0]}>
          <cylinderGeometry args={[0.113, 0.106, 0.06, 12]} />
          <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
        </mesh>

        <mesh castShadow position={[0, -0.42, 0]}>
          <cylinderGeometry args={[0.099, 0.108, 0.155, 12]} />
          <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
        <mesh castShadow position={[0, -0.46, 0.04]}>
          <boxGeometry args={[0.155, 0.075, 0.22]} />
          <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
        {/* Bout ferré : il ancre le pied au sol, que le cuir seul laissait mou. */}
        <mesh castShadow position={[0, -0.465, 0.125]}>
          <boxGeometry args={[0.13, 0.055, 0.07]} />
          <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
        </mesh>
      </group>
    )
  }

  if (outfit === 'pain') {
    return (
      <group>
        {/*
          Le pantalon prend `grip`, et c'est le seul détournement de palette qui
          se voie en jeu.

          La jambe de ce skin a trois valeurs — ardoise, lin, sandale — quand
          celle du clan n'en a que deux, et l'interface `Palette` n'a pas de
          seizième champ à offrir. Le lui ajouter aurait obligé les trois autres
          skins à déclarer une teinte qu'ils n'utilisent pas ; le détournement,
          lui, ne coûte qu'une poignée de main sombre sur un katana.
        */}
        <mesh castShadow position={[0, -0.12, 0]}>
          <capsuleGeometry args={[0.084, 0.13, 4, 10]} />
          <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
        </mesh>

        {/* Bandes de lin, comme au clan : ce sont les interstices entre les
            anneaux, et non les anneaux, qui font lire du tissu enroulé plutôt
            qu'une guêtre d'une seule pièce. */}
        <mesh castShadow position={[0, -0.25, 0]}>
          <capsuleGeometry args={[0.079, 0.08, 4, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
        </mesh>
        {[-0.18, -0.245, -0.305].map((y) => (
          <mesh key={y} castShadow position={[0, y, 0]}>
            <cylinderGeometry args={[0.088, 0.088, 0.045, 10]} />
            <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
          </mesh>
        ))}

        {/* Sandale : une semelle qui déborde, le dessus, et la bride en travers
            du pied. Trois pièces là où le clan en a une, parce que c'est le seul
            endroit du personnage que le manteau ne couvre pas. */}
        <mesh position={[0, -0.383, 0.025]}>
          <boxGeometry args={[0.185, 0.034, 0.25]} />
          <meshToonMaterial color={palette.outline} gradientMap={toonGradient} />
        </mesh>
        <mesh castShadow position={[0, -0.345, 0.022]}>
          <boxGeometry args={[0.17, 0.062, 0.225]} />
          <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
        <mesh position={[0, -0.325, 0.075]}>
          <boxGeometry args={[0.175, 0.03, 0.05]} />
          <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
        </mesh>
      </group>
    )
  }

  if (outfit === 'madara') {
    return (
      <group>
        <mesh castShadow position={[0, -0.16, 0]}>
          <capsuleGeometry args={[0.075, 0.16, 4, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
        </mesh>

        {/* Bandages : trois anneaux qui débordent du mollet. Ce sont les
            interstices entre eux, et non les anneaux, qui font lire du tissu
            enroulé plutôt qu'une guêtre d'une seule pièce. */}
        {[-0.1, -0.18, -0.26].map((y) => (
          <mesh key={y} castShadow position={[0, y, 0]}>
            <cylinderGeometry args={[0.086, 0.086, 0.05, 10]} />
            <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
          </mesh>
        ))}

        <mesh castShadow position={[0, -0.35, 0.02]}>
          <boxGeometry args={[0.17, 0.1, 0.22]} />
          <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      </group>
    )
  }

  if (outfit === 'zoro') {
    return (
      <group>
        <mesh castShadow position={[0, -0.17, 0]}>
          <capsuleGeometry args={[0.085, 0.17, 4, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
        {/* Bas de pantalon, qui déborde sur la tige de la botte. */}
        <mesh castShadow position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.1, 0.095, 0.1, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
        </mesh>
        <mesh castShadow position={[0, -0.37, 0.02]}>
          <boxGeometry args={[0.17, 0.13, 0.22]} />
          <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      </group>
    )
  }

  return (
    <group>
      {/*
        Le short est posé sur le **groupe de jambe**, pas sur le buste.

        C'est ce qui le fait balancer avec le pas. Rattaché au torse comme
        l'était la tunique, il serait resté rigide au-dessus de deux jambes en
        mouvement, et la démarche aurait perdu la moitié de sa lisibilité.
      */}
      <mesh castShadow position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.115, 0.125, 0.19, 12]} />
        <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, -0.2, 0]}>
        <capsuleGeometry args={[0.072, 0.15, 4, 10]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
      </mesh>

      {/* Sandale : trois fois plus plate que la botte de cuir (0,055 contre
          0,13). Le personnage y gagne en légèreté, et le mollet nu reste
          visible jusqu'au sol. */}
      <mesh castShadow position={[0, -0.36, 0.02]}>
        <boxGeometry args={[0.17, 0.055, 0.23]} />
        <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, -0.325, 0.04]}>
        <boxGeometry args={[0.15, 0.035, 0.06]} />
        <meshToonMaterial color={palette.boot} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/**
 * Bras et main, suspendus sous le pivot d'épaule.
 *
 * Nus dans les deux premiers skins, pris dans le lin et les lamelles pour le
 * troisième — c'est le seul dont le bras porte quelque chose, et c'est ce qui
 * élargit sa silhouette vue de face.
 */
function Arm({
  palette,
  outfit,
  fist,
  side,
}: {
  palette: Palette
  outfit: OutfitId
  /** Main nue et fermée : la main grossit, parce qu'elle est l'arme. */
  fist: boolean
  /** +1 pour le bras gauche du modèle, -1 pour le droit. Oriente l'épaulière. */
  side: number
}) {
  const clan = outfit === 'madara'

  // Sortie immédiate plutôt qu'une sixième condition semée dans le corps : ce
  // bras-là ne partage plus rien avec les trois autres — ni le rayon, ni la
  // position, ni la main au bout. Même discipline que `Leg`.
  if (outfit === 'pain') return <DawnArm palette={palette} fist={fist} side={side} />
  if (outfit === 'demon') return <DemonArm palette={palette} fist={fist} side={side} />
  if (outfit === 'vader') return <VaderArm palette={palette} fist={fist} side={side} />

  return (
    <group>
      <mesh castShadow position={[0, -0.14, 0]}>
        <capsuleGeometry args={[outfit === 'luffy' ? 0.058 : 0.06, 0.17, 4, 10]} />
        {/* Le bras du clan est pris dans le lin jusqu'au poignet : c'est le
            tissu qu'on voit, pas la peau. */}
        <meshToonMaterial
          color={clan ? palette.trouser : palette.skin}
          gradientMap={toonGradient}
        />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Épaulière à lamelles : trois plaques qui s'écartent vers l'extérieur.
          C'est la pièce la plus reconnaissable de la tenue du clan, et la seule
          qui élargisse vraiment la silhouette vue de face. */}
      {clan &&
        [0, 1, 2].map((row) => (
          <mesh
            key={row}
            castShadow
            position={[side * (0.03 + row * 0.022), 0.02 - row * 0.062, 0]}
            rotation={[0, 0, side * -0.22]}
          >
            <boxGeometry args={[0.15, 0.055, 0.19]} />
            <meshToonMaterial
              color={row % 2 === 0 ? palette.gear : palette.belt}
              gradientMap={toonGradient}
            />
            {row === 0 && <Outlines thickness={OUTLINE} color={palette.outline} />}
          </mesh>
        ))}

      {/* Bandage d'avant-bras, sous l'épaulière. */}
      {clan && (
        <mesh castShadow position={[0, -0.2, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.11, 10]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
        </mesh>
      )}

      {/* Bandana noué au biceps gauche, donc du côté qui balance librement
          pendant l'attaque : le seul détail de la tenue qui s'anime sans un
          ressort de plus. */}
      {outfit === 'zoro' && side > 0 && (
        <>
          <mesh castShadow position={[0, -0.08, 0]}>
            <cylinderGeometry args={[0.073, 0.073, 0.09, 10]} />
            <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={palette.outline} />
          </mesh>
          <mesh castShadow position={[0.06, -0.15, -0.03]} rotation={[0, 0, 0.3]}>
            <boxGeometry args={[0.05, 0.19, 0.03]} />
            <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
          </mesh>
        </>
      )}

      {/* La main. Un tiers plus grosse quand elle est l'arme (0,085 contre
          0,065) : c'est tout ce qu'il faut pour dire qu'on se bat avec, et le
          contour ne se pose que dans ce cas — sur une main qui ne fait que
          tenir un manche, il ajoute un pâté noir au bout du bras. */}
      <mesh castShadow position={[0, -0.28, 0]}>
        <sphereGeometry args={[fist ? 0.085 : 0.065, 10, 10]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
        {fist && <Outlines thickness={OUTLINE} color={palette.outline} />}
      </mesh>
    </group>
  )
}

/**
 * Doigts de la main ouverte : écart latéral et longueur.
 *
 * Quatre longueurs différentes, et c'est tout ce qui distingue une main d'une
 * palette : l'index et le majeur dépassent, l'auriculaire reste court.
 */
const PALM_FINGERS = [
  { x: -0.042, length: 0.056 },
  { x: -0.014, length: 0.068 },
  { x: 0.014, length: 0.064 },
  { x: 0.042, length: 0.05 },
] as const

/**
 * Main ouverte, paume vers l'avant.
 *
 * Les trois autres skins ferment le poing quand ils se battent à mains nues, et
 * le rig le grossit d'un tiers pour dire qu'il est l'arme. Celui-ci ne le ferme
 * jamais : son geste est la paume tendue, et une main fermée l'aurait fait
 * cogner comme les autres. La contrepartie est assumée — une paume ouverte
 * raconte moins bien « ceci est une arme » qu'un poing, et il faut les onze
 * pièces du visage pour rattraper ce que la main ne dit plus.
 *
 * Les ongles laqués sont le seul détail de la tenue qui ne se voie jamais en
 * jeu, même au plus près : ils sont là pour le coffre.
 */
function OpenPalm({ palette, side }: { palette: Palette; side: number }) {
  return (
    <group>
      <mesh castShadow position={[0, -0.3, 0]} rotation={[0.08, 0, 0]}>
        <boxGeometry args={[0.12, 0.105, 0.058]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {PALM_FINGERS.map((finger) => {
        const y = -0.352 - finger.length / 2 + 0.01
        return (
          <group key={finger.x}>
            <mesh castShadow position={[finger.x, y, 0.006]}>
              <boxGeometry args={[0.025, finger.length, 0.042]} />
              <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
            </mesh>
            <mesh position={[finger.x, y - finger.length / 2 + 0.012, 0.009]}>
              <boxGeometry args={[0.023, 0.018, 0.04]} />
              <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
            </mesh>
          </group>
        )
      })}
      {/* Le pouce, écarté du côté extérieur de la main. */}
      <mesh castShadow position={[side * -0.072, -0.318, 0.014]} rotation={[0, 0, side * 0.75]}>
        <boxGeometry args={[0.03, 0.062, 0.04]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/**
 * Bras du quatrième skin : manche large, revers cramoisi, blason, main ouverte.
 *
 * **La manche est écartée de quatre centimètres vers l'extérieur**, et c'est la
 * seule liberté que le rig laisse ici : le pivot d'épaule est à 0,24 de l'axe,
 * il appartient au squelette partagé et ne peut pas bouger pour un skin. Or le
 * manteau fait déjà 0,26 de rayon à cette hauteur — une manche centrée sur le
 * pivot y est à moitié enfouie, et les épaules carrées du vêtement disparaissent.
 * C'est la pièce qui se décale, exactement comme les épaulières du clan.
 *
 * L'arme éventuelle, elle, reste montée par le rig sur le pivot : elle n'hérite
 * donc pas du décalage, et c'est voulu — une lame qui s'écarte du corps avec la
 * manche traverserait le manteau au premier coup.
 */
function DawnArm({ palette, fist, side }: { palette: Palette; fist: boolean; side: number }) {
  return (
    <group position={[side * 0.04, 0, 0]}>
      <mesh castShadow position={[0, -0.14, 0]}>
        <capsuleGeometry args={[0.095, 0.17, 4, 10]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Revers : la doublure cramoisie du manteau, qui ne se voit qu'ici et au
          col. Cylindre ouvert, donc `DoubleSide` — c'est sa face intérieure
          qu'on regarde. */}
      <mesh position={[0, -0.255, 0]}>
        <cylinderGeometry args={[0.108, 0.088, 0.075, 12, 1, true]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} side={DoubleSide} />
      </mesh>

      {/* Le blason de manche, sur la face extérieure du bras : c'est le seul des
          sept qui bouge avec l'animation, et le seul qu'on voie de dos quand le
          personnage court. */}
      <group position={[side * 0.098, -0.12, 0]} rotation={[0, (side * Math.PI) / 2, 0]}>
        <DawnCloud palette={palette} size={0.15} tilt={side * 0.2} />
      </group>

      {fist ? (
        <OpenPalm palette={palette} side={side} />
      ) : (
        <mesh castShadow position={[0, -0.28, 0]}>
          <sphereGeometry args={[0.065, 10, 10]} />
          <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
        </mesh>
      )}

      {/* Anneau de l'Aube, au pouce droit. Trois millimètres d'acier que
          personne ne verra courir dans l'herbe — mais le coffre présente l'objet
          en gros plan, et c'est là qu'il paie. */}
      {side < 0 && (
        <mesh position={[fist ? 0.066 : 0.05, -0.305, 0.03]} rotation={[0.5, 0.4, 0]}>
          <torusGeometry args={[0.026, 0.009, 6, 12]} />
          <meshToonMaterial color={palette.guard} gradientMap={toonGradient} />
        </mesh>
      )}
    </group>
  )
}

/**
 * Buste du premier skin : torse nu, gilet ouvert, écharpe nouée.
 *
 * Le gilet ne se referme jamais : c'est lui qui laisse voir la cicatrice en
 * croix, et cette croix est le seul détail de buste encore lisible à distance
 * de jeu une fois le chapeau reconnu.
 */
function StrawHatTorso({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Buste nu. */}
      <mesh castShadow position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.195, 0.27, 0.5, 14]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
      </mesh>

      {/* Cicatrice en croix. Teintée dans la peau assombrie, jamais en rouge :
          une balafre rouge se lit comme une blessure fraîche, donc comme un
          état de santé — et le jeu a déjà des cœurs pour ça. */}
      {[0.72, -0.72].map((tilt) => (
        <mesh key={tilt} position={[0, 0.3, 0.2]} rotation={[0, 0, tilt]}>
          <boxGeometry args={[0.03, 0.34, 0.02]} />
          <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Gilet : un seul cylindre ouvert sur l'avant. `DoubleSide` est
          obligatoire — sans lui on voit à travers le dos dès que le personnage
          se présente de trois quarts arrière. */}
      <mesh castShadow position={[0, 0.28, 0]}>
        <cylinderGeometry
          args={[0.215, 0.3, 0.54, 18, 1, true, OPEN_HALF, Math.PI * 2 - 2 * OPEN_HALF]}
        />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} side={DoubleSide} />
      </mesh>

      {/* Ourlets : ils referment la tranche du cylindre, qui est d'épaisseur
          nulle. Sans eux le bord du gilet disparaît sous tout angle rasant. */}
      {[OPEN_HALF, -OPEN_HALF].map((a) => (
        <mesh
          key={a}
          castShadow
          position={[Math.sin(a) * 0.26, 0.28, Math.cos(a) * 0.26]}
          rotation={[0, a, 0]}
        >
          <boxGeometry args={[0.03, 0.54, 0.055]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}

      {/* Écharpe nouée à la taille, et son nœud sur l'avant. */}
      <mesh castShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.26, 0.27, 0.1, 14]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, 0.13, 0.25]}>
        <boxGeometry args={[0.12, 0.11, 0.06]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
      </mesh>
    </>
  )
}

/**
 * Fourreaux du second skin, accrochés au haramaki.
 *
 * Deux, pas trois : la troisième lame est celle que le rig tient déjà en main
 * droite. Le compte tombe juste quelle que soit l'arme équipée.
 *
 * Ils pendent à la hanche **gauche** (+X), donc du côté opposé à la main armée.
 * C'est la seule asymétrie franche de la silhouette, et c'est elle qui la rend
 * reconnaissable de dos — où ni le visage ni le haramaki ne se voient.
 */
const SHEATHS: ReadonlyArray<{ x: number; y: number; tilt: number; pale: boolean }> = [
  { x: -0.03, y: 0, tilt: -0.07, pale: true },
  { x: 0.05, y: -0.05, tilt: 0.1, pale: false },
]

/** Buste du second skin : torse nu balafré, manteau long, haramaki, fourreaux. */
function SwordsmanTorso({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh castShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.19, 0.25, 0.46, 14]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
      </mesh>

      {/*
        La grande balafre, épaule gauche vers hanche droite.

        Posée à `z = 0,185`, donc **devant** le buste et non centrée sur lui.
        C'est le même piège que les anciennes lamelles du plastron : une pièce
        centrée sur le volume qu'elle habille est intégralement enfouie dedans.
        Il faut sortir du volume qu'on décore.
      */}
      <mesh position={[0, 0.3, 0.185]} rotation={[0, 0, 0.62]}>
        <boxGeometry args={[0.046, 0.52, 0.02]} />
        <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
      </mesh>

      {/* Manteau : plus long et bien plus évasé que le gilet (0,37 contre 0,30
          en bas, sur 0,64 de haut contre 0,54). C'est cette silhouette en
          cloche qui distingue les deux skins de loin, avant toute couleur. */}
      <mesh castShadow position={[0, 0.24, 0]}>
        <cylinderGeometry
          args={[0.225, 0.37, 0.64, 18, 1, true, COAT_OPEN_HALF, Math.PI * 2 - 2 * COAT_OPEN_HALF]}
        />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} side={DoubleSide} />
      </mesh>
      {[COAT_OPEN_HALF, -COAT_OPEN_HALF].map((a) => (
        <mesh
          key={a}
          castShadow
          position={[Math.sin(a) * 0.3, 0.24, Math.cos(a) * 0.3]}
          rotation={[0, a, 0]}
        >
          <boxGeometry args={[0.035, 0.64, 0.07]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}

      {/* Haramaki : presque trois fois l'épaisseur d'une ceinture (0,19 contre
          0,07), et il déborde du manteau. C'est la pièce qui dit « bretteur »,
          parce qu'on voit qu'elle porte les lames. */}
      <mesh castShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.3, 0.31, 0.19, 16]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.305, 0.305, 0.022, 16]} />
        <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
      </mesh>

      <group position={[0.3, 0.14, -0.04]} rotation={[0.48, 0, -0.28]}>
        {SHEATHS.map((sheath) => (
          <group key={sheath.x} position={[sheath.x, sheath.y, 0]} rotation={[0, 0, sheath.tilt]}>
            <mesh castShadow position={[0, -0.32, 0]}>
              <cylinderGeometry args={[0.043, 0.036, 0.86, 10]} />
              <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
              <Outlines thickness={OUTLINE} color={palette.outline} />
            </mesh>
            <mesh castShadow position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.085, 0.085, 0.028, 12]} />
              <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
            </mesh>
            <mesh castShadow position={[0, 0.25, 0]}>
              <boxGeometry args={[0.048, 0.24, 0.048]} />
              <meshToonMaterial
                color={sheath.pale ? palette.grip : palette.cord}
                gradientMap={toonGradient}
              />
            </mesh>
          </group>
        ))}
      </group>
    </>
  )
}

/**
 * Buste du troisième skin : manteau long et fermé, plastron de lamelles.
 *
 * C'est le seul des trois dont le vêtement de buste ne s'ouvre pas. Les deux
 * autres montrent un torse nu entre deux pans, et c'est ce qui les fait lire
 * comme des combattants ; celui-ci montre une armure, et une armure ouverte sur
 * la poitrine n'en est plus une. La silhouette y gagne au passage la seule
 * forme en cloche des trois — 0,36 de rayon en bas contre 0,30 et 0,37 pour des
 * pans qui, eux, laissent voir au travers.
 */
function ClanTorso({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh castShadow position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.21, 0.36, 0.6, 14]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Ceinture, fine : le plastron occupe déjà toute la hauteur du buste, un
          haramaki de plus l'aurait coupé en deux. */}
      <mesh castShadow position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.27, 0.28, 0.07, 14]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
      </mesh>

      <ClanArmor palette={palette} />
    </>
  )
}

/**
 * Plastron du clan : lamelles laquées, col montant et longs pans dans le dos.
 *
 * Trois rangs seulement, alternés clair et sombre, avec deux ligatures d'or
 * verticales. Un rang de plus et les lamelles devenaient des rayures : à cette
 * échelle, sous une caméra qui recule de 21 unités, c'est l'alternance qu'on
 * lit, pas le compte.
 */
function ClanArmor({ palette }: { palette: Palette }) {
  return (
    <>
      {/*
        Les lamelles sont **posées en avant du manteau**, pas centrées sur lui.

        C'est un correctif, et il vaut d'être noté : à `z = 0.02`, une plaque de
        0,30 d'épaisseur ne dépassait que de 0,17 vers l'avant, alors que le
        manteau fait déjà 0,24 à 0,27 de rayon à cette hauteur — l'armure était
        donc intégralement enfouie dedans, et le personnage se lisait comme une
        robe unie avec deux épaulières rouges. C'est le même piège que la
        balafre du bretteur : il faut sortir du volume qu'on habille, pas s'y
        loger.
      */}
      {[0, 1, 2].map((row) => (
        <group key={row}>
          <mesh castShadow position={[0, 0.42 - row * 0.088, 0.1]}>
            <boxGeometry args={[0.44, 0.08, 0.34]} />
            <meshToonMaterial
              color={row % 2 === 0 ? palette.gear : palette.belt}
              gradientMap={toonGradient}
            />
            <Outlines thickness={OUTLINE} color={palette.outline} />
          </mesh>
          {/* Ligature : deux fils d'or qui traversent les lamelles. */}
          {[0.12, -0.12].map((x) => (
            <mesh key={x} position={[x, 0.42 - row * 0.088, 0.265]}>
              <boxGeometry args={[0.026, 0.082, 0.02]} />
              <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Col montant, ouvert vers l'arrière : c'est la pièce qui, plus que
          l'armure elle-même, dit « clan » d'un seul coup d'œil. */}
      <mesh castShadow position={[0, 0.5, -0.04]} rotation={[-0.24, 0, 0]}>
        <cylinderGeometry args={[0.29, 0.2, 0.24, 10, 1, true]} />
        {/* Cylindre ouvert : sans `DoubleSide`, on voit à travers le col dès
            que le personnage se présente de trois quarts arrière. */}
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} side={DoubleSide} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Deux longs pans dans le dos. Ils ne sont pas animés : à la vitesse de
          course, le rebond du buste les fait déjà bouger, et un ressort de plus
          n'apportait qu'un flottement mou. */}
      {[0.13, -0.13].map((x) => (
        <mesh key={x} castShadow position={[x, -0.02, -0.31]} rotation={[0.16, 0, 0]}>
          <boxGeometry args={[0.17, 0.56, 0.05]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}
    </>
  )
}

/**
 * Demi-ouverture de la fente du manteau de l'Aube, en radians.
 *
 * Elle n'ouvre que la **jupe**, pas tout le vêtement : un manteau fendu du col à
 * l'ourlet se lit comme une robe de chambre, et c'était le premier jet. Vingt-cinq
 * degrés au total, assez pour qu'on voie le pantalon d'ardoise battre entre les
 * pans à la course — c'est tout ce qui reste de lisible de la démarche sous une
 * étoffe qui descend à mi-mollet, et c'est ce qui a décidé de la cote.
 */
const DAWN_SLIT = 0.22

/**
 * Demi-ouverture du col, en radians. **La cote la plus importante du skin.**
 *
 * Un col qui fait le tour du cou entoure le crâne, et le visage disparaît
 * derrière lui dès que la caméra plonge de ses 17°. Celui-ci s'ouvre en V de 94°
 * vers l'avant : il ne monte haut que dans le dos et sur les flancs, la gorge
 * reste dégagée. C'est aussi ce que fait le vêtement d'origine, et ce n'est pas
 * un hasard — un col pareil n'existe que parce qu'il encadre un visage.
 */
const DAWN_COLLAR_OPEN = 0.82

/**
 * Bascule du col vers l'arrière, en radians.
 *
 * Positive : le bord arrière monte à hauteur d'oreille, le bord avant descend
 * sous le menton. Le signe compte — à l'envers, le col se referme sur la figure.
 */
const DAWN_COLLAR_TILT = 0.24

/**
 * Le nuage, tracé une fois pour toutes et partagé par les sept exemplaires.
 *
 * À l'échelle un : chaque instance porte la sienne. Une géométrie par nuage
 * aurait fait sept tracés de courbes et sept extrusions au montage du skin, pour
 * un résultat identique au facteur d'échelle près.
 */
const dawnCloud = cloudGeometry(1)

/**
 * Les cinq nuages du manteau : azimut, hauteur dans le repère du buste, rayon du
 * vêtement à cette hauteur, taille et inclinaison propre.
 *
 * Le rayon est **écrit et non calculé**, et c'est un choix : le manteau est fait
 * de deux troncs de cône, et une fonction qui retrouverait le rayon à une hauteur
 * donnée devrait connaître les deux — donc se remettre à jour à chaque retouche
 * de la silhouette. Cinq nombres mesurés une fois coûtent moins cher qu'une
 * dépendance de plus.
 *
 * Chacun est posé **en avant** de la surface qu'il habille (`+ 0,03`), jamais
 * centré dessus : c'est le piège des lamelles du clan, et il coûte le même prix
 * ici — un blason centré sur un cylindre de 0,3 de rayon est intégralement
 * enfoui dedans.
 *
 * Les inclinaisons ne sont pas décoratives : sans elles, cinq blasons alignés à
 * l'équerre font un uniforme, pas un vêtement porté.
 */
const DAWN_CLOUDS = [
  { azimuth: 0.85, y: 0.33, radius: 0.284, size: 0.24, tilt: -0.2 },
  { azimuth: 0.95, y: -0.05, radius: 0.34, size: 0.3, tilt: -0.12 },
  { azimuth: -0.95, y: -0.05, radius: 0.34, size: 0.3, tilt: 0.12 },
  { azimuth: 2.5, y: 0.2, radius: 0.293, size: 0.26, tilt: 0.3 },
  { azimuth: -2.5, y: 0.2, radius: 0.293, size: 0.26, tilt: -0.3 },
] as const

/**
 * Un nuage de l'Aube, posé sur le vêtement.
 *
 * Le liseré blanc est le **contour** du mesh, pas une seconde pièce : la même
 * chose qui cerne tout le personnage dessine le trait du blason, et les deux ne
 * peuvent donc pas diverger. Son épaisseur est multipliée par l'échelle de
 * l'instance, comme toute normale poussée en repère objet — un nuage de manche
 * a donc un trait plus fin qu'un nuage de jupe, ce qui est exactement ce qu'on
 * veut.
 */
function DawnCloud({
  palette,
  size,
  tilt = 0,
}: {
  palette: Palette
  size: number
  tilt?: number
}) {
  return (
    <mesh castShadow geometry={dawnCloud} scale={size} rotation={[0, 0, tilt]}>
      <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
      <Outlines thickness={0.016} color={palette.gearTrim} />
    </mesh>
  )
}

/**
 * Bande cramoisie qui épouse l'évasement du manteau.
 *
 * Un secteur de cylindre de quelques degrés, et non une boîte : la ligne de
 * fermeture fait 62 cm de haut pour 8 cm d'écart de rayon entre ses extrémités,
 * une barre droite décollerait du vêtement en haut ou en bas. Elle sert aussi de
 * liseré aux deux bords de la fente, où elle tient lieu de doublure.
 */
function DawnSeam({
  palette,
  radii,
  height,
  y,
  azimuth,
  width,
}: {
  palette: Palette
  /** Rayons du vêtement, haut puis bas, à l'endroit où la bande se pose. */
  radii: [number, number]
  height: number
  y: number
  azimuth: number
  width: number
}) {
  return (
    <mesh position={[0, y, 0]}>
      <cylinderGeometry
        args={[radii[0] + 0.006, radii[1] + 0.006, height, 3, 1, true, azimuth - width / 2, width]}
      />
      <meshToonMaterial color={palette.belt} gradientMap={toonGradient} side={DoubleSide} />
    </mesh>
  )
}

/**
 * Buste du quatrième skin : manteau long fermé, col dressé, blasons.
 *
 * C'est le seul des quatre vêtements de buste qui descende sous les genoux, et
 * c'est ce qui le sépare des trois autres à 21 unités de recul, avant toute
 * couleur : une cloche qui tombe à mi-mollet là où le clan s'arrête à mi-cuisse
 * et où les deux premiers laissent voir un torse.
 */
function DawnTorso({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Corps du manteau : un tronc de cône du col aux hanches, large aux
          épaules (0,27) et déjà évasé en bas (0,30). */}
      <mesh castShadow position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.27, 0.3, 0.42, 20]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <DawnSeam palette={palette} radii={[0.27, 0.3]} height={0.42} y={0.31} azimuth={0} width={0.1} />

      {/*
        Jupe : le seul endroit où le manteau s'ouvre, et **l'ourlet s'arrête à
        0,24 en monde**, c'est-à-dire à mi-mollet.

        La cote est mesurée sur les planches de référence : le vêtement y laisse
        voir un bon tiers de la jambe, soit 16 % de la hauteur du personnage
        au-dessus du sol. Elle avait d'abord été posée à 0,10 pour faire « long »,
        et c'était faux dans les deux sens — les bandes de lin s'arrêtent à 0,07,
        elles étaient donc **intégralement recouvertes**, et la jambe redevenait
        la colonne unie que trois valeurs distinctes devaient justement casser.
      */}
      <mesh castShadow position={[0, -0.05, 0]}>
        <cylinderGeometry
          args={[0.3, 0.38, 0.3, 20, 1, true, DAWN_SLIT, Math.PI * 2 - 2 * DAWN_SLIT]}
        />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} side={DoubleSide} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {[DAWN_SLIT, -DAWN_SLIT].map((a) => (
        <DawnSeam
          key={a}
          palette={palette}
          radii={[0.3, 0.38]}
          height={0.3}
          y={-0.05}
          azimuth={a - Math.sign(a) * 0.045}
          width={0.085}
        />
      ))}

      {DAWN_CLOUDS.map((cloud) => (
        <group
          key={`${cloud.azimuth}:${cloud.y}`}
          position={[
            Math.sin(cloud.azimuth) * (cloud.radius + 0.03),
            cloud.y,
            Math.cos(cloud.azimuth) * (cloud.radius + 0.03),
          ]}
          rotation={[0, cloud.azimuth, 0]}
        >
          <DawnCloud palette={palette} size={cloud.size} tilt={cloud.tilt} />
        </group>
      ))}

      {/* Col : deux secteurs emboîtés, noir dehors et cramoisi dedans. Sans
          `DoubleSide`, c'est la doublure rouge qu'on perd — elle n'existe que
          par la face intérieure du cylindre. */}
      <mesh castShadow position={[0, 0.6, -0.01]} rotation={[DAWN_COLLAR_TILT, 0, 0]}>
        <cylinderGeometry
          args={[
            0.35,
            0.23,
            0.3,
            16,
            1,
            true,
            DAWN_COLLAR_OPEN,
            Math.PI * 2 - 2 * DAWN_COLLAR_OPEN,
          ]}
        />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} side={DoubleSide} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh position={[0, 0.6, -0.01]} rotation={[DAWN_COLLAR_TILT, 0, 0]}>
        <cylinderGeometry
          args={[
            0.332,
            0.219,
            0.292,
            16,
            1,
            true,
            DAWN_COLLAR_OPEN + 0.035,
            Math.PI * 2 - 2 * (DAWN_COLLAR_OPEN + 0.035),
          ]}
        />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} side={DoubleSide} />
      </mesh>
    </>
  )
}

/**
 * Visage du premier skin.
 *
 * Le sourire est un **arc de tore**, pas une texture : trois primitives pour la
 * chose la plus reconnaissable du personnage. Il est tracé en `meshBasicMaterial`
 * comme les yeux — le cel-shading sur un trait de deux centimètres ne produit
 * qu'une bande d'ombre qui le fait disparaître d'un côté.
 */
function StrawHatFace({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Cheveux noirs en bataille, sous le chapeau. */}
      <mesh castShadow position={[0, 0.07, 0]} scale={[1.01, 0.78, 1.01]}>
        <sphereGeometry args={[0.262, 16, 14]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>
      {[
        [0.14, 0.2, 0.13, 0.5],
        [-0.1, 0.22, 0.08, 0.7],
        [0.02, 0.24, 0.03, 0.9],
      ].map(([x, y, z, tilt]) => (
        <mesh key={x} castShadow position={[x, y, z]} rotation={[tilt, 0, x * 1.6]}>
          <coneGeometry args={[0.06, 0.16, 5]} />
          <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* yeux : la face regarde +Z */}
      {[0.09, -0.09].map((x) => (
        <mesh key={x} position={[x, 0.01, 0.235]} scale={[0.52, 1, 0.4]}>
          <sphereGeometry args={[0.048, 10, 10]} />
          <meshBasicMaterial color={palette.eye} />
        </mesh>
      ))}

      {/* Cicatrice sous l'œil gauche du modèle (+X) : un trait et ses deux
          points de suture. À trois box plates, elle survit à la plongée. */}
      <mesh position={[0.1, -0.07, 0.229]}>
        <boxGeometry args={[0.075, 0.016, 0.01]} />
        <meshBasicMaterial color={palette.scar} />
      </mesh>
      {[-0.02, 0.025].map((dx) => (
        <mesh key={dx} position={[0.1 + dx, -0.07, 0.229]}>
          <boxGeometry args={[0.014, 0.05, 0.01]} />
          <meshBasicMaterial color={palette.scar} />
        </mesh>
      ))}

      <mesh position={[0, -0.06, 0.212]} rotation={[0, 0, -Math.PI * 0.91]}>
        <torusGeometry args={[0.115, 0.02, 6, 14, Math.PI * 0.82]} />
        <meshBasicMaterial color={palette.eye} />
      </mesh>
      <mesh position={[0, -0.085, 0.222]}>
        <boxGeometry args={[0.15, 0.03, 0.01]} />
        <meshBasicMaterial color="#fdf6ea" />
      </mesh>
    </>
  )
}

/**
 * Visage du second skin : un œil clos barré d'une cicatrice, trois anneaux.
 *
 * L'œil gauche devient une simple ligne horizontale. C'est plus lisible qu'une
 * paupière modelée : à cette échelle, ce qu'on lit c'est le *contraste* entre un
 * œil rond et un trait, pas le relief.
 */
function SwordsmanFace({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Trois anneaux à l'oreille gauche. Trois sphères de 0,023, et ils se
          voient encore en plongée à 17° — l'or est la seule teinte franchement
          claire du haut de la silhouette. */}
      {[0.05, 0, -0.05].map((z) => (
        <mesh key={z} castShadow position={[0.255, -0.07, z]}>
          <sphereGeometry args={[0.023, 8, 8]} />
          <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Œil droit ouvert. */}
      <mesh position={[-0.09, 0.01, 0.235]} scale={[0.52, 1, 0.4]}>
        <sphereGeometry args={[0.048, 10, 10]} />
        <meshBasicMaterial color={palette.eye} />
      </mesh>

      {/* Œil gauche clos, et la balafre verticale qui le traverse. */}
      <mesh position={[0.09, 0, 0.232]}>
        <boxGeometry args={[0.085, 0.016, 0.01]} />
        <meshBasicMaterial color={palette.eye} />
      </mesh>
      <mesh position={[0.098, 0.01, 0.232]} rotation={[0, 0, 0.06]}>
        <boxGeometry args={[0.02, 0.22, 0.012]} />
        <meshBasicMaterial color={palette.scar} />
      </mesh>

      {/* Bouche : une ligne droite. Le contraste avec le sourire de l'autre
          skin fait plus pour distinguer les deux visages que la couleur des
          cheveux. */}
      <mesh position={[0, -0.1, 0.222]}>
        <boxGeometry args={[0.1, 0.018, 0.01]} />
        <meshBasicMaterial color={palette.eye} />
      </mesh>
    </>
  )
}

/**
 * Visage du troisième skin : front mangé par la frange, bouche fermée.
 *
 * Les trois visages se distinguent par la **bouche** avant tout le reste, parce
 * que c'est le seul trait qui reste lisible une fois la pièce de tête
 * reconnue : un sourire en arc pour le premier, une ligne droite pour le
 * second, et pour celui-ci une ligne plus courte et plus basse — une bouche
 * qu'on ne voit pas parler.
 *
 * Les yeux restent haut et la frange descend jusqu'à eux : c'est ce qui donne
 * le regard couvert, et c'est un réglage à cinq centimètres près. Deux
 * centimètres plus bas, la frange mange les yeux et il ne reste qu'un casque
 * noir ; deux centimètres plus haut, le front se dégage et le personnage
 * redevient avenant.
 */
function ClanFace({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Frange, aplatie sur le crâne. */}
      <mesh castShadow position={[0, 0.11, 0.03]} scale={[1, 0.62, 1]}>
        <sphereGeometry args={[0.265, 16, 14]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>

      {/* Mèches qui retombent devant les tempes : c'est ce qui fait passer la
          coupe de « cheveux courts sombres » à « crinière », de face comme de
          profil — la masse arrière, elle, ne se voit pas de face. */}
      {[0.2, -0.2].map((x) => (
        <mesh key={x} castShadow position={[x, -0.06, 0.16]} rotation={[0.22, 0, 0]}>
          <boxGeometry args={[0.09, 0.34, 0.06]} />
          <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* yeux : la face regarde +Z */}
      {[0.09, -0.09].map((x) => (
        <mesh key={x} position={[x, 0.01, 0.235]} scale={[0.5, 1, 0.4]}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshBasicMaterial color={palette.eye} />
        </mesh>
      ))}

      <mesh position={[0, -0.1, 0.222]}>
        <boxGeometry args={[0.085, 0.016, 0.01]} />
        <meshBasicMaterial color={palette.eye} />
      </mesh>
    </>
  )
}

/**
 * Les trois piercings de l'arête et les deux de la lèvre, puis trois barres par
 * oreille : position et facteur de longueur.
 *
 * Huit barres pour un détail qu'on ne voit pas courir dans l'herbe, et c'est
 * assumé : le coffre présente l'objet en gros plan et la carte d'inventaire
 * aussi, or c'est exactement là que ce visage-là doit être reconnu.
 */
const DAWN_STUDS = [
  { x: 0, y: 0.052, z: 0.252, long: 1 },
  { x: 0, y: 0.016, z: 0.252, long: 1 },
  { x: 0, y: -0.02, z: 0.252, long: 1 },
  { x: 0.027, y: -0.152, z: 0.206, long: 0.7 },
  { x: -0.027, y: -0.152, z: 0.206, long: 0.7 },
  { x: 0.272, y: 0.04, z: 0.02, long: 0.62 },
  { x: 0.272, y: 0, z: 0.02, long: 0.62 },
  { x: 0.272, y: -0.04, z: 0.02, long: 0.62 },
  { x: -0.272, y: 0.04, z: 0.02, long: 0.62 },
  { x: -0.272, y: 0, z: 0.02, long: 0.62 },
  { x: -0.272, y: -0.04, z: 0.02, long: 0.62 },
] as const

/**
 * Visage du quatrième skin — et le seul des quatre qui ait une **expression**.
 *
 * Les trois autres posent deux taches sombres et un trait sur une sphère ; à
 * leur échelle, c'est suffisant. Celui-ci ne pouvait pas s'en contenter : tout
 * le personnage tient dans son regard, et un regard demande trois pièces que
 * les autres n'ont pas — l'orbite, la paupière et le sourcil.
 *
 * **Le sens de l'inclinaison est le tout.** Paupière et sourcil piquent vers le
 * *nez* : extrémité intérieure basse, extrémité extérieure haute. Inclinés dans
 * l'autre sens — ce qui était le premier jet — ils donnent un air accablé, pas
 * menaçant ; c'est le même trait, au signe près, et le signe fait tout le
 * personnage. L'œil lui-même suit la même inclinaison, faute de quoi le sourcil
 * se lit comme posé sur un visage neutre.
 *
 * Tout est en `meshBasicMaterial`, comme les autres visages du jeu : le
 * cel-shading sur un trait de deux centimètres n'y produit qu'une bande d'ombre
 * qui le fait disparaître d'un côté. Le sourcil fait exception — il est de la
 * teinte des cheveux, et doit s'ombrer comme eux.
 */
function DawnFace({ palette }: { palette: Palette }) {
  return (
    <>
      {[0.095, -0.095].map((x) => {
        const side = Math.sign(x)
        return (
          <group key={x}>
            {/* Orbite : elle détache l'œil de la peau claire et lui donne sa
                forme en amande. Sans elle, l'iris flotte. */}
            <mesh position={[x, 0, 0.234]} rotation={[0, 0, side * 0.17]} scale={[0.66, 0.66, 0.26]}>
              <sphereGeometry args={[0.074, 12, 12]} />
              <meshBasicMaterial color={palette.grip} />
            </mesh>
            <mesh position={[x, 0, 0.242]} rotation={[0, 0, side * 0.17]} scale={[0.66, 0.68, 0.28]}>
              <sphereGeometry args={[0.064, 12, 12]} />
              <meshBasicMaterial color={palette.eye} />
            </mesh>
            {/* Les trois anneaux. Illisibles au-delà de cinq unités, et c'est
                normal : ils sont pour le coffre et la carte, pas pour le jeu. */}
            {[0.019, 0.031, 0.043].map((radius) => (
              <mesh key={radius} position={[x, 0, 0.256]} scale={[0.7, 0.92, 0.5]}>
                <torusGeometry args={[radius, 0.0045, 6, 18]} />
                <meshBasicMaterial color={palette.cord} />
              </mesh>
            ))}
            <mesh position={[x, 0, 0.259]}>
              <sphereGeometry args={[0.0105, 6, 6]} />
              <meshBasicMaterial color={palette.outline} />
            </mesh>
            <mesh position={[x, 0.044, 0.25]} rotation={[0, 0, side * 0.24]}>
              <boxGeometry args={[0.094, 0.018, 0.012]} />
              <meshBasicMaterial color={palette.outline} />
            </mesh>
            <mesh position={[x * 0.92, 0.076, 0.246]} rotation={[0, 0, side * 0.34]}>
              <boxGeometry args={[0.074, 0.014, 0.012]} />
              <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
            </mesh>
          </group>
        )
      })}

      <mesh position={[0, -0.108, 0.236]}>
        <boxGeometry args={[0.07, 0.013, 0.01]} />
        <meshBasicMaterial color={palette.outline} />
      </mesh>

      {DAWN_STUDS.map((stud) => (
        <mesh
          key={`${stud.x}:${stud.y}`}
          position={[stud.x, stud.y, stud.z]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[1, stud.long, 1]}
        >
          <cylinderGeometry args={[0.012, 0.012, 0.052, 6]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Bandeau : le tissu fait le tour, la plaque déborde du crâne de deux
          centimètres. Sans ce débord elle est avalée par la calotte de cheveux,
          qui passe devant elle à cette hauteur. */}
      <mesh position={[0, 0.135, 0]}>
        <cylinderGeometry args={[0.272, 0.272, 0.09, 16, 1, true]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} side={DoubleSide} />
      </mesh>
      <mesh castShadow position={[0, 0.135, 0.245]} rotation={[-0.1, 0, 0]}>
        <boxGeometry args={[0.245, 0.088, 0.055]} />
        <meshToonMaterial color={palette.guard} gradientMap={toonGradient} />
        <Outlines thickness={0.016} color={palette.outline} />
      </mesh>
      {[-0.066, -0.022, 0.022, 0.066].map((x) => (
        <mesh key={x} position={[x, 0.135, 0.272]} rotation={[-0.1, 0, 0]}>
          <boxGeometry args={[0.011, 0.05, 0.012]} />
          <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
        </mesh>
      ))}
      {/* La rayure du déserteur. C'est la seule « cicatrice » de ce skin, et
          elle est sur le métal — d'où le champ `scar`, qui ne touche ici aucune
          peau. */}
      <mesh position={[0, 0.135, 0.274]} rotation={[-0.1, 0, 0.28]}>
        <boxGeometry args={[0.26, 0.012, 0.012]} />
        <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
      </mesh>
      {[0.05, -0.05].map((x) => (
        <mesh
          key={x}
          castShadow
          position={[x, 0.01, -0.255]}
          rotation={[0.22, 0, x > 0 ? 0.1 : -0.1]}
        >
          <boxGeometry args={[0.05, 0.26, 0.014]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        </mesh>
      ))}
    </>
  )
}

/**
 * Chapeau de paille.
 *
 * La pièce qui porte tout le skin. Son bord fait **0,44 de rayon contre 0,26
 * pour la tête** : c'est le seul élément qui déborde franchement de la
 * silhouette, donc le seul qui se lise en plongée à 17°, là où une coupe de
 * cheveux ne se distingue plus du crâne.
 *
 * Il vit dans le groupe animé, et hérite donc tel quel du ressort à un pas de
 * retard : c'est une masse posée en équilibre sur un crâne, elle a toutes les
 * raisons de rebondir au pas de course.
 */
function StrawHat({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh castShadow position={[0, 0.06, -0.01]} rotation={[-0.06, 0, 0]}>
        <cylinderGeometry args={[0.44, 0.46, 0.022, 22]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, 0.15, -0.01]}>
        <cylinderGeometry args={[0.235, 0.255, 0.17, 16]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh position={[0, 0.09, -0.01]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.248, 0.028, 6, 18]} />
        <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
      </mesh>
    </>
  )
}

/**
 * Coupe courte du second skin.
 *
 * Une calotte et cinq pointes ramenées en arrière, et rien qui descende sous la
 * nuque : c'est exactement l'inverse de la crinière qui vivait ici avant. Les
 * pointes ont des longueurs inégales — une couronne régulière se lit comme un
 * oursin, c'est le même raisonnement que les plaques de mousse de la pyramide.
 */
const HAIR_SPIKES: ReadonlyArray<{ x: number; y: number; tilt: number; long: boolean }> = [
  { x: 0.2, y: -0.12, tilt: 0.9, long: false },
  { x: -0.2, y: -0.1, tilt: 0.95, long: true },
  { x: 0.1, y: 0.05, tilt: 0.6, long: false },
  { x: -0.09, y: 0.07, tilt: 0.62, long: true },
  { x: 0, y: -0.02, tilt: 0.4, long: false },
]

function CroppedHair({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh castShadow position={[0, -0.05, -0.02]} scale={[1.02, 0.86, 1.05]}>
        <sphereGeometry args={[0.268, 16, 14]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {HAIR_SPIKES.map((spike) => (
        <mesh
          key={spike.x}
          castShadow
          position={[spike.x, spike.y, -0.2]}
          rotation={[spike.tilt + 0.5, 0, spike.x * 1.2]}
        >
          <coneGeometry args={[0.075, spike.long ? 0.33 : 0.26, 5]} />
          <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        </mesh>
      ))}
    </>
  )
}

/**
 * Crinière du clan.
 *
 * Trois pièces, et la répartition compte plus que le nombre :
 *
 *  - une **masse arrière**, poussée franchement derrière la tête. La première
 *    version la centrait sur le crâne : elle débordait alors jusque devant les
 *    yeux et le personnage portait un casque noir, visage compris. Une
 *    chevelure se voit *derrière* une tête, sinon c'est une cagoule ;
 *  - une **traîne** qui descend jusqu'au bas du dos. C'est elle qui fait la
 *    silhouette : sans elle, la coupe reste courte quel que soit le nombre de
 *    pointes qu'on ajoute autour. Elle vit dans le groupe animé, donc elle
 *    balaie avec un pas de retard sur la marche — le détail qui la fait lire
 *    comme des cheveux et non comme une cape ;
 *  - des **pointes** irrégulières qui découpent le contour. Leur longueur et
 *    leur écartement suivent une progression volontairement inégale : une
 *    couronne régulière se lit comme un oursin. C'est le même raisonnement que
 *    les plaques de mousse de la pyramide — ce qui fait vivant, c'est
 *    l'irrégularité du contour.
 */
const MANE_SPIKES: ReadonlyArray<{ x: number; y: number; z: number; len: number; tilt: number }> = [
  { x: 0.24, y: 0.02, z: -0.3, len: 0.6, tilt: 1.05 },
  { x: -0.24, y: 0.02, z: -0.3, len: 0.64, tilt: 1.05 },
  { x: 0.34, y: -0.16, z: -0.2, len: 0.5, tilt: 1.45 },
  { x: -0.34, y: -0.16, z: -0.2, len: 0.47, tilt: 1.45 },
  { x: 0.13, y: 0.16, z: -0.32, len: 0.52, tilt: 0.62 },
  { x: -0.15, y: 0.14, z: -0.32, len: 0.56, tilt: 0.64 },
  { x: 0, y: 0.22, z: -0.26, len: 0.42, tilt: 0.34 },
]

function Mane({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Masse arrière : elle donne le volume, les pointes ne font que le
          découper. Son centre est à `z = -0.24`, donc franchement en arrière
          du crâne — c'est ce décalage qui dégage le visage. */}
      <mesh castShadow position={[0, -0.04, -0.24]} scale={[1.15, 1.02, 1.25]}>
        <sphereGeometry args={[0.26, 14, 12]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Traîne, apex vers le bas : large aux épaules, effilée au creux des
          reins. Elle traverse le manteau, et c'est voulu — des cheveux
          retombent *sur* un vêtement, ils ne s'arrêtent pas à son bord. */}
      <mesh castShadow position={[0, -0.62, -0.3]} rotation={[0.1, 0, Math.PI]}>
        <coneGeometry args={[0.3, 1.05, 7]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {MANE_SPIKES.map((spike) => (
        <mesh
          key={`${spike.x}:${spike.y}`}
          castShadow
          position={[spike.x, spike.y, spike.z]}
          rotation={[spike.tilt, 0, spike.x * 1.1]}
        >
          <coneGeometry args={[0.1, spike.len, 5]} />
          <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        </mesh>
      ))}
    </>
  )
}

/**
 * Les onze mèches de la couronne : azimut, élévation, longueur.
 *
 * Deux règles, et elles ont chacune coûté un jet :
 *
 *  - **aucune élévation négative.** Une mèche qui pointe vers le bas passe
 *    devant le visage, et le visage est tout ce que ce skin a à vendre. Le
 *    minimum est 0,33, aux tempes, et elles partent vers l'extérieur ;
 *  - **onze larges, et non dix-sept fines.** Une mèche est un paquet de
 *    cheveux : elle a une largeur. Dix-sept aiguilles régulières font un
 *    oursin, et c'est ce que le premier jet montrait.
 *
 * Les longueurs sont inégales et les plus longues partent en arrière : une
 * couronne parfaitement régulière se lit comme un objet posé sur un crâne, pas
 * comme une chevelure. Même raisonnement que la crinière du clan.
 */
const CROWN_BLADES = [
  { azimuth: 0, elevation: 1.3, length: 0.4 },
  { azimuth: 0.55, elevation: 1.05, length: 0.44 },
  { azimuth: -0.55, elevation: 1.05, length: 0.44 },
  { azimuth: 1.65, elevation: 0.95, length: 0.46 },
  { azimuth: -1.65, elevation: 0.95, length: 0.46 },
  { azimuth: Math.PI, elevation: 0.85, length: 0.44 },
  { azimuth: 0.55, elevation: 0.5, length: 0.42 },
  { azimuth: -0.55, elevation: 0.5, length: 0.42 },
  { azimuth: 1.45, elevation: 0.33, length: 0.4 },
  { azimuth: -1.45, elevation: 0.33, length: 0.4 },
  { azimuth: 2.45, elevation: 0.38, length: 0.42 },
] as const

/**
 * Chevelure du quatrième skin : une couronne qui part vers le haut.
 *
 * Elle vit dans le groupe animé et hérite donc du ressort à un pas de retard.
 * Le sien est le plus sec des quatre (voir `SKINS`) : une masse courte et dure
 * frémit, là où la crinière du clan flotte et où le chapeau de paille rebondit.
 *
 * Chaque mèche est orientée par **deux groupes emboîtés** plutôt que par des
 * angles d'Euler calculés : le premier tourne autour de Y de l'azimut, le second
 * bascule autour de X de ce qui reste à l'élévation, et la mèche n'a plus qu'à
 * s'éloigner le long de son propre +Y. Trois lignes lisibles, là où un Euler
 * équivalent dépend de l'ordre des rotations et se relit à la calculette.
 */
function SpikedCrown({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Calotte, puis masse de nuque. La seconde comble l'écart entre le
          bandeau et la couronne, qui laissait voir de la peau nue de
          trois-quarts arrière. */}
      <mesh castShadow position={[0, 0.06, -0.01]} scale={[1, 0.62, 1.02]}>
        <sphereGeometry args={[0.255, 16, 14]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>
      <mesh castShadow position={[0, -0.02, -0.045]} scale={[0.98, 0.5, 1]}>
        <sphereGeometry args={[0.25, 14, 12]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>

      {CROWN_BLADES.map((blade) => (
        <group key={`${blade.azimuth}:${blade.elevation}`} rotation={[0, blade.azimuth, 0]}>
          <group rotation={[Math.PI / 2 - blade.elevation, 0, 0]}>
            {/* Quatre segments et un aplatissement en profondeur : une pyramide
                à base carrée fait un piquant, une lame aplatie fait une mèche. */}
            <mesh castShadow position={[0, 0.09 + blade.length / 2, 0]} scale={[1.12, 1, 0.62]}>
              <coneGeometry args={[0.15, blade.length, 4]} />
              <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  )
}


/**
 * L'ambre de l'épaulière.
 *
 * En dur, et non dans la palette : les quinze champs sont pris, trois sont déjà
 * détournés, et cette gemme est la seule pièce chaude d'une tenue entièrement
 * froide — lui donner un champ obligerait les quatre autres skins à déclarer
 * une teinte qu'ils n'utiliseront jamais. Même arbitrage que l'acier de la lame
 * maudite, qui vit lui aussi à côté de la table.
 */
const DEMON_AMBER = '#c4602c'

/** Demi-ouverture de la capuche, en radians. L'ouverture donne sur +Z. */
const HOOD_OPEN = 1.02

/**
 * Les sept turquoises du poignet, en coordonnées locales de la grappe.
 *
 * Tailles et écarts inégaux : sept perles identiques font un chapelet, donc un
 * objet fabriqué ; les écarts font une grappe, donc quelque chose qui a poussé.
 * C'est le même raisonnement que les pointes inégales de la coupe du bretteur.
 */
const DEMON_BEADS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, -0.01, 0.012, 0.034],
  [0.04, -0.036, -0.014, 0.03],
  [-0.036, -0.04, 0.024, 0.028],
  [0.01, -0.078, 0.026, 0.032],
  [-0.026, -0.092, -0.01, 0.026],
  [0.044, -0.096, 0.018, 0.025],
  [0.002, -0.128, 0.008, 0.023],
]

/**
 * Les trois plaques du plastron.
 *
 * Ce sont des **secteurs de cylindre** et non des boîtes : une plaque plate sur
 * un buste rond laisse voir deux fentes de tissu à ses angles dès qu'on tourne
 * de trente degrés. Le secteur épouse le corps par construction.
 *
 * Le rayon croît avec le rang — 0,272 en haut, 0,304 en bas — parce que la
 * tunique s'évase : une plaque de rayon constant s'enfoncerait dans le tissu au
 * bas du buste et flotterait au haut.
 *
 * Trois rangs et pas cinq : à 21 unités de recul, c'est le bombé qu'on lit,
 * jamais le compte. C'est la leçon du plastron du clan, qui a le même nombre.
 */
const DEMON_PLATES = [
  { y: 0.505, r: 0.272, h: 0.115, arc: 0.7 },
  { y: 0.39, r: 0.288, h: 0.11, arc: 0.74 },
  { y: 0.275, r: 0.304, h: 0.105, arc: 0.78 },
] as const

/**
 * Buste du cinquième skin : tunique d'étoffe pâle, plastron d'acier, jupe fendue.
 *
 * C'est le second vêtement de buste fermé du jeu, après celui du clan, et pour
 * la même raison : une armure ouverte sur la poitrine n'en est plus une. Il s'en
 * distingue par la valeur — le clan est une masse sombre coupée de cramoisi,
 * celui-ci est une masse claire coupée d'une seule bande d'acier.
 */
function DemonTorso({ palette }: { palette: Palette }) {
  return (
    <>
      {/* La tunique : la masse de tissu sur laquelle tout le reste est posé. */}
      <mesh castShadow position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.215, 0.295, 0.6, 16]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/*
        La jupe, et sa fente dorée dans l'axe.

        Elle donne à la silhouette sa seule forme en cloche, et la fente est ce
        qui la fait battre à la course en laissant voir le collant d'encre entre
        les pans. Sans elle, le bas du personnage est une cloche unie.
      */}
      <mesh castShadow position={[0, -0.01, 0]}>
        <cylinderGeometry args={[0.315, 0.385, 0.22, 16]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh position={[0, -0.11, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.382, 0.018, 4, 28]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0, -0.012, 0.362]}>
        <boxGeometry args={[0.035, 0.215, 0.02]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
      </mesh>

      {/* Ceinture d'acier, fermoir d'or dans l'axe. */}
      <mesh castShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.3, 0.315, 0.085, 16]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh position={[0, 0.12, 0.3]}>
        <boxGeometry args={[0.105, 0.08, 0.05]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
      </mesh>

      <DemonPlastron palette={palette} />
    </>
  )
}

/**
 * Plastron d'acier : trois plaques bombées, deux rainures, un gorgerin, un disque.
 *
 * Les plaques sont **posées en avant du vêtement** — `scale-z` à 1,08 — et non
 * centrées sur lui. C'est l'erreur qu'avait faite le plastron du clan à sa
 * première version, où l'armure disparaissait entièrement dans le manteau : il
 * faut sortir du volume qu'on habille, pas s'y loger.
 */
function DemonPlastron({ palette }: { palette: Palette }) {
  return (
    <>
      {DEMON_PLATES.map((plate) => (
        <mesh key={plate.y} castShadow position={[0, plate.y, 0]} scale={[1, 1, 1.08]}>
          <cylinderGeometry
            args={[plate.r, plate.r + 0.012, plate.h, 14, 1, true, -plate.arc, plate.arc * 2]}
          />
          {/* Secteur ouvert : sans `DoubleSide`, la plaque disparaît dès qu'on
              voit sa face interne, c'est-à-dire de trois-quarts. */}
          <meshToonMaterial
            color={palette.belt}
            gradientMap={toonGradient}
            side={DoubleSide}
          />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}

      {/* Les deux rainures d'ombre. Non éclairées : ce sont des interstices,
          pas des pièces, et une rainure qui prend la lumière se lit comme une
          moulure en relief — l'inverse de ce qu'on veut. */}
      {[0.4475, 0.3325].map((y) => (
        <mesh key={y} position={[0, y, 0]} scale={[1, 1, 1.08]}>
          <cylinderGeometry args={[0.286, 0.286, 0.02, 14, 1, true, -0.76, 1.52]} />
          <meshBasicMaterial color={palette.scar} side={DoubleSide} />
        </mesh>
      ))}

      {/* Le gorgerin : le liseré d'or qui ferme le plastron par le haut. C'est
          lui qui empêche l'armure de se lire comme un tablier. */}
      <mesh castShadow position={[0, 0.558, 0]}>
        <cylinderGeometry args={[0.222, 0.205, 0.055, 14]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh position={[0, 0.582, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.221, 0.01, 4, 20]} />
        <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
      </mesh>

      {/*
        L'emblème rond, sur le pectoral droit du personnage (−X).

        C'est le seul disque d'une tenue faite de plaques rectangulaires : à
        21 unités ce n'est plus un emblème mais une tache d'or, et c'est
        exactement ce qu'on lui demande — un point brillant qui dit où regarder
        sur un buste autrement gris.
      */}
      <mesh position={[-0.13, 0.472, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.022, 12]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
      </mesh>
      <mesh position={[-0.13, 0.472, 0.3]}>
        <torusGeometry args={[0.053, 0.011, 4, 14]} />
        <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
      </mesh>
    </>
  )
}

/**
 * Bras du cinquième skin : manche bouffante, gantelet d'ardoise, gant sombre.
 *
 * **L'épaulière et la grappe sont montées ici**, sur le bras, et non sur le
 * buste bien qu'elles appartiennent visuellement à l'armure : elles doivent
 * suivre le geste. Posées sur le buste, elles resteraient en l'air pendant que
 * l'épaule passe dessous — c'est le même arbitrage que les lamelles d'épaule du
 * clan.
 *
 * La manche est **écartée de trois centimètres vers l'extérieur**, et c'est la
 * seule liberté que le rig laisse ici : le pivot d'épaule est à 0,24 de l'axe,
 * il appartient au squelette partagé et ne peut pas bouger pour une tenue. Or
 * la tunique fait 0,26 de rayon à cette hauteur — une manche centrée sur le
 * pivot y est à moitié enfouie, et l'épaule ronde du vêtement disparaît. C'est
 * la pièce qui se décale, jamais l'articulation.
 */
function DemonArm({ palette, fist, side }: { palette: Palette; fist: boolean; side: number }) {
  return (
    <group>
      <mesh castShadow position={[0.03 * side, 0.02, 0]} scale={[1, 0.84, 1.05]}>
        <sphereGeometry args={[0.132, 12, 10]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, -0.12, 0]}>
        <capsuleGeometry args={[0.066, 0.12, 4, 10]} />
        <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
      </mesh>

      {/*
        Le gantelet d'ardoise, deux viroles et une plaque de coude.

        C'est la pièce qui élargit la silhouette vue de face — le rôle que
        tenaient les bandes de lin chez le clan — et la seule masse franchement
        sombre d'une tenue pâle. Il va jusqu'à la main : une main couleur peau
        au bout d'un gantelet casse la pièce en deux.
      */}
      <mesh castShadow position={[0, -0.305, 0]}>
        <cylinderGeometry args={[0.086, 0.099, 0.235, 12]} />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {[-0.212, -0.398].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.094, 0.015, 4, 16]} />
          <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
        </mesh>
      ))}
      <mesh castShadow position={[0, -0.252, 0.078]}>
        <boxGeometry args={[0.105, 0.085, 0.05]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
      </mesh>

      {/* Le gant. Il grossit à mains nues comme celui des autres skins, bien
          que cette tenue dégaine une épée par défaut : le rig ne promet nulle
          part qu'un skin garde son arme, et une main qui ignorerait `fist`
          serait un piège pour le jour où l'on en changera. */}
      <mesh castShadow position={[0, -0.452, 0.005]} scale={fist ? 1.3 : 1}>
        <sphereGeometry args={[0.064, 10, 9]} />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {side < 0 ? <DemonPauldron palette={palette} /> : <DemonBeads palette={palette} />}
    </group>
  )
}

/**
 * L'épaulière d'or, du côté du bras armé, et il n'y en a qu'une.
 *
 * **C'est la seule silhouette asymétrique du jeu.** Les quatre autres tenues
 * sont rigoureusement symétriques, et une épaule plus haute que l'autre se
 * reconnaît de dos, de profil et en pleine course — ce qu'aucune couleur ne
 * fait. La gemme d'ambre qui la ferme est la seule pièce chaude au-dessus de la
 * ceinture : le regard est blanc, les perles sont froides, l'or est un métal.
 */
function DemonPauldron({ palette }: { palette: Palette }) {
  return (
    <group position={[-0.05, 0.055, 0]}>
      <mesh castShadow position={[0, 0.04, 0]} rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.215, 0.075, 0.245]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh position={[0.005, 0.088, 0]} rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.225, 0.02, 0.255]} />
        <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
      </mesh>
      {/* Le rang d'acier sous l'or : sans lui, l'épaulière est une plaque
          posée en équilibre, et non une pièce qui prend l'épaule. */}
      <mesh castShadow position={[0.01, -0.03, 0]} rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.19, 0.07, 0.21]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0, 0.055, 0.128]} scale={[1, 1.25, 0.65]}>
        <octahedronGeometry args={[0.05, 0]} />
        <meshToonMaterial color={DEMON_AMBER} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/**
 * La grappe de turquoises, nouée à l'avant-bras gauche.
 *
 * C'est le détail que la référence rend reconnaissable, et il est **au
 * poignet** : à la ceinture, il se perdait sous la jupe. Au bras, il bouge avec
 * le geste, et il équilibre l'épaulière sans l'annuler — une masse d'or en haut
 * d'un côté, une grappe froide en bas de l'autre.
 */
function DemonBeads({ palette }: { palette: Palette }) {
  return (
    <group position={[0.082, -0.295, 0.058]}>
      <mesh position={[0, 0.075, 0]} rotation={[Math.PI / 2, 0.3, 0]}>
        <torusGeometry args={[0.028, 0.01, 4, 12]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
      </mesh>
      {DEMON_BEADS.map(([x, y, z, r]) => (
        <mesh key={`${x}:${y}`} castShadow position={[x, y, z]}>
          <sphereGeometry args={[r, 9, 8]} />
          <meshToonMaterial color={palette.cord} gradientMap={toonGradient} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Visage du cinquième skin : le regard blanc, et les marques qui l'encadrent.
 *
 * **Tout tient dans le signe de l'inclinaison**, et la première version l'avait
 * à l'envers : coin extérieur bas, coin intérieur haut, c'est-à-dire un sourcil
 * tombant — le personnage avait l'air terrifié, pas terrifiant. Le masque
 * descend **vers le nez**, l'œil suit exactement la même pente, et la bouche
 * tombe aux commissures. C'est la seule chose qui sépare les deux lectures, et
 * elle tient dans un signe.
 *
 * L'œil est **plus large que haut** — une fente, pas une bille. Un grand œil
 * rond et blanc, c'est de l'effroi ; une fente blanche sous un masque noir,
 * c'est un regard qui vise.
 *
 * Les oreilles pointues sont la première chose qu'une tenue de ce jeu ajoute au
 * crâne. Elles se posent **par-dessus** les oreilles rondes du rig, elles ne les
 * remplacent pas : une tenue est un habillage, elle n'a pas le droit de retirer
 * une pièce du squelette partagé — le jour où on l'ôte, le personnage doit
 * redevenir exactement ce qu'il était.
 */
function DemonFace({ palette }: { palette: Palette }) {
  return (
    <>
      {[1, -1].map((side) => (
        <group
          key={side}
          position={[0.225 * side, 0.02, -0.02]}
          rotation={[0.35, 0, -0.85 * side]}
        >
          <mesh castShadow position={[0, 0.085, 0]} scale={[1, 1, 0.55]}>
            <coneGeometry args={[0.062, 0.2, 4]} />
            <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={palette.outline} />
          </mesh>
        </group>
      ))}

      {/* La flèche du front, qui descend jusqu'entre les sourcils. C'est la
          marque la plus haute du visage, donc la seule qui reste visible quand
          la tête s'incline à la course. */}
      <mesh position={[0, 0.095, 0.216]} rotation={[1.52, 0, Math.PI]} scale={[1, 1, 0.24]}>
        <coneGeometry args={[0.058, 0.16, 3]} />
        <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
      </mesh>

      {[0.098, -0.098].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.042, 0.226]} rotation={[0, 0, x > 0 ? 0.26 : -0.26]}>
            <boxGeometry args={[0.138, 0.078, 0.016]} />
            <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
          </mesh>
          <mesh position={[x * 0.97, 0.032, 0.237]} rotation={[0, 0, x > 0 ? 0.26 : -0.26]}>
            <boxGeometry args={[0.086, 0.032, 0.022]} />
            {/* Non éclairé, comme les yeux du Lynel : c'est la seule pièce du
                modèle qui ne doive jamais s'éteindre quand la lumière tourne. */}
            <meshBasicMaterial color={palette.eye} />
          </mesh>
        </group>
      ))}

      {/* Deux segments qui tombent aux commissures, jamais un trait droit : une
          bouche neutre sous un regard blanc donne un visage absent. À cette
          taille, on ne lit que la pente. */}
      {[0.023, -0.023].map((x) => (
        <mesh key={x} position={[x, -0.112, 0.232]} rotation={[0, 0, x > 0 ? 0.3 : -0.3]}>
          <boxGeometry args={[0.046, 0.012, 0.012]} />
          <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
        </mesh>
      ))}
    </>
  )
}

/**
 * Pièce de tête du cinquième skin : une capuche rabattue.
 *
 * La seule des cinq qui **couvre** au lieu de dépasser. Le chapeau est un
 * disque large, la coupe courte une calotte, la crinière une masse qui descend
 * aux reins, la couronne de l'Aube part vers le haut ; une capuche ferme la
 * silhouette et donne au casting son premier contour arrondi.
 *
 * Elle est **descendue de deux centimètres sur le front** par rapport à un
 * placement neutre, et c'est de la mise en scène, pas de la géométrie : une
 * capuche qui surplombe le front enfonce le regard dans son ombre, et un regard
 * en retrait regarde de dessous. Remontée, la même capuche dégage le front et
 * rend le visage ouvert — exactement le contraire de ce qu'on cherche.
 *
 * Les cheveux, eux, **ne sont pas dans la capuche** : frange et mèches de tempe
 * sont montées à côté d'elle. C'est ce qui fait qu'on les voit dépasser au front
 * et le long des joues plutôt que traverser l'étoffe.
 */
function DemonHood({ palette }: { palette: Palette }) {
  return (
    <>
      {/* La capuche est un cylindre ouvert, comme le gilet du premier skin, et
          pour la même raison : `cylinderGeometry` sait ne décrire qu'un secteur
          d'angle, et deux plaques côte à côte laisseraient voir le crâne par la
          tranche au premier pivot de la tête. */}
      <mesh castShadow position={[0, -0.13, -0.015]}>
        <cylinderGeometry
          args={[0.295, 0.335, 0.31, 18, 1, true, HOOD_OPEN, Math.PI * 2 - 2 * HOOD_OPEN]}
        />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} side={DoubleSide} />
      </mesh>
      <mesh castShadow position={[0, -0.005, 0.005]} scale={[1, 0.9, 1.08]}>
        <sphereGeometry args={[0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Les ourlets ferment la tranche du cylindre, qui est d'épaisseur nulle :
          sans eux, le bord de la capuche disparaît sous tout angle rasant. */}
      {[HOOD_OPEN, -HOOD_OPEN].map((a) => (
        <mesh
          key={a}
          castShadow
          position={[Math.sin(a) * 0.307, -0.13, Math.cos(a) * 0.307]}
          rotation={[0, a, 0]}
        >
          <boxGeometry args={[0.026, 0.3, 0.04]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* La pointe rejetée en arrière : le détail qui dit « capuche » et non
          « casque ». */}
      <mesh castShadow position={[0, 0.02, -0.29]} rotation={[2.55, 0, 0]}>
        <coneGeometry args={[0.105, 0.26, 6]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {/* La masse de nuque, qui comble l'écart entre la capuche et le dos. */}
      <mesh castShadow position={[0, -0.22, -0.1]} scale={[1, 0.72, 0.86]}>
        <sphereGeometry args={[0.21, 12, 10]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
      </mesh>

      {/* Calotte de cheveux sous la capuche : sans elle, on voit le crâne nu
          par l'ouverture dès que la tête se tourne. */}
      <mesh position={[0, -0.15, -0.01]} scale={[1, 0.62, 1]}>
        <sphereGeometry args={[0.248, 14, 12]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>
      {/* Frange, puis deux mèches de tempe. Un premier jet posait cinq pointes
          autour du crâne : sous la capuche, elles sortaient par les côtés et se
          lisaient comme des piquants. Le blanc doit apparaître là où l'étoffe
          s'ouvre — au front et le long des joues. */}
      <mesh position={[0, 0.005, 0.118]} rotation={[-0.22, 0, 0]} scale={[1.08, 0.32, 0.58]}>
        <sphereGeometry args={[0.205, 12, 9]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>
      {[0.175, -0.175].map((x) => (
        <mesh key={x} position={[x, -0.16, 0.135]} rotation={[0.12, 0, x * 0.9]}>
          <boxGeometry args={[0.055, 0.19, 0.05]} />
          <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        </mesh>
      ))}
    </>
  )
}

/**
 * Demi-ouverture de la cape, en radians.
 *
 * Elle ferme le dos et les deux flancs, et **s'arrête aux épaules** : ouverte
 * davantage, elle se rejoignait sur la poitrine et le personnage disparaissait
 * dans un cône. Le plastron de commande est la seule chose qui rende cette
 * silhouette lisible de face — il ne doit jamais passer dessous.
 */
const CAPE_HALF = 1.62

/**
 * Buste du sixième skin : cuirasse laquée, plastron de commande, cape.
 *
 * C'est le troisième vêtement de buste fermé du jeu, après le clan et le Dieu
 * Démon, et il s'en distingue par ce qu'il ajoute et non par sa coupe : **la
 * cape**. Aucune autre tenue n'élargit la silhouette par l'arrière, et c'est
 * elle qui fait reconnaître ce personnage de dos, à contre-jour, et en pleine
 * course — bien avant le casque.
 *
 * Elle est montée **sur le buste** et non sur un groupe à elle : elle suit donc
 * le pivot de torse du coup d'épée, ce qui suffit à la faire vivre. Un ressort
 * dédié aurait demandé un troisième groupe animé dans `useFrame` — le rig n'en
 * a que pour la pièce de tête — et une cape qui traîne d'un pas derrière le dos
 * traverse les épaules à la moindre volte.
 *
 * Le plastron est posé **en avant de la cuirasse** (z = 0,235 pour un rayon de
 * 0,23), pour la même raison que celui du Dieu Démon : une pièce d'armure doit
 * sortir du volume qu'elle habille, sinon elle s'y loge et disparaît.
 */
function VaderTorso({ palette }: { palette: Palette }) {
  return (
    <>
      {/* La cuirasse. */}
      <mesh castShadow position={[0, 0.27, 0]}>
        <cylinderGeometry args={[0.225, 0.29, 0.62, 16]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/*
        La cape : un cylindre ouvert, comme le gilet du premier skin et la
        capuche du Dieu Démon, et pour la même raison — `cylinderGeometry` sait
        ne décrire qu'un secteur d'angle, là où deux plaques posées côte à côte
        laisseraient voir le dos par la tranche au premier pivot du buste.

        Elle s'évase franchement (0,30 en haut, 0,52 en bas) : une cape à bords
        parallèles est un rideau, et c'est l'évasement qui lui donne du poids.
      */}
      <mesh castShadow position={[0, 0.16, -0.02]}>
        <cylinderGeometry
          args={[0.3, 0.52, 0.92, 18, 1, true, Math.PI - CAPE_HALF, CAPE_HALF * 2]}
        />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} side={DoubleSide} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {/* La doublure, un centimètre et demi en dedans : c'est elle qu'on voit
          quand la cape s'ouvre au pivot du coup, et sans elle la tranche
          d'épaisseur nulle disparaît sous tout angle rasant. */}
      <mesh position={[0, 0.16, -0.02]}>
        <cylinderGeometry
          args={[0.285, 0.5, 0.9, 18, 1, true, Math.PI - CAPE_HALF + 0.06, (CAPE_HALF - 0.06) * 2]}
        />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} side={DoubleSide} />
      </mesh>

      {/* Les deux pattes d'épaule qui tiennent la cape. Sans elles, l'étoffe
          part du vide au-dessus des bras. */}
      {[0.19, -0.19].map((x) => (
        <mesh key={x} castShadow position={[x, 0.5, -0.05]} rotation={[0, 0, x > 0 ? -0.25 : 0.25]}>
          <boxGeometry args={[0.17, 0.06, 0.2]} />
          <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Le col, qui monte derrière la nuque et se ferme devant : la seule
          pièce du buste qui touche le casque, et ce qui empêche la tête de
          flotter au-dessus des épaules. */}
      <mesh castShadow position={[0, 0.575, -0.01]}>
        <cylinderGeometry args={[0.185, 0.215, 0.1, 14]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      <VaderChestPlate palette={palette} />

      {/* La ceinture d'acier et ses caissons : la seule bande claire du corps,
          et c'est elle qui marque la taille d'une silhouette autrement
          uniformément noire. */}
      <mesh castShadow position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.285, 0.295, 0.095, 16]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {[-0.28, 0, 0.28].map((a) => (
        <mesh
          key={a}
          castShadow
          position={[Math.sin(a) * 0.3, 0.06, Math.cos(a) * 0.3]}
          rotation={[0, a, 0]}
        >
          <boxGeometry args={[0.09, 0.075, 0.05]} />
          <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Le tablier : deux pans qui pendent de la ceinture, devant et derrière,
          et **pas une jupe**. C'est la fente entre les deux qui laisse voir les
          jambes matelassées à la course — sans elle, le bas du personnage est
          une cloche, ce qu'est déjà celui du Dieu Démon. */}
      {[0.16, -0.16].map((z) => (
        <mesh key={z} castShadow position={[0, -0.09, z]}>
          <boxGeometry args={[0.36, 0.26, 0.055]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}
    </>
  )
}

/**
 * Le plastron de commande — **la seule pièce colorée du personnage**.
 *
 * Tout le reste est noir, graphite ou acier. À 21 unités, c'est ce rectangle
 * rouge et blanc qui dit où est la poitrine, donc dans quel sens regarde la
 * silhouette : sans lui, la tenue de face et la tenue de dos sont deux masses
 * noires identiques, et la cape ne les sépare qu'aux trois quarts.
 *
 * Les témoins sont posés en **deux rangs inégaux** — trois en haut, deux en bas
 * décalés. Une grille régulière se serait lue comme une texture, et à cette
 * taille une texture n'est plus rien du tout.
 */
function VaderChestPlate({ palette }: { palette: Palette }) {
  return (
    <group position={[0, 0.4, 0.235]}>
      <mesh castShadow>
        <boxGeometry args={[0.215, 0.155, 0.05]} />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {/* Les témoins. Le rouge est **non éclairé**, comme le regard du Dieu
          Démon et les yeux du Lynel : c'est la pièce qui doit rester lisible
          quelle que soit l'orientation de la lumière, et une diode qui s'éteint
          dans l'ombre n'est plus une diode. */}
      {[-0.06, 0, 0.06].map((x) => (
        <mesh key={x} position={[x, 0.035, 0.028]}>
          <boxGeometry args={[0.038, 0.03, 0.012]} />
          <meshBasicMaterial color={palette.cord} />
        </mesh>
      ))}
      {[-0.045, 0.045].map((x) => (
        <mesh key={x} position={[x, -0.025, 0.028]}>
          <boxGeometry args={[0.05, 0.022, 0.012]} />
          <meshBasicMaterial color={palette.gearTrim} />
        </mesh>
      ))}
      {/* Le cadran du bas, seul rond d'une pièce faite de rectangles. */}
      <mesh position={[0, -0.058, 0.028]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.012, 10]} />
        <meshBasicMaterial color={palette.cord} />
      </mesh>
    </group>
  )
}

/**
 * Bras du sixième skin : manche laquée, cloche d'épaule, gantelet noir.
 *
 * **Les deux cloches sont identiques**, et c'est une règle et non un oubli : la
 * seule silhouette asymétrique du jeu est celle du Dieu Démon, dont l'épaulière
 * d'or unique est la signature (voir `DemonPauldron`). Une seconde tenue
 * asymétrique lui retirerait ce qui la distingue de dos.
 *
 * La cloche est **écartée de trois centimètres vers l'extérieur**, comme la
 * manche du Dieu Démon et celle de l'Aube : le pivot d'épaule est à 0,24 de
 * l'axe, il appartient au squelette partagé et ne bouge pour aucune tenue. La
 * cuirasse faisant 0,24 de rayon à cette hauteur, une cloche centrée sur le
 * pivot y serait à moitié enfouie.
 */
function VaderArm({ palette, fist, side }: { palette: Palette; fist: boolean; side: number }) {
  return (
    <group>
      {/* La cloche d'épaule : un secteur de sphère aplati, posé sur le pivot.
          C'est la pièce qui carre les épaules, et la carrure est la moitié de
          cette silhouette. */}
      <mesh
        castShadow
        position={[side * 0.03, 0.02, 0]}
        scale={[1, 0.72, 1.12]}
        rotation={[0, 0, side * -0.18]}
      >
        <sphereGeometry args={[0.135, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} side={DoubleSide} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      <mesh castShadow position={[0, -0.15, 0]}>
        <capsuleGeometry args={[0.072, 0.18, 4, 10]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Le gantelet, et sa virole d'acier au poignet. La virole est le seul
          repère clair du bras : sans elle, la main noire au bout d'une manche
          noire ne se distingue plus, et le geste d'attaque cesse de se lire. */}
      <mesh castShadow position={[0, -0.29, 0]}>
        <cylinderGeometry args={[0.076, 0.085, 0.14, 12]} />
        <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0, -0.355, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.079, 0.014, 4, 14]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
      </mesh>

      {/* Le gant. Il grossit à mains nues comme celui des cinq autres skins,
          bien que cette tenue dégaine une épée par défaut : le rig ne promet
          nulle part qu'un skin garde son arme. */}
      <mesh castShadow position={[0, -0.41, 0]}>
        <sphereGeometry args={[fist ? 0.085 : 0.066, 10, 10]} />
        <meshToonMaterial color={palette.skin} gradientMap={toonGradient} />
        {fist && <Outlines thickness={OUTLINE} color={palette.outline} />}
      </mesh>
    </group>
  )
}

/**
 * Visage du sixième skin — c'est-à-dire **un masque**, et le premier du jeu.
 *
 * Les cinq autres ont un visage : deux yeux, une bouche, des marques. Celui-ci
 * n'en a pas, et tout l'effet tient là. Les pièces claires sont donc les seules
 * à porter la lecture, et elles sont **en acier** quand tout le reste du
 * personnage est noir : le triangle du nez, la grille de bouche et les deux
 * évents de joue. C'est le négatif exact d'un visage — on lit une machine à
 * l'endroit où l'on attend des traits.
 *
 * Les lentilles, elles, sont sombres (voir `eye` dans la palette) : deux amandes
 * à peine plus claires que la laque, inclinées vers le nez. La pente est la
 * même que celle du masque du Dieu Démon, et pour la même raison — coin
 * extérieur haut, coin intérieur bas. À l'envers, le personnage a l'air
 * inquiet ; dans ce sens, il a l'air de viser.
 */
function VaderMask({ palette }: { palette: Palette }) {
  return (
    <>
      {/*
        La plaque de face, posée en avant du crâne : c'est elle qui donne au
        profil son menton carré, là où le rig n'a qu'une sphère.

        **Elle est volontairement plate** (0,45 d'aplatissement en Z) et reculée
        à 0,10. Un premier jet la posait bombée à 0,145, et elle **avalait tout
        le masque** : le triangle du nez et la grille de bouche, pourtant placés
        plus en avant en apparence, tombaient à l'intérieur de son volume, et le
        personnage n'avait plus qu'une tête noire et lisse. Constaté en capture.
        La règle est la même que pour les plastrons du clan et du Dieu Démon, à
        l'envers : une pièce posée **sur** une autre doit sortir de son volume,
        donc c'est ici le support qui devait s'aplatir.
      */}
      <mesh castShadow position={[0, -0.04, 0.115]} scale={[1, 1.05, 0.6]}>
        <sphereGeometry args={[0.222, 14, 12]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* L'arête de front, qui surplombe les lentilles et les met dans son
          ombre. Sans elle, les deux amandes flottent sur une face lisse. */}
      <mesh castShadow position={[0, 0.09, 0.2]} rotation={[0.22, 0, 0]}>
        <boxGeometry args={[0.285, 0.05, 0.09]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/*
        Les lentilles, et le cadre d'acier qui les cerne.

        Elles sont non éclairées, comme le regard du Dieu Démon : elles ne
        doivent ni s'allumer ni s'éteindre quand la lumière tourne — un masque
        qui change d'expression n'en est plus un.

        **Le cadre est une licence, et elle est assumée.** Le casque de la
        référence a des orbites noires cernées de noir : à 21 unités, deux
        amandes sombres sur une laque sombre ne se voyaient pas du tout, et le
        personnage n'avait plus de regard — seulement un appareil respiratoire au
        milieu d'une boule noire. Le liseré d'acier reprend celui du nez et de la
        grille, donc il n'invente pas une matière de plus : il dit juste où sont
        les yeux. C'est la même règle que partout ailleurs dans ce fichier — la
        lisibilité à distance passe avant l'exactitude du détail.
      */}
      {[0.088, -0.088].map((x) => (
        <group key={x} position={[x, 0.045, 0.243]} rotation={[0, x > 0 ? -0.22 : 0.22, x > 0 ? 0.28 : -0.28]}>
          <mesh>
            <boxGeometry args={[0.125, 0.072, 0.018]} />
            <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
          </mesh>
          <mesh position={[0, 0, 0.012]}>
            <boxGeometry args={[0.1, 0.05, 0.016]} />
            <meshBasicMaterial color={palette.eye} />
          </mesh>
        </group>
      ))}

      {/* Le triangle du nez, pointe en bas, et la grille de bouche sous lui :
          les deux pièces d'acier de l'axe. Ce sont elles qu'on lit en premier à
          distance, et elles sont volontairement plus grandes qu'un nez et une
          bouche ne le seraient — ce n'est pas un visage, c'est un appareil. */}
      <mesh castShadow position={[0, -0.03, 0.255]} rotation={[0, 0, Math.PI]} scale={[1, 1, 0.4]}>
        <coneGeometry args={[0.052, 0.13, 3]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
      </mesh>
      <mesh castShadow position={[0, -0.13, 0.235]}>
        <boxGeometry args={[0.135, 0.072, 0.045]} />
        <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
      </mesh>
      {/* Les fentes de la grille : trois creux non éclairés, comme les rainures
          du plastron du Dieu Démon. Une fente qui prend la lumière se lit comme
          une moulure en relief, c'est-à-dire l'inverse d'une fente. */}
      {[-0.035, 0, 0.035].map((x) => (
        <mesh key={x} position={[x, -0.13, 0.259]}>
          <boxGeometry args={[0.014, 0.066, 0.012]} />
          <meshBasicMaterial color={palette.scar} />
        </mesh>
      ))}

      {/* Les deux évents de joue, en biais le long de la mâchoire : la dernière
          pièce claire du masque, et celle qui referme la face vers les oreilles
          au lieu de la laisser s'arrêter net. */}
      {[0.152, -0.152].map((x) => (
        <mesh
          key={x}
          castShadow
          position={[x, -0.09, 0.2]}
          rotation={[0, x > 0 ? 0.62 : -0.62, x > 0 ? -0.34 : 0.34]}
        >
          <boxGeometry args={[0.055, 0.115, 0.04]} />
          <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
        </mesh>
      ))}
    </>
  )
}

/**
 * Pièce de tête du sixième skin : un casque, et c'est le premier du jeu.
 *
 * Les cinq autres sont des matières souples — paille, cheveux, étoffe — qui
 * rebondissent, frémissent ou flottent. Celle-ci est **rigide**, et son ressort
 * est réglé en conséquence (voir `SKINS.vader`) : elle ne fait presque rien.
 *
 * Trois pièces, et chacune répond à une question de silhouette :
 *
 *  - **le dôme**, qui donne la hauteur. Il déborde franchement du crâne (0,30
 *    contre 0,26) : un casque à la taille de la tête se lit comme un bonnet ;
 *  - **la jupe évasée**, qui descend sur la nuque et les épaules. C'est elle qui
 *    ferme la silhouette par le bas et qui fait qu'aucun morceau de cou n'est
 *    jamais visible ;
 *  - **les deux joues**, qui tombent de part et d'autre du masque. Elles sont ce
 *    qui distingue ce contour de celui de la capuche du Dieu Démon, seul autre
 *    couvre-chef fermé du casting : la capuche est un ovale continu, celui-ci a
 *    deux angles.
 */
/**
 * Demi-ouverture de la jupe du casque, en radians.
 *
 * Elle dégage cent trente degrés sur le devant : assez pour que le masque
 * entier soit visible, pas assez pour que la nuque le soit. Voir la note de la
 * jupe.
 */
const HELM_OPEN = 1.15

function VaderHelmet({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh castShadow position={[0, -0.01, -0.05]} scale={[1, 1, 1]}>
        <sphereGeometry args={[0.285, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Le reflet de laque, sur le devant du dôme. C'est le seul endroit du
          personnage où le noir s'éclaircit, et il n'est pas décoratif : sans
          lui, le casque est une boule plate en contre-jour, c'est-à-dire dans
          la moitié des situations de cette carte. */}
      <mesh position={[0, 0.04, 0]} scale={[0.85, 0.5, 0.95]}>
        <sphereGeometry args={[0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.32]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>

      {/*
        La jupe du casque : un cylindre ouvert, évasé, qui coiffe la nuque.

        **Elle est ouverte sur le devant**, et ce n'est pas un détail de
        géométrie : montée en cylindre complet, elle entourait le visage à
        hauteur de menton et **cachait entièrement le masque** — le personnage
        n'avait plus qu'une tête noire et lisse, le triangle du nez et la grille
        d'acier étant à l'intérieur du volume. Constaté en capture, corrigé ici.
        C'est le même secteur d'angle que la capuche du Dieu Démon, pour une
        raison différente : chez elle, l'ouverture montre le visage ; ici, elle
        montre l'appareil.
      */}
      <mesh castShadow position={[0, -0.235, -0.015]}>
        <cylinderGeometry
          args={[0.295, 0.345, 0.2, 16, 1, true, HELM_OPEN, Math.PI * 2 - 2 * HELM_OPEN]}
        />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} side={DoubleSide} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {/* Le liseré d'acier qui ferme la jupe par le bas. Même rôle que le
          gorgerin du Dieu Démon : sans lui, la pièce se termine sur une tranche
          d'épaisseur nulle et disparaît sous tout angle rasant. Il suit le même
          secteur que la jupe, sans quoi il repasserait devant le masque que
          celle-ci vient de dégager. */}
      <mesh position={[0, -0.33, -0.015]} rotation={[Math.PI / 2, 0, -HELM_OPEN]}>
        <torusGeometry
          args={[0.342, 0.016, 4, 22, Math.PI * 2 - 2 * HELM_OPEN]}
        />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
      </mesh>

      {/* Les deux joues, en biais. */}
      {[0.245, -0.245].map((x) => (
        <mesh
          key={x}
          castShadow
          position={[x, -0.25, 0.045]}
          rotation={[0, 0, x > 0 ? -0.16 : 0.16]}
        >
          <boxGeometry args={[0.095, 0.24, 0.24]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}

      {/* La masse de nuque, qui comble l'écart entre le casque et le col. Même
          pièce que sous la capuche du Dieu Démon, et même raison : sans elle, on
          voit le crâne nu par l'arrière dès que la tête se tourne. */}
      <mesh castShadow position={[0, -0.26, -0.09]} scale={[1, 0.8, 0.82]}>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
      </mesh>
    </>
  )
}

/**
 * Épée tenue dans la main droite.
 *
 * Au repos, la lame pointe vers le haut, légèrement inclinée vers l'arrière :
 * c'est la pose "dégainée" classique, et surtout c'est la seule qui reste
 * lisible de dos comme de face (pointée vers l'arrière, la lame disparaissait
 * dans le corps).
 *
 * L'épée vit dans le repère du bras : elle suit donc l'animation d'attaque
 * sans le moindre calcul supplémentaire.
 */
function Sword({ palette }: { palette: Palette }) {
  return (
    <group position={[-0.02, -0.28, 0.02]} rotation={[0.28, 0, -0.12]}>
      <mesh castShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[0.05, 0.16, 0.05]} />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
      </mesh>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[0.22, 0.04, 0.06]} />
        <meshToonMaterial color={palette.guard} gradientMap={toonGradient} />
      </mesh>
      <mesh castShadow position={[0, 0.48, 0]}>
        <boxGeometry args={[0.075, 0.58, 0.025]} />
        <meshToonMaterial color={palette.blade} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, 0.81, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.053, 0.1, 4]} />
        <meshToonMaterial color={palette.blade} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/**
 * Katana de Kusanagi.
 *
 * Même point d'attache et même repère que l'épée de base : il vit dans celui du
 * bras et suit donc l'animation d'attaque sans un calcul de plus. Trois choses
 * seulement le distinguent, et chacune sert la lecture à distance :
 *
 *  - **la lame fait 1,08 contre 0,68**, soit une demi-tête du personnage de plus
 *    au-dessus de l'épaule. C'est le minimum pour que la différence se voie en
 *    plongée de 17° — un allongement de vingt centimètres se lisait comme une
 *    erreur de proportion, pas comme une autre arme ;
 *  - **la garde est un disque et non une croix.** C'est elle qui dit « katana »
 *    d'un seul coup d'œil, avant même la longueur ;
 *  - **la lame est légèrement inclinée en arrière du manche.** Une courbure
 *    véritable demanderait une géométrie dédiée pour un gain nul à cette taille ;
 *    deux segments à peine désaxés suffisent à casser l'axe droit de l'épée.
 *
 * Attention à la portée : ce katana est plus long **à l'écran** seulement. La
 * hitbox reste celle d'`ATTACK` — la traînée de `StrikeArc` est une géométrie
 * construite une fois pour toutes à partir de `ATTACK.reach`, et la faire varier
 * avec l'arme demanderait de la reconstruire à chaque équipement. Ce que l'objet
 * change, ce sont les dégâts.
 */
/* --- Le Roi ---------------------------------------------------------------- */

/**
 * Buste du septième skin — une carapace, et **la queue**.
 *
 * C'est la première silhouette du casting qui ne porte rien : ce qu'on prend
 * pour une armure *est* le corps. Le tronc est donc bâti en plaques qui se
 * recouvrent — trois segments de poitrine, une rainure abdominale, deux
 * épaulières de chitine — et non en pièces de tissu posées dessus.
 *
 * **La queue est ce qui vend le personnage**, et elle est la seule pièce du jeu
 * qui sorte du volume du rig vers l'arrière. C'est délibéré : à vingt-et-une
 * unités de recul, les six autres skins se distinguent par la largeur de leurs
 * épaules et la masse de leur tête, deux endroits déjà très chargés. Celui-ci
 * se reconnaît **à ce qui dépasse derrière lui**, ce qu'aucun autre ne fait.
 *
 * Elle est composée en dur segment par segment plutôt qu'en boucle, pour la
 * même raison que les pans de la cape de Vador : chacun a sa propre inclinaison
 * et son propre rétrécissement, et une courbe régulière se lirait comme un
 * tuyau. Le dard, lui, est la seule valeur claire de tout le personnage avec le
 * regard — et il est à l'autre bout du corps, ce qui fait lire la longueur de
 * l'animal.
 */
function KingTorso({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Le tronc : un cylindre franchement conique, épaules larges et taille
          étroite. C'est la carrure d'un insecte, pas celle d'un homme habillé. */}
      <mesh castShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.24, 0.185, 0.6, 14]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Les trois plaques pectorales, qui se recouvrent du haut vers le bas.
          L'écart de rayon entre elles (0,015) est ce qui fait voir le
          recouvrement : à rayon égal elles forment un tube lisse. */}
      {[
        { y: 0.5, r: 0.245 },
        { y: 0.41, r: 0.23 },
        { y: 0.32, r: 0.215 },
      ].map((plate) => (
        <mesh key={plate.y} castShadow position={[0, plate.y, 0.01]}>
          <cylinderGeometry args={[plate.r, plate.r - 0.012, 0.075, 14]} />
          <meshToonMaterial color={palette.trouser} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}

      {/* La rainure abdominale : la seule ligne claire du tronc, et ce qui dit
          que ce ventre est segmenté plutôt que moulé d'un bloc. */}
      {[0.19, 0.12, 0.05].map((y) => (
        <mesh key={y} position={[0, y, 0.15]}>
          <boxGeometry args={[0.2 - (0.19 - y) * 0.3, 0.035, 0.07]} />
          <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Les deux épaulières de chitine. Pointues et tournées vers l'arrière :
          une épaulière ronde aurait donné une armure, et il n'en porte pas. */}
      {[1, -1].map((side) => (
        <mesh
          key={side}
          castShadow
          position={[side * 0.215, 0.5, -0.02]}
          rotation={[0.3, 0, side * -0.4]}
        >
          <coneGeometry args={[0.105, 0.22, 5]} />
          <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}

      <KingTail palette={palette} />
    </>
  )
}

/**
 * La queue — six segments décroissants et un dard.
 *
 * Elle part du bas du dos, descend, puis se relève : c'est ce relèvement qui la
 * fait lire comme une queue **portée** plutôt que traînée, et qui la garde dans
 * le cadre d'une caméra qui plonge de dix-sept degrés. Une queue qui traîne au
 * sol serait cachée par le corps à cet angle.
 *
 * Les segments sont posés un par un et non déroulés en boucle : chacun a son
 * inclinaison et son rétrécissement propres, et une progression régulière se
 * lirait comme un tuyau d'arrosage.
 */
function KingTail({ palette }: { palette: Palette }) {
  const segments = [
    { position: [0, 0.06, -0.19] as const, rotation: [0.9, 0, 0] as const, r: 0.075, h: 0.2 },
    { position: [0, -0.02, -0.34] as const, rotation: [1.3, 0, 0] as const, r: 0.066, h: 0.2 },
    { position: [0, -0.05, -0.51] as const, rotation: [1.62, 0, 0] as const, r: 0.058, h: 0.2 },
    { position: [0, -0.01, -0.68] as const, rotation: [1.9, 0, 0] as const, r: 0.05, h: 0.2 },
    { position: [0, 0.09, -0.81] as const, rotation: [2.25, 0, 0] as const, r: 0.042, h: 0.19 },
    { position: [0, 0.23, -0.88] as const, rotation: [2.7, 0, 0] as const, r: 0.034, h: 0.17 },
  ]

  return (
    <group position={[0, 0.16, 0]}>
      {segments.map((segment, i) => (
        <mesh
          key={i}
          castShadow
          position={segment.position}
          rotation={segment.rotation}
        >
          <cylinderGeometry args={[segment.r * 0.82, segment.r, segment.h, 8]} />
          <meshToonMaterial
            color={i % 2 ? palette.gear : palette.trouser}
            gradientMap={toonGradient}
          />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}

      {/* Le dard. Il pointe vers l'avant par-dessus l'épaule, et c'est ce qui
          transforme la queue en menace plutôt qu'en appendice. */}
      <mesh castShadow position={[0, 0.37, -0.88]} rotation={[-0.5, 0, 0]}>
        <coneGeometry args={[0.042, 0.19, 6]} />
        <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
    </group>
  )
}

/**
 * Visage du Roi — deux yeux cramoisis, et rien d'autre.
 *
 * C'est le seul endroit vivant de toute la silhouette : le reste est de la
 * chitine. Le masque de Vador fait exactement l'inverse — ses lentilles sont
 * éteintes, et tout son effet tient à ce qu'elles ne rendent rien.
 *
 * Les yeux sont **grands et rapprochés**, et sans blanc. Un œil humain posé sur
 * un crâne d'insecte se lit comme un costume ; une amande pleine qui occupe le
 * quart de la face se lit comme un animal.
 */
function KingFace({ palette }: { palette: Palette }) {
  return (
    <group>
      {/* Les deux amandes. `meshBasicMaterial` : elles ne doivent pas s'assombrir
          dans l'ombre du front, faute de quoi le seul point vivant du
          personnage s'éteint dès qu'il se tourne. */}
      {[1, -1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.072, 0.03, 0.148]}
          rotation={[0, 0, side * 0.34]}
          scale={[1, 0.62, 1]}
        >
          <sphereGeometry args={[0.052, 10, 8]} />
          <meshBasicMaterial color={palette.eye} />
        </mesh>
      ))}

      {/* L'arête frontale, qui descend entre les deux yeux : elle les sépare, et
          c'est elle qui empêche la face d'être un dôme lisse. */}
      <mesh castShadow position={[0, 0.07, 0.15]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.038, 0.16, 0.055]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>

      {/* La bouche : une fente, pas des lèvres. */}
      <mesh position={[0, -0.075, 0.152]}>
        <boxGeometry args={[0.085, 0.016, 0.02]} />
        <meshToonMaterial color={palette.scar} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/**
 * La crête du Roi — deux cornes qui se rejoignent en couronne.
 *
 * Elles balaient vers l'arrière et vers le haut, comme les ailes du heaume de
 * Malenia et pour la même raison : à vingt-et-une unités, c'est la **largeur
 * au-dessus des épaules** qui fait reconnaître une silhouette de dos. Les trois
 * lames de chaque côté sont d'inégale longueur — trois lames égales font un
 * peigne, et un peigne n'est pas une couronne.
 *
 * Elle est classée en `headwear`, donc elle traîne d'un pas derrière le
 * mouvement (voir `Skin`). Son ressort est réglé bas : c'est de l'os soudé au
 * crâne, pas une masse de cheveux.
 */
function KingCrest({ palette }: { palette: Palette }) {
  return (
    <group>
      {/* La calotte, qui prolonge le crâne vers l'arrière en pointe. */}
      <mesh castShadow position={[0, 0.06, -0.04]} scale={[1, 0.86, 1.25]}>
        <sphereGeometry args={[0.152, 14, 11]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {[1, -1].map((side) =>
        [0.3, 0.24, 0.18].map((length, i) => (
          <mesh
            key={`${side}-${i}`}
            castShadow
            position={[side * (0.055 + i * 0.038), 0.13 - i * 0.045, -0.05 - i * 0.02]}
            rotation={[-0.55 - i * 0.18, side * -0.24, side * (0.3 + i * 0.16)]}
          >
            <coneGeometry args={[0.031, length, 5]} />
            <meshToonMaterial
              color={i % 2 ? palette.hair : palette.gear}
              gradientMap={toonGradient}
            />
            <Outlines thickness={OUTLINE} color={palette.outline} />
          </mesh>
        )),
      )}
    </group>
  )
}

/* --- Le Voleur ------------------------------------------------------------- */

/**
 * Buste du huitième skin — un manteau long, et **une fourrure**.
 *
 * Le manteau est aussi sombre que celui de Vador, et il a fallu le régler
 * contre lui : deux silhouettes noires à vingt-et-une unités seraient la même.
 * Ce qui les sépare est la fourrure, presque blanche, qui double la largeur des
 * épaules et n'a aucun équivalent dans le casting. Vador se lit par son
 * plastron rouge **au centre** du corps ; celui-ci par une bande claire **tout
 * en haut**. Les deux repères ne peuvent pas se confondre.
 *
 * Le manteau s'évase comme la cape de Vador et pour la même raison — un bord
 * parallèle fait un rideau — mais il est **fermé devant** là où celle-ci est un
 * secteur ouvert : c'est un vêtement porté, pas une étoffe accrochée aux
 * épaules.
 */
function ThiefTorso({ palette }: { palette: Palette }) {
  return (
    <>
      {/* Le corps du manteau. */}
      <mesh castShadow position={[0, 0.29, 0]}>
        <cylinderGeometry args={[0.225, 0.275, 0.62, 16]} />
        <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Les pans, qui descendent sous la ceinture et s'évasent. Fendus devant
          et derrière comme le tablier de Vador : c'est la fente qui laisse voir
          les jambes à la course, sans quoi le bas du corps est une cloche. */}
      {[0.14, -0.14].map((z) => (
        <mesh key={z} castShadow position={[0, -0.12, z]} rotation={[z > 0 ? 0.06 : -0.06, 0, 0]}>
          <boxGeometry args={[0.38, 0.34, 0.06]} />
          <meshToonMaterial color={palette.garment} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}

      {/* La ceinture, sobre : elle marque la taille sans attirer l'œil, qui doit
          monter à la fourrure. */}
      <mesh castShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.272, 0.278, 0.07, 16]} />
        <meshToonMaterial color={palette.belt} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      <ThiefFur palette={palette} />
    </>
  )
}

/**
 * La fourrure du col — **la pièce qui fait la silhouette**.
 *
 * Neuf touffes réparties sur un tore, de tailles inégales. L'inégalité est tout
 * l'effet : neuf sphères identiques font un collier de perles, et il faut que ça
 * lise comme de la fourrure ébouriffée. Les tailles suivent un motif fixe et non
 * un tirage — le personnage doit être le même d'une partie à l'autre.
 *
 * Elle est **plus large que les épaules** (0,3 contre 0,24 de pivot), ce qui est
 * exactement ce qu'on lui demande : c'est la seule chose de cette tenue qui
 * dépasse, et donc la seule qui la distingue d'une masse noire.
 */
function ThiefFur({ palette }: { palette: Palette }) {
  const tufts = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  return (
    <group position={[0, 0.575, -0.01]}>
      {/* L'assise du col, sous les touffes : sans elle, on voit le cou entre
          deux boules de fourrure au moindre pivot. */}
      <mesh castShadow>
        <cylinderGeometry args={[0.2, 0.225, 0.11, 14]} />
        <meshToonMaterial color={palette.gearTrim} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {tufts.map((i) => {
        const angle = (i / tufts.length) * Math.PI * 2
        // Trois tailles qui alternent selon un motif de période 3 décalée : le
        // tour du col ne compte pas un multiple de trois touffes, donc le motif
        // ne se referme pas sur lui-même et ne se lit jamais comme une répétition.
        const size = [0.105, 0.082, 0.094][i % 3]
        return (
          <mesh
            key={i}
            castShadow
            position={[Math.sin(angle) * 0.2, 0.03 + (i % 2) * 0.022, Math.cos(angle) * 0.2]}
            scale={[1, 0.86, 1]}
          >
            <dodecahedronGeometry args={[size, 0]} />
            <meshToonMaterial color={palette.gear} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={palette.outline} />
          </mesh>
        )
      })}
    </group>
  )
}

/**
 * Visage du Voleur — pâle, et **la croix inversée au front**.
 *
 * C'est le seul personnage du jeu dont le visage soit franchement plus clair que
 * sa tenue, et c'est le second écart qui le sépare de Vador : celui-ci n'a pas
 * de visage du tout.
 *
 * La croix est posée **ici et non dans la coiffe**, et la nuance compte : la
 * coiffe traîne d'un pas derrière le mouvement (voir `Skin`), et un tatouage qui
 * glisse sur un front est un autocollant. Il appartient au crâne.
 */
function ThiefFace({ palette }: { palette: Palette }) {
  return (
    <group>
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * 0.062, 0.012, 0.145]} scale={[1, 0.72, 1]}>
          <sphereGeometry args={[0.028, 9, 7]} />
          <meshBasicMaterial color={palette.eye} />
        </mesh>
      ))}

      {/* La croix inversée : la barre longue verticale, la courte en travers et
          **en bas**, ce qui est tout ce qui distingue cette croix d'une autre. */}
      <mesh position={[0, 0.115, 0.146]}>
        <boxGeometry args={[0.022, 0.095, 0.012]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>
      <mesh position={[0, 0.085, 0.147]}>
        <boxGeometry args={[0.058, 0.021, 0.012]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/**
 * La coiffe du Voleur — des cheveux noirs plaqués en arrière.
 *
 * Volontairement plate et près du crâne : c'est le contraire de la crinière du
 * clan, qui descend aux reins et qui est *sa* signature. Deux masses de cheveux
 * longues auraient rendu les deux silhouettes cousines de dos.
 *
 * Elle laisse le front **découvert**, sans quoi la croix disparaîtrait — et la
 * croix est la moitié de ce qui rend ce personnage reconnaissable.
 */
function ThiefHair({ palette }: { palette: Palette }) {
  return (
    <group>
      {/* La calotte, reculée de trois centimètres : c'est ce recul qui dégage le
          front. */}
      <mesh castShadow position={[0, 0.035, -0.03]} scale={[1, 0.92, 1.1]}>
        <sphereGeometry args={[0.155, 14, 11]} />
        <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Trois mèches plaquées vers l'arrière, d'inégale longueur. Elles
          dépassent de la nuque et donnent au crâne une direction — une calotte
          seule est une casquette. */}
      {[-1, 0, 1].map((x) => (
        <mesh
          key={x}
          castShadow
          position={[x * 0.06, 0.02 - Math.abs(x) * 0.015, -0.14]}
          rotation={[0.42, 0, x * 0.12]}
        >
          <boxGeometry args={[0.062, 0.14 - Math.abs(x) * 0.028, 0.045]} />
          <meshToonMaterial color={palette.hair} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={palette.outline} />
        </mesh>
      ))}
    </group>
  )
}

function Katana({ palette }: { palette: Palette }) {
  return (
    <group position={[-0.02, -0.3, 0.02]} rotation={[0.24, 0, -0.1]}>
      {/* Poignée longue, prise à deux mains, et sa ligature. */}
      <mesh castShadow position={[0, 0.11, 0]}>
        <boxGeometry args={[0.05, 0.26, 0.05]} />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
      </mesh>
      {[0.04, 0.11, 0.18].map((y) => (
        <mesh key={y} castShadow position={[0, y, 0]}>
          <boxGeometry args={[0.062, 0.03, 0.062]} />
          <meshToonMaterial color={palette.cord} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Tsuba : le disque de garde, à plat. */}
      <mesh castShadow position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.115, 0.115, 0.035, 12]} />
        <meshToonMaterial color={palette.guard} gradientMap={toonGradient} />
      </mesh>

      {/* Lame, en deux tronçons à peine désaxés. Le contour n'est posé que sur
          le premier : deux contours qui se croisent au raccord font une arête
          noire en travers de la lame. */}
      <mesh castShadow position={[0, 0.63, -0.015]} rotation={[0.045, 0, 0]}>
        <boxGeometry args={[0.055, 0.72, 0.028]} />
        <meshToonMaterial color={palette.blade} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      <mesh castShadow position={[0, 1.15, -0.05]} rotation={[0.11, 0, 0]}>
        <boxGeometry args={[0.052, 0.34, 0.026]} />
        <meshToonMaterial color={palette.blade} gradientMap={toonGradient} />
      </mesh>
      {/* Kissaki : la pointe, coupée en biais comme celle d'un vrai katana. */}
      <mesh castShadow position={[0, 1.36, -0.073]} rotation={[0.11, 0, Math.PI]}>
        <coneGeometry args={[0.037, 0.13, 4]} />
        <meshToonMaterial color={palette.blade} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/** Acier de la lame maudite : sombre et mat, il ne renvoie rien. */
const CURSED_STEEL = '#2e2630'
/** Le fil, et lui seul. C'est la seule chose qui brille sur cette arme. */
const CURSED_EDGE = '#b03a3a'

/**
 * Lame maudite.
 *
 * Elle doit se distinguer du katana **en une image**, parce que les deux se
 * portent au même emplacement et s'excluent : le joueur qui ouvre son
 * inventaire doit savoir laquelle il a au poing sans lire l'étiquette. Trois
 * écarts s'en chargent, et ils vont tous dans le même sens — celui d'une arme
 * plus courte et plus brutale :
 *
 *  - **la longueur.** 0,62 contre 1,06 pour le katana, poignée comprise. C'est
 *    une lame qu'on tient à une main, et la silhouette le dit de loin ;
 *  - **la teinte.** Un acier presque noir au lieu du blanc bleuté, avec le
 *    seul fil en rouge sourd. Une lame claire à ébréchures se serait lue comme
 *    un katana abîmé, pas comme une autre arme ;
 *  - **les ébréchures.** Trois encoches taillées dans le dos, à des hauteurs
 *    inégales : régulières, elles auraient fait une scie, donc un outil.
 *
 * Pas de tsuba : la garde est une simple barre droite. Le disque est la
 * signature du katana, et la lui reprendre aurait annulé les trois écarts
 * ci-dessus.
 */
function CursedBlade({ palette }: { palette: Palette }) {
  return (
    <group position={[-0.02, -0.28, 0.02]} rotation={[0.2, 0, -0.08]}>
      {/* Poignée courte, à une main, ligaturée serré. */}
      <mesh castShadow position={[0, 0.09, 0]}>
        <boxGeometry args={[0.052, 0.19, 0.052]} />
        <meshToonMaterial color={palette.grip} gradientMap={toonGradient} />
      </mesh>
      {[0.03, 0.09, 0.15].map((y) => (
        <mesh key={y} castShadow position={[0, y, 0]}>
          <boxGeometry args={[0.064, 0.025, 0.064]} />
          <meshToonMaterial color={CURSED_STEEL} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Garde : une barre droite, pas un disque. */}
      <mesh castShadow position={[0, 0.2, 0]}>
        <boxGeometry args={[0.2, 0.035, 0.07]} />
        <meshToonMaterial color={CURSED_STEEL} gradientMap={toonGradient} />
      </mesh>

      {/* Lame, large et courte. Même discipline que le katana : le contour
          n'est posé que sur le tronçon principal, sinon deux contours se
          croisent au raccord et tracent une arête noire en travers. */}
      <mesh castShadow position={[0, 0.46, -0.01]} rotation={[0.03, 0, 0]}>
        <boxGeometry args={[0.078, 0.5, 0.03]} />
        <meshToonMaterial
          color={CURSED_STEEL}
          gradientMap={toonGradient}
          emissive={CURSED_EDGE}
          emissiveIntensity={0.18}
        />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>

      {/* Le fil, plaqué sur la tranche : une fine lamelle rouge, la seule chose
          qui accroche la lumière sur toute l'arme. */}
      <mesh position={[0.04, 0.46, -0.01]}>
        <boxGeometry args={[0.012, 0.5, 0.032]} />
        <meshToonMaterial
          color={CURSED_EDGE}
          gradientMap={toonGradient}
          emissive={CURSED_EDGE}
          emissiveIntensity={0.7}
        />
      </mesh>

      {/* Trois ébréchures, taillées dans le dos à hauteurs inégales. Ce sont
          des creux de la couleur du décor derrière : à cette échelle, un vrai
          trou dans la géométrie aurait coûté une découpe pour un pixel. */}
      {[0.3, 0.47, 0.63].map((y, index) => (
        <mesh key={y} position={[-0.038, y, -0.01]} rotation={[0, 0, 0.5 - index * 0.2]}>
          <boxGeometry args={[0.026, 0.038, 0.034]} />
          <meshToonMaterial color={palette.outline} gradientMap={toonGradient} />
        </mesh>
      ))}

      {/* Pointe coupée droit, presque carrée : la lame est brisée net, pas
          effilée. */}
      <mesh castShadow position={[0, 0.73, -0.008]}>
        <boxGeometry args={[0.07, 0.06, 0.03]} />
        <meshToonMaterial color={CURSED_STEEL} gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

/**
 * Teintes de la lame de lumière, **hors palette**.
 *
 * C'est le second objet du jeu à faire ça, après la lame maudite, et pour la
 * même raison : ces trois teintes appartiennent à l'**arme**, pas à celui qui la
 * porte. Un fil rouge qui virerait au vert sur la tenue du bretteur ne serait
 * plus le fil de cette lame-là. La poignée, elle, aurait pu suivre la palette —
 * elle ne le fait pas non plus, parce qu'une garde dorée sous une lame de
 * lumière écarlate fait un objet de deux époques.
 *
 * Le cœur est presque blanc et le halo franchement rouge : c'est ce **dégradé
 * du centre vers le bord** qui fait lire une source de lumière plutôt qu'un
 * bâton peint. Une lame rouge uniforme avait été essayée d'abord ; elle se
 * lisait comme un néon de fête foraine.
 */
const SABER_CORE = '#ffe2df'
const SABER_GLOW = '#ff2f27'
const SABER_HILT = '#b9c0cc'
const SABER_GRIP = '#15171d'

/**
 * Lame de Lumière Écarlate.
 *
 * Même point d'attache et même repère que les trois autres armes : elle vit
 * dans celui du bras et suit donc l'animation d'attaque sans un calcul de plus.
 * Ce qui la sépare des trois autres tient en deux choses, et les deux sont des
 * conséquences d'une seule idée — **ce n'est pas de l'acier, c'est de la
 * lumière** :
 *
 *  - **rien n'est cel-shadé au-dessus de la poignée.** Les trois autres lames
 *    passent par `meshToonMaterial` et par le contour d'`Outlines`, qui les
 *    inscrivent dans le monde ; celle-ci est rendue en `meshBasicMaterial`,
 *    c'est-à-dire sans éclairage du tout. Elle garde donc exactement la même
 *    intensité à l'ombre d'une montagne qu'en plein soleil — ce qu'on attend
 *    d'un objet qui **émet** au lieu de recevoir. C'est la règle des yeux du
 *    Lynel et du regard du Dieu Démon, appliquée à une arme entière ;
 *  - **elle est doublée d'un halo**, un second cylindre à peine plus large,
 *    translucide et sans écriture de profondeur. C'est lui qui donne l'épaisseur
 *    lumineuse, et le `depthWrite` désactivé est ce qui l'empêche de découper un
 *    trou dans ce qui passe derrière — même discipline que la traînée de
 *    `StrikeArc`.
 *
 * Deux capsules et non deux cylindres : une lame de lumière est arrondie aux
 * deux bouts, et une pointe conique en aurait refait une épée.
 *
 * Attention à la portée, comme pour le katana : cette lame est plus longue **à
 * l'écran** seulement. La hitbox reste celle d'`ATTACK`. Ce que l'objet change,
 * ce sont les dégâts.
 */
function Saber({ palette }: { palette: Palette }) {
  return (
    /*
      Le seul lacet de la série qui penche **vers l'extérieur** (+0,18 là où les
      trois lames d'acier sont à −0,11), et c'est la conséquence d'un défaut
      mesuré : la tenue du Seigneur Noir porte un casque de 0,30 de rayon quand
      le crâne nu du rig n'en fait que 0,26, et une arme dressée dans l'axe du
      bras passait **derrière la tête** — la moitié basse de la lame
      disparaissait dans le casque au repos, c'est-à-dire dans la pose qu'on
      voit le plus. Penchée de dix degrés vers le dehors, elle sort du profil du
      casque sur toute sa longueur.

      Les trois autres armes gardent leur lacet : elles sont portées par des
      skins dont la pièce de tête ne déborde pas, et c'est la lame qui s'écarte
      pour le casque, jamais le rig qui bouge pour une arme.
    */
    <group position={[-0.02, -0.28, 0.02]} rotation={[0.3, 0, 0.18]}>
      {/* Poignée : un cylindre d'acier, deux bagues noires, et le pommeau. Elle
          est plus courte que celle du katana et plus longue que celle de la lame
          maudite — elle se tient à une main, mais il y a de quoi la reprendre à
          deux. */}
      <mesh castShadow position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.033, 0.036, 0.24, 10]} />
        <meshToonMaterial color={SABER_HILT} gradientMap={toonGradient} />
        <Outlines thickness={OUTLINE} color={palette.outline} />
      </mesh>
      {[0.04, 0.13].map((y) => (
        <mesh key={y} castShadow position={[0, y, 0]}>
          <cylinderGeometry args={[0.038, 0.038, 0.045, 10]} />
          <meshToonMaterial color={SABER_GRIP} gradientMap={toonGradient} />
        </mesh>
      ))}
      <mesh castShadow position={[0, -0.03, 0]}>
        <cylinderGeometry args={[0.038, 0.032, 0.035, 10]} />
        <meshToonMaterial color={SABER_GRIP} gradientMap={toonGradient} />
      </mesh>

      {/* L'émetteur : la bague large d'où sort la lame. C'est la seule pièce qui
          dise où finit l'objet et où commence la lumière. */}
      <mesh castShadow position={[0, 0.235, 0]}>
        <cylinderGeometry args={[0.042, 0.038, 0.045, 10]} />
        <meshToonMaterial color={SABER_HILT} gradientMap={toonGradient} />
      </mesh>
      {/* Le témoin rouge de la poignée : trois millimètres que personne ne verra
          courir dans l'herbe, mais le coffre présente l'objet en gros plan, et
          c'est là qu'il paie. Même raison que l'anneau de l'Aube au pouce. */}
      <mesh position={[0, 0.17, 0.037]}>
        <boxGeometry args={[0.018, 0.03, 0.012]} />
        <meshBasicMaterial color={SABER_GLOW} />
      </mesh>

      {/* Le cœur de la lame, presque blanc. */}
      <mesh position={[0, 0.79, 0]}>
        <capsuleGeometry args={[0.026, 1, 4, 10]} />
        <meshBasicMaterial color={SABER_CORE} />
      </mesh>
      {/* Le halo, un peu plus large et translucide. */}
      <mesh position={[0, 0.79, 0]}>
        <capsuleGeometry args={[0.052, 1, 4, 12]} />
        <meshBasicMaterial color={SABER_GLOW} transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  )
}
