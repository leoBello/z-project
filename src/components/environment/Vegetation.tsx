import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BallCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import {
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  MeshToonMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BIOMES } from '../../config/biomes'
import { LANDMARKS } from '../../config/landmarks'
import { PLAYER } from '../../config/gameplay'
import {
  WORLD,
  classifyBiome,
  sampleHeight,
  sampleSlope,
  seededRandom,
} from '../../config/world'
import { useQualityStore } from '../../store/useQualityStore'
import { toonGradient } from '../models/toonGradient'
import { faceted } from './faceted'
import { tickOcclusionFade, withOcclusionFade } from './occlusionFade'
import { createWindMaterial, tickWind } from './windMaterial'

/** Une instance posée sur la carte. */
interface ScatterItem {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
}

/** Familles de props semées sur la carte. */
type PropKind =
  | 'trunk'
  | 'canopy'
  | 'palmTrunk'
  | 'palmCrown'
  | 'bush'
  | 'rock'
  | 'grass'
  | 'flower'
  | 'deadTrunk'

/** Points candidats tirés sur la carte. Beaucoup sont rejetés (mer, falaises). */
const SAMPLE_COUNT = 14000
/** Rayon dégagé de gros props autour du point d'apparition. */
const SPAWN_CLEARANCE = 7
/** Pente au-delà de laquelle plus rien ne pousse : c'est une falaise. */
const MAX_SLOPE = 0.85
/** Au-delà de cette échelle, un rocher devient un obstacle physique. */
const ROCK_COLLIDER_SCALE = 1.25

// --- Géométries partagées ---------------------------------------------------

/**
 * Touffe d'herbe : trois brins inclinés, fusionnés en **une seule géométrie**.
 * Un brin isolé est invisible à la distance de la caméra ; fusionner en amont
 * plutôt qu'instancier trois fois divise par trois le nombre d'instances.
 */
function grassTuft() {
  const blades = [0, 2.1, 4.2].map((angle, index) => {
    const blade = faceted(new CylinderGeometry(0, 0.07, 0.85, 4))
    blade.translate(0, 0.42, 0)
    blade.rotateZ(0.28 + index * 0.06)
    blade.rotateY(angle)
    blade.translate(Math.cos(angle) * 0.07, 0, Math.sin(angle) * 0.07)
    return blade
  })
  return mergeGeometries(blades)!
}

/** Petite fleur : une tige et une corolle. */
function flowerGeometry() {
  const stem = faceted(new CylinderGeometry(0.012, 0.02, 0.26, 4))
  stem.translate(0, 0.13, 0)
  const head = new IcosahedronGeometry(0.075, 0)
  head.translate(0, 0.29, 0)
  return mergeGeometries([stem, head])!
}

/** Arbre mort : un tronc trapu et deux branches en fourche. */
function deadTree() {
  const trunk = faceted(new CylinderGeometry(0.11, 0.24, 1.9, 6))
  trunk.translate(0, 0.95, 0)
  const branches = [-1, 1].map((side, index) => {
    const branch = faceted(new CylinderGeometry(0.05, 0.1, 1.05, 5))
    branch.translate(0, 0.5, 0)
    branch.rotateZ(side * (0.7 + index * 0.15))
    branch.translate(side * 0.12, 1.15 + index * 0.25, side * 0.08)
    return branch
  })
  return mergeGeometries([trunk, ...branches])!
}

/** Couronne de palmier : sept palmes aplaties qui rayonnent et retombent. */
function palmCrown() {
  const fronds: BufferGeometry[] = []
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2
    const frond = faceted(new CylinderGeometry(0.02, 0.2, 1.6, 4))
    frond.scale(1, 1, 0.35)
    frond.translate(0, 0.8, 0)
    frond.rotateZ(1.15 + (i % 2) * 0.18)
    frond.rotateY(angle)
    fronds.push(frond)
  }
  return mergeGeometries(fronds)!
}

const geometries: Record<PropKind, BufferGeometry> = {
  trunk: faceted(new CylinderGeometry(0.16, 0.26, 1.8, 6)).translate(0, 0.9, 0),
  canopy: new IcosahedronGeometry(1, 0),
  palmTrunk: faceted(new CylinderGeometry(0.12, 0.2, 3, 6)).translate(0, 1.5, 0),
  palmCrown: palmCrown(),
  bush: new IcosahedronGeometry(0.5, 0).translate(0, 0.42, 0),
  rock: new DodecahedronGeometry(0.6, 0).translate(0, 0.28, 0),
  grass: grassTuft(),
  flower: flowerGeometry(),
  deadTrunk: deadTree(),
}

/** Matériau toon simple, pour tout ce qui ne bouge pas au vent. */
function staticMaterial() {
  return new MeshToonMaterial({ gradientMap: toonGradient })
}

/**
 * Les matériaux sont créés une fois pour toutes, hors du rendu React : ils
 * portent les uniforms du vent, et les recréer invaliderait le programme GPU.
 * La couleur vient de `instanceColor`, d'où le blanc en couleur de base.
 *
 * Seules les familles **hautes** reçoivent le fondu par tramage : la caméra
 * plonge de 35°, une touffe d'herbe ou une fleur ne se glisse jamais entre elle
 * et le joueur. Les en doter coûterait un test par pixel sur les deux familles
 * les plus nombreuses de la carte, pour un cas qui n'arrive pas.
 */
const materials: Record<PropKind, Material> = {
  trunk: withOcclusionFade(staticMaterial()),
  canopy: withOcclusionFade(
    createWindMaterial({ color: '#ffffff', strength: 0.14, height: 0.8 }),
  ),
  palmTrunk: withOcclusionFade(staticMaterial()),
  palmCrown: withOcclusionFade(
    createWindMaterial({ color: '#ffffff', strength: 0.2, height: 0.7 }),
  ),
  bush: createWindMaterial({ color: '#ffffff', strength: 0.06, height: 0.6 }),
  rock: staticMaterial(),
  grass: createWindMaterial({ color: '#ffffff', strength: 0.12, height: 0.85 }),
  flower: createWindMaterial({ color: '#ffffff', strength: 0.09, height: 0.3 }),
  deadTrunk: withOcclusionFade(staticMaterial()),
}

/** Teintes des fleurs de prairie. */
const FLOWER_COLORS = ['#fbf6e6', '#f4c6d9', '#f7e17c', '#dfe9ff', '#f6b28a']

type Buckets = Record<PropKind, ScatterItem[]>

/**
 * Sème la végétation sur toute la carte.
 *
 * Un seul tirage uniforme, filtré ensuite : rien sous l'eau, rien sur une
 * falaise, pas de gros props près du point d'apparition. Le biome du point
 * décide de ce qui pousse. Le générateur est initialisé par une graine fixe —
 * sans ça la carte se redessinerait à chaque rechargement.
 */
function generateScatter(density: number): Buckets {
  const buckets: Buckets = {
    trunk: [],
    canopy: [],
    palmTrunk: [],
    palmCrown: [],
    bush: [],
    rock: [],
    grass: [],
    flower: [],
    deadTrunk: [],
  }

  const random = seededRandom(0x5eed)
  const pick = (list: string[]) => list[Math.floor(random() * list.length)]
  const margin = WORLD.half - 3

  // La densité rogne le **nombre de tirages**, pas le résultat d'un tirage
  // complet : la graine étant fixe, les points conservés en qualité réduite
  // sont exactement les premiers de ceux de la qualité haute. Un massif ne se
  // redessine donc pas ailleurs quand on change de réglage, il s'éclaircit.
  const samples = Math.round(SAMPLE_COUNT * density)
  for (let i = 0; i < samples; i++) {
    const x = (random() * 2 - 1) * margin
    const z = (random() * 2 - 1) * margin
    const roll = random()
    const spin = random() * Math.PI * 2
    const size = 0.75 + random() * 0.6

    const height = sampleHeight(x, z)
    // Rien ne pousse dans l'eau ni sur une paroi.
    if (height < WORLD.waterLevel + 0.05) continue
    if (sampleSlope(x, z) > MAX_SLOPE) continue
    // Le parvis d'un monument est dégagé. Le test de pente ne l'aurait jamais
    // rejeté — une terrasse est plate par construction — et des buissons
    // auraient poussé jusque sous les colonnes.
    if (
      LANDMARKS.some(
        (landmark) => Math.hypot(x - landmark.x, z - landmark.z) < landmark.clearRadius,
      )
    )
      continue

    const biome = classifyBiome(x, z, height)
    const style = BIOMES[biome]
    const tilt = (random() - 0.5) * 0.12
    const allowLarge =
      Math.hypot(x - PLAYER.spawn[0], z - PLAYER.spawn[2]) > SPAWN_CLEARANCE

    const at = (lift = 0): [number, number, number] => [x, height + lift, z]

    const addTree = (trunkScale: number, canopyScale: number, canopyLift: number) => {
      buckets.trunk.push({
        position: at(),
        rotation: [tilt, spin, 0],
        scale: [trunkScale, trunkScale, trunkScale],
        color: style.trunk,
      })
      buckets.canopy.push({
        position: at(canopyLift * trunkScale),
        rotation: [tilt, spin, random() * 0.4],
        scale: [canopyScale, canopyScale * 0.9, canopyScale],
        color: pick(style.foliage),
      })
    }

    const addPalm = () => {
      const scale = size * (1 + random() * 0.35)
      const lean = (random() - 0.5) * 0.28
      buckets.palmTrunk.push({
        position: at(),
        rotation: [lean, spin, lean * 0.6],
        scale: [scale, scale, scale],
        color: style.trunk,
      })
      buckets.palmCrown.push({
        position: at(2.85 * scale),
        rotation: [lean, spin, lean * 0.6],
        scale: [scale, scale, scale],
        color: pick(style.foliage),
      })
    }

    const addRock = (factor: number) =>
      buckets.rock.push({
        position: at(),
        rotation: [tilt, spin, tilt],
        scale: [size * factor, size * factor * 0.85, size * factor],
        color: style.rock,
      })

    const addGrass = (factor: number) =>
      buckets.grass.push({
        position: at(),
        rotation: [0, spin, 0],
        scale: [size * factor, size * factor * (0.9 + random() * 0.6), size * factor],
        color: pick(style.grass),
      })

    const addBush = (factor: number) =>
      buckets.bush.push({
        position: at(),
        rotation: [0, spin, 0],
        scale: [size * factor, size * factor * 0.8, size * factor],
        color: pick(style.foliage),
      })

    switch (biome) {
      case 'beach':
        // Plage : très clairsemée, c'est ce qui la fait lire comme une plage.
        if (roll < 0.05 && allowLarge) addPalm()
        else if (roll < 0.13) addRock(0.8)
        else if (roll < 0.38) addGrass(0.9)
        break

      case 'island':
        if (roll < 0.16 && allowLarge) addPalm()
        else if (roll < 0.28) addBush(0.9)
        else if (roll < 0.34) addRock(0.9)
        else if (roll < 0.7) addGrass(1.1)
        break

      case 'jungle':
        // Jungle : dense, hauts fûts, feuillage large et sombre.
        if (roll < 0.24 && allowLarge) addTree(size * 1.7, size * 1.5, 1.9)
        else if (roll < 0.55) addBush(1.25)
        else addGrass(1.35)
        break

      case 'meadow':
        if (roll < 0.12 && allowLarge) addTree(size * 1.25, size * 1.35, 1.75)
        else if (roll < 0.28 && allowLarge) addBush(1)
        else if (roll < 0.36 && allowLarge) addRock(1)
        else if (roll < 0.52)
          buckets.flower.push({
            position: at(),
            rotation: [0, spin, 0],
            scale: [size, size * (0.9 + random() * 0.5), size],
            color: FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)],
          })
        else addGrass(1.3)
        break

      case 'badlands':
        if (roll < 0.05 && allowLarge)
          buckets.deadTrunk.push({
            position: at(),
            rotation: [tilt * 2, spin, tilt * 2],
            scale: [size * 1.1, size * 1.1, size * 1.1],
            color: style.trunk,
          })
        else if (roll < 0.16 && allowLarge) addBush(0.8)
        else if (roll < 0.52 && allowLarge) addRock(1 + random() * 0.8)
        else addGrass(1)
        break

      case 'mountain':
        // Montagne : de la roche, et plus rien qui pousse au-dessus de la neige.
        if (roll < 0.4) addRock(1.1 + random() * 1.1)
        else if (roll < 0.48 && height < WORLD.snowLevel - 2)
          buckets.deadTrunk.push({
            position: at(),
            rotation: [tilt * 2, spin, tilt * 2],
            scale: [size, size, size],
            color: style.trunk,
          })
        else if (roll < 0.6 && height < WORLD.snowLevel - 2) addGrass(0.8)
        break

      default:
        break
    }
  }

  return buckets
}

interface ScatterMeshProps {
  kind: PropKind
  items: ScatterItem[]
  castShadow?: boolean
}

/**
 * Rend une famille de props en un seul `InstancedMesh`.
 *
 * Les matrices sont composées une fois au montage, pas à chaque frame : la
 * végétation est statique, seul le vent la déforme, et le vent vit dans le
 * vertex shader. Coût par frame : un draw call, zéro travail CPU.
 */
function ScatterMesh({ kind, items, castShadow = false }: ScatterMeshProps) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return

    const matrix = new Matrix4()
    const quaternion = new Quaternion()
    const euler = new Euler()
    const position = new Vector3()
    const scale = new Vector3()
    const color = new Color()

    items.forEach((item, index) => {
      euler.set(item.rotation[0], item.rotation[1], item.rotation[2])
      quaternion.setFromEuler(euler)
      position.set(...item.position)
      scale.set(...item.scale)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(item.color))
    })

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    // À recalculer après coup : le volume englobant par défaut ignore les
    // matrices d'instance, et le frustum culling supprimerait des objets.
    mesh.computeBoundingSphere()
  }, [items, kind])

  if (items.length === 0) return null

  return (
    <instancedMesh
      ref={ref}
      args={[geometries[kind], materials[kind], items.length]}
      castShadow={castShadow}
      receiveShadow={castShadow}
    />
  )
}

/**
 * Avance les uniforms partagés par tous les matériaux instanciés : l'horloge du
 * vent et le cône d'effacement œil / joueur. Un seul `useFrame` pour toute la
 * végétation, quel que soit le nombre de familles rendues.
 */
function WindClock() {
  useFrame((state) => {
    tickWind(state.clock.elapsedTime)
    tickOcclusionFade()
  })
  return null
}

/**
 * Colliders des obstacles.
 *
 * Un unique rigid body statique porte tous les colliders : troncs et gros
 * rochers. L'herbe, les fleurs, les buissons et les petits cailloux sont
 * traversables — les doter de colliders coûterait cher pour un gain nul.
 */
function Obstacles({ buckets }: { buckets: Buckets }) {
  const trunks = useMemo(
    () => [...buckets.trunk, ...buckets.palmTrunk, ...buckets.deadTrunk],
    [buckets],
  )
  const bigRocks = useMemo(
    () => buckets.rock.filter((rock) => rock.scale[0] >= ROCK_COLLIDER_SCALE),
    [buckets],
  )

  return (
    <RigidBody type="fixed" colliders={false}>
      {trunks.map((trunk, index) => (
        <CylinderCollider
          key={`trunk-${index}`}
          args={[trunk.scale[1] * 0.9, 0.3 * trunk.scale[0]]}
          position={[
            trunk.position[0],
            trunk.position[1] + trunk.scale[1] * 0.9,
            trunk.position[2],
          ]}
        />
      ))}
      {bigRocks.map((rock, index) => (
        <BallCollider
          key={`rock-${index}`}
          args={[0.55 * rock.scale[0]]}
          position={[
            rock.position[0],
            rock.position[1] + 0.3 * rock.scale[1],
            rock.position[2],
          ]}
        />
      ))}
    </RigidBody>
  )
}

export function Vegetation() {
  const density = useQualityStore((state) => state.settings.vegetationDensity)
  // Le semis est refait quand la densité change — c'est le seul moment où il
  // l'est. Un changement de réglage coûte donc une seconde de génération, ce
  // qui est le prix normal d'un changement de qualité graphique.
  const buckets = useMemo(() => generateScatter(density), [density])

  if (import.meta.env.DEV) {
    // Compteur d'instances : le poste de coût dominant du décor, et le premier
    // chiffre à regarder si le framerate décroche.
    ;(window as unknown as Record<string, unknown>).vegetationCounts =
      Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]))
  }

  return (
    <>
      <WindClock />
      <ScatterMesh kind="trunk" items={buckets.trunk} castShadow />
      <ScatterMesh kind="canopy" items={buckets.canopy} castShadow />
      <ScatterMesh kind="palmTrunk" items={buckets.palmTrunk} castShadow />
      <ScatterMesh kind="palmCrown" items={buckets.palmCrown} castShadow />
      <ScatterMesh kind="deadTrunk" items={buckets.deadTrunk} castShadow />
      <ScatterMesh kind="bush" items={buckets.bush} castShadow />
      <ScatterMesh kind="rock" items={buckets.rock} castShadow />
      {/* L'herbe et les fleurs ne projettent pas d'ombre : des milliers de
          brins dans la shadow map coûteraient cher pour un résultat illisible. */}
      <ScatterMesh kind="grass" items={buckets.grass} />
      <ScatterMesh kind="flower" items={buckets.flower} />
      <Obstacles buckets={buckets} />
    </>
  )
}
