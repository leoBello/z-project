import { NAKANO } from './landmarks'
import { sampleHeight } from './world'

/**
 * Le portail de l'Île Céleste — où il se pose, et pourquoi là.
 *
 * Il n'a pas d'entrée dans `LANDMARKS` et c'est délibéré : un lieu de cette
 * table creuse une terrasse, interdit la végétation, paraît sur la minimap dès
 * la première frame et entre dans le menu de téléportation. Le portail n'existe
 * pas au début de la partie — l'inscrire là reviendrait à en annoncer
 * l'existence avant qu'il ne soit mérité. Il se décrit donc **dans le repère du
 * Temple de Nakano**, comme un coffre, et rien de la carte n'en dépend.
 */

/**
 * Distance devant la pagode, sur son axe avant (+Z local).
 *
 * Trois cotes de `NAKANO` encadrent ce nombre, et il est le seul à les
 * satisfaire toutes les trois :
 *
 *  - le dallage de l'îlot s'arrête à **4,5** de rayon. Au-delà, le portail se
 *    dresse sur la terre et non sur la pierre : il ne se lit pas comme une
 *    pièce du temple, ce qu'il n'est pas ;
 *  - le semis de végétation est interdit dans un rayon de **6** (`clearRadius`).
 *    En deçà, aucune touffe d'herbe ne peut pousser au travers de l'anneau ;
 *  - la terrasse est plate jusqu'à **4,2** puis se raccorde au relief sur 5
 *    unités. À 5,4 la pente est encore douce, et l'altitude est de toute façon
 *    relevée à l'exécution (voir `PORTAL.y`).
 */
const FORWARD = 5.4

/**
 * Position et cap du portail, en coordonnées **monde**.
 *
 * L'altitude est échantillonnée et non déduite de `NAKANO.altitude` : à 5,4 du
 * centre on est dans le raccord de la terrasse, où le terrain a déjà commencé à
 * redescendre. Interroger `sampleHeight` est le seul moyen de poser l'anneau
 * *sur* le sol que le joueur voit — c'est le même échantillonneur que le mesh,
 * le collider et les anneaux de mort, donc il n'existe pas de seconde version
 * du terrain où le portail flotterait.
 *
 * Le cap est celui du monument, sans correction : l'anneau est un disque
 * vertical, et sa normale doit regarder d'où l'on vient — c'est-à-dire la même
 * direction que la façade de la pagode, vers le pont au sud-ouest.
 */
export const PORTAL = (() => {
  const cos = Math.cos(NAKANO.yaw)
  const sin = Math.sin(NAKANO.yaw)
  const x = NAKANO.x + FORWARD * sin
  const z = NAKANO.z + FORWARD * cos
  return { x, y: sampleHeight(x, z), z, yaw: NAKANO.yaw }
})()

/**
 * Distance à laquelle le portail réagit à l'approche du joueur.
 *
 * Il ne propose rien — l'île céleste n'existe pas encore — donc il n'a ni
 * invite ni entrée dans `interaction.ts`. Il s'intensifie simplement quand on
 * s'en approche, comme la braise bleue des monuments. La nuance est importante :
 * une invite promettrait une action qui n'arriverait pas, une lueur qui monte ne
 * promet rien et se contente de dire « je suis vivant ».
 */
export const PORTAL_NEAR_RADIUS = 7
