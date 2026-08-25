import { Sky } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { MAP_HALF, MAP_SIZE } from '../config/gameplay'

/** Hauteur des murs invisibles qui ferment la carte. */
const WALL_HEIGHT = 12

/**
 * Sol + bordures de la carte.
 *
 * Un seul rigid body statique porte tous les colliders : le sol (une boîte
 * plate plutôt qu'un plan infini, plus prévisible pour les raycasts) et quatre
 * murs invisibles qui empêchent de sortir de la zone jouable.
 */
function Terrain() {
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      {/* Collider du sol : sa face supérieure est exactement à y = 0. */}
      <CuboidCollider args={[MAP_HALF, 0.5, MAP_HALF]} position={[0, -0.5, 0]} />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[MAP_SIZE, MAP_SIZE]} />
        <meshStandardMaterial color="#79b95c" roughness={1} />
      </mesh>

      {/* Murs invisibles : pas de mesh, uniquement des colliders. */}
      <CuboidCollider
        args={[MAP_HALF, WALL_HEIGHT, 0.5]}
        position={[0, WALL_HEIGHT, -MAP_HALF]}
      />
      <CuboidCollider
        args={[MAP_HALF, WALL_HEIGHT, 0.5]}
        position={[0, WALL_HEIGHT, MAP_HALF]}
      />
      <CuboidCollider
        args={[0.5, WALL_HEIGHT, MAP_HALF]}
        position={[-MAP_HALF, WALL_HEIGHT, 0]}
      />
      <CuboidCollider
        args={[0.5, WALL_HEIGHT, MAP_HALF]}
        position={[MAP_HALF, WALL_HEIGHT, 0]}
      />
    </RigidBody>
  )
}

/** Éclairage type "fin d'après-midi à Hyrule" : soleil chaud + rebond froid. */
function Lighting() {
  return (
    <>
      <hemisphereLight args={['#cfe9ff', '#5b7a3a', 0.65]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        castShadow
        position={[40, 55, 25]}
        intensity={2.2}
        color="#ffe6b8"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        // La shadow camera est orthographique : on la cadre sur la zone jouable,
        // sinon les ombres deviennent trop basse résolution ou disparaissent.
        shadow-camera-left={-MAP_HALF}
        shadow-camera-right={MAP_HALF}
        shadow-camera-top={MAP_HALF}
        shadow-camera-bottom={-MAP_HALF}
        shadow-camera-near={1}
        shadow-camera-far={160}
      />
    </>
  )
}

/**
 * Décor de la scène.
 * La végétation et les biomes viendront s'ajouter ici à l'étape suivante.
 */
export function Environment() {
  return (
    <>
      <Sky sunPosition={[60, 30, 40]} turbidity={6} rayleigh={2} />
      <Lighting />
      <Terrain />
    </>
  )
}
