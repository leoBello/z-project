import { useState } from 'react'
import { TRIAL_HP, TRIAL_POSTS } from '../../config/lynel'
import { SKY_PORTAL } from '../../config/portal'
import { useGameStore } from '../../store/useGameStore'
import { Portal } from '../environment/Portal'
import { Lynel } from '../Lynel'
import { ArenaGate } from './ArenaGate'
import { ROAD_CHEST } from '../../config/chests'
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
