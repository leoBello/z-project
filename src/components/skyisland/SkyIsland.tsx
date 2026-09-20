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
import { SummitChests } from './SummitChests'
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

        **Il est là dès l'arrivée sur l'île, et non à l'accomplissement de
        l'épreuve.** C'est la herse qui interdit le promontoire, pas l'absence
        de la bête : elle n'a donc aucune raison d'attendre dans les coulisses.
        Ce qu'on y gagne est concret — elle s'inscrit au registre des ennemis,
        donc son point paraît sur la minimap au sommet de la montagne dès la
        première seconde. Le joueur sait qu'il y a quelque chose là-haut avant
        de savoir comment y monter, et c'est exactement ce que doit faire une
        porte fermée.

        Elle ne coûte rien à laisser tourner : à cent trente unités du point
        d'arrivée, elle est hors de son rayon de détection (14), donc au repos
        à son poste. Et le calque de combat ne montre une barre de vie que pour
        une bête engagée ou blessée récemment — celle-ci n'affiche rien.

        Le même composant que les quatre autres, du reste : son rôle suffit à en
        faire ce qu'elle est. Elle n'engage pas de combat d'arène et n'a pas de
        barrières ; son arène, c'est le plateau, et la seule fuite est une spire
        de quatre-vingts unités que la bête ne descendra pas. Le lieu enferme
        mieux qu'un voile.
      */}
      {goldenStanding && (
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

      {/*
        Les deux coffres du sommet, qui paraissent avec ce portail-là et pour la
        même raison : la bête est tombée.

        Ils l'encadrent à dix unités, et cette distance est **imposée** par la
        règle d'interaction — le portail l'emporte sur le coffre, et son anneau
        réagit à sept unités. Posés à son pied, les deux coffres auraient été
        visibles et inouvrables. Voir `summitChest`.
      */}
      <SummitChests />

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
