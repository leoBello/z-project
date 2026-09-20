import { ExtrudeGeometry, Shape } from 'three'

/**
 * Le nuage de l'Aube, tracé à la main puis extrudé.
 *
 * Même parti pris que `heartGeometry` — dont ce module est le voisin direct, et
 * volontairement : un blason tient en dix courbes, le générer ici garde la
 * promesse du projet (aucun octet à télécharger) et la teinte reste celle de la
 * palette du skin, sans passer par une texture.
 *
 * Une première version l'assemblait en sphères aplaties. Elle faisait une
 * grappe de bulles, pas un blason : la forme se reconnaît à ses **trois lobes
 * hauts et ses trois festons rentrants**, c'est-à-dire exactement à ce qu'un
 * empilement de sphères ne sait pas décrire.
 *
 * Le liseré blanc n'est pas dessiné ici : c'est le contour `<Outlines>` du
 * mesh qui le porte. La pièce qui cerne tout le personnage dessine donc aussi
 * le trait du nuage, et les deux ne peuvent pas diverger.
 *
 * `size` est la largeur finale approximative, en unités monde : la forme est
 * tracée dans un carré de côté un, centrée, puis mise à l'échelle.
 */
export function cloudGeometry(size: number) {
  const shape = new Shape()
  // Bord inférieur, de gauche à droite : trois festons qui rentrent.
  shape.moveTo(-0.46, -0.2)
  shape.quadraticCurveTo(-0.34, -0.36, -0.18, -0.26)
  shape.quadraticCurveTo(-0.04, -0.41, 0.12, -0.28)
  shape.quadraticCurveTo(0.31, -0.42, 0.44, -0.23)
  // Flanc droit, puis les trois lobes hauts.
  shape.quadraticCurveTo(0.57, -0.09, 0.45, 0.07)
  shape.quadraticCurveTo(0.57, 0.25, 0.33, 0.3)
  shape.quadraticCurveTo(0.24, 0.47, 0.03, 0.4)
  shape.quadraticCurveTo(-0.11, 0.55, -0.28, 0.38)
  shape.quadraticCurveTo(-0.5, 0.41, -0.52, 0.16)
  shape.quadraticCurveTo(-0.59, -0.02, -0.46, -0.2)

  const geometry = new ExtrudeGeometry(shape, {
    // Épaisseur et biseau minces : le nuage est un applique cousu sur une
    // étoffe, pas une plaque. Le biseau sert surtout au contour — sans lui, les
    // normales de tranche sont plates et le liseré blanc se pince dans les
    // angles rentrants des festons.
    depth: 0.035,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
    curveSegments: 8,
  })
  geometry.center()
  geometry.scale(size, size, size)
  return geometry
}
