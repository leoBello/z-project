import { useLocaleStore } from '../store/useLocaleStore'
import { dictionaries, type Dictionary, type Locale } from './index'

/**
 * Accès au dictionnaire courant.
 *
 * Pas de fonction `t('a.b.c')` : le dictionnaire est exposé tel quel et se lit
 * par propriété (`dict.ui.portfolio.next`). TypeScript vérifie alors chaque
 * clé sans qu'on ait à écrire de typage de chemins pointés, et une clé
 * renommée casse la compilation partout où elle est lue. C'est la même
 * approche que les objets de configuration du projet.
 */
export function useI18n(): {
  locale: Locale
  setLocale: (locale: Locale) => void
  dict: Dictionary
} {
  const locale = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)
  return { locale, setLocale, dict: dictionaries[locale] }
}
