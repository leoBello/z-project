import { useEffect, useRef } from 'react'
import {
  CHALLENGE_URGENT_MS,
  COUNTDOWN_MS,
  DIFFICULTIES,
  DURATIONS,
  categoryKey,
  durationById,
  formatElapsed,
  formatRemaining,
  rankFor,
} from '../config/challenge'
import { format } from '../i18n'
import { useI18n } from '../i18n/useI18n'
import { now as gameNow } from '../state/gameClock'
import { useGameStore } from '../store/useGameStore'
import { useDialogFocus } from './inventory/useDialogFocus'

/**
 * Tout ce que le défi du maître montre à l'écran.
 *
 * Quatre pièces, et elles ne sont jamais visibles ensemble : la proposition, le
 * décompte, le chronomètre, le résultat. Elles vivent dans un seul fichier parce
 * qu'elles décrivent **un seul enchaînement** — celui qu'on lit de haut en bas
 * ci-dessous — et que les séparer aurait obligé à retrouver dans quatre modules
 * l'ordre dans lequel ils se succèdent.
 *
 * **Le chronomètre ne passe pas par React, et c'est la décision du fichier.**
 * Un compte à rebours est, par nature, une valeur qui change à chaque image :
 * le poser dans un `useState` aurait re-rendu tout le sous-arbre soixante fois
 * par seconde pendant dix minutes, sur une carte qui porte déjà quatre-vingts
 * corps physiques et quatorze mille instances de végétation. Il est donc écrit
 * directement dans le DOM depuis une boucle `requestAnimationFrame`, exactement
 * comme la jauge de pourriture du Marais — voir `RotMeter`, qui a inauguré cet
 * idiome pour la même raison.
 *
 * Le **score et le compte de bêtes**, eux, passent par le store : une mort est
 * une transition, pas une valeur continue.
 *
 * Tout se mesure sur l'**horloge de jeu**. Ouvrir l'inventaire met la partie en
 * pause, donc arrête l'horloge, donc arrête le chronomètre : on ne gagne pas de
 * temps en lisant ses objets, et on ne perd pas son défi parce qu'on a été
 * interrompu. C'est la règle du projet, et c'est ici qu'elle se voit le plus.
 */

/**
 * Durée d'affichage du « GO ! », après la fin du décompte.
 *
 * En millisecondes de temps de jeu, comme le reste. Il déborde donc sur le début
 * du chronomètre, et c'est voulu : le mot doit rester lisible une demi-seconde
 * après le départ, sinon il clignote et personne ne le lit.
 */
const GO_MS = 700

/**
 * Le décompte et le chronomètre — une seule boucle pour les deux.
 *
 * Elle est montée pendant les deux phases actives du défi et démontée entre,
 * donc elle ne tourne pas quand il n'y a rien à compter. C'est aussi elle qui
 * **fait avancer la machine** : le passage du décompte au chronomètre et la fin
 * du temps sont décidés ici, parce que ce sont les deux seuls événements du jeu
 * dont la condition est une durée écoulée et non un geste du joueur.
 *
 * Personne d'autre ne pourrait le faire : un `setTimeout` courrait en temps
 * réel, donc continuerait pendant une pause — le défi se terminerait derrière un
 * panneau d'inventaire ouvert.
 *
 * **Le mode illimité compte à l'endroit.** Il n'a pas d'échéance, donc rien à
 * décompter : le bandeau montre le temps couru, et c'est le joueur qui arrête,
 * en revenant parler au maître.
 */
function ChallengeClock() {
  const phase = useGameStore((state) => state.challenge)
  const startedAt = useGameStore((state) => state.challengeStartedAt)
  const durationId = useGameStore((state) => state.challengeDuration)
  const kills = useGameStore((state) => state.challengeKills)
  const score = useGameStore((state) => state.challengeScore)
  const { dict } = useI18n()

  const limit = durationById(durationId).ms

  const strip = useRef<HTMLDivElement>(null)
  const time = useRef<HTMLSpanElement>(null)
  const cue = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const store = useGameStore.getState()
    let frame = 0
    /*
      Le dernier mot affiché, relu **dans le DOM** et non supposé vide.

      L'effet se relance au passage du décompte au chronomètre — la phase est
      dans ses dépendances — et repartir de la chaîne vide lui faisait oublier
      qu'un « GO ! » était à l'écran : le test d'effacement, qui exige un mot
      précédent, ne passait jamais.
    */
    let lastCue = cue.current?.textContent ?? ''

    const draw = () => {
      const elapsed = gameNow() - startedAt

      if (elapsed < COUNTDOWN_MS) {
        /*
          Le décompte. `Math.ceil` sur le temps **restant** : à 2,4 s de la fin
          il reste « 3 », et le chiffre change à l'instant où la seconde tombe.
          Un `floor` sur le temps écoulé aurait affiché « 3 » pendant la première
          seconde, c'est-à-dire décompté 3, 2, 1 avec une seconde de retard sur
          ce que le joueur compte dans sa tête.
        */
        const left = Math.ceil((COUNTDOWN_MS - elapsed) / 1000)
        const text = left > 0 ? String(left) : dict.ui.challenge.go
        if (cue.current && text !== lastCue) {
          lastCue = text
          cue.current.textContent = text
          // Remonter l'élément par sa clé serait un rendu React par seconde ;
          // relancer l'animation à la main coûte deux lignes et zéro rendu.
          cue.current.classList.remove('challenge__cue--beat')
          void cue.current.offsetWidth
          cue.current.classList.add('challenge__cue--beat')
        }
      } else if (phase === 'countdown') {
        // Le départ. Il est décidé ici et nulle part ailleurs : c'est la seule
        // boucle du jeu qui sache lire une durée sur l'horloge de jeu.
        store.beginChallenge()
      }

      if (phase === 'running') {
        const ran = elapsed - COUNTDOWN_MS
        if (limit === null) {
          // Illimité : le compteur monte, et rien ne s'arrête tout seul.
          if (time.current) time.current.textContent = formatElapsed(ran)
        } else {
          const remaining = limit - ran
          if (remaining <= 0) {
            store.endChallenge(false)
            return
          }
          if (time.current) time.current.textContent = formatRemaining(remaining)
          if (strip.current) {
            // Les dernières secondes, et rien d'autre. Un chronomètre qui
            // s'affole pendant une minute n'alarme plus personne au bout de
            // trois essais ; un qui change dix secondes avant la fin fait lever
            // les yeux.
            strip.current.dataset.state = remaining <= CHALLENGE_URGENT_MS ? 'urgent' : 'running'
          }
        }
        // Le « GO ! » déborde sur le départ, puis s'efface.
        if (cue.current && elapsed > COUNTDOWN_MS + GO_MS && lastCue !== '') {
          lastCue = ''
          cue.current.textContent = ''
        }
      }

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [phase, startedAt, limit, dict])

  return (
    <>
      <div ref={cue} className="challenge__cue" aria-hidden="true" />
      <div ref={strip} className="challenge" data-state={phase}>
        <div className="challenge__cell">
          <span className="challenge__label">
            {limit === null ? dict.ui.challenge.elapsedLabel : dict.ui.challenge.timeLabel}
          </span>
          {/* La valeur de départ est écrite dans le JSX et non laissée vide :
              entre le montage et la première image, le bandeau afficherait
              sinon un trou à la place du chronomètre. */}
          <span ref={time} className="challenge__time">
            {limit === null ? formatElapsed(0) : formatRemaining(limit)}
          </span>
        </div>
        {/* Le score d'abord, le compte ensuite : c'est le score qu'on joue, et
            le compte n'est là que pour dire de combien de têtes il est fait. */}
        <div className="challenge__cell">
          <span className="challenge__label">{dict.ui.challenge.scoreLabel}</span>
          <span className="challenge__score">{score}</span>
        </div>
        <div className="challenge__cell">
          <span className="challenge__label">{dict.ui.challenge.killsLabel}</span>
          <span className="challenge__kills">{kills}</span>
        </div>
      </div>
    </>
  )
}

/**
 * Une rangée de choix : la difficulté, ou la durée.
 *
 * Des boutons et non un `<select>`, pour trois raisons : les options sont peu
 * nombreuses et doivent toutes être visibles d'un coup ; le jeu n'a pas un seul
 * menu déroulant et en introduire un ici aurait fait tache ; et surtout un
 * bouton se pointe au pouce, ce qui compte sur une carte qu'on joue aussi au
 * tactile.
 */
function ChoiceRow<T extends string>({
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
    <div className="challenge-pick">
      <span className="challenge-pick__label">{label}</span>
      <div className="challenge-pick__row" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="challenge-pick__option"
            // `aria-pressed` et non une classe seule : au lecteur d'écran, une
            // rangée de boutons sans état dit trois fois la même chose.
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
 * La proposition du maître — et le seul endroit du jeu où l'on règle quelque
 * chose qui ne soit pas un réglage de page.
 *
 * Même cadre que les autres modales du jeu — voile sombre, carte centrée — parce
 * que les écrans modaux doivent se reconnaître avant d'être lus. Ce qui la
 * distingue est qu'elle porte **des choix** : trois difficultés, quatre durées,
 * et le record de la catégorie qu'ils désignent. Ce record est le seul texte de
 * l'écran qui change quand on clique ailleurs, et c'est voulu : il dit ce qu'il
 * y a à battre **ici**, pas ce qu'on a fait de mieux en général.
 *
 * Le piège de focus est celui de l'inventaire et du journal, repris tel quel :
 * la partie est en pause derrière, et une tabulation qui sortirait du panneau
 * irait promener le curseur sur des contrôles inertes.
 */
function SenseiOffer() {
  const difficulty = useGameStore((state) => state.challengeDifficulty)
  const duration = useGameStore((state) => state.challengeDuration)
  const bests = useGameStore((state) => state.challengeBests)
  const setDifficulty = useGameStore((state) => state.setChallengeDifficulty)
  const setDuration = useGameStore((state) => state.setChallengeDuration)
  const accept = useGameStore((state) => state.acceptChallenge)
  const close = useGameStore((state) => state.closeSenseiOffer)
  const { dict } = useI18n()
  const panel = useRef<HTMLDivElement>(null)
  useDialogFocus(panel, close)

  const best = bests[categoryKey(duration, difficulty)]

  return (
    <div className="gameover challenge-modal">
      <div
        ref={panel}
        className="gameover__panel challenge-modal__panel"
        role="dialog"
        aria-modal="true"
      >
        <span className="challenge-modal__who">{dict.ui.challenge.senseiName}</span>
        <h1>{dict.ui.challenge.offerTitle}</h1>
        <p className="challenge-modal__body">{dict.ui.challenge.offerBody}</p>

        <ChoiceRow
          label={dict.ui.challenge.difficultyLabel}
          options={DIFFICULTIES.map((entry) => ({
            id: entry.id,
            label: dict.ui.challenge.difficulties[entry.id],
          }))}
          value={difficulty}
          onPick={setDifficulty}
        />
        <ChoiceRow
          label={dict.ui.challenge.durationLabel}
          options={DURATIONS.map((entry) => ({
            id: entry.id,
            label: dict.ui.challenge.durations[entry.id],
          }))}
          value={duration}
          onPick={setDuration}
        />

        <p className="challenge-modal__best">
          {best
            ? format(dict.ui.challenge.offerBest, { score: best.score, count: best.kills })
            : dict.ui.challenge.offerNoBest}
        </p>

        <div className="challenge-modal__actions">
          <button type="button" onClick={accept}>
            {dict.ui.challenge.accept}
          </button>
          <button type="button" className="challenge-modal__ghost" onClick={close}>
            {dict.ui.challenge.decline}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Le résultat — le temps écoulé, le joueur tombé, ou le joueur qui a décidé
 * d'arrêter.
 *
 * Il dit quatre choses dans cet ordre : ce qui s'est passé, combien de points,
 * de combien de têtes, et ce que ça vaut. Le rang est le seul des quatre qui ne
 * soit pas un fait : « quatre cent dix » ne veut rien dire tant qu'on ne sait
 * pas si c'est bien, et c'est tout ce que `rankFor` existe pour dire. Il se
 * mesure en points **par minute**, ce qui le rend comparable entre une course de
 * deux minutes et une de dix.
 *
 * **Deux sorties, et c'est une correction.** La première version n'en offrait
 * qu'une, libellée « Revenir au Sanctuaire », qui ne ramenait nulle part : le
 * joueur restait au milieu de la carte devant un bouton qui avait promis autre
 * chose. Les deux existent maintenant pour de bon, et celle qui ne bouge
 * personne est en premier — on peut être interrompu par un chronomètre en plein
 * combat, et l'interface n'a pas à décider de la fin de ce combat.
 */
function ChallengeResult() {
  const score = useGameStore((state) => state.challengeResult)
  const kills = useGameStore((state) => state.challengeResultKills)
  const ranMs = useGameStore((state) => state.challengeResultMs)
  const failed = useGameStore((state) => state.challengeFailed)
  const difficulty = useGameStore((state) => state.challengeDifficulty)
  const duration = useGameStore((state) => state.challengeDuration)
  const bests = useGameStore((state) => state.challengeBests)
  const dismiss = useGameStore((state) => state.dismissChallengeResult)
  const goHome = useGameStore((state) => state.returnToSanctuary)
  const { dict } = useI18n()
  const panel = useRef<HTMLDivElement>(null)
  useDialogFocus(panel, dismiss)

  const points = score ?? 0
  const best = bests[categoryKey(duration, difficulty)]
  // Le record vient d'être écrit par `endChallenge`, donc l'égalité **est** le
  // nouveau record. Tester `>` ne l'aurait jamais trouvé.
  const isBest = best !== undefined && points >= best.score && points > 0

  return (
    <div className="gameover challenge-modal">
      <div
        ref={panel}
        className="gameover__panel challenge-modal__panel"
        role="dialog"
        aria-modal="true"
      >
        <span className="challenge-modal__who">
          {failed ? dict.ui.challenge.resultFailed : dict.ui.challenge.resultTitle}
        </span>
        <h1 className="challenge-modal__score">{points}</h1>
        <p className="challenge-modal__body">
          {kills === 0
            ? dict.ui.challenge.resultNone
            : format(
                kills === 1
                  ? dict.ui.challenge.resultScoreOne
                  : dict.ui.challenge.resultScoreMany,
                { count: kills },
              )}
        </p>
        <p className="challenge-modal__rank">{dict.ui.challenge.ranks[rankFor(points, ranMs)]}</p>
        <p className="challenge-modal__category">
          {dict.ui.challenge.durations[duration]} · {dict.ui.challenge.difficulties[difficulty]}
        </p>
        {/* Un record nul n'est pas un record : la ligne ne paraît que s'il y a
            quelque chose à battre. */}
        {isBest ? (
          <p className="challenge-modal__best challenge-modal__best--new">
            {dict.ui.challenge.resultNewBest}
          </p>
        ) : (
          best !== undefined &&
          best.score > 0 && (
            <p className="challenge-modal__best">
              {format(dict.ui.challenge.resultBest, { score: best.score })}
            </p>
          )
        )}

        <div className="challenge-modal__actions">
          <button type="button" onClick={dismiss}>
            {dict.ui.challenge.keepFighting}
          </button>
          <button type="button" className="challenge-modal__ghost" onClick={goHome}>
            {dict.ui.challenge.close}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ChallengeHUD() {
  const phase = useGameStore((state) => state.challenge)
  const offer = useGameStore((state) => state.senseiOffer)

  return (
    <>
      {(phase === 'countdown' || phase === 'running') && <ChallengeClock />}
      {phase === 'over' && <ChallengeResult />}
      {offer && <SenseiOffer />}
    </>
  )
}
