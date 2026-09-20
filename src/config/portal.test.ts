import { describe, expect, it } from 'vitest'
import { BEYOND_PORTAL } from './beyond'
import { FEET_TO_CENTER } from './capsule'
import {
  PORTAL,
  PORTAL_NEAR_RADIUS,
  SKY_PORTAL,
  SKY_SPAWN,
  arrivalFor,
  arrivalYaw,
} from './portal'
import { MARSH_BEYOND_PORTAL, MARSH_PORTAL } from './rotMarsh'
import { SUMMIT_PORTAL } from './skyMountain'
import type { MapId } from '../types/game'

/**
 * Les six anneaux du jeu, et la seule chose qu'on leur demande : **ramener là
 * d'où l'on vient**.
 *
 * Le défaut que ces tests ferment s'est produit trois fois, sur trois portes
 * différentes, et il est chaque fois passé inaperçu à la relecture : la carte
 * d'arrivée avait un point d'arrivée *général*, l'anneau franchi n'était pas
 * celui-là, et le joueur ressortait à cent trente unités et une montagne de la
 * porte qu'il venait de prendre. Rien ne plante, rien ne s'affiche de travers —
 * il faut faire l'aller-retour pour s'en apercevoir.
 *
 * La table ci-dessous recopie les destinations déclarées par les `<Portal to=…>`
 * des quatre cartes, et c'est sa seule faiblesse : elle ne se dérive pas du
 * rendu. Ce qu'elle vérifie, en revanche, ne peut pas se vérifier ailleurs — la
 * correspondance entre une **position** d'anneau et un **point d'arrivée**, qui
 * vivent dans deux fichiers que rien n'oblige à se parler.
 */
interface Ring {
  /** La carte qui porte l'anneau. */
  on: MapId
  /** Où il mène. */
  to: MapId
  /** Son nom, pour que l'échec dise lequel. */
  name: string
  at: { x: number; y: number; z: number; yaw: number }
}

const RINGS: readonly Ring[] = [
  { on: 'continent', to: 'sky', name: 'Nakano', at: PORTAL },
  { on: 'sky', to: 'continent', name: 'la prairie', at: SKY_PORTAL },
  { on: 'sky', to: 'rot', name: 'le sommet', at: SUMMIT_PORTAL },
  { on: 'rot', to: 'sky', name: 'la chaussée', at: MARSH_PORTAL },
  { on: 'rot', to: 'beyond', name: 'le bassin', at: MARSH_BEYOND_PORTAL },
  {
    on: 'beyond',
    to: 'rot',
    name: 'le Sanctuaire',
    // Le seul des six qui n'ait pas de cap à lui : l'Outremonde n'a qu'une
    // porte, et le joueur en sort plein nord — voir `BEYOND_ARRIVAL_YAW`.
    at: { ...BEYOND_PORTAL, yaw: 0 },
  },
]

/**
 * Le dénivelé toléré entre un anneau et son point de sortie — voir le test qui
 * s'en sert. Mesuré sur le raccord de la terrasse de Nakano, le seul du jeu.
 */
const TERRACE_DROP = 3

/** L'anneau de `map` qui ramène vers `from`, s'il existe. */
function ringBackTo(map: MapId, from: MapId) {
  return RINGS.find((ring) => ring.on === map && ring.to === from)
}

describe('les portails, dans les deux sens', () => {
  it.each(RINGS)('l anneau de $name a un jumeau qui ramène', (ring) => {
    expect(ringBackTo(ring.to, ring.on)).toBeDefined()
  })

  it.each(RINGS)('franchir celui de $name dépose devant son jumeau', (ring) => {
    const twin = ringBackTo(ring.to, ring.on)!
    const arrival = arrivalFor(ring.to, ring.on)

    /*
      La distance à l'anneau du retour, et le seuil n'est pas choisi : c'est
      exactement le rayon où la touche d'interaction propose de le franchir.
      Au-delà, le joueur atterrit devant une porte qui ne répond pas — ce qui
      est précisément le symptôme qu'on cherche à interdire.
    */
    const gap = Math.hypot(arrival.x - twin.at.x, arrival.z - twin.at.z)
    expect(gap).toBeLessThanOrEqual(PORTAL_NEAR_RADIUS)
    // Et pas *sur* l'anneau non plus : on ne réapparaît pas dans la géométrie
    // qu'on vient de franchir.
    expect(gap).toBeGreaterThan(1)
  })

  it.each(RINGS)('on sort de celui de $name dos à l anneau', (ring) => {
    const twin = ringBackTo(ring.to, ring.on)!
    const arrival = arrivalFor(ring.to, ring.on)
    const yaw = arrivalYaw(ring.to, ring.on)

    /*
      Le cap du joueur et le vecteur « anneau → point d'arrivée » doivent aller
      dans le même sens : c'est ce que veut dire « sortir d'une porte ». Un
      produit scalaire positif suffit — on ne demande pas au cap d'être
      exactement celui de l'écartement, seulement de ne pas regarder en arrière.
    */
    const away = { x: arrival.x - twin.at.x, z: arrival.z - twin.at.z }
    const facing = { x: Math.sin(yaw), z: Math.cos(yaw) }
    expect(away.x * facing.x + away.z * facing.z).toBeGreaterThan(0)
  })

  it.each(RINGS)('on arrive posé au sol devant celui de $name', (ring) => {
    const twin = ringBackTo(ring.to, ring.on)!
    const arrival = arrivalFor(ring.to, ring.on)
    const foot = twin.at.y + FEET_TO_CENTER

    /*
      **On ne flotte pas.** Rien ne justifie d'arriver au-dessus du pied de
      l'anneau : les cinq anneaux posés sur du plat y sont exactement, et le
      sixième est plus bas, jamais plus haut.
    */
    expect(arrival.y).toBeLessThan(foot + 0.05)

    /*
      **Et on ne s'enfonce pas.** Le plancher est large, et il faut dire
      pourquoi : quatre des six sorties tombent au pied exact de leur anneau,
      mais celle de Nakano est dans le raccord de la terrasse du temple, où
      l'altitude est relevée sur le relief réel — le sol y perd un peu plus de
      deux unités sur les trois qui séparent l'anneau du point de sortie. C'est
      la seule dénivellation du jeu entre une porte et sa sortie, et elle est
      voulue ; ce que ce plancher interdit, c'est qu'une sortie se retrouve un
      jour sous le sol ou dans le vide, ce qui se compte en dizaines d'unités.
    */
    expect(arrival.y).toBeGreaterThan(foot - TERRACE_DROP)
  })
})

describe('les deux cartes à deux portes', () => {
  /*
    Le Marais et l'Île Céleste ont chacune deux anneaux, et c'est tout l'objet
    du second paramètre d'`arrivalFor`. Ces deux tests-ci disent ce que les
    précédents ne disent pas : que l'origine **change** réellement le résultat.
    Sans eux, une exception supprimée par mégarde ferait retomber les deux
    portes sur la même arrivée, et la moitié des tests ci-dessus passerait
    encore.
  */
  it('le Marais dépose à deux endroits selon la porte prise', () => {
    expect(arrivalFor('rot', 'sky')).not.toEqual(arrivalFor('rot', 'beyond'))
  })

  it('l Île Céleste aussi', () => {
    expect(arrivalFor('sky', 'continent')).not.toEqual(arrivalFor('sky', 'rot'))
  })

  it('la montagne ramène au sommet et non dans la prairie', () => {
    const arrival = arrivalFor('sky', 'rot')

    // Le plateau est vingt unités au-dessus de la prairie, et cent trente
    // unités à l'ouest : si le retour du Marais repassait par l'arrivée
    // générale de l'île, c'est ici que ça se verrait.
    expect(arrival.y).toBeGreaterThan(SUMMIT_PORTAL.y)
    expect(Math.hypot(arrival.x - SKY_SPAWN.x, arrival.z - SKY_SPAWN.z)).toBeGreaterThan(100)
  })
})
