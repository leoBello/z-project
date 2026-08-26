import en from './en.json'
import fr from './fr.json'

export const LOCALES = ['fr', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/**
 * Le français fait foi : c'est lui qui définit la forme du dictionnaire, et la
 * traduction anglaise doit s'y conformer. Une clé oubliée dans `en.json`
 * devient une erreur de compilation, pas un trou à l'écran découvert en démo.
 */
export type Dictionary = typeof fr

export const dictionaries: Record<Locale, Dictionary> = { fr, en }

/** Vrai seulement si `A` et `B` ont exactement la même forme, dans les deux sens. */
type Mirrors<A, B> = A extends B ? (B extends A ? true : false) : false

/**
 * Miroir des deux dictionnaires, vérifié à la compilation.
 *
 * L'annotation `Record<Locale, Dictionary>` ci-dessus ne contrôle qu'un sens :
 * une clé **manquante** dans `en.json` casse le build, une clé **en trop** y
 * passe inaperçue — `en` est un binding importé, pas un littéral frais, donc
 * TypeScript n'y applique pas la détection de propriétés excédentaires. Une
 * clé anglaise devenue orpheline après un renommage côté français resterait
 * donc en place indéfiniment, invisible.
 *
 * Cette constante force la vérification dans les deux sens. Elle est exportée
 * uniquement pour satisfaire `noUnusedLocals` : sa valeur ne sert à personne,
 * c'est son *type* qui travaille. Si elle refuse de compiler, comparer les
 * clés des deux fichiers.
 */
export const DICTIONARIES_MIRROR: Mirrors<typeof fr, typeof en> = true

/**
 * Substitution `{clé}` dans une chaîne traduite.
 *
 * Volontairement minimal. Le projet n'a besoin ni de pluriels ICU ni de
 * formatage de dates — les deux seuls cas pluriels ont leur propre clé. Une
 * bibliothèque d'internationalisation coûterait plus que les six lignes
 * ci-dessous, pour un jeu dont tout le texte tient en une page.
 */
export function format(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

// Exposé en développement pour basculer la langue depuis la console ou depuis
// un test navigateur, sans avoir à cliquer dans le HUD.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__i18n = { LOCALES, dictionaries }
}
