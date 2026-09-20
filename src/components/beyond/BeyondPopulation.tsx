import { BEYOND_ARENA, BEYOND_ARENA_CENTER, BEYOND_ARENA_ENGAGE_R } from '../../config/beyond'
import { BEYOND_LYNEL_POSTS, GOLDEN_POST_ID } from '../../config/beyondEnemies'
import { beyondEnemySpawns } from '../../config/beyondEnemies'
import { RESPAWN_MS } from '../../config/challenge'
import { GOLDEN_HP, TRIAL_HP } from '../../config/lynel'
import { MALENIA_HP } from '../../config/malenia'
import { scaledHp } from '../../state/difficulty'
import { Enemy } from '../Enemy'
import { Lynel } from '../Lynel'
import { Malenia } from '../Malenia'

/**
 * Tout ce qui, sur l'Outremonde, veut la peau du joueur.
 *
 * **Trois espèces, trois machines à états, zéro ligne de code de combat ici.**
 * C'est le point du fichier : `Enemy`, `Lynel` et `Malenia` ont été écrits pour
 * le continent, l'île et le Marais, et aucun des trois n'a eu à changer de
 * comportement pour cette carte. Ce qu'ils ont gagné tient en quelques props —
 * un poste, une laisse, un rôle, des points de vie, un délai de réapparition —
 * et en deux règles partagées, la trêve du Sanctuaire et la difficulté, qui
 * vivent dans `state/` et qu'ils lisent sans savoir qui les écrit.
 *
 * Le peuplement est monté **dans le fragment** et non dans `App.tsx`, à la
 * différence de celui du continent. La raison est la même que pour les Lynels de
 * l'île : `App.tsx` appartient au bundle d'accueil, et y écrire
 * `location === 'beyond' && <BeyondPopulation />` aurait tiré ici la
 * configuration du Lynel, celle de Malenia et leurs deux modèles — c'est-à-dire
 * le plus gros du jeu — dans la page que le visiteur charge en arrivant.
 *
 * **Deux régimes de réapparition, et ils ne se ressemblent pas.**
 *
 * Les petites bêtes reviennent d'elles-mêmes, vingt-cinq secondes après être
 * tombées, chacune à son poste : sans ça la carte s'épuise, et une course de dix
 * minutes passe sa seconde moitié à chercher une cible.
 *
 * Les six grosses — cinq Lynels et la Déchue — ne reviennent **qu'au défi
 * suivant**, par le remontage du composant entier (voir `populationId`). Elles
 * sont l'enjeu de la course, pas son fond de tableau : les voir se relever une
 * demi-minute après les avoir abattues retirerait tout le sel de la décision
 * d'aller les chercher. Et c'est aussi ce remontage qui rend le défi rejouable
 * à l'infini sur un monde entier plutôt que sur ses restes.
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
        <Enemy key={spawn.id} spawn={spawn} respawnMs={RESPAWN_MS} />
      ))}

      {/*
        Les cinq bêtes : quatre argentées, une dorée.

        Les argentées ont les points de vie de l'épreuve (18) et non ceux du
        gardien (36), et le nombre se lit dans la table des phases : à dix-huit,
        elles commencent en phase d'arène — épée, estoc, charge et volée — et
        basculent en rage à douze. Ce sont donc de vrais Lynels et non des
        figurants, mais elles n'ont pas de premier tiers d'apprentissage. À
        trente-six, une seule aurait mangé la moitié des deux minutes du défi,
        et personne ne l'aurait attaquée deux fois.

        La dorée, elle, garde ses cinquante-quatre points de vie et son cœur de
        dégâts en plus. Elle est postée au contrefort du nord-est, à cent quatre
        unités du Sanctuaire : c'est la plus grosse récompense de la carte après
        la Déchue, et la seule qui demande de décider, montre en main, si l'on a
        le temps d'y aller.
      */}
      {BEYOND_LYNEL_POSTS.map((post) => {
        const golden = post.id === GOLDEN_POST_ID
        return (
          <Lynel
            key={post.id}
            id={post.id}
            home={post.home}
            leash={post.leash}
            // Calibrés à l'apparition, comme ceux des petites bêtes. Le
            // remontage du peuplement au départ d'un défi est ce qui fait
            // prendre un changement de difficulté.
            hp={scaledHp(golden ? GOLDEN_HP : TRIAL_HP)}
            role={golden ? 'wild-golden' : 'wild'}
          />
        )
      })}

      {/*
        La Déchue, au centre du monde.

        Elle est debout dès l'arrivée, et elle se relève à chaque défi : c'est le
        seul endroit du jeu où un boss revient, et c'est la définition même d'un
        terrain d'entraînement — on ne vient pas ici pour clore quelque chose.
      */}
      <Malenia
        id="beyond-malenia"
        arena={BEYOND_ARENA_CENTER}
        floorY={BEYOND_ARENA.altitude}
        arenaR={BEYOND_ARENA.radius}
        engageR={BEYOND_ARENA_ENGAGE_R}
        hp={scaledHp(MALENIA_HP)}
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
