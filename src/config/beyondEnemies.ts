import type { EnemyKind, EnemySpawn } from '../types/game'
import {
  BEYOND,
  BEYOND_ARENA,
  SANCTUARY,
  beyondBiome,
  beyondHeight,
  beyondSlope,
} from './beyond'
import type { LynelLeash } from './lynel'
import { seededRandom } from './world'

/**
 * Le peuplement de l'Outremonde — et il n'a rien à voir avec celui du continent.
 *
 * Là-bas, vingt-six bêtes posées loin les unes des autres décrivent un monde
 * habité qu'on traverse : on en croise une, on la combat, on repart. Ici on
 * cherche le contraire — une **densité**, parce que la carte existe pour un défi
 * chronométré de deux minutes, et qu'un défi où l'on passe quarante secondes à
 * chercher sa prochaine cible n'est pas un défi mais une promenade.
 *
 * Trois chiffres disent tout : le continent pose 26 ennemis sur 200 unités de
 * côté ; celui-ci en pose environ 72, sur la même grille, et il y ajoute cinq
 * Lynels et une Malenia. C'est le même monde, trois fois plus peuplé.
 *
 * **Ce fichier appartient au fragment de l'Outremonde.** Il importe
 * `config/lynel.ts`, c'est-à-dire la configuration d'un boss ; rien du tronc
 * commun ne doit l'importer, sous peine de tirer tout ça dans le bundle
 * d'accueil. La règle est celle des trois autres fragments — voir l'en-tête de
 * `components/rot/preload.ts`.
 */

/* --- Les cinq Lynels -------------------------------------------------------- */

/**
 * Un poste de Lynel : où il monte la garde, et jusqu'où il va.
 *
 * L'altitude n'est pas écrite à la main mais **lue dans le relief**, comme les
 * culées du pont de Nakano. Un poste dont la cote serait une constante
 * flotterait — ou s'enterrerait — au premier réglage du bruit, et il n'y a
 * aucune raison de tenir à la main un nombre que le monde sait déjà.
 */
interface BeyondPost {
  id: string
  x: number
  z: number
  /** Ce que la bête garde, pour mémoire. Ne sert qu'à se relire. */
  ground: string
}

/**
 * Les cinq postes, un par grande région du monde.
 *
 * Ils sont **choisis et non tirés**, contrairement aux petites bêtes, et pour
 * deux raisons qui vont ensemble. D'abord un Lynel occupe une zone — il a une
 * laisse de dix-huit unités, il faut du plat, et un tirage aléatoire l'aurait
 * un jour posé sur un flanc où il glisse. Ensuite ils sont les **repères** de la
 * carte : cinq points fixes qu'on apprend à situer, c'est ce qui remplace ici
 * les monuments du continent. Une carte de défi doit se mémoriser.
 *
 * Leurs positions ont été mesurées sur le relief avant d'être écrites — pente
 * sous 0,35 pour les cinq, et pas un qui tombe dans la zone franche ni dans
 * l'arène. Le plus proche du sanctuaire est celui de la prairie du sud-est, à
 * quarante-deux unités : c'est le premier qu'on rencontre, et il est encore
 * assez loin pour qu'on le voie venir.
 */
const POSTS: readonly BeyondPost[] = [
  { id: 'beyond-lynel-meadow', x: 40, z: 62, ground: 'prairie du sud-est' },
  { id: 'beyond-lynel-jungle', x: -52, z: 22, ground: 'jungle de l’ouest' },
  { id: 'beyond-lynel-badlands', x: 54, z: 26, ground: 'terres arides de l’est' },
  { id: 'beyond-lynel-island', x: 74, z: 54, ground: 'île du large' },
  { id: 'beyond-lynel-mountain', x: 48, z: -18, ground: 'contrefort du nord-est' },
]

/**
 * Le poste du **Lynel doré**, et pourquoi c'est celui-là.
 *
 * Le contrefort du nord-est est le plus éloigné des cinq : cent quatre unités du
 * Sanctuaire, soit près d'une minute de course aller. C'est le seul poste dont
 * l'aller-retour ne tient pas dans un défi de deux minutes sans y sacrifier tout
 * le reste — donc le seul où la question « est-ce que j'y vais ? » se pose
 * vraiment. Une grosse récompense posée à vingt unités de la ligne de départ
 * n'aurait été qu'un passage obligé.
 *
 * Il est monté en `wild-golden` : robe d'or, seuils de phase du doré,
 * cinquante-quatre points de vie et un cœur de dégâts en plus. C'est la même
 * bête que celle du sommet de la Montagne de l'Ouest — sauf que sa mort, ici,
 * ne clôt aucune quête et ne donne aucun réceptacle. Elle vaut deux cent
 * cinquante points, et rien d'autre.
 */
export const GOLDEN_POST_ID = 'beyond-lynel-mountain'

/**
 * Rayon de la laisse d'un Lynel de l'Outremonde.
 *
 * Bien plus large que celle du gardien de la rotonde, qui tient sur son dallage
 * de 11,5 : ici il n'y a pas d'arène, pas de barrière, et une bête clouée à un
 * disque aurait eu l'air en cage au milieu d'une plaine. Dix-huit unités, c'est
 * assez pour qu'elle charge, qu'elle contourne et qu'elle poursuive — et assez
 * peu pour qu'on puisse la semer en courant, ce qui est la seule échappatoire
 * qu'offre cette carte.
 */
const POST_LEASH_R = 18

/** Un poste résolu : le point où la bête se tient, et l'anneau dont elle ne sort pas. */
export interface BeyondLynelPost {
  id: string
  home: readonly [number, number, number]
  leash: readonly LynelLeash[]
}

/**
 * Les cinq postes, altitudes lues dans le relief.
 *
 * Calculé une fois à l'import du module, comme `TRIAL_POSTS` de l'île : cinq
 * échantillons de bruit, et le résultat ne change jamais.
 */
export const BEYOND_LYNEL_POSTS: readonly BeyondLynelPost[] = POSTS.map((post) => ({
  id: post.id,
  home: [post.x, beyondHeight(post.x, post.z), post.z] as const,
  leash: [{ x: post.x, z: post.z, min: 0, max: POST_LEASH_R }],
}))

/* --- Les petites bêtes ------------------------------------------------------ */

/**
 * Nombre d'ennemis visé.
 *
 * *Visé*, et pas atteint : le générateur abandonne au bout de ses essais, et il
 * en pose environ soixante-douze — la distance minimale entre deux bêtes est la
 * contrainte qui mord, pas le relief. C'est `beyondEnemySpawns().length` qui dit
 * le vrai nombre, jamais cette constante, exactement comme sur le continent.
 */
const ENEMY_COUNT = 78

/**
 * Essais maximum. Trois fois plus que sur le continent, et pour cause : on pose
 * trois fois plus de bêtes, sur une carte qui a une zone franche et une arène en
 * plus à éviter. Le coût est de l'ordre de soixante mille évaluations de bruit,
 * soit celui de la carte d'écume — payé une fois, dans un fragment qu'on ne
 * télécharge qu'en fin de partie.
 */
const MAX_ATTEMPTS = 12000

/** Rien ne se pose à moins de ça du Sanctuaire. Voir la note de la trêve. */
const SANCTUARY_KEEP_OUT = 38
/** Ni à moins de ça du cœur : l'arène appartient à la Déchue, et à elle seule. */
const ARENA_KEEP_OUT = BEYOND_ARENA.radius + 10
/** Ni dans la cour d'un Lynel : il les bousculerait, et sa charge les traverserait. */
const POST_KEEP_OUT = 20
/** Distance minimale entre deux bêtes. Deux collées se gênent et se poussent. */
const SPACING = 9
/** Au-delà de cette pente, l'ennemi glisserait : on ne le pose pas là. */
const MAX_SPAWN_SLOPE = 0.5

/**
 * Place les ennemis sur la carte.
 *
 * Même méthode que le continent — tirage uniforme, puis filtrage — avec deux
 * règles de plus, et elles disent toutes les deux la même chose : **le monde
 * commence où le sanctuaire finit.** Rien ne se pose près de la zone franche,
 * rien ne se pose dans l'arène. Le reste appartient aux bêtes.
 *
 * La répartition par biome n'est pas cosmétique, c'est la lisibilité du défi :
 * les Octoroks tirent de loin et tiennent les terrains ouverts — plage, îles,
 * hauteurs — où on les voit venir ; les Moblins chargent, et ils tiennent les
 * couverts — jungle, terres arides — où ils tombent dessus. Le joueur apprend
 * donc où il court en apprenant la carte, et c'est ce qui fait qu'un second
 * essai vaut mieux qu'un premier.
 */
function generate(): EnemySpawn[] {
  // Une graine à elle, comme le semis : deux générateurs de la même carte qui
  // partiraient du même état tireraient la même suite, et les bêtes se
  // poseraient exactement sur les touffes d'herbe.
  const random = seededRandom(0x0ddba11)
  const spawns: EnemySpawn[] = []
  const margin = BEYOND.half - 12

  let attempts = 0
  while (spawns.length < ENEMY_COUNT && attempts < MAX_ATTEMPTS) {
    attempts++
    const x = (random() * 2 - 1) * margin
    const z = (random() * 2 - 1) * margin
    // Tiré **avant** les rejets, comme sur le continent : la graine étant fixe,
    // consommer le même nombre de valeurs à chaque tour est ce qui rend le
    // peuplement reproductible d'une session à l'autre.
    const roll = random()

    const height = beyondHeight(x, z)
    if (height < BEYOND.waterLevel + 0.3) continue
    /*
      Rien au-dessus de la neige, et ce n'est pas une règle de vraisemblance.

      Les sommets montent à trente-trois unités, avec des pentes que le joueur ne
      peut pas gravir : une bête posée là-haut serait **injoignable**, et sur une
      carte dont le compteur d'ennemis est le sujet, une cible injoignable est un
      bug qu'on ne comprend qu'après avoir fait le tour de la montagne.
    */
    if (height > BEYOND.snowLevel) continue
    if (beyondSlope(x, z) > MAX_SPAWN_SLOPE) continue
    if (Math.hypot(x - SANCTUARY.x, z - SANCTUARY.z) < SANCTUARY_KEEP_OUT) continue
    if (Math.hypot(x - BEYOND_ARENA.x, z - BEYOND_ARENA.z) < ARENA_KEEP_OUT) continue
    if (POSTS.some((post) => Math.hypot(x - post.x, z - post.z) < POST_KEEP_OUT)) continue
    if (spawns.some((s) => Math.hypot(s.position[0] - x, s.position[2] - z) < SPACING)) continue

    const biome = beyondBiome(x, z, height)
    let kind: EnemyKind
    if (biome === 'beach' || biome === 'island' || biome === 'shallows') kind = 'octorok'
    else if (biome === 'jungle' || biome === 'badlands') kind = roll < 0.7 ? 'moblin' : 'octorok'
    else if (biome === 'mountain') kind = roll < 0.6 ? 'moblin' : 'octorok'
    else kind = roll < 0.5 ? 'moblin' : 'octorok'

    spawns.push({
      id: `beyond-${kind}-${spawns.length}`,
      kind,
      position: [x, height, z],
      // Rayon de patrouille plus serré que sur le continent (6 à 11) : la carte
      // est dense, et des bêtes qui dérivent loin de leur point finissent par
      // s'agglutiner là où le joueur est passé, laissant des régions vides.
      radius: 5 + random() * 4,
    })
  }

  return spawns
}

/**
 * Le peuplement, tiré **une seule fois** pour toute la session.
 *
 * Mémoïsé au module et non recalculé à chaque partie : la graine est fixe, le
 * résultat aussi, et le composant remonte à chaque voyage vers cette carte.
 * Recalculer aurait coûté soixante mille évaluations de bruit à chaque
 * franchissement de l'anneau — c'est-à-dire pendant le voile de transition, là
 * où ça se voit.
 */
let spawns: EnemySpawn[] | null = null

export function beyondEnemySpawns(): EnemySpawn[] {
  if (spawns === null) spawns = generate()
  return spawns
}
