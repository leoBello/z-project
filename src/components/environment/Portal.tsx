import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  CircleGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  TorusGeometry,
  type BufferGeometry,
  type MeshToonMaterial,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PORTAL_NEAR_RADIUS } from '../../config/portal'
import { now as gameNow } from '../../state/gameClock'
import { playerTransform } from '../../state/playerTransform'
import { useGameStore } from '../../store/useGameStore'
import { toonGradient } from '../models/toonGradient'
import { faceted } from './faceted'
import { Z_FIGHT_LIFT } from './solids'

/**
 * Le portail de l'Île Céleste, devant le Temple de Nakano.
 *
 * Il n'existe qu'une fois la carte vidée de ses ennemis — par les armes ou par
 * le code de triche, le store ne fait pas la différence (voir `registerKill`).
 * Tant que `portalOpenedAt` est nul, ce composant est monté et invisible :
 * comme le champignon, il compile ses matériaux à l'avance plutôt qu'à la frame
 * où il doit apparaître.
 *
 * **Violet, et c'est tout le propos.** La palette du jeu tient en deux
 * familles : les ors et les rouges du bâti (temples, braseros, laque de la
 * pagode), les verts et les bleus du monde (végétation, mer, braise
 * d'interaction). Le violet saturé n'appartient à aucune des deux — la seule
 * chose qui en approche est le ciel, hors de portée. Une lueur violette au ras
 * du sol ne peut donc être confondue avec rien de ce que le joueur a déjà vu,
 * ce qui est exactement ce qu'on demande à un événement qui n'arrive qu'une
 * fois par partie.
 *
 * Le composant sert les **deux** portails du jeu — celui de Nakano et son jumeau
 * posé au point d'arrivée de l'île — d'où la position et l'instant d'ouverture
 * en props plutôt qu'en constantes. Deux composants jumeaux auraient divergé au
 * premier réglage de l'anneau.
 *
 * Il propose une interaction, et il est le seul à en proposer une qui change de
 * carte : la règle de priorité d'`interaction.ts` le place devant les coffres et
 * les monuments pour cette raison.
 *
 * Pas de `pointLight` non plus, et pour la raison exposée en tête
 * d'`InteractionMarker` : une source ponctuelle ajoute une passe d'éclairage
 * dans *tous* les shaders de la scène, végétation instanciée comprise. Le bloom
 * du post-traitement fait le halo à partir de l'émissif, et le disque au sol
 * fait la flaque de lumière.
 */

/** Violet du portail : clair pour le corps, saturé pour l'émissif. */
const GLOW = '#e6ccff'
const GLOW_EMISSIVE = '#8b3ff0'
/** Pierre de l'arche. Sombre et froide : elle ne vient pas d'ici. */
const ARCH = '#3a2f4e'

/** Rayon intérieur de l'anneau, et hauteur de son centre au-dessus du sol. */
const RADIUS = 2.1
const HOVER = 2.5

/**
 * Durée du dépliement, en millisecondes de temps de jeu.
 *
 * Long pour une apparition — la plupart des animations du jeu tiennent en
 * quelques centaines de millisecondes. Mais celle-ci se joue à l'autre bout de
 * la carte, très probablement hors de vue : elle n'est pas là pour être
 * regardée en direct, elle est là pour que le portail ne soit jamais « déjà
 * présent » si le joueur arrive dans la seconde qui suit.
 */
const OPEN_MS = 1400

/** Intensité émissive au repos, puis quand le joueur est à portée. */
const IDLE_INTENSITY = 1.5
const NEAR_INTENSITY = 2.6

function buildGeometry() {
  // L'anneau : un tore franchement facetté. Peu de segments radiaux et une
  // section pentagonale, pour qu'il appartienne au même monde taillé à la
  // serpe que les rochers et les toits.
  const arch = faceted(new TorusGeometry(RADIUS, 0.26, 5, 24))

  // Le seuil : un disque plein à l'intérieur de l'anneau. C'est lui qui fait
  // lire l'anneau comme un passage plutôt que comme un cerceau posé là.
  const veil = new CircleGeometry(RADIUS - 0.06, 32)

  // La flaque de lumière au sol, comme sous la braise des monuments.
  const pool = new CircleGeometry(RADIUS * 1.35, 24).rotateX(-Math.PI / 2)

  // Six éclats en orbite verticale autour de l'anneau. C'est le seul mouvement
  // qui distingue un portail d'un décor peint en violet.
  const shards = Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI * 2
    const shard = faceted(new IcosahedronGeometry(0.16 + (index % 2) * 0.07, 0))
    shard.translate(Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS, 0)
    return shard
  })

  return { arch, veil, pool, shards: mergeGeometries(shards)! }
}

/** Construite une fois pour toutes, hors du rendu React. */
const geometry = buildGeometry()

type ToonMesh = Mesh<BufferGeometry, MeshToonMaterial>
type BasicMesh = Mesh<BufferGeometry, MeshBasicMaterial>

interface PortalProps {
  /** Position et cap, en coordonnées monde de la carte qui le porte. */
  at: { x: number; y: number; z: number; yaw: number }
  /**
   * Instant de son ouverture, ou `null` s'il n'est pas encore ouvert.
   *
   * Une prop et non une lecture directe de `portalOpenedAt`, parce que les deux
   * portails ne répondent pas à la même question. Celui de Nakano s'ouvre quand
   * la carte est vidée ; celui de l'île est ouvert depuis toujours — on n'y
   * arrive que par lui, lui demander de se justifier n'aurait pas de sens.
   */
  openedAt: number | null
}

export function Portal({ at, openedAt }: PortalProps) {
  const root = useRef<Group>(null)
  const veil = useRef<BasicMesh>(null)
  const pool = useRef<BasicMesh>(null)
  const shards = useRef<Group>(null)
  const arch = useRef<ToonMesh>(null)

  useFrame(() => {
    const group = root.current
    if (!group) return

    if (openedAt === null) {
      group.visible = false
      return
    }

    group.visible = true

    const t = gameNow() / 1000
    const age = Math.min(1, (gameNow() - openedAt) / OPEN_MS)
    // Dépassement élastique : l'anneau s'ouvre d'un coup, dépasse sa taille de
    // 12 %, puis se stabilise. Sans ce dépassement, une apparition en fondu se
    // lit comme un objet qui charge, pas comme un passage qui se perce.
    const ease = 1 - (1 - age) ** 3
    group.scale.setScalar(ease * (1 + Math.sin(age * Math.PI) * 0.12))

    const near =
      Math.hypot(
        playerTransform.position.x - at.x,
        playerTransform.position.z - at.z,
      ) < PORTAL_NEAR_RADIUS
    const intensity = near ? NEAR_INTENSITY : IDLE_INTENSITY

    // Même discipline que les monuments et les coffres : le store n'est écrit
    // que sur **transition**, jamais à chaque frame. Sans ce test, le HUD se
    // re-rendrait soixante fois par seconde pour réafficher la même invite.
    const store = useGameStore.getState()
    if (near !== store.nearbyPortal) store.setNearbyPortal(near)

    if (arch.current) arch.current.material.emissiveIntensity = intensity

    if (veil.current) {
      // Le seuil respire, et son opacité descend quand il se dilate : c'est ce
      // décalage qui donne l'impression qu'on regarde à travers plutôt que sur.
      const breath = 0.5 + Math.sin(t * 1.3) * 0.5
      veil.current.scale.setScalar(0.92 + breath * 0.08)
      veil.current.material.opacity = (near ? 0.62 : 0.5) - breath * 0.12
    }

    if (pool.current) {
      pool.current.material.opacity = (near ? 0.5 : 0.36) * (0.8 + Math.sin(t * 0.9) * 0.2)
    }

    // Les éclats tournent dans le plan de l'anneau, et lentement : à vitesse
    // rapide ils se lisent comme une roue dentée. Le léger flottement vertical
    // du portail entier les empêche de décrire un cercle trop mécanique.
    if (shards.current) shards.current.rotation.z = t * 0.42
    group.position.y = at.y + Math.sin(t * 0.8) * 0.06
  })

  return (
    <group
      ref={root}
      position={[at.x, at.y, at.z]}
      rotation-y={at.yaw}
      visible={false}
    >
      {/* L'anneau et ses éclats sont dressés à `HOVER` du sol ; la flaque de
          lumière, elle, reste plaquée dessus — d'où deux niveaux et non un. */}
      <group position={[0, HOVER, 0]}>
        <mesh ref={arch} geometry={geometry.arch} castShadow>
          <meshToonMaterial
            gradientMap={toonGradient}
            color={ARCH}
            emissive={GLOW_EMISSIVE}
            emissiveIntensity={IDLE_INTENSITY}
          />
        </mesh>

        {/* Le seuil : non éclairé et à double face — on doit pouvoir en faire
            le tour, et il n'a pas de dos. `depthWrite` désactivé, sinon il
            masque les éclats qui passent derrière lui. */}
        <mesh ref={veil} geometry={geometry.veil}>
          <meshBasicMaterial
            color={GLOW_EMISSIVE}
            transparent
            opacity={0.5}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>

        <group ref={shards}>
          <mesh geometry={geometry.shards}>
            <meshToonMaterial
              gradientMap={toonGradient}
              color={GLOW}
              emissive={GLOW_EMISSIVE}
              emissiveIntensity={NEAR_INTENSITY}
            />
          </mesh>
        </group>
      </group>

      {/* Décollée du sol de sept fois la marge anti-z-fighting des dallages, et
          non d'une seule : le portail se dresse à 5,4 du centre de la terrasse
          de Nakano, c'est-à-dire dans son raccord au relief, où le sol n'est
          plus tout à fait plat. Au ras du sol, le bord aval du disque
          s'enfoncerait dedans. */}
      <mesh ref={pool} geometry={geometry.pool} position={[0, Z_FIGHT_LIFT * 7, 0]}>
        <meshBasicMaterial color={GLOW} transparent opacity={0.36} depthWrite={false} />
      </mesh>
    </group>
  )
}
