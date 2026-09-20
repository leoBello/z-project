import { BEYOND_ARENA, BEYOND_ARENA_CENTER, BEYOND_ARENA_ENGAGE_R } from '../../config/beyond'
import { BEYOND_LYNEL_POSTS, beyondEnemySpawns } from '../../config/beyondEnemies'
import { TRIAL_HP } from '../../config/lynel'
import { Enemy } from '../Enemy'
import { Lynel } from '../Lynel'
import { Malenia } from '../Malenia'

/**
 * Tout ce qui, sur l'Outremonde, veut la peau du joueur.
 *
 * **Trois espèces, trois machines à états, zéro ligne de code de combat ici.**
 * C'est le point du fichier : `Enemy`, `Lynel` et `Malenia` ont été écrits pour
 * le continent, l'île et le Marais, et aucun des trois n'a eu à changer de
 * comportement pour cette carte. Ce qu'ils ont gagné tient en trois props — un
 * poste, une laisse, un rôle — et en une règle partagée, la trêve du Sanctuaire,
 * qui vit dans `state/sanctuary.ts` et qu'ils lisent sans savoir qui l'écrit.
 *
 * Le peuplement est monté **dans le fragment** et non dans `App.tsx`, à la
 * différence de celui du continent. La raison est la même que pour les Lynels de
 * l'île : `App.tsx` appartient au bundle d'accueil, et y écrire
 * `location === 'beyond' && <BeyondPopulation />` aurait tiré ici la
 * configuration du Lynel, celle de Malenia et leurs deux modèles — c'est-à-dire
 * le plus gros du jeu — dans la page que le visiteur charge en arrivant.
 *
 * **Malenia n'a pas besoin de connaître la trêve**, et c'est la seule asymétrie
 * du fichier. Les Octoroks et les Moblins se promènent, les Lynels tiennent une
 * laisse de dix-huit unités autour de postes dont le plus proche est à
 * quarante-deux du Sanctuaire : les uns comme les autres peuvent arriver à la
 * lisière de la paix, donc doivent savoir s'y arrêter. Elle, non — sa laisse la
 * tient dans le Creuset, à soixante-quatorze unités de là. La garde lui serait
 * inutile, et une garde inutile finit par être lue comme une garde nécessaire.
 */
export function BeyondPopulation() {
  return (
    <>
      {beyondEnemySpawns().map((spawn) => (
        <Enemy key={spawn.id} spawn={spawn} />
      ))}

      {/*
        Les cinq bêtes. Points de vie de l'épreuve (18) et non du gardien (36),
        et le nombre se lit dans la table des phases : à dix-huit, elles
        commencent en phase d'arène — épée, estoc, charge et volée — et basculent
        en rage à douze. Ce sont donc de vrais Lynels et non des figurants, mais
        elles n'ont pas de premier tiers d'apprentissage. C'est le bon calibre
        ici pour la même raison que sur l'île, et pour une seconde : à trente-six
        points de vie, une seule bête aurait mangé la moitié des deux minutes du
        défi, et personne ne l'aurait attaquée deux fois.
      */}
      {BEYOND_LYNEL_POSTS.map((post) => (
        <Lynel
          key={post.id}
          id={post.id}
          home={post.home}
          leash={post.leash}
          hp={TRIAL_HP}
          role="wild"
        />
      ))}

      {/*
        La Déchue, au centre du monde.

        Elle est debout **dès l'arrivée** et elle le reste : contrairement à
        celle du Marais, sa mort n'est pas mémorisée. Repartir par l'anneau et
        revenir la retrouve entière, avec ses soixante points de vie et sa phase
        de lame. C'est le seul endroit du jeu où un boss se remonte, et c'est la
        définition même d'un terrain d'entraînement : on ne vient pas ici pour
        clore quelque chose.
      */}
      <Malenia
        id="beyond-malenia"
        arena={BEYOND_ARENA_CENTER}
        floorY={BEYOND_ARENA.altitude}
        arenaR={BEYOND_ARENA.radius}
        engageR={BEYOND_ARENA_ENGAGE_R}
        // Sa laisse est le dallage plus une marge d'une demi-arène : assez pour
        // qu'elle poursuive jusqu'au pied des obélisques, pas assez pour qu'elle
        // suive le joueur dans la prairie. Un boss qui traverse la carte derrière
        // vous n'est pas un boss, c'est une avalanche.
        leashR={BEYOND_ARENA.radius + 7}
        role="outcast"
      />
    </>
  )
}
