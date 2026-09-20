/**
 * Un rasteriseur logiciel minimal, et son encodeur PNG.
 *
 * Il existe pour une seule raison : **pouvoir regarder un modèle sans
 * navigateur.** Un agent qui travaille en ligne de commande n'a pas d'écran, et
 * corriger une géométrie d'après une description écrite ne marche pas — cinq
 * versions des deux skins du Marais l'ont prouvé, chacune corrigeant à l'aveugle
 * un défaut que personne n'avait vu.
 *
 * Il prend une scène three.js déjà construite, projette ses triangles avec la
 * caméra qu'on lui donne, les rasterise dans un tampon de profondeur, et écrit
 * un PNG. Rien d'autre.
 *
 * **Ce qu'il ne fait pas, et qu'il ne faut pas lui demander.** L'éclairage est
 * une lambert à une source plus une ambiante : ça ne ressemble pas au
 * cel-shading du jeu, et ça ne prétend pas y ressembler. Il sert à juger des
 * **formes et des proportions**, jamais des valeurs de couleur — une teinte qui
 * paraît juste ici peut sortir tout autrement sous le dégradé à trois marches
 * du jeu.
 *
 * Les contours (les matériaux en `BackSide`) sont sautés : ils demandent un
 * déplacement de sommets du shader, et ils n'apprennent rien sur la forme.
 *
 * Deux pièges se sont payés cher pendant sa mise au point, et tous deux
 * produisent des images qui *semblent* bonnes :
 *
 *  - **l'aspect de la caméra doit correspondre au cadre demandé.** Rendre en
 *    520×620 une caméra réglée en 16/9 écrase tout à 42 % de sa largeur réelle,
 *    et l'on conclut alors que des yeux ronds sont des fentes verticales ;
 *  - **le cadrage doit contenir le sujet.** Une tête coupée en haut du cadre ne
 *    se voit pas sur une image qu'on regarde vite.
 *
 * Aucune dépendance hors `three` : le PNG est écrit à la main, en `deflate` plus
 * CRC32, ce qui tient en trente lignes et évite d'ajouter une bibliothèque au
 * dépôt pour un outil de mise au point.
 */
import zlib from 'node:zlib'
import fs from 'node:fs'
import { Matrix4, Vector3, BackSide, Color } from 'three'

/* --- Écriture PNG ---------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function writePng(path, width, height, rgb) {
  const stride = width * 3
  // Chaque ligne d'un PNG est précédée de son octet de filtre ; zéro veut dire
  // « aucun », ce qui suffit ici et laisse `deflate` faire tout le travail.
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgb.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  fs.writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

/* --- Rendu ----------------------------------------------------------------- */

const LIGHT = new Vector3(0.45, 0.75, 0.5).normalize()

/**
 * Rasterise `scene` vue par `camera` et renvoie de quoi écrire le PNG.
 *
 * L'appelant est responsable de l'aspect de la caméra : ce n'est pas corrigé
 * ici, parce qu'une caméra qu'on modifie en douce ment sur ce qu'elle cadre.
 */
export function render(scene, camera, width, height, background = [16, 22, 20]) {
  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = background[0]
    rgb[i * 3 + 1] = background[1]
    rgb[i * 3 + 2] = background[2]
  }
  const depth = new Float32Array(width * height).fill(Infinity)

  camera.updateMatrixWorld(true)
  scene.updateMatrixWorld(true)
  const viewProjection = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  )

  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const na = new Vector3()
  const nb = new Vector3()
  const nc = new Vector3()
  const normalMatrix = new Matrix4()
  const tint = new Color()

  const meshes = []
  scene.traverse((object) => {
    if (!object.isMesh || !object.visible || !object.geometry) return
    // Le dôme du ciel et les contours n'apprennent rien sur la forme.
    if (object.material?.side === BackSide) return
    meshes.push(object)
  })

  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position
    if (!position) continue
    const normal = mesh.geometry.attributes.normal
    const index = mesh.geometry.index
    const count = index ? index.count : position.count
    normalMatrix.extractRotation(mesh.matrixWorld)

    const base = mesh.material?.color ? tint.copy(mesh.material.color) : tint.setRGB(0.7, 0.7, 0.7)
    const baseR = base.r
    const baseG = base.g
    const baseB = base.b
    /*
      Un matériau non éclairé reste à sa valeur.

      C'est le cas de tous les traits de visage du jeu — yeux, paupières,
      bouches, tatouages — et les aplatir sous une lambert les ferait disparaître
      d'un côté du visage, ce qui est très exactement ce que le projet a écrit
      `meshBasicMaterial` pour éviter.
    */
    const unlit = mesh.material?.type === 'MeshBasicMaterial'

    for (let i = 0; i < count; i += 3) {
      const i0 = index ? index.getX(i) : i
      const i1 = index ? index.getX(i + 1) : i + 1
      const i2 = index ? index.getX(i + 2) : i + 2

      a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld)
      b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld)
      c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld)

      let shade = 1
      if (!unlit) {
        if (normal) {
          na.fromBufferAttribute(normal, i0).applyMatrix4(normalMatrix)
          nb.fromBufferAttribute(normal, i1).applyMatrix4(normalMatrix)
          nc.fromBufferAttribute(normal, i2).applyMatrix4(normalMatrix)
          na.add(nb).add(nc).normalize()
        } else {
          na.subVectors(b, a).cross(nb.subVectors(c, a)).normalize()
        }
        shade = 0.42 + 0.58 * Math.max(0, na.dot(LIGHT))
      }

      const pa = new Vector3().copy(a).applyMatrix4(viewProjection)
      const pb = new Vector3().copy(b).applyMatrix4(viewProjection)
      const pc = new Vector3().copy(c).applyMatrix4(viewProjection)

      // Un sommet derrière le plan proche donne une projection retournée, qui
      // barbouille tout le cadre d'un triangle géant.
      if (pa.z < -1 || pb.z < -1 || pc.z < -1) continue

      const x0 = ((pa.x + 1) / 2) * width
      const y0 = ((1 - pa.y) / 2) * height
      const x1 = ((pb.x + 1) / 2) * width
      const y1 = ((1 - pb.y) / 2) * height
      const x2 = ((pc.x + 1) / 2) * width
      const y2 = ((1 - pc.y) / 2) * height

      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
      const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)))
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
      const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)))
      if (minX > maxX || minY > maxY) continue

      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
      if (Math.abs(area) < 1e-9) continue

      const r = Math.round(Math.min(255, baseR * shade * 255))
      const g = Math.round(Math.min(255, baseG * shade * 255))
      const bl = Math.round(Math.min(255, baseB * shade * 255))

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5
          const py = y + 0.5
          const w0 = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) / area
          const w1 = ((px - x0) * (y2 - y0) - (x2 - x0) * (py - y0)) / area
          const w2 = 1 - w0 - w1
          if (w0 < 0 || w1 < 0 || w2 < 0) continue
          const z = w2 * pa.z + w1 * pb.z + w0 * pc.z
          const at = y * width + x
          if (z >= depth[at]) continue
          depth[at] = z
          rgb[at * 3] = r
          rgb[at * 3 + 1] = g
          rgb[at * 3 + 2] = bl
        }
      }
    }
  }

  return { rgb, write: (path) => writePng(path, width, height, rgb) }
}
