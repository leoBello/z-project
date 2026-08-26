import type { LandmarkId } from '../types/game'

/**
 * Points d'intérêt : les lieux construits de la carte.
 *
 * Ce fichier ne décrit que *où* et *comment* un monument s'inscrit dans le
 * monde. Sa géométrie vit dans son propre composant, et son nom affiché dans
 * `src/i18n/*.json`, sous `ui.landmarks`. Quatre systèmes lisent cette table
 * sans se connaître : `sampleHeight` y creuse la terrasse, le semis de
 * végétation s'y interdit de pousser, la minimap y pose un repère, et le
 * panneau du portfolio y trouve quelle section afficher.
 */

/** Sections du portfolio adressables par un point d'intérêt. */
export type PortfolioSection = 'projects' | 'bio' | 'skills' | 'background' | 'contact'

export interface Landmark {
  id: LandmarkId
  /** Centre du monument, au sol. */
  x: number
  z: number
  /**
   * Cap du bâtiment. L'avant du modèle est +Z, comme partout dans le projet,
   * donc `yaw` s'obtient par `atan2(dir.x, dir.z)`.
   *
   * Les monuments tournent leur façade vers l'endroit d'où le joueur arrive.
   * Attention toutefois : la caméra est **fixe et regarde le nord**, donc un
   * monument assez haut pour se masquer lui-même doit présenter sa façade au
   * sud, quel que soit l'itinéraire d'approche — voir la pyramide.
   */
  yaw: number
  /**
   * Terrasse aplanie sous le monument : rayon de la partie parfaitement plate,
   * puis largeur du raccord vers le relief naturel.
   *
   * On aplanit le *terrain* plutôt que de poser un socle sous le bâtiment. Le
   * mesh, le collider physique, le semis et la minimap interrogent tous
   * `sampleHeight` : creuser la terrasse là-dedans garantit qu'ils voient
   * exactement la même plate-forme. Un socle côté modèle 3D aurait été une
   * seconde source de vérité, et le joueur aurait marché à côté.
   */
  radius: number
  blend: number
  /** Altitude de la terrasse. */
  altitude: number
  /** Rayon dans lequel le semis de végétation est interdit. */
  clearRadius: number
  /** Le lieu est « découvert » quand le joueur entre dans ce rayon. */
  discoverRadius: number
  /**
   * Distance locale du marqueur d'interaction, sur l'axe avant (+Z).
   *
   * Une seule valeur pour deux usages : le composant du monument y pose la
   * braise bleue, et `interact` ci-dessous en dérive la zone qui l'active. Les
   * séparer aurait tôt ou tard fait mentir le marqueur.
   */
  markerZ: number
  /**
   * Point d'interaction, en coordonnées **monde**. Dérivé de `markerZ`.
   *
   * Volontairement distinct du centre du monument : c'est le marqueur lumineux
   * qui promet au joueur que quelque chose est possible *ici*, donc c'est
   * autour de lui que la promesse doit être tenue.
   */
  interact: { x: number; z: number }
  /**
   * Rayon d'interaction autour de `interact`.
   *
   * Nettement plus serré que `discoverRadius` : on découvre un lieu de loin, on
   * ne l'ouvre qu'en étant devant.
   */
  interactRadius: number
  /** Section du portfolio présentée par ce lieu. */
  section: PortfolioSection
  /** Couleur du repère sur la minimap. */
  minimapColor: string
}

/**
 * Passe du repère d'un monument au repère monde.
 *
 * L'avant d'un bâtiment est +Z, comme tout modèle du projet, donc la rotation
 * est exactement celle appliquée au `<group>` qui le porte.
 */
function localToWorld(
  centerX: number,
  centerZ: number,
  yaw: number,
  localX: number,
  localZ: number,
) {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  return {
    x: centerX + localX * cos + localZ * sin,
    z: centerZ - localX * sin + localZ * cos,
  }
}

/**
 * Complète une définition de lieu.
 *
 * `interact` n'est jamais écrit à la main : il se déduit de `markerZ` et du cap.
 * C'est ce qui garantit qu'ajouter un monument ne peut pas désynchroniser sa
 * braise et sa zone d'ouverture.
 */
function define(spec: Omit<Landmark, 'interact'>): Landmark {
  return { ...spec, interact: localToWorld(spec.x, spec.z, spec.yaw, 0, spec.markerZ) }
}

/**
 * Temple du Sommet — les projets.
 *
 * Posé sur le point culminant de la crête nord-ouest (18,9 unités d'altitude
 * naturelle, mesuré par balayage de `sampleHeight`). La terrasse est calée à
 * 17,4 : elle rogne la pointe plutôt que de l'exhausser, ce qui évite de créer
 * une butte artificielle visible depuis la plaine.
 *
 * Le cap regarde le sud-ouest, dans l'axe de la crête. Ce n'est pas décoratif :
 * c'est le seul flanc dont la pente reste sous 0,7 après aplanissement — les
 * trois autres passent 1,2 et forment une falaise. Le parvis et l'escalier
 * donnent donc sur la seule voie d'accès à pied.
 */
export const TEMPLE = define({
  id: 'temple',
  x: -22,
  z: -46,
  yaw: -1.03,
  radius: 11,
  blend: 14,
  altitude: 17.4,
  clearRadius: 13,
  discoverRadius: 17,
  markerZ: 9.8,
  interactRadius: 3,
  section: 'projects',
  minimapColor: '#f5dc95',
})

/**
 * Pyramide de la Jungle — la présentation.
 *
 * En pleine jungle au sud, sur le site le plus plat trouvé par balayage
 * (dénivelé naturel 0,51 sur douze unités de rayon, pente maximale 0,09). Le
 * grand rayon dégagé n'est pas un effet de bord : il ouvre une clairière dans
 * la végétation la plus dense de la carte, et c'est elle qui rend le monument
 * visible depuis le couvert.
 *
 * **Cap nul : la façade et le marqueur regardent le sud.** C'est une correction,
 * et elle vaut règle pour tout monument haut. La caméra du jeu est fixe et
 * regarde toujours vers le nord ; un joueur qui aborde un monument par le nord
 * l'a donc dans le dos, et le marqueur posé de ce côté disparaît derrière dix
 * mètres de pierre. Placé au sud, marqueur et escalier sont dans le cadre dès
 * qu'on approche. La règle « la façade regarde le centre de la carte » cède
 * donc devant « la façade regarde le sud » chaque fois que le monument est
 * assez haut pour se masquer lui-même.
 */
export const PYRAMID = define({
  id: 'pyramid',
  x: 8,
  z: 36,
  yaw: 0,
  radius: 13,
  blend: 10,
  altitude: 4.3,
  clearRadius: 15,
  discoverRadius: 21,
  markerZ: 11,
  interactRadius: 3,
  section: 'bio',
  minimapColor: '#9ad4a0',
})

/** Grande Stèle — les compétences. Jungle, au nord-ouest de la pyramide. */
export const STELE = define({
  id: 'stele',
  x: -25,
  z: 28,
  yaw: 2.413,
  radius: 7,
  blend: 8,
  altitude: 4,
  clearRadius: 9,
  discoverRadius: 14,
  markerZ: 4.5,
  interactRadius: 3,
  section: 'skills',
  minimapColor: '#c9b7f0',
})

/** Idole des Terres Arides — le parcours. */
export const STATUE = define({
  id: 'statue',
  x: 38,
  z: -4,
  yaw: -1.466,
  radius: 7,
  blend: 8,
  altitude: 3.4,
  clearRadius: 9,
  discoverRadius: 14,
  markerZ: 4.5,
  interactRadius: 3,
  section: 'background',
  minimapColor: '#f0a878',
})

/**
 * Ruines de l'Île — le contact.
 *
 * Au cœur de l'île, dernier lieu de la carte : on ne l'atteint qu'en traversant
 * le gué, donc en ayant compris que la mer se traverse à pied. Le cap regarde
 * le gué et non le centre de la carte, puisque c'est de là qu'on arrive.
 */
export const RUINS = define({
  id: 'ruins',
  x: 74,
  z: 74,
  yaw: -2.356,
  /**
   * Aucune terrasse, et c'est mesuré et non négligé.
   *
   * Le sommet de l'île vaut **exactement 6,100 sur 5,2 unités de rayon** : le
   * masque d'île y sature, donc `Math.max(height, island - 0.4)` y rend une
   * constante. Le terrain est déjà plus plat que ce qu'un aplanissement
   * produirait. Pire, en imposer un aurait raidi le flanc de 1,00 à 1,50 —
   * le fondu maintient la hauteur au-dessus de la pente naturelle, qui doit
   * ensuite rattraper plus bas. Le seul monument des cinq qui se pose sur le
   * relief tel quel.
   */
  radius: 0,
  blend: 0,
  altitude: 6.1,
  clearRadius: 10,
  discoverRadius: 16,
  /**
   * Juste au-delà du dallage, et pas un mètre plus loin.
   *
   * Le plateau naturel de l'île est plat *à la valeur près* jusqu'à 5,2, puis
   * plonge : mesuré, la braise flottait de 21 cm à 6,3 et de 55 cm à 7,0. Le
   * dallage des ruines a donc été resserré pour que le marqueur tienne dans la
   * zone strictement plate, plutôt que l'inverse.
   */
  markerZ: 4.8,
  interactRadius: 3,
  section: 'contact',
  minimapColor: '#8fd8ff',
})

export const LANDMARKS: readonly Landmark[] = [TEMPLE, PYRAMID, STELE, STATUE, RUINS]

/** Retrouve un lieu par son identifiant. */
export function landmarkById(id: LandmarkId): Landmark | undefined {
  return LANDMARKS.find((landmark) => landmark.id === id)
}
