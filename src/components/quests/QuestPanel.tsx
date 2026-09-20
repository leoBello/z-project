import { useCallback, useEffect, useRef } from 'react'
import { format } from '../../i18n'
import { useI18n } from '../../i18n/useI18n'
import { useQuestBoard } from '../../store/quests'
import { useGameStore } from '../../store/useGameStore'
import { useDialogFocus } from '../inventory/useDialogFocus'

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Coche de quête accomplie. */
function DoneIcon() {
  return (
    <svg className="quests__mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 12.5 10 17.5 19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Le journal de quêtes.
 *
 * Même cadre et même voile que l'inventaire — les écrans modaux du jeu se
 * reconnaissent avant d'être lus — et même discipline de focus, reprise telle
 * quelle de `useDialogFocus` : `Échap` ferme, `Tab` tourne dans le panneau, et
 * les flèches sont avalées pour qu'elles ne fassent pas défiler la page sous le
 * panneau pendant qu'elles ne déplacent personne.
 *
 * Les quêtes **verrouillées ne s'affichent pas**. Un journal qui liste ce qui
 * viendra ensuite, fût-ce en points d'interrogation, raconte la partie avant
 * qu'elle ait lieu : on saurait dès la première minute qu'il y a une île, puis
 * un gardien, puis une épreuve. Ce qui est accompli, en revanche, reste — c'est
 * la seule trace que le jeu garde du chemin parcouru.
 */
export function QuestPanel() {
  const { dict } = useI18n()
  const questsOpen = useGameStore((state) => state.questsOpen)
  const closeQuests = useGameStore((state) => state.closeQuests)
  const board = useQuestBoard()

  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => closeQuests(), [closeQuests])
  useDialogFocus(panel, close)

  useEffect(() => {
    if (questsOpen) closeButton.current?.focus()
  }, [questsOpen])

  if (!questsOpen) return null

  const visible = board.filter((quest) => quest.state !== 'locked')
  const nothingToDo = visible.every((quest) => quest.state === 'done')

  return (
    <div className="quests">
      <div
        ref={panel}
        className="quests__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quests-title"
      >
        <button
          ref={closeButton}
          type="button"
          className="inventory__close"
          aria-label={dict.ui.quests.close}
          onClick={close}
        >
          <CloseIcon />
        </button>

        <h2 id="quests-title" className="inventory__title">
          {dict.ui.quests.title}
        </h2>

        <ul className="quests__list">
          {visible.map((quest) => {
            const done = quest.state === 'done'
            const entry = dict.ui.quests.entries[quest.id]
            return (
              <li
                key={quest.id}
                className={`quests__item${done ? ' quests__item--done' : ''}`}
              >
                <div className="quests__head">
                  <span className="quests__state">
                    {done ? <DoneIcon /> : <span className="quests__bullet" aria-hidden="true" />}
                    {done ? dict.ui.quests.done : dict.ui.quests.active}
                  </span>
                  {/* Le compte n'est montré que s'il y a quelque chose à
                      compter : « 0 / 1 » sur une quête qui se franchit d'un pas
                      n'informe de rien et fait passer un seuil pour une jauge. */}
                  {quest.target > 1 && (
                    <span className="quests__count">
                      {format(dict.ui.quests.progress, {
                        current: quest.current,
                        total: quest.target,
                      })}
                    </span>
                  )}
                </div>

                <strong className="quests__name">{entry.name}</strong>
                <p className="quests__goal">{entry.goal}</p>

                {quest.target > 1 && (
                  <div
                    className="quests__bar"
                    role="progressbar"
                    aria-valuenow={quest.current}
                    aria-valuemin={0}
                    aria-valuemax={quest.target}
                  >
                    <span
                      className="quests__fill"
                      style={{ width: `${(quest.current / quest.target) * 100}%` }}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {/* Entre l'arrivée sur l'île et la chute du gardien, il n'y a rien à
            faire, et le journal le dit plutôt que de laisser croire à un bug. */}
        {nothingToDo && <p className="inventory__empty">{dict.ui.quests.none}</p>}
      </div>
    </div>
  )
}
