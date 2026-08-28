import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import {
  AdditiveBlending,
  IcosahedronGeometry,
  Matrix4,
  Object3D,
  type BufferGeometry,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  type MeshToonMaterial,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CHEST_SEQUENCE, type Chest } from '../../config/chests'
import { itemById } from '../../config/items'
import type { ItemId } from '../../types/game'
import { seededRandom } from '../../config/world'
import { now as gameNow } from '../../state/gameClock'
import { useGameStore } from '../../store/useGameStore'
import { toonGradient } from '../models/toonGradient'
import { faceted } from './faceted'
import { box, Z_FIGHT_LIFT } from './solids'

/**
 * Coffre au trésor.
 *
 * Trois décisions structurent ce composant :
 *
 *  - **le coffre est creux**, quatre parois et un fond plutôt qu'un pavé plein.
 *    Ça coûte cinq solides au lieu d'un, et c'est le seul moyen que l'ouverture
 *    montre quelque chose : un couvercle qui se lève sur une face pleine se lit
 *    comme une trappe, pas comme un coffre ;
 *  - **l'état ouvert vit dans le store** (`openedChests`), pas dans une variable
 *    locale. Le couvercle doit rester relevé quand on revient sur place, et une
 *    variable locale se serait remise à zéro au premier remontage ;
 *  - **toute la séquence est chronométrée en temps réel**, sur
 *    `performance.now()` et non sur l'horloge de jeu. Celle-ci est gelée dès
 *    l'appui, la phase passant à `paused` — l'animation ne démarrerait jamais.
 *    Le `useFrame` de r3f, lui, continue de tourner pendant la pause.
 */

const WOOD = '#6b4526'
const WOOD_DARK = '#4d3019'
const IRON = '#3a3630'
const GOLD = '#d9a441'
const GLOW = '#ffd98a'

/** Cotes du coffre, en unités monde. Le joueur mesure 1,6. */
const W = 1.35
const H = 0.6
const D = 0.92
/** Épaisseur des parois : c'est elle qui donne le coffre « taillé » et non en carton. */
const WALL = 0.11
const LID_H = 0.32

/** Angle du couvercle grand ouvert, en radians (≈ 118°). */
const LID_OPEN = -2.06
/** Dépassement de la bascule, avant stabilisation. Le poids du bois. */
const LID_OVERSHOOT = -2.24

/** Nombre d'éclats projetés à l'ouverture. */
const SHARDS = 20

/** Interpolation adoucie sur [0, 1]. */
function smooth(k: number) {
  const t = Math.min(Math.max(k, 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * Coque du coffre : quatre parois, un fond, des ferrures et une serrure.
 *
 * Fusionnée par teinte, comme les monuments : trois draw calls pour tout le
 * coffre plutôt qu'un par planche.
 */
function buildChest() {
  const wood: BufferGeometry[] = []
  const dark: BufferGeometry[] = []
  const iron: BufferGeometry[] = []
  const gold: BufferGeometry[] = []

  // Fond et parois. Les parois latérales sont raccourcies de deux épaisseurs :
  // sans ça elles empiéteraient dans les parois avant et arrière, et les faces
  // communes se battraient dans le tampon de profondeur.
  wood.push(box(W, WALL, D, 0, WALL / 2, 0))
  wood.push(box(W, H, WALL, 0, H / 2, (D - WALL) / 2))
  wood.push(box(W, H, WALL, 0, H / 2, -(D - WALL) / 2))
  wood.push(box(WALL, H, D - 2 * WALL, (W - WALL) / 2, H / 2, 0))
  wood.push(box(WALL, H, D - 2 * WALL, -(W - WALL) / 2, H / 2, 0))

  // Intérieur : un fond plus sombre, à peine au-dessus du plancher. C'est lui
  // qui donne la profondeur quand le couvercle se lève — un fond de la même
  // teinte que les parois aplatissait complètement la caisse.
  dark.push(box(W - 2 * WALL, 0.04, D - 2 * WALL, 0, WALL + 0.02 - Z_FIGHT_LIFT, 0))

  // Ferrures verticales : trois cerclages qui mordent dans le bois.
  for (const x of [-0.45, 0, 0.45]) {
    iron.push(box(0.09, H + Z_FIGHT_LIFT, D + 0.03, x * W, H / 2, 0))
  }
  // Semelle : le coffre est posé sur elle, pas à même le sol.
  iron.push(box(W + 0.06, 0.08, D + 0.06, 0, 0.04, 0))

  // Serrure, sur la face avant (+Z) — celle que le joueur a devant lui.
  gold.push(box(0.24, 0.28, 0.05, 0, H - 0.08, D / 2 + 0.015))
  iron.push(box(0.07, 0.09, 0.03, 0, H - 0.12, D / 2 + 0.045))

  return {
    wood: mergeGeometries(wood)!,
    dark: mergeGeometries(dark)!,
    iron: mergeGeometries(iron)!,
    gold: mergeGeometries(gold)!,
  }
}

/**
 * Couvercle, **construit autour de sa charnière**.
 *
 * L'origine de ces géométries est l'arête arrière haute du coffre, pas leur
 * propre centre : c'est ce qui permet de l'animer par une simple `rotation.x`
 * sur son groupe, sans recalculer un pivot à chaque frame.
 */
function buildLid() {
  const hingeZ = (D - WALL) / 2
  const wood: BufferGeometry[] = []
  const iron: BufferGeometry[] = []

  // Deux assises pour un bombé : une plaque pleine, puis une plus étroite
  // par-dessus. Un couvercle plat se lisait comme une planche posée dessus.
  wood.push(box(W, 0.19, D, 0, 0.095, hingeZ))
  wood.push(box(W - 0.16, 0.15, D - 0.16, 0, 0.19 + 0.075 - Z_FIGHT_LIFT, hingeZ))

  for (const x of [-0.45, 0, 0.45]) {
    iron.push(box(0.09, LID_H + Z_FIGHT_LIFT, D + 0.03, x * W, LID_H / 2 - 0.02, hingeZ))
  }

  return { wood: mergeGeometries(wood)!, iron: mergeGeometries(iron)! }
}

/**
 * Éclats projetés à l'ouverture : direction, portée et vitesse de rotation.
 *
 * Tirés une fois pour toutes sur une graine fixe, comme la mousse de la
 * pyramide : la gerbe doit être irrégulière, mais identique d'une partie à
 * l'autre — une trajectoire recalculée au hasard à chaque ouverture rendrait
 * l'effet impossible à régler.
 */
function buildShards() {
  const random = seededRandom(0x5c0f)
  return Array.from({ length: SHARDS }, () => {
    const angle = random() * Math.PI * 2
    const reach = 0.5 + random() * 1.1
    return {
      dirX: Math.cos(angle) * reach,
      dirZ: Math.sin(angle) * reach,
      rise: 1.1 + random() * 1.5,
      spin: (random() * 2 - 1) * 9,
      scale: 0.55 + random() * 0.8,
      // Départs échelonnés : une gerbe dont tous les éclats partent à la même
      // milliseconde se lit comme une explosion de feu d'artifice, pas comme
      // de la poussière d'or soulevée.
      delay: random() * 0.22,
    }
  })
}

/** Construits une fois pour toutes : tous les coffres partagent ces maillages. */
const shell = buildChest()
const lidGeometry = buildLid()
const shardGeometry = faceted(new IcosahedronGeometry(0.055, 0))
const shards = buildShards()

/** Objet de travail pour composer les matrices d'instances, hors boucle. */
const dummy = new Object3D()
/**
 * Matrice d'échelle nulle, pour les éclats pas encore partis.
 *
 * Constante et non recalculée : c'est la même pour tous, et elle n'est jamais
 * modifiée — la donner à `setMatrixAt` la copie dans le tampon d'instances.
 */
const HIDDEN = new Matrix4().makeScale(0, 0, 0)

type ToonMesh = Mesh<BufferGeometry, MeshToonMaterial>
type BasicMesh = Mesh<BufferGeometry, MeshBasicMaterial>

/**
 * L'objet trouvé, en réduction, flottant au-dessus du coffre ouvert.
 *
 * Volontairement **pas** une reproduction fidèle : à cette taille, en rotation,
 * et une seconde à l'écran, ce sont deux ou trois teintes et une silhouette qui
 * portent la lecture. Le détail, c'est la carte qui suit qui le montre.
 *
 * Un composant par objet plutôt qu'un modèle générique tourné en fonction du
 * type : une tenue se lit couchée et une lame debout, et rien de commun ne
 * ressort de ces deux poses qu'un paramètre aurait pu capturer.
 */
function LootShape({ id, accent }: { id: ItemId; accent: string }) {
  if (id === 'kusanagi') {
    return (
      <>
        {/* Lame dressée, pointe en haut : la seule pose où une arme longue se
            lit dans le faisceau du coffre. */}
        <mesh castShadow position={[0, 0.18, 0]}>
          <boxGeometry args={[0.05, 0.72, 0.025]} />
          <meshToonMaterial
            gradientMap={toonGradient}
            color="#dde6ef"
            emissive={accent}
            emissiveIntensity={0.55}
          />
        </mesh>
        <mesh castShadow position={[0, 0.6, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.035, 0.12, 4]} />
          <meshToonMaterial gradientMap={toonGradient} color="#dde6ef" />
        </mesh>
        <mesh position={[0, -0.19, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.03, 12]} />
          <meshToonMaterial
            gradientMap={toonGradient}
            color={GOLD}
            emissive={GOLD}
            emissiveIntensity={0.9}
          />
        </mesh>
        <mesh castShadow position={[0, -0.32, 0]}>
          <boxGeometry args={[0.05, 0.24, 0.05]} />
          <meshToonMaterial gradientMap={toonGradient} color="#2f4f66" />
        </mesh>
      </>
    )
  }

  return (
    <>
      <mesh castShadow>
        <boxGeometry args={[0.34, 0.4, 0.14]} />
        <meshToonMaterial
          gradientMap={toonGradient}
          color="#4b4062"
          emissive="#4b4062"
          emissiveIntensity={0.45}
        />
      </mesh>
      {[0.09, -0.05].map((y) => (
        <mesh key={y} position={[0, y, 0.075]}>
          <boxGeometry args={[0.3, 0.09, 0.03]} />
          <meshToonMaterial
            gradientMap={toonGradient}
            color={accent}
            emissive={accent}
            emissiveIntensity={0.7}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.02, 0.095]}>
        <boxGeometry args={[0.04, 0.26, 0.02]} />
        <meshToonMaterial
          gradientMap={toonGradient}
          color={GOLD}
          emissive={GOLD}
          emissiveIntensity={1.1}
        />
      </mesh>
    </>
  )
}

export function TreasureChest({ chest }: { chest: Chest }) {
  const lid = useRef<Group>(null)
  const body = useRef<Group>(null)
  const beam = useRef<BasicMesh>(null)
  const burst = useRef<InstancedMesh>(null)
  const loot = useRef<Group>(null)
  const mote = useRef<ToonMesh>(null)

  /**
   * Instant réel du déclenchement, ou `null` hors séquence.
   *
   * Une `ref` et pas un état React : elle est lue à chaque frame, et la mettre
   * dans un état re-rendrait le composant soixante fois par seconde.
   */
  const startedAt = useRef<number | null>(null)

  // Abonnements : ces deux valeurs ne changent qu'à une transition, jamais par
  // frame. Le composant ne se re-rend donc qu'à l'ouverture.
  const opened = useGameStore((state) => state.openedChests.includes(chest.id))
  const revealing = useGameStore((state) => state.chestReveal === chest.id)

  const item = itemById(chest.item)
  const accent = item?.accent ?? GOLD

  // L'horodatage est posé dans un effet et non pendant le rendu : `useFrame`
  // est appelé depuis la boucle d'animation de r3f, donc toujours après que
  // React a validé la mise à jour — l'animation ne peut pas rater sa première
  // image, et le rendu reste pur.
  useEffect(() => {
    startedAt.current = revealing ? performance.now() : null
  }, [revealing])

  useFrame(() => {
    const elapsed = startedAt.current === null ? Infinity : performance.now() - startedAt.current
    const animating = Number.isFinite(elapsed)

    // --- Couvercle ----------------------------------------------------------
    if (lid.current) {
      if (!opened) {
        lid.current.rotation.x = 0
      } else if (!animating) {
        // Retour sur les lieux : le coffre est simplement resté ouvert.
        lid.current.rotation.x = LID_OPEN
      } else {
        const k = elapsed / CHEST_SEQUENCE.lidMs
        // Deux temps : la bascule dépasse l'angle final, puis y revient. C'est
        // ce rebond qui donne son poids au couvercle ; sans lui, il glisse.
        lid.current.rotation.x =
          k < 1
            ? LID_OVERSHOOT * smooth(k)
            : LID_OPEN + (LID_OVERSHOOT - LID_OPEN) * Math.max(0, 1 - (k - 1) * 6)
      }
    }

    // --- Sursaut de la caisse ------------------------------------------------
    if (body.current) {
      const k = animating ? elapsed / CHEST_SEQUENCE.lidMs : 1
      // Le coffre décolle de trois centimètres au moment où le couvercle claque
      // en arrière. Rien ne le justifie physiquement, et c'est précisément ce
      // qui rend l'ouverture satisfaisante — le monde accuse le coup.
      body.current.position.y = k < 1 ? Math.sin(k * Math.PI) * 0.035 : 0
    }

    // --- Colonne de lumière ---------------------------------------------------
    if (beam.current) {
      const k = animating ? (elapsed - CHEST_SEQUENCE.beamAt) / CHEST_SEQUENCE.beamMs : 1
      const visible = k > 0 && k < 1
      beam.current.visible = visible
      if (visible) {
        // Elle jaillit vite et s'éteint lentement : l'inverse se serait lu
        // comme une lampe qu'on allume, pas comme quelque chose qui s'échappe.
        const rise = smooth(Math.min(k * 3, 1))
        beam.current.scale.set(0.35 + rise * 0.65, rise, 0.35 + rise * 0.65)
        beam.current.material.opacity = 0.75 * (1 - smooth(k)) * rise
        beam.current.rotation.y = elapsed / 700
      }
    }

    // --- Gerbe d'éclats -------------------------------------------------------
    if (burst.current) {
      const k = animating ? (elapsed - CHEST_SEQUENCE.shardsAt) / CHEST_SEQUENCE.shardsMs : 1
      const visible = k > 0 && k < 1
      burst.current.visible = visible
      if (visible) {
        for (let i = 0; i < shards.length; i++) {
          const shard = shards[i]
          const local = (k - shard.delay) / (1 - shard.delay)
          if (local <= 0) {
            // Pas encore parti : matrice nulle plutôt qu'un éclat posé à
            // l'origine, qui apparaîtrait comme une pastille au fond du coffre.
            burst.current.setMatrixAt(i, HIDDEN)
            continue
          }
          // Trajectoire balistique : la montée s'essouffle, la retombée
          // accélère. `local - local²` en donne exactement l'allure.
          const t = Math.min(local, 1)
          dummy.position.set(
            shard.dirX * t,
            H + shard.rise * (t - t * t * 0.85),
            shard.dirZ * t,
          )
          dummy.rotation.set(t * shard.spin, t * shard.spin * 0.7, 0)
          dummy.scale.setScalar(shard.scale * (1 - t * 0.6))
          dummy.updateMatrix()
          burst.current.setMatrixAt(i, dummy.matrix)
        }
        burst.current.instanceMatrix.needsUpdate = true
        const material = burst.current.material as MeshBasicMaterial
        material.opacity = 1 - smooth(Math.max(0, (k - 0.55) / 0.45))
      }
    }

    // --- L'objet qui s'élève ---------------------------------------------------
    if (loot.current) {
      const k = animating ? (elapsed - CHEST_SEQUENCE.itemAt) / CHEST_SEQUENCE.itemMs : -1
      const visible = k > 0
      loot.current.visible = visible
      if (visible) {
        const rise = smooth(Math.min(k, 1))
        // Il sort du coffre, il n'y apparaît pas au-dessus : le départ est à
        // l'intérieur de la caisse, sous la ligne des parois.
        loot.current.position.y = 0.25 + rise * 1.05 + Math.sin(elapsed / 520) * 0.05 * rise
        loot.current.rotation.y = elapsed / 900
        loot.current.scale.setScalar(0.35 + rise * 0.65)
      }
    }

    // --- Braise dorée du coffre fermé -------------------------------------------
    if (mote.current && !opened) {
      // Horloge de jeu ici, et pas `performance.now()` : hors séquence, ce
      // repère doit se figer avec le reste du monde quand un panneau s'ouvre.
      const t = gameNow() / 1000
      mote.current.position.y = H + 0.5 + Math.sin(t * 1.8) * 0.08
      mote.current.rotation.set(t * 0.7, t * 1.1, 0)
      mote.current.material.emissiveIntensity = 1.5 + Math.sin(t * 2.6) * 0.45
    }
  })

  return (
    <group position={[chest.world.x, chest.world.y, chest.world.z]} rotation={[0, chest.worldYaw, 0]}>
      <group ref={body}>
        <mesh geometry={shell.wood} castShadow receiveShadow>
          <meshToonMaterial gradientMap={toonGradient} color={WOOD} />
        </mesh>
        <mesh geometry={shell.dark} receiveShadow>
          <meshToonMaterial gradientMap={toonGradient} color={WOOD_DARK} />
        </mesh>
        <mesh geometry={shell.iron} castShadow receiveShadow>
          <meshToonMaterial gradientMap={toonGradient} color={IRON} />
        </mesh>
        <mesh geometry={shell.gold} castShadow>
          <meshToonMaterial
            gradientMap={toonGradient}
            color={GOLD}
            emissive={GOLD}
            emissiveIntensity={opened ? 0.15 : 0.6}
          />
        </mesh>

        {/* Charnière à l'arête arrière haute : le couvercle s'ouvre en
            s'écartant du joueur, qui aborde toujours le coffre par le sud. */}
        <group ref={lid} position={[0, H, -(D - WALL) / 2]}>
          <mesh geometry={lidGeometry.wood} castShadow receiveShadow>
            <meshToonMaterial gradientMap={toonGradient} color={WOOD} />
          </mesh>
          <mesh geometry={lidGeometry.iron} castShadow>
            <meshToonMaterial gradientMap={toonGradient} color={IRON} />
          </mesh>
        </group>
      </group>

      {/*
        Colonne de lumière. Additive et sans écriture de profondeur : c'est un
        volume lumineux, pas un solide — il doit se superposer au décor, jamais
        le masquer ni recevoir d'ombre. Aucune `pointLight` n'est ajoutée : le
        bloom du post-traitement fait le halo à partir de l'émissif, et une
        seconde source d'éclairage coûterait une passe dans *tous* les shaders
        de la scène, végétation instanciée comprise. Même arbitrage que la
        braise des monuments.
      */}
      <mesh ref={beam} position={[0, H + 1.5, 0]} visible={false}>
        <coneGeometry args={[0.6, 3.4, 14, 1, true]} />
        <meshBasicMaterial
          color={GLOW}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <instancedMesh
        ref={burst}
        args={[shardGeometry, undefined, SHARDS]}
        visible={false}
        frustumCulled={false}
      >
        <meshBasicMaterial color={GLOW} transparent opacity={1} depthWrite={false} />
      </instancedMesh>

      <group ref={loot} visible={false}>
        <LootShape id={chest.item} accent={accent} />
      </group>

      {/*
        Repère du coffre fermé. Doré, là où les monuments portent une braise
        bleue : le bleu est réservé à « ce lieu a quelque chose à raconter »,
        l'or à « il y a quelque chose à prendre ». Deux promesses différentes ne
        peuvent pas avoir la même couleur, sinon aucune ne veut plus rien dire.
      */}
      {!opened && (
        <mesh ref={mote} position={[0, H + 0.5, 0]}>
          {/* 0,16 et non 0,11 : mesuré en jeu, la première taille se perdait
              dans le feuillage de la clairière dès qu'on s'éloignait de dix
              unités, et le coffre redevenait invisible. */}
          <octahedronGeometry args={[0.16, 0]} />
          <meshToonMaterial
            gradientMap={toonGradient}
            color={GLOW}
            emissive={GOLD}
            emissiveIntensity={1.5}
          />
        </mesh>
      )}

      {/* Un seul pavé pour toute la caisse : le couvercle ouvert n'a pas de
          collider, le joueur ne peut de toute façon pas l'atteindre. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[W / 2, (H + LID_H) / 2, D / 2]} position={[0, (H + LID_H) / 2, 0]} />
      </RigidBody>
    </group>
  )
}
