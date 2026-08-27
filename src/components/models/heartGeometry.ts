import { ExtrudeGeometry, Shape } from 'three'

/**
 * Cœur en volume, tracé à la main puis extrudé.
 *
 * Pas de `.glb` : la silhouette d'un cœur tient en six courbes de Bézier, et la
 * générer ici garde la promesse du projet — aucun octet à télécharger, et la
 * couleur reste celle du HUD sans avoir à retoucher un fichier.
 *
 * Partagée par les cœurs lâchés au sol et par le réceptacle des monuments :
 * c'est le même objet dans la fiction du jeu, il doit avoir la même silhouette.
 * `size` est le demi-côté final, en unités monde.
 */
export function heartGeometry(size: number) {
  const shape = new Shape()
  shape.moveTo(0, -1)
  shape.bezierCurveTo(0.55, -0.45, 1.1, -0.05, 1.1, 0.4)
  shape.bezierCurveTo(1.1, 0.85, 0.75, 1.05, 0.45, 1.05)
  shape.bezierCurveTo(0.2, 1.05, 0.05, 0.9, 0, 0.72)
  shape.bezierCurveTo(-0.05, 0.9, -0.2, 1.05, -0.45, 1.05)
  shape.bezierCurveTo(-0.75, 1.05, -1.1, 0.85, -1.1, 0.4)
  shape.bezierCurveTo(-1.1, -0.05, -0.55, -0.45, 0, -1)

  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.55,
    bevelEnabled: true,
    bevelSize: 0.16,
    bevelThickness: 0.12,
    bevelSegments: 2,
    curveSegments: 8,
  })
  // Centrée puis mise à l'échelle : la forme est dessinée dans un repère
  // arbitraire, l'instance doit tourner autour de son propre centre.
  geometry.center()
  geometry.scale(size, size, size)
  return geometry
}
