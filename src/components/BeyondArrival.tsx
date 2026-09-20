import { useI18n } from '../i18n/useI18n'
import { now as gameNow } from '../state/gameClock'
import { useGameStore } from '../store/useGameStore'

/**
 * L'arrivée sur l'Outremonde — les cinq secondes qui suivent le retrait du voile.
 *
 * C'est le seul endroit du jeu où l'interface prend la parole pour ne rien dire
 * d'utile. Les trois autres bandeaux annoncent un fait — un lieu trouvé, un
 * réceptacle pris, un portail ouvert ; celui-ci annonce **un endroit**, et sa
 * seule fonction est que le joueur s'arrête une seconde avant de courir.
 *
 * Trois couches, montées ensemble et réglées pour se croiser :
 *
 *  - un **embrasement** blanc doré, qui part de plein écran et s'efface en une
 *    seconde et demie. C'est le raccord avec le voile de braises qui vient de se
 *    lever : sans lui, on passe du violet opaque au monde en fondu, ce qui est
 *    propre et plat ;
 *  - un **titre**, qui monte pendant que l'embrasement descend ;
 *  - une **ligne de règle**, la seule information vraie de l'écran : le
 *    Sanctuaire protège, au-delà non. C'est tout ce que le joueur a besoin de
 *    savoir sur cette carte, et c'est dit une fois.
 *
 * **Il ne se joue qu'une fois par partie**, et le mécanisme mérite un mot.
 * `beyondArrivedAt` date la *découverte* et n'est plus jamais réécrit ; la
 * fenêtre est donc mesurée depuis cette date, sur l'horloge de **jeu**. Or
 * celle-ci est arrêtée pendant tout le voyage — la phase est `paused` dès la
 * demande — et elle repart exactement au retrait du voile. L'instant zéro de la
 * fenêtre est donc, à la frame près, celui où le joueur reprend la main : la
 * fanfare ne brûle pas ses deux premières secondes derrière un écran opaque, et
 * elle ne se rejoue jamais au second passage, où l'écart se compte en minutes.
 */

/**
 * Durée de la fenêtre d'affichage, en millisecondes de temps de jeu.
 *
 * Elle doit couvrir la plus longue des trois animations CSS — le titre, à 5,2 s
 * plus son retard — avec de la marge. Elle ne les pilote pas : ce sont les
 * animations qui effacent, en `forwards`, et elles le font très bien.
 *
 * Son vrai rôle est donc ailleurs : **empêcher la fanfare de se rejouer.** Le
 * composant ne se re-rend qu'au changement d'une des trois valeurs auxquelles il
 * s'abonne, c'est-à-dire en pratique à chaque voyage. Sans la fenêtre, revenir
 * sur la carte un quart d'heure plus tard remonterait le titre et rejouerait
 * l'embrasement en pleine partie. Avec elle, le second passage ne rend rien du
 * tout.
 */
const WINDOW_MS = 6_000

export function BeyondArrival() {
  const arrivedAt = useGameStore((state) => state.beyondArrivedAt)
  const location = useGameStore((state) => state.location)
  const transit = useGameStore((state) => state.transit)
  const { dict } = useI18n()

  if (arrivedAt === null || location !== 'beyond' || transit !== null) return null
  if (gameNow() - arrivedAt > WINDOW_MS) return null

  return (
    <>
      {/*
        L'embrasement. Doré et **jamais blanc pur**, comme l'éclair de la frappe
        d'annihilation : un jeu de navigateur n'a pas le droit de faire flasher
        un plein écran. Une seule montée, un seul effacement.
      */}
      <div className="beyond-flash" />
      <div className="beyond-title">
        <span className="beyond-title__kicker">{dict.ui.beyond.kicker}</span>
        <strong className="beyond-title__name">{dict.ui.beyond.name}</strong>
        <span className="beyond-title__hint">{dict.ui.beyond.hint}</span>
      </div>
    </>
  )
}
