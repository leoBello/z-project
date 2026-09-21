import { useEffect, useRef } from 'react'
import { PARRY } from '../config/parry'
import { ENEMIES } from '../config/enemies'
import { cameraView, makeScreenPoint, projectToScreen } from '../state/cameraView'
import { enemyRegistry } from '../state/enemyRegistry'
import { now as gameNow } from '../state/gameClock'
import { ground } from '../state/ground'
import { parry, parryOffered } from '../state/parry'
import { playerTransform } from '../state/playerTransform'
import { projectiles } from '../state/projectiles'
import { useGameStore } from '../store/useGameStore'

/** Au-delà, la barre serait de toute façon illisible : on ne la dessine pas. */
const HEALTH_BAR_MAX_DISTANCE = 45
/** Durée pendant laquelle un ennemi blessé continue d'afficher sa vie. */
const HEALTH_BAR_LINGER_MS = 2600
/** Fondu de sortie, en millisecondes. */
const HEALTH_BAR_FADE_MS = 450
/** Air laissé entre le sommet du collider et la barre, en unités monde. */
const HEALTH_BAR_CLEARANCE = 0.4
/**
 * Nombre de segments au-delà duquel la barre de vie passe en jauge continue.
 *
 * Voir `drawHealthBar` : à 26 pixels de large, sept segments est le maximum qui
 * reste lisible.
 */
const MAX_SEGMENTS = 7

/** Nombre de sondages de relief entre la caméra et un ennemi. */
const OCCLUSION_STEPS = 12
/**
 * Marge sous laquelle un relief ne compte pas comme occultant.
 *
 * Le segment part du sommet de la tête de l'ennemi ; sans marge, la pente sur
 * laquelle il se tient lui-même déclencherait le test dès le premier pas.
 */
const OCCLUSION_TOLERANCE = 0.35

/** Distance à laquelle un tir hors cadre est signalé. Au-delà, il ne menace pas encore. */
const THREAT_MAX_DISTANCE = 34
/** Rayon, en unités monde, du cercle au sol où se pose le chevron d'alerte. */
const THREAT_RING_RADIUS = 4.2
/** Décalage entre le centre de la capsule du joueur et le sol sous ses pieds. */
const PLAYER_FEET_DROP = 0.8

/** Rayon de l'anneau de parade, en unités monde. Il cerne le joueur sans le cacher. */
const PARRY_RING_RADIUS = 1.35
/** Nombre de segments de l'anneau projeté. En dessous de 24, on voit le polygone. */
const PARRY_RING_SEGMENTS = 32
/**
 * Durée du flash rouge sur un appui raté, en millisecondes.
 *
 * Propre à l'anneau, pas empruntée à `PARRY.windowMs` : c'est la durée d'un
 * retour visuel, pas une règle de gameplay, et les deux n'ont aucune raison
 * de rester égales si l'une des deux change un jour.
 */
const PARRY_WHIFF_FLASH_MS = 260
/**
 * Tenue de l'anneau d'or après une parade réussie.
 *
 * Volontairement plus courte que l'ouverture qu'elle récompense (1,3 s) : ce
 * qu'elle signale, c'est l'instant du geste, pas la durée de la punition — que
 * le joueur lit sur le Lynel désarçonné.
 */
const PARRY_SUCCESS_MS = 420

const point = makeScreenPoint()
const anchor = makeScreenPoint()

/**
 * Le relief coupe-t-il la vue entre la caméra et ce point ?
 *
 * Une barre de vie dessinée en 2D par-dessus la scène ignore le tampon de
 * profondeur : un ennemi derrière une colline affichait quand même sa vie, et
 * l'information devenait un mensonge sur sa position. Le filtre « engagé ou
 * blessé récemment, à moins de 45 unités » limitait les cas sans les supprimer.
 *
 * On sonde le sol de la carte courante — **le même échantillonneur que le mesh,
 * le collider et la minimap**, donc aucune seconde source de vérité — en une douzaine de
 * points le long du segment. Un raycast Rapier serait plus complet (il verrait
 * aussi les troncs) mais coûterait une requête physique par ennemi et par
 * frame, et surtout : ce calque vit hors de R3F et n'a pas le monde physique
 * sous la main. Le relief est de toute façon l'occultant qui gêne — un tronc
 * est trop fin pour cacher une barre plus d'une fraction de seconde.
 *
 * Le coût est marginal : le test n'est atteint que par les ennemis qui ont déjà
 * passé les filtres d'engagement et de distance, rarement plus de deux ou trois.
 */
function terrainHides(x: number, y: number, z: number) {
  const eye = cameraView.position
  for (let i = 1; i < OCCLUSION_STEPS; i++) {
    const t = i / OCCLUSION_STEPS
    const sx = eye.x + (x - eye.x) * t
    const sy = eye.y + (y - eye.y) * t
    const sz = eye.z + (z - eye.z) * t
    if (ground.height(sx, sz) > sy + OCCLUSION_TOLERANCE) return true
  }
  return false
}

/**
 * Calque de combat, dessiné en canvas 2D **par-dessus** le Canvas 3D.
 *
 * Choix assumé : ne pas passer par des billboards three ni par `<Html>` de
 * drei. Un billboard par ennemi ajouterait un draw call et un matériau
 * transparent par ennemi (donc du tri de transparence), et `<Html>` reprojette
 * des nœuds DOM à chaque frame. Ici tout tient dans un seul canvas et une seule
 * boucle, hors de React — c'est la même approche que la minimap.
 *
 * La boucle est indépendante de celle de R3F : elle lit `cameraView` et
 * `enemyRegistry`, deux états mutables publiés hors React. Un décalage d'une
 * frame est possible et invisible à l'œil.
 */
export function CombatOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    let width = 0
    let height = 0
    let ratio = 1

    const resize = () => {
      ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    let frame = 0

    const draw = () => {
      frame = requestAnimationFrame(draw)
      context.clearRect(0, 0, width, height)
      if (!cameraView.ready) return
      if (useGameStore.getState().phase !== 'playing') return

      const now = gameNow()
      // e[5] = 1 / tan(fov/2) : converti en pixels, c'est le facteur d'échelle
      // perspective. On dimensionne la barre en unités monde plutôt qu'en
      // pixels fixes, sinon un ennemi lointain porte la même barre qu'un ennemi
      // au contact et la profondeur ne se lit plus.
      const focal = cameraView.viewProjection.elements[5] * height * 0.5

      for (const enemy of enemyRegistry.values()) {
        if (enemy.state === 'dead') continue

        const engaged = enemy.state === 'chase' || enemy.state === 'attack'
        const sinceHit = now - enemy.lastHitAt
        const wounded = enemy.hp < enemy.maxHp && sinceHit < HEALTH_BAR_LINGER_MS
        if (!engaged && !wounded) continue

        const dx = enemy.x - playerTransform.position.x
        const dz = enemy.z - playerTransform.position.z
        if (Math.hypot(dx, dz) > HEALTH_BAR_MAX_DISTANCE) continue

        // La barre se pose au-dessus du collider, pas à une hauteur fixe : un
        // Octorok est deux fois plus bas qu'un Moblin, une constante commune
        // laisserait flotter la barre de l'un ou couperait la tête de l'autre.
        const stats = ENEMIES[enemy.kind]
        const lift = stats.halfHeight + stats.radius + HEALTH_BAR_CLEARANCE
        projectToScreen(enemy.x, enemy.y + lift, enemy.z, width, height, point)
        if (!point.onScreen) continue
        if (terrainHides(enemy.x, enemy.y + lift, enemy.z)) continue

        const distance = Math.hypot(
          enemy.x - cameraView.position.x,
          enemy.y - cameraView.position.y,
          enemy.z - cameraView.position.z,
        )
        const scale = focal / Math.max(distance, 1)

        // Le fondu ne s'applique qu'à une barre qui reste affichée parce que
        // l'ennemi a été blessé : tant qu'il est engagé, elle est pleine.
        let alpha = 1
        if (!engaged) {
          const remaining = HEALTH_BAR_LINGER_MS - sinceHit
          alpha = Math.min(1, remaining / HEALTH_BAR_FADE_MS)
        }
        if (alpha <= 0) continue

        drawHealthBar(context, point.x, point.y, scale, enemy.hp, enemy.maxHp, alpha, enemy.kind)
      }

      drawThreatArrows(context, width, height, focal)
      drawParryRing(context, width, height)
    }

    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="combat-overlay" />
}

/**
 * Chevrons d'alerte pour les tirs venus de hors cadre.
 *
 * Le cadre ne montre le sol que jusqu'à ~8 unités derrière le joueur (mesuré :
 * un marqueur posé 14 unités en arrière ne se projette plus), alors qu'un
 * Octorok tire de bien plus loin. Un projectile arrivant dans le dos était donc
 * strictement invisible jusqu'à l'impact : on perdait un cœur sans jamais voir
 * d'où.
 *
 * Le chevron est posé **dans le monde**, au sol, sur un cercle autour du
 * joueur, puis projeté comme n'importe quel point. C'est plus simple et plus
 * juste que de dessiner une ellipse en 2D : la perspective du sol s'applique
 * toute seule, et l'indicateur reste cohérent avec le décor.
 */
function drawThreatArrows(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  focal: number,
) {
  const now = gameNow()
  const playerX = playerTransform.position.x
  const playerY = playerTransform.position.y - PLAYER_FEET_DROP
  const playerZ = playerTransform.position.z

  for (const projectile of projectiles) {
    if (!projectile.active) continue

    const dx = playerX - projectile.position.x
    const dz = playerZ - projectile.position.z
    const distance = Math.hypot(dx, dz)
    if (distance > THREAT_MAX_DISTANCE || distance < 0.5) continue

    // Un projectile qui s'éloigne (tir manqué, déjà passé) n'est plus une
    // menace : le signaler ne ferait que du bruit à l'écran.
    if (projectile.velocity.x * dx + projectile.velocity.z * dz <= 0) continue

    projectToScreen(
      projectile.position.x,
      projectile.position.y,
      projectile.position.z,
      width,
      height,
      point,
    )
    if (point.onScreen) continue

    const dirX = dx / distance
    const dirZ = dz / distance
    // Le chevron se place du côté d'où vient le tir, et pointe vers le joueur.
    const ringX = playerX - dirX * THREAT_RING_RADIUS
    const ringZ = playerZ - dirZ * THREAT_RING_RADIUS
    projectToScreen(ringX, playerY, ringZ, width, height, anchor)
    if (anchor.behind) continue

    // Orientation lue sur l'écran, entre le chevron et un point légèrement plus
    // proche du joueur : évite d'avoir à démêler à la main comment la plongée
    // de la caméra écrase l'axe Z.
    projectToScreen(
      ringX + dirX * 0.6,
      playerY,
      ringZ + dirZ * 0.6,
      width,
      height,
      point,
    )
    const angle = Math.atan2(point.y - anchor.y, point.x - anchor.x)

    // Imminence. Elle pilote la **vitesse de clignotement**, pas l'opacité :
    // un tir lointain est justement celui qu'on veut avoir le temps d'éviter,
    // le rendre pâle reviendrait à cacher l'information quand elle est encore
    // utile. Mesuré à l'écran : un chevron à 60 % d'opacité sur une prairie
    // verte est illisible.
    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.z) || 1
    const urgency = 1 - Math.min(1, distance / speed / 1.6)
    const pulse = 0.78 + 0.22 * Math.sin(now * (0.007 + urgency * 0.022))
    const distanceToCamera = Math.hypot(
      ringX - cameraView.position.x,
      playerY - cameraView.position.y,
      ringZ - cameraView.position.z,
    )
    const size = Math.min(62, Math.max(28, (focal / Math.max(distanceToCamera, 1)) * 1.3))

    context.save()
    context.globalAlpha = pulse
    context.translate(anchor.x, anchor.y)
    context.rotate(angle)
    context.beginPath()
    context.moveTo(size * 0.5, 0)
    context.lineTo(-size * 0.3, size * 0.42)
    context.lineTo(-size * 0.1, 0)
    context.lineTo(-size * 0.3, -size * 0.42)
    context.closePath()
    // Double contour : un liseré clair puis un liseré sombre. C'est ce qui
    // rend le marqueur lisible aussi bien sur un feuillage sombre que sur du
    // sable clair, sans avoir à connaître le fond.
    context.lineJoin = 'round'
    context.strokeStyle = 'rgba(255, 244, 230, 0.95)'
    context.lineWidth = Math.max(3, size * 0.16)
    context.stroke()
    context.strokeStyle = 'rgba(28, 14, 10, 0.9)'
    context.lineWidth = Math.max(1.2, size * 0.05)
    context.stroke()
    context.fillStyle = '#ff4326'
    context.fill()
    context.restore()
  }
}

/**
 * L'anneau de parade, au sol, sous le joueur.
 *
 * Il dit **trois** choses successives avec une seule forme, et c'est voulu :
 * un joueur en train de lire un télégraphe ne peut pas en plus lire une
 * interface.
 *
 *  - violet **pulsé** : un coup parable arrive, la fenêtre est réactive ;
 *  - or **plein** : la garde est ouverte — c'est là qu'on apprend la longueur
 *    de sa propre fenêtre, ce qu'aucun texte n'enseignerait ;
 *  - rouge **bref** : l'appui est parti dans la récupération, il n'a rien gardé.
 *
 * Posé dans le monde et projeté, comme le chevron de menace : la perspective du
 * sol s'applique toute seule et l'anneau reste d'accord avec le décor. Dessiné
 * en ellipse 2D, il se décrocherait du sol dès que la caméra d'arène change
 * d'angle.
 *
 * Il est aussi la réponse à une objection simple : le signal diégétique du
 * Lynel — crinière et yeux qui s'allument — demande de regarder la bête. Un
 * joueur qui surveille ses cœurs, ou que le boss a passé dans le dos, ne le
 * verra pas. L'anneau est sous lui, toujours.
 */
function drawParryRing(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const now = gameNow()
  const offered = parryOffered(now)
  // `consumeParry` referme la garde à l'instant même où elle a servi : sans ce
  // second terme, l'anneau d'or s'éteindrait sur la frame de la parade réussie,
  // c'est-à-dire précisément celle qu'on veut voir.
  const succeeded = now - parry.succeededAt < PARRY_SUCCESS_MS
  const guarding = now < parry.guardUntil || succeeded
  const whiffed = now - parry.whiffedAt < PARRY_WHIFF_FLASH_MS

  if (!offered && !guarding && !whiffed) return

  const playerX = playerTransform.position.x
  const playerY = playerTransform.position.y - PLAYER_FEET_DROP
  const playerZ = playerTransform.position.z

  let color: string
  let lineWidth: number
  let alpha: number

  if (guarding) {
    // Or plein, sans pulsation : la garde est un état, pas une alerte.
    color = '#f3d789'
    lineWidth = 5
    alpha = 0.95
  } else if (offered) {
    // Le violet du cristal, celui du portail et des yeux du Lynel. La
    // pulsation accélère à mesure que l'impact approche : c'est une horloge,
    // pas un clignotant.
    const left = Math.max(0, parry.offerUntil - now)
    const urgency = 1 - Math.min(1, left / PARRY.cueLeadMs)
    color = '#b083ff'
    lineWidth = 3 + urgency * 2
    alpha = 0.55 + 0.45 * Math.sin(now * (0.012 + urgency * 0.03))
  } else {
    color = '#d0563f'
    lineWidth = 3
    alpha = 0.7 * (1 - (now - parry.whiffedAt) / PARRY_WHIFF_FLASH_MS)
  }

  context.save()
  context.globalAlpha = Math.max(0, Math.min(1, alpha))
  context.strokeStyle = color
  context.lineWidth = lineWidth
  context.beginPath()

  let started = false
  for (let i = 0; i <= PARRY_RING_SEGMENTS; i++) {
    const angle = (i / PARRY_RING_SEGMENTS) * Math.PI * 2
    projectToScreen(
      playerX + Math.cos(angle) * PARRY_RING_RADIUS,
      playerY,
      playerZ + Math.sin(angle) * PARRY_RING_RADIUS,
      width,
      height,
      point,
    )
    // Un point derrière la caméra se projette n'importe où : on coupe le tracé
    // plutôt que de tirer un trait à travers l'écran.
    if (point.behind) {
      started = false
      continue
    }
    if (!started) {
      context.moveTo(point.x, point.y)
      started = true
    } else {
      context.lineTo(point.x, point.y)
    }
  }

  context.stroke()
  context.restore()
}

/**
 * Barre de vie segmentée — sauf quand il y a trop de segments pour se voir.
 *
 * Segmentée et non continue : un Octorok a 2 PV, un Moblin 3, soit 2 ou 3 coups
 * d'épée. Une jauge continue demanderait au joueur d'estimer une proportion, là
 * où des segments répondent directement à la seule question qui compte — combien
 * de coups reste-t-il à donner.
 *
 * Le Lynel en a **36**, et le raisonnement s'y retourne. La largeur disponible
 * plafonne à 84 pixels : trente-six segments séparés par trente-cinq espaces de
 * 2,35 laissaient **0,05 pixel** par segment, c'est-à-dire une barre vide. Et
 * même dessinés, trente-six traits ne répondent plus à la question — personne ne
 * compte trente-six coups d'épée.
 *
 * Au-delà de `MAX_SEGMENTS`, la jauge passe donc en continu. Le seuil se déduit
 * de la lisibilité au pire cas : de loin la barre tombe à 26 pixels, et un
 * segment sous 3 pixels n'est plus un segment — ce qui en autorise sept.
 */
function drawHealthBar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  hp: number,
  maxHp: number,
  alpha: number,
  kind: keyof typeof ENEMIES,
) {
  const width = Math.min(84, Math.max(26, scale * 1.5))
  const height = Math.max(4, width * 0.115)
  const gap = Math.max(1, width * 0.028)
  const left = x - width / 2
  const top = y - height / 2
  const radius = height * 0.35

  context.save()
  context.globalAlpha = alpha

  // Fond sombre légèrement débordant : sert de contour, et garde la barre
  // lisible sur un ciel clair comme sur un feuillage sombre.
  const pad = Math.max(1.2, height * 0.32)
  roundRect(context, left - pad, top - pad, width + pad * 2, height + pad * 2, radius + pad)
  context.fillStyle = 'rgba(14, 20, 16, 0.72)'
  context.fill()

  if (maxHp <= MAX_SEGMENTS) {
    const segment = (width - gap * (maxHp - 1)) / maxHp
    for (let i = 0; i < maxHp; i++) {
      const filled = i < hp
      roundRect(context, left + i * (segment + gap), top, segment, height, radius)
      context.fillStyle = filled ? ENEMIES[kind].minimapColor : 'rgba(255, 255, 255, 0.14)'
      context.fill()
    }
  } else {
    // Le creux d'abord, sur toute la largeur, puis la part restante par-dessus :
    // une jauge qui rétrécit sans laisser sa trace ne dit pas combien on a déjà
    // entamé, ce qui est justement ce qu'on veut lire sur un boss.
    roundRect(context, left, top, width, height, radius)
    context.fillStyle = 'rgba(255, 255, 255, 0.14)'
    context.fill()

    const filled = width * Math.max(0, Math.min(1, hp / maxHp))
    // Sous un demi-pixel, `roundRect` produit un rayon plus grand que la boîte
    // et dessine une pastille : au dernier point de vie, mieux vaut ne rien
    // dessiner que de faire croire qu'il en reste.
    if (filled > 0.5) {
      roundRect(context, left, top, filled, height, Math.min(radius, filled / 2))
      context.fillStyle = ENEMIES[kind].minimapColor
      context.fill()
    }
  }

  context.restore()
}

/** `roundRect` n'est pas garanti sur tous les moteurs : version maison. */
function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}
