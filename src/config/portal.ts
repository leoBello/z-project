import type { MapId } from '../types/game'
import { BEYOND_ARRIVAL_YAW, BEYOND_SPAWN } from './beyond'
import { PLAYER } from './gameplay'
import { NAKANO } from './landmarks'
import {
  MARSH_ARRIVAL_YAW,
  MARSH_BEYOND_ARRIVAL_YAW,
  MARSH_BEYOND_SPAWN,
  MARSH_SPAWN,
} from './rotMarsh'
import { SUMMIT_ARRIVAL_YAW, SUMMIT_SPAWN } from './skyMountain'
import { sampleHeight } from './world'

/**
 * Le portail de l'Île Céleste — où il se pose, et pourquoi là.
 *
 * Il n'a pas d'entrée dans `LANDMARKS` et c'est délibéré : un lieu de cette
 * table creuse une terrasse, interdit la végétation, paraît sur la minimap dès
 * la première frame et entre dans le menu de téléportation. Le portail n'existe
 * pas au début de la partie — l'inscrire là reviendrait à en annoncer
 * l'existence avant qu'il ne soit mérité. Il se décrit donc **dans le repère du
 * Temple de Nakano**, comme un coffre, et rien de la carte n'en dépend.
 */

/**
 * Distance devant la pagode, sur son axe avant (+Z local).
 *
 * Trois cotes de `NAKANO` encadrent ce nombre, et il est le seul à les
 * satisfaire toutes les trois :
 *
 *  - le dallage de l'îlot s'arrête à **4,5** de rayon. Au-delà, le portail se
 *    dresse sur la terre et non sur la pierre : il ne se lit pas comme une
 *    pièce du temple, ce qu'il n'est pas ;
 *  - le semis de végétation est interdit dans un rayon de **6** (`clearRadius`).
 *    En deçà, aucune touffe d'herbe ne peut pousser au travers de l'anneau ;
 *  - la terrasse est plate jusqu'à **4,2** puis se raccorde au relief sur 5
 *    unités. À 5,4 la pente est encore douce, et l'altitude est de toute façon
 *    relevée à l'exécution (voir `PORTAL.y`).
 */
const FORWARD = 5.4

/**
 * Position et cap du portail, en coordonnées **monde**.
 *
 * L'altitude est échantillonnée et non déduite de `NAKANO.altitude` : à 5,4 du
 * centre on est dans le raccord de la terrasse, où le terrain a déjà commencé à
 * redescendre. Interroger `sampleHeight` est le seul moyen de poser l'anneau
 * *sur* le sol que le joueur voit — c'est le même échantillonneur que le mesh,
 * le collider et les anneaux de mort, donc il n'existe pas de seconde version
 * du terrain où le portail flotterait.
 *
 * Le cap est celui du monument, sans correction : l'anneau est un disque
 * vertical, et sa normale doit regarder d'où l'on vient — c'est-à-dire la même
 * direction que la façade de la pagode, vers le pont au sud-ouest.
 */
export const PORTAL = (() => {
  const cos = Math.cos(NAKANO.yaw)
  const sin = Math.sin(NAKANO.yaw)
  const x = NAKANO.x + FORWARD * sin
  const z = NAKANO.z + FORWARD * cos
  return { x, y: sampleHeight(x, z), z, yaw: NAKANO.yaw }
})()

/**
 * Distance à laquelle le portail réagit à l'approche du joueur.
 *
 * Elle sert deux choses : l'anneau s'intensifie en deçà, comme la braise bleue
 * des monuments, et c'est aussi la zone où la touche d'interaction propose de le
 * franchir. Les deux partagent volontairement la même valeur — la lueur qui
 * monte *est* la promesse, il serait absurde qu'elle s'allume à une distance où
 * l'action n'est pas encore possible.
 */
export const PORTAL_NEAR_RADIUS = 7

/**
 * Où le portail **de Nakano** dépose sur l'île, en coordonnées monde de la carte
 * céleste.
 *
 * De Nakano et de lui seul, depuis que l'île a une seconde porte : on revient du
 * Marais au sommet de la montagne, pas ici. Voir `SUMMIT_SPAWN`. Ce point reste
 * en revanche l'apparition de toute la carte — c'est ici qu'on repose un joueur
 * tombé de l'île, d'où qu'il soit tombé.
 *
 * Plein sud, et c'est forcé : la caméra du jeu est fixe et regarde le nord (voir
 * la note de cap des monuments dans `landmarks.ts`). Arriver par le sud met
 * l'île entière dans le cadre, la porte de l'enceinte dans l'axe et l'arbre
 * au-dessus ; arriver par le nord mettrait tout cela dans le dos.
 *
 * L'altitude est celle de la prairie — le zéro de cette carte — plus la
 * demi-hauteur de la capsule et son rayon : la même relation qu'utilise
 * `TeleportOverlay` pour poser le joueur ni enfoncé ni flottant.
 */
export const SKY_SPAWN = {
  x: 0,
  y: PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius,
  z: 48,
}

/**
 * Le portail du retour, jumeau de celui de Nakano.
 *
 * Quatre unités et demie derrière le point d'apparition : le joueur en sort face
 * au nord, donc face à l'île, et le portail reste dans son dos — ce qu'on attend
 * d'une porte qu'on vient de franchir.
 *
 * Il est actif dès l'arrivée. Ce n'est pas une facilité : tant que le boss
 * n'existe pas, une île sans sortie est un cul-de-sac dont on ne s'échappe qu'en
 * rechargeant la page. Le jour où il y aura une victoire à remporter, c'est ici
 * qu'on posera la condition.
 */
export const SKY_PORTAL = {
  x: SKY_SPAWN.x,
  y: SKY_SPAWN.y - (PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius),
  z: SKY_SPAWN.z + 4.5,
  // Cap opposé à celui du portail de Nakano : sa normale regarde le sud, donc
  // le joueur qui en sort lui tourne le dos et fait face à l'île.
  yaw: Math.PI,
}

/**
 * Point d'apparition d'une carte donnée.
 *
 * **Une seule table pour trois consommateurs** : la transition entre cartes, le
 * filet de sécurité de chute de `Player.tsx`, et la réapparition sur l'île. Les
 * trois répondent à la même question — « où remet-on le joueur sur cette
 * carte ? » — et la laisser se recopier garantirait qu'un jour l'un d'eux
 * dépose le joueur au spawn du continent alors qu'il est dans le ciel.
 */
const CONTINENT_SPAWN = {
  x: PLAYER.spawn[0],
  y: PLAYER.spawn[1],
  z: PLAYER.spawn[2],
}

const SPAWNS: Record<MapId, { x: number; y: number; z: number }> = {
  continent: CONTINENT_SPAWN,
  sky: SKY_SPAWN,
  rot: MARSH_SPAWN,
  // L'Outremonde ne remet nulle part ailleurs qu'au Sanctuaire, et il n'y a
  // aucune exception à prévoir : c'est la seule zone franche de la carte, donc
  // le seul endroit où reposer quelqu'un ait un sens — qu'il soit tombé du
  // monde, ou tombé tout court. Voir `damagePlayer` dans le store.
  beyond: BEYOND_SPAWN,
}

export function spawnFor(map: MapId) {
  return SPAWNS[map]
}

/**
 * Où le joueur ressort du portail de Nakano, en revenant de l'île.
 *
 * Trois unités **au-delà** du portail sur son axe, c'est-à-dire du côté d'où
 * l'on arrive à pied : le joueur en sort dos à l'anneau, face au pont, comme
 * quiconque vient de franchir une porte. Le poser sur l'anneau même l'aurait
 * fait apparaître dans une géométrie qu'il traverse, et le poser derrière
 * l'aurait envoyé contre la pagode.
 */
const RETURN_STEP = 3

const CONTINENT_RETURN = (() => {
  const x = PORTAL.x + RETURN_STEP * Math.sin(NAKANO.yaw)
  const z = PORTAL.z + RETURN_STEP * Math.cos(NAKANO.yaw)
  return {
    x,
    // Le sol réel, comme pour le portail lui-même : on est dans le raccord de
    // la terrasse, où l'altitude du monument ne vaut plus.
    y: sampleHeight(x, z) + PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius,
    z,
  }
})()

/**
 * Où un **voyage** dépose, par opposition à `spawnFor`, qui dit où l'on
 * **réapparaît** après une chute.
 *
 * Deux questions différentes, et les confondre était une erreur qui se voyait
 * tout de suite : revenir de l'île renvoyait le joueur au point de départ de la
 * partie, au centre du continent, à cent trente unités du portail qu'il venait
 * de franchir. Une porte ramène là d'où l'on est parti ; c'est même à peu près
 * la seule chose qu'on attende d'une porte.
 */
const ARRIVALS: Record<MapId, { x: number; y: number; z: number }> = {
  continent: CONTINENT_RETURN,
  sky: SKY_SPAWN,
  // Comme le Marais, l'Outremonde n'a qu'une porte : on y arrive et on en repart
  // par le même anneau. Arrivée et apparition pointent donc volontairement sur
  // le même objet.
  beyond: BEYOND_SPAWN,
  // Le Marais n'a qu'une porte : on y arrive et on en repart par le même
  // anneau. Son point d'arrivée est donc aussi son point d'apparition, et les
  // deux tables pointent volontairement sur le même objet — il n'y a pas ici la
  // distinction « voyage » / « chute » qui a coûté un bug sur le continent,
  // parce qu'il n'y a qu'un seul endroit où remettre le joueur.
  rot: MARSH_SPAWN,
}

/**
 * Deux cartes du jeu ont **deux** portes : le Marais, depuis qu'il mène à
 * l'Outremonde, et l'Île Céleste, depuis qu'elle mène au Marais.
 *
 * D'où le second paramètre : la destination ne suffit plus à dire où déposer,
 * il faut savoir d'où l'on vient. Une table `Record<MapId, …>` par carte
 * d'origine aurait été seize entrées pour deux exceptions ; un paramètre
 * facultatif dit exactement ce qui est vrai — « en général la carte suffit,
 * sauf ici ».
 *
 * Les deux exceptions corrigent le même défaut, et c'est le troisième
 * exemplaire d'une série : sans elles, revenir déposait à l'arrivée *générale*
 * de la carte, à cent trente unités de l'anneau qu'on venait de franchir, avec
 * tout le chemin à refaire dans le mauvais sens. Le retour de l'Île Céleste
 * l'avait connu en premier, celui de l'Outremonde ensuite, celui du Marais en
 * dernier. Une porte ramène là d'où l'on est parti ; c'est même à peu près la
 * seule chose qu'on attende d'une porte.
 */
export function arrivalFor(map: MapId, from?: MapId) {
  if (map === 'rot' && from === 'beyond') return MARSH_BEYOND_SPAWN
  if (map === 'sky' && from === 'rot') return SUMMIT_SPAWN
  return ARRIVALS[map]
}

/**
 * Cap à l'arrivée, pour que le joueur sorte **dos au portail**.
 *
 * Sur l'île, l'anneau est au sud du point d'arrivée : on regarde donc le nord,
 * c'est-à-dire l'île. À Nakano, l'anneau regarde le sud-ouest et l'on en sort de
 * ce côté : on garde le cap du monument, et l'on fait face au pont.
 */
const ARRIVAL_YAWS: Record<MapId, number> = {
  continent: NAKANO.yaw,
  sky: Math.PI,
  // Plein nord, dos à l'anneau : le monde entier est devant. Même valeur et
  // même raison que l'île — la caméra est fixe et regarde le nord.
  beyond: BEYOND_ARRIVAL_YAW,
  // Face au sud, c'est-à-dire face à l'Arbre blafard. Toute la mise en scène de
  // cette carte tient dans ce cap : on arrive, et la seule chose verticale du
  // paysage est déjà dans l'axe du regard.
  rot: MARSH_ARRIVAL_YAW,
}

export function arrivalYaw(map: MapId, from?: MapId) {
  // Les mêmes exceptions, et elles doivent être ici aussi : déposer au bon
  // endroit avec le cap de l'autre porte ferait sortir le joueur face à
  // l'Arbre, ou, au sommet, face au nord du monde sur un plateau dont la
  // descente s'ouvre au sud de la voie — c'est-à-dire, dans les deux cas, dos
  // au chemin qu'il doit reprendre.
  if (map === 'rot' && from === 'beyond') return MARSH_BEYOND_ARRIVAL_YAW
  if (map === 'sky' && from === 'rot') return SUMMIT_ARRIVAL_YAW
  return ARRIVAL_YAWS[map]
}
