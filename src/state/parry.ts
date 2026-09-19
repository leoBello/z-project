import { PARRY } from '../config/parry'
import { now as gameNow } from './gameClock'

/**
 * L'état de la parade, partagé **hors de React**.
 *
 * Même raison que `playerTransform` : trois boucles `useFrame` y touchent à
 * chaque frame — le joueur y écrit son appui, le boss y dépose son offre, le
 * calque de combat y lit ce qu'il doit dessiner. Un state React re-rendrait le
 * HUD soixante fois par seconde pour allumer un cercle.
 *
 * Aucun des trois ne connaît les deux autres, et c'est ce qui permettra
 * d'étendre la parade au Moblin sans toucher au joueur ni au calque : il
 * suffira que `Enemy.tsx` appelle `offerParry()`.
 */
export const parry = {
  /** Début de la fenêtre où le signal est allumé. */
  offerFrom: -Infinity,
  /** Instant de l'impact annoncé. Après lui, l'offre est caduque. */
  offerUntil: -Infinity,
  /**
   * Qui a fait l'offre.
   *
   * Sans ce champ, un ennemi tué pendant sa préparation laisserait une offre
   * derrière lui : le signal resterait allumé sous le joueur jusqu'à expiration,
   * et une parade partirait dans le vide en croyant couvrir quelque chose.
   */
  offerBy: '',
  /** Fin de la garde active. Un coup qui arrive avant est paré. */
  guardUntil: -Infinity,
  /** Fin de l'immobilisation. Aucune garde ne peut s'ouvrir avant. */
  recoveryUntil: -Infinity,
  /** Dernière parade réussie, pour le retour visuel. */
  succeededAt: -Infinity,
  /** Dernier appui refusé par la récupération, pour le retour visuel. */
  whiffedAt: -Infinity,
}

/**
 * Le boss annonce un coup parable qui touchera à `impactAt`.
 *
 * L'offre commence `cueLeadMs` avant l'impact et non à l'appel : le télégraphe
 * du balayage dure 620 ms, dont seules les 420 dernières sont réactives.
 * Allumer le signal dès le début du télégraphe donnerait 200 ms pendant
 * lesquelles appuyer *paraît* juste et ne l'est pas — la pire des leçons.
 */
export function offerParry(by: string, impactAt: number) {
  parry.offerBy = by
  parry.offerFrom = impactAt - PARRY.cueLeadMs
  parry.offerUntil = impactAt
}

/** Retire l'offre — coup annulé, ou mort de celui qui l'avait faite. */
export function cancelParry(by: string) {
  if (parry.offerBy !== by) return
  parry.offerBy = ''
  parry.offerFrom = -Infinity
  parry.offerUntil = -Infinity
}

/** Le signal doit-il être allumé ? */
export function parryOffered(now: number) {
  return now >= parry.offerFrom && now <= parry.offerUntil
}

/**
 * Le joueur appuie.
 *
 * Une seule formule, et elle produit gratuitement le comportement
 * anti-martèlement : un appui ouvre la garde puis la récupération qui la suit,
 * et un appui pendant la récupération la **relance**. Marteler à 4 Hz revient
 * donc à ne jamais sortir de la récupération.
 *
 * C'est plus simple que ce que décrivait la maquette, qui distinguait l'appui
 * « avant le signal » de l'appui « après » avec deux durées différentes. La
 * distinction était inutile : la même formule punit déjà l'anticipation, parce
 * que 260 + 450 = 710 ms dépassent le plus long télégraphe du Lynel.
 */
export function pressParry(now: number): 'guard' | 'guarding' | 'locked' {
  if (now < parry.recoveryUntil) {
    parry.recoveryUntil = now + PARRY.recoveryMs
    parry.whiffedAt = now
    return 'locked'
  }
  // Déjà en garde : un second appui ne la prolonge pas. Sans cette branche, on
  // pourrait tenir la garde ouverte indéfiniment en appuyant tous les 250 ms.
  if (now < parry.guardUntil) return 'guarding'

  parry.guardUntil = now + PARRY.windowMs
  parry.recoveryUntil = parry.guardUntil + PARRY.recoveryMs
  return 'guard'
}

/**
 * Le coup arrive : la garde le couvre-t-elle ?
 *
 * Consomme la garde en cas de succès, pour qu'une garde ne pare qu'un coup —
 * sinon les trois flèches du triple tir passeraient toutes sur un seul appui.
 */
export function consumeParry(now: number): boolean {
  if (now > parry.guardUntil) return false
  parry.guardUntil = -Infinity
  parry.recoveryUntil = -Infinity
  parry.succeededAt = now
  return true
}

/** Remet tout à plat au redémarrage d'une partie. Même rôle que `resetCombat`. */
export function resetParry() {
  parry.offerBy = ''
  parry.offerFrom = -Infinity
  parry.offerUntil = -Infinity
  parry.guardUntil = -Infinity
  parry.recoveryUntil = -Infinity
  parry.succeededAt = -Infinity
  parry.whiffedAt = -Infinity
}

/*
  Crochets de développement.

  Même raison que `__lastSwing` et `__projectiles` : la fenêtre dure 260 ms et
  le rendu headless tourne à ~1 fps. On ne peut pas *jouer* la situation, il
  faut pouvoir la poser — d'où `offer()`, qui simule une attaque parable sans
  qu'aucun ennemi n'existe.
*/
if (import.meta.env.DEV) {
  const hooks = window as unknown as Record<string, unknown>
  hooks.__parry = {
    state: parry,
    /** Annonce un coup parable qui touchera dans `inMs`. */
    offer: (inMs = 620) => offerParry('__dev', gameNow() + inMs),
  }
}
