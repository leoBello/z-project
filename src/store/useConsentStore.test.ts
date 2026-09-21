import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Le choix du visiteur, sa persistance, et ce qu'on en dit à Google.
 *
 * Ce qui se teste ici tient en une phrase : **le bandeau doit se refermer même
 * quand tout le reste échoue.** Un stockage refusé en navigation privée, un
 * script de mesure coupé par une extension — aucun des deux n'est une panne,
 * les deux sont le quotidien, et aucun ne doit laisser le visiteur devant un
 * bandeau qui ne répond pas.
 *
 * **Le stockage est posé à la main par ces tests, et ce n'est pas une ruse de
 * confort.** L'environnement de test n'expose aucun `localStorage` — happy-dom
 * ne le fournit pas, et celui de Node demande un drapeau de ligne de commande.
 * Le store y survit déjà, puisqu'il enveloppe chaque accès ; mais tester la
 * persistance demandait de fournir ce que le navigateur fournit. Le faux
 * ci-dessous est de vingt lignes et sait, en plus, échouer sur commande.
 */

const KEY = 'z-project:consent'

/** Un `localStorage` de test, qui peut refuser de répondre comme le vrai. */
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

/** Le store relit le stockage à l'import : chaque cas repart d'un module neuf. */
async function freshStore() {
  vi.resetModules()
  return (await import('./useConsentStore')).useConsentStore
}

beforeEach(() => {
  window.gtag = vi.fn()
})

afterEach(() => {
  delete window.gtag
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('le choix de consentement', () => {
  it('est vide tant que personne n a répondu', async () => {
    installStorage()
    const store = await freshStore()
    // `null` et non `'denied'` : c'est cette distinction qui fait apparaître le
    // bandeau une fois, plutôt que jamais ou à chaque visite.
    expect(store.getState().choice).toBeNull()
  })

  it('se souvient d une visite précédente', async () => {
    installStorage({ start: { [KEY]: 'granted' } })
    const store = await freshStore()
    expect(store.getState().choice).toBe('granted')
  })

  it('ignore une valeur abîmée plutôt que de la croire', async () => {
    installStorage({ start: { [KEY]: 'peut-être' } })
    const store = await freshStore()
    expect(store.getState().choice).toBeNull()
  })

  it('persiste la réponse et prévient Google', async () => {
    const data = installStorage()
    const store = await freshStore()
    store.getState().decide('granted')

    expect(data.get(KEY)).toBe('granted')
    expect(store.getState().choice).toBe('granted')
    expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'granted',
    })
    // La page vue du chargement est partie en relevé anonyme, que GA4 ne compte
    // pas : sans ce rappel, la session commencerait au milieu de nulle part.
    expect(window.gtag).toHaveBeenCalledWith('event', 'page_view')
  })

  it('révoque explicitement quand on se rétracte', async () => {
    const data = installStorage({ start: { [KEY]: 'granted' } })
    const store = await freshStore()
    store.getState().decide('denied')

    expect(data.get(KEY)).toBe('denied')
    expect(window.gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'denied',
    })
    expect(window.gtag).not.toHaveBeenCalledWith('event', 'page_view')
  })

  it('retient le choix même si le script de mesure est bloqué', async () => {
    installStorage()
    delete window.gtag
    const store = await freshStore()
    expect(() => store.getState().decide('granted')).not.toThrow()
    expect(store.getState().choice).toBe('granted')
  })

  it('applique le choix même si le stockage refuse d écrire', async () => {
    installStorage({ failing: true })
    const store = await freshStore()

    expect(() => store.getState().decide('denied')).not.toThrow()
    // Non persisté — le bandeau reviendra à la prochaine visite — mais appliqué
    // pour celle-ci, ce qui est le bon sens du compromis : redemander est légal,
    // présumer l'accord ne l'est pas.
    expect(store.getState().choice).toBe('denied')
  })

  it('démarre même sans aucun stockage', async () => {
    // Le cas réel de cet environnement de test, et celui d'un navigateur qui
    // bloque tout : `localStorage` n'existe pas du tout.
    const store = await freshStore()
    expect(store.getState().choice).toBeNull()
    expect(() => store.getState().decide('granted')).not.toThrow()
  })
})

describe('la réouverture', () => {
  it('ramène le bandeau, et le referme à la réponse suivante', async () => {
    installStorage()
    const store = await freshStore()
    store.getState().decide('denied')
    expect(store.getState().reopened).toBe(false)

    store.getState().reopen()
    expect(store.getState().reopened).toBe(true)

    store.getState().decide('granted')
    expect(store.getState().reopened).toBe(false)
  })
})

describe('le signal de fin de chargement', () => {
  it('part faux, pour ne pas poser le bandeau devant l écran de chargement', async () => {
    installStorage()
    const store = await freshStore()
    expect(store.getState().ready).toBe(false)
    store.getState().markReady()
    expect(store.getState().ready).toBe(true)
  })
})
