import { Sky } from '@react-three/drei'
import { MAP_HALF } from '../config/gameplay'
import { Terrain } from './environment/Terrain'
import { Vegetation } from './environment/Vegetation'

/**
 * Éclairage "fin d'après-midi".
 *
 * Trois sources, et c'est volontaire : une seule lumière blanche aplatit
 * n'importe quel style. La clé chaude sculpte, le rebond froid du ciel évite
 * les ombres noires et mortes, et la contre-jour détache les silhouettes du
 * fond — c'est elle qui fait "lire" le personnage sur la végétation.
 */
function Lighting() {
  return (
    <>
      <hemisphereLight args={['#d6ecff', '#6a7a42', 0.7]} />
      <ambientLight intensity={0.28} />

      {/* Clé chaude : la seule à projeter des ombres. */}
      <directionalLight
        castShadow
        position={[40, 55, 25]}
        intensity={2.1}
        color="#ffe3ad"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        // Shadow camera orthographique cadrée sur la zone jouable : trop large,
        // les ombres deviennent basse résolution ; trop étroite, elles coupent.
        shadow-camera-left={-MAP_HALF}
        shadow-camera-right={MAP_HALF}
        shadow-camera-top={MAP_HALF}
        shadow-camera-bottom={-MAP_HALF}
        shadow-camera-near={1}
        shadow-camera-far={180}
      />

      {/* Contre-jour froid, sans ombre : purement du détourage. */}
      <directionalLight position={[-30, 18, -35]} intensity={0.5} color="#9fc7ff" />
    </>
  )
}

/** Décor complet : ciel, lumières, sol des deux biomes et végétation. */
export function Environment() {
  return (
    <>
      <Sky sunPosition={[60, 30, 40]} turbidity={6} rayleigh={2} />
      <Lighting />
      <Terrain />
      <Vegetation />
    </>
  )
}
