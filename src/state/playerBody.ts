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
