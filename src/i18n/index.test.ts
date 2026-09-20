import { describe, expect, it } from 'vitest'
import { LOCALES, dictionaries, format } from './index'

/**
 * Les dictionnaires, et la substitution.
 *
 * La **parité des clés** est déjà tenue à la compilation, dans les deux sens
 * (voir `DICTIONARIES_MIRROR`). Ce qu'un type ne peut pas voir, en revanche,
 * c'est ce qu'il y a *dans* les chaînes : une traduction vide passe le
 * typage — c'est une `string` — et se lit à l'écran comme un trou. Un
 * marqueur `{clé}` oublié dans la version anglaise passe aussi, et affiche une
 * phrase à laquelle il manque le nombre qu'elle annonçait.
 *
 * Les deux se découvrent en démo. Ils se découvrent ici à la place.
 */

/** Toutes les chaînes du dictionnaire, avec le chemin où on les a trouvées. */
function walk(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]]
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => walk(child, `${path}[${index}]`))
  }
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, child]) =>
      walk(child, path ? `${path}.${key}` : key),
    )
  }
  return []
}

const placeholders = (value: string) =>
  [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('les dictionnaires', () => {
  it('existent pour chaque langue annoncée', () => {
    for (const locale of LOCALES) {
      expect(dictionaries[locale], locale).toBeDefined()
    }
  })

  /**
   * Les vides **voulus**, et la seule façon de les distinguer des oublis.
   *
   * Une chaîne vide est un trou à l'écran dans tous les cas sauf un : quand le
   * composant qui la lit traite l'absence pour ce qu'elle est. C'est le cas du
   * baccalauréat, qui n'a pas de période affichée — `sections.ts` écrit
   * `entry.period || undefined`, et la ligne se rend alors sans sa mention.
   *
   * L'exception est donc nommée ici plutôt que la règle assouplie : le jour où
   * une autre chaîne se vide par accident, elle n'est pas dans cette liste.
   */
  const INTENTIONALLY_EMPTY = new Set(['education[2].period'])

  it('ne contiennent aucune chaîne vide', () => {
    for (const locale of LOCALES) {
      for (const [path, value] of walk(dictionaries[locale])) {
        if (INTENTIONALLY_EMPTY.has(path)) continue
        expect(value.trim(), `${locale}:${path}`).not.toBe('')
      }
    }
  })

  it('vide les mêmes chaînes dans les deux langues', () => {
    // Un vide voulu l'est dans toutes les langues ; un vide qui n'apparaît que
    // d'un côté est une traduction oubliée.
    const empties = (locale: (typeof LOCALES)[number]) =>
      walk(dictionaries[locale])
        .filter(([, value]) => value.trim() === '')
        .map(([path]) => path)

    for (const locale of LOCALES) {
      expect(empties(locale), locale).toEqual(empties('fr'))
    }
  })

  it('portent les mêmes marqueurs de substitution dans les deux langues', () => {
    // Un `{clé}` oublié à la traduction affiche une phrase à laquelle il manque
    // le nombre qu'elle annonçait — et le type ne voit rien.
    const fr = new Map(walk(dictionaries.fr))

    for (const locale of LOCALES) {
      for (const [path, value] of walk(dictionaries[locale])) {
        expect(placeholders(value), `${locale}:${path}`).toEqual(
          placeholders(fr.get(path) ?? ''),
        )
      }
    }
  })

  it('n ont pas de marqueur resté non fermé', () => {
    for (const locale of LOCALES) {
      for (const [path, value] of walk(dictionaries[locale])) {
        const opens = (value.match(/\{/g) ?? []).length
        const closes = (value.match(/\}/g) ?? []).length
        expect(opens, `${locale}:${path}`).toBe(closes)
      }
    }
  })

  it('couvrent la même arborescence, jusqu aux tableaux', () => {
    // La garde de compilation vaut sur les clés d'objet ; la longueur d'un
    // tableau de chaînes, elle, lui échappe.
    const paths = (locale: (typeof LOCALES)[number]) =>
      walk(dictionaries[locale]).map(([path]) => path)

    for (const locale of LOCALES) {
      expect(paths(locale), locale).toEqual(paths('fr'))
    }
  })
})

describe('format', () => {
  it('substitue ce qu on lui donne', () => {
    expect(format('{n} cœurs', { n: 3 })).toBe('3 cœurs')
  })

  it('substitue plusieurs marqueurs, y compris répétés', () => {
    expect(format('{a} et {b} et {a}', { a: 'x', b: 'y' })).toBe('x et y et x')
  })

  it('laisse en place un marqueur sans valeur', () => {
    // Mieux vaut voir `{n}` à l'écran qu'un « undefined » : le premier se
    // remarque et se corrige, le second ressemble à du texte.
    expect(format('{n} cœurs', {})).toBe('{n} cœurs')
  })

  it('accepte les nombres comme les chaînes', () => {
    expect(format('{a}{b}', { a: 0, b: '' })).toBe('0')
  })

  it('ne touche pas à une chaîne sans marqueur', () => {
    expect(format('rien à faire ici', { n: 1 })).toBe('rien à faire ici')
  })

  it('ignore une accolade seule', () => {
    expect(format('100 % { sûr', { n: 1 })).toBe('100 % { sûr')
  })

  it('reçoit une valeur pour chaque marqueur qu il rencontrera', () => {
    // Un marqueur nommé dans une chaîne mais jamais fourni est un trou ; on
    // vérifie au moins qu'aucune chaîne n'en porte de vide ou de douteux.
    for (const locale of LOCALES) {
      for (const [path, value] of walk(dictionaries[locale])) {
        for (const name of placeholders(value)) {
          expect(name, `${locale}:${path}`).not.toBe('')
        }
      }
    }
  })
})
