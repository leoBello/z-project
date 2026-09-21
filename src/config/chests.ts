import type { ChestId, ItemId, MapId } from '../types/game'
import { NAKANO, PYRAMID, RUINS, STATUE, STELE, TEMPLE, type Landmark } from './landmarks'
import {
  CORE_Y,
  ROTUNDA_RUINED_BAYS,
  rotundaPierAngle,
  surfaceRelief,
  topHeight,
} from './skyIsland'
import {
  MOUNT_X,
  MOUNT_Z,
  mountainHeightAt,
  SPUR_YAW,
  spurToWorld,
} from './skyMountain'

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

/**
 * Un coffre, tel que le reste du jeu le voit.
 *
 * Il ne porte **pas** son monument, ni sa position locale, ni son cap local :
 * ce sont des données d'entrée de `define`, pas des champs de l'objet. La
 * distinction est devenue nécessaire avec le coffre de la rotonde, qui n'a pas
 * de monument — la rotonde n'en est pas un et ne doit pas en devenir un, voir
 * `HeartSourceId`. Un `landmark` optionnel aurait obligé chaque lecteur à
 * traiter un cas qu'aucun d'eux ne regarde : personne, hors de ce fichier, ne
 * lit autre chose que la position monde, l'objet et le rayon.
 */
export interface Chest {
  id: ChestId
  /**
   * Carte qui porte le coffre.
   *
   * Les deux cartes montent des composants différents et ne sont jamais
   * affichées ensemble : sans ce champ, `Landmarks` poserait le coffre de la
   * rotonde au milieu du continent, à son altitude de 7,2 — donc en l'air.
   */
  map: MapId
  /** Objet trouvé dedans. */
  item: ItemId
  /** Position monde du coffre. */
  world: { x: number; y: number; z: number }
  /** Cap monde. Son couvercle s'ouvre vers +Z local, face au joueur. */
  worldYaw: number
  /** Distance à laquelle l'invite d'ouverture apparaît. */
  interactRadius: number
}

/** Ce qu'un coffre posé sur un monument déclare. Voir `define`. */
interface LandmarkChestSpec {
  id: ChestId
  /** Monument qui porte le coffre : donne l'origine, le cap et l'altitude. */
  landmark: Landmark
  /** Position **locale**, au sol de la terrasse du monument. */
  local: [number, number]
  /** Cap **local** du coffre. */
  yaw: number
  item: ItemId
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

function define(spec: LandmarkChestSpec): Chest {
  return {
    id: spec.id,
    // Tous les monuments sont sur le continent, et c'est structurel : un
    // monument creuse une terrasse dans le relief du continent, entre dans la
    // minimap et dans le menu de téléportation. Un coffre posé sur l'un d'eux
    // ne peut donc pas être ailleurs.
    map: 'continent',
    item: spec.item,
    interactRadius: spec.interactRadius,
    world: localToWorld(spec.landmark, spec.local[0], spec.local[1]),
    worldYaw: spec.landmark.yaw + spec.yaw,
  }
}

/**
 * Coffre du Temple — la tenue du Chasseur de Pirates.
 *
 * Posé en `[6.2, 7.6]` dans le repère du temple, sur le parvis, à côté du pied
 * de l'escalier. Les trois nombres sont mesurés, pas choisis à l'œil :
 *
 *  - **il doit se voir depuis la braise bleue**, qui est en local `[0, 9.8]`.
 *    C'est la contrainte qui commande tout le reste : le coffre est donc sur le
 *    même parvis que le marqueur, à la même altitude, et du côté de la façade —
 *    rien du bâtiment ne s'interpose entre les deux. Il est aussi **au sud du
 *    temple en coordonnées monde**, seul côté que la caméra, fixe et tournée
 *    vers le nord, montre d'un monument de cette hauteur : depuis le marqueur, il
 *    tombe dans le bas du cadre plutôt que derrière dix mètres de colonnade ;
 *  - **6,58 unités séparent le coffre du marqueur.** Les deux zones
 *    d'interaction font 3 et 2,6 : leur somme vaut 5,6, elles ne peuvent donc
 *    pas se recouvrir. Sans cette marge, `F` aurait eu à arbitrer entre ouvrir
 *    le coffre et ouvrir le portfolio, et l'invite du HUD aurait clignoté entre
 *    les deux dans la zone commune ;
 *  - **9,81 unités du centre** le laissent sur la partie parfaitement plate de
 *    la terrasse (rayon 11) : ses angles, à 10,76, y tiennent encore. Un coffre à
 *    cheval sur le fondu du relief flotterait d'un côté et s'enfoncerait de
 *    l'autre. Il est par ailleurs hors de tous les colliders du monument — le
 *    stylobate s'arrête à 5,2 en Z et la rampe de l'escalier à 3 en X.
 *
 * Le cap est tourné de biais vers l'escalier, donc vers le joueur qui monte :
 * posé d'équerre avec le temple, le coffre se lisait comme une pièce du
 * bâtiment plutôt que comme un objet déposé là.
 */
export const TEMPLE_CHEST = define({
  id: 'temple-chest',
  landmark: TEMPLE,
  local: [6.2, 7.6],
  yaw: -0.5,
  item: 'zoro-garb',
  interactRadius: 2.6,
})

/**
 * Coffre de la Pyramide — la tenue du Clan.
 *
 * Posé en `[6.5, 10.5]` dans le repère de la pyramide, et les trois nombres
 * sont mesurés, pas choisis à l'œil :
 *
 *  - **z = 10,5 contre une base à 8** (demi-largeur du monument) le met deux
 *    unités et demie en avant du premier gradin, donc hors de tous ses
 *    colliders — et surtout visiblement *sur le parvis* plutôt que contre le
 *    mur. Une première version à `z = 9` le collait à l'angle sud-est, où il se
 *    lisait comme une pierre du monument ;
 *  - **6,52 unités séparent le coffre du marqueur bleu** du point d'intérêt, en
 *    local `[0, 11]`. Les deux zones d'interaction font 3 et 2,6 : leur somme
 *    vaut 5,6, elles ne peuvent donc pas se recouvrir. Sans cette marge, `F`
 *    aurait eu à arbitrer entre ouvrir le coffre et ouvrir le portfolio, et
 *    l'invite du HUD aurait clignoté entre les deux dans la zone commune ;
 *  - **12,3 unités du centre** le laissent sur la partie parfaitement plate de
 *    la terrasse (rayon 13), donc à l'altitude 4,3 exactement — un coffre à
 *    cheval sur le fondu du relief flotterait d'un côté et s'enfoncerait de
 *    l'autre.
 *
 * Il est par ailleurs **au sud du monument** en coordonnées monde — `z = 46,5`
 * pour un centre à 36 — seul côté que la caméra, fixe et tournée vers le nord,
 * montre d'un bâtiment de cette hauteur.
 *
 * Le cap est légèrement de biais : posé d'équerre avec la pyramide, le coffre
 * se lisait comme une pièce du bâtiment plutôt que comme un objet déposé là.
 */
export const PYRAMID_CHEST = define({
  id: 'pyramid-chest',
  landmark: PYRAMID,
  local: [6.5, 10.5],
  yaw: -0.42,
  item: 'madara-garb',
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

/**
 * Coffre de Nakano — le katana de Kusanagi.
 *
 * Posé en `[3.75, 1.2]` dans le repère de la pagode, et les deux nombres sont
 * contraints, pas choisis :
 *
 *  - **3,75 en X** parce que le socle du temple fait 2,95 de demi-côté et le
 *    coffre 0,675 de demi-largeur : à 3,7 leurs emprises se touchaient encore.
 *    Le coffre est donc juste en dehors du socle, sur le dallage ;
 *  - **3,94 du centre au total**, angles du coffre à 4,4 : le plateau de l'îlot
 *    est plat à la valeur près jusqu'à 4,7 (terrasse de `NAKANO`), le coffre ne
 *    peut donc ni flotter ni s'enfoncer d'un côté.
 *
 * Aucune règle de priorité à arbitrer ici, contrairement au coffre du Temple
 * du Sommet : le temple de Nakano ne présente aucune section de portfolio, il
 * n'a donc pas de zone d'interaction qui pourrait se recouvrir avec celle du
 * coffre.
 *
 * Le joueur débarque du pont en `[0, 5.7]` local, c'est-à-dire pile dans l'axe
 * de la façade : le coffre est alors sur sa droite, et au **sud** du monument —
 * le seul côté que la caméra, fixe et tournée vers le nord, montre d'un
 * bâtiment de dix unités de haut.
 */
export const NAKANO_CHEST = define({
  id: 'nakano-chest',
  landmark: NAKANO,
  local: [3.75, 1.2],
  // De biais vers l'arrivée : d'équerre avec la pagode, le coffre se serait lu
  // comme une pièce du bâtiment. Même raison que pour celui du Temple.
  yaw: -0.55,
  item: 'kusanagi',
  interactRadius: 2.6,
})

/**
 * Coffre de la Grande Stèle — la lame maudite.
 *
 * Posé en `[-5.5, -1.0]` sur la terrasse, à mi-chemin entre le pied de la stèle
 * et le bord. Les deux nombres sortent des trois mêmes contraintes que les
 * coffres précédents :
 *
 *  - **5,59 du centre**, angles du coffre à 6,41 : la terrasse est plate
 *    jusqu'à 7 (`STELE.radius`), le coffre ne peut donc ni flotter ni
 *    s'enfoncer d'un côté ;
 *  - **7,78 séparent le coffre du marqueur**, posé en local `[0, 4.5]`. Les
 *    deux zones d'interaction font 3 et 2,6 : leur somme vaut 5,6, elles ne
 *    peuvent donc pas se recouvrir, et `F` n'a jamais à arbitrer entre ouvrir
 *    le coffre et ouvrir le panneau des compétences ;
 *  - **au sud-est du monument** en coordonnées monde — `(-21,6 ; 32,4)` pour un
 *    centre à `(-25 ; 28)`. C'est la contrainte qui a décidé du **signe** des
 *    deux coordonnées locales : `[5.5, 1.0]` satisfaisait les deux premières
 *    mais tombait au *nord*, derrière le monument, et la caméra est fixe et
 *    tournée vers le nord. Un coffre posé là est un coffre que personne ne
 *    voit.
 *
 * Le cap est tourné vers le marqueur, donc vers le joueur qui vient de lire la
 * stèle : c'est de là qu'on arrive, et un coffre d'équerre avec la terrasse se
 * serait lu comme une pièce du dallage.
 */
export const STELE_CHEST = define({
  id: 'stele-chest',
  landmark: STELE,
  local: [-5.5, -1.0],
  yaw: 0.72,
  item: 'cursed-blade',
  interactRadius: 2.6,
})

/**
 * Coffre de l'Idole des Terres Arides — le papyrus.
 *
 * **Le dernier point d'intérêt de la carte à en recevoir un**, et c'est ce qui
 * l'a décidé : les quatre autres monuments à section gardaient chacun sa
 * trouvaille, l'idole seule n'avait rien à donner à qui montait jusqu'à elle.
 *
 * Posé en `[5.4, -1.2]` dans son repère, et les trois nombres se mesurent
 * exactement comme ceux des cinq autres coffres du continent :
 *
 *  - **5,53 unités du centre**, angles du coffre à 6,35 : la terrasse est plate
 *    jusqu'à 7 (`STATUE.radius`), donc à l'altitude 3,4 exactement. Un coffre à
 *    cheval sur le fondu du relief flotterait d'un côté et s'enfoncerait de
 *    l'autre. Il est au passage bien au large du socle de l'idole, dont le
 *    collider fait 2,3 de rayon ;
 *  - **7,85 séparent le coffre du marqueur**, posé en local `[0, 4.5]`. Les
 *    deux zones d'interaction font 3 et 2,6 : leur somme vaut 5,6, elles ne
 *    peuvent donc pas se recouvrir, et `F` n'a jamais à arbitrer entre ouvrir le
 *    coffre et ouvrir la page du parcours ;
 *  - **au sud du monument** en coordonnées monde — `(39,8 ; 1,2)` pour un
 *    centre à `(38 ; -4)`. C'est la contrainte qui a décidé du **signe** de la
 *    coordonnée locale en X : l'idole regarde l'ouest, son repère local tourne
 *    donc presque d'un quart de tour, et `-5.4` aurait posé le coffre plein
 *    nord, derrière la pierre. La caméra est fixe et tournée vers le nord ; un
 *    coffre posé là est un coffre que personne ne voit.
 *
 * Le cap est tourné vers le marqueur, donc vers le joueur qui vient de lire le
 * parcours — et de biais d'un vingtième de radian, comme les cinq autres :
 * d'équerre avec la terrasse, le coffre se serait lu comme une pièce du
 * dallage plutôt que comme un objet déposé là.
 */
export const STATUE_CHEST = define({
  id: 'statue-chest',
  landmark: STATUE,
  local: [5.4, -1.2],
  yaw: -0.72,
  item: 'konami-papyrus',
  interactRadius: 2.6,
})

/**
 * Coffre des Ruines de l'Île — les écailles.
 *
 * **Le placement le plus contraint de la carte**, et le seul qui ait dû se
 * plier au relief plutôt que l'inverse : les ruines n'ont pas de terrasse
 * (`RUINS.radius` vaut zéro, voir la note qui l'explique). Le plateau naturel
 * de l'île est plat *à la valeur près* jusqu'à 5,2 seulement, puis il plonge —
 * c'est mesuré, et c'est déjà ce qui avait fait resserrer le dallage pour que
 * la braise ne flotte pas.
 *
 * Le coffre tient donc dans une couronne étroite :
 *
 *  - **4,3 du centre**, angles à 5,12 : ils tiennent dans la zone strictement
 *    plate, à huit centimètres près. Un coffre posé dix centimètres plus loin
 *    aurait un angle dans la pente ;
 *  - **9,1 du marqueur**, posé en local `[0, 4.8]` : le coffre est à l'opposé
 *    exact, la marge sur les 5,6 nécessaires est confortable pour une fois.
 *
 * Le placement raconte quelque chose, et c'est la raison d'avoir mis *cet*
 * objet *là* : **ce qui rend la mer gratuite est de l'autre côté de la mer.**
 * On arrive par le gué, au ralenti ; la braise fait face à l'arrivée, le coffre
 * est derrière les ruines ; et toutes les traversées suivantes sont libres.
 * L'île est le seul endroit de la carte qui permette cette leçon.
 */
export const RUINS_CHEST = define({
  id: 'ruins-chest',
  landmark: RUINS,
  local: [0, -4.3],
  // De biais, comme les autres. Le joueur contourne les ruines pour arriver,
  // il n'aborde donc pas le coffre de face.
  yaw: 2.8,
  item: 'fishman-scales',
  interactRadius: 2.6,
})

/**
 * Coffre de la rotonde — le manteau de l'Aube, et le seul coffre du jeu qui ne
 * soit pas posé sur un monument.
 *
 * Il est **dans l'axe d'une des deux travées écroulées**, à 7,5 unités du
 * centre, et les trois nombres sont contraints :
 *
 *  - **la travée, parce que c'est l'entrée.** Les huit autres travées sont des
 *    vides entre deux piliers debout ; les deux écroulées sont les seuls
 *    passages lisibles de la colonnade, et ce sont elles que les barrières de
 *    l'arène viennent fermer pendant le combat. Un coffre dans cet axe est un
 *    coffre devant lequel on passe en sortant, sans avoir à le chercher ;
 *  - **la travée 7 et non la 3.** Son axe pointe vers `(-0,95 ; +0,31)`, donc
 *    vers le sud-ouest : le coffre tombe du côté de la caméra, qui est fixe et
 *    tournée vers le nord. Celui de la travée 3 serait derrière le cœur de
 *    l'île, à `z = -6`, c'est-à-dire hors du cadre depuis le centre de l'arène ;
 *  - **7,5 du centre** le laissent sur le dallage plat — la rotonde tient
 *    jusqu'à 11,5 — et surtout à bonne distance du réceptacle de cœur, qui est
 *    posé là où le corps du Lynel est tombé. Le gardien se recentre sans cesse
 *    pendant le combat (`RECENTER_RADIUS`), il tombe donc presque toujours près
 *    du milieu ; 7,5 est la distance qui sépare franchement les deux
 *    récompenses sans envoyer celle-ci contre la colonnade.
 *
 * Le cap est tourné de biais vers le sud plutôt que d'équerre avec la travée :
 * d'équerre, le coffre se serait lu comme une pièce de la ruine. Même règle que
 * les cinq autres.
 *
 * Il n'a **pas** de garde d'apparition ici : c'est `RotundaChest` qui ne le
 * monte qu'une fois le gardien vaincu. La table décrit où sont les choses, pas
 * quand elles existent.
 */
/** Où le coffre de la Voie se pose, en polaire. Voir `ROAD_CHEST`. */
const ROAD_R = 25
const ROAD_THETA = 0

const ROTUNDA_BAY = (rotundaPierAngle(ROTUNDA_RUINED_BAYS[1]) + rotundaPierAngle(ROTUNDA_RUINED_BAYS[1] + 1)) / 2

export const ROTUNDA_CHEST: Chest = {
  id: 'rotunda-chest',
  map: 'sky',
  item: 'dawn-cloak',
  world: {
    x: Math.sin(ROTUNDA_BAY) * 7.5,
    y: CORE_Y,
    z: Math.cos(ROTUNDA_BAY) * 7.5,
  },
  worldYaw: ROTUNDA_BAY + 0.45,
  interactRadius: 2.6,
}

/**
 * Coffre de la Voie — l'Armure du Dieu Démon.
 *
 * Posé **dans l'axe exact de la rampe d'arrivée**, à 25 unités du centre de
 * l'île, c'est-à-dire 4,5 après l'arche de l'enceinte. C'est le seul coffre du
 * jeu qu'on ne puisse pas manquer, et c'est la raison d'être de sa position :
 * il faut que le joueur trouve l'armure **avant** le Lynel, pas après, sinon
 * elle ne sert plus à rien.
 *
 * Les trois nombres sont mesurés, pas choisis à l'œil :
 *
 *  - **θ = 0**, plein sud. C'est à la fois le cap du portail d'arrivée
 *    (`SKY_SPAWN` est en `z = 48`), celui de la porte de l'enceinte, et un
 *    couloir de rampe extérieure (`RAMPS_OUTER` commence à zéro). Ce dernier
 *    point n'est pas un détail : le semis de végétation s'interdit les couloirs
 *    de rampe, **la voie est donc nue par construction** et aucune touffe ne
 *    poussera jamais au travers du coffre ;
 *  - **r = 25** parce que le jardin y est plat *à la valeur près* — c'est le
 *    point de crête du relief de surface sur cet axe, pente mesurée nulle. Un
 *    coffre à cheval sur une bosse flotterait d'un côté et s'enfoncerait de
 *    l'autre. Il est aussi à 4,5 de l'arche, dont les piédroits sont en
 *    `x = ±2,25` : le coffre, large de 1,35, passe au large ;
 *  - **13,5 le séparent du dallage de l'arène** (rayon 11,5), que le Lynel ne
 *    quitte jamais. On s'équipe donc en paix, et la seule autre zone
 *    d'interaction de la carte — le portail du retour, rayon 7 — est à 27,5.
 *    Aucune concurrence possible sur la touche d'action.
 *
 * L'altitude n'est pas écrite mais **échantillonnée sur le relief**, par les
 * deux mêmes fonctions que le maillage et le collider de l'île. C'est la seule
 * façon qu'elle ne mente pas au prochain réglage du terrain — et le seul
 * moyen, ici, puisque ce coffre n'a pas de monument dont hériter une terrasse.
 *
 * Le cap est de biais d'un cinquième de radian : d'équerre avec la voie, le
 * coffre se lisait comme une borne du dallage plutôt que comme un objet posé
 * là. C'est la même correction que pour les cinq coffres du continent.
 */
export const ROAD_CHEST: Chest = {
  id: 'road-chest',
  map: 'sky',
  item: 'demon-armor',
  world: {
    x: Math.sin(ROAD_THETA) * ROAD_R,
    y: topHeight(ROAD_R, ROAD_THETA) + surfaceRelief(ROAD_R, ROAD_THETA),
    z: Math.cos(ROAD_THETA) * ROAD_R,
  },
  worldYaw: ROAD_THETA + 0.2,
  interactRadius: 2.6,
}

/** Écart à l'axe et recul au sud, dans le repère de la montagne. Voir `summitChest`. */
const SUMMIT_CHEST_X = 3.4
const SUMMIT_CHEST_Z = 3.6

/**
 * Les deux coffres du sommet — ce que gardait le Lynel doré.
 *
 * Ils ne paraissent qu'à sa chute (c'est `SummitChests` qui les monte, comme
 * `RotundaChest` pour celui de la rotonde : cette table dit où sont les choses,
 * pas quand elles existent), et ils sont **les seuls coffres jumeaux du jeu**.
 * Tous les autres sont uniques et se trouvent seuls ; ceux-ci s'ouvrent l'un
 * après l'autre, à six mètres d'écart, et c'est voulu — l'armure et la lame
 * forment un équipement, et les séparer aurait fait de la seconde trouvaille un
 * détour.
 *
 * **Leur distance au portail n'est pas décorative : elle est imposée.** La règle
 * d'interaction donne la priorité au portail sur le coffre (voir `pick` dans
 * `store/interaction.ts`), et l'anneau réagit à sept unités — un coffre posé à
 * son pied serait donc *visible et inouvrable*, l'invite du HUD proposant de
 * franchir le portail à l'endroit exact où l'on veut ouvrir un couvercle. Les
 * deux zones doivent donc être disjointes : 7 pour le portail, 2,6 pour le
 * coffre, il faut **9,6 unités** au minimum. Les coffres en sont à 10,18, ce qui
 * laisse une demi-unité de marge.
 *
 * C'est aussi ce qui décide de *leur* écart : leurs deux zones d'interaction
 * font 2,6 chacune, il leur faut donc 5,2 entre eux, et ils en ont 6,8.
 *
 * Le reste des cotes suit les mêmes contraintes que les six autres coffres :
 *
 *  - **4,95 unités du centre du plateau**, angles du coffre à 5,8 : le sommet
 *    est plat à la valeur près jusqu'à 8,9 — au-delà, le raccord qui protège
 *    l'arène de la spire commence à mordre (voir `shoulder` dans
 *    `skyMountain.ts`). Aucun des deux ne peut donc flotter ni s'enfoncer ;
 *  - **ils encadrent l'axe qui mène au portail.** La spire débouche au sud du
 *    plateau, le portail est au nord : le joueur qui se relève du combat passe
 *    **entre les deux** pour rentrer. Aucun des deux ne se cherche, et aucun des
 *    deux ne barre le chemin ;
 *  - **au sud du centre en coordonnées monde**, comme les six autres : c'est le
 *    seul côté que la caméra, fixe et tournée vers le nord, montre franchement.
 *
 * L'altitude est **échantillonnée sur le relief de la montagne**, par la même
 * fonction que son maillage et son collider, comme celle du coffre de la Voie
 * l'est sur celui de l'île : c'est la seule façon qu'elle ne mente pas au
 * prochain réglage du terrain.
 *
 * Le cap est de biais, et les deux se tournent **vers l'axe** : d'équerre, ils
 * se seraient lus comme deux bornes du dallage plutôt que comme deux objets
 * déposés là. Même correction que pour les six autres.
 */
function summitChest(id: ChestId, item: ItemId, side: 1 | -1): Chest {
  const at = spurToWorld(MOUNT_X + side * SUMMIT_CHEST_X, MOUNT_Z + SUMMIT_CHEST_Z)
  return {
    id,
    map: 'sky',
    item,
    world: { x: at.x, y: mountainHeightAt(at.x, at.z), z: at.z },
    // Le cap se dit dans le repère de la voie, comme celui du portail du
    // sommet : « faire face à qui monte » n'a de sens que là. Un lacet de biais,
    // tourné vers l'intérieur — d'où le signe opposé à celui du côté.
    worldYaw: SPUR_YAW - side * 0.4,
    interactRadius: 2.6,
  }
}

export const SUMMIT_ARMOR_CHEST = summitChest('summit-armor-chest', 'vader-armor', -1)
export const SUMMIT_SABER_CHEST = summitChest('summit-saber-chest', 'vader-saber', 1)

/**
 * Les deux coffres que la chute de Malenia fait paraître dans le bassin.
 *
 * Le décalage est le même que celui des coffres du sommet, et pour une raison
 * qu'on ne devine pas : le portail de retour est au bord du bassin et son anneau
 * réagit à sept unités, or **le portail l'emporte sur le coffre** dans la règle
 * de priorité d'`interaction.ts`. Deux coffres posés dans son rayon auraient été
 * visibles et inouvrables.
 *
 * Ils encadrent l'axe qui mène de la chaussée au tronc, à six unités de part et
 * d'autre du centre et quatre en avant : le joueur qui vient de la gagner les
 * voit tous les deux sans avoir à chercher, et ils ne sont ni sur le corps de
 * Malenia — où le réceptacle se pose — ni dans l'anneau d'eau de la lèvre.
 */
function marshChest(id: ChestId, item: ItemId, side: 1 | -1): Chest {
  return {
    id,
    map: 'rot',
    item,
    // Le dallage du bassin est à 0,45, et `TreasureChest` pose son socle sur
    // l'altitude qu'on lui donne : c'est la surface, pas le sol nu du marais.
    world: { x: side * 6, y: 0.45, z: 4 },
    // Tournés vers l'intérieur, comme ceux du sommet : deux coffres parallèles
    // se lisent comme deux bornes plutôt que comme deux objets déposés là.
    worldYaw: side * 0.42,
    interactRadius: 2.6,
  }
}

export const AEONIA_KING_CHEST = marshChest('aeonia-king-chest', 'meruem-garb', -1)
export const AEONIA_THIEF_CHEST = marshChest('aeonia-thief-chest', 'kuroro-garb', 1)

export const CHESTS: readonly Chest[] = [
  TEMPLE_CHEST,
  PYRAMID_CHEST,
  NAKANO_CHEST,
  STELE_CHEST,
  STATUE_CHEST,
  RUINS_CHEST,
  // Recensé avec les autres bien qu'il vive sur l'autre carte : `chestById` est
  // la seule façon dont le store retrouve l'objet d'un coffre qu'on vient
  // d'ouvrir, et il lit cette table. Le champ `map` suffit à ce que personne ne
  // le pose au mauvais endroit.
  ROTUNDA_CHEST,
  ROAD_CHEST,
  SUMMIT_ARMOR_CHEST,
  SUMMIT_SABER_CHEST,
  AEONIA_KING_CHEST,
  AEONIA_THIEF_CHEST,
]

/** Retrouve un coffre par son identifiant. */
export function chestById(id: ChestId): Chest | undefined {
  return CHESTS.find((chest) => chest.id === id)
}
