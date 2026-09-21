import { useState } from 'react'
import { MARSH_BEYOND_PORTAL, MARSH_PORTAL } from '../../config/rotMarsh'
import { useGameStore } from '../../store/useGameStore'
import { Malenia } from '../Malenia'
import { MarshRewards } from './MarshRewards'
import { Portal } from '../environment/Portal'
import { Arena } from './Arena'
import { Flora } from './Flora'
import { Marsh } from './Marsh'
import { PaleTree } from './PaleTree'
import { RotBlight } from './RotBlight'
import { Causeway } from './Causeway'
import { Ruins } from './Ruins'
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
/**
 * La Déchue, et la question « est-elle encore debout ? » posée à son montage.
 *
 * Deux composants pour un boss, et c'est la génération de boss qui l'exige :
 *
 *  - l'instantané est pris **au montage**, et non à la frame courante. Le lire
 *    en direct l'aurait emportée à la frame suivant sa chute — sans l'écrasement,
 *    sans la détente, sans la fumée. Un boss retire lui-même son corps ; personne
 *    n'a à le faire pour lui ;
 *  - mais il doit être **repris** quand la mort du joueur la remonte entière
 *    (voir `worldId`), sinon une Déchue tombée juste avant le coup fatal se
 *    relèverait avec le joueur. Pris dans `RotMarsh`, l'instantané datait de
 *    l'arrivée sur la carte et aurait dit « debout » pour toujours.
 *
 * `maleniaSlainAt` et non `bossState` : celui-ci décrit le gardien de la
 * rotonde, et il vaut déjà `defeated` quand on arrive ici. S'en servir l'aurait
 * fait naître morte.
 */
function MarshBoss() {
  const [standing] = useState(() => useGameStore.getState().maleniaSlainAt === null)
  return standing ? <Malenia /> : null
}

/**
 * Le porte-clé de la Déchue, et il n'existe que pour porter cette clé.
 *
 * L'abonnement à `worldId` est confiné ici plutôt que posé dans `RotMarsh` :
 * là-haut, il aurait fait re-rendre le marais entier — nappe, racines, ruines,
 * flore et arbre — à chaque relèvement du joueur, pour ne remonter qu'un seul
 * corps.
 */
function MarshBossSlot() {
  const worldId = useGameStore((state) => state.worldId)
  return <MarshBoss key={worldId} />
}

export default function RotMarsh() {
  const materials = useMarshMaterials()
  /*
    Sa chute, lue en **abonnement vivant** et non en instantané — l'inverse
    exact de ce que fait `MarshBoss` juste au-dessus, et les deux ont raison.

    L'instantané sert à décider si elle est **montée** : la lire en direct
    l'aurait fait disparaître à la frame suivant sa mort, sans l'écrasement, sans
    la détente, sans la fumée. L'abonnement sert à ouvrir l'anneau de
    l'Outremonde : celui-là doit se percer à la seconde où elle tombe, pendant
    qu'elle tombe, sous les yeux du joueur. C'est la discipline de
    `MarshRewards`, pour la même raison.
  */
  const maleniaSlainAt = useGameStore((state) => state.maleniaSlainAt)

  return (
    <>
      {/* Il ne rend rien : c'est le moteur de la jauge de pourriture, monté
          avec le Marais et avec lui seul. Voir son en-tête. */}
      <RotBlight />

      <Marsh materials={materials} />
      <Causeway materials={materials} />
      <Ruins materials={materials} />
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

        Le montage est conditionné à sa mort, comme le gardien de la rotonde, et
        il est confié à `MarshBossSlot` — voir son en-tête : l'instantané n'est
        plus pris au montage de la carte mais à celui du boss, ce qui la rend
        entière quand le joueur se relève sans la laisser ressusciter.
      */}
      <MarshBossSlot />

      {/* Ce qu'elle laisse en tombant : un réceptacle là où le corps est resté,
          et deux coffres qui encadrent l'axe du tronc. L'abonnement y est vivant
          et non figé au montage — voir `MarshRewards`. */}
      <MarshRewards />

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

      {/*
        L'anneau de l'Outremonde, au fond du bassin.

        Il ne se déplie qu'à la chute de Malenia, et il est le **second** portail
        du jeu à se mériter — le premier étant celui de Nakano, qui demandait de
        vider le continent. Les trois autres sont des portes de retour, ouvertes
        depuis toujours parce qu'on en sort.

        `openedAt` reçoit l'horodatage de sa mort plutôt qu'un zéro : c'est lui
        qui fait jouer le dépliement élastique de l'anneau, sur un peu plus d'une
        seconde. Celui de Nakano s'ouvre à l'autre bout de la carte, très
        probablement hors de vue ; celui-ci s'ouvre à six pas du joueur, juste
        après le seul combat du jeu qui se termine par un silence. Il est la seule
        chose qui bouge à l'écran à cet instant, et c'est tout ce qu'on lui
        demande.
      */}
      <Portal at={MARSH_BEYOND_PORTAL} openedAt={maleniaSlainAt} to="beyond" />
    </>
  )
}
