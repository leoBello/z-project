import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type DirectionalLight } from 'three'
import { playerTransform } from '../state/playerTransform'
import { Terrain } from './environment/Terrain'
import { Vegetation } from './environment/Vegetation'
import { StarrySky } from './environment/StarrySky'
import { Water } from './environment/Water'

/** Position du soleil relative au joueur. */
const SUN_OFFSET = { x: 45, y: 70, z: 35 }
/**
 * Demi-largeur de la zone couverte par les ombres.
 * Cadrer la shadow camera sur le joueur plutôt que sur la carte entière fait
 * passer la résolution d'environ 10 cm à 2 cm par texel — sur une carte de
 * 200 unités, c'est la différence entre des ombres nettes et de la bouillie.
 */
const SHADOW_EXTENT = 42

/**
 * Soleil qui suit le joueur.
 *
 * Une lumière directionnelle n'a pas de position au sens physique, mais sa
 * shadow camera, elle, en a une : la déplacer avec le joueur garde toujours la
 * zone visible dans la carte d'ombres.
 */
function SunLight() {
  const light = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])

  useFrame(() => {
    const { position } = playerTransform
    target.position.copy(position)
    target.updateMatrixWorld()
    light.current?.position.set(
      position.x + SUN_OFFSET.x,
      position.y + SUN_OFFSET.y,
      position.z + SUN_OFFSET.z,
    )
  })

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        castShadow
        intensity={2.1}
        color="#ffe3ad"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={220}
      />
    </>
  )
}

/**
 * Éclairage "fin d'après-midi".
 *
 * Trois sources, et c'est volontaire : une seule lumière blanche aplatit
 * n'importe quel style. La clé chaude sculpte, le rebond froid du ciel évite
 * les ombres noires et mortes, et le contre-jour détache les silhouettes du
 * fond — c'est lui qui fait "lire" le personnage sur la végétation.
 */
function Lighting() {
  return (
    <>
      {/*
        Le ciel est violet, mais l'éclairage garde exactement les mêmes
        intensités qu'avant : seules les teintes basculent vers le parme. Le
        monde reste donc aussi lumineux, il est juste éclairé par un autre ciel.
      */}
      <hemisphereLight args={['#d2dcf4', '#6a7a42', 0.7]} />
      <ambientLight intensity={0.28} />
      <SunLight />
      {/* Contre-jour parme, sans ombre : purement du détourage. */}
      <directionalLight position={[-30, 18, -35]} intensity={0.5} color="#9fb0e8" />
    </>
  )
}

/** Décor complet : ciel, lumières, relief, mer et végétation. */
export function Environment() {
  return (
    <>
      <StarrySky />
      <Lighting />
      <Terrain />
      <Water />
      <Vegetation />
    </>
  )
}
