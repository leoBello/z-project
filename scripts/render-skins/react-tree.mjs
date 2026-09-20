/**
 * Un lecteur d'arbre React → three.js.
 *
 * Il répond à un problème précis : **une maquette qui a l'air juste ne prouve
 * rien sur ce que le jeu affiche.** Les maquettes de `docs/maquettes/` sont du
 * three.js impératif, les skins sont du JSX, et c'est au moment de recopier
 * l'une vers l'autre que les erreurs se logent — une ordonnée oubliée, un pivot
 * qui n'est pas le même, une pièce posée sous la surface au lieu de dessus.
 *
 * Ce que ça exploite : les composants de `HeroPlaceholder` sont des **fonctions
 * pures**. Appelées avec une palette, elles rendent un arbre d'éléments React,
 * qui ne sont que des objets `{ type, props }`. Il suffit de le parcourir et de
 * construire l'objet three.js que le moteur construirait, sans React ni canvas.
 *
 * Deux conséquences agréables : les chaînes récursives — une queue, une corne,
 * une antenne dont chaque maillon est fils du précédent — se déroulent
 * exactement comme sous React, et un composant qui rendrait zéro maille se voit
 * dans le compte que renvoie `build`.
 *
 * Ce lecteur ne connaît que ce dont les skins se servent : `group`, `mesh`, les
 * géométries et matériaux listés ci-dessous. Un nœud qu'il ne connaît pas est
 * ignoré en silence, ce qui est le bon comportement pour un outil de mise au
 * point — mais explique un modèle qui paraîtrait incomplet si l'on ajoutait une
 * géométrie exotique sans l'inscrire ici.
 */
import * as THREE from 'three'

const GEOMETRY = {
  boxGeometry: 'BoxGeometry',
  sphereGeometry: 'SphereGeometry',
  capsuleGeometry: 'CapsuleGeometry',
  cylinderGeometry: 'CylinderGeometry',
  coneGeometry: 'ConeGeometry',
  torusGeometry: 'TorusGeometry',
  circleGeometry: 'CircleGeometry',
  planeGeometry: 'PlaneGeometry',
  dodecahedronGeometry: 'DodecahedronGeometry',
  icosahedronGeometry: 'IcosahedronGeometry',
  ringGeometry: 'RingGeometry',
  torusKnotGeometry: 'TorusKnotGeometry',
  latheGeometry: 'LatheGeometry',
}

/**
 * Les matériaux, et **s'ils s'éclairent**.
 *
 * C'est la seule chose qui compte pour le rasteriseur : le cel-shading n'est pas
 * imité, mais la distinction entre une pièce qui s'ombre et un trait de visage
 * qui garde sa valeur, elle, change complètement la lecture.
 */
const MATERIAL = {
  meshToonMaterial: 'lit',
  meshStandardMaterial: 'lit',
  meshLambertMaterial: 'lit',
  meshPhongMaterial: 'lit',
  meshBasicMaterial: 'unlit',
}

const FRAGMENT = Symbol.for('react.fragment')

function applyTransform(object, props) {
  if (props.position) object.position.fromArray(props.position)
  if (props.rotation) object.rotation.set(...props.rotation)
  if (props.scale !== undefined) {
    if (Array.isArray(props.scale)) object.scale.fromArray(props.scale)
    else object.scale.setScalar(props.scale)
  }
}

/** Les enfants d'un élément, toujours sous forme de liste plate. */
function childrenOf(props) {
  const children = props?.children
  if (children === undefined || children === null) return []
  return (Array.isArray(children) ? children.flat(8) : [children]).filter(
    (child) => child !== null && child !== undefined && child !== false && typeof child !== 'string',
  )
}

function isInlineTag(element) {
  const type = element?.type
  return typeof type === 'string' && (GEOMETRY[type] || MATERIAL[type])
}

/**
 * Parcourt `element` et ajoute ce qu'il décrit sous `parent`.
 *
 * `stats.meshes` compte les pièces retenues et sert d'accusé de réception ;
 * `stats.skipped` compte les composants qui ont levé, et doit rester à zéro.
 */
export function build(element, parent, stats = { meshes: 0, skipped: 0 }) {
  if (element === null || element === undefined || element === false) return stats
  if (Array.isArray(element)) {
    for (const child of element.flat(8)) build(child, parent, stats)
    return stats
  }
  if (typeof element !== 'object' || !('type' in element)) return stats

  const { type, props = {} } = element

  if (typeof type === 'function') {
    /*
      `Outlines` de drei est sauté : il rend une maille en `BackSide`, que le
      rasteriseur ignore de toute façon, et il appelle des hooks — donc il lève
      hors d'un rendu React.

      Il est reconnu à sa **signature** et non à son nom : un bundle mange les
      noms de fonction, et `type.name` n'y vaut rien.
    */
    if (props.thickness !== undefined) return stats
    try {
      return build(type(props), parent, stats)
    } catch {
      // Un composant à hooks n'a rien à faire ici, mais sa perte doit se compter
      // plutôt que de faire tomber la prise de vue entière.
      stats.skipped += 1
      return stats
    }
  }

  if (type === FRAGMENT) {
    for (const child of childrenOf(props)) build(child, parent, stats)
    return stats
  }

  if (typeof type !== 'string') return stats

  if (type === 'group') {
    const group = new THREE.Group()
    applyTransform(group, props)
    parent.add(group)
    for (const child of childrenOf(props)) build(child, group, stats)
    return stats
  }

  if (type === 'mesh') {
    let geometry = null
    let color = '#808080'
    let lit = true
    for (const child of childrenOf(props)) {
      const kind = child?.type
      if (typeof kind !== 'string') continue
      if (GEOMETRY[kind]) geometry = new THREE[GEOMETRY[kind]](...(child.props?.args ?? []))
      else if (MATERIAL[kind]) {
        color = child.props?.color ?? color
        lit = MATERIAL[kind] === 'lit'
      }
    }
    if (!geometry) return stats

    const mesh = new THREE.Mesh(
      geometry,
      lit ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshBasicMaterial({ color }),
    )
    applyTransform(mesh, props)
    parent.add(mesh)
    stats.meshes += 1

    // Une maille peut porter des enfants : un contour, ou tout un sous-groupe.
    for (const child of childrenOf(props)) {
      if (isInlineTag(child)) continue
      build(child, mesh, stats)
    }
    return stats
  }

  // Tout autre nœud hôte — une lumière, un contour — n'apprend rien sur la forme.
  return stats
}
