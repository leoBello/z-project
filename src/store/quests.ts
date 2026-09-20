import { enemyTotal } from '../config/enemies'
import { activeQuest, questBoard, type QuestStatus } from '../config/quests'
import { useGameStore } from './useGameStore'

/**
 * Le journal de quêtes, relu depuis l'état de partie.
 *
 * Le pendant d'`useInteraction` : une dérivation que deux composants sans
 * ancêtre commun utile — la pastille du HUD et le panneau lui-même — ont besoin
 * de lire de la même façon. La laisser se recopier dans les deux ferait
 * diverger un jour la pastille qui pulse et la quête qu'elle annonce.
 *
 * Les cinq valeurs lues changent toutes à des transitions rares — un ennemi
 * tué, un portail ouvert, une arrivée, une chute de boss — donc s'y abonner ne
 * coûte pas un rendu par image. `trialSlain.length` plutôt que le tableau :
 * c'est un nombre, il ne re-rend pas quand la référence change sans que le
 * compte bouge.
 *
 * Le tableau retourné est neuf à chaque rendu, et c'est sans conséquence : il
 * est construit **après** les abonnements, pas dans un sélecteur — un sélecteur
 * qui alloue re-rendrait à chaque notification du store, y compris pour un
 * champ qui ne l'intéresse pas.
 */
export function useQuestBoard(): QuestStatus[] {
  const kills = useGameStore((state) => state.kills)
  const portalOpened = useGameStore((state) => state.portalOpenedAt !== null)
  const skyVisited = useGameStore((state) => state.skyVisited)
  const bossDefeated = useGameStore((state) => state.bossState === 'defeated')
  const trialSlain = useGameStore((state) => state.trialSlain.length)

  return questBoard({
    kills,
    enemyTotal: enemyTotal(),
    portalOpened,
    skyVisited,
    bossDefeated,
    trialSlain,
  })
}

/** La quête en cours, ou `null`. Pour la pastille, qui n'affiche qu'elle. */
export function useActiveQuest(): QuestStatus | null {
  return activeQuest(useQuestBoard())
}
