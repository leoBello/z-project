import type { ChestId, ItemId } from '../types/game'
import { PYRAMID, type Landmark } from './landmarks'

/**
 * Coffres au trésor de la carte.
 *
 * Un coffre est décrit **dans le repère de son monument**, pas en coordonnées
 * monde : c'est le monument qui porte sa terrasse aplanie et son cap, et un
 * coffre posé en absolu se retrouverait dans le vide au premier réglage de
 * `PYRAMID.x`. La position monde et l'altitude s'en déduisent — le champ
 * `interact` est calculé, jamais écrit à la main, exactement comme pour les
 * points d'intérêt.
 */

export interface Chest {
  id: ChestId
  /** Monument qui porte le coffre : donne l'origine, le cap et l'altitude. */
  landmark: Landmark
  /** Position **locale**, au sol de la terrasse du monument. */
  local: [number, number]
  /** Cap local du coffre. Son couvercle s'ouvre vers +Z, face au joueur. */
  yaw: number
  /** Objet trouvé dedans. */
  item: ItemId
  /** Position monde du coffre, dérivée. */
  world: { x: number; y: number; z: number }
  /** Cap monde, dérivé. */
  worldYaw: number
  /** Distance à laquelle l'invite d'ouverture apparaît. */
  interactRadius: number
}

/** Passe du repère d'un monument au repère monde. Copié de `landmarks.ts`. */
function localToWorld(landmark: Landmark, localX: number, localZ: number) {
  const cos = Math.cos(landmark.yaw)
  const sin = Math.sin(landmark.yaw)
  return {
    x: landmark.x + localX * cos + localZ * sin,
    y: landmark.altitude,
    z: landmark.z - localX * sin + localZ * cos,
  }
}

function define(spec: Omit<Chest, 'world' | 'worldYaw'>): Chest {
  return {
    ...spec,
    world: localToWorld(spec.landmark, spec.local[0], spec.local[1]),
    worldYaw: spec.landmark.yaw + spec.yaw,
  }
}

/**
 * Coffre de la Pyramide — la tenue du clan.
 *
 * Posé en `[6.5, 10.5]` dans le repère de la pyramide, et les trois nombres
 * sont mesurés, pas choisis à l'œil :
 *
 *  - **z = 10,5 contre une base à 8** (demi-largeur du monument) le met deux
 *    unités et demie en avant du premier gradin, donc hors de tous ses
 *    colliders — et surtout visiblement *sur le parvis* plutôt que contre le
 *    mur. Une première version à `z = 9` le collait à l'angle sud-est, où il se
 *    lisait comme une pierre du monument ;
 *  - **6,5 unités séparent le coffre du marqueur bleu** du point d'intérêt, en
 *    local `[0, 11]`. Les deux zones d'interaction font 3 et 2,6 : leur somme
 *    vaut 5,6, elles ne peuvent donc pas se recouvrir. Sans cette marge, `F`
 *    aurait eu à arbitrer entre ouvrir le coffre et ouvrir le portfolio, et
 *    l'invite du HUD aurait clignoté entre les deux dans la zone commune ;
 *  - **12,3 unités du centre** le laissent sur la partie parfaitement plate de
 *    la terrasse (rayon 13), donc à l'altitude 4,3 exactement — un coffre à
 *    cheval sur le fondu du relief flotterait d'un côté et s'enfoncerait de
 *    l'autre.
 *
 * Le cap est légèrement de biais : posé d'équerre avec la pyramide, le coffre
 * se lisait comme une pièce du bâtiment plutôt que comme un objet déposé là.
 */
export const PYRAMID_CHEST = define({
  id: 'pyramid-chest',
  landmark: PYRAMID,
  local: [6.5, 10.5],
  yaw: -0.42,
  item: 'ninja-garb',
  interactRadius: 2.6,
})

/**
 * Minutage de la séquence d'ouverture, en millisecondes.
 *
 * Source unique de vérité, lue par deux mondes qui ne se connaissent pas : le
 * coffre 3D pour animer son couvercle, sa colonne de lumière et ses éclats, et
 * `ChestReveal` côté DOM pour savoir quand ouvrir la carte. Les deux étaient
 * réglés séparément dans une première version, et le moindre ajustement
 * désynchronisait la carte de l'animation qu'elle est censée conclure.
 *
 * Toute la séquence est chronométrée en **temps réel**, jamais sur l'horloge de
 * jeu : celle-ci est gelée dès l'appui, la phase passant à `paused`. C'est la
 * même contrainte que `TeleportOverlay`, pour la même raison.
 */
export const CHEST_SEQUENCE = {
  /** Bascule du couvercle : départ immédiat, dépassement puis stabilisation. */
  lidMs: 520,
  /** La colonne de lumière part après le couvercle, pas avec lui. */
  beamAt: 200,
  beamMs: 1000,
  /** Gerbe d'éclats, calée sur le jaillissement de la colonne. */
  shardsAt: 220,
  shardsMs: 950,
  /** L'objet s'élève du coffre une fois le couvercle franchement ouvert. */
  itemAt: 360,
  itemMs: 760,
  /**
   * Ouverture de la carte.
   *
   * Volontairement tardive : la carte recouvre l'écran, et l'ouvrir dès que
   * l'objet apparaît reviendrait à jouer l'animation derrière un rideau. Ce
   * palier laisse voir l'objet flotter une bonne demi-seconde tout seul.
   */
  cardAt: 1500,
} as const

export const CHESTS: readonly Chest[] = [PYRAMID_CHEST]

/** Retrouve un coffre par son identifiant. */
export function chestById(id: ChestId): Chest | undefined {
  return CHESTS.find((chest) => chest.id === id)
}
