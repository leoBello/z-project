import { Suspense, lazy, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type DirectionalLight } from 'three'
import { playerTransform } from '../state/playerTransform'
import { useGameStore } from '../store/useGameStore'
import { useQualityStore } from '../store/useQualityStore'
import { Bridge } from './environment/Bridge'
import { SkyIslandDistant } from './environment/SkyIslandDistant'
import { Landmarks } from './environment/Landmarks'
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
  // Une shadow map de 2048² coûte une passe de rendu de la scène à cette
  // résolution, à chaque frame. C'est le levier de qualité le plus direct
  // après la densité de végétation.
  const shadowMapSize = useQualityStore((state) => state.settings.shadowMapSize)

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
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
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

/**
 * L'Île Céleste, chargée à la demande.
 *
 * `lazy` et non un import direct : c'est ce qui fait de tout le sous-arbre de
 * l'île un fragment de bundle à part, que l'accueil du site ne télécharge
 * jamais.
 *
 * **Elle a sa propre frontière `<Suspense>`, et c'est indispensable.** Celle
 * d'`App.tsx` entoure toute la scène — joueur et physique compris. Y laisser
 * l'île suspendre détachait donc le sous-arbre entier : `playerBody.current`
 * repassait à `null`, la position que la transition venait d'écrire tombait
 * dans le vide, et le `<RigidBody>` du joueur se recréait à la valeur littérale
 * de sa prop, `PLAYER.spawn`. Le joueur arrivait au centre du continent alors
 * qu'il venait d'entrer dans le ciel, tombait, et le filet de sécurité le
 * ramenait au portail — d'où l'impression que « la position change puis
 * revient ».
 *
 * Le défaut ne se voyait **que dans un sens** : le retour vers le continent ne
 * charge rien en différé, donc rien n'y suspend. C'est ce qui le rendait
 * difficile à lire.
 */
const SkyIsland = lazy(() => import('./skyisland/SkyIsland'))

/**
 * Décor complet de la carte courante.
 *
 * Le ciel et les lumières sont **hors du branchement** : les deux cartes
 * partagent le même firmament et le même soleil, et c'est voulu — l'île flotte
 * dans le ciel du continent, pas dans un autre. Les monter deux fois les
 * recréerait à chaque voyage pour un résultat identique.
 *
 * Tout le reste change en bloc. Il n'y a délibérément aucune pièce commune au
 * sol : le continent est un champ de hauteurs sur grille carrée, l'île une
 * surface radiale avec un dessous — et un champ de hauteurs ne peut pas
 * représenter un surplomb. Voir la spec de l'île pour le détail.
 */
export function Environment() {
  const location = useGameStore((state) => state.location)

  return (
    <>
      <StarrySky />
      <Lighting />
      {location === 'continent' ? (
        <>
          <Terrain />
          <Water />
          <Vegetation />
          {/* Monté hors de `Landmarks` : le pont n'est le parvis d'aucun
              monument, c'est une pièce du relief au même titre que la mer. */}
          <Bridge />
          <Landmarks />
          {/* Montée avec le continent et jamais avec l'île : quand on y est,
              on est dessus. */}
          <SkyIslandDistant />
        </>
      ) : (
        <Suspense fallback={null}>
          <SkyIsland />
        </Suspense>
      )}
    </>
  )
}
