import type { RapierRigidBody } from '@react-three/rapier'
import { playerTransform } from './playerTransform'

/**
 * Pont vers le `RigidBody` du joueur, hors de React.
 *
 * `Player.tsx` est seul à détenir son propre `ref` : rien d'extérieur ne peut
 * donc déplacer le personnage. Même idiome que `playerTransform` et
 * `enemyRegistry` — un objet mutable, écrit une fois par effet, lu par qui en
 * a besoin. Ici, `TeleportOverlay` au moment du "warp".
 */
export const playerBody: { current: RapierRigidBody | null } = { current: null }

/**
 * Pose le joueur quelque part : corps physique **et** transform partagé.
 *
 * Les deux écritures vont ensemble, et c'est tout l'objet de cette fonction.
 * `Player.tsx` n'écrit `playerTransform` que dans son propre `useFrame`, qui ne
 * fait rien hors de la phase `playing` — or on ne déplace jamais le joueur
 * autrement qu'en pause. Sans l'écriture manuelle, `CameraRig`, qui n'a lui
 * aucune garde de phase, continuerait de suivre l'ancienne position pendant
 * toute la séquence, et la destination se découvrirait de travers.
 *
 * La vélocité est remise à zéro : on arrive posé, sans l'élan du départ — une
 * chute en cours enfoncerait le joueur dans le sol dès la reprise.
 */
export function placePlayer(at: { x: number; y: number; z: number }, yaw: number) {
  playerBody.current?.setTranslation(at, true)
  playerBody.current?.setLinvel({ x: 0, y: 0, z: 0 }, true)
  playerTransform.position.set(at.x, at.y, at.z)
  playerTransform.yaw = yaw
}

// Exposé en développement pour pouvoir *déplacer* le joueur depuis un test
// navigateur. Les autres crochets de diagnostic ne font que lire l'état ;
// celui-ci écrit, et c'est le seul moyen d'aller vérifier un point précis de la
// carte sans jouer une traversée entière à 1 fps en rendu logiciel.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__playerBody = playerBody
}
