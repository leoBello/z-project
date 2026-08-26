import { Matrix4, Vector3 } from 'three'

/**
 * Caméra publiée **hors de React**, pour que le calque de combat 2D puisse
 * reprojeter des points du monde sur l'écran.
 *
 * Même raison que `playerTransform` : la matrice change à chaque frame et
 * l'overlay la lit dans sa propre boucle. La faire transiter par un state
 * React re-rendrait le HUD soixante fois par seconde.
 *
 * On publie la matrice view-projection plutôt que la caméra elle-même : c'est
 * la seule chose dont l'overlay a besoin, et ça évite d'exposer un objet three
 * mutable à du code qui n'a pas à le toucher.
 */
export const cameraView = {
  viewProjection: new Matrix4(),
  /** Position monde de la caméra — sert à trier par profondeur. */
  position: new Vector3(),
  /** Faux tant que le premier rendu n'a pas eu lieu : la matrice est identité. */
  ready: false,
}

export interface ScreenPoint {
  /** Coordonnées en pixels CSS, valides seulement si `onScreen`. */
  x: number
  y: number
  /** Direction écran normalisée depuis le centre — utilisable même hors cadre. */
  dirX: number
  dirY: number
  /** Vrai si le point est devant la caméra et dans le cadre. */
  onScreen: boolean
  /** Vrai si le point est derrière le plan de la caméra. */
  behind: boolean
}

/**
 * Projette un point monde en pixels écran.
 *
 * Le calcul est fait à la main sur les composantes homogènes plutôt qu'avec
 * `Vector3.applyMatrix4` : cette dernière divise par `w` sans en garder le
 * signe, si bien qu'un point situé **derrière** la caméra ressort projeté
 * devant, en position miroir. C'est exactement le cas qui nous intéresse ici —
 * un tireur hors écran est le plus souvent dans le dos du joueur.
 */
export function projectToScreen(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  out: ScreenPoint,
): ScreenPoint {
  const e = cameraView.viewProjection.elements
  const clipX = e[0] * x + e[4] * y + e[8] * z + e[12]
  const clipY = e[1] * x + e[5] * y + e[9] * z + e[13]
  const clipW = e[3] * x + e[7] * y + e[11] * z + e[15]

  const behind = clipW <= 0
  // Derrière la caméra, on inverse le signe pour obtenir une direction utile :
  // le point n'a pas de position écran, mais il a bien un « de quel côté ».
  const invW = 1 / (behind ? -clipW : clipW)
  const ndcX = clipX * invW * (behind ? -1 : 1)
  const ndcY = clipY * invW * (behind ? -1 : 1)

  out.x = (ndcX * 0.5 + 0.5) * width
  out.y = (-ndcY * 0.5 + 0.5) * height
  out.behind = behind
  out.onScreen = !behind && ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1

  // Direction depuis le centre de l'écran, en pixels normalisés.
  const cx = out.x - width * 0.5
  const cy = out.y - height * 0.5
  const length = Math.hypot(cx, cy) || 1
  out.dirX = cx / length
  out.dirY = cy / length

  return out
}

/** Point de travail réutilisable : l'overlay projette des dizaines de points par frame. */
export function makeScreenPoint(): ScreenPoint {
  return { x: 0, y: 0, dirX: 0, dirY: -1, onScreen: false, behind: false }
}
