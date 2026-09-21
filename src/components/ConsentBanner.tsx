import { useI18n } from '../i18n/useI18n'
import { useConsentStore } from '../store/useConsentStore'

/**
 * Le bandeau de consentement, et la pastille qui permet de revenir dessus.
 *
 * **Pourquoi il est là.** Google Analytics dépose un cookie, et déposer un
 * cookie de mesure sans accord n'est pas permis en France. Le site a d'abord
 * essayé de s'en passer — mode consentement refusé pour tout le monde — mais un
 * relevé sans cookie n'apparaît nulle part dans GA4 : la propriété recevait
 * tout et n'affichait rien. Il fallait donc soit demander, soit renoncer à
 * Google. On demande.
 *
 * **Quatre décisions de forme, et chacune a sa raison :**
 *
 *  - **il ne paraît qu'une fois le monde chargé.** L'écran de chargement est la
 *    première image du portfolio, celle qui décide si le visiteur reste ; une
 *    boîte de dialogue posée devant coûterait plus de monde que la mesure n'en
 *    explique. Le drapeau vient de `BootScreen`, qui sait quand la scène est
 *    jouable ;
 *  - **il ne met pas la partie en pause et ne prend pas le focus.** Ce n'est
 *    pas une boîte modale : on peut l'ignorer et jouer, le refus étant l'état
 *    par défaut. Poser un `role="dialog"` ici aurait piégé le clavier d'un
 *    joueur qui n'a rien demandé ;
 *  - **les deux boutons ont exactement le même poids visuel.** Refuser doit
 *    être aussi simple qu'accepter — c'est la loi, et c'est aussi la seule
 *    façon de rendre la réponse honnête. Un « Accepter » coloré à côté d'un
 *    « Refuser » gris fabrique un consentement qui ne vaut rien ;
 *  - **le bouton rend la main après le clic.** `blur()` explicite : sans lui,
 *    le bouton garde le focus, et la barre d'espace — qui fait attaquer —
 *    rejouerait le clic au lieu d'atteindre le jeu.
 *
 * La pastille de réouverture ne paraît **qu'une fois la réponse donnée** : tant
 * que le bandeau est là, elle ferait doublon, et un visiteur qui n'a jamais
 * répondu n'a rien à rouvrir. C'est le pendant obligatoire de l'accord — on
 * doit pouvoir se rétracter aussi facilement qu'on a accepté.
 */
export function ConsentBanner() {
  const { dict } = useI18n()
  const choice = useConsentStore((state) => state.choice)
  const ready = useConsentStore((state) => state.ready)
  const reopened = useConsentStore((state) => state.reopened)
  const decide = useConsentStore((state) => state.decide)
  const reopen = useConsentStore((state) => state.reopen)

  // Rien tant que la scène n'est pas là : ni bandeau, ni pastille.
  if (!ready) return null

  if (choice !== null && !reopened) {
    return (
      <button
        type="button"
        className="consent-recall"
        aria-label={dict.ui.consent.reopen}
        title={dict.ui.consent.reopen}
        onClick={(event) => {
          event.currentTarget.blur()
          reopen()
        }}
      >
        <span aria-hidden="true">◍</span>
      </button>
    )
  }

  const answer = (next: 'granted' | 'denied') => (event: { currentTarget: HTMLButtonElement }) => {
    event.currentTarget.blur()
    decide(next)
  }

  return (
    // `aria-live="polite"` et non `role="alertdialog"` : le bandeau s'annonce
    // quand le lecteur d'écran a fini ce qu'il disait, sans interrompre ni
    // exiger une réponse avant de rendre la main.
    <section className="consent" aria-live="polite" aria-label={dict.ui.consent.label}>
      <p className="consent__text">
        {dict.ui.consent.body}
        {/* La phrase qui désamorce : refuser ne coupe rien au jeu, et la mesure
            sans cookie continue pour tout le monde. C'est vrai, et c'est ce qui
            permet à ce bandeau de tenir en deux lignes. */}
        <span className="consent__aside"> {dict.ui.consent.aside}</span>
      </p>
      <div className="consent__actions">
        <button type="button" className="consent__button" onClick={answer('denied')}>
          {dict.ui.consent.deny}
        </button>
        <button type="button" className="consent__button" onClick={answer('granted')}>
          {dict.ui.consent.accept}
        </button>
      </div>
    </section>
  )
}
