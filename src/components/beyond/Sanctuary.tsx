import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import {
  CircleGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  RingGeometry,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'
import { SANCTUARY, SANCTUARY_TRUCE_R } from '../../config/beyond'
import { now as gameNow } from '../../state/gameClock'
import { clearSanctuary, updateSanctuary } from '../../state/sanctuary'
import { faceted } from '../environment/faceted'
import { Z_FIGHT_LIFT } from '../environment/solids'
import type { BeyondMaterials } from './materials'

/**
 * Le Sanctuaire — la zone franche, et la première image de l'Outremonde.
 *
 * **Il a deux métiers, et ils n'ont rien à voir l'un avec l'autre.**
 *
 * Le premier est mécanique : il entretient la trêve. C'est ce composant, et lui
 * seul, qui dit au reste du jeu si le joueur est en sécurité — une fois par
 * frame, dans `state/sanctuary.ts`, et remis à plat au démontage. Il est monté
 * avec la carte et démonté avec elle, ce qui fait de la trêve une propriété du
 * lieu plutôt qu'un état de partie qu'on pourrait oublier d'éteindre.
 *
 * Le second est de mise en scène, et c'est le plus difficile : le joueur sort du
 * voile de transition **ici**, immobile, et il doit comprendre en une seconde
 * trois choses qu'aucun texte ne lui dira — qu'il est arrivé quelque part
 * d'important, qu'il y est en sécurité, et que ça s'arrête au bord du dallage.
 *
 * Quatre pièces s'en chargent, et chacune ne fait qu'une de ces trois choses :
 *
 *  - **le dallage et son liseré d'or** disent le lieu construit. C'est la seule
 *    surface plane et régulière de deux cents unités à la ronde ;
 *  - **le cercle de monolithes** donne l'échelle. Sans eux, un disque de pierre
 *    vu de haut est un patio ; avec eux, c'est un temple. Ils sont la seule
 *    verticale du sud de la carte ;
 *  - **la colonne de lumière** se voit **de partout**. C'est un repère de
 *    navigation avant d'être un effet : à cent quarante unités, dans les terres
 *    arides, c'est elle qui dit où rentrer ;
 *  - **l'anneau de la trêve**, tracé au sol à la limite exacte de la paix. Il ne
 *    ressemble à rien de ce que le jeu dessine d'habitude — pas de braise, pas
 *    d'icône — et c'est ce qui le rend lisible : une ligne au sol qu'on franchit,
 *    et les bêtes s'arrêtent dessus.
 */

/** Hauteur de la surface dallée : le sol de la terrasse, à peine décollé. */
const FLOOR_Y = SANCTUARY.altitude + Z_FIGHT_LIFT

/** Les monolithes : combien, à quelle distance du centre, et leur hauteur. */
const MONOLITHS = 9
const MONOLITH_R = 15
const MONOLITH_H = 5.2

/** Les vasques : combien, et à quelle distance. Plus près, elles éclairent le dallage. */
const BRAZIERS = 4
const BRAZIER_R = 9.5

/**
 * Poussières en suspension au-dessus du dallage.
 *
 * Trente-six, en un seul `InstancedMesh` : un draw call, et trente-six écritures
 * de matrice par frame, ce qui est négligeable devant le millier d'instances de
 * végétation que la carte porte déjà. C'est le seul mouvement du Sanctuaire en
 * dehors des flammes, et il est indispensable — un lieu parfaitement immobile
 * est un décor, pas un endroit.
 */
const MOTES = 36
const MOTE_R = 14

export function Sanctuary({ materials }: { materials: BeyondMaterials }) {
  const motes = useRef<InstancedMesh>(null)
  const beam = useRef<Mesh<BufferGeometry, MeshBasicMaterial>>(null)
  const flames = useRef<(Mesh | null)[]>([])

  const geometry = useMemo(
    () => ({
      floor: new CircleGeometry(SANCTUARY.radius, 56).rotateX(-Math.PI / 2),
      rim: new RingGeometry(SANCTUARY.radius - 0.9, SANCTUARY.radius, 56).rotateX(-Math.PI / 2),
      inlay: new RingGeometry(6.4, 7.1, 48).rotateX(-Math.PI / 2),
      // L'anneau de la trêve : plus fin que le liseré du dallage, et plus loin.
      truce: new RingGeometry(SANCTUARY_TRUCE_R - 0.35, SANCTUARY_TRUCE_R, 64).rotateX(
        -Math.PI / 2,
      ),
      monolith: faceted(new CylinderGeometry(0.42, 0.72, MONOLITH_H, 5)),
      bowl: faceted(new CylinderGeometry(0.62, 0.32, 0.5, 8)),
      stem: faceted(new CylinderGeometry(0.2, 0.28, 1.5, 6)),
      flame: faceted(new IcosahedronGeometry(0.42, 0)),
      /*
        La colonne : un cylindre **ouvert aux deux bouts**, donc sans capuchon.

        Un cylindre fermé montre son disque supérieur dès qu'on s'en éloigne, et
        une colonne de lumière qui a un couvercle cesse instantanément d'être de
        la lumière. Ouvert, il n'y a rien à voir par le haut.
      */
      beam: new CylinderGeometry(1.5, 2.6, 70, 18, 1, true),
      mote: new IcosahedronGeometry(0.11, 0),
    }),
    [],
  )

  /*
    Les poussières sont **posées une fois** et déplacées ensuite, jamais
    recréées : leurs positions de départ sont tirées au montage et gardées dans
    une table locale que la boucle relit. Les tirer dans la boucle les ferait
    scintiller au hasard au lieu de flotter.
  */
  const seeds = useMemo(
    () =>
      Array.from({ length: MOTES }, (_, index) => {
        const angle = (index / MOTES) * Math.PI * 2 * 3.1
        const radius = 2 + ((index * 7) % MOTE_R)
        return {
          x: Math.sin(angle) * radius,
          z: Math.cos(angle) * radius,
          // Une hauteur et une vitesse par poussière : sans cette dispersion,
          // les trente-six montent en rang, ce qui se lit comme un ascenseur.
          base: 0.4 + (index % 9) * 0.55,
          speed: 0.25 + ((index * 13) % 7) * 0.05,
          phase: index * 1.7,
        }
      }),
    [],
  )

  // La trêve est levée au démontage — c'est-à-dire en quittant la carte. Sans
  // ça, `safe` resterait à `true` pour toute la partie et plus aucun ennemi du
  // jeu n'attaquerait jamais. Voir l'en-tête de `state/sanctuary.ts`.
  useEffect(() => clearSanctuary, [])

  useLayoutEffect(() => {
    const mesh = motes.current
    if (!mesh) return
    // Le volume englobant par défaut ignore les matrices d'instance : sans ce
    // recalcul, le frustum culling escamote la nuée dès qu'on regarde à côté.
    mesh.computeBoundingSphere()
  }, [])

  const matrix = useMemo(() => new Matrix4(), [])
  const scratch = useMemo(() => new Vector3(), [])

  useFrame(() => {
    // Le cœur mécanique du composant, et il tient en une ligne. Avant tout le
    // reste : les ennemis lisent le drapeau dans leur propre boucle, et une
    // frame de retard leur ferait attaquer sur le dallage.
    updateSanctuary()

    // Horloge de **jeu** : tout le Sanctuaire se fige avec le monde quand un
    // panneau s'ouvre. Une flamme qui continue de danser derrière une modale de
    // pause trahit deux temps distincts.
    const t = gameNow() / 1000

    const mesh = motes.current
    if (mesh) {
      for (let index = 0; index < MOTES; index++) {
        const seed = seeds[index]
        // Montée lente, recyclée par un modulo : la poussière qui atteint le
        // haut réapparaît en bas. Un aller-retour sinusoïdal aurait donné une
        // respiration, c'est-à-dire un mouvement qui redescend — et rien de ce
        // qui flotte dans l'air ne redescend en rythme.
        const rise = (t * seed.speed + seed.phase) % 5.5
        scratch.set(
          SANCTUARY.x + seed.x + Math.sin(t * 0.4 + seed.phase) * 0.6,
          SANCTUARY.altitude + seed.base + rise,
          SANCTUARY.z + seed.z + Math.cos(t * 0.32 + seed.phase) * 0.6,
        )
        matrix.makeTranslation(scratch.x, scratch.y, scratch.z)
        mesh.setMatrixAt(index, matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }

    if (beam.current) {
      // La colonne respire très lentement et très peu : entre 0,16 et 0,24
      // d'opacité. Au-delà, elle devient un mur de brume qui masque le maître ;
      // en deçà, elle disparaît sous le soleil.
      beam.current.material.opacity = 0.2 + Math.sin(t * 0.5) * 0.04
      beam.current.rotation.y = t * 0.06
    }

    // Une phase par vasque, tirée de son indice : les quatre flammes battent au
    // même rythme mais pas au même instant. En phase, elles se lisent comme un
    // clignotant unique à quatre ampoules.
    flames.current.forEach((flame, index) => {
      if (!flame) return
      flame.scale.setScalar(1 + Math.sin(t * 3.4 + index * 1.6) * 0.12)
      flame.rotation.y = t * 0.9
    })
  })

  return (
    <group position={[SANCTUARY.x, 0, SANCTUARY.z]}>
      {/*
        Le dallage, le liseré d'or, et l'incrustation centrale.

        Aucun collider : le terrain est **déjà plat** à cette altitude — c'est
        une terrasse de `beyondHeight`, au même titre que les parvis de monuments
        du continent — et son heightfield porte déjà le joueur. Poser un second
        sol par-dessus n'aurait rien ajouté qu'une marche de douze millimètres à
        franchir.
      */}
      <mesh geometry={geometry.floor} material={materials.stone} position={[0, FLOOR_Y, 0]} receiveShadow />
      <mesh
        geometry={geometry.rim}
        material={materials.gold}
        position={[0, FLOOR_Y + Z_FIGHT_LIFT, 0]}
      />
      <mesh
        geometry={geometry.inlay}
        material={materials.gold}
        position={[0, FLOOR_Y + Z_FIGHT_LIFT, 0]}
      />

      {/*
        L'anneau de la trêve, en violet et non en or.

        C'est la seule pièce du Sanctuaire qui ne soit pas de la palette du bâti,
        et c'est délibéré : elle ne décrit pas une construction mais une **règle**.
        Le violet est, dans ce jeu, la couleur de ce qui n'est pas de ce monde —
        les portails, et maintenant la limite d'une paix qui n'a pas d'explication
        physique.
      */}
      <mesh
        geometry={geometry.truce}
        material={materials.violet}
        position={[0, SANCTUARY.altitude + Z_FIGHT_LIFT * 2, 0]}
      />

      {/*
        Les monolithes, penchés vers l'extérieur d'un dixième de radian.

        Ils ont un collider, contrairement aux contreforts du bassin d'Aeonia, et
        la raison est inverse de celle qui les en privait là-bas : ici on ne
        recule pas en combattant — on ne combat pas du tout — et un décor qu'on
        traverse dans un lieu où l'on marche tranquillement se remarque
        immédiatement. Ils sont neuf, assez espacés pour qu'on passe partout
        entre eux, et posés à quinze unités, c'est-à-dire à deux unités du bord
        du dallage.
      */}
      <RigidBody type="fixed" colliders={false}>
        {Array.from({ length: MONOLITHS }, (_, index) => {
          const angle = (index / MONOLITHS) * Math.PI * 2 + 0.2
          const x = Math.sin(angle) * MONOLITH_R
          const z = Math.cos(angle) * MONOLITH_R
          const height = MONOLITH_H * (index % 3 === 0 ? 1.25 : 1)
          return (
            <group key={index} position={[x, SANCTUARY.altitude, z]}>
              <mesh
                geometry={geometry.monolith}
                material={index % 3 === 0 ? materials.stone : materials.stoneDark}
                position={[0, height / 2, 0]}
                scale={[1, height / MONOLITH_H, 1]}
                rotation={[Math.cos(angle) * 0.06, angle, Math.sin(angle) * -0.06]}
                castShadow
              />
              {/* Dans le repère du groupe, donc sans reprendre `x` et `z` : ils
                  sont déjà portés par lui, et les répéter ici décalerait le
                  collider de sa pierre d'exactement une fois son rayon. */}
              <CylinderCollider args={[height / 2, 0.6]} position={[0, height / 2, 0]} />
            </group>
          )
        })}
      </RigidBody>

      {/* Les vasques. Leur flamme est un solide émissif et non une lumière : une
          `pointLight` par vasque ajouterait quatre passes d'éclairage dans tous
          les shaders de la scène, végétation instanciée comprise. Le bloom du
          post-traitement fait déjà le halo. Voir l'en-tête d'`InteractionMarker`. */}
      {Array.from({ length: BRAZIERS }, (_, index) => {
        const angle = (index / BRAZIERS) * Math.PI * 2 + Math.PI / 4
        const x = Math.sin(angle) * BRAZIER_R
        const z = Math.cos(angle) * BRAZIER_R
        return (
          <group key={index} position={[x, SANCTUARY.altitude, z]}>
            <mesh geometry={geometry.stem} material={materials.stoneDark} position={[0, 0.75, 0]} castShadow />
            <mesh geometry={geometry.bowl} material={materials.gold} position={[0, 1.7, 0]} castShadow />
            <mesh
              ref={(node) => {
                flames.current[index] = node
              }}
              geometry={geometry.flame}
              material={materials.ember}
              position={[0, 2.1, 0]}
            />
          </group>
        )
      })}

      {/*
        La colonne de lumière.

        `depthWrite` désactivé et pas de face arrière : sans les deux, la moitié
        de la colonne masque l'autre et on voit une arête verticale en tournant
        autour. Elle ne projette évidemment pas d'ombre — une ombre opaque sous
        un faisceau lumineux trahit le truc en une frame.
      */}
      <mesh ref={beam} geometry={geometry.beam} position={[0, SANCTUARY.altitude + 34, 0]}>
        <meshBasicMaterial
          color="#ffe9bd"
          transparent
          opacity={0.2}
          depthWrite={false}
          fog={false}
        />
      </mesh>

      {/* La nuée. Hors du groupe positionné : ses matrices sont écrites en
          coordonnées **monde** dans la boucle, parce qu'elles y sont plus
          faciles à lire que dans un repère décalé de soixante-quatorze unités. */}
      <group position={[-SANCTUARY.x, 0, -SANCTUARY.z]}>
        <instancedMesh ref={motes} args={[geometry.mote, materials.aurora, MOTES]} frustumCulled={false} />
      </group>
    </group>
  )
}
