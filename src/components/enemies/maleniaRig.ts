import { useRef, type RefObject } from 'react'
import { MathUtils, type Group } from 'three'

/**
 * Le squelette posable de Malenia : ses articulations, et sa garde.
 *
 * À part du modèle, et pour une raison concrète : c'est la **machine à états**
 * qui pose ces articulations, pas le composant qui les dessine. Les laisser dans
 * `MaleniaModel.tsx` obligeait `Malenia.tsx` à importer un module de rendu pour
 * y prendre trois types et une table de rotations — et faisait de ce fichier-là
 * un module qui exporte autre chose que des composants, ce qui casse le
 * rafraîchissement à chaud de Vite.
 *
 * Le modèle **reçoit** son rig plutôt que de le créer, contrairement au Lynel qui
 * fabrique ses refs en interne. C'est la conséquence directe de ce que ce
 * personnage a de particulier : ses poses ne sont pas des états d'animation
 * cycliques mais les étapes d'une séquence d'attaque, et la séquence vit dans la
 * machine à états.
 */

export interface MaleniaRig {
  root: RefObject<Group | null>
  body: RefObject<Group | null>
  torso: RefObject<Group | null>
  head: RefObject<Group | null>
  hair: RefObject<Group | null>
  sash: RefObject<Group | null>
  shoulderR: RefObject<Group | null>
  elbowR: RefObject<Group | null>
  wristR: RefObject<Group | null>
  shoulderL: RefObject<Group | null>
  elbowL: RefObject<Group | null>
  hipR: RefObject<Group | null>
  kneeR: RefObject<Group | null>
  hipL: RefObject<Group | null>
  kneeL: RefObject<Group | null>
  wingL: RefObject<Group | null>
  wingR: RefObject<Group | null>
}

/**
 * Les rotations de **construction** — sa garde.
 *
 * Elles sont posées ici et non dans une pose, et la nuance compte : c'est la
 * différence entre « la pose repos est l'ensemble vide » et « la pose repos
 * redonne les quinze rotations ». En les rebasant à la construction, chaque pose
 * n'exprime plus que ce qu'elle change — et la prochaine correction de la garde
 * ne rendra pas les autres poses fausses.
 */
export const BASE_POSE = {
  torso: [0, 0.14, 0],
  shoulderR: [-0.2, 0, 0.17],
  elbowR: [-0.28, 0, 0],
  shoulderL: [-0.12, 0, -0.2],
  elbowL: [-0.5, 0, 0],
  hipL: [0.06, 0, 0.07],
  kneeL: [0.02, 0, 0],
  hipR: [-0.08, 0, -0.06],
  kneeR: [0.14, 0, 0],
  head: [0.04, -0.08, 0],
  wristR: [0, 0, 0],
  hair: [0, 0, 0],
  sash: [0, 0, 0],
  wingL: [0, 0, 0],
  wingR: [0, 0, 0],
  root: [0, 0, 0],
  body: [0, 0, 0],
} as const satisfies Record<keyof MaleniaRig, readonly [number, number, number]>

export function useMaleniaRig(): MaleniaRig {
  return {
    root: useRef<Group>(null),
    body: useRef<Group>(null),
    torso: useRef<Group>(null),
    head: useRef<Group>(null),
    hair: useRef<Group>(null),
    sash: useRef<Group>(null),
    shoulderR: useRef<Group>(null),
    elbowR: useRef<Group>(null),
    wristR: useRef<Group>(null),
    shoulderL: useRef<Group>(null),
    elbowL: useRef<Group>(null),
    hipR: useRef<Group>(null),
    kneeR: useRef<Group>(null),
    hipL: useRef<Group>(null),
    kneeL: useRef<Group>(null),
    wingL: useRef<Group>(null),
    wingR: useRef<Group>(null),
  }
}

/** Utilisé par le rig pour remettre chaque articulation à sa rotation de base. */
export function applyBasePose(rig: MaleniaRig) {
  for (const [name, angles] of Object.entries(BASE_POSE)) {
    const joint = rig[name as keyof MaleniaRig].current
    if (joint) joint.rotation.set(angles[0], angles[1], angles[2])
  }
}

/* --- Les poses -------------------------------------------------------------- */

/**
 * Ce que le modèle **montre**, par opposition à ce que la machine à états fait.
 *
 * Elles ont manqué à la première version, et le défaut s'est vu à la première
 * partie jouée : la machine résolvait ses dix attaques, les dégâts tombaient,
 * et le modèle ne bougeait pas un bras. Elle glissait vers le joueur et lui
 * retirait des cœurs sans qu'aucun geste ne l'annonce — c'est-à-dire que tout le
 * travail de télégraphe, qui est la moitié du combat, était invisible.
 *
 * Une pose n'exprime que des **écarts** à `BASE_POSE` : la garde est
 * littéralement l'ensemble vide. Sans ça, chaque pose devrait redonner les
 * quinze rotations, y compris celles qu'elle ne change pas — et la première
 * correction de la garde les rendrait toutes fausses.
 */
export type PoseId = 'garde' | 'armee' | 'frappe' | 'vol' | 'envol' | 'brisee'

export interface Pose {
  /** Écarts angulaires, par articulation. Absente = inchangée. */
  rig: Partial<Record<keyof MaleniaRig, readonly [number, number, number]>>
  /** Élévation supplémentaire du corps, en unités du modèle. */
  lift?: number
}

export const POSES: Record<PoseId, Pose> = {
  /** La garde : l'ensemble vide, par construction. */
  garde: { rig: {} },

  /**
   * L'armé — le télégraphe.
   *
   * Le buste s'enroule, la lame part en arrière et en haut. C'est **la** pose
   * qui porte le combat : c'est elle que le joueur doit apprendre à voir, et
   * c'est sur elle que se décide chaque parade. Elle est donc volontairement
   * ample — plus qu'un escrimeur réel ne le ferait — parce qu'à quatorze unités
   * de recul, un geste juste est un geste invisible.
   */
  armee: {
    rig: {
      torso: [-0.1, 0.5, 0],
      shoulderR: [-1.7, 0, 0.5],
      elbowR: [-0.8, 0, 0],
      wristR: [-0.4, 0, 0],
      shoulderL: [-0.3, 0, 0.35],
      head: [0, -0.12, 0],
      sash: [0.25, 0, 0],
    },
  },

  /**
   * La frappe — le geste traversé.
   *
   * Le buste se déroule de l'autre côté, la lame passe. Elle vient toujours
   * après `armee`, jamais seule : une frappe sans armé est un coup qui sort de
   * nulle part, donc un coup qu'on ne peut pas parer.
   */
  frappe: {
    rig: {
      torso: [0.12, -0.55, 0],
      shoulderR: [-1.5, 0, -0.5],
      elbowR: [0.5, 0, 0],
      wristR: [0.6, 0, 0],
      shoulderL: [0.2, 0, -0.3],
      hipR: [-0.25, 0, 0],
      kneeR: [0.25, 0, 0],
      sash: [-0.4, 0, 0],
    },
  },

  /** Le vol de la phase II : les jambes pendent, le buste se redresse. */
  vol: {
    rig: {
      torso: [-0.1, 0, 0],
      hipL: [0.35, 0, 0.1],
      kneeL: [0.5, 0, 0],
      hipR: [0.3, 0, -0.1],
      kneeR: [0.45, 0, 0],
      sash: [-0.2, 0, 0],
    },
  },

  /**
   * L'envol — la suspension du vol de sarcelle, et la montée d'Aeonia.
   *
   * Jambes repliées, lame haute, et **elle monte de deux unités**. C'est le seul
   * télégraphe du combat qui se lise à toute la longueur de l'arène, et il le
   * faut : le vol de sarcelle se fuit, donc il doit s'annoncer à quelqu'un qui
   * regarde ailleurs.
   */
  envol: {
    lift: 2,
    rig: {
      root: [-0.14, 0, 0],
      torso: [-0.12, 0.34, 0],
      shoulderR: [-2.4, 0, -0.5],
      elbowR: [-0.35, 0, 0],
      shoulderL: [-0.9, 0, 0.8],
      elbowL: [-1.1, 0, 0],
      hipL: [-0.95, 0, 0.15],
      kneeL: [1.35, 0, 0],
      hipR: [-0.7, 0, -0.1],
      kneeR: [1.15, 0, 0],
      head: [-0.25, 0, 0],
      sash: [-1.0, 0, 0],
      hair: [-0.8, 0, 0],
    },
  },

  /** La garde brisée, après une parade réussie : l'ouverture, rendue visible. */
  brisee: {
    rig: {
      torso: [0.35, -0.3, 0],
      shoulderR: [0.6, 0, -0.6],
      elbowR: [0.5, 0, 0],
      shoulderL: [0.3, 0, -0.4],
      head: [0.3, 0.2, 0],
      hipR: [0.2, 0, 0],
    },
  },
}

/**
 * Rapproche le rig d'une pose, d'une frame.
 *
 * Amortissement **exponentiel** et non un facteur constant par frame : celui-ci
 * serait deux fois plus rapide à 120 Hz qu'à 60, et les poses d'attaque
 * arriveraient donc plus tôt sur une machine rapide — c'est-à-dire que le
 * télégraphe durerait moins longtemps pour qui a le meilleur matériel.
 *
 * Toutes les articulations sont parcourues à chaque frame, y compris celles que
 * la pose ne change pas : c'est ce qui les ramène à la garde quand elle se
 * termine. Ne parcourir que les clés présentes aurait figé les autres dans la
 * pose précédente.
 */
export function dampToPose(
  rig: MaleniaRig,
  pose: Pose,
  lambda: number,
  delta: number,
  stride = 0,
) {
  for (const name of Object.keys(BASE_POSE) as (keyof MaleniaRig)[]) {
    const joint = rig[name].current
    if (!joint) continue
    const base = BASE_POSE[name]
    const offset = pose.rig[name] ?? ZERO

    /*
      Le pas, sur les deux hanches, **écrit** et non amorti.

      L'amortissement lit la valeur courante pour aller vers sa cible : une
      oscillation ajoutée par-dessus se retrouverait dans cette lecture à la
      frame suivante, la jambe dériverait, et l'amplitude ne vaudrait plus ce
      qu'on a écrit. En posant `base + pose + balancier`, elle vaut exactement
      ça, à toutes les fréquences d'affichage.

      C'est dans cette fonction et pas dans le composant, parce que c'est le seul
      endroit du modèle qui ait le droit d'écrire dans le rig — celui-ci lui est
      passé en prop, et un composant qui mute ses props est un composant dont on
      ne peut plus prévoir le rendu.
    */
    const swing = name === 'hipL' ? stride : name === 'hipR' ? -stride : 0
    if (swing !== 0) {
      joint.rotation.x = base[0] + offset[0] + swing
      joint.rotation.y = MathUtils.damp(joint.rotation.y, base[1] + offset[1], lambda, delta)
      joint.rotation.z = MathUtils.damp(joint.rotation.z, base[2] + offset[2], lambda, delta)
      continue
    }

    joint.rotation.x = MathUtils.damp(joint.rotation.x, base[0] + offset[0], lambda, delta)
    joint.rotation.y = MathUtils.damp(joint.rotation.y, base[1] + offset[1], lambda, delta)
    joint.rotation.z = MathUtils.damp(joint.rotation.z, base[2] + offset[2], lambda, delta)
  }
}

const ZERO = [0, 0, 0] as const
