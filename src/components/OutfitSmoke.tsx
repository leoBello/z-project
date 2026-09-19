import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { IcosahedronGeometry, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { playerTransform } from '../state/playerTransform'
import { useGameStore } from '../store/useGameStore'
import { faceted } from './environment/faceted'

/**
 * Bouffée de fumée au changement d'équipement.
 *
 * Un changement d'équipement fait sauter la silhouette du joueur d'une image à
 * l'autre : le manteau et les épaulières apparaissent d'un coup, la lame double
 * de longueur.
 * Sans rien pour le couvrir, ça se lit comme un bug d'affichage. Une demi-
 * seconde de fumée suffit à en faire un événement — et c'est de surcroît la
 * convention du genre, ce qui rend l'effet lisible sans explication.
 *
 * Trois choix méritent d'être dits :
 *
 *  - **rendu hors de `<Physics>`** : ce n'est qu'un effet visuel, il n'a ni
 *    collider ni corps à simuler. Même place que `StrikeArc` ;
 *  - **suivi par `playerTransform`** et non par une position figée au
 *    déclenchement : la tenue peut se changer depuis l'inventaire, donc en
 *    pause, mais le joueur retombe dès la reprise et la fumée doit rester
 *    autour de lui ;
 *  - **chronométré en temps réel**. L'équipement se fait depuis un menu qui met
 *    la partie en pause : sur l'horloge de jeu, l'animation ne démarrerait
 *    jamais. Le `useFrame` de r3f, lui, continue de tourner.
 */

/** Durée de la bouffée, en millisecondes. */
const PUFF_MS = 620

/** Nuages : décalage local, taille finale et vitesse de dérive. */
const PUFFS = [
  { x: 0, y: 0.45, z: 0, scale: 1.15, rise: 0.55, spin: 1.1 },
  { x: 0.36, y: 0.2, z: 0.1, scale: 0.8, rise: 0.4, spin: -1.5 },
  { x: -0.34, y: 0.28, z: -0.12, scale: 0.85, rise: 0.45, spin: 1.7 },
  { x: 0.1, y: 0.7, z: -0.25, scale: 0.6, rise: 0.6, spin: -0.9 },
  { x: -0.18, y: 0.6, z: 0.24, scale: 0.62, rise: 0.62, spin: 1.3 },
] as const

/** Une seule géométrie pour les cinq nuages. Facettée, comme tout le décor. */
const puffGeometry = faceted(new IcosahedronGeometry(0.4, 0))

type BasicMesh = Mesh<typeof puffGeometry, MeshBasicMaterial>

export function OutfitSmoke() {
  const group = useRef<Group>(null)
  const clouds = useRef<(BasicMesh | null)[]>([])
  const startedAt = useRef<number | null>(null)

  // Horodatage du store plutôt qu'un compteur : il change à chaque équipement
  // *et* à chaque retrait, donc l'effet joue dans les deux sens sans qu'on ait
  // à distinguer les cas.
  const changedAt = useGameStore((state) => state.equipChangedAt)

  useEffect(() => {
    // `-Infinity` est la valeur de départ : rien n'a encore été équipé, il n'y
    // a donc rien à jouer.
    startedAt.current = Number.isFinite(changedAt) ? performance.now() : null
  }, [changedAt])

  useFrame(() => {
    const node = group.current
    if (!node) return

    if (startedAt.current === null) {
      node.visible = false
      return
    }

    const k = (performance.now() - startedAt.current) / PUFF_MS
    if (k >= 1) {
      node.visible = false
      startedAt.current = null
      return
    }

    node.visible = true
    // La fumée suit le joueur : elle est posée à ses pieds, pas à son centre.
    node.position.copy(playerTransform.position)
    node.position.y -= 0.8

    for (let i = 0; i < PUFFS.length; i++) {
      const cloud = clouds.current[i]
      if (!cloud) continue
      const puff = PUFFS[i]
      // Gonflement rapide puis dissipation lente : l'inverse se serait lu
      // comme une bulle qui éclate, pas comme un nuage qui se disperse.
      const grow = Math.min(k * 3.2, 1)
      cloud.scale.setScalar(puff.scale * (0.25 + grow * 0.95))
      cloud.position.set(puff.x * (0.5 + k), puff.y + puff.rise * k, puff.z * (0.5 + k))
      cloud.rotation.set(k * puff.spin, k * puff.spin * 1.4, 0)
      cloud.material.opacity = 0.85 * (1 - k * k)
    }
  })

  return (
    <group ref={group} visible={false}>
      {PUFFS.map((puff, index) => (
        <mesh
          key={`${puff.x}:${puff.y}`}
          ref={(node) => {
            clouds.current[index] = node as BasicMesh | null
          }}
          geometry={puffGeometry}
        >
          {/*
            Basique et transparent, sans écriture de profondeur : la fumée doit
            se superposer au personnage et à elle-même, jamais le découper. Un
            matériau toon aurait de surcroît reçu l'éclairage de la scène, et un
            nuage éclairé par le soleil rasant se serait lu comme un caillou.
          */}
          <meshBasicMaterial color="#e8e3f2" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
