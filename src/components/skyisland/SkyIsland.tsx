import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { SKY_PORTAL } from '../../config/portal'
import { Portal } from '../environment/Portal'
import { toonGradient } from '../models/toonGradient'

/**
 * L'Île Céleste — le point d'entrée du fragment chargé à la demande.
 *
 * Tout ce que ce composant importe entre dans le même morceau de bundle, et
 * c'est le but : l'accueil du site ne télécharge pas l'île. Le découpage est
 * fait par Vite à partir de l'`import()` de `preload.ts` ; il n'y a rien à
 * configurer, mais il y a une règle à tenir — voir l'en-tête de ce fichier-là.
 *
 * L'export est **par défaut**, parce que `React.lazy` n'accepte que ça.
 */

/** Rayon de l'île. Provisoire : la tâche 2 apporte le vrai relief. */
const PLACEHOLDER_RADIUS = 55

/**
 * Instant d'ouverture du portail du retour.
 *
 * `0` et non `Date.now()` : la valeur ne sert qu'à l'animation de dépliement,
 * qui compare à l'horloge de jeu. Un zéro la place très loin dans le passé, donc
 * l'anneau est déjà déplié à la première frame — ce qu'on veut, puisque le
 * joueur vient d'en sortir : le voir se percer derrière soi n'aurait aucun sens.
 */
const ALREADY_OPEN = 0

export default function SkyIsland() {
  return (
    <>
      <RigidBody type="fixed" colliders={false} friction={1}>
        {/*
          Terrain provisoire : un disque plat, le temps que le relief arrive.

          Il est là pour que la transition entre les deux cartes se vérifie toute
          seule, sans dépendre de la géométrie qui viendra ensuite — c'est la
          seule chose que cette étape prétend livrer, et elle doit pouvoir être
          jugée sans le reste.
        */}
        <CuboidCollider
          args={[PLACEHOLDER_RADIUS, 0.5, PLACEHOLDER_RADIUS]}
          position={[0, -0.5, 0]}
        />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[PLACEHOLDER_RADIUS, 48]} />
          <meshToonMaterial gradientMap={toonGradient} color="#8fbf63" />
        </mesh>
      </RigidBody>

      {/* Le jumeau de celui de Nakano, au point d'arrivée. Le même composant :
          deux portails qui divergeraient au premier réglage de l'anneau
          seraient un bug qu'on ne verrait qu'en faisant l'aller-retour. */}
      <Portal at={SKY_PORTAL} openedAt={ALREADY_OPEN} />
    </>
  )
}
