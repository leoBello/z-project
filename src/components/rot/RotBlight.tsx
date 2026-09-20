import { useFrame } from '@react-three/fiber'
import { PLAYER } from '../../config/gameplay'
import { ROT } from '../../config/rotBlight'
import { now as gameNow } from '../../state/gameClock'
import { playerTransform } from '../../state/playerTransform'
import { soakRot, tickRot } from '../../state/rot'
import { useGameStore } from '../../store/useGameStore'

/**
 * Ce qui fait monter et redescendre la pourriture — le seul moteur de la jauge.
 *
 * Il ne rend rien. Il est monté avec le Marais et avec lui seul, ce qui est
 * exact : c'est la seule carte où l'on peut se contaminer, et le faire tourner
 * sur les deux autres reviendrait à y payer une lecture de position par frame
 * pour une jauge qui reste à zéro.
 *
 * **L'eau se détecte à l'altitude des pieds, pas à un test de zone.** Le marais
 * est plat à 0, la nappe à 0,30, les racines démarrent à 0,40 et le dallage de
 * l'arène est à 0,45 : un seul seuil à 0,20 sépare donc « dans l'eau » de « au
 * sec », sans avoir à savoir *sur quoi* le joueur se tient. C'est ce qui fait
 * que les racines, l'arène et les bancs de vase protègent tous les trois sans
 * qu'aucun n'ait à se déclarer — et qu'un quatrième objet posé plus haut que
 * vingt centimètres protégera aussi, sans une ligne de plus.
 */

/** Altitude des pieds sous laquelle on est dans la nappe. */
const WADE_Y = 0.2

/** Le centre de la capsule est à cette hauteur au-dessus des pieds. */
const FEET_OFFSET = PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius

export function RotBlight() {
  useFrame((_, rawDelta) => {
    const store = useGameStore.getState()
    // Gelé en pause, en panneau ouvert, ou après la mort : la pourriture est du
    // temps qui passe, et le temps de jeu ne passe pas dans ces états-là.
    if (store.phase !== 'playing') return

    const now = gameNow()
    const delta = Math.min(rawDelta, 0.05)

    const feet = playerTransform.position.y - FEET_OFFSET
    if (feet < WADE_Y) soakRot(ROT.perSecondInWater * delta, now)

    /*
      Le prélèvement est fait ici et pas dans `state/rot.ts`, qui ne connaît pas
      le store : la jauge dit *combien* de cœurs partent, ce composant les
      retire. C'est ce qui permet de contrôler toute la mécanique dans un test
      sans partie en cours.

      `damagePlayer` et non une écriture directe : il porte l'invulnérabilité,
      le son, la secousse et le flash. Une contamination qui retirerait un cœur
      en silence serait la seule perte de vie du jeu qu'on ne sentirait pas.

      Sans source d'ennemi, et c'est exact : la pourriture n'est pas un coup, et
      l'annoncer comme venant d'une créature ferait mentir les réductions de
      dégâts liées aux tenues — qui sont, elles, indexées sur l'espèce.

      L'invulnérabilité de 1,1 s ne gêne pas : les prélèvements sont espacés de
      2,5 s, donc chacun tombe hors de la fenêtre du précédent.
    */
    const hearts = tickRot(now, delta)
    for (let i = 0; i < hearts; i++) store.damagePlayer(1)
  })

  return null
}
