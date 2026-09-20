import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  IcosahedronGeometry,
  Matrix4,
  MeshToonMaterial,
  Vector3,
  type InstancedMesh,
} from 'three'
import { ATTACK } from '../config/gameplay'
import { sampleHeight } from '../config/world'
import { enemyRegistry } from '../state/enemyRegistry'
import { isHitStopped, now as gameNow } from '../state/gameClock'
import { playerTransform } from '../state/playerTransform'
import {
  deflectProjectile,
  PROJECTILE_GRAVITY,
  PROJECTILE_HIT_RADIUS,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_PARRY_RADIUS,
  PROJECTILE_POOL_SIZE,
  PROJECTILE_RETURN_SEEK_RANGE,
  projectiles,
  type Projectile,
} from '../state/projectiles'
import { useGameStore } from '../store/useGameStore'
import { toonGradient } from './models/toonGradient'

const HIDDEN = new Matrix4().makeScale(0, 0, 0)
const matrix = new Matrix4()
const scratch = new Vector3()

/** Teinte d'une balle ennemie : pierre sombre, elle se lit sur le ciel clair. */
const ENEMY_TINT = new Color('#2f3b46')
/**
 * Teinte d'une balle renvoyée : le même or que la traînée d'un coup qui porte.
 * Le jeu n'a que deux signaux dorés, et tous deux disent « ça a marché ».
 */
const RETURNED_TINT = new Color('#f2c76a')

/**
 * Le coup d'épée en cours renvoie-t-il ce projectile ?
 *
 * Évalué **une fois par swing et par projectile**, dès la première frame qui
 * suit l'ouverture de la fenêtre de dégâts, et marqué consommé qu'il pare ou
 * non — exactement comme la hitbox anti-ennemi d'`Enemy.tsx`. Le contraire (un
 * test « sommes-nous dans la fenêtre ? ») raterait un projectile sur deux,
 * puisque celui-ci traverse la zone en une à deux frames.
 */
function tryParry(projectile: Projectile, now: number) {
  const swing = playerTransform.attackStartedAt
  const swingAge = now - swing
  if (swingAge < ATTACK.hitWindow[0] * ATTACK.durationMs) return
  if (projectile.lastSwingTested === swing) return
  projectile.lastSwingTested = swing

  // La portée effective, comme pour les ennemis : un objet qui allonge le bras
  // allonge aussi la fenêtre où l'on renvoie une flèche.
  const armLength = useGameStore.getState().swordReach()
  const hitX = playerTransform.position.x + Math.sin(playerTransform.yaw) * armLength
  const hitZ = playerTransform.position.z + Math.cos(playerTransform.yaw) * armLength
  if (
    Math.hypot(
      projectile.position.x - hitX,
      projectile.position.y - playerTransform.position.y,
      projectile.position.z - hitZ,
    ) > PROJECTILE_PARRY_RADIUS
  ) {
    return
  }

  // Cible du renvoi : l'ennemi vivant le plus proche, sinon droit devant. Sans
  // cette recherche, il faudrait être aligné sur le tireur au moment de parer —
  // or la parade se joue de face, et le tireur, lui, a bougé depuis son tir.
  let bestX = 0
  let bestY = 0
  let bestZ = 0
  let bestDistance = PROJECTILE_RETURN_SEEK_RANGE
  for (const enemy of enemyRegistry.values()) {
    if (enemy.state === 'dead') continue
    const distance = Math.hypot(
      enemy.x - projectile.position.x,
      enemy.z - projectile.position.z,
    )
    if (distance < bestDistance) {
      bestDistance = distance
      bestX = enemy.x
      bestY = enemy.y
      bestZ = enemy.z
    }
  }

  if (bestDistance < PROJECTILE_RETURN_SEEK_RANGE) {
    deflectProjectile(projectile, bestX, bestY, bestZ)
  } else {
    deflectProjectile(
      projectile,
      projectile.position.x + Math.sin(playerTransform.yaw) * 12,
      projectile.position.y,
      projectile.position.z + Math.cos(playerTransform.yaw) * 12,
    )
  }

  // Le renvoi vaut un coup qui porte : la traînée de lame doit être dorée.
  playerTransform.lastLandedSwing = swing
}

/**
 * Rendu et simulation des projectiles.
 *
 * Un seul `InstancedMesh` pour tout le pool : quel que soit le nombre de tirs à
 * l'écran, ça reste un draw call. Les projectiles inactifs sont mis à l'échelle
 * zéro plutôt que retirés — réécrire la géométrie coûterait plus cher que de
 * dessiner un point invisible.
 */
export function Projectiles() {
  const mesh = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new IcosahedronGeometry(0.2, 0), [])
  // Blanc de base : la teinte réelle vient d'`instanceColor`, qui distingue une
  // balle ennemie d'une balle renvoyée sans ajouter ni matériau ni draw call.
  const material = useMemo(
    () => new MeshToonMaterial({ color: '#ffffff', gradientMap: toonGradient }),
    [],
  )

  useFrame((_, rawDelta) => {
    const instanced = mesh.current
    if (!instanced) return

    const delta = Math.min(rawDelta, 0.05)
    const now = gameNow()
    const store = useGameStore.getState()

    // Ces deux pools intègrent leur mouvement à la main, hors de Rapier : le
    // `paused` du moteur physique ne les atteint pas. Sans ce garde, un
    // projectile continue de traverser l'écran derrière le panneau et un cœur
    // continue de tomber, alors que tout le reste du monde est figé. Deux gels
    // le demandent, et non un seul. Le panneau ouvert d'abord, où seule l'image
    // trahissait la pause — `damagePlayer` et `healPlayer` refusent déjà hors de
    // `playing`. Le hit-stop du coup fatal ensuite, pendant lequel la phase vaut
    // toujours `playing` : là, l'enjeu n'est plus décoratif, une balle déjà
    // proche toucherait le joueur pendant la frame gelée, alors qu'il est
    // immobilisé, ne peut plus parer, et que ses i-frames — chronométrées sur
    // l'horloge de jeu, arrêtée — ne s'écoulent pas non plus.
    if (store.phase !== 'playing' || isHitStopped()) return

    for (let i = 0; i < projectiles.length; i++) {
      const projectile = projectiles[i]

      if (projectile.active) {
        projectile.velocity.y += PROJECTILE_GRAVITY * delta
        projectile.position.addScaledVector(projectile.velocity, delta)

        // La parade est testée avant les collisions : une balle parée sur la
        // frame où elle atteint le joueur ne doit pas coûter un cœur.
        if (!projectile.deflected) tryParry(projectile, now)

        // Impact sur le joueur — une balle renvoyée ne le blesse plus, sinon
        // parer reviendrait à se tirer dessus.
        scratch.copy(playerTransform.position)
        if (
          !projectile.deflected &&
          projectile.position.distanceTo(scratch) < PROJECTILE_HIT_RADIUS
        ) {
          projectile.active = false
          // L'espèce est nommée bien qu'aucun objet ne s'en serve aujourd'hui :
          // le pool n'appartient qu'aux octoroks, et un point d'entrée de
          // dégâts qui ne dit pas qui frappe est un trou que le prochain objet
          // défensif découvrirait en silence.
          store.damagePlayer(1, 'octorok')
        } else if (now - projectile.bornAt > PROJECTILE_LIFETIME_MS) {
          projectile.active = false
        } else if (
          // Impact sur le sol : on interroge le même échantillonneur de relief
          // que le terrain, donc l'impact tombe pile sur la surface visible.
          projectile.position.y <
          sampleHeight(projectile.position.x, projectile.position.z)
        ) {
          projectile.active = false
        }
      }

      if (projectile.active) {
        matrix.makeTranslation(
          projectile.position.x,
          projectile.position.y,
          projectile.position.z,
        )
        instanced.setMatrixAt(i, matrix)
        instanced.setColorAt(i, projectile.deflected ? RETURNED_TINT : ENEMY_TINT)
      } else {
        instanced.setMatrixAt(i, HIDDEN)
      }
    }

    instanced.instanceMatrix.needsUpdate = true
    // `instanceColor` n'existe qu'après le premier `setColorAt` : three
    // l'alloue paresseusement, d'où le test plutôt qu'un accès direct.
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, PROJECTILE_POOL_SIZE]}
      castShadow
      // Le volume englobant serait recalculé en permanence pour des objets qui
      // traversent la carte : moins cher de désactiver le culling.
      frustumCulled={false}
    />
  )
}
