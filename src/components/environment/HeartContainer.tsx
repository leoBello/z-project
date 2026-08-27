import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, Vector3 } from 'three'
import { now as gameNow } from '../../state/gameClock'
import { playerTransform } from '../../state/playerTransform'
import { useGameStore } from '../../store/useGameStore'
import type { LandmarkId } from '../../types/game'
import { heartGeometry } from '../models/heartGeometry'
import { toonGradient } from '../models/toonGradient'

/**
 * Réceptacle de cœur posé sur un monument.
 *
 * Le temple était purement contemplatif : on y montait, le bandeau s'affichait,
 * et il ne se passait rien de jouable. Le réceptacle est la récompense la plus
 * courte à écrire qui rende le détour payant — un cœur maximal de plus, gagné
 * en arrivant jusqu'à l'autel.
 *
 * Trois choix qui méritent d'être dits :
 *
 *  - **le ramassage est de proximité, pas une interaction `F`.** Le monument a
 *    déjà sa braise et son panneau de portfolio ; y accrocher une seconde
 *    invite obligerait à arbitrer laquelle `F` déclenche. Marcher jusqu'à
 *    l'autel suffit, et c'est exactement le geste que la récompense paie ;
 *  - **le rayon est large** (`radius`, 3,2 par défaut au temple) : l'autel est
 *    bloquant, on ne peut pas se poser dessus, et un rayon serré rendrait le
 *    réceptacle impossible à prendre ;
 *  - **l'objet vit dans React, pas dans un pool.** Il y en a un par monument,
 *    posé une fois pour toutes ; le pool des cœurs lâchés existe pour des
 *    objets nombreux et éphémères, ce qui n'est pas le cas ici.
 */

/** Taille du réceptacle : plus gros qu'un cœur lâché, c'est un objet unique. */
const CONTAINER_SIZE = 0.42

// Vecteur de travail partagé : `useFrame` tourne à chaque frame, allouer dedans
// ferait travailler le GC pour rien.
const worldAnchor = new Vector3()

interface HeartContainerProps {
  landmarkId: LandmarkId
  /** Position **locale**, dans le repère du monument. */
  position: [number, number, number]
  /** Distance de ramassage, en unités monde. */
  radius?: number
}

export function HeartContainer({
  landmarkId,
  position,
  radius = 3.2,
}: HeartContainerProps) {
  const group = useRef<Group>(null)
  const mesh = useRef<Mesh>(null)
  const geometry = useMemo(() => heartGeometry(CONTAINER_SIZE), [])

  // Abonnement au store plutôt que lecture par frame : l'objet disparaît une
  // seule fois dans la partie, ce n'est pas une valeur à sonder à 60 fps.
  const claimed = useGameStore((state) => state.heartContainers.includes(landmarkId))

  useFrame(() => {
    const node = mesh.current
    if (!node || claimed) return

    // Horloge de jeu, pas celle de r3f : le réceptacle doit se figer avec le
    // reste du monde quand un panneau est ouvert.
    const t = gameNow() / 1000
    node.rotation.y = t * 0.9
    node.position.y = Math.sin(t * 1.4) * 0.12

    // Position monde du groupe : le monument peut être tourné et déplacé, on ne
    // recalcule pas sa transformation à la main.
    const anchor = group.current
    if (!anchor) return
    anchor.getWorldPosition(worldAnchor)

    const dx = playerTransform.position.x - worldAnchor.x
    const dz = playerTransform.position.z - worldAnchor.z
    const dy = playerTransform.position.y - worldAnchor.y
    if (Math.hypot(dx, dz) > radius || Math.abs(dy) > 3.5) return

    useGameStore.getState().claimHeartContainer(landmarkId)
  })

  if (claimed) return null

  return (
    <group ref={group} position={position}>
      <mesh ref={mesh} geometry={geometry} castShadow>
        {/*
          Émissif marqué : le réceptacle est posé à côté d'un cristal doré qui
          porte la seule lumière ponctuelle de la scène. Une teinte simplement
          rouge s'y noierait — il faut qu'il rayonne pour se distinguer.
        */}
        <meshToonMaterial
          gradientMap={toonGradient}
          color="#ff6a5e"
          emissive="#e8443c"
          emissiveIntensity={0.85}
        />
      </mesh>
    </group>
  )
}
