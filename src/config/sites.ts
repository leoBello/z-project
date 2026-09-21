import type { MapId, SiteId } from '../types/game'
import { BEYOND_ARENA } from './beyond'
import { BRIDGE_FOOT } from './bridge'
import { ARENA_R, CAUSEWAY, TREE } from './rotMarsh'
import { ROTUNDA_R } from './skyIsland'
import { GATE_X, MOUNT_WORLD, SUMMIT_R, spurToWorld } from './skyMountain'
import { SHALLOWS } from './world'

/**
 * Les lieux remarquables : ce que la carte a de nommable et qui n'ouvre rien.
 *
 * `config/landmarks.ts` décrit les six **monuments** du continent, et chacun
 * porte une machinerie complète : une terrasse creusée dans le relief, une
 * interdiction de semis, un repère de minimap, une braise, une page de
 * portfolio, une entrée dans le menu de téléportation. C'est beaucoup, et c'est
 * exactement ce qu'il ne faut pas donner à un gué.
 *
 * Or le joueur, lui, ne traverse pas six lieux mais quinze : il franchit un
 * pont, il passe un gué, il monte à une rotonde, il force une porte, il gravit
 * un sommet, il longe une chaussée, il descend dans un bassin. Rien de tout
 * cela ne s'annonçait — quatre cartes entières où l'interface ne disait jamais
 * où l'on était, alors que le premier monument venu le disait.
 *
 * Cette table est donc l'autre moitié du sujet, et elle n'a **qu'un seul
 * champ de plus qu'un point** : le rayon où l'annonce se déclenche. Un lieu
 * remarquable ne creuse rien, n'interdit rien, ne s'ouvre pas et n'entre dans
 * aucun sommaire. Il se nomme quand on y arrive, et c'est tout.
 *
 * **Aucune position n'est écrite à la main.** Chacune se lit dans la
 * configuration qui fait déjà foi pour la géométrie du lieu — le tracé du gué
 * dans `world`, la culée du pont dans `bridge`, le centre de la montagne dans
 * `skyMountain`. C'est la règle du projet, et elle a ici une conséquence très
 * concrète : déplacer la chaussée du Marais de dix unités déplace son annonce
 * d'autant, au lieu de la laisser au milieu de la vase.
 */
export interface Site {
  id: SiteId
  /** La carte qui le porte. Une annonce ne se déclenche que chez elle. */
  map: MapId
  /** Centre de l'annonce, en coordonnées **monde** de sa carte. */
  x: number
  z: number
  /**
   * Le lieu est « découvert » quand le joueur entre dans ce rayon.
   *
   * Même rôle que le `discoverRadius` d'un monument, et réglé avec le même
   * souci : assez large pour qu'on ne puisse pas frôler le lieu sans qu'il se
   * nomme, assez serré pour que deux annonces voisines ne se chassent pas
   * l'une l'autre — il n'y a qu'un bandeau, et le dernier arrivé efface le
   * précédent. Les marges mesurées sont notées lieu par lieu, et
   * `sites.test.ts` les tient.
   */
  radius: number
}

/* --- Le continent ----------------------------------------------------------- */

/**
 * Le Gué — le haut-fond qui mène à l'île mystérieuse.
 *
 * Posé sur la **tête côté continent** du haut-fond et non en son milieu, et la
 * cote qui décide est celle des Ruines de l'Île : elles se découvrent à dix-sept
 * unités de leur centre, c'est-à-dire aux deux tiers de la traversée. Une
 * annonce au milieu du gué aurait été balayée par la leur trois secondes plus
 * tard. À l'entrée, les deux annonces sont séparées de vingt et une unités de
 * marche —
 * « on entre dans l'eau », puis, une fois de l'autre côté, « voilà où elle
 * menait ».
 *
 * C'est le seul lieu du jeu qui n'est fait de rien : ni pierre, ni bois, juste
 * un fond remonté sous la surface. Il mérite pourtant son nom plus que
 * beaucoup d'autres, parce que c'est là que le joueur apprend que la mer de
 * cette carte se traverse à pied.
 */
const FORD: Site = {
  id: 'ford',
  map: 'continent',
  x: SHALLOWS.ax,
  z: SHALLOWS.az,
  radius: 9,
}

/**
 * Le Pont de Nakano — à son pied, sur la plage des terres arides.
 *
 * Au pied et non au milieu du tablier, pour la raison qui vaut déjà au gué : le
 * Temple de Nakano se découvre à quinze unités de la pagode, donc à peu près à
 * mi-portée du pont. Une annonce posée là serait effacée dans la seconde.
 *
 * Mesuré sur la diagonale : le pied est à 78,5 du centre de la carte et la
 * pagode à 99. L'annonce du pont tombe donc à r = 70,5 et celle du temple à
 * r = 84 — treize unités et demie de marche entre les deux, ce qui laisse à la
 * première le temps d'exister. Le joueur est nommé le pont **avant** d'y
 * monter, et le temple pendant qu'il le traverse : c'est l'ordre dans lequel il
 * les rencontre.
 */
const NAKANO_BRIDGE: Site = {
  id: 'nakano-bridge',
  map: 'continent',
  x: BRIDGE_FOOT.x,
  z: BRIDGE_FOOT.z,
  radius: 8,
}

/* --- L'Île Céleste ---------------------------------------------------------- */

/**
 * La Rotonde — le cœur de la forteresse, et l'arène du gardien.
 *
 * Le rayon est réglé sur la **falaise du cœur**, qui commence à quatorze unités
 * du centre : à seize, l'annonce tombe pendant qu'on monte la dernière rampe,
 * donc avant que la bête ne se lève (elle engage à l'entrée du dallage). Le
 * joueur apprend où il arrive avant d'apprendre ce qui l'y attend, et c'est le
 * seul ordre qui rende l'un et l'autre lisibles.
 *
 * Le grand arbre n'a **pas** d'annonce à lui, et c'est une décision : il pousse
 * à vingt et une unités du centre, donc à cinq unités à peine du bord de ce
 * cercle-ci. Deux bandeaux à cinq unités d'intervalle, c'est un bandeau qui en
 * efface un autre — et de toute façon l'arbre est ce qu'on voit depuis la
 * rotonde, pas un endroit où l'on va.
 */
const ROTUNDA: Site = {
  id: 'rotunda',
  map: 'sky',
  x: 0,
  z: 0,
  radius: ROTUNDA_R + 4.5,
}

/**
 * La Porte de l'Ouest — les deux tours et la herse, au-dessus du vide.
 *
 * Sa position se lit dans le repère de la voie et se ramène au monde par
 * `spurToWorld`, comme le poste du Lynel doré et le portail du sommet : c'est
 * le seul moyen d'être exactement là où la porte est construite, puisqu'elle
 * est elle-même posée à `GATE_X` du centre de l'île sur ce cap-là.
 *
 * Dix unités : le tablier fait sept de large, donc l'annonce se déclenche
 * forcément *sur la voie* et jamais en la longeant par en dessous — il n'y a
 * rien en dessous. Elle tombe dix unités avant la herse, c'est-à-dire au moment
 * où l'on comprend qu'elle est baissée.
 */
const WEST_GATE: Site = {
  id: 'west-gate',
  map: 'sky',
  ...spurToWorld(GATE_X, 0),
  radius: 10,
}

/**
 * Le Sommet de la Montagne — le plateau du Lynel doré.
 *
 * Centré sur le plateau, avec cinq unités de marge au-delà de sa lèvre : la
 * spire débouche par le sud, donc l'annonce tombe dans les derniers lacets.
 * Comme à la rotonde, elle précède l'engagement de la bête — on sait où l'on
 * monte avant de savoir contre qui.
 */
const SUMMIT: Site = {
  id: 'summit',
  map: 'sky',
  x: MOUNT_WORLD.x,
  z: MOUNT_WORLD.z,
  radius: SUMMIT_R + 5,
}

/* --- Le Marais d'Aeonia ------------------------------------------------------ */

/**
 * La Chaussée d'Elphaël — au milieu du tablier.
 *
 * Le troisième des six points du tracé, et pas une cote recopiée : la chaussée
 * est une courbe passée dans un Catmull-Rom, et son milieu géométrique n'a pas
 * de nom. Ce point-là en a un — il est dans la table — et il tombe à peu près à
 * mi-parcours.
 *
 * Volontairement pas au portail : on y arrive au sortir du voile, et une
 * annonce qui se déclenche à la frame où le joueur reprend la main se lit comme
 * un écran de chargement, pas comme une découverte. Le rayon est réglé là-
 * dessus et non sur la largeur du tablier : à neuf unités, le point d'arrivée
 * est à neuf pas en dehors du cercle, donc c'est le joueur qui provoque
 * l'annonce en marchant vers l'arbre.
 */
const CAUSEWAY_SITE: Site = {
  id: 'causeway',
  map: 'rot',
  x: CAUSEWAY[2][0],
  z: CAUSEWAY[2][1],
  radius: 9,
}

/**
 * Le Bassin de racines — l'arène de la Déchue.
 *
 * Dix-neuf unités : quatre de plus que le rayon d'engagement, donc l'annonce
 * tombe avant qu'elle ne se lève. C'est la règle des deux arènes de l'île, et
 * elle vaut ici davantage encore — c'est le seul endroit du jeu où l'on descend
 * dans quelque chose.
 */
const ROOT_BASIN: Site = {
  id: 'root-basin',
  map: 'rot',
  x: 0,
  z: 0,
  radius: ARENA_R + 7,
}

/**
 * L'Arbre blafard — son pied.
 *
 * Le tronc fait neuf unités et demie de rayon et cent vingt de haut : on le voit
 * depuis le portail, à cent unités de là, et c'est vers lui qu'on marche pendant
 * toute la traversée. Il ne se **découvre** pourtant qu'à son pied, et c'est
 * volontaire : ce qu'on a sous les yeux depuis le début n'a pas besoin d'être
 * annoncé, ce qui mérite de l'être c'est d'y être enfin.
 *
 * Six unités et demie au-delà du tronc, ce qui place la limite à z = −18 : en
 * dehors du bassin (rayon 12) et de son anneau d'eau, donc l'annonce ne peut
 * pas tomber au milieu du combat sur une esquive vers le nord.
 */
const PALE_TREE: Site = {
  id: 'pale-tree',
  map: 'rot',
  x: TREE.x,
  z: TREE.z,
  radius: TREE.baseRadius + 6.5,
}

/* --- L'Outremonde ------------------------------------------------------------ */

/**
 * Le Creuset — le dallage noir au centre du monde.
 *
 * Vingt unités : trois de plus que le rayon d'engagement de la Déchue, six de
 * plus que le dallage. Même réglage que les trois autres arènes, et même
 * raison.
 *
 * Le Sanctuaire, lui, n'a **pas** d'annonce, et c'est la seule omission
 * délibérée de cette table. Il en a déjà une : `BeyondArrival` monte un titre
 * plein écran pendant les cinq premières secondes de la première visite, et
 * c'est précisément là qu'un bandeau « Lieu découvert » se déclencherait,
 * puisqu'on apparaît au milieu du dallage. Deux annonces du même endroit dans
 * la même seconde, dont l'une dit déjà « Le Sanctuaire vous protège ».
 */
const CRUCIBLE: Site = {
  id: 'crucible',
  map: 'beyond',
  x: BEYOND_ARENA.x,
  z: BEYOND_ARENA.z,
  radius: BEYOND_ARENA.radius + 6,
}

/** Tous les lieux remarquables, toutes cartes confondues. */
export const SITES: readonly Site[] = [
  FORD,
  NAKANO_BRIDGE,
  ROTUNDA,
  WEST_GATE,
  SUMMIT,
  CAUSEWAY_SITE,
  ROOT_BASIN,
  PALE_TREE,
  CRUCIBLE,
]

/**
 * Les lieux d'une carte, rangés une fois pour toutes.
 *
 * La détection de proximité tourne à chaque frame et n'a aucune raison de
 * refiltrer neuf entrées soixante fois par seconde — ni, pire, de tester la
 * distance à un bassin du Marais pendant qu'on marche sur le continent.
 */
export const SITES_BY_MAP: Record<MapId, readonly Site[]> = {
  continent: SITES.filter((site) => site.map === 'continent'),
  sky: SITES.filter((site) => site.map === 'sky'),
  rot: SITES.filter((site) => site.map === 'rot'),
  beyond: SITES.filter((site) => site.map === 'beyond'),
}

/**
 * Vrai si cet identifiant de lieu est celui d'un lieu remarquable.
 *
 * Un prédicat de type et non une comparaison à l'appel : `discovered` mêle
 * monuments et lieux remarquables — c'est la même file, voir `PlaceId` — et le
 * HUD doit choisir dans quel dictionnaire lire le nom. Le faire ici, contre la
 * table elle-même, évite d'écrire ailleurs une seconde liste des identifiants
 * qui vieillirait sans prévenir.
 */
export function isSiteId(id: string): id is SiteId {
  return SITES.some((site) => site.id === id)
}
