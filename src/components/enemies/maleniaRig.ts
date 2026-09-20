import { useRef, type RefObject } from 'react'
import type { Group } from 'three'

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
