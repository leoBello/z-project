import { FEET_TO_CENTER } from './capsule'
import { groundAt, islandNoise, rimRadius } from './skyIsland'
import { smoothstep } from './world'

/**
 * La Montagne de l'Ouest — la voie qui y mène, et son relief.
 *
 * Même discipline que `config/skyIsland.ts`, et pour la même raison : c'est de
 * l'arithmétique pure, sans état, sans `three`, sans rien du reste du jeu. La
 * silhouette lointaine — qui vit dans le tronc commun — s'en sert, comme la
 * minimap ; si ce module traînait un import du fragment de l'île, la montagne
 * entrerait dans le bundle d'accueil pour deux cônes et un pont.
 *
 * **Elle a son propre repère, et ce n'est pas une facilité.** Tout le relief de
 * l'île est polaire autour de son centre, et la montagne est à quatre-vingt-huit
 * unités de là : dans ce repère-là, sa base de vingt-quatre unités de rayon ne
 * couvre que 0,55 radian, et le chemin qui la gravit — six unités de large —
 * n'en couvre que 0,07. Le maillage de collision de l'île échantillonne 0,065
 * radian par secteur ; le chemin y aurait tenu dans **un seul secteur**, c'est-à-
 * dire qu'il n'aurait pas existé pour la physique. La montagne est donc une
 * surface à elle, polaire autour de son propre centre, où le même chemin occupe
 * trois secteurs et demi.
 *
 * Trois pièces, et une seule question à chacune :
 *  - la **voie** (`DECK_*`), un pont horizontal qui sort de l'île plein ouest ;
 *  - la **porte** (`GATE_*`), deux tours et la herse qui ferme la voie tant que
 *    l'épreuve des trois Lynels n'est pas accomplie ;
 *  - la **montagne** (`MOUNT_*`), un cône entaillé d'une rampe en spire, et un
 *    plateau au sommet qui est l'arène du Lynel doré.
 */

// --- Le cap ------------------------------------------------------------------

/**
 * Nord-ouest, et le cap est une **conséquence de la caméra**, pas un goût.
 *
 * Elle est fixe et regarde le nord. Le premier jet posait la voie plein ouest,
 * ce qui semblait la lecture littérale de « à gauche de l'île » — et c'était
 * injouable pour deux raisons que seule une capture montre :
 *
 *  - une herse est un plan vertical en travers du chemin. Sur un chemin
 *    est-ouest, ce plan est **parallèle à l'axe de vue** : on n'en voit que la
 *    tranche, quelques barreaux de seize centimètres, et le joueur bloqué ne
 *    comprend pas par quoi ;
 *  - pire, la porte est encadrée de deux tours. Sur un chemin est-ouest, l'une
 *    des deux est **entre la caméra et la herse** et la masque entièrement.
 *
 * Trente degrés à l'ouest du nord règlent les deux : le plan de la herse n'est
 * plus qu'à trente degrés de la perpendiculaire à l'axe de vue — on en voit
 * 87 % de la largeur — et les deux tours se rangent de part et d'autre au lieu
 * de l'une devant l'autre. La montagne reste franchement à gauche : son centre
 * tombe à cinquante unités à l'ouest, au-delà de la lèvre de l'île.
 *
 * Elle entre en outre dans le cadre : vingt degrés hors de l'axe de vue, pour
 * un demi-champ horizontal de trente-six. Plein ouest, elle était à
 * quatre-vingt-dix, donc hors champ en permanence — le promontoire n'existait
 * pas tant qu'on n'allait pas buter dessus. Deux réserves mesurées, et il faut
 * les écrire plutôt que de laisser croire qu'on la voit en débarquant : le
 * panneau de navigation mange le cinquième gauche de l'écran, et surtout le
 * grand arbre pousse presque sur le même cap — depuis le point d'arrivée exact,
 * sa couronne la masque. Quelques pas vers l'ouest suffisent à la dégager, et
 * c'est de la prairie ouest qu'elle se découvre.
 *
 * Le cap se lit dans la convention polaire de l'île (`x = sin θ · r`,
 * `z = cos θ · r`) : zéro au sud, −π/2 à l'ouest, ±π au nord.
 */
export const SPUR_THETA = -2.62

/**
 * Le repère de la voie : son lacet, et les deux conversions qui vont avec.
 *
 * Toute la géométrie du promontoire est écrite dans un repère où **la voie part
 * vers les −X** — c'est ainsi qu'elle a été conçue et mesurée, et c'est
 * infiniment plus lisible qu'une suite de sinus recopiés. Le cap est appliqué
 * une seule fois, en bout de chaîne : par ce lacet sur les groupes qui portent
 * les maillages et les corps physiques, et par `spurToWorld` pour la poignée de
 * cotes qui doivent être en coordonnées monde — le poste du Lynel doré, sa
 * laisse, le portail du sommet.
 *
 * `worldToSpur` fait le chemin inverse, pour les deux consommateurs qui
 * partent d'un point du monde : la minimap, qui balaie des pixels, et le semis
 * de végétation, qui doit savoir s'il tire sous le pont.
 *
 * Le lacet est **dérivé du cap** et non écrit à côté : deux nombres qui disent
 * la même chose finiraient par ne plus la dire.
 */
export const SPUR_YAW = Math.atan2(Math.cos(SPUR_THETA), -Math.sin(SPUR_THETA))
const YAW_SIN = Math.sin(SPUR_YAW)
const YAW_COS = Math.cos(SPUR_YAW)

/** D'un point du repère de la voie vers le monde. */
export function spurToWorld(x: number, z: number) {
  return { x: x * YAW_COS + z * YAW_SIN, z: -x * YAW_SIN + z * YAW_COS }
}

/** Et l'inverse. */
export function worldToSpur(x: number, z: number) {
  return { x: x * YAW_COS - z * YAW_SIN, z: x * YAW_SIN + z * YAW_COS }
}

// --- La voie -----------------------------------------------------------------

/** Rayon auquel la voie quitte l'île, compté depuis son centre. */
const DECK_R0 = 43
/** Demi-largeur du tablier. Sept unités de large, parapets compris. */
export const DECK_HALF = 3.6
/** Le parapet : sa largeur, et sa hauteur au-dessus du tablier. */
export const PARAPET_W = 0.5
export const PARAPET_H = 0.75

/**
 * Altitude du tablier, relevée sur le sol réel de l'île.
 *
 * Elle est **mesurée et non écrite**, exactement comme celle des postes de
 * l'épreuve : la voie sort de la prairie, dont le relief de surface monte et
 * descend de quelques dizaines de centimètres, et un tablier posé sur une cote
 * moyenne s'enfoncerait d'un côté pour flotter de l'autre.
 *
 * On prend le **maximum** du sol sous l'emprise, et pas sa moyenne. Le tablier
 * est un solide horizontal : sous la moyenne, la moitié des bosses lui
 * passeraient au travers, et le joueur marcherait sur de l'herbe qui sort de la
 * pierre. Au-dessus du maximum, il ne reste qu'une marche — et elle est de
 * douze centimètres, ce qu'une capsule franchit sans s'en apercevoir.
 *
 * Le balayage porte sur les deux dimensions de l'emprise, rayon *et* cap : le
 * relief dépend des deux, et un balayage sur le seul axe central aurait manqué
 * les bosses des bords.
 */
export const DECK_Y = (() => {
  let top = -Infinity
  const rim = rimRadius(SPUR_THETA)
  for (let r = DECK_R0 - 3; r <= rim; r += 0.5) {
    // ±3,6 unités de part et d'autre de l'axe, convertis en écart de cap.
    for (const side of [-DECK_HALF, 0, DECK_HALF]) {
      top = Math.max(top, groundAt(r, SPUR_THETA + side / r).y)
    }
  }
  return top + 0.12
})()

// --- La montagne -------------------------------------------------------------

/**
 * Où se tient la montagne, et pourquoi exactement là.
 *
 * Cent unités du centre de l'île pour une base de vingt-quatre : son pied tombe
 * donc à soixante-seize, quand la lèvre de l'île en atteint cinquante-sept au
 * cap ouest. Il reste **dix-neuf unités de vide** entre les deux, et ce nombre
 * n'est pas un réglage esthétique : c'est lui qui rend la porte infranchissable
 * autrement que par la porte (voir `GATE_X`). Le premier jet en laissait sept,
 * ce qui ne suffisait pas.
 *
 * La reculer davantage coûterait ailleurs : la minimap doit tenir l'île **et**
 * la montagne dans un seul cadre carré (voir `ISLAND_MAP_SIZE`), et chaque
 * unité gagnée vers l'ouest rapetisse l'île d'autant.
 */
export const MOUNT_X = -100
export const MOUNT_Z = 0
/** Rayon de la base, et rayon du plateau sommital. */
export const MOUNT_BASE_R = 24
export const SUMMIT_R = 9.5
/** Hauteur du sommet au-dessus du tablier. */
export const MOUNT_H = 20
/** Profondeur du socle inversé, sous la base. Comme l'île, la montagne flotte. */
export const MOUNT_DEPTH = 26

/** Altitude du plateau, en coordonnées monde. */
export const SUMMIT_Y = DECK_Y + MOUNT_H

/**
 * Où la voie aborde la montagne.
 *
 * Une unité et demie **à l'intérieur** du pied : le tablier et la roche se
 * recouvrent, et il n'existe donc aucun cap où l'on puisse voir le joint entre
 * les deux. Un raccord bord à bord aurait suffi en théorie et ouvert une fente
 * au premier arrondi de flottant.
 */
export const DECK_X0 = -DECK_R0
export const DECK_X1 = MOUNT_X + MOUNT_BASE_R - 1.5

// --- La rampe en spire -------------------------------------------------------

/**
 * Cap de départ de la spire : l'est, c'est-à-dire l'axe de la voie.
 *
 * Le repère local de la montagne suit la même convention que celui de l'île —
 * `φ = atan2(dx, dz)`, donc zéro au sud et π/2 à l'est. La voie arrive plein
 * est, la spire part donc de π/2, et le joueur passe du pont au chemin sans
 * changer de direction.
 */
const RAMP_START = Math.PI / 2
/**
 * Balayage de la spire : trois quarts de tour.
 *
 * Il décide de la seule chose qui compte pour un chemin : sa **pente**. Vingt
 * unités à gravir pour un rayon moyen de dix-sept et trois quarts : trois
 * quarts de tour font quatre-vingt-quatre unités de développé. La montée est
 * **linéaire** en cap — pas un `smoothstep`, dont la dérivée culmine à une fois
 * et demie sa moyenne en son milieu, erreur qui avait rendu les rampes de l'île
 * infranchissables — mais le rayon se resserre en montant, donc la pente croît
 * un peu : 0,27 au pied, 0,36 au plus raide, mesuré le long de la ligne
 * médiane. Le seuil de praticabilité du continent est à 0,50.
 *
 * Un tour entier aurait donné une pente plus douce encore et un chemin qui se
 * recouvre lui-même : à la verticale d'un même cap, deux altitudes. Une surface
 * à hauteur unique ne peut pas le décrire — c'est exactement le reproche que
 * `skyIsland.ts` fait au champ de hauteurs du continent, et il vaut ici.
 */
const RAMP_SWEEP = Math.PI * 1.5
/**
 * Rayons de la ligne médiane du chemin, au pied et à son arrivée.
 *
 * Elle s'arrête à onze et demi, c'est-à-dire **deux unités en dehors du
 * plateau** et non sur sa lèvre. Menée jusqu'à neuf et demi, la spire venait
 * mourir dans le raccord qui protège le sommet (`shoulder`), et ce raccord lui
 * imposait un dévers : 2,3 d'écart sur les cinquante derniers centimètres du
 * chemin, mesuré, c'est-à-dire un mur en travers de la dernière marche. Deux
 * unités de dégagement suffisent à l'en sortir, et la spire se pose à plat sur
 * le plateau au lieu d'y grimper.
 */
const RAMP_R0 = MOUNT_BASE_R
const RAMP_R1 = 11.5
/**
 * Part du balayage au terme de laquelle la spire a fini de monter.
 *
 * Le dernier dixième est **plat**, à l'altitude du plateau. C'est le palier
 * d'arrivée : sans lui, le chemin monte encore au moment où il débouche, et le
 * joueur découvre l'arène en montant une marche. Avec lui, il arrive de
 * plain-pied et voit ce qui l'attend avant d'y entrer.
 */
const RAMP_TOP_FLAT = 0.9
/** Demi-largeur du chemin, et largeur de son raccord à la roche. */
const PATH_HALF = 3
const PATH_FEATHER = 1.6

/**
 * Tour complet, exprimé dans l'unité de la spire.
 *
 * Vaut 4/3 : au-delà de 1 on est dans le pan que la spire ne parcourt pas, large
 * de quatre-vingt-dix degrés, entre son arrivée au sud et son départ à l'est.
 */
const MAX_U = (Math.PI * 2) / RAMP_SWEEP

/**
 * Coordonnées polaires d'un point **du monde** dans le repère de la montagne.
 *
 * Deux changements de repère d'affilée — monde vers voie, puis voie vers
 * montagne — et c'est exprès qu'ils sont enchaînés ici plutôt que laissés à
 * l'appelant : la minimap et le semis de végétation n'ont aucune raison de
 * savoir que la voie a un cap.
 */
export function mountainLocal(worldX: number, worldZ: number) {
  const spur = worldToSpur(worldX, worldZ)
  const dx = spur.x - MOUNT_X
  const dz = spur.z - MOUNT_Z
  return { d: Math.hypot(dx, dz), phi: Math.atan2(dx, dz) }
}

/**
 * Le relief de la montagne, en un point de son repère polaire.
 *
 * Un cône, et une **entaille** en spire dedans. C'est bien une entaille et non
 * une corniche rapportée : un chemin de montagne se creuse dans le flanc, il a
 * un mur d'un côté et le vide de l'autre. Posé en saillie, il se lirait comme
 * une rampe d'accès de parking accrochée à un caillou.
 *
 * Trois corrections tiennent la formule, et chacune répare un défaut mesuré :
 *
 *  - **le plateau est protégé** (`shoulder`). Sans ça, la largeur du chemin
 *    déborde sur le sommet dans son dernier quart de tour et y creuse une
 *    cuvette de deux unités : l'arène du Lynel doré n'était plus plate ;
 *  - **le pan sans rampe retombe sur le départ de la spire** (`approach`).
 *    Sans ça, le raccord entre la fin du tour et son début ouvre une marche de
 *    deux unités — et elle court le long de l'axe `z = 0`, c'est-à-dire
 *    exactement là où le joueur débouche de la voie ;
 *  - **la spire arrive au pied à l'altitude du tablier** (`RAMP_R0` vaut le
 *    rayon de base, et non « un peu moins »). Le cône y vaut zéro, la spire
 *    aussi : le pont et la montagne se rejoignent sans marche, sans qu'aucune
 *    des deux cotes n'ait été écrite à la main.
 */
export function mountainHeight(d: number, phi: number) {
  const cone = MOUNT_H * (1 - smoothstep(SUMMIT_R, MOUNT_BASE_R, d))

  const turn = (phi - RAMP_START + Math.PI * 4) % (Math.PI * 2)
  let u = turn / RAMP_SWEEP
  let approach = 1
  if (u > 1) {
    // Le pan sans rampe : on y retombe doucement sur le départ de la spire,
    // ce qui fait de ce quart de tour le parvis de la voie plutôt qu'un mur.
    approach = smoothstep(1.02, MAX_U, u)
    u = 0
  }

  const shelfR = RAMP_R0 + u * (RAMP_R1 - RAMP_R0)
  const shelfY = Math.min(1, u / RAMP_TOP_FLAT) * MOUNT_H
  const shoulder = smoothstep(SUMMIT_R - 0.6, SUMMIT_R + 0.6, d)
  const w =
    (1 - smoothstep(PATH_HALF, PATH_HALF + PATH_FEATHER, Math.abs(d - shelfR))) *
    shoulder *
    approach

  return cone + (shelfY - cone) * w
}

/** Le même relief, en coordonnées monde. Le seul chemin pour y poser quoi que ce soit. */
export function mountainHeightAt(worldX: number, worldZ: number) {
  const { d, phi } = mountainLocal(worldX, worldZ)
  return DECK_Y + mountainHeight(d, phi)
}

/**
 * Le point est-il sous l'emprise de la voie, à `margin` près ?
 *
 * Le semis de végétation de l'île s'en sert, et il en avait besoin : entre le
 * départ du tablier et la lèvre, la voie passe **au-dessus de la prairie**, où
 * `Flora` sème bosquets et touffes sans rien savoir d'elle. Un arbre au travers
 * du pont n'est pas un défaut qu'on remarque en relisant le code — il faut le
 * voir. Il a été vu.
 *
 * L'emprise est prise dans le repère de la voie, donc c'est un rectangle : le
 * tablier est droit, il n'y a aucune raison de le tester autrement.
 */
export function nearCauseway(worldX: number, worldZ: number, margin: number) {
  const spur = worldToSpur(worldX, worldZ)
  return (
    spur.x <= DECK_X0 + margin &&
    spur.x >= DECK_X1 - margin &&
    Math.abs(spur.z) <= DECK_HALF + margin
  )
}

/**
 * Pente locale, mesurée par différences finies dans les deux directions.
 *
 * Radiale **et** tangentielle, contrairement à celle de l'île qui se contente de
 * la première. Sur un disque à terrasses concentriques, tout le dénivelé est
 * radial ; ici le chemin monte en tournant, et sa pente utile est justement
 * celle que la mesure radiale ne voit pas. Elle sert à colorer — dallage sur le
 * plat, roche nue sur les flancs — donc à dire au joueur où il peut marcher.
 */
/*
  Une note sur le glissement, parce qu'elle a coûté une demi-heure de fausse
  piste et qu'elle se reproduira.

  Posé sur la spire dans un test navigateur, le personnage **descend lentement**
  la pente au lieu d'y rester. Ce n'est ni le relief ni le collider : mesuré, il
  repose à un centimètre de la surface analytique tout au long de la montée.
  C'est que le joueur a une friction nulle (`frictionCombineRule: Min`, voir
  `Player.tsx`) et que sa vitesse horizontale est remise à zéro à **chaque
  image** — le glissement ne peut donc s'accumuler qu'à l'intérieur d'un pas de
  physique, et vaut `a / 2N` pour N images par seconde. À soixante images, c'est
  six centimètres par seconde ; à l'image par seconde du rendu logiciel, c'est
  quatre unités. Le test mesure donc une glissade que le jeu n'a pas — et la
  même chose vaut pour les rampes de l'île, plus raides encore.
*/
export function mountainSlope(d: number, phi: number) {
  const dr = Math.abs(mountainHeight(d + 0.6, phi) - mountainHeight(d - 0.6, phi)) / 1.2
  const step = 0.6 / Math.max(d, 1)
  const dt = Math.abs(mountainHeight(d, phi + step) - mountainHeight(d, phi - step)) / 1.2
  return Math.hypot(dr, dt)
}

/**
 * Altitude du **bord** de la montagne, en un cap donné.
 *
 * Même rôle que `rimHeight` pour l'île, et même piège : la spire relève le bord
 * d'une unité et demie sur une partie du pourtour, et coudre le socle sur une
 * cote écrite en dur y ouvrirait une fente par laquelle on verrait le ciel. La
 * seule cote juste est celle que la surface donne elle-même.
 */
export function mountRimHeight(phi: number) {
  return mountainHeight(MOUNT_BASE_R, phi)
}

/**
 * Le socle inversé, paramétré de 1 (le bord) à 0 (la pointe).
 *
 * Repris de l'île au profil près : `1 − t^0,55`, la masse large sous la lèvre
 * puis la pointe sur toute la moitié basse. Deux rochers volants de la même
 * civilisation ne se taillent pas autrement, et un cône droit donnerait une
 * toupie. Le bruit s'annule à `t = 1`, où la couture doit être exacte.
 */
export function mountUnderRadius(t: number, phi: number) {
  const crag = islandNoise(phi * 4.3 + 11, t * 7.7) * (1 - t) * 0.18
  return t * MOUNT_BASE_R * (1 + crag)
}

export function mountUnderHeight(t: number, phi: number) {
  const crag = islandNoise(phi * 4.3 + 11, t * 7.7) * (1 - t) * 0.18
  return mountRimHeight(phi) - MOUNT_DEPTH * (1 - Math.pow(t, 0.55)) + crag * 9
}

// --- La porte ----------------------------------------------------------------

/**
 * Où se dressent les deux tours : **au-delà de la lèvre de l'île**, sur le pont.
 *
 * C'est la correction d'un défaut qui rendait toute la porte décorative, et il
 * mérite d'être écrit parce qu'il se reproduira à la première porte suivante.
 * Les tours étaient plantées trois unités après le départ du tablier, donc en
 * pleine prairie : or **le sol de l'île ne s'arrête pas aux bords de la voie**.
 * Il suffisait de descendre du tablier, de longer la porte par l'herbe et de
 * remonter derrière. Une herse ne barre que sa propre largeur ; pour qu'elle
 * barre un passage, il faut qu'il n'existe aucun autre passage.
 *
 * Six unités et demie après la lèvre, c'est-à-dire au-dessus du vide, il n'y en
 * a plus aucun : sur le pont, les parapets ferment les flancs ; hors du pont,
 * il n'y a rien. Contourner la porte, c'est tomber. Et la distance est prise
 * **à la lèvre réelle** (`rimRadius`), qui ondule de cinq unités selon le cap —
 * un nombre écrit en dur aurait pu retomber sur l'île à un autre réglage du
 * contour.
 *
 * Six et demie, et pas deux : le point franchissable le plus proche est le bord
 * de l'île, et il faut que l'écart soit hors de portée d'un saut — surtout avec
 * un parapet d'une unité à franchir à l'arrivée.
 *
 * Elle reste visible du point de débarquement, à quatre-vingt-dix unités : deux
 * fûts de douze unités et demie se lisent de là, et c'est ce qui fait du
 * promontoire une promesse dès la première minute.
 */
const GATE_CLEAR = 6.5
export const GATE_X = -(rimRadius(SPUR_THETA) + GATE_CLEAR)
/** Écartement des tours, et leurs cotes. */
export const TOWER_Z = 5.2
export const TOWER_R = 2.6
export const TOWER_H = 12.5
/**
 * La travée fortifiée qui porte la porte, et les piles qui pendent sous elle.
 *
 * **Elle n'est pas plus large que le pont, et c'est une règle et non une
 * cote.** Le personnage saute 1,33 unité (8 de vitesse initiale pour 24 de
 * gravité) : un parapet de 1,0 se franchit donc, et tout mètre carré de dallage
 * situé **hors** des parapets est un contournement de la herse — il suffit d'y
 * sauter, de longer la porte et de resauter de l'autre côté. Une travée large
 * aurait mieux tenu les tours à l'œil et rouvert le trou qu'on vient de fermer.
 *
 * L'invariant tient donc en une phrase, et il vaut sur toute la longueur de la
 * voie : *hors des parapets, il n'y a rien où poser le pied*. Les tours
 * débordent, mais en encorbellement — sur des corbeaux, au-dessus du vide,
 * comme les échauguettes d'un vrai chemin de ronde.
 *
 * Elle reste plus longue que large (`BAY_HALF_X`), ce qui suffit à asseoir les
 * fûts et à donner de la masse à la porte vue de face.
 */
export const BAY_HALF_Z = DECK_HALF
export const BAY_HALF_X = TOWER_R + 1.4
export const PIER_DEPTH = 11

/**
 * La herse : sa largeur, sa hauteur, et de combien elle se lève.
 *
 * Le passage libre vaut 4,6 — au-dessus du gabarit d'arche de l'île (3,4), donc
 * infranchissable au saut tant qu'elle est baissée, et dégagé une fois levée.
 * Elle se lève d'un peu plus que sa propre hauteur : c'est la seule façon
 * qu'elle disparaisse **dans** la maçonnerie plutôt que de s'évaporer, et une
 * herse qui s'évapore n'a jamais pesé.
 */
export const GRILLE_W = 2 * TOWER_Z - 2 * TOWER_R
export const GRILLE_H = 4.6
export const GRILLE_LIFT = GRILLE_H + 0.2
/** Durée de la levée, en millisecondes de temps de jeu. */
export const GRILLE_OPEN_MS = 1600

// --- Le sommet ---------------------------------------------------------------

/**
 * Le poste du Lynel doré : le centre du plateau.
 *
 * Et non son bord : la bête revient à son poste entre deux engagements (voir
 * `RECENTER_RADIUS`), et un poste excentré l'aurait fait reculer contre le vide
 * à chaque fois que le joueur rompt — donc hors de portée d'un joueur qui, lui,
 * n'a nulle part où aller.
 */
export const MOUNT_WORLD = spurToWorld(MOUNT_X, MOUNT_Z)
export const SUMMIT_CENTER: [number, number, number] = [
  MOUNT_WORLD.x,
  SUMMIT_Y,
  MOUNT_WORLD.z,
]

/**
 * Recul de l'anneau depuis le centre du plateau, vers le nord de la voie.
 *
 * Nommé plutôt qu'écrit deux fois : le point d'arrivée du retour se mesure
 * depuis l'anneau, donc depuis ce nombre-là. Deux littéraux qui doivent rester
 * égaux finissent toujours par ne plus l'être, et le jour où cela arriverait le
 * joueur réapparaîtrait à côté de la porte au lieu d'en sortir.
 */
const PORTAL_SETBACK = 6

/**
 * Où s'ouvre le portail, une fois la bête tombée.
 *
 * Au nord du plateau, donc **en face** de l'arrivée de la spire, qui débouche au
 * sud : le joueur le voit en montant les dernières marches, par-dessus l'épaule
 * de ce qui l'attend. Six unités du centre — sur le plateau, à l'écart de
 * l'arène, et à plus de trois de la lèvre.
 *
 * Son cap est zéro, c'est-à-dire que sa normale regarde le sud : l'anneau fait
 * face à qui monte. Un portail vu par la tranche ne se lit pas comme un
 * passage.
 */
export const SUMMIT_PORTAL = (() => {
  const at = spurToWorld(MOUNT_X, MOUNT_Z - PORTAL_SETBACK)
  // Le cap de la voie, parce que « faire face au sud » se dit dans **son**
  // repère : l'anneau regarde d'où l'on monte, quel que soit le cap du
  // promontoire.
  return { x: at.x, y: SUMMIT_Y, z: at.z, yaw: SPUR_YAW }
})()

/** Pas du retour, compté depuis l'anneau vers le plateau. */
const SUMMIT_RETURN_STEP = 3

/**
 * Où l'on ressort du portail du sommet **en revenant du Marais**.
 *
 * Trois unités devant l'anneau, sur son axe et du côté du plateau : le joueur
 * en sort dos à lui, face à l'arène et à la tête de la spire. C'est la cote et
 * la posture du retour de Nakano, pour la même raison — on ne réapparaît ni
 * dans la géométrie qu'on vient de franchir, ni en lui faisant face.
 *
 * **Sans ce point, le Marais ne ramenait pas là d'où l'on venait.** Le retour
 * tombait sur l'arrivée générale de l'île, c'est-à-dire la prairie du sud, à
 * cent trente unités et une montagne de l'anneau franchi — alors que le portail
 * du bassin, lui, annonce le sommet. C'est le défaut qu'avaient déjà connu le
 * retour de l'Île Céleste puis celui de l'Outremonde, et il se corrige de la
 * même façon : l'Île Céleste a deux portes depuis qu'elle mène au Marais, et
 * `arrivalFor` doit savoir par laquelle on rentre.
 *
 * L'altitude est celle du plateau — il est plat, c'est son propos — relevée du
 * sol au centre de la capsule. `FEET_TO_CENTER` et non `PLAYER` : ce module
 * décrit de l'arithmétique pure et n'a aucune raison de tirer la configuration
 * du joueur, qui lit le relief à son chargement. Voir `capsule.ts`.
 */
export const SUMMIT_SPAWN = (() => {
  const at = spurToWorld(MOUNT_X, MOUNT_Z - PORTAL_SETBACK + SUMMIT_RETURN_STEP)
  return { x: at.x, y: SUMMIT_Y + FEET_TO_CENTER, z: at.z }
})()

/** Cap à l'arrivée depuis le Marais : dos à l'anneau, face à la descente. */
export const SUMMIT_ARRIVAL_YAW = SPUR_YAW

// --- Le cadrage de la minimap ------------------------------------------------

/**
 * Le fond de carte de l'Île Céleste : son étendue, et où il est centré.
 *
 * Tout est **dérivé** du monde à tenir, rien n'est choisi à l'œil, et c'est ce
 * qui met ces cotes ici plutôt que dans `config/skyIsland.ts` où elles
 * vivaient : depuis que la montagne part au nord-ouest, c'est elle qui décide
 * du cadre.
 *
 * Le centre est décalé **en x et en z**, parce que le promontoire l'est aussi.
 * Un cadre centré sur l'origine devrait couvrir deux cent quarante unités pour
 * atteindre la pointe de la montagne, alors que le monde à montrer n'en fait
 * que cent quatre-vingts : on aurait payé un quart de vide au sud-est — le côté
 * où il n'y a rien — en rapetissant l'île d'autant sur une vignette de cent
 * cinquante pixels de large.
 *
 * Le cadre reste **carré**, parce que le widget l'est : on prend donc le plus
 * grand des deux côtés du monde à tenir, et l'autre gagne du vide. Le rendre
 * rectangulaire déformerait la carte, et une carte qui ment sur les distances
 * ne sert plus à s'orienter.
 *
 * La marge vaut six unités : assez pour que la lèvre de l'île et la pointe de
 * la montagne ne touchent pas le bord, où le liseré du widget les mangerait.
 */
const MAP_FRAME = (() => {
  const MARGIN = 6
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const swallow = (x: number, z: number) => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }

  // La lèvre de l'île, échantillonnée : elle ondule de cinq unités selon le cap.
  for (let i = 0; i < 128; i++) {
    const theta = (i / 128) * Math.PI * 2
    const r = rimRadius(theta)
    swallow(Math.sin(theta) * r, Math.cos(theta) * r)
  }
  // Et le disque de la montagne, dans le monde.
  for (let i = 0; i < 64; i++) {
    const phi = (i / 64) * Math.PI * 2
    const at = spurToWorld(
      MOUNT_X + Math.sin(phi) * MOUNT_BASE_R,
      MOUNT_Z + Math.cos(phi) * MOUNT_BASE_R,
    )
    swallow(at.x, at.z)
  }

  const size = Math.max(maxX - minX, maxZ - minZ) + MARGIN * 2
  return { size, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }
})()

export const ISLAND_MAP_SIZE = MAP_FRAME.size
export const ISLAND_MAP_CENTER_X = MAP_FRAME.x
export const ISLAND_MAP_CENTER_Z = MAP_FRAME.z

/*
  Exposé en développement, sur le modèle de `window.__skyIsland`.

  Et pour une raison plus forte encore que pour l'île : un chemin en spire ne se
  juge pas à l'œil. Sa pente, son dévers et la marche éventuelle à son raccord
  se comptent en dixièmes d'unité sur quatre-vingts unités de développé, et le
  rendu logiciel d'un test navigateur tourne à une image par seconde — il ne
  peut donc pas *parcourir* la montée. Pouvoir interroger `mountainHeight` et
  `mountainSlope` depuis la console est le seul moyen de vérifier qu'on peut
  monter.
*/
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__skyMountain = {
    mountainHeight,
    mountainHeightAt,
    mountainLocal,
    mountainSlope,
    mountRimHeight,
    DECK_X0,
    DECK_X1,
    DECK_Y,
    MOUNT_X,
    MOUNT_Z,
    MOUNT_BASE_R,
    MOUNT_H,
    SUMMIT_R,
    SUMMIT_Y,
    GATE_X,
    SPUR_YAW,
    spurToWorld,
    worldToSpur,
    nearCauseway,
    ISLAND_MAP_SIZE,
    ISLAND_MAP_CENTER_X,
    ISLAND_MAP_CENTER_Z,
  }
}
