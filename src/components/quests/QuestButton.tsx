import { useEffect, useRef, useState } from 'react'
import { useIsTouchDevice } from '../../config/device'
import { useI18n } from '../../i18n/useI18n'
import { useTouchHintsVisible } from '../../state/touchHints'
import { useActiveQuest } from '../../store/quests'
import { useGameStore } from '../../store/useGameStore'

/**
 * Pastille d'accès au journal de quêtes, à gauche de celle de l'inventaire.
 *
 * Deux rondes côte à côte plutôt qu'une troisième ligne dans la colonne, et ce
 * n'est pas qu'une affaire de place : les trois gélules du dessus règlent la
 * *page* (son, qualité, langue), ces deux-là ouvrent le **jeu**. Les ranger
 * ensemble dit à quelle famille elles appartiennent avant qu'on ait lu leurs
 * icônes. Sur mobile, ça garde aussi la hauteur de la colonne — dont dépend le
 * décalage des cœurs, calculé en CSS (voir `.hud__top` dans `index.css`).
 *
 * **À monter avec `key={runId}`** — voir `App.tsx`, et l'en-tête d'
 * `InventoryButton`, qui porte la même contrainte pour la même raison : les
 * deux états locaux ci-dessous sont des faits d'interface, pas de partie, et ils
 * doivent repartir de zéro quand une nouvelle partie commence.
 */
export function QuestButton() {
  const { dict } = useI18n()
  const phase = useGameStore((state) => state.phase)
  const questsOpen = useGameStore((state) => state.questsOpen)
  const openQuests = useGameStore((state) => state.openQuests)
  const active = useActiveQuest()
  const isTouch = useIsTouchDevice()
  const touchHints = useTouchHintsVisible()

  /**
   * Quête en cours lors du dernier passage dans le journal, ou `null`.
   *
   * Local et non dans le store, comme le compteur d'objets vus de la besace :
   * c'est une information d'interface — « le journal a-t-il été rouvert
   * depuis ? » — sans aucun effet sur la partie.
   */
  const [seen, setSeen] = useState<string | null>(null)
  /**
   * Le journal a-t-il été ouvert **une fois** dans cette partie ?
   *
   * C'est ce qui efface la bulle, et rien d'autre : ni un minuteur, ni le
   * premier contact avec l'écran comme pour les bulles tactiles. Une bulle qui
   * dit « il y a quelque chose à faire, c'est là » n'a rempli son office que
   * quand on y est allé ; la retirer avant, c'est la retirer à ceux qui ne
   * l'ont pas encore lue.
   *
   * Écrit depuis le clic et non depuis un effet sur `questsOpen` : c'est le
   * geste du joueur qui l'apprend, et un `setState` posé dans un effet pour
   * observer un état qu'on vient soi-même de changer déclenche un rendu de plus
   * pour rien.
   */
  const [opened, setOpened] = useState(false)
  const wasOpen = useRef(false)

  useEffect(() => {
    // Marqué à la *fermeture* et non à l'ouverture : le point doit rester
    // visible pendant que le panneau est à l'écran, sinon il s'éteint sous les
    // doigts du joueur à l'instant précis où il le renseigne.
    if (wasOpen.current && !questsOpen) setSeen(active?.id ?? null)
    wasOpen.current = questsOpen
  }, [active?.id, questsOpen])

  const unseen = active !== null && active.id !== seen
  /*
    La bulle passe **après** les deux bulles tactiles, et jamais en même temps.

    Sur un téléphone, les trois s'affichaient ensemble au premier chargement :
    le joystick, le menu des lieux, et celle-ci. Trois encadrés sur un écran de
    390 points ne se lisent pas, ils se contournent — et celle qu'on veut faire
    lire est justement la seule des trois qui demande une action précise. Elle
    attend donc que le premier contact ait effacé les deux autres (voir
    `state/touchHints.ts`), puis prend l'écran pour elle seule.

    Sur une machine à souris, `touchHints` ne concerne personne et la bulle
    paraît d'emblée.
  */
  const showHint = !opened && phase === 'playing' && !(isTouch && touchHints)

  return (
    <div className="quest-cue">
      {showHint && (
        <p className="touch-hint touch-hint--quest">
          <svg
            className="touch-hint__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* Un point d'exclamation : le signe universel de « quelque chose
                vous attend », lisible à dix-huit pixels là où un parchemin ne
                serait qu'une tache. */}
            <path d="M12 4v10" />
            <path d="M12 19.2v.1" />
          </svg>
          {dict.ui.quests.hint}
        </p>
      )}

      <button
        type="button"
        className="quest-button"
        aria-label={dict.ui.quests.open}
        aria-expanded={questsOpen}
        // Désactivée plutôt que démontée à l'écran de fin, comme sa voisine :
        // une pastille qui disparaît ferait sauter la mise en page de la rangée.
        disabled={phase !== 'playing'}
        onClick={() => {
          setOpened(true)
          openQuests()
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {/* Un parchemin roulé : la feuille, son rouleau en haut, et deux
              lignes d'écriture. */}
          <path
            d="M7 5.5h10.2a1.8 1.8 0 0 1 1.8 1.8V19a1.5 1.5 0 0 1-1.5 1.5H8A2.5 2.5 0 0 1 5.5 18V8a2.5 2.5 0 0 1 2.5-2.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 8a2.5 2.5 0 0 0 2.5 2.5h1.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M9.6 13.6h6M9.6 16.6h4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {unseen && <span className="quest-button__dot" aria-hidden="true" />}
      </button>
    </div>
  )
}
