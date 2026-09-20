import { useState } from 'react'
import {
  GOLDEN_HP,
  GOLDEN_ID,
  GOLDEN_LEASH,
  GOLDEN_POST,
  TRIAL_HP,
  TRIAL_POSTS,
} from '../../config/lynel'
import { SKY_PORTAL } from '../../config/portal'
import { TRIAL_COUNT } from '../../config/quests'
import { SUMMIT_PORTAL } from '../../config/skyMountain'
import { useGameStore } from '../../store/useGameStore'
import { Portal } from '../environment/Portal'
import { Lynel } from '../Lynel'
import { ArenaGate } from './ArenaGate'
import { ROAD_CHEST } from '../../config/chests'
import { Causeway } from './Causeway'
import { Mountain } from './Mountain'
import { RotundaChest } from './RotundaChest'
import { SkyChest } from './SkyChest'
import { RotundaReward } from './RotundaReward'
import { Flora } from './Flora'
import { Ruins } from './Ruins'
import { SkyTerrain } from './Terrain'
import { SkyWater } from './Water'

/**
 * L'Île Céleste — le point d'entrée du fragment chargé à la demande.
 *
 * Tout ce que ce composant importe entre dans le même morceau de bundle, et
 * c'est le but : l'accueil du site ne télécharge pas l'île. Le découpage est
 * fait par Vite à partir de l'`import()` de `preload.ts` ; il n'y a rien à
 * configurer, mais il y a une règle à tenir — voir l'en-tête de ce fichier-là.
 *
 * L'export est **par défaut**, parce que `React.lazy` n'accepte que ça.
 *
 * Les matériaux sont créés ici, une fois, et descendus en props. Chaque pièce
 * pourrait les construire de son côté ; elle en fabriquerait alors un jeu
 * complet, et l'île en compterait quatre ou cinq exemplaires pour un résultat
 * identique. C'est aussi ce qui garantit qu'une retouche de la pierre se voie
 * partout à la fois.
 */
export default function SkyIsland() {
  const defeated = useGameStore((state) => state.bossState === 'defeated')
  /*
    L'épreuve accomplie ouvre deux choses d'un coup : la herse de la voie, et la
    bête qui attend au bout. C'est **la même lecture** qui pilote les deux, pas
    deux drapeaux à tenir d'accord — une herse levée sur une montagne vide, ou
    l'inverse, sont des états que rien ne peut produire ici.
  */
  const trialDone = useGameStore((state) => state.trialSlain.length >= TRIAL_COUNT)
  /*
    Quand le doré est tombé, ou `null` s'il tient encore : c'est directement la
    prop d'ouverture du portail du sommet.

    Rien à mémoriser ici, et c'est le point — l'instant vit dans le store (voir
    `goldenSlainAt`), donc l'anneau se perce une fois, à la chute, puis reste
    déplié à toutes les visites suivantes. Un état local aurait rejoué
    l'ouverture à chaque retour sur l'île.
  */
  const summitOpenedAt = useGameStore((state) => state.goldenSlainAt)

  /*
    Qui était déjà mort **à l'arrivée sur l'île**, et non qui est mort à cette
    frame-ci.

    Les deux instantanés ci-dessous sont pris une fois au montage, et c'est ce
    qui distingue « ne pas ressusciter » de « disparaître en pleine mort ». Le
    gardien monté sans condition ressuscitait : l'île se démonte quand on rentre
    au continent, et un aller-retour reconstruisait un Lynel neuf, ses
    trente-six points de vie compris, dans une rotonde dont les barrières étaient
    déjà ouvertes et le réceptacle déjà pris. Mais le démonter sur l'état *vivant*
    du store aurait été pire : il tombe, `endBossFight` passe à `defeated`, et
    React l'emporterait à la frame suivante — sans l'écrasement, sans la détente,
    sans la fumée. Une bête retire elle-même son corps, cent cinquante
    millisecondes plus tard (voir `DEATH_REMOVE_MS`) ; personne n'a à le faire
    pour elle.
  */
  const [guardianStanding] = useState(() => useGameStore.getState().bossState !== 'defeated')
  const [posts] = useState(() => {
    const slain = useGameStore.getState().trialSlain
    return TRIAL_POSTS.filter((post) => !slain.includes(post.id))
  })
  /** Même instantané, et pour la même raison, pour le doré. */
  const [goldenStanding] = useState(
    () => useGameStore.getState().goldenSlainAt === null,
  )

  return (
    <>
      <SkyTerrain />
      <Ruins />
      <SkyWater />
      <Flora />

      {/* Le jumeau de celui de Nakano, au point d'arrivée. Le même composant :
          deux portails qui divergeraient au premier réglage de l'anneau
          seraient un défaut qu'on ne verrait qu'en faisant l'aller-retour. */}
      <Portal at={SKY_PORTAL} openedAt={ALREADY_OPEN} />

      {/* Le gardien de la rotonde. Il s'inscrit lui-même au registre des
          ennemis, donc à la minimap et au calque de combat : rien à lui passer. */}
      {guardianStanding && <Lynel />}

      {/*
        L'épreuve : trois Lynels plantés sur la couronne du jardin, à trente-six
        unités les uns des autres pour un rayon de détection de quatorze. La
        distance n'est pas décorative — c'est elle qui permet de les tirer un par
        un, et donc qui rend l'épreuve jouable (voir `TRIAL_POSTS`).

        Le même composant que le gardien, à quatre props près : un boss qui
        mourrait autrement que ses semblables serait un boss dont la mort se lit
        moins bien, pas un boss plus important.
      */}
      {defeated &&
        posts.map((post) => (
          <Lynel
            key={post.id}
            id={post.id}
            home={post.home}
            leash={post.leash}
            hp={TRIAL_HP}
            role="trial"
          />
        ))}
      {/*
        La montagne de l'ouest, et la voie qui y mène.

        Elles sont là **dès l'arrivée**, herse baissée, exactement comme le
        coffre de la Voie : ce qui doit être mérité, c'est le passage, pas
        l'existence du lieu. Une montagne qui se matérialise à la fin de
        l'épreuve n'aurait jamais été une promesse, seulement une récompense.
      */}
      <Causeway />
      <Mountain />

      {/*
        Le Lynel doré, sur le plateau du sommet.

        Le même composant que les quatre autres — son rôle suffit à en faire ce
        qu'il est. Il n'engage pas de combat d'arène et n'a pas de barrières :
        son arène, c'est le plateau, et la seule fuite est une spire de
        quatre-vingts unités que la bête ne descendra pas. Le lieu enferme
        mieux qu'un voile.
      */}
      {trialDone && goldenStanding && (
        <Lynel
          id={GOLDEN_ID}
          home={GOLDEN_POST}
          leash={GOLDEN_LEASH}
          hp={GOLDEN_HP}
          role="golden"
        />
      )}

      {/*
        Le troisième portail, au sommet, une fois la bête tombée.

        Le même composant que les deux autres, et il ramène au continent sans
        une ligne de code de plus : `triggerInteraction` envoie vers l'autre
        carte que la carte courante, quelle que soit celle des trois portes
        qu'on franchit. C'est ce qui évite de redescendre quatre-vingts unités
        de spire, un pont et la moitié d'une île pour rentrer — et une
        récompense qui fait gagner du temps se sent autant qu'un cœur.
      */}
      <Portal at={SUMMIT_PORTAL} openedAt={summitOpenedAt} />

      {/* Elles ne paraissent que pendant le combat : voir `bossState`. */}
      <ArenaGate />
      {/* Les deux récompenses du gardien, qui ne paraissent qu'après sa chute :
          le réceptacle là où le corps est tombé, le coffre dans l'axe de la
          travée écroulée. Montés ici et non dans `Ruins`, pour la même raison
          que les coffres du continent sont montés à plat dans `Landmarks` : la
          ruine décrit une pierre, ceux-ci sont un état de partie. */}
      <RotundaReward />
      <RotundaChest />
      {/* Le coffre de la Voie, lui, est là dès l'arrivée et ne dépend de rien :
          c'est tout son intérêt, on s'arme **avant** le gardien. Voir
          `ROAD_CHEST`. */}
      <SkyChest chest={ROAD_CHEST} />
    </>
  )
}

/**
 * Instant d'ouverture du portail du retour.
 *
 * `0` et non l'horloge courante : la valeur ne sert qu'à l'animation de
 * dépliement, qui la compare au temps de jeu. Un zéro la place très loin dans le
 * passé, donc l'anneau est déjà déplié à la première frame — ce qu'on veut,
 * puisque le joueur vient d'en sortir. Le voir se percer derrière soi n'aurait
 * aucun sens.
 */
const ALREADY_OPEN = 0
