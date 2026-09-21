import { Suspense, lazy, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Object3D, type DirectionalLight } from 'three'
import { playerTransform } from '../state/playerTransform'
import type { MapId } from '../types/game'
import { ATMOSPHERE, type Atmosphere } from '../config/atmosphere'
import { useGameStore } from '../store/useGameStore'
import { useQualityStore } from '../store/useQualityStore'
import { Bridge } from './environment/Bridge'
import { SkyIslandDistant } from './environment/SkyIslandDistant'
import { Landmarks } from './environment/Landmarks'
import { Terrain } from './environment/Terrain'
import { Vegetation } from './environment/Vegetation'
import { StarrySky } from './environment/StarrySky'
import { RotSky } from './rot/RotSky'
import { SiteDiscovery } from './SiteDiscovery'
import { BeyondSky } from './beyond/BeyondSky'
import { Water } from './environment/Water'

/**
 * Demi-largeur de la zone couverte par les ombres.
 * Cadrer la shadow camera sur le joueur plutôt que sur la carte entière fait
 * passer la résolution d'environ 10 cm à 2 cm par texel — sur une carte de
 * 200 unités, c'est la différence entre des ombres nettes et de la bouillie.
 */
const SHADOW_EXTENT = 42

/**
 * Soleil qui suit le joueur.
 *
 * Une lumière directionnelle n'a pas de position au sens physique, mais sa
 * shadow camera, elle, en a une : la déplacer avec le joueur garde toujours la
 * zone visible dans la carte d'ombres.
 */
function SunLight({ sun }: { sun: Atmosphere['sun'] }) {
  const light = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  // Une shadow map de 2048² coûte une passe de rendu de la scène à cette
  // résolution, à chaque frame. C'est le levier de qualité le plus direct
  // après la densité de végétation.
  const shadowMapSize = useQualityStore((state) => state.settings.shadowMapSize)

  useFrame(() => {
    const { position } = playerTransform
    target.position.copy(position)
    target.updateMatrixWorld()
    light.current?.position.set(
      position.x + sun.offset[0],
      position.y + sun.offset[1],
      position.z + sun.offset[2],
    )
  })

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        castShadow
        intensity={sun.intensity}
        color={sun.color}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={220}
      />
    </>
  )
}

/**
 * L'éclairage de la carte courante.
 *
 * Quatre sources, et c'est volontaire : une seule lumière blanche aplatit
 * n'importe quel style. La clé sculpte, le rebond hémisphérique évite les
 * ombres noires et mortes, l'ambiante relève le tout, et le contre-jour détache
 * les silhouettes du fond — c'est lui qui fait "lire" le personnage sur la
 * végétation.
 *
 * Les quatre viennent de `config/atmosphere.ts` et non de ce fichier : c'est
 * une propriété du **lieu**, pas du composant qui l'allume. Voir l'en-tête de
 * cette table pour la raison du changement.
 */
function Lighting({ map }: { map: MapId }) {
  const air = ATMOSPHERE[map]
  return (
    <>
      <hemisphereLight
        args={[air.hemisphere.sky, air.hemisphere.ground, air.hemisphere.intensity]}
      />
      <ambientLight intensity={air.ambient} />
      <SunLight sun={air.sun} />
      <directionalLight
        position={air.rim.position}
        intensity={air.rim.intensity}
        color={air.rim.color}
      />
    </>
  )
}

/**
 * La brume de la carte courante.
 *
 * Elle était en dur dans `App.tsx`, et elle en sort pour la même raison que les
 * lumières. Elle reste **hors** de `<Physics>` et de tout `<Suspense>` : c'est
 * un attachement sur la scène, pas un objet qui se monte et se démonte.
 *
 * `attach="fog"` remplace l'objet précédent à chaque changement de carte, donc
 * il n'y a rien à nettoyer — mais il n'y a pas d'interpolation non plus : la
 * brume change d'un coup. Ça ne se voit pas, parce que le seul instant où elle
 * change est celui où le voile de transition est opaque.
 */
function MapFog({ map }: { map: MapId }) {
  const { color, near, far } = ATMOSPHERE[map].fog
  return <fog attach="fog" args={[color, near, far]} />
}

/**
 * L'Île Céleste, chargée à la demande.
 *
 * `lazy` et non un import direct : c'est ce qui fait de tout le sous-arbre de
 * l'île un fragment de bundle à part, que l'accueil du site ne télécharge
 * jamais.
 *
 * **Elle a sa propre frontière `<Suspense>`, et c'est indispensable.** Celle
 * d'`App.tsx` entoure toute la scène — joueur et physique compris. Y laisser
 * l'île suspendre détachait donc le sous-arbre entier : `playerBody.current`
 * repassait à `null`, la position que la transition venait d'écrire tombait
 * dans le vide, et le `<RigidBody>` du joueur se recréait à la valeur littérale
 * de sa prop, `PLAYER.spawn`. Le joueur arrivait au centre du continent alors
 * qu'il venait d'entrer dans le ciel, tombait, et le filet de sécurité le
 * ramenait au portail — d'où l'impression que « la position change puis
 * revient ».
 *
 * Le défaut ne se voyait **que dans un sens** : le retour vers le continent ne
 * charge rien en différé, donc rien n'y suspend. C'est ce qui le rendait
 * difficile à lire.
 */
const SkyIsland = lazy(() => import('./skyisland/SkyIsland'))

/**
 * Le Marais d'Aeonia, chargé à la demande — mêmes règles que l'île.
 *
 * Il a lui aussi sa propre frontière `<Suspense>`, et pour la raison exposée
 * juste au-dessus : suspendre depuis celle d'`App.tsx` détacherait le joueur et
 * sa physique, ce qui le reposerait au spawn du continent au milieu du voyage.
 * Le défaut est invisible dans le sens du retour, ce qui le rend très difficile
 * à lire — il ne faut donc pas se fier aux essais pour le découvrir.
 */
const RotMarsh = lazy(() => import('./rot/RotMarsh'))

/**
 * L'Outremonde, chargé à la demande — mêmes règles que les deux autres.
 *
 * C'est le plus lourd des trois fragments : il porte un champ de hauteurs
 * complet, son semis, cinq Lynels et une Malenia. Raison de plus pour qu'il ne
 * soit jamais dans le bundle d'accueil — et il ne peut pas y être, puisque rien
 * du tronc commun ne l'importe autrement que par ce `lazy` et par son
 * `preload.ts`.
 */
const Beyond = lazy(() => import('./beyond/Beyond'))

/**
 * Décor complet de la carte courante.
 *
 * Le **ciel étoilé** reste hors du branchement, et lui seul : le continent et
 * l'île partagent le même firmament — l'île flotte dans le ciel du continent,
 * pas dans un autre. Le monter deux fois le recréerait à chaque voyage pour un
 * résultat identique.
 *
 * La brume et les lumières, elles, en sont sorties : elles sont désormais lues
 * par carte dans `config/atmosphere.ts`. Pour les deux cartes existantes la
 * table redonne exactement les valeurs qui étaient en dur ici et dans
 * `App.tsx`, donc rien ne change à l'écran.
 *
 * Tout le reste change en bloc. Il n'y a délibérément aucune pièce commune au
 * sol : le continent est un champ de hauteurs sur grille carrée, l'île une
 * surface radiale avec un dessous — et un champ de hauteurs ne peut pas
 * représenter un surplomb. Voir la spec de l'île pour le détail.
 */
export function Environment() {
  const location = useGameStore((state) => state.location)

  return (
    <>
      {/*
        Le firmament, et il y en a deux.

        Le continent et l'île partagent le même — l'île flotte dans le ciel du
        continent, pas dans un autre. Le Marais a le sien : `RotSky` n'est pas
        `StarrySky` reparamétré, parce que celui-ci dessine des étoiles, une lune
        et une Voie lactée, et qu'aucune des trois n'a sa place sous un ciel
        malade. Lui passer des teintes rouges aurait donné une jolie nuit rouge,
        ce qu'on ne veut surtout pas.

        Il est **hors du `<Suspense>`** du Marais, et monté par le tronc commun :
        un ciel est ce qu'on doit voir en premier, y compris pendant que le reste
        de la carte arrive.
      */}
      {/*
        Le firmament, et il y en a maintenant trois pour quatre cartes.

        Le continent et l'île partagent le même — l'île flotte dans le ciel du
        continent, pas dans un autre. Le Marais a le sien, et l'Outremonde le
        sien : un monde qui ne se trouve pas dans ce monde ne peut pas en
        emprunter les étoiles, ce serait dire le contraire de tout le reste.

        Le branchement est resté un enchaînement de ternaires plutôt que de
        devenir un `Record<MapId, …>`, et c'est le seul endroit du projet où
        cette entorse se défend : trois valeurs pour quatre cartes, dont deux
        partagent la même. Une table aurait demandé d'écrire deux fois
        `StarrySky` — donc de laisser croire qu'il s'agit de deux ciels, ce qui
        est exactement l'erreur qu'on veut éviter ici.
      */}
      {location === 'rot' ? <RotSky /> : location === 'beyond' ? <BeyondSky /> : <StarrySky />}
      <MapFog map={location} />
      <Lighting map={location} />
      {/*
        La découverte des lieux remarquables, et elle est **hors du
        branchement** : le gué et le pont sont sur le continent, la rotonde et
        le sommet sur l'île, la chaussée et le bassin sur le Marais, le Creuset
        sur l'Outremonde. Une seule boucle pour les quatre cartes, qui lit la
        table de `config/sites.ts` et se tait sur celles qui n'en ont pas.

        Rangée ici plutôt que dans chaque décor pour la même raison que le
        firmament et la brume : ce n'est pas une pièce de carte, c'est une
        règle du jeu. Trois des quatre décors sont d'ailleurs chargés à la
        demande — y glisser une copie de la boucle l'aurait rendue absente
        pendant les quelques frames où le fragment arrive.
      */}
      <SiteDiscovery />
      {/*
        Chaque carte différée a une frontière `<Suspense>` **à elle**, et la
        `key` est tout ce qui le garantit.

        Sans elle, les trois branches rendent le même élément — un `<Suspense>`
        sans clé, à la même place — et React réutilise la frontière au lieu
        d'en monter une neuve. Ce n'est pas un détail d'implémentation : quand
        la carte d'arrivée suspend le temps de résoudre son `lazy` — ce qui
        arrive à **chaque** voyage, même quand le module est déjà en mémoire
        (voir `WorldTransition`) —, React garde la carte de départ montée et la
        masque, en posant `visible = false` sur ses objets, le temps d'afficher
        le repli. Puis il la supprime sans jamais la démasquer : il n'y a plus
        rien à démasquer, l'arbre est parti.

        Et ce masquage survivait au démontage. L'Île Céleste bâtit ses quatre
        plus grosses pièces — ruines, flore, chaussée, eau — à l'import du
        fragment, et les rend par `<primitive>` (voir l'en-tête de `Ruins.tsx`
        pour la raison). Ce sont donc des `Object3D` de module, qui vivent plus
        longtemps que le montage : le `visible = false` laissé par la
        suspension restait sur eux, et aucune prop ne venait le corriger au
        montage suivant. Descendre au Marais par le portail du sommet suffisait
        à rendre l'île définitivement amputée — le terrain revenait, les ruines,
        les arbres, l'eau et la voie ne revenaient plus, pour le reste de la
        session.

        Avec une clé par carte, React supprime la frontière de départ et en
        monte une neuve : celle-ci n'a pas d'enfant à masquer, et personne ne
        touche plus aux objets de la carte qu'on quitte. C'est aussi ce que le
        reste du code a toujours cru qu'il se passait — « React doit démonter le
        continent entier et monter l'île », dit l'en-tête de `WorldTransition`.
      */}
      {location === 'beyond' ? (
        <Suspense key="beyond" fallback={null}>
          <Beyond />
        </Suspense>
      ) : location === 'rot' ? (
        <Suspense key="rot" fallback={null}>
          <RotMarsh />
        </Suspense>
      ) : location === 'continent' ? (
        <>
          <Terrain />
          <Water />
          <Vegetation />
          {/* Monté hors de `Landmarks` : le pont n'est le parvis d'aucun
              monument, c'est une pièce du relief au même titre que la mer. */}
          <Bridge />
          <Landmarks />
          {/* Montée avec le continent et jamais avec l'île : quand on y est,
              on est dessus. */}
          <SkyIslandDistant />
        </>
      ) : (
        <Suspense key="sky" fallback={null}>
          <SkyIsland />
        </Suspense>
      )}
    </>
  )
}
