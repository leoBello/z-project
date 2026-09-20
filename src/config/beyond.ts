import type { BiomeId } from '../types/game'
import { PLAYER } from './gameplay'
import { fbm, smoothstep } from './world'
import type { WorldShape } from './worldShape'

/**
 * L'Outremonde — la quatrième carte, celle qui vient **après** la partie.
 *
 * On n'y entre que par l'anneau qui se perce au pied de l'Arbre blafard, une
 * fois Malenia tombée. Il n'y a rien à y accomplir : les cinq quêtes sont
 * closes, les onze coffres ouverts, les réceptacles pris. C'est un terrain de
 * jeu, et c'est la seule carte du jeu dont ce soit la raison d'être.
 *
 * **Trois décisions tiennent tout le fichier.**
 *
 *  1. *C'est un champ de hauteurs, comme le continent.* L'île est une surface
 *     radiale, le marais une nappe : ni l'un ni l'autre ne portait de biome. Un
 *     monde qui promet « presque tous ceux du jeu » ne peut être qu'une grille
 *     de relief — c'est la seule structure qui sache passer d'une plage à une
 *     jungle à une montagne enneigée sans couture. D'où la `WorldShape` ci-
 *     dessous, et d'où le fait que `Terrain`, `Vegetation` et `Water` marchent
 *     ici sans une ligne de plus : ils ont été ouverts à un second monde
 *     exactement pour celui-ci.
 *
 *  2. *Les biomes sont rangés en roue, par secteur angulaire.* Sur le continent,
 *     la région est un bruit doublé d'un biais linéaire : les trois biomes
 *     intermédiaires s'y trouvent en marchant. Ici on arrive sur un promontoire
 *     et **on doit tout voir d'un coup** — la jungle à gauche, la prairie devant,
 *     les terres arides à droite, la montagne au fond. Un bruit pur aurait donné
 *     une mosaïque exacte et illisible. Voir `region`.
 *
 *  3. *Le sanctuaire est au sud, en surplomb.* La caméra du jeu est fixe et
 *     regarde le nord : arriver au sud met le monde entier dans le cadre, et
 *     l'élever de huit unités au-dessus de la côte met l'horizon au tiers
 *     supérieur de l'image plutôt qu'au ras du sol. C'est toute la mise en scène
 *     de l'arrivée, et elle tient en deux nombres.
 */

/* --- Cotes de la grille ----------------------------------------------------- */

/**
 * Les cotes du monde, et pourquoi elles sont **exactement** celles du continent.
 *
 * « Aussi grand que le tout premier » est une demande sur la taille ressentie,
 * pas sur un nombre : deux cents unités de côté, c'est la distance qu'on met
 * deux minutes à traverser en courant, et c'est ce que le joueur a appris à
 * lire. Un monde plus grand n'aurait pas paru plus vaste, il aurait paru plus
 * vide — la brume sature à 200, on n'en verrait pas davantage.
 *
 * La grille est identique pour la même raison qu'elle est identique entre le
 * mesh et le collider du continent : 161 × 161 points, soit une cellule de 1,25
 * unité. C'est la résolution à laquelle une pente se lit sans marche d'escalier.
 */
export const BEYOND = {
  size: 200,
  half: 100,
  grid: 160,
  waterLevel: 0,
  /**
   * Le fond marin reste guéable, comme sur le continent : à -0,85 l'eau arrive à
   * la taille du personnage. Une mer où l'on se noie demanderait une nage, et un
   * mur invisible au large demanderait une explication.
   */
  maxDepth: -0.85,
  /**
   * Plus haut que sur le continent (9,5), et c'est la conséquence d'un massif
   * plus haut : la crête culmine à 24 contre 16 là-bas. Au seuil du continent,
   * la moitié du nord de cette carte aurait été classée « montagne », y compris
   * des pentes douces où pousse encore de l'herbe.
   */
  mountainLevel: 12,
  snowLevel: 17,
} as const

/* --- Le Sanctuaire ---------------------------------------------------------- */

/**
 * Le promontoire du sud : la zone franche, et le seul endroit sûr de la carte.
 *
 * `radius` est la partie **plate**, `blend` le raccord au relief naturel. Le
 * raccord est large — douze unités pour quatre de dénivelé, soit une pente d'un
 * tiers — parce qu'on doit pouvoir en descendre par n'importe quel côté, et y
 * remonter en courant quand ça tourne mal. Un talus raide aurait fait de la zone
 * franche une forteresse, ce qu'elle n'est pas : elle est un seuil.
 *
 * L'altitude est le seul nombre de mise en scène du fichier. À huit unités
 * au-dessus d'une côte qui est à cinq, le regard passe **par-dessus** la
 * première ligne de végétation, et le cœur du monde — l'arène noire, à soixante-
 * quatorze unités de là — tombe au centre du cadre.
 */
export const SANCTUARY = {
  x: 0,
  z: 74,
  radius: 17,
  blend: 12,
  altitude: 8,
} as const

/**
 * Rayon de la trêve : à l'intérieur, aucun ennemi n'attaque ni ne poursuit.
 *
 * Trois unités au-delà du dallage plat, et pas davantage. La trêve doit couvrir
 * le sanctuaire en entier — y compris le bord où l'on recule en se faisant
 * poursuivre — sans s'étendre sur la pente, qui appartient déjà au monde
 * hostile. Le joueur doit pouvoir voir la bête s'arrêter à quelques pas de lui :
 * c'est ce qui rend la frontière lisible sans qu'aucune interface ne la trace.
 *
 * Voir `state/sanctuary.ts` pour la mécanique, et `config/beyondEnemies.ts` pour
 * l'exclusion de peuplement, qui est bien plus large — une trêve ne sert à rien
 * si l'on apparaît nez à nez avec un Moblin en la quittant.
 */
export const SANCTUARY_TRUCE_R = SANCTUARY.radius + 3

/**
 * Point d'apparition, et point de résurrection.
 *
 * Au sud du dallage et non en son centre : on arrive **au bord**, face au nord,
 * et tout le sanctuaire est déjà devant soi — le maître, les braseros, la stèle,
 * et derrière eux le monde. Posé au centre, le joueur aurait eu la moitié du
 * décor dans le dos.
 *
 * La relation d'altitude est celle de toutes les autres tables de spawn du jeu :
 * le sol, plus la demi-hauteur de la capsule et son rayon. Ni enfoncé, ni
 * flottant.
 */
export const BEYOND_SPAWN = {
  x: 0,
  y: SANCTUARY.altitude + PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius,
  z: 82,
}

/**
 * Cap à l'arrivée : plein nord.
 *
 * `Math.PI` et non zéro — l'avant d'un modèle est +Z dans ce jeu, donc regarder
 * le nord (−Z) est un demi-tour. Même valeur que l'arrivée sur l'Île Céleste, et
 * pour exactement la même raison : la caméra est fixe, elle regarde le nord, et
 * ce qu'on veut montrer est au nord.
 */
export const BEYOND_ARRIVAL_YAW = Math.PI

/**
 * L'anneau du retour, qui ramène au Marais.
 *
 * Quatre unités et demie derrière le point d'apparition, comme celui de l'île :
 * le joueur en sort dos à l'anneau, face au monde. Il est ouvert dès la première
 * frame — on vient d'en sortir, le voir se percer derrière soi n'aurait aucun
 * sens.
 */
export const BEYOND_PORTAL = {
  x: BEYOND_SPAWN.x,
  y: SANCTUARY.altitude,
  z: BEYOND_SPAWN.z + 4.5,
  yaw: Math.PI,
}

/**
 * Le maître au bâton — où il se tient, et de combien de loin il interpelle.
 *
 * Décalé de l'axe d'arrivée plutôt que planté dessus : le joueur doit d'abord
 * voir le monde, et le trouver **ensuite**, en se retournant à peine. Un
 * personnage posé dans l'axe aurait masqué la seule chose que cette arrivée
 * existe pour montrer.
 *
 * Son cap regarde le portail, c'est-à-dire l'endroit d'où le joueur arrive : il
 * attend, et il sait par où l'on vient.
 */
export const SENSEI = {
  x: 7.5,
  y: SANCTUARY.altitude,
  z: 75,
  yaw: 0,
  /** Rayon d'interaction. Un peu plus large qu'un coffre : on l'aborde de face. */
  radius: 4.2,
} as const

/*
  Note de cote, parce qu'elle a failli coûter un défaut.

  Le portail du retour est à (0 ; 86,5) et réagit à sept unités ; le maître est
  ici et répond à 4,2. Entre les deux il y a 13,7 unités, soit 2,5 de marge : les
  deux zones ne peuvent pas se recouvrir, et la règle de priorité d'interaction
  n'a donc jamais à les départager. À la première position essayée — (6,5 ; 77) —
  la marge était de trois dixièmes, c'est-à-dire qu'un pas de côté suffisait à
  proposer « repartir au Marais » à quelqu'un qui venait parler au maître.
*/

/* --- Le cœur : l'arène noire ------------------------------------------------ */

/**
 * Le dallage du centre, et ce qui s'y tient.
 *
 * Il est au milieu exact de la carte, et c'est le seul endroit de l'Outremonde
 * dont la position ne soit pas un choix de composition mais un axiome : c'est le
 * point que toutes les routes rejoignent, celui qu'on voit depuis le sanctuaire,
 * et celui vers lequel on revient parce qu'on sait ce qu'il y a dessus.
 *
 * Son altitude est basse — 2,2, quand la côte est à cinq — pour qu'il se lise
 * comme une **cuvette** depuis les hauteurs. On regarde l'arène de haut avant
 * d'y descendre.
 */
export const BEYOND_ARENA = {
  x: 0,
  z: 0,
  radius: 14,
  blend: 10,
  altitude: 2.2,
} as const

export const BEYOND_ARENA_CENTER: readonly [number, number, number] = [
  BEYOND_ARENA.x,
  BEYOND_ARENA.altitude,
  BEYOND_ARENA.z,
]

/** Rayon d'engagement de la Déchue. Plus large que le dallage : elle se lève avant. */
export const BEYOND_ARENA_ENGAGE_R = 17

/* --- Relief ----------------------------------------------------------------- */

/** Une crête gaussienne, tirée le long d'un segment. */
interface Ridge {
  ax: number
  az: number
  bx: number
  bz: number
  sigma: number
  height: number
}

/**
 * Les trois reliefs majeurs, du plus haut au plus bas.
 *
 * Le massif du nord ferme l'horizon : c'est le seul objet de la carte qui monte
 * au-dessus de la neige, et c'est lui qu'on vise depuis le sanctuaire. Les deux
 * autres sont des **épaules** — ils empêchent le monde d'être une cuvette
 * parfaitement lisible depuis son bord, ce qui le rendrait petit.
 */
const RIDGES: readonly Ridge[] = [
  /** Le grand massif, en travers du nord. Il culmine au-dessus de la neige. */
  { ax: -46, az: -58, bx: 34, bz: -70, sigma: 26, height: 24 },
  /** L'échine de l'ouest, qui sépare la jungle de la mer. */
  { ax: -76, az: -16, bx: -54, bz: -46, sigma: 15, height: 13 },
  /** Les mesas de l'est, basses et larges : les terres arides ont du relief. */
  { ax: 58, az: -30, bx: 74, bz: 12, sigma: 17, height: 10.5 },
]

interface Island {
  x: number
  z: number
  radius: number
  height: number
}

/**
 * Les trois îles du large.
 *
 * Elles ne servent à rien, et c'est exactement pourquoi elles sont là : le biome
 * `island` existe dans le jeu, il a sa palette et ses palmiers, et un monde qui
 * promet tous les biomes doit le porter. Elles sont placées sur l'anneau de
 * hauts-fonds, donc atteignables à gué — la mer est guéable partout ici.
 */
const ISLANDS: readonly Island[] = [
  { x: -76, z: 38, radius: 15, height: 6.2 },
  { x: 74, z: 54, radius: 13, height: 5.4 },
  { x: 42, z: -86, radius: 14, height: 7 },
]

/** Distance d'un point à un segment, dans le plan XZ. */
function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
) {
  const abx = bx - ax
  const abz = bz - az
  const lengthSq = abx * abx + abz * abz
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (pz - az) * abz) / lengthSq))
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t))
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Masque d'une île prise isolément : 1 sur son plateau, 0 au large. */
function maskOf(island: Island, x: number, z: number) {
  return (
    1 - smoothstep(island.radius * 0.35, island.radius, Math.hypot(x - island.x, z - island.z))
  )
}

/** Vaut 1 au cœur d'une île, 0 au large. Le maximum, jamais la somme. */
function beyondIslandMask(x: number, z: number) {
  let mask = 0
  for (const island of ISLANDS) mask = Math.max(mask, maskOf(island, x, z))
  return mask
}

/**
 * Les deux terrasses de la carte : le sanctuaire et l'arène.
 *
 * Une table et non deux blocs recopiés dans `beyondHeight` — c'est la même
 * discipline que les terrasses de monuments du continent, et pour la même
 * raison : elles s'appliquent **en dernier**, dans le même ordre, avec le même
 * fondu. Un lieu doit effacer le relief qu'il occupe, pas s'y ajouter.
 */
const TERRACES = [SANCTUARY, BEYOND_ARENA] as const

/**
 * Altitude du terrain en (x, z).
 *
 * Même composition que le continent — dôme, crêtes, îles, bruit, terrasses — et
 * c'est voulu : les deux mondes doivent avoir le même grain sous les pieds. Ce
 * qui change tient dans les nombres, et dans un seul choix de forme : le dôme
 * est **plus large et plus haut** (six unités au centre contre quatre, et il ne
 * plonge qu'à partir de 42), parce que la mer n'a ici aucun rôle à jouer. Sur le
 * continent elle porte l'îlot de Nakano et le gué de l'île mystérieuse ; ici
 * elle n'est qu'une bordure, et la terre est tout le sujet.
 */
export function beyondHeight(x: number, z: number) {
  const distance = Math.hypot(x, z)

  // Dôme : +6 au cœur, -7 au large. Il croise le niveau de la mer vers r = 88,
  // soit une côte très ronde et un océan réduit à une ceinture. Les deux bornes
  // ont été relevées après mesure : à `smoothstep(42, 118, …)`, la mer occupait
  // 37 % de la grille — une ceinture n'est pas un tiers du monde.
  const falloff = smoothstep(46, 132, distance)
  let height = lerp(6, -7, falloff)

  // Le masque terrestre empêche crêtes et bruit de surgir en pleine mer.
  const landMask = 1 - falloff

  for (const ridge of RIDGES) {
    const toRidge = distanceToSegment(x, z, ridge.ax, ridge.az, ridge.bx, ridge.bz)
    height +=
      ridge.height * Math.exp(-(toRidge * toRidge) / (2 * ridge.sigma * ridge.sigma)) * landMask
  }

  // Relief de détail, atténué sous l'eau pour garder un fond marin lisible. Les
  // décalages de phase (+41, −17) n'ont pas d'autre rôle que de ne pas rejouer
  // la carte du continent : le bruit est le même, on l'interroge ailleurs.
  height += (fbm(x * 0.019 + 41, z * 0.019 - 17) - 0.5) * 4.2 * (0.25 + landMask * 0.75)
  height += (fbm(x * 0.07 - 23, z * 0.07 + 9) - 0.5) * 1

  // Îles : posées par-dessus le fond marin, pas ajoutées — sinon elles
  // s'enfoncent. Chacune avec *sa* hauteur, jamais avec le masque combiné.
  for (const island of ISLANDS) {
    const relief = island.height * maskOf(island, x, z)
    if (relief > 0) height = Math.max(height, relief - 0.4)
  }

  // Terrasses, en dernier. Voir `TERRACES`.
  for (const terrace of TERRACES) {
    const weight =
      1 -
      smoothstep(
        terrace.radius,
        terrace.radius + terrace.blend,
        Math.hypot(x - terrace.x, z - terrace.z),
      )
    if (weight > 0) height = lerp(height, terrace.altitude, weight)
  }

  // Plancher : l'océan reste guéable, le joueur n'est jamais submergé.
  return Math.max(height, BEYOND.maxDepth)
}

/** Pente locale, par différences finies. Sert à ne rien planter sur une falaise. */
export function beyondSlope(x: number, z: number, step = 1.5) {
  const dx = beyondHeight(x + step, z) - beyondHeight(x - step, z)
  const dz = beyondHeight(x, z + step) - beyondHeight(x, z - step)
  return Math.hypot(dx, dz) / (2 * step)
}

/**
 * La roue des biomes — la décision de forme de cette carte.
 *
 * La valeur de région du continent est un bruit basse fréquence plus un biais
 * linéaire : les trois biomes intermédiaires s'y **rencontrent**, au fil de la
 * marche, et c'est juste pour un monde qu'on découvre en le traversant.
 *
 * Ici on ne traverse pas, on domine : le sanctuaire est un balcon, et tout doit
 * se lire depuis lui. La région suit donc l'**angle** autour du cœur, ce qui
 * range les trois biomes en secteurs — jungle à l'ouest, prairie au sud et au
 * nord, terres arides à l'est. `0,5 + 0,42 · sin θ` réalise exactement cette
 * table : plus l'est, plus la valeur monte.
 *
 * Deux corrections l'empêchent d'être une part de camembert :
 *
 *  - **du bruit**, à la même fréquence que celui du continent. Il vaut ±0,25,
 *    soit plus que l'écart entre deux seuils : les frontières ondulent, se
 *    percent d'enclaves, et aucune ne suit un rayon ;
 *  - **un fondu au centre.** L'angle tourne de plus en plus vite à mesure qu'on
 *    approche de l'origine, et à trois unités du cœur il balaierait les trois
 *    biomes en un pas. Le terme angulaire est donc éteint sous 30 unités, où ne
 *    reste que le bruit — le pourtour de l'arène est un no man's land, ce qui est
 *    exactement ce qu'on veut autour d'elle.
 */
export function beyondRegion(x: number, z: number) {
  const angle = Math.atan2(x, z)
  const wheel = Math.sin(angle) * 0.34 * smoothstep(8, 34, Math.hypot(x, z))
  return 0.5 + wheel + (fbm(x * 0.013 - 5.3, z * 0.013 + 2.9) - 0.5) * 0.42
}

/**
 * Classe un point en biome.
 *
 * Même ordre de tests que le continent, et il compte pour la même raison :
 * l'altitude tranche d'abord (mer, plage, montagne), l'île ensuite, et le bruit
 * de région ne décide que des terres intermédiaires. C'est ce qui garantit
 * qu'on ne trouve jamais de jungle au sommet d'une crête enneigée.
 */
export function beyondBiome(x: number, z: number, height: number): BiomeId {
  if (height < BEYOND.waterLevel - 0.12) return 'shallows'
  if (height < 1.1) return 'beach'
  if (height > BEYOND.mountainLevel) return 'mountain'
  if (beyondIslandMask(x, z) > 0.35) return 'island'

  /*
    Le sanctuaire est une prairie, et il l'est par décret.

    C'est la seule entorse du fichier à la règle « le bruit décide », et elle se
    paie : sans elle, la valeur de région tombait à 0,39 sous le dallage — de la
    jungle, c'est-à-dire un vert sombre de sous-bois pour la seule scène calme du
    jeu, et « Jungle » écrit sous la minimap pendant qu'on discute avec un vieux
    maître assis dans l'herbe. Le rayon couvre le raccord et pas seulement le
    plat : une lisière de jungle au pied du talus aurait déplacé le problème de
    trois mètres.
  */
  if (Math.hypot(x - SANCTUARY.x, z - SANCTUARY.z) < SANCTUARY.radius + SANCTUARY.blend) {
    return 'meadow'
  }

  const region = beyondRegion(x, z)
  if (region < 0.42) return 'jungle'
  if (region < 0.66) return 'meadow'
  return 'badlands'
}

/* --- La forme, telle que le décor la consomme ------------------------------- */

/**
 * L'Outremonde vu par `Terrain`, `Vegetation`, `Water` et la minimap.
 *
 * Deux exclusions au semis, et deux seulement :
 *
 *  - **le sanctuaire**, dallé et meublé par son propre composant. Un arbre
 *    poussé au milieu des braseros, ou pire, à travers le maître, aurait sabordé
 *    la seule scène calme de la carte. Le rayon est celui de la trêve, pas celui
 *    du dallage : la lisière de végétation marque alors la frontière de la paix,
 *    ce qui est une façon de la dire sans le dire ;
 *  - **l'arène**, pour la même raison, et parce que la Déchue y traîne des
 *    flaques qu'un buisson rendrait illisibles.
 */
export const BEYOND_SHAPE: WorldShape = {
  id: 'beyond',

  size: BEYOND.size,
  half: BEYOND.half,
  grid: BEYOND.grid,

  waterLevel: BEYOND.waterLevel,
  maxDepth: BEYOND.maxDepth,
  mountainLevel: BEYOND.mountainLevel,
  snowLevel: BEYOND.snowLevel,

  height: beyondHeight,
  slope: (x, z) => beyondSlope(x, z),
  region: beyondRegion,
  islandMask: beyondIslandMask,
  biome: beyondBiome,

  blocked: (x, z) =>
    Math.hypot(x - SANCTUARY.x, z - SANCTUARY.z) < SANCTUARY_TRUCE_R ||
    Math.hypot(x - BEYOND_ARENA.x, z - BEYOND_ARENA.z) < BEYOND_ARENA.radius + 2,

  /*
    La clairière du Sanctuaire, et c'est le réglage de **mise en scène** le plus
    efficace du fichier.

    Elle n'interdit que les gros props — troncs, palmiers, arbres morts, gros
    rochers. L'herbe, les fleurs et les buissons y poussent normalement, donc le
    sol reste vivant : ce n'est pas une zone pelée, c'est une clairière.

    Trente-quatre unités, soit le dallage plus une fois son rayon. Mesuré sur la
    première version, à zéro : la lisière commençait à la limite de la trêve,
    c'est-à-dire à vingt unités, et une haie de canopée de cinq unités de haut
    fermait l'horizon à hauteur d'œil. On arrivait sur un balcon d'où l'on ne
    voyait rien d'autre que des cimes — tout le travail d'altitude du promontoire
    annulé par une rangée d'arbres.

    Centrée sur le Sanctuaire et non sur le point d'apparition : c'est le lieu
    qu'on dégage, pas les pieds du joueur.
  */
  clearing: { x: SANCTUARY.x, z: SANCTUARY.z, radius: 34 },

  // Une autre graine que celle du continent, sans quoi les deux mondes
  // tireraient la même suite de nombres — mêmes rejets, mêmes tailles, mêmes
  // inclinaisons. Ils n'auraient pas la même carte, mais ils auraient le même
  // hasard, et ça se voit.
  scatterSeed: 0xa11e,
}

/* --- Minimap ---------------------------------------------------------------- */

/**
 * Cadrage de la minimap : le monde entier, centré sur l'origine.
 *
 * Comme le continent, et pour la même raison — le relief occupe toute la grille,
 * il n'y a pas de sous-partie à cadrer. Les deux autres cartes, elles, tiennent
 * dans un coin de leur repère et ont besoin d'un décalage.
 */
export const BEYOND_MAP_SIZE = BEYOND.size
export const BEYOND_MAP_CENTER_X = 0
export const BEYOND_MAP_CENTER_Z = 0
