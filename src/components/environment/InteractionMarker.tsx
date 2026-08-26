import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CylinderGeometry,
  IcosahedronGeometry,
  type BufferGeometry,
  type Group,
  type Mesh,
  type MeshToonMaterial,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { now as gameNow } from '../../state/gameClock'
import { useGameStore } from '../../store/useGameStore'
import type { LandmarkId } from '../../types/game'
import { toonGradient } from '../models/toonGradient'
import { faceted } from './faceted'

/**
 * Braise du seuil : le marqueur qui dit « il se passe quelque chose ici ».
 *
 * Bleu froid, et c'est le point entier. Le temple porte déjà deux braseros
 * orange au pied de son escalier ; un troisième feu de la même couleur se
 * serait lu comme du décor. Le bleu est la seule teinte du jeu qu'aucune flamme
 * ne porte, donc l'œil la trouve immédiatement et comprend qu'elle n'appartient
 * pas au bâtiment mais au joueur.
 *
 * Pas de lumière ponctuelle : le bloom du post-traitement fait le halo à partir
 * de l'émissif, et le disque au sol simule la flaque de lumière. Une seconde
 * `pointLight` aurait ajouté une passe d'éclairage dans *tous* les shaders de
 * la scène, végétation instanciée comprise — cher pour un effet que le bloom
 * rend déjà. Si le halo doit vraiment éclairer la neige, une `<pointLight>`
 * ici suffit, en connaissance de cause.
 */

/** Bleu de la braise. Volontairement absent du reste de la palette. */
const FLAME_COLOR = '#cfeaff'
const FLAME_EMISSIVE = '#3fa9ff'
/** Pierre du socle : celle du temple, pour que le marqueur y appartienne. */
const BASE_COLOR = '#7b7264'

/** Intensité émissive au repos, puis à portée d'interaction. */
const IDLE_INTENSITY = 1.15
const ACTIVE_INTENSITY = 2.1

/**
 * Hauteur de vol de la flamme.
 *
 * Le personnage mesure 1,6 unité et la caméra recule de 21 : une braise posée
 * au ras du sol se perdait dans le champ de rochers du sommet. Mesuré sur la
 * première version, elle arrivait au genou du héros et se lisait à peine. À
 * 0,85 elle flotte à hauteur de poitrine, donc au-dessus de la ligne des
 * cailloux, et le bloom fait le reste.
 */
const FLAME_HOVER = 0.85

function buildGeometry() {
  // Socle : une dalle octogonale posée à même la terrasse.
  const plinth = faceted(new CylinderGeometry(0.68, 0.78, 0.15, 8)).translate(0, 0.075, 0)

  // Disque lumineux, à peine décollé du socle. C'est lui qui donne la « flaque
  // de lumière » sans coûter une source de lumière.
  const pool = faceted(new CylinderGeometry(0.58, 0.58, 0.03, 8)).translate(0, 0.165, 0)

  const flame = faceted(new IcosahedronGeometry(0.38, 0))
  flame.scale(1, 1.85, 1)

  // Deux escarbilles qui tournent autour de la flamme. Le mouvement orbital est
  // ce qui distingue une braise vivante d'un caillou peint en bleu.
  const motes = [0, Math.PI].map((angle) => {
    const mote = faceted(new IcosahedronGeometry(0.1, 0))
    mote.translate(Math.cos(angle) * 0.58, Math.sin(angle) * 0.2, Math.sin(angle) * 0.58)
    return mote
  })

  return { plinth, pool, flame, motes: mergeGeometries(motes)! }
}

/**
 * Construite une fois pour toutes, hors du rendu React : tous les marqueurs de
 * la carte partagent la même géométrie.
 */
const geometry = buildGeometry()

interface InteractionMarkerProps {
  /** Lieu auquel ce marqueur appartient, pour savoir si le joueur est à portée. */
  landmarkId: LandmarkId
  /** Position dans le repère du monument. */
  position: [number, number, number]
}

/**
 * Maillage dont on va piloter l'émissif à chaque frame.
 *
 * Le matériau est typé sur le `Mesh` plutôt que casté dans la boucle : sans ça
 * `mesh.material` vaut `Material | Material[]` et il faudrait une assertion par
 * accès, dans le code le plus chaud du composant.
 */
type ToonMesh = Mesh<BufferGeometry, MeshToonMaterial>

export function InteractionMarker({ landmarkId, position }: InteractionMarkerProps) {
  const flame = useRef<ToonMesh>(null)
  const motes = useRef<Group>(null)
  const pool = useRef<ToonMesh>(null)

  useFrame(() => {
    // Horloge de jeu, et non celle de r3f : la braise doit se figer avec le
    // reste du monde quand le panneau est ouvert.
    const t = gameNow() / 1000
    // Lecture non réactive : ce composant ne doit jamais se re-rendre.
    const near = useGameStore.getState().nearbyLandmark === landmarkId

    if (flame.current) {
      flame.current.position.y = FLAME_HOVER + Math.sin(t * 1.9) * 0.09
      flame.current.rotation.y = t * 0.8
      // La flamme grandit quand le joueur entre à portée. C'est une confirmation
      // dans la scène elle-même, là où le joueur regarde — l'invite du HUD est
      // en bas de l'écran, loin des yeux au moment où il s'approche.
      const scale = (near ? 1.22 : 1) * (1 + Math.sin(t * 3.1) * 0.04)
      flame.current.scale.setScalar(scale)
      flame.current.material.emissiveIntensity = near ? ACTIVE_INTENSITY : IDLE_INTENSITY
    }

    if (motes.current) motes.current.rotation.y = -t * 1.15
    if (pool.current) {
      // Le disque respire plus lentement que la flamme : deux pulsations à la
      // même cadence se seraient lues comme un clignotement, pas comme un feu.
      pool.current.material.emissiveIntensity =
        (near ? ACTIVE_INTENSITY : IDLE_INTENSITY) * (0.75 + Math.sin(t * 1.4) * 0.12)
    }
  })

  return (
    <group position={position}>
      <mesh geometry={geometry.plinth} castShadow receiveShadow>
        <meshToonMaterial gradientMap={toonGradient} color={BASE_COLOR} />
      </mesh>

      <mesh ref={pool} geometry={geometry.pool}>
        <meshToonMaterial
          gradientMap={toonGradient}
          color={FLAME_COLOR}
          emissive={FLAME_EMISSIVE}
          emissiveIntensity={IDLE_INTENSITY}
        />
      </mesh>

      <mesh ref={flame} geometry={geometry.flame} position={[0, FLAME_HOVER, 0]}>
        <meshToonMaterial
          gradientMap={toonGradient}
          color={FLAME_COLOR}
          emissive={FLAME_EMISSIVE}
          emissiveIntensity={IDLE_INTENSITY}
        />
      </mesh>

      <group ref={motes} position={[0, FLAME_HOVER + 0.05, 0]}>
        <mesh geometry={geometry.motes}>
          <meshToonMaterial
            gradientMap={toonGradient}
            color={FLAME_COLOR}
            emissive={FLAME_EMISSIVE}
            emissiveIntensity={IDLE_INTENSITY}
          />
        </mesh>
      </group>
    </group>
  )
}
