import { describe, expect, it } from 'vitest'
import { dictionaries, LOCALES } from '../i18n'
import { BEYOND_ARENA_ENGAGE_R, BEYOND_SPAWN } from './beyond'
import { LANDMARKS } from './landmarks'
import { PLAYER } from './gameplay'
import { SKY_SPAWN } from './portal'
import { ENGAGE_R, MARSH_SPAWN } from './rotMarsh'
import { ROTUNDA_R } from './skyIsland'
import { isSiteId, SITES, SITES_BY_MAP, type Site } from './sites'
import type { MapId } from '../types/game'

/**
 * Les lieux remarquables, et les quatre choses qu'on leur demande.
 *
 * Aucune n'est une valeur : ce fichier ne vérifie pas qu'un bassin est à
 * l'origine, il vérifie qu'**une annonce en vaut la peine**. Un bandeau qui
 * s'affiche est un bandeau qui en efface un autre, et les quatre façons de
 * gâcher celui-ci sont toutes des distances — trop près d'un monument, trop
 * près d'un autre lieu, trop près du point d'arrivée, trop près du moment où
 * la bête se lève.
 */

/** Distance au sol entre deux points de la même carte. */
const between = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z)

/**
 * Où le joueur reprend la main sur chaque carte, par la porte principale.
 *
 * Les portes **secondaires** n'y sont pas, et l'omission est raisonnée : on ne
 * revient au sommet de la montagne qu'après l'avoir gravi, et au bassin du
 * Marais qu'après l'avoir vidé. Un lieu déjà découvert ne se redécouvre pas,
 * donc ces deux arrivées-là ne peuvent pas déclencher de bandeau.
 */
const ARRIVALS: Record<MapId, { x: number; z: number }> = {
  continent: { x: PLAYER.spawn[0], z: PLAYER.spawn[2] },
  sky: SKY_SPAWN,
  rot: MARSH_SPAWN,
  beyond: BEYOND_SPAWN,
}

/**
 * Le rayon dans lequel chaque arène engage son combat.
 *
 * Le gardien de la rotonde n'a pas de constante à lui : il attaque quand le
 * joueur entre dans le dallage moins une unité et demie de marge (voir
 * `Lynel.tsx`). La valeur est donc dérivée ici de la seule cote qui fasse foi,
 * le rayon de la rotonde.
 */
const ENGAGEMENTS: Partial<Record<string, number>> = {
  rotunda: ROTUNDA_R - 1.5,
  'root-basin': ENGAGE_R,
  crucible: BEYOND_ARENA_ENGAGE_R,
}

/**
 * Marche minimale entre deux annonces, en unités de monde.
 *
 * Dix unités, soit une seconde et demie de course — le personnage avance à
 * sept unités par seconde (`PLAYER.speed`). Le bandeau, lui, tient 4,6 s à
 * l'écran : deux annonces séparées de dix unités se chassent donc forcément,
 * et ce seuil ne prétend pas l'empêcher. Ce qu'il garantit est plus modeste et
 * suffisant : la première a le temps de monter — son animation d'entrée dure
 * 0,4 s — et d'être lue avant que la seconde ne la remplace.
 *
 * La paire la plus serrée du jeu est le pont de Nakano et le temple du même
 * nom, à treize unités et demie l'une de l'autre. Tout le reste est au-delà de
 * vingt.
 */
const CLEARANCE = 10

/**
 * Pas minimaux entre un point d'arrivée et la première annonce de sa carte.
 *
 * Plus court que `CLEARANCE`, et ce n'est pas un relâchement : la règle n'est
 * pas la même. Il ne s'agit plus de laisser lire un bandeau précédent — il n'y
 * en a pas — mais d'éviter qu'une annonce ne tombe dans la seconde où le voile
 * se lève, auquel cas elle se lirait comme la fin du chargement plutôt que
 * comme une trouvaille. Une seconde de marche y suffit, et la chaussée du
 * Marais en laisse neuf.
 */
const FIRST_STEPS = 8

/**
 * Vérifie que deux annonces voisines laissent au joueur le temps de lire la
 * première, quel que soit le sens d'approche.
 *
 * Le calcul est celui de la pire approche naturelle : la droite qui joint les
 * deux centres. Qui la parcourt entre dans le premier cercle à `r` de son
 * centre et dans le second à `d − r'` — l'écart vaut donc `d − r' + r`, et il
 * se mesure dans les deux sens parce qu'on peut venir des deux côtés.
 *
 * C'est la seule formule du fichier, et elle vaut mieux qu'un simple « les
 * cercles ne se recouvrent pas » : deux zones peuvent se chevaucher largement
 * sans que leurs bandeaux se marchent dessus — c'est le cas du pont de Nakano
 * et du temple du même nom, qui se recouvrent de deux unités et demie pour
 * treize et demie de marche entre les deux annonces.
 */
function announcementsApart(
  a: { x: number; z: number; radius: number },
  b: { x: number; z: number; radius: number },
) {
  const d = between(a, b)
  return {
    /** Aucun des deux centres n'est dans le cercle de l'autre. */
    nested: d <= Math.max(a.radius, b.radius),
    /** Marche entre les deux déclenchements, dans le sens le plus serré. */
    gap: Math.min(d - b.radius + a.radius, d - a.radius + b.radius),
  }
}

describe('les lieux remarquables', () => {
  it.each(SITES)('$id a un nom dans chaque langue', (site: Site) => {
    for (const locale of LOCALES) {
      expect(dictionaries[locale].ui.sites[site.id], locale).toBeTruthy()
    }
  })

  it('ne nomme jamais deux fois le même lieu', () => {
    expect(new Set(SITES.map((site) => site.id)).size).toBe(SITES.length)
  })

  /**
   * Le HUD choisit son dictionnaire sur `isSiteId` : un identifiant porté à la
   * fois par un monument et par un lieu remarquable ferait lire le nom du
   * second sous le bandeau du premier, sans que rien ne plante.
   */
  it('n emprunte aucun identifiant de monument', () => {
    for (const landmark of LANDMARKS) {
      expect(isSiteId(landmark.id), landmark.id).toBe(false)
    }
  })

  it('range chaque lieu sur sa carte, et n en perd aucun', () => {
    const grouped = Object.values(SITES_BY_MAP).flat()
    expect(grouped).toHaveLength(SITES.length)
    for (const [map, sites] of Object.entries(SITES_BY_MAP)) {
      for (const site of sites) expect(site.map, site.id).toBe(map)
    }
  })

  /**
   * Deux annonces voisines, et la règle qui les sépare : **on ne doit jamais
   * se tenir sur l'une en déclenchant l'autre**, ni passer de l'une à l'autre
   * avant d'avoir eu le temps de lire la première.
   *
   * Les zones ont le droit de se recouvrir — le bassin de racines et l'Arbre
   * blafard se touchent d'une unité, et c'est sans conséquence puisqu'un combat
   * de boss sépare les deux passages. Ce qui compte est la marche entre les
   * deux déclenchements ; voir `announcementsApart`.
   */
  it.each(SITES)('$id laisse à ses voisins de carte le temps d être lus', (site: Site) => {
    for (const other of SITES_BY_MAP[site.map]) {
      if (other.id === site.id) continue
      const { nested, gap } = announcementsApart(site, other)
      expect(nested, other.id).toBe(false)
      expect(gap, other.id).toBeGreaterThan(CLEARANCE)
    }
  })

  /**
   * Les monuments du continent gardent la priorité sur leur propre parvis.
   *
   * Le pont de Nakano et le Temple de Nakano se chevauchent de deux unités et
   * demie, et c'est voulu : les deux annonces tombent tout de même à treize
   * unités et demie d'intervalle sur la diagonale d'approche, dans l'ordre où
   * on les rencontre. C'est cette marche-là que le test mesure, et non un
   * recouvrement de cercles qui ne dirait rien de ce que le joueur lit.
   */
  it.each(SITES_BY_MAP.continent)('$id ne marche pas sur un monument', (site: Site) => {
    for (const landmark of LANDMARKS) {
      const { nested, gap } = announcementsApart(site, {
        ...landmark,
        radius: landmark.discoverRadius,
      })
      expect(nested, landmark.id).toBe(false)
      expect(gap, landmark.id).toBeGreaterThan(CLEARANCE)
    }
  })

  /**
   * Aucun lieu ne se découvre à l'instant où le joueur reprend la main.
   *
   * Une annonce déclenchée au point d'arrivée se lit comme la suite de l'écran
   * de chargement, pas comme une trouvaille. Il en faut donc quelques pas —
   * voir `FIRST_STEPS`.
   */
  it.each(SITES)('$id se mérite d au moins quelques pas', (site: Site) => {
    const arrival = ARRIVALS[site.map]
    expect(between(site, arrival)).toBeGreaterThan(site.radius + FIRST_STEPS)
  })

  /**
   * Les trois arènes se nomment **avant** que leur occupante ne se lève.
   *
   * C'est l'ordre qui rend les deux lisibles : on apprend où l'on arrive, puis
   * ce qui y attend. Inversé, le bandeau tombe pendant que la barre de vie du
   * boss monte, et personne ne le lit.
   */
  it.each(SITES.filter((site) => ENGAGEMENTS[site.id] !== undefined))(
    '$id s annonce avant le combat',
    (site: Site) => {
      expect(site.radius).toBeGreaterThan(ENGAGEMENTS[site.id]!)
    },
  )
})
