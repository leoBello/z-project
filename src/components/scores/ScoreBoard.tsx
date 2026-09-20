import { useEffect, useMemo, useRef } from 'react'
import { formatElapsed } from '../../config/challenge'
import { useI18n } from '../../i18n/useI18n'
import {
  ANY,
  FILTER_DIFFICULTIES,
  FILTER_DURATIONS,
  FILTER_OUTFITS,
  FILTER_WEAPONS,
} from '../../scores/entry'
import { useScoresStore, visibleScores } from '../../store/useScoresStore'
import { useDialogFocus } from '../inventory/useDialogFocus'

/**
 * Le tableau des scores : quatre sélecteurs et une colonne de lignes.
 *
 * **Les quatre filtres ne font pas le même travail, et l'interface ne le dit
 * pas — elle n'a pas à le dire.** La durée et la difficulté désignent *la
 * catégorie*, donc ce qui est chargé depuis la base ; la tenue et l'arme sont
 * des tamis posés sur ce qui est déjà là. Pour le joueur, ce sont quatre listes
 * identiques ; pour le réseau, deux d'entre elles sont gratuites. C'est tout
 * l'intérêt d'avoir chargé la catégorie entière — voir `scores/firestore.ts`.
 *
 * **Le rang est celui de la vue.** Quand on demande « toutes tenues », le
 * premier est le premier du classement ; quand on demande « Tenue du Clan », le
 * premier est le meilleur de ceux qui l'ont portée, et il peut être onzième au
 * général. C'est la lecture qu'on attend d'un filtre, et la seule qui réponde à
 * la question qu'on pose en le posant : *qu'est-ce que vaut cette tenue ?*
 *
 * Il se pose **par-dessus** la proposition du maître ou l'écran de résultat, qui
 * sont ses deux portes d'entrée et qui ont déjà mis la partie en pause. Il ne
 * touche donc pas à `phase` : voir l'en-tête de `useScoresStore`.
 */

/** Un sélecteur de filtre : la même rangée de boutons que celle du panneau du maître. */
function FilterRow<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onPick: (id: T) => void
}) {
  return (
    <div className="challenge-pick scores-board__filter">
      <span className="challenge-pick__label">{label}</span>
      <div className="challenge-pick__row" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="challenge-pick__option"
            aria-pressed={option.id === value}
            onClick={() => onPick(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * La date d'une ligne, dans la langue du joueur.
 *
 * `Intl` et non un format écrit à la main : c'est la seule date du jeu qui soit
 * une date du monde réel, et l'ordre jour/mois n'est pas le même des deux côtés
 * de la Manche pour un jeu qui se joue en français et en anglais.
 */
function useDateFormat() {
  const { locale } = useI18n()
  return useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  )
}

/**
 * Le tableau, **monté seulement quand il est ouvert**.
 *
 * Le parent porte la condition et ce composant ne la reprend pas : il installe
 * un piège de focus et un écouteur de touches sur `window`, et les laisser
 * tourner derrière un `return null` aurait avalé Échap et les flèches pendant
 * toute la partie.
 */
export function ScoreBoard() {
  const filter = useScoresStore((state) => state.filter)
  const entries = useScoresStore((state) => state.entries)
  const status = useScoresStore((state) => state.status)
  const mine = useScoresStore((state) => state.mine)
  const setFilter = useScoresStore((state) => state.setFilter)
  const reload = useScoresStore((state) => state.reload)
  const close = useScoresStore((state) => state.closeBoard)

  const { dict } = useI18n()
  const dates = useDateFormat()
  const panel = useRef<HTMLDivElement>(null)
  const ownRow = useRef<HTMLTableRowElement>(null)
  useDialogFocus(panel, close)

  const rows = useMemo(() => visibleScores(entries, filter), [entries, filter])

  /*
    **Échap ferme le tableau, et rien d'autre.**

    C'est le premier panneau du jeu à s'ouvrir par-dessus un autre : sous lui il
    y a toujours la proposition du maître ou l'écran de résultat, qui écoutent
    Échap eux aussi. Sans cette interception, une seule pression fermait les
    deux — le joueur revenait au jeu alors qu'il voulait revenir à son score.

    En phase de **capture**, donc avant les deux autres, et
    `stopImmediatePropagation` pour que l'événement ne redescende nulle part.
    C'est le seul endroit du jeu qui en ait besoin, et c'est parce qu'il est le
    seul à être empilé.
  */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [close])

  /*
    Le focus entre dans le panneau à l'ouverture.

    Il était resté sur le bouton qui a ouvert le tableau, c'est-à-dire dans le
    panneau **du dessous** : une tabulation depuis là serait allée promener le
    curseur sur des contrôles masqués par le voile. Le panneau lui-même le
    reçoit — `tabIndex={-1}` — plutôt qu'un de ses boutons, pour que la première
    tabulation aille au premier filtre et non au second.
  */
  useEffect(() => {
    panel.current?.focus()
  }, [])

  /*
    La ligne du joueur est amenée sous les yeux.

    Un classement de cent lignes ouvert après un enregistrement s'ouvre sur son
    premier, et celui qui vient de finir quarante-deuxième ne voit rien de ce
    qu'il est venu chercher. Le défilement est instantané et non animé : le
    panneau vient de s'ouvrir, une glissade depuis une position qu'on n'a jamais
    vue n'a rien à raconter.
  */
  useEffect(() => {
    ownRow.current?.scrollIntoView({ block: 'center' })
  }, [rows])

  const label = {
    duration: (id: (typeof FILTER_DURATIONS)[number]) => dict.ui.challenge.durations[id],
    difficulty: (id: (typeof FILTER_DIFFICULTIES)[number]) => dict.ui.challenge.difficulties[id],
    outfit: (id: (typeof FILTER_OUTFITS)[number]) =>
      id === ANY ? dict.ui.scores.anyOutfit : dict.ui.scores.outfits[id],
    weapon: (id: (typeof FILTER_WEAPONS)[number]) =>
      id === ANY ? dict.ui.scores.anyWeapon : dict.ui.scores.weapons[id],
  }

  return (
    <div className="gameover challenge-modal scores-board">
      <div
        ref={panel}
        className="gameover__panel challenge-modal__panel scores-board__panel"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={dict.ui.scores.title}
      >
        <h1 className="scores-board__title">{dict.ui.scores.title}</h1>

        <div className="scores-board__filters">
          <FilterRow
            label={dict.ui.challenge.durationLabel}
            options={FILTER_DURATIONS.map((id) => ({ id, label: label.duration(id) }))}
            value={filter.duration}
            onPick={(duration) => setFilter({ duration })}
          />
          <FilterRow
            label={dict.ui.challenge.difficultyLabel}
            options={FILTER_DIFFICULTIES.map((id) => ({ id, label: label.difficulty(id) }))}
            value={filter.difficulty}
            onPick={(difficulty) => setFilter({ difficulty })}
          />
          <FilterRow
            label={dict.ui.scores.outfitLabel}
            options={FILTER_OUTFITS.map((id) => ({ id, label: label.outfit(id) }))}
            value={filter.outfit}
            onPick={(outfit) => setFilter({ outfit })}
          />
          <FilterRow
            label={dict.ui.scores.weaponLabel}
            options={FILTER_WEAPONS.map((id) => ({ id, label: label.weapon(id) }))}
            value={filter.weapon}
            onPick={(weapon) => setFilter({ weapon })}
          />
        </div>

        {/* Les trois états de la lecture, et un seul à la fois. `aria-live` parce
            que le tableau se recharge sans que rien ne bouge autour : un lecteur
            d'écran n'aurait annoncé le changement de catégorie qu'au moment où
            l'utilisateur serait redescendu le lire. */}
        <div className="scores-board__body" aria-live="polite" aria-busy={status === 'loading'}>
          {status === 'loading' && <p className="scores-board__note">{dict.ui.scores.loading}</p>}
          {status === 'error' && (
            <p className="scores-board__note scores-board__note--error">
              {dict.ui.scores.loadError}{' '}
              <button type="button" className="scores-board__retry" onClick={() => void reload()}>
                {dict.ui.scores.retry}
              </button>
            </p>
          )}
          {status === 'ready' && rows.length === 0 && (
            <p className="scores-board__note">{dict.ui.scores.empty}</p>
          )}
          {status === 'ready' && rows.length > 0 && (
            <div className="scores-board__scroll">
              <table className="scores-table">
                <thead>
                  <tr>
                    <th scope="col" className="scores-table__rank">
                      {dict.ui.scores.columnRank}
                    </th>
                    <th scope="col">{dict.ui.scores.columnPseudo}</th>
                    <th scope="col" className="scores-table__num">
                      {dict.ui.scores.columnScore}
                    </th>
                    <th scope="col" className="scores-table__num">
                      {dict.ui.scores.columnKills}
                    </th>
                    <th scope="col" className="scores-table__num">
                      {dict.ui.scores.columnTime}
                    </th>
                    <th scope="col">{dict.ui.scores.columnOutfit}</th>
                    <th scope="col">{dict.ui.scores.columnWeapon}</th>
                    <th scope="col" className="scores-table__date">
                      {dict.ui.scores.columnDate}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry, index) => {
                    const isMine = entry.id === mine
                    return (
                      <tr
                        key={entry.id}
                        ref={isMine ? ownRow : undefined}
                        className={isMine ? 'scores-table__row--mine' : undefined}
                      >
                        <td className="scores-table__rank">{index + 1}</td>
                        <td className="scores-table__pseudo">{entry.pseudo}</td>
                        <td className="scores-table__num scores-table__points">{entry.score}</td>
                        <td className="scores-table__num">{entry.kills}</td>
                        <td className="scores-table__num">{formatElapsed(entry.ranMs)}</td>
                        <td>{dict.ui.scores.outfits[entry.outfit]}</td>
                        <td>{dict.ui.scores.weapons[entry.weapon]}</td>
                        <td className="scores-table__date">{dates.format(entry.at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="challenge-modal__actions">
          <button type="button" onClick={close}>
            {dict.ui.scores.back}
          </button>
        </div>
      </div>
    </div>
  )
}
