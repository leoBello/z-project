import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Outlines } from '@react-three/drei'
import { MathUtils, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { SENSEI } from '../../config/beyond'
import { now as gameNow } from '../../state/gameClock'
import { playerTransform } from '../../state/playerTransform'
import { useGameStore } from '../../store/useGameStore'
import { toonGradient } from '../models/toonGradient'

/**
 * Le maître du Sanctuaire — le seul personnage non hostile du jeu.
 *
 * **Tout le jeu jusqu'ici n'a montré que des choses à abattre.** Six monuments,
 * onze coffres, quatre boss, et pas une figure à qui parler. Celui-ci arrive
 * après la fin, dans le seul endroit où l'on ne se bat pas, et sa seule fonction
 * est de **proposer** quelque chose. C'est pour cette raison qu'il est un
 * personnage et non une stèle : un panneau de pierre aurait donné les mêmes
 * règles, mais personne ne se serait demandé qui l'avait écrit.
 *
 * Il est construit exactement comme le héros — mêmes proportions chibi, mêmes
 * hauteurs de squelette, `meshToonMaterial` et `Outlines` — et c'est
 * indispensable : un modèle d'un autre style se lirait comme un objet importé.
 * Ce qui change tient dans la palette, la coupe de cheveux et la pose.
 *
 * Il ne réutilise pas `HeroPlaceholder` pour autant, et il ne faut pas s'y
 * tromper : celui-ci est un rig **animé par les commandes du joueur** — marche
 * synchronisée à la vitesse réelle, pose aérienne, coup d'épée, parade. Rien de
 * tout cela ne s'applique à quelqu'un qui reste debout au même endroit, et
 * l'habiller en skin de plus aurait ajouté un neuvième jeu de vêtements à une
 * table qui décrit les tenues **portables par le joueur**.
 *
 * Il n'a **pas de collider** : on lui marche dedans, et c'est mieux ainsi. Un
 * obstacle physique planté devant le seul interlocuteur du jeu se traduit par
 * un joueur qui se coince dans lui en essayant de l'aborder.
 */

/** Hauteurs de référence du squelette, reprises telles quelles du héros. */
const HIP_Y = 0.44
const SHOULDER_Y = 0.9
const HEAD_Y = 1.2
/** Épaisseur du contour cel-shading, comme partout ailleurs. */
const OUTLINE = 0.028

/**
 * La palette : orange de gi, bleu de sous-pull, cheveux noirs.
 *
 * Trois teintes, et elles n'existent nulle part ailleurs dans le jeu. C'est la
 * seule chose qui compte ici : le Sanctuaire est fait de pierre claire et d'or,
 * le ciel est violet, le monde est vert et ocre. Une silhouette orange vif au
 * milieu de ça ne peut être confondue avec rien, et c'est exactement ce qu'on
 * demande à la seule figure vivante d'une carte de cent quatre-vingts ennemis.
 */
const PALETTE = {
  gi: '#f08a1e',
  under: '#2a5fb8',
  sash: '#2a5fb8',
  skin: '#f0c49a',
  hair: '#17131b',
  boot: '#f2f0e8',
  outline: '#2b1d10',
}

/** Les mèches : leur cap autour du crâne, leur inclinaison et leur longueur. */
const SPIKES: readonly (readonly [number, number, number])[] = [
  [0, 0.55, 0.42],
  [0.8, 0.75, 0.36],
  [-0.8, 0.75, 0.36],
  [1.7, 1.0, 0.32],
  [-1.7, 1.0, 0.32],
  [2.6, 1.15, 0.3],
  [-2.6, 1.15, 0.3],
  [Math.PI, 1.25, 0.34],
  [0.4, 0.25, 0.44],
  [-0.4, 0.25, 0.44],
]

export function Sensei() {
  const root = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const spark = useRef<Mesh>(null)

  /*
    L'invite est retirée au démontage, et cette ligne n'est pas une précaution.

    Le joueur franchit le portail du retour depuis le Sanctuaire, c'est-à-dire
    très exactement d'un endroit d'où il peut être à portée du maître. Sans ce
    nettoyage, `nearbySensei` resterait à `true` sur le Marais, sur l'île et sur
    le continent : la touche d'interaction y proposerait « parler au maître »
    devant un arbre mort, et l'appuyer ouvrirait une proposition de défi sur une
    carte qui n'en a pas. C'est la discipline de `LandmarkProximity` et des
    coffres, pour la même raison qu'eux.
  */
  useEffect(() => () => useGameStore.getState().setNearbySensei(false), [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    // Horloge de jeu : il se fige avec le monde quand sa propre proposition
    // s'ouvre. Un interlocuteur qui continue de respirer derrière sa modale
    // aurait l'air de parler tout seul.
    const t = gameNow() / 1000

    const distance = Math.hypot(
      playerTransform.position.x - SENSEI.x,
      playerTransform.position.z - SENSEI.z,
    )
    const near = distance < SENSEI.radius

    /*
      Écriture sur **transition** seulement, comme les coffres, les monuments et
      les portails. Sans ce test, le store serait écrit soixante fois par seconde
      tant que le joueur reste à portée, et tout ce qui s'y abonne — le HUD,
      l'invite, le bouton tactile — se re-rendrait à la même cadence pour
      réafficher le même mot.
    */
    const store = useGameStore.getState()
    if (near !== store.nearbySensei) store.setNearbySensei(near)

    if (torso.current) {
      // Respiration : deux centimètres et demi, en huit secondes de cycle. C'est
      // peu, et c'est le but — il est **immobile**, il n'attend rien d'autre que
      // qu'on vienne. Une idle ample l'aurait rendu impatient.
      torso.current.position.y = HIP_Y + Math.sin(t * 0.8) * 0.025
    }

    /*
      Le salut, et c'est sa seule animation.

      Le bras droit monte quand le joueur entre à portée, et bat lentement. Il
      redescend quand on s'éloigne. C'est la **confirmation dans la scène** que
      l'interaction est disponible, là où le joueur regarde — l'invite du HUD,
      elle, est en bas de l'écran, loin des yeux au moment où l'on s'approche.
      Même raisonnement que la braise des monuments qui grandit à l'approche.

      Amorti et non commuté : un bras qui se téléporte en position haute à la
      frame du franchissement casserait la seule chose qu'on lui demande, qui est
      d'avoir l'air vivant.
    */
    if (armR.current) {
      const target = near ? -2.1 + Math.sin(t * 5) * 0.25 : 0.08
      armR.current.rotation.x = MathUtils.damp(armR.current.rotation.x, target, 7, delta)
    }
    if (armL.current) {
      armL.current.rotation.x = MathUtils.damp(
        armL.current.rotation.x,
        Math.sin(t * 0.8 + 1) * 0.04,
        7,
        delta,
      )
    }

    if (spark.current) {
      spark.current.position.y = 1.85 + Math.sin(t * 1.9) * 0.08
      spark.current.rotation.y = t * 1.2
      spark.current.scale.setScalar(near ? 1.3 : 1)
      // Non éclairée : la teinte porte tout, et le bloom fait le halo.
      ;(spark.current.material as MeshBasicMaterial).opacity = near ? 1 : 0.7
    }
  })

  return (
    <group ref={root} position={[SENSEI.x, SENSEI.y, SENSEI.z]} rotation-y={SENSEI.yaw}>
      {/* --- Jambes : deux capsules dans des bottes claires --- */}
      {[0.13, -0.13].map((x) => (
        <group key={x} position={[x, HIP_Y, 0]}>
          <mesh castShadow position={[0, -0.16, 0]}>
            <capsuleGeometry args={[0.085, 0.26, 4, 10]} />
            <meshToonMaterial color={PALETTE.gi} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={PALETTE.outline} />
          </mesh>
          <mesh castShadow position={[0, -0.37, 0.02]}>
            <boxGeometry args={[0.18, 0.16, 0.26]} />
            <meshToonMaterial color={PALETTE.boot} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={PALETTE.outline} />
          </mesh>
        </group>
      ))}

      <group ref={torso} position={[0, HIP_Y, 0]}>
        {/* Le buste : un tronc de cylindre orange. Le col bleu qui dépasse au
            sommet est **la** signature de la tenue — sans lui, c'est un moine en
            robe safran, avec lui on sait immédiatement de qui il s'agit. */}
        <mesh castShadow position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.235, 0.205, 0.52, 12]} />
          <meshToonMaterial color={PALETTE.gi} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={PALETTE.outline} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.18, 0.2, 0.1, 12]} />
          <meshToonMaterial color={PALETTE.under} gradientMap={toonGradient} />
        </mesh>
        {/* La ceinture, nouée bas sur les hanches. */}
        <mesh castShadow position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.215, 0.215, 0.14, 12]} />
          <meshToonMaterial color={PALETTE.sash} gradientMap={toonGradient} />
          <Outlines thickness={OUTLINE} color={PALETTE.outline} />
        </mesh>

        {/* --- Bras : pivot à l'épaule, comme le héros --- */}
        {[
          { ref: armR, x: -0.26 },
          { ref: armL, x: 0.26 },
        ].map(({ ref, x }) => (
          <group key={x} ref={ref} position={[x, SHOULDER_Y - HIP_Y, 0]}>
            <mesh castShadow position={[0, -0.16, 0]}>
              <capsuleGeometry args={[0.072, 0.22, 4, 10]} />
              <meshToonMaterial color={PALETTE.gi} gradientMap={toonGradient} />
              <Outlines thickness={OUTLINE} color={PALETTE.outline} />
            </mesh>
            {/* Poignet bleu et poing nu : les deux bouts de la manche. */}
            <mesh position={[0, -0.3, 0]}>
              <cylinderGeometry args={[0.078, 0.078, 0.07, 10]} />
              <meshToonMaterial color={PALETTE.under} gradientMap={toonGradient} />
            </mesh>
            <mesh castShadow position={[0, -0.37, 0]}>
              <sphereGeometry args={[0.078, 10, 10]} />
              <meshToonMaterial color={PALETTE.skin} gradientMap={toonGradient} />
              <Outlines thickness={OUTLINE} color={PALETTE.outline} />
            </mesh>
          </group>
        ))}

        {/* --- Tête --- */}
        <group position={[0, HEAD_Y - HIP_Y, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.26, 18, 16]} />
            <meshToonMaterial color={PALETTE.skin} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={PALETTE.outline} />
          </mesh>

          {[0.245, -0.245].map((x) => (
            <mesh key={x} castShadow position={[x, 0, 0]} scale={[0.6, 1, 0.8]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshToonMaterial color={PALETTE.skin} gradientMap={toonGradient} />
            </mesh>
          ))}

          {/* Les yeux : deux billes sombres posées sur la face. Pas de bouche —
              le héros n'en a pas non plus, et une bouche sur l'un des deux
              aurait immédiatement fait paraître l'autre inachevé. */}
          {[0.095, -0.095].map((x) => (
            <mesh key={x} position={[x, 0.03, 0.235]} scale={[0.6, 1, 0.4]}>
              <sphereGeometry args={[0.05, 10, 10]} />
              <meshToonMaterial color={PALETTE.hair} gradientMap={toonGradient} />
            </mesh>
          ))}

          {/*
            La chevelure : une calotte, et dix mèches en cônes.

            C'est la seule pièce du modèle qui compte vraiment. Elle est faite de
            cônes plutôt que d'une forme sculptée parce qu'une silhouette
            hérissée se reconnaît **par son contour**, et qu'un contour de cônes
            reste net à vingt et une unités de recul, là où un volume lissé
            redevient une boule.

            Chaque mèche part du sommet du crâne, se couche de son angle propre,
            puis pivote autour de l'axe vertical : les plus proches de l'avant
            sont presque droites, celles de l'arrière presque horizontales.
          */}
          <mesh castShadow position={[0, 0.06, -0.02]} scale={[1.06, 0.92, 1.06]}>
            <sphereGeometry args={[0.26, 14, 12]} />
            <meshToonMaterial color={PALETTE.hair} gradientMap={toonGradient} />
            <Outlines thickness={OUTLINE} color={PALETTE.outline} />
          </mesh>
          {SPIKES.map(([yaw, tilt, length], index) => (
            <group key={index} rotation={[0, yaw, 0]}>
              <mesh
                castShadow
                position={[0, 0.2 + Math.cos(tilt) * length * 0.5, -Math.sin(tilt) * length * 0.5]}
                rotation={[-tilt, 0, 0]}
              >
                <coneGeometry args={[0.075, length, 5]} />
                <meshToonMaterial color={PALETTE.hair} gradientMap={toonGradient} />
                <Outlines thickness={OUTLINE} color={PALETTE.outline} />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      {/*
        L'étincelle au-dessus de sa tête.

        Même rôle que la braise bleue des monuments : elle dit « il se passe
        quelque chose ici » de loin, avant qu'on soit à portée. Elle est de la
        teinte de l'aurore et non du bleu des monuments, parce que ceux-là
        n'existent pas sur cette carte et que le bleu froid y appartiendrait au
        ciel plutôt qu'à lui.
      */}
      <mesh ref={spark} position={[0, 1.85, 0]}>
        <octahedronGeometry args={[0.13, 0]} />
        <meshBasicMaterial color="#9ceeff" transparent opacity={0.7} />
      </mesh>
    </group>
  )
}
