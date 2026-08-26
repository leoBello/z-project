import type { LandmarkId } from '../types/game'

/**
 * Points d'intérêt : les lieux construits de la carte.
 *
 * Ce fichier ne décrit que *où* et *comment* un monument s'inscrit dans le
 * monde. Sa géométrie vit dans son propre composant, et son nom affiché dans
 * `src/i18n/*.json`, sous `ui.landmarks`. Trois systèmes lisent
 * cette table sans se connaître : `sampleHeight` y creuse la terrasse, le semis
 * de végétation s'y interdit de pousser, et la minimap y pose un repère.
 */

/** Sections du portfolio adressables par un point d'intérêt. */
export type PortfolioSection = 'projects'

export interface Landmark {
  id: LandmarkId
  /** Centre du monument, au sol. */
  x: number
  z: number
  /**
   * Cap du bâtiment. L'avant du modèle est +Z, comme partout dans le projet,
   * donc `yaw` s'obtient par `atan2(dir.x, dir.z)`.
   */
  yaw: number
  /**
   * Terrasse aplanie sous le monument : rayon de la partie parfaitement plate,
   * puis largeur du raccord vers le relief naturel.
   *
   * On aplanit le *terrain* plutôt que de poser un socle sous le bâtiment.
   * Le mesh, le collider physique, le semis et la minimap interrogent tous
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
   * Rayon d'interaction, mesuré au centre du monument.
   *
   * Nettement plus serré que `discoverRadius` : on découvre un lieu de loin,
   * on ne l'ouvre qu'en étant *dedans*.
   */
  interactRadius: number
  /**
   * Section du portfolio que ce lieu présente.
   *
   * L'union s'élargira avec la stèle et la pyramide. Le panneau s'en sert pour
   * choisir quoi afficher : le lieu ne connaît pas l'interface, et l'interface
   * ne connaît pas la géographie.
   */
  section: PortfolioSection
  /** Couleur du repère sur la minimap. */
  minimapColor: string
}

/**
 * Temple du Sommet.
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
export const TEMPLE: Landmark = {
  id: 'temple',
  x: -22,
  z: -46,
  yaw: -1.03,
  radius: 11,
  blend: 14,
  altitude: 17.4,
  clearRadius: 13,
  discoverRadius: 17,
  /**
   * 4,5 place l'invite quand le joueur est **à l'autel** : le collider de
   * l'assise l'arrête déjà à 2,75 du centre (2,4 de rayon plus 0,35 de
   * capsule), donc l'invite s'allume au moment précis où il ne peut plus
   * avancer. Plus large, elle aurait clignoté depuis la terrasse.
   */
  interactRadius: 4.5,
  section: 'projects',
  minimapColor: '#f5dc95',
}

export const LANDMARKS: readonly Landmark[] = [TEMPLE]

/** Retrouve un lieu par son identifiant (bandeau de découverte du HUD). */
export function landmarkById(id: LandmarkId): Landmark | undefined {
  return LANDMARKS.find((landmark) => landmark.id === id)
}
