import { create } from 'zustand'
import { track } from '../analytics'
import { LOCALES, type Locale } from '../i18n'

const STORAGE_KEY = 'z-project:locale'

/**
 * Langue de départ : le choix précédent du visiteur, sinon celle de son
 * navigateur, sinon le français.
 *
 * Les accès à `localStorage` sont sous `try` parce qu'ils *lèvent* — et pas
 * seulement renvoient `null` — quand le stockage de site est bloqué. Une
 * préférence de langue ne doit jamais empêcher le jeu de démarrer.
 */
function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale
    }
  } catch {
    // Stockage indisponible : on retombe sur la langue du navigateur.
  }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'fr'
}

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

/**
 * Annonce la langue de la page.
 *
 * `index.html` déclare `lang="en"` en dur, alors que le dictionnaire par défaut
 * est français : sans cet appel au premier rendu, un visiteur francophone
 * obtenait une page en français annoncée comme anglaise. Un lecteur d'écran la
 * lisait avec la prononciation anglaise, et le navigateur proposait de la
 * traduire — sur un portfolio justement bilingue, c'est le pire endroit pour
 * ce défaut. Il faut donc poser l'attribut à l'initialisation, pas seulement
 * quand l'utilisateur change de langue.
 */
function applyDocumentLanguage(locale: Locale) {
  document.documentElement.lang = locale
  return locale
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: applyDocumentLanguage(initialLocale()),
  setLocale: (locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // Non persistée, mais appliquée : la langue change quand même.
    }
    applyDocumentLanguage(locale)
    set({ locale })
    track('language_changed', { locale })
  },
}))
