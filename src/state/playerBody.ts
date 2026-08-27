import type { RapierRigidBody } from '@react-three/rapier'

/**
 * Pont vers le `RigidBody` du joueur, hors de React.
 *
 * `Player.tsx` est seul à détenir son propre `ref` : rien d'extérieur ne peut
 * donc déplacer le personnage. Même idiome que `playerTransform` et
 * `enemyRegistry` — un objet mutable, écrit une fois par effet, lu par qui en
 * a besoin. Ici, `TeleportOverlay` au moment du "warp".
 */
export const playerBody: { current: RapierRigidBody | null } = { current: null }

// Exposé en développement pour pouvoir *déplacer* le joueur depuis un test
// navigateur. Les autres crochets de diagnostic ne font que lire l'état ;
// celui-ci écrit, et c'est le seul moyen d'aller vérifier un point précis de la
// carte sans jouer une traversée entière à 1 fps en rendu logiciel.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__playerBody = playerBody
}
