import { useState } from 'react'
import { MARSH_PORTAL } from '../../config/rotMarsh'
import { useGameStore } from '../../store/useGameStore'
import { Malenia } from '../Malenia'
import { Portal } from '../environment/Portal'
import { Arena } from './Arena'
import { Flora } from './Flora'
import { Marsh } from './Marsh'
import { PaleTree } from './PaleTree'
import { RotBlight } from './RotBlight'
import { Roots } from './Roots'
import { useMarshMaterials } from './materials'

/**
 * Le Marais d'Aeonia — le point d'entrée du fragment chargé à la demande.
 *
 * Tout ce que ce composant importe entre dans le même morceau de bundle, et
 * c'est le but : l'accueil du site ne télécharge ni l'île ni le Marais. Le
 * découpage est fait par Vite à partir de l'`import()` de `preload.ts` ; il n'y
 * a rien à configurer, mais il y a une règle à tenir — voir l'en-tête de ce
 * fichier-là.
 *
 * L'export est **par défaut**, parce que `React.lazy` n'accepte que ça.
 *
 * Les matériaux sont créés ici, une fois, et descendus en props : même
 * discipline que `SkyIsland.tsx`. Chaque pièce pourrait construire les siens,
 * elle en fabriquerait alors un jeu complet, et la carte en compterait cinq ou
 * six exemplaires pour un résultat identique.
 *
 * **L'ordre de lecture de cette carte est son seul contenu.** On arrive au sud,
 * dos au portail, face à un arbre mort de cent vingt unités. Entre les deux, du
 * marais qu'on ne peut pas traverser impunément et trois racines qui le
 * franchissent. Au pied de l'arbre, un bassin. Il n'y a rien d'autre, et il n'y
 * a rien à expliquer : c'est un chemin vers un combat, pas une carte
 * d'exploration.
 */
export default function RotMarsh() {
  const materials = useMarshMaterials()
  /*
    Qui était debout **à l'arrivée sur la carte**, et non à cette frame-ci.

    L'instantané est pris une fois au montage, exactement comme celui du gardien
    de la rotonde, et pour la même raison : le Marais se démonte quand on rentre
    par le portail, et le monter sur l'état vivant l'aurait emportée à la frame
    suivant sa chute — sans l'écrasement, sans la détente, sans la fumée. Un
    boss retire lui-même son corps ; personne n'a à le faire pour lui.

    `maleniaSlainAt` et non `bossState` : celui-ci décrit le gardien de la
    rotonde, et il vaut déjà `defeated` quand on arrive ici. S'en servir l'aurait
    fait naître morte.
  */
  const [standing] = useState(() => useGameStore.getState().maleniaSlainAt === null)

  return (
    <>
      {/* Il ne rend rien : c'est le moteur de la jauge de pourriture, monté
          avec le Marais et avec lui seul. Voir son en-tête. */}
      <RotBlight />

      <Marsh materials={materials} />
      <Roots materials={materials} />
      <Flora materials={materials} />
      <PaleTree materials={materials} />
      <Arena materials={materials} />

      {/*
        Elle attend dans le bassin, **debout dès l'arrivée sur la carte**.

        Même raisonnement que le Lynel doré sur son plateau : ce qui doit être
        mérité, c'est le passage, pas l'existence de l'adversaire. Elle s'inscrit
        donc au registre des ennemis dès la première seconde, et son point paraît
        sur la minimap au pied de l'arbre — le joueur sait qu'il y a quelque chose
        là-bas avant de savoir ce que c'est.

        Elle ne coûte rien à laisser tourner : à cent trente unités du portail
        d'arrivée, elle est hors de son rayon d'engagement (15), donc immobile au
        centre du bassin. Le calque de combat ne montre une barre de vie que pour
        une bête engagée ou blessée récemment — elle n'affiche rien.

        Le montage est conditionné à sa mort, comme le gardien de la rotonde :
        l'instantané est pris **au montage de la carte** et non à la frame
        courante, sans quoi elle disparaîtrait en pleine mort au lieu de retirer
        son corps elle-même.
      */}
      {standing && <Malenia />}

      {/*
        L'anneau du retour, qui ramène **au sommet** de la Montagne de l'Ouest.

        Pas au continent, bien qu'il l'ait fait dans l'autre sens jusqu'ici : une
        porte ramène là d'où l'on est parti, c'est même à peu près la seule chose
        qu'on attende d'une porte. Le joueur est arrivé du plateau du Lynel doré,
        il y retourne — et de là, le portail voisin le ramène chez lui s'il le
        souhaite.

        `openedAt` vaut zéro, donc l'anneau est déjà déplié à la première frame :
        le joueur vient d'en sortir, le voir se percer derrière lui n'aurait aucun
        sens. Même valeur et même raison que le portail d'arrivée de l'île.
      */}
      <Portal at={MARSH_PORTAL} openedAt={0} to="sky" />
    </>
  )
}
