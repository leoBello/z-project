import { useEffect } from 'react'
import { BEYOND_PORTAL, BEYOND_SHAPE } from '../../config/beyond'
import { applyGround, resetGround } from '../../state/ground'
import { useGameStore } from '../../store/useGameStore'
import { Portal } from '../environment/Portal'
import { Terrain } from '../environment/Terrain'
import { Vegetation } from '../environment/Vegetation'
import { Water } from '../environment/Water'
import { BeyondPopulation } from './BeyondPopulation'
import { Crucible } from './Crucible'
import { Sanctuary } from './Sanctuary'
import { Sensei } from './Sensei'
import { useBeyondMaterials } from './materials'

/**
 * L'Outremonde — le point d'entrée du fragment chargé à la demande.
 *
 * Tout ce que ce composant importe entre dans le même morceau de bundle, et
 * c'est le but : l'accueil du site ne télécharge ni l'île, ni le Marais, ni
 * celui-ci. Le découpage est fait par Vite à partir de l'`import()` de
 * `preload.ts` ; il n'y a rien à configurer, mais il y a une règle à tenir —
 * voir l'en-tête de ce fichier-là.
 *
 * L'export est **par défaut**, parce que `React.lazy` n'accepte que ça.
 *
 * **Trois lignes de ce fichier sont toute la raison d'être du travail qui l'a
 * précédé** : `<Terrain>`, `<Vegetation>` et `<Water>` sont ceux du continent,
 * montés ici avec une autre `WorldShape`. Le relief, le semis des sept biomes,
 * les colliders de troncs, la houle et l'écume du rivage arrivent donc sans une
 * ligne de code neuve. C'est ce qui rend cette carte possible : la refaire à
 * l'échelle du continent en repartant de zéro aurait demandé de réécrire
 * quinze cents lignes déjà écrites, et d'en maintenir deux versions.
 *
 * **L'ordre de lecture de la carte** — parce qu'elle en a un, malgré son air de
 * terrain de jeu ouvert. On arrive au sud, sur un promontoire, dos à l'anneau et
 * face au nord. Devant soi, dans cet ordre de profondeur : le dallage du
 * Sanctuaire et son maître, la prairie qui descend, le Creuset noir au centre
 * exact du monde, et derrière lui un massif enneigé qui ferme l'horizon. À
 * gauche la jungle, à droite les terres arides, tout autour la mer. Rien de
 * cela n'est expliqué ; tout est dans le cadre à la première frame.
 */
export default function Beyond() {
  const materials = useBeyondMaterials()
  /*
    La génération du peuplement, qui sert de `key` au monde vivant.

    Chaque défi accepté l'incrémente, ce qui démonte et remonte les
    soixante-treize corps de la carte : les cinq Lynels, la Déchue et les bêtes
    se retrouvent debout, à leur poste, aux points de vie de la difficulté
    choisie. C'est l'idiome de `runId` d'`App.tsx`, restreint à une carte, et
    c'est ce qui permet de relancer le défi autant de fois qu'on veut sur un
    monde entier plutôt que sur ses restes.
  */
  const populationId = useGameStore((state) => state.populationId)

  /*
    Cette carte déclare son relief aux pools qui vivent au-dessus d'elle.

    Les cœurs sont montés une seule fois, dans `App.tsx`, donc au-dessus des
    quatre cartes : ils ne peuvent pas nommer un champ de hauteurs sans tirer
    dans le bundle d'accueil la configuration de celui-ci. Ils lisaient donc
    celui du continent en dur, et sur l'Outremonde les deux reliefs s'écartent
    assez pour que trois cœurs sur quatre se posent hors de portée — pendant le
    défi, c'est-à-dire au seul endroit du jeu où l'on en ramasse beaucoup.

    Même discipline que la trêve du Sanctuaire : on pose au montage, on rend au
    démontage. Le tableau vide est correct — `BEYOND_SHAPE` est un objet de
    module, pas un littéral reconstruit à chaque rendu.
  */
  useEffect(() => {
    applyGround(BEYOND_SHAPE.height)
    return resetGround
  }, [])

  return (
    <>
      {/*
        Le monde lui-même, en trois composants partagés avec le continent.

        La forme est passée en prop et reste **la même référence** d'un rendu à
        l'autre — c'est un objet de module, pas un littéral construit ici : les
        trois la lisent dans des `useMemo` qui en dépendent, et un objet neuf à
        chaque rendu aurait recuit la grille de hauteurs, le semis de quatorze
        mille points et la carte d'écume à chaque re-rendu de ce composant.
      */}
      <Terrain shape={BEYOND_SHAPE} />
      <Water shape={BEYOND_SHAPE} />
      <Vegetation shape={BEYOND_SHAPE} />

      {/* Les deux pôles de la carte : la paix au sud, le combat au centre. Ils
          sont écrits pour se répondre — mêmes formes, palettes inverses. Voir
          l'en-tête de `Crucible`. */}
      <Sanctuary materials={materials} />
      <Crucible materials={materials} />
      <Sensei />

      <BeyondPopulation key={populationId} />

      {/*
        L'anneau du retour, qui ramène au Marais.

        Pas au continent, bien que ce soit là que le joueur veuille sans doute
        finir : une porte ramène là d'où l'on est parti, c'est même à peu près la
        seule chose qu'on attende d'une porte. De l'autre côté, l'anneau du
        bassin le renvoie au sommet, et celui du sommet chez lui — et s'il est
        pressé, le menu de voyage rapide le ramène devant n'importe quel monument
        en une fois.

        `openedAt` vaut zéro, donc l'anneau est déjà déplié à la première frame :
        le joueur vient d'en sortir, le voir se percer derrière lui n'aurait aucun
        sens. Même valeur et même raison que les portails d'arrivée de l'île et du
        Marais.
      */}
      <Portal at={BEYOND_PORTAL} openedAt={0} to="rot" />
    </>
  )
}
