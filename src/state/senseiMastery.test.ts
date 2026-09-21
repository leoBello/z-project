import { afterEach, describe, expect, it } from 'vitest'
import {
  CATEGORY_COUNT,
  readMastery,
  sanitizeMastery,
  STORAGE_KEY,
  withMastered,
  writeMastery,
} from './senseiMastery'
import { categoryKey } from '../config/challenge'

const REAL = categoryKey('2min', 'normal')
const OTHER = categoryKey('10min', 'hard')

/**
 * Un `localStorage` de test, qui sait refuser de répondre comme le vrai.
 *
 * L'environnement de test n'en expose aucun — happy-dom ne le fournit pas, et
 * celui de Node demande un drapeau de ligne de commande. Même faux, et pour la
 * même raison, que celui de `useConsentStore.test.ts`.
 */
function installStorage({ start = {}, failing = false } = {}) {
  const data = new Map(Object.entries(start))
  const refuse = () => {
    throw new Error('stockage indisponible')
  }
  const storage = {
    get length() {
      return data.size
    },
    getItem: (key: string) => (failing ? refuse() : (data.get(key) ?? null)),
    setItem: (key: string, value: string) => (failing ? refuse() : void data.set(key, value)),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })
  return data
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('sanitizeMastery', () => {
  it('garde les clés de catégorie réelles', () => {
    expect(sanitizeMastery([REAL, OTHER])).toEqual([REAL, OTHER])
  })

  it('écarte les clés qui ne correspondent à aucune catégorie', () => {
    // Une sauvegarde trafiquée ferait autrement compter des cases inexistantes,
    // et le maître prendrait une forme que personne n'a gagnée.
    expect(sanitizeMastery([REAL, '99min/impossible', 'n’importe quoi'])).toEqual([REAL])
  })

  it('écarte ce qui n’est pas une chaîne', () => {
    expect(sanitizeMastery([REAL, 42, null, undefined, {}, [REAL]])).toEqual([REAL])
  })

  it('déduplique', () => {
    expect(sanitizeMastery([REAL, REAL, REAL])).toEqual([REAL])
  })

  it('renvoie une liste vide pour tout ce qui n’est pas un tableau', () => {
    expect(sanitizeMastery(null)).toEqual([])
    expect(sanitizeMastery('2min/normal')).toEqual([])
    expect(sanitizeMastery({ 0: REAL })).toEqual([])
  })

  it('ne peut jamais dépasser le nombre de catégories du jeu', () => {
    const flooded = Array.from({ length: 200 }, () => REAL)
    expect(sanitizeMastery(flooded).length).toBeLessThanOrEqual(CATEGORY_COUNT)
  })
})

describe('withMastered', () => {
  it('ajoute une clé absente', () => {
    expect(withMastered([], REAL)).toEqual([REAL])
  })

  it('ne duplique pas une clé déjà présente', () => {
    expect(withMastered([REAL], REAL)).toEqual([REAL])
  })

  it('ignore une clé qui n’est pas une catégorie', () => {
    expect(withMastered([REAL], 'inventée')).toEqual([REAL])
  })

  it('ne modifie pas la liste reçue', () => {
    const before = [REAL]
    const after = withMastered(before, OTHER)
    expect(before).toEqual([REAL])
    expect(after).toEqual([REAL, OTHER])
  })
})

describe('lecture et écriture', () => {
  it('relit ce qui a été écrit', () => {
    installStorage()
    writeMastery([REAL, OTHER])
    expect(readMastery()).toEqual([REAL, OTHER])
  })

  it('part de zéro quand rien n’a été écrit', () => {
    installStorage()
    expect(readMastery()).toEqual([])
  })

  it('part de zéro plutôt que de lever sur un contenu illisible', () => {
    installStorage({ start: { [STORAGE_KEY]: '{ceci n’est pas du JSON' } })
    expect(() => readMastery()).not.toThrow()
    expect(readMastery()).toEqual([])
  })

  it('nettoie au passage ce qui a été trafiqué à la main', () => {
    installStorage({ start: { [STORAGE_KEY]: JSON.stringify([REAL, 'triche/triche']) } })
    expect(readMastery()).toEqual([REAL])
  })

  it('ne lève pas quand le stockage est indisponible', () => {
    // Navigation privée, stockage désactivé, quota plein : `localStorage` lève,
    // il ne renvoie pas `null`. Sans le `try`, c'est le chargement de la carte
    // qui casse.
    installStorage({ failing: true })
    expect(() => writeMastery([REAL])).not.toThrow()
    expect(readMastery()).toEqual([])
  })

  it('survit à l’absence totale de stockage', () => {
    // Aucun `localStorage` défini du tout : la lecture doit rendre une liste
    // vide, pas une `ReferenceError`.
    Reflect.deleteProperty(globalThis, 'localStorage')
    expect(readMastery()).toEqual([])
    expect(() => writeMastery([REAL])).not.toThrow()
  })
})
