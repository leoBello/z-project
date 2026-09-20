#!/usr/bin/env node
/**
 * Rend les tenues de `HeroPlaceholder` en PNG, sans navigateur.
 *
 *     node scripts/render-skins/index.mjs              # toutes les tenues
 *     node scripts/render-skins/index.mjs meruem kuroro
 *     node scripts/render-skins/index.mjs --out mes-rendus meruem
 *
 * Aucune dépendance hors celles du projet. Script manuel, hors build Vite.
 *
 * **Pourquoi il existe.** Un modèle 3D ne se corrige pas d'après une
 * description écrite : les deux skins du Marais ont été repris cinq fois à
 * l'aveugle, et chaque reprise corrigeait un défaut supposé pendant que les
 * vrais — une chevelure flottant seize centimètres au-dessus du crâne, des
 * visages entièrement enfouis sous la peau, un col de fourrure pointant vers le
 * bas — traversaient toutes les versions sans être vus. La première image rendue
 * les a montrés en une passe.
 *
 * **Ce qu'il rend est le composant du jeu, pas une maquette.** C'est tout
 * l'intérêt : une maquette qui a l'air juste ne prouve rien sur ce que le moteur
 * affiche, et c'est au moment de recopier l'une vers l'autre que les erreurs se
 * logent. Voir `react-tree.mjs` pour la façon dont un arbre JSX devient une
 * scène three.js sans React ni canvas.
 *
 * **Ce qu'il ne dit pas.** L'éclairage est une lambert, pas le cel-shading du
 * jeu, et les contours ne sont pas dessinés. Les images servent à juger des
 * formes et des proportions ; les valeurs de couleur et la lisibilité des
 * contours se jugent en jeu, et nulle part ailleurs.
 *
 * **Comment il s'y prend.** Les composants de `HeroPlaceholder` ne sont pas
 * exportés — ils n'ont aucune raison de l'être pour le jeu. Le script en fait
 * donc une copie temporaire à laquelle il ajoute une ligne d'export, la passe au
 * bundler SSR de Vite, l'importe, puis efface les deux. La copie porte un nom
 * réservé, ignoré par git : si le script est interrompu, elle reste sur le
 * disque mais ne se retrouve pas dans un commit.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as THREE from 'three'

import { build } from './react-tree.mjs'
import { render } from './rasterizer.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const SOURCE = path.join(ROOT, 'src', 'components', 'models', 'HeroPlaceholder.tsx')
/** Le nom est repris tel quel dans `.gitignore`. Le changer ici le casse là-bas. */
const PROBE = path.join(ROOT, 'src', 'components', 'models', '__render-skins-probe.tsx')
const BUNDLE = path.join(ROOT, 'node_modules', '.cache', 'render-skins')
const EXPORTS = 'export { SKINS, OUTFITS, Arm, Leg, HIP_Y, SHOULDER_Y, HEAD_Y }'

/*
  Les cotes du rig, relevées sur `HeroPlaceholder`.

  Trois d'entre elles sont importées depuis la copie sondée, donc elles ne
  peuvent pas dériver. Les quatre autres sont écrites en clair dans le JSX du
  héros et n'existent pas comme constantes : elles sont recopiées ici avec
  l'endroit d'où elles viennent, faute de mieux.
*/
/** Le rayon du crâne — `<sphereGeometry args={[0.26, …]}>` du groupe de tête. */
const HEAD_R = 0.26
/** Le demi-écartement des épaules — la position des groupes `armL` / `armR`. */
const SHOULDER_X = 0.24
/** Le demi-écartement des hanches — la position des groupes `legL` / `legR`. */
const HIP_X = 0.12
/** Le décalage du groupe de coiffe au-dessus du crâne. */
const HEADWEAR_Y = 0.16

const WIDTH = 520
const HEIGHT = 620

/* --- Ligne de commande ----------------------------------------------------- */

const argv = process.argv.slice(2)
let outDir = path.join(ROOT, '.render-skins')
const wanted = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') outDir = path.resolve(ROOT, argv[++i] ?? '')
  else wanted.push(argv[i])
}

/* --- La copie sondée ------------------------------------------------------- */

async function buildProbe() {
  fs.copyFileSync(SOURCE, PROBE)
  fs.appendFileSync(PROBE, `\n${EXPORTS}\n`)
  /*
    Vite est appelé par son **API**, et non en sous-processus.

    `npx` ne se lance pas de la même façon selon la plateforme, et le binaire de
    Vite n'est pas atteignable par `require.resolve` — son `package.json`
    n'expose pas ce sous-chemin. L'API, elle, marche partout, et elle évite le
    coût d'un démarrage de Node de plus.
  */
  const { build: viteBuild } = await import('vite')
  await viteBuild({
    root: ROOT,
    logLevel: 'error',
    build: {
      ssr: path.relative(ROOT, PROBE),
      outDir: path.relative(ROOT, BUNDLE),
      emptyOutDir: true,
    },
  })
  return pathToFileURL(path.join(BUNDLE, '__render-skins-probe.js')).href
}

function cleanProbe() {
  fs.rmSync(PROBE, { force: true })
  fs.rmSync(BUNDLE, { recursive: true, force: true })
}

/* --- Montage --------------------------------------------------------------- */

/**
 * Monte une tenue sur une copie du rig du héros.
 *
 * Le rig est reproduit à l'identique, **y compris le décalage de la coiffe** :
 * c'est précisément la chose qu'un portage rate, et un outil de vérification qui
 * la corrigerait en douce ne vérifierait plus rien.
 */
function mount(probe, outfit) {
  const { SKINS, OUTFITS, Arm, Leg, HIP_Y, SHOULDER_Y, HEAD_Y } = probe
  const skin = SKINS[outfit]
  const palette = OUTFITS[outfit]

  const root = new THREE.Group()
  const stats = { meshes: 0, skipped: 0 }

  const torso = new THREE.Group()
  torso.position.y = HIP_Y
  root.add(torso)
  build(skin.torso({ palette }), torso, stats)

  const head = new THREE.Group()
  head.position.y = HEAD_Y - HIP_Y
  torso.add(head)
  head.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_R, 18, 16),
      new THREE.MeshLambertMaterial({ color: palette.skin }),
    ),
  )
  // Les oreilles rondes du rig, aplaties contre le crâne. Elles comptent : une
  // coiffe ou un casque qui les laisserait dépasser se verrait ici.
  for (const x of [0.245, -0.245]) {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshLambertMaterial({ color: palette.skin }),
    )
    ear.position.x = x
    ear.scale.set(0.6, 1, 0.8)
    head.add(ear)
  }
  build(skin.face({ palette }), head, stats)

  const headwear = new THREE.Group()
  headwear.position.y = HEADWEAR_Y
  headwear.rotation.x = skin.rest
  head.add(headwear)
  build(skin.headwear({ palette }), headwear, stats)

  for (const side of [1, -1]) {
    const arm = new THREE.Group()
    arm.position.set(side * SHOULDER_X, SHOULDER_Y - HIP_Y, 0)
    torso.add(arm)
    build(Arm({ palette, outfit, fist: true, side }), arm, stats)

    const leg = new THREE.Group()
    leg.position.set(side * HIP_X, HIP_Y, 0)
    root.add(leg)
    build(Leg({ palette, outfit }), leg, stats)
  }

  return { root, stats, headY: HEAD_Y }
}

/* --- Prises de vue --------------------------------------------------------- */

/**
 * Les cadrages, **calculés sur la boîte englobante mesurée** et non écrits à la
 * main.
 *
 * Un cadrage fixe finit toujours par couper ce qui dépasse — une queue dressée,
 * une corne, une coiffe haute — et un modèle dont le haut sort du cadre paraît
 * juste sur une image qu'on regarde vite. Les vues de corps se déduisent donc de
 * la taille réelle ; seules les vues de tête sont posées, parce que la tête est
 * au même endroit pour tout le monde.
 *
 * La vue de dos et sa variante à trois quarts ne sont pas du luxe : la caméra du
 * jeu suit le joueur par-derrière, donc c'est la face qu'on voit le plus
 * longtemps — et c'est sous cet angle, et lui seul, qu'on a trouvé un crâne
 * chauve derrière une chevelure et un motif ridicule sur une nuque.
 */
function shotsFor(root, headY) {
  const box = new THREE.Box3().setFromObject(root)
  const height = Math.max(box.max.y - box.min.y, 0.1)
  const centre = (box.max.y + box.min.y) / 2
  // Un peu de marge : cadrer au ras de la boîte colle la figure aux bords.
  const distance = (height * 0.62) / Math.tan((36 / 2) * (Math.PI / 180))

  return [
    { name: 'face', position: [0, centre, distance], target: [0, centre, 0], fov: 36 },
    { name: 'profil', position: [distance, centre, 0.02], target: [0, centre, 0], fov: 36 },
    { name: 'dos', position: [0.02, centre, -distance], target: [0, centre, 0], fov: 36 },
    {
      name: 'dos-troisquarts',
      position: [distance * 0.62, centre + height * 0.3, -distance * 0.74],
      target: [0, centre, -0.05],
      fov: 34,
    },
    { name: 'tete', position: [0, headY + 0.1, 1.55], target: [0, headY + 0.05, 0], fov: 28 },
    { name: 'regard', position: [0, headY + 0.025, 1.15], target: [0, headY + 0.008, 0], fov: 23 },
  ]
}

/* --- Exécution ------------------------------------------------------------- */

try {
  const probe = await import(await buildProbe())
  const outfits = wanted.length > 0 ? wanted : Object.keys(probe.OUTFITS)
  const unknown = outfits.filter((outfit) => !probe.OUTFITS[outfit])

  if (unknown.length > 0) {
    console.error(`Tenue inconnue : ${unknown.join(', ')}`)
    console.error(`Connues : ${Object.keys(probe.OUTFITS).join(', ')}`)
    process.exitCode = 1
  } else {
    fs.mkdirSync(outDir, { recursive: true })
    const camera = new THREE.PerspectiveCamera(36, WIDTH / HEIGHT, 0.05, 400)

    for (const outfit of outfits) {
      const scene = new THREE.Scene()
      const { root, stats, headY } = mount(probe, outfit)
      scene.add(root)
      const skipped = stats.skipped > 0 ? `, ${stats.skipped} composant(s) sauté(s)` : ''
      console.log(`${outfit} : ${stats.meshes} pièces${skipped}`)

      for (const shot of shotsFor(root, headY)) {
        camera.position.set(...shot.position)
        camera.fov = shot.fov
        // L'aspect doit suivre le cadre demandé : une caméra réglée pour un
        // autre format écrase la figure sans que rien ne le signale.
        camera.aspect = WIDTH / HEIGHT
        camera.updateProjectionMatrix()
        camera.lookAt(new THREE.Vector3(...shot.target))
        camera.updateMatrixWorld(true)
        const file = path.join(outDir, `${outfit}-${shot.name}.png`)
        render(scene, camera, WIDTH, HEIGHT).write(file)
        console.log(`  -> ${path.relative(ROOT, file)}`)
      }
    }
  }
} finally {
  cleanProbe()
}
