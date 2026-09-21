import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Outlines } from '@react-three/drei'
import {
  Color,
  MathUtils,
  MeshBasicMaterial,
  MeshToonMaterial,
  type Group,
  type Mesh,
} from 'three'
import { SENSEI } from '../../config/beyond'
import { formForMastery } from '../../config/senseiForms'
import { now as gameNow } from '../../state/gameClock'
import { playerTransform } from '../../state/playerTransform'
import { useGameStore } from '../../store/useGameStore'
import { toonGradient } from '../models/toonGradient'
import {
  BANGS,
  BLUE,
  BOOT_TRIM,
  CROWN,
  EXTRA_BLADES,
  GI,
  HEAD_Y,
  HIP_Y,
  KANJI,
  MANE_SPIKES,
  MAX_BOLTS,
  MAX_MOTES,
  MAX_TONGUES,
  MIN_ELEVATION,
  OUTLINE,
  OUTLINE_COLOR,
  POLE,
  POLE_CAP,
  SHOULDER_Y,
  SKIN,
} from './senseiGeometry'

/**
 * Le maître du Sanctuaire, et ses six formes.
 *
 * **Tout le jeu jusqu'ici n'a montré que des choses à abattre.** Celui-ci
 * arrive après la fin, dans le seul endroit où l'on ne se bat pas, et sa seule
 * fonction est de **proposer** quelque chose. C'est pour cette raison qu'il est
 * un personnage et non une stèle : un panneau de pierre aurait donné les mêmes
 * règles, mais personne ne se serait demandé qui l'avait écrit.
 *
 * Il change maintenant de forme à mesure qu'on maîtrise ses catégories — voir
 * `config/senseiForms` pour la règle et `state/senseiMastery` pour ce qui la
 * fait survivre aux visites. C'est la seule récompense de l'Outremonde qui ne
 * soit pas un chiffre, et la seule chose du jeu qui **regarde en arrière** :
 * tout le reste mesure où l'on en est, celle-ci dit ce qu'on a su faire.
 *
 * **Trois décisions tiennent le fichier.**
 *
 *  1. *Tout est construit au montage, rien n'apparaît en cours de route.* Les
 *     mèches supplémentaires, la crinière, les langues d'aura, les arcs : tout
 *     existe dès la première frame et est **mis à l'échelle zéro** tant que la
 *     forme courante n'en veut pas. Monter ces morceaux au franchissement d'un
 *     palier les ferait surgir d'un coup au milieu d'une transition par
 *     ailleurs amortie — c'est-à-dire ruiner la seule chose qu'on lui demande.
 *
 *  2. *Les matériaux sont partagés et animés, pas déclarés par maille.* Une
 *     seule matière de cheveux sert aux dix-huit mèches, à la calotte, à la
 *     nuque, aux sourcils et à la crinière ; interpoler sa teinte suffit à
 *     faire virer toute la chevelure. Déclarer un `meshToonMaterial` par maille
 *     aurait demandé d'en retrouver quarante pour changer une couleur.
 *
 *  3. *Il n'a toujours pas de collider.* On lui marche dedans, et c'est mieux
 *     ainsi : un obstacle planté devant le seul interlocuteur du jeu se traduit
 *     par un joueur coincé dans lui en essayant de l'aborder.
 */

const HALF_PI = Math.PI / 2
/** Vitesse d'amortissement des transitions de forme. Une seconde environ. */
const DAMP = 4.5

/** Collecte un ref dans un tableau indexé, pour animer les morceaux en lot. */
function collect<T>(store: { current: T[] }, index: number) {
  return (node: T | null) => {
    if (node) store.current[index] = node
  }
}

export function Sensei() {
  const root = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const head = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const spark = useRef<Mesh>(null)
  const pole = useRef<Group>(null)
  const legs = useRef<Group[]>([])
  const tilts = useRef<Group[]>([])
  const stems = useRef<Group[]>([])
  const bangs = useRef<Group[]>([])
  const mane = useRef<Group>(null)
  const browHair = useRef<Group>(null)
  const browRidge = useRef<Group>(null)
  const tongues = useRef<Mesh[]>([])
  const motes = useRef<Mesh[]>([])
  const bolts = useRef<Mesh[]>([])
  const ring = useRef<Mesh>(null)

  /**
   * La forme visée, dérivée du **nombre** de catégories maîtrisées.
   *
   * L'abonnement porte sur la longueur et non sur le tableau : le store rend un
   * tableau neuf à chaque défi terminé, donc s'abonner à lui ferait re-rendre le
   * modèle entier pour une course qui n'a rien coché.
   */
  const masteredCount = useGameStore((state) => state.senseiMastered.length)
  const form = formForMastery(masteredCount)

  /* --- Matériaux partagés, animés ------------------------------------------ */

  /*
    Les matières, construites **une seule fois**.

    Initialiseur paresseux de `useState` et non `useMemo([])` : les deux
    construisent une fois, mais celui-ci le dit dans sa signature au lieu de le
    déduire d'un tableau vide — et il n'a pas de liste de dépendances qu'un
    relecteur, ou un linter, croirait incomplète.

    Les teintes qui changent d'un palier à l'autre ne passent pas par une
    reconstruction : elles sont interpolées frame après frame dans `useFrame`.
    Refaire les matières à chaque palier ferait sauter la couleur d'un coup,
    c'est-à-dire exactement ce que la transition amortie existe pour éviter.
  */
  const [mats] = useState(
    () => ({
      hair: new MeshToonMaterial({ color: form.hairColor, gradientMap: toonGradient }),
      tip: new MeshToonMaterial({
        color: form.tipColor ?? form.hairColor,
        gradientMap: toonGradient,
      }),
      // Yeux et bouche en matière **non éclairée**, comme les trois visages du
      // héros : passés au toon, ils tombent dans les bandes d'ombre et le
      // regard disparaît dès que la tête n'est pas face à la lumière.
      eye: new MeshBasicMaterial({ color: form.eyeColor }),
      gi: new MeshToonMaterial({ color: GI, gradientMap: toonGradient }),
      blue: new MeshToonMaterial({ color: BLUE, gradientMap: toonGradient }),
      trim: new MeshToonMaterial({ color: BOOT_TRIM, gradientMap: toonGradient }),
      skin: new MeshToonMaterial({ color: SKIN, gradientMap: toonGradient }),
      pole: new MeshToonMaterial({ color: POLE, gradientMap: toonGradient }),
      poleCap: new MeshToonMaterial({ color: POLE_CAP, gradientMap: toonGradient }),
      kanji: new MeshToonMaterial({ color: KANJI, gradientMap: toonGradient }),
      sclera: new MeshBasicMaterial({ color: '#f2efe8' }),
      mote: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
      bolt: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
      ring: new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }),
      // Une matière par langue : leur opacité dépend de leur avancement propre,
      // donc elles ne peuvent pas la partager.
      tongues: Array.from(
        { length: MAX_TONGUES },
        () => new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
      ),
    }),
  )

  // Les matières ne sont pas gérées par React : sans ça, quitter l'Outremonde
  // et y revenir en laisse une trentaine derrière lui à chaque aller-retour.
  useEffect(
    () => () => {
      mats.tongues.forEach((material) => material.dispose())
      Object.values(mats).forEach((entry) => {
        if (!Array.isArray(entry)) entry.dispose()
      })
    },
    [mats],
  )

  /** Teintes visées, réallouées seulement au changement de forme. */
  const targets = useMemo(
    () => ({
      hair: new Color(form.hairColor),
      tip: new Color(form.tipColor ?? form.hairColor),
      eye: new Color(form.eyeColor),
      aura: new Color(form.aura?.color ?? form.hairColor),
    }),
    [form],
  )

  /** L'état animé, qui rattrape la forme visée frame après frame. */
  const anim = useRef({
    rise: form.hair.rise,
    elDown: form.hair.elDown,
    lenK: form.hair.lenK,
    extra: form.hair.extra,
    mane: form.hair.mane ? 1 : 0,
    brow: form.brow === 'none' ? 1 : 0,
    stance: form.pose.stance,
    lean: form.pose.lean,
    armZ: form.pose.armZ,
    armX: form.pose.armX,
    headTilt: form.pose.headTilt,
    auraOp: form.aura?.opacity ?? 0,
    auraH: form.aura?.height ?? 2,
    auraR: form.aura?.radius ?? 0.5,
    tongues: form.aura?.tongues ?? 0,
    motes: form.aura?.motes ?? 0,
    bolts: form.aura?.bolts ?? 0,
    ring: form.aura?.ring ? 1 : 0,
    pole: form.pole === 'planted' ? 1 : 0,
  })

  /*
    L'invite est retirée au démontage, et cette ligne n'est pas une précaution.

    Le joueur franchit le portail du retour depuis le Sanctuaire, c'est-à-dire
    d'un endroit d'où il peut être à portée du maître. Sans ce nettoyage,
    `nearbySensei` resterait à `true` sur le Marais, sur l'île et sur le
    continent : la touche d'interaction y proposerait « parler au maître »
    devant un arbre mort.
  */
  useEffect(() => () => useGameStore.getState().setNearbySensei(false), [])

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    // Horloge de jeu : il se fige avec le monde quand sa proposition s'ouvre.
    const t = gameNow() / 1000
    const a = anim.current

    /* --- Proximité, inchangée -------------------------------------------- */

    const distance = Math.hypot(
      playerTransform.position.x - SENSEI.x,
      playerTransform.position.z - SENSEI.z,
    )
    const near = distance < SENSEI.radius
    // Écriture sur **transition** seulement, comme les coffres et les
    // monuments : sans ce test le store serait écrit soixante fois par seconde
    // tant que le joueur reste à portée.
    const store = useGameStore.getState()
    if (near !== store.nearbySensei) store.setNearbySensei(near)

    /* --- Rattrapage de la forme visée ------------------------------------ */

    const to = (from: number, goal: number) => MathUtils.damp(from, goal, DAMP, delta)
    a.rise = to(a.rise, form.hair.rise)
    a.elDown = to(a.elDown, form.hair.elDown)
    a.lenK = to(a.lenK, form.hair.lenK)
    a.extra = to(a.extra, form.hair.extra)
    a.mane = to(a.mane, form.hair.mane ? 1 : 0)
    a.brow = to(a.brow, form.brow === 'none' ? 1 : 0)
    a.stance = to(a.stance, form.pose.stance)
    a.lean = to(a.lean, form.pose.lean)
    a.armZ = to(a.armZ, form.pose.armZ)
    a.armX = to(a.armX, form.pose.armX)
    a.headTilt = to(a.headTilt, form.pose.headTilt)
    a.auraOp = to(a.auraOp, form.aura?.opacity ?? 0)
    a.auraH = to(a.auraH, form.aura?.height ?? 2)
    a.auraR = to(a.auraR, form.aura?.radius ?? 0.5)
    a.tongues = to(a.tongues, form.aura?.tongues ?? 0)
    a.motes = to(a.motes, form.aura?.motes ?? 0)
    a.bolts = to(a.bolts, form.aura?.bolts ?? 0)
    a.ring = to(a.ring, form.aura?.ring ? 1 : 0)
    a.pole = to(a.pole, form.pole === 'planted' ? 1 : 0)

    const k = 1 - Math.exp(-DAMP * delta)
    mats.hair.color.lerp(targets.hair, k)
    mats.tip.color.lerp(targets.tip, k)
    mats.eye.color.lerp(targets.eye, k)
    mats.mote.color.lerp(targets.aura, k)
    mats.ring.color.lerp(targets.aura, k)
    const boltTarget = form.aura?.boltColor
    if (boltTarget) mats.bolt.color.lerp(new Color(boltTarget), k)

    /* --- Pose -------------------------------------------------------------- */

    legs.current.forEach((leg, index) => {
      const side = index === 0 ? 1 : -1
      leg.position.x = side * a.stance
      leg.rotation.z = -side * a.stance * 0.35
    })

    if (torso.current) {
      // Respiration : deux centimètres et demi, en huit secondes de cycle. Il
      // est **immobile**, il n'attend rien d'autre que qu'on vienne.
      torso.current.position.y = HIP_Y + Math.sin(t * 0.8) * 0.025
      torso.current.rotation.x = a.lean
    }
    if (head.current) head.current.rotation.x = a.headTilt

    /*
      Le salut : le bras droit monte quand le joueur entre à portée.

      C'est la **confirmation dans la scène** que l'interaction est disponible,
      là où le joueur regarde — l'invite du HUD est en bas de l'écran, loin des
      yeux au moment où l'on s'approche. Il repart de la pose de la forme
      courante et non de zéro, sinon la transformation se défait à l'approche.
    */
    if (armR.current) {
      const goal = near ? -2.1 + Math.sin(t * 5) * 0.25 : a.armX
      armR.current.rotation.x = MathUtils.damp(armR.current.rotation.x, goal, 7, delta)
      armR.current.rotation.z = a.armZ
    }
    if (armL.current) {
      armL.current.rotation.x = a.armX + Math.sin(t * 0.8 + 1) * 0.04
      armL.current.rotation.z = -a.armZ
    }

    /* --- Chevelure ---------------------------------------------------------- */

    const all = [...CROWN, ...EXTRA_BLADES]
    all.forEach((blade, index) => {
      const tilt = tilts.current[index]
      const stem = stems.current[index]
      if (!tilt || !stem) return
      const floor = Math.max(blade[1] * a.elDown, MIN_ELEVATION)
      // La réponse au redressement est **propre à la mèche** : appliquée
      // uniformément, toute la chevelure converge à la verticale et la
      // silhouette devient une colonne au lieu de s'évaser.
      const elevation = floor + (HALF_PI - floor) * a.rise * blade[4]
      tilt.rotation.x = HALF_PI - elevation
      // Les mèches supplémentaires n'existent qu'au-delà de leur rang : leur
      // échelle monte de zéro plutôt que de les monter dans la scène.
      const extraIndex = index - CROWN.length
      const visible = extraIndex < 0 ? 1 : MathUtils.clamp(a.extra - extraIndex, 0, 1)
      stem.scale.set(visible, a.lenK * visible, visible)
    })

    /*
      Les mèches de front se relèvent avec la transformation, elles ne
      disparaissent pas d'un coup : en Super Saiyan il n'en reste qu'une, en
      troisième forme plus rien ne retombe. La crinière les chasse toutes.
    */
    const keep = a.mane > 0.5 ? 0 : a.rise > 0.55 ? 1 : a.rise > 0.3 ? 2 : BANGS.length
    const droop = Math.max(0, 1 - a.rise * 0.9)
    bangs.current.forEach((bang, index) => {
      if (!bang) return
      const shown = index < keep ? 1 : 0
      const scale = MathUtils.damp(bang.scale.x, shown, DAMP, delta)
      bang.scale.set(scale, scale * (0.55 + 0.45 * droop), scale)
      bang.position.y = BANGS[index][1] + (1 - droop) * 0.06
      bang.rotation.x = Math.PI - (Math.PI - BANGS[index][5]) * droop
    })

    if (mane.current) mane.current.scale.setScalar(a.mane)
    if (browHair.current) browHair.current.scale.setScalar(1 - a.brow)
    if (browRidge.current) browRidge.current.scale.setScalar(a.brow)

    /* --- Bâton -------------------------------------------------------------- */

    if (pole.current) {
      // En main au repos, planté à côté dès la première transformation : il n'en
      // a plus l'usage, et c'est tout ce que la scène a à dire pour le faire
      // comprendre.
      // Planté **devant** la ligne d'épaules et non derrière : posé en retrait,
      // il passait derrière la bordure de pierre du dallage et n'en dépassait
      // qu'un moignon rouge, qui se lisait comme un objet oublié là.
      pole.current.position.x = MathUtils.lerp(-0.4, -0.66, a.pole)
      pole.current.position.z = MathUtils.lerp(0.12, 0.2, a.pole)
      pole.current.rotation.z = MathUtils.lerp(0.04, 0.12, a.pole)
    }

    /* --- Aura --------------------------------------------------------------- */

    tongues.current.forEach((tongue, index) => {
      const material = mats.tongues[index]
      if (!tongue || !material) return
      const live = MathUtils.clamp(a.tongues - index, 0, 1)
      if (live <= 0.01) {
        tongue.visible = false
        return
      }
      tongue.visible = true
      material.color.copy(targets.aura)
      // Arc **arrière** seulement : une langue additive devant le buste efface
      // l'orange du gi, et c'est ce qui faisait paraître la tenue jaune.
      const angle = Math.PI * 0.28 + (index / MAX_TONGUES) * Math.PI * 1.44 + index * 0.37
      const up = (t * (0.55 + (index % 5) * 0.08) + index * 0.19) % 1
      /*
        Le rayon **s'ouvre** en montant au lieu de se refermer.

        Il se resserrait, donc les langues convergeaient vers la tête au moment
        où elles sont les plus hautes — et comme l'aura est de la teinte des
        cheveux, elles s'y confondaient : à l'image, la chevelure paraissait
        deux fois plus fournie qu'elle ne l'est, et la forme Blue semblait
        dressée alors qu'elle porte la coupe de base. Une flamme s'évase, elle
        ne se referme pas.
      */
      const radius = a.auraR * (0.45 + up * 0.4)
      tongue.position.set(
        Math.cos(angle + t * 0.25) * radius,
        0.35 + up * (a.auraH - 0.35),
        Math.sin(angle + t * 0.25) * radius,
      )
      tongue.rotation.set(-0.12, -(angle + t * 0.25), 0)
      const shrink = 1 - up * 0.55
      tongue.scale.set(shrink, shrink * (1 + up * 0.5), shrink * 0.5)
      material.opacity =
        a.auraOp * 0.55 * live * Math.max(0, 1 - up * 1.05) * (up < 0.08 ? up / 0.08 : 1)
    })

    motes.current.forEach((mote, index) => {
      if (!mote) return
      const live = MathUtils.clamp(a.motes - index, 0, 1)
      mote.visible = live > 0.01
      if (!mote.visible) return
      const yaw = index * 1.7
      const up = (t * (0.28 + (index % 4) * 0.08) + index * 0.13) % 1
      // Même correction que les langues : les motes s'écartent en montant.
      const radius = (0.3 + (index % 3) * 0.12 * a.auraR) * (1 + up * 0.35)
      mote.position.set(
        Math.cos(yaw + t * 0.5) * radius,
        up * a.auraH * 1.05,
        Math.sin(yaw + t * 0.5) * radius,
      )
      mote.scale.setScalar(Math.max(0.15, 1 - up * 0.7) * live)
    })

    bolts.current.forEach((bolt, index) => {
      if (!bolt) return
      const live = MathUtils.clamp(a.bolts - index, 0, 1)
      if (live <= 0.01) {
        bolt.visible = false
        return
      }
      // Un arc vit un neuvième de seconde puis se replante ailleurs. Le pseudo-
      // aléa est déterministe : deux arcs ne doivent pas se superposer, mais
      // aucun état n'a besoin de survivre à la frame.
      const seed = Math.floor(t * 9 + index * 3.7)
      const a1 = Math.abs(Math.sin(seed * 12.9898) * 43758.5453)
      const a2 = Math.abs(Math.sin(seed * 78.233) * 12345.678)
      const angle = (a1 - Math.floor(a1)) * Math.PI * 2
      const height = a2 - Math.floor(a2)
      bolt.visible = height > 0.15
      const radius = a.auraR * 0.62
      bolt.position.set(
        Math.cos(angle) * radius,
        0.3 + height * a.auraH * 0.75,
        Math.sin(angle) * radius,
      )
      bolt.rotation.set(angle * 2, angle, 0.9 + height)
      bolt.scale.setScalar(live)
    })

    if (ring.current) {
      ring.current.visible = a.ring > 0.01
      ring.current.rotation.z = t * 0.6
      const pulse = (1 + Math.sin(t * 1.6) * 0.06) * a.ring
      ring.current.scale.set(pulse, pulse, a.ring)
    }

    /* --- L'étincelle d'interaction ------------------------------------------ */

    if (spark.current) {
      spark.current.position.y = 1.98 + Math.sin(t * 1.9) * 0.08
      spark.current.rotation.y = t * 1.2
      spark.current.scale.setScalar(near ? 1.3 : 1)
      ;(spark.current.material as MeshBasicMaterial).opacity = near ? 1 : 0.7
    }
  })

  /* --- Le modèle ----------------------------------------------------------- */

  const blades = [...CROWN, ...EXTRA_BLADES]

  return (
    <group ref={root} position={[SENSEI.x, SENSEI.y, SENSEI.z]} rotation-y={SENSEI.yaw}>
      {/* --- Jambes : pantalon orange froncé à la cheville, botte à liseré --- */}
      {[0, 1].map((index) => (
        <group key={index} ref={collect(legs, index)} position={[0, HIP_Y, 0]}>
          <mesh castShadow position={[0, -0.135, 0]} material={mats.gi}>
            <capsuleGeometry args={[0.098, 0.2, 4, 10]} />
            <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
          </mesh>
          {/* Le fronçage : c'est lui, et non la coupe de la jambe, qui fait
              lire un pantalon de kimono plutôt qu'un collant. */}
          <mesh castShadow position={[0, -0.253, 0]} material={mats.gi}>
            <cylinderGeometry args={[0.116, 0.104, 0.075, 10]} />
            <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
          </mesh>
          <mesh position={[0, -0.305, 0]} material={mats.trim}>
            <cylinderGeometry args={[0.113, 0.11, 0.046, 10]} />
          </mesh>
          <mesh position={[0, -0.357, 0]} material={mats.blue}>
            <cylinderGeometry args={[0.108, 0.101, 0.07, 10]} />
          </mesh>
          <mesh castShadow position={[0, -0.418, 0.018]} material={mats.blue}>
            <boxGeometry args={[0.182, 0.105, 0.24]} />
            <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
          </mesh>
          {/* Bout relevé : sans lui la botte est un parallélépipède posé au sol. */}
          <mesh castShadow position={[0, -0.404, 0.155]} rotation={[-0.22, 0, 0]} material={mats.blue}>
            <boxGeometry args={[0.172, 0.082, 0.085]} />
            <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
          </mesh>
          <mesh position={[0, -0.468, 0.03]} material={mats.trim}>
            <boxGeometry args={[0.192, 0.032, 0.3]} />
          </mesh>
        </group>
      ))}

      <group ref={torso} position={[0, HIP_Y, 0]}>
        <mesh castShadow position={[0, 0.25, 0]} material={mats.gi}>
          <cylinderGeometry args={[0.255, 0.21, 0.54, 12]} />
          <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
        </mesh>
        <mesh position={[0, 0.52, 0]} material={mats.blue}>
          <cylinderGeometry args={[0.185, 0.205, 0.1, 12]} />
        </mesh>

        {/* Le col : un V de sous-pull, et deux revers qui se croisent par-dessus.
            Les revers **convergent vers la ceinture** — écartés vers le bas, ils
            font un nœud papillon au lieu d'une veste croisée. */}
        <mesh position={[0, 0.425, 0.182]} rotation={[0.05, Math.PI, Math.PI]} scale={[1.35, 1, 0.4]} material={mats.blue}>
          <coneGeometry args={[0.105, 0.2, 3]} />
        </mesh>
        {[
          [-0.5, 0.088],
          [0.5, -0.088],
        ].map(([roll, x]) => (
          <mesh key={x} castShadow position={[x, 0.31, 0.19]} rotation={[0.05, 0, roll]} material={mats.gi}>
            <boxGeometry args={[0.1, 0.31, 0.045]} />
            <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
          </mesh>
        ))}
        {[0.205, -0.205].map((x) => (
          <mesh key={x} castShadow position={[x, 0.425, 0]} scale={[0.95, 0.72, 1]} material={mats.gi}>
            <sphereGeometry args={[0.088, 10, 10]} />
            <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
          </mesh>
        ))}

        {/* La pastille de kanji du dos. Le jeu n'utilise aucune texture, donc
            elle dit « il y a un symbole ici » sans pouvoir le dessiner. */}
        <mesh position={[0, 0.28, -0.225]} material={mats.kanji}>
          <boxGeometry args={[0.15, 0.17, 0.02]} />
        </mesh>

        {/* L'obi, enroulé trois fois. Les tours n'ont pas le même rayon : c'est
            ce décrochement qui fait lire du tissu plutôt qu'un anneau. */}
        {[
          [0.052, 0.226, 0.231, 0.055],
          [-0.002, 0.233, 0.229, 0.058],
          [-0.056, 0.227, 0.218, 0.052],
        ].map(([y, top, bottom, height]) => (
          <mesh key={y} castShadow position={[0, y, 0]} material={mats.blue}>
            <cylinderGeometry args={[top, bottom, height, 12]} />
            <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
          </mesh>
        ))}
        <mesh castShadow position={[-0.15, -0.09, 0.15]} rotation={[0.1, 0, 0.22]} material={mats.blue}>
          <boxGeometry args={[0.075, 0.17, 0.05]} />
          <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
        </mesh>

        {/* --- Bras : manche orange au coude, avant-bras de sous-pull, poignet --- */}
        {(
          [
            [-0.285, armR],
            [0.285, armL],
          ] as const
        ).map(([x, ref]) => (
          <group key={x} ref={ref} position={[x, SHOULDER_Y - HIP_Y, 0]}>
            <mesh castShadow position={[0, -0.11, 0]} material={mats.gi}>
              <capsuleGeometry args={[0.082, 0.11, 4, 10]} />
              <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
            </mesh>
            <mesh castShadow position={[0, -0.182, 0]} material={mats.gi}>
              <cylinderGeometry args={[0.089, 0.084, 0.035, 10]} />
              <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
            </mesh>
            <mesh castShadow position={[0, -0.245, 0]} material={mats.blue}>
              <capsuleGeometry args={[0.068, 0.08, 4, 10]} />
              <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
            </mesh>
            {/* Le poignet bandé est plus large que l'avant-bras : les deux sont
                du même bleu, donc sans l'écart de diamètre il disparaît. */}
            <mesh castShadow position={[0, -0.322, 0]} material={mats.blue}>
              <cylinderGeometry args={[0.092, 0.09, 0.062, 10]} />
              <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
            </mesh>
            <mesh castShadow position={[0, -0.398, 0]} material={mats.skin}>
              <sphereGeometry args={[0.082, 10, 10]} />
              <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
            </mesh>
          </group>
        ))}

        {/* --- Tête --- */}
        <group ref={head} position={[0, HEAD_Y - HIP_Y, 0]}>
          <mesh castShadow material={mats.skin}>
            <sphereGeometry args={[0.27, 18, 16]} />
            <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
          </mesh>
          {[0.255, -0.255].map((x) => (
            <mesh key={x} castShadow position={[x, 0, 0]} scale={[0.6, 1, 0.8]} material={mats.skin}>
              <sphereGeometry args={[0.062, 8, 8]} />
            </mesh>
          ))}

          {/* Yeux : blanc puis iris. Un ovale sombre seul se lit comme un trou. */}
          {[0.092, -0.092].map((x) => (
            <group key={x}>
              <mesh position={[x, 0.02, 0.252]} scale={[0.58, 1, 0.26]} material={mats.sclera}>
                <sphereGeometry args={[0.044, 12, 12]} />
              </mesh>
              <mesh position={[x * 0.96, 0.012, 0.272]} scale={[0.8, 1, 0.22]} material={mats.eye}>
                <sphereGeometry args={[0.026, 10, 10]} />
              </mesh>
            </group>
          ))}

          {/* La bouche, en arc relevé aux coins. C'est le trait qui distingue
              les visages du projet avant la couleur des cheveux — voir
              `ClanFace` dans `HeroPlaceholder`. */}
          {(
            [
              [0, -0.105, 0],
              [0.058, -0.097, 0.34],
              [-0.058, -0.097, -0.34],
            ] as const
          ).map(([x, y, roll]) => (
            <mesh key={x} position={[x, y, 0.243]} rotation={[0, 0, roll]} material={mats.eye}>
              <boxGeometry args={[0.062, 0.019, 0.012]} />
            </mesh>
          ))}

          {/* Sourcils, ou l'arcade nue qui les remplace à la troisième forme.
              Les deux sont montés en permanence et se relaient à l'échelle. */}
          <group ref={browHair}>
            {(
              [
                [0.102, 0.24],
                [-0.102, -0.24],
              ] as const
            ).map(([x, roll]) => (
              <mesh key={x} castShadow position={[x, 0.1, 0.235]} rotation={[0, 0, roll]} material={mats.hair}>
                <boxGeometry args={[0.12, 0.034, 0.05]} />
                <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
              </mesh>
            ))}
          </group>
          <group ref={browRidge} scale={0}>
            <mesh castShadow position={[0, 0.105, 0.225]} material={mats.skin}>
              <boxGeometry args={[0.27, 0.05, 0.06]} />
              <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
            </mesh>
          </group>

          {/* Calotte, puis masse de nuque. Sans la seconde on voit de la peau
              nue de trois-quarts arrière et la coupe se lit comme une perruque. */}
          <mesh castShadow position={[0, 0.048, -0.012]} scale={[1.01, 0.72, 1.04]} material={mats.hair}>
            <sphereGeometry args={[0.266, 16, 14]} />
            <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
          </mesh>
          <mesh castShadow position={[0, -0.02, -0.05]} scale={[1, 0.54, 1.04]} material={mats.hair}>
            <sphereGeometry args={[0.252, 14, 12]} />
            <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
          </mesh>

          {/* Les mèches. Deux groupes emboîtés plutôt qu'un Euler : azimut
              autour de Y, puis bascule autour de X de ce qui reste à
              l'élévation. La mèche n'a plus qu'à s'éloigner le long de son +Y. */}
          {blades.map((blade, index) => (
            <group key={index} rotation={[0, blade[0], 0]}>
              <group ref={collect(tilts, index)}>
                <group ref={collect(stems, index)} position={[0, 0.09, 0]}>
                  {/* Quatre segments et un aplatissement en profondeur : une
                      pyramide fait un piquant, une lame aplatie fait une mèche. */}
                  <mesh castShadow position={[0, blade[2] / 2, 0]} scale={[1.12, 1, 0.62]} material={mats.hair}>
                    <coneGeometry args={[0.128 * blade[3], blade[2], 4]} />
                    <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
                  </mesh>
                  <mesh castShadow position={[0, blade[2] * 0.82, 0]} scale={[1.12, 1, 0.62]} material={mats.tip}>
                    <coneGeometry args={[0.089 * blade[3], blade[2] * 0.36, 4]} />
                    <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
                  </mesh>
                </group>
              </group>
            </group>
          ))}

          {/* Les mèches de front, en M. */}
          {BANGS.map((bang, index) => (
            <group
              key={index}
              ref={collect(bangs, index)}
              position={[bang[0], bang[1], bang[2]]}
              rotation={[bang[5], 0, bang[6]]}
            >
              <mesh castShadow scale={[1.25, 1, 0.6]} material={mats.hair}>
                <coneGeometry args={[0.075 * bang[4], bang[3], 4]} />
                <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
              </mesh>
            </group>
          ))}

          {/* La crinière de la troisième forme. */}
          <group ref={mane} scale={0}>
            <mesh castShadow position={[0, -0.04, -0.24]} scale={[1.15, 1.02, 1.25]} material={mats.hair}>
              <sphereGeometry args={[0.26, 14, 12]} />
              <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
            </mesh>
            {/* Traîne étroite et franchement en arrière : large, elle sortait en
                ailerons de chaque côté de la tête. */}
            <mesh castShadow position={[0, -0.7, -0.36]} rotation={[0.06, 0, Math.PI]} scale={[1, 1, 0.75]} material={mats.hair}>
              <coneGeometry args={[0.21, 1.2, 7]} />
              <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
            </mesh>
            {MANE_SPIKES.map((spike, index) => (
              <mesh
                key={index}
                castShadow
                position={[spike[0], spike[1], spike[2]]}
                rotation={[spike[4], 0, spike[0] * 1.1]}
                material={mats.hair}
              >
                <coneGeometry args={[0.1, spike[3], 5]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>

      {/* --- Le bâton magique --- */}
      <group ref={pole} position={[-0.4, 0.02, 0.12]}>
        <mesh castShadow position={[0, 0.81, 0]} material={mats.pole}>
          <cylinderGeometry args={[0.028, 0.028, 1.62, 8]} />
          <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
        </mesh>
        {[0.04, 1.58].map((y) => (
          <mesh key={y} position={[0, y, 0]} material={mats.poleCap}>
            <cylinderGeometry args={[0.036, 0.036, 0.07, 8]} />
          </mesh>
        ))}
      </group>

      {/* --- L'aura : des langues, pas un cône --- */}
      {Array.from({ length: MAX_TONGUES }, (_, index) => (
        <mesh key={index} ref={collect(tongues, index)} visible={false} material={mats.tongues[index]}>
          <coneGeometry args={[0.046, 0.28, 4]} />
        </mesh>
      ))}
      {Array.from({ length: MAX_MOTES }, (_, index) => (
        <mesh key={index} ref={collect(motes, index)} visible={false} material={mats.mote}>
          <octahedronGeometry args={[0.036, 0]} />
        </mesh>
      ))}
      {Array.from({ length: MAX_BOLTS }, (_, index) => (
        <mesh key={index} ref={collect(bolts, index)} visible={false} material={mats.bolt}>
          <cylinderGeometry args={[0.011, 0.011, 0.19, 4]} />
        </mesh>
      ))}
      <mesh ref={ring} visible={false} rotation={[HALF_PI, 0, 0]} position={[0, 0.04, 0]} material={mats.ring}>
        <torusGeometry args={[0.84, 0.035, 8, 44]} />
      </mesh>

      {/*
        L'étincelle au-dessus de sa tête.

        Même rôle que la braise bleue des monuments : elle dit « il se passe
        quelque chose ici » de loin. Sa teinte **ne suit pas la forme**, et c'est
        délibéré : elle signifie « on peut lui parler », et une couleur qui
        change de palier en palier affaiblirait ce signal au lieu de l'appuyer.
      */}
      <mesh ref={spark} position={[0, 1.98, 0]}>
        <octahedronGeometry args={[0.13, 0]} />
        <meshBasicMaterial color="#9ceeff" transparent opacity={0.7} />
      </mesh>
    </group>
  )
}
