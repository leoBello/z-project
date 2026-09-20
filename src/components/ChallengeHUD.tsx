import { useEffect, useRef } from 'react'
import {
  CHALLENGE_MS,
  CHALLENGE_URGENT_MS,
  COUNTDOWN_MS,
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
 * par seconde pendant deux minutes, sur une carte qui porte déjà quatre-vingts
 * ennemis et quatorze mille instances de végétation. Il est donc écrit
 * directement dans le DOM depuis une boucle `requestAnimationFrame`, exactement
 * comme la jauge de pourriture du Marais — voir `RotMeter`, qui a inauguré cet
 * idiome pour la même raison.
 *
 * Le **compteur de bêtes**, lui, passe par le store : une mort est une
 * transition, pas une valeur continue. Deux ou trois re-rendus par seconde dans
 * le pire des cas, c'est le prix normal d'un affichage réactif.
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
 */
function ChallengeClock() {
  const phase = useGameStore((state) => state.challenge)
  const startedAt = useGameStore((state) => state.challengeStartedAt)
  const kills = useGameStore((state) => state.challengeKills)
  const { dict } = useI18n()

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
      précédent, ne passait jamais. Le mot restait dans le DOM. Il était
      invisible, son animation s'étant achevée sur une opacité nulle, mais c'est
      le genre d'invisibilité qui tient à une règle de CSS et pas au code.
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
        const remaining = CHALLENGE_MS - (elapsed - COUNTDOWN_MS)
        if (remaining <= 0) {
          store.endChallenge(false)
          return
        }
        if (time.current) time.current.textContent = formatRemaining(remaining)
        if (strip.current) {
          // Les cinq dernières secondes, et rien d'autre. Un chronomètre qui
          // s'affole pendant vingt secondes n'alarme plus personne au bout de
          // trois essais ; un qui change cinq secondes avant la fin fait lever
          // les yeux.
          strip.current.dataset.state = remaining <= CHALLENGE_URGENT_MS ? 'urgent' : 'running'
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
  }, [phase, startedAt, dict])

  return (
    <>
      <div ref={cue} className="challenge__cue" aria-hidden="true" />
      <div ref={strip} className="challenge" data-state={phase}>
        <div className="challenge__cell">
          <span className="challenge__label">{dict.ui.challenge.timeLabel}</span>
          {/* La valeur de départ est écrite dans le JSX et non laissée vide :
              entre le montage et la première image, le bandeau afficherait
              sinon un trou à la place du chronomètre. */}
          <span ref={time} className="challenge__time">
            {formatRemaining(CHALLENGE_MS)}
          </span>
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
 * La proposition du maître.
 *
 * Même cadre que les autres modales du jeu — voile sombre, carte centrée — parce
 * que les écrans modaux doivent se reconnaître avant d'être lus. Ce qui la
 * distingue est qu'elle porte **deux** boutons : c'est le seul endroit du jeu où
 * l'on peut dire non.
 *
 * Le piège de focus est celui de l'inventaire et du journal, repris tel quel :
 * la partie est en pause derrière, et une tabulation qui sortirait du panneau
 * irait promener le curseur sur des contrôles inertes.
 */
function SenseiOffer() {
  const best = useGameStore((state) => state.challengeBest)
  const accept = useGameStore((state) => state.acceptChallenge)
  const close = useGameStore((state) => state.closeSenseiOffer)
  const { dict } = useI18n()
  const panel = useRef<HTMLDivElement>(null)
  useDialogFocus(panel, close)

  return (
    <div className="gameover challenge-modal">
      <div ref={panel} className="gameover__panel challenge-modal__panel" role="dialog" aria-modal="true">
        <span className="challenge-modal__who">{dict.ui.challenge.senseiName}</span>
        <h1>{dict.ui.challenge.offerTitle}</h1>
        <p className="challenge-modal__body">{dict.ui.challenge.offerBody}</p>
        {best !== null && (
          <p className="challenge-modal__best">
            {format(dict.ui.challenge.offerBest, { count: best })}
          </p>
        )}
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
 * Le résultat, une fois les deux minutes écoulées — ou le joueur tombé.
 *
 * Il dit trois choses dans cet ordre : ce qui s'est passé, combien, et ce que ça
 * vaut. Le rang est la seule des trois qui ne soit pas un fait : « dix-huit » ne
 * veut rien dire tant qu'on ne sait pas si c'est bien, et c'est tout ce que
 * `rankFor` existe pour dire.
 *
 * Le pluriel a ses propres clés plutôt qu'une règle, comme l'écran de fin :
 * « 1 adversaire au tapis » et « 2 adversaires au tapis » n'accordent pas
 * seulement le nom, et toutes les langues ne coupent pas au même endroit.
 */
function ChallengeResult() {
  const score = useGameStore((state) => state.challengeResult)
  const failed = useGameStore((state) => state.challengeFailed)
  const best = useGameStore((state) => state.challengeBest)
  const dismiss = useGameStore((state) => state.dismissChallengeResult)
  const { dict } = useI18n()
  const panel = useRef<HTMLDivElement>(null)
  useDialogFocus(panel, dismiss)

  const kills = score ?? 0
  // Le record vient d'être écrit par `endChallenge`, donc l'égalité **est** le
  // nouveau record. Tester `>` ne l'aurait jamais trouvé.
  const isBest = best !== null && kills >= best && kills > 0

  return (
    <div className="gameover challenge-modal">
      <div ref={panel} className="gameover__panel challenge-modal__panel" role="dialog" aria-modal="true">
        <span className="challenge-modal__who">
          {failed ? dict.ui.challenge.resultFailed : dict.ui.challenge.resultTitle}
        </span>
        <h1 className="challenge-modal__score">{kills}</h1>
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
        <p className="challenge-modal__rank">{dict.ui.challenge.ranks[rankFor(kills)]}</p>
        {/* Un record nul n'est pas un record : la ligne ne paraît que s'il y a
            quelque chose à battre. « Record de la partie : 0 » sous un score de
            zéro est la seule phrase que cet écran pouvait dire de trop. */}
        {isBest ? (
          <p className="challenge-modal__best challenge-modal__best--new">
            {dict.ui.challenge.resultNewBest}
          </p>
        ) : (
          best !== null &&
          best > 0 && (
            <p className="challenge-modal__best">
              {format(dict.ui.challenge.resultBest, { count: best })}
            </p>
          )
        )}
        <div className="challenge-modal__actions">
          <button type="button" onClick={dismiss}>
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
