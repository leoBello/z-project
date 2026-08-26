import { LOCALES } from '../i18n'
import { useI18n } from '../i18n/useI18n'

/**
 * Sélecteur de langue.
 *
 * Un groupe de deux boutons plutôt qu'un `<select>` : il n'y a que deux
 * langues, et un bouton pressé montre l'état courant sans avoir à ouvrir quoi
 * que ce soit. `aria-pressed` porte cet état — c'est ce qui distingue une
 * bascule d'un simple bouton d'action pour un lecteur d'écran.
 *
 * Le libellé visible est le code de la langue (`FR`, `EN`), qui se lit dans
 * n'importe quelle langue ; le nom complet, lui, est traduit et passe par
 * `aria-label`, où la place ne manque pas.
 */
export function LanguageToggle() {
  const { locale, setLocale, dict } = useI18n()

  return (
    <div className="language" role="group" aria-label={dict.ui.language.label}>
      {LOCALES.map((code) => {
        const active = code === locale
        return (
          <button
            key={code}
            type="button"
            className={`language__button${active ? ' language__button--active' : ''}`}
            aria-pressed={active}
            aria-label={dict.ui.language[code]}
            onClick={() => setLocale(code)}
          >
            {code.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
