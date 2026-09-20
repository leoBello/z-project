import { useId } from 'react'
import { format } from '../../i18n'
import { useI18n } from '../../i18n/useI18n'
import { PSEUDO_MAX, cleanPseudo, isPseudoValid } from '../../scores/entry'
import { scoresAvailable } from '../../scores/firestore'
import { useGameStore } from '../../store/useGameStore'
import { useScoresStore } from '../../store/useScoresStore'

/**
 * Le formulaire d'enregistrement, sous le score, dans le panneau de résultat.
 *
 * **Il n'apparaît pas toujours, et les trois conditions ne se valent pas :**
 *
 *  - *le joueur est encore debout.* C'est la règle du classement et la seule qui
 *    soit une règle de jeu : un défi interrompu par une mort a produit un score,
 *    mais pas une course. Elle est appliquée ici, à l'affichage, plutôt que
 *    refusée à l'envoi — un bouton grisé aurait invité à demander pourquoi, et
 *    la réponse est déjà écrite en haut du panneau, « Vous êtes tombé » ;
 *  - *le score n'est pas nul.* Zéro point est une ligne de tableau qui
 *    n'apprend rien à personne, et l'occasion d'en poser autant qu'on veut ;
 *  - *Firebase répond présent.* Sans `.env`, le jeu est complet et le classement
 *    n'existe pas. Rien ne le mentionne, parce qu'il n'y a rien à en faire.
 *
 * **Et il ne force rien.** Il n'y a pas de bouton « ne pas enregistrer » :
 * fermer le panneau suffit, et c'est déjà ce que font les deux boutons du bas.
 * Un refus explicite aurait fait de l'enregistrement une étape obligatoire du
 * défi, alors qu'il en est une conséquence facultative.
 */
export function ScoreSubmit() {
  const failed = useGameStore((state) => state.challengeFailed)
  const score = useGameStore((state) => state.challengeResult)
  const kills = useGameStore((state) => state.challengeResultKills)
  const ranMs = useGameStore((state) => state.challengeResultMs)
  const duration = useGameStore((state) => state.challengeDuration)
  const difficulty = useGameStore((state) => state.challengeDifficulty)
  const outfit = useGameStore((state) => state.challengeResultOutfit)
  const weapon = useGameStore((state) => state.challengeResultWeapon)

  const pseudo = useScoresStore((state) => state.pseudo)
  const setPseudo = useScoresStore((state) => state.setPseudo)
  const status = useScoresStore((state) => state.saveStatus)
  const saved = useScoresStore((state) => state.saved)
  const save = useScoresStore((state) => state.save)
  const openBoard = useScoresStore((state) => state.openBoard)

  const { dict } = useI18n()
  const field = useId()

  const points = score ?? 0
  if (failed || points <= 0 || !scoresAvailable()) return null

  const showBoard = () => openBoard({ duration, difficulty })

  /*
    Enregistré : le formulaire cède la place aux deux places.

    La première est celle de la catégorie, toutes tenues confondues — c'est le
    classement, au singulier. La seconde ne paraît que si elle apprend quelque
    chose : sur une catégorie où personne n'a encore joué la même tenue, « 1er
    sur 1 » n'est pas un rang, c'est une tautologie.
  */
  if (status === 'saved' && saved) {
    const { overall, loadout } = saved
    return (
      <div className="scores-submit scores-submit--done">
        <p className="scores-submit__standing">
          {format(dict.ui.scores.standing, { rank: overall.rank, total: overall.total })}
        </p>
        {loadout.total > 1 && (
          <p className="scores-submit__standing scores-submit__standing--loadout">
            {format(dict.ui.scores.standingLoadout, {
              rank: loadout.rank,
              total: loadout.total,
              outfit: dict.ui.scores.outfits[saved.entry.outfit],
              weapon: dict.ui.scores.weapons[saved.entry.weapon],
            })}
          </p>
        )}
        <button type="button" className="scores-submit__board" onClick={showBoard}>
          {dict.ui.scores.openBoard}
        </button>
      </div>
    )
  }

  const busy = status === 'saving'
  const ready = isPseudoValid(pseudo) && !busy

  return (
    <form
      className="scores-submit"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        void save({
          pseudo: cleanPseudo(pseudo),
          score: points,
          kills,
          ranMs,
          duration,
          difficulty,
          outfit,
          weapon,
          // `Date.now()` et non l'horloge de jeu : c'est la seule date du projet
          // qui désigne un instant du monde réel plutôt qu'un instant de la
          // partie. Tout le reste se compte en temps de jeu — ce champ-là
          // s'affiche dans une colonne et se lit par un autre joueur.
          at: Date.now(),
        })
      }}
    >
      <label className="scores-submit__label" htmlFor={field}>
        {dict.ui.scores.pseudoLabel}
      </label>
      <div className="scores-submit__row">
        <input
          id={field}
          className="scores-submit__input"
          type="text"
          value={pseudo}
          maxLength={PSEUDO_MAX}
          placeholder={dict.ui.scores.pseudoPlaceholder}
          // Le jeu se pilote au clavier, et trois écouteurs de `window` guettent
          // les touches : les commandes de drei, le code de triche, et le piège
          // de focus du panneau. Un pseudo tapé ici traverserait les trois — on
          // ferait courir le joueur en écrivant son nom, et « ZQSD » finirait
          // par déclencher l'œuf de Pâques. React pose ses écouteurs sur la
          // racine, donc arrêter la propagation ici suffit à les couper tous.
          //
          // **Sauf Échap**, qui doit continuer à fermer le panneau : c'est la
          // sortie de secours de toutes les modales du jeu, et la perdre parce
          // qu'un curseur clignote dans un champ serait un piège.
          onKeyDown={(event) => {
            if (event.key !== 'Escape') event.stopPropagation()
          }}
          onKeyUp={(event) => {
            if (event.key !== 'Escape') event.stopPropagation()
          }}
          onChange={(event) => setPseudo(event.target.value)}
          disabled={busy}
          autoComplete="nickname"
        />
        <button type="submit" disabled={!ready}>
          {busy ? dict.ui.scores.saving : dict.ui.scores.save}
        </button>
      </div>
      {status === 'error' && <p className="scores-submit__error">{dict.ui.scores.saveError}</p>}
      <button type="button" className="scores-submit__board" onClick={showBoard}>
        {dict.ui.scores.openBoard}
      </button>
    </form>
  )
}
