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
import { BIOMES, SCATTER_HALF, sampleBiome, seededRandom } from '../../config/biomes'
import { PLAYER } from '../../config/gameplay'
import { toonGradient } from '../models/toonGradient'
import { createWindMaterial, tickWind } from './windMaterial'

/** Une instance posée sur la carte. */
interface ScatterItem {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
}

/** Familles de props semées sur la carte. */
type PropKind = 'trunk' | 'canopy' | 'bush' | 'rock' | 'grass' | 'flower' | 'deadTrunk'

/** Nombre de points candidats tirés sur la carte. */
const SAMPLE_COUNT = 1900
/**
 * Rayon dégagé autour du point d'apparition — uniquement pour les gros props.
 * L'herbe et les fleurs continuent d'y pousser : sans ça le joueur démarre au
 * milieu d'un rond de terre nue, ce qui se voit immédiatement.
 */
const SPAWN_CLEARANCE = 6
/** Au-delà de cette échelle, un rocher devient un obstacle physique. */
const ROCK_COLLIDER_SCALE = 1.25

// --- Géométries partagées ---------------------------------------------------
// Chaque géométrie est translatée pour que son **origine soit à sa base** :
// les instances peuvent alors être posées à y = 0 sans calcul de décalage.

/**
 * Force des normales par face pour obtenir le rendu low-poly facetté.
 *
 * `MeshToonMaterial` n'expose pas `flatShading` (contrairement à Standard ou
 * Lambert), donc l'effet doit être cuit dans la géométrie : on dé-indexe, puis
 * on recalcule les normales — chaque triangle obtient alors les siennes au lieu
 * de les moyenner avec ses voisins.
 *
 * Les polyèdres (icosaèdre, dodécaèdre) sont déjà non indexés et facettés :
 * seuls les cylindres ont besoin du traitement.
 */
function faceted<T extends BufferGeometry>(geometry: T) {
  const flat = geometry.toNonIndexed()
  flat.computeVertexNormals()
  return flat
}

/**
 * Touffe d'herbe : trois brins inclinés, fusionnés en **une seule géométrie**.
 *
 * Un brin isolé est invisible à la distance de la caméra. Fusionner en amont
 * plutôt qu'instancier trois fois divise par trois le nombre d'instances à
 * dessiner pour le même résultat visuel.
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

/** Petite fleur : une tige et une corolle, fusionnées. */
function flower() {
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

const geometries: Record<PropKind, BufferGeometry> = {
  trunk: faceted(new CylinderGeometry(0.16, 0.26, 1.8, 6)).translate(0, 0.9, 0),
  canopy: new IcosahedronGeometry(1, 0),
  bush: new IcosahedronGeometry(0.5, 0).translate(0, 0.42, 0),
  rock: new DodecahedronGeometry(0.6, 0).translate(0, 0.28, 0),
  grass: grassTuft(),
  flower: flower(),
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
 */
const materials: Record<PropKind, Material> = {
  trunk: staticMaterial(),
  canopy: createWindMaterial({ color: '#ffffff', strength: 0.14, height: 0.8 }),
  bush: createWindMaterial({ color: '#ffffff', strength: 0.06, height: 0.6 }),
  rock: staticMaterial(),
  grass: createWindMaterial({ color: '#ffffff', strength: 0.12, height: 0.85 }),
  flower: createWindMaterial({ color: '#ffffff', strength: 0.09, height: 0.3 }),
  deadTrunk: staticMaterial(),
}

/** Teintes des fleurs de prairie. */
const FLOWER_COLORS = ['#fbf6e6', '#f4c6d9', '#f7e17c', '#dfe9ff', '#f6b28a']

/**
 * Sème la végétation sur la carte.
 *
 * Tirage rejeté sur trois critères : rien sur le chemin, rien près du point
 * d'apparition, et la famille de prop dépend du biome échantillonné. Le
 * générateur est initialisé par une graine fixe — sans ça la carte se
 * redessinerait à chaque rechargement.
 */
function generateScatter() {
  const buckets: Record<PropKind, ScatterItem[]> = {
    trunk: [],
    canopy: [],
    bush: [],
    rock: [],
    grass: [],
    flower: [],
    deadTrunk: [],
  }

  const random = seededRandom(0x5eed)
  const pick = (list: string[]) => list[Math.floor(random() * list.length)]

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const x = (random() * 2 - 1) * SCATTER_HALF
    const z = (random() * 2 - 1) * SCATTER_HALF
    const roll = random()
    const spin = random() * Math.PI * 2
    const size = 0.75 + random() * 0.6

    const { blend, onPath, id } = sampleBiome(x, z)
    if (onPath) continue

    const style = BIOMES[id]
    const tilt = (random() - 0.5) * 0.12
    // Les gros props sont interdits près du spawn ; le sol y reste couvert
    // d'herbe et de fleurs, qui elles n'ont jamais gêné personne.
    const allowLarge =
      Math.hypot(x - PLAYER.spawn[0], z - PLAYER.spawn[2]) > SPAWN_CLEARANCE

    const addGrass = (factor: number) =>
      buckets.grass.push({
        position: [x, 0, z],
        rotation: [0, spin, 0],
        scale: [size * factor, size * factor * (0.9 + random() * 0.6), size * factor],
        color: pick(style.grass),
      })

    if (blend < 0.5) {
      // --- Prairie ---
      if (roll < 0.12 && allowLarge) {
        const scale = size * (1 + random() * 0.5)
        buckets.trunk.push({
          position: [x, 0, z],
          rotation: [tilt, spin, 0],
          scale: [scale, scale, scale],
          color: style.trunk,
        })
        buckets.canopy.push({
          position: [x, 1.75 * scale, z],
          rotation: [tilt, spin, random() * 0.4],
          scale: [scale * 1.15, scale * 0.95, scale * 1.15],
          color: pick(style.foliage),
        })
      } else if (roll < 0.28 && allowLarge) {
        buckets.bush.push({
          position: [x, 0, z],
          rotation: [0, spin, 0],
          scale: [size, size * 0.8, size],
          color: pick(style.foliage),
        })
      } else if (roll < 0.36 && allowLarge) {
        buckets.rock.push({
          position: [x, 0, z],
          rotation: [tilt, spin, tilt],
          scale: [size, size * 0.8, size],
          color: style.rock,
        })
      } else if (roll < 0.52) {
        buckets.flower.push({
          position: [x, 0, z],
          rotation: [0, spin, 0],
          scale: [size, size * (0.9 + random() * 0.5), size],
          color: FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)],
        })
      } else {
        addGrass(1.3)
      }
    } else {
      // --- Terres arides ---
      if (roll < 0.05 && allowLarge) {
        const scale = size * 1.1
        buckets.deadTrunk.push({
          position: [x, 0, z],
          rotation: [tilt * 2, spin, tilt * 2],
          scale: [scale, scale, scale],
          color: style.trunk,
        })
      } else if (roll < 0.16 && allowLarge) {
        buckets.bush.push({
          position: [x, 0, z],
          rotation: [0, spin, 0],
          scale: [size * 0.8, size * 0.6, size * 0.8],
          color: pick(style.foliage),
        })
      } else if (roll < 0.52 && allowLarge) {
        const scale = size * (1 + random() * 0.8)
        buckets.rock.push({
          position: [x, 0, z],
          rotation: [tilt, spin, tilt],
          scale: [scale, scale * 0.85, scale],
          color: style.rock,
        })
      } else {
        addGrass(1)
      }
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

/** Avance l'horloge du vent, partagée par tous les matériaux instanciés. */
function WindClock() {
  useFrame((state) => tickWind(state.clock.elapsedTime))
  return null
}

/**
 * Colliders des obstacles.
 *
 * Un unique rigid body statique porte tous les colliders : troncs et gros
 * rochers. L'herbe, les buissons et les petits cailloux sont traversables —
 * les doter de colliders coûterait cher pour un gain de jeu nul.
 */
function Obstacles({ trunks, deadTrunks, rocks }: Record<'trunks' | 'deadTrunks' | 'rocks', ScatterItem[]>) {
  const bigRocks = useMemo(
    () => rocks.filter((rock) => rock.scale[0] >= ROCK_COLLIDER_SCALE),
    [rocks],
  )

  return (
    <RigidBody type="fixed" colliders={false}>
      {[...trunks, ...deadTrunks].map((trunk, index) => (
        <CylinderCollider
          key={`trunk-${index}`}
          args={[trunk.scale[1] * 0.9, 0.3 * trunk.scale[0]]}
          position={[trunk.position[0], trunk.scale[1] * 0.9, trunk.position[2]]}
        />
      ))}
      {bigRocks.map((rock, index) => (
        <BallCollider
          key={`rock-${index}`}
          args={[0.55 * rock.scale[0]]}
          position={[rock.position[0], 0.3 * rock.scale[1], rock.position[2]]}
        />
      ))}
    </RigidBody>
  )
}

export function Vegetation() {
  const scatter = useMemo(generateScatter, [])

  return (
    <>
      <WindClock />
      <ScatterMesh kind="trunk" items={scatter.trunk} castShadow />
      <ScatterMesh kind="canopy" items={scatter.canopy} castShadow />
      <ScatterMesh kind="deadTrunk" items={scatter.deadTrunk} castShadow />
      <ScatterMesh kind="bush" items={scatter.bush} castShadow />
      <ScatterMesh kind="rock" items={scatter.rock} castShadow />
      {/* L'herbe ne projette pas d'ombre : des centaines de brins dans la
          shadow map coûteraient cher pour un résultat illisible. */}
      <ScatterMesh kind="grass" items={scatter.grass} />
      <ScatterMesh kind="flower" items={scatter.flower} />
      <Obstacles
        trunks={scatter.trunk}
        deadTrunks={scatter.deadTrunk}
        rocks={scatter.rock}
      />
    </>
  )
}
