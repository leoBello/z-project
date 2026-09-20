import { beforeEach, describe, expect, it } from 'vitest'
import { dictionaries } from '../i18n'
import { resetClock } from '../state/gameClock'
import { currentInteraction, interactionLabel, triggerInteraction } from './interaction'
import { useGameStore } from './useGameStore'

/**
 * Ce que la touche d'interaction déclenche à l'instant présent.
 *
 * Quatre endroits ont besoin de le savoir — le raccourci clavier, le bouton
 * tactile, l'invite du HUD et le libellé accessible de ce bouton — et le pire
 * cas d'une divergence entre eux est **une invite qui promet une action et une
 * touche qui en fait une autre**. C'est donc la paire qu'on teste ensemble :
 * ce que l'invite annonce, et ce que la touche fait.
 */

const store = () => useGameStore.getState()
const dict = dictionaries.fr

/** Pose le joueur à portée des cibles nommées. */
function near(state: Partial<ReturnType<typeof store>>) {
  useGameStore.setState(state)
}

beforeEach(() => {
  store().reset()
  resetClock()
})

describe('la cible courante', () => {
  it('est nulle quand rien n est à portée', () => {
    expect(currentInteraction()).toBeNull()
  })

  it('désigne le monument, le coffre ou le portail à portée', () => {
    near({ nearbyLandmark: 'temple' })
    expect(currentInteraction()).toEqual({ kind: 'landmark', id: 'temple' })

    near({ nearbyLandmark: null, nearbyChest: 'temple-chest' })
    expect(currentInteraction()).toEqual({ kind: 'chest', id: 'temple-chest' })

    near({ nearbyChest: null, nearbyPortal: 'sky' })
    expect(currentInteraction()).toEqual({ kind: 'portal', to: 'sky' })
  })

  it('se tait dès que la partie n est plus en cours', () => {
    near({ nearbyChest: 'temple-chest' })

    useGameStore.setState({ phase: 'paused' })
    expect(currentInteraction()).toBeNull()

    useGameStore.setState({ phase: 'gameover' })
    expect(currentInteraction()).toBeNull()
  })
})

describe('la règle de priorité', () => {
  it('le portail l emporte sur tout', () => {
    near({
      nearbyPortal: 'sky',
      nearbySensei: true,
      nearbyChest: 'temple-chest',
      nearbyLandmark: 'temple',
    })

    expect(currentInteraction()).toEqual({ kind: 'portal', to: 'sky' })
  })

  it('le maître passe après le portail et avant le reste', () => {
    near({ nearbySensei: true, nearbyChest: 'temple-chest', nearbyLandmark: 'temple' })

    expect(currentInteraction()).toEqual({ kind: 'sensei' })
  })

  it('le coffre l emporte sur le monument', () => {
    near({ nearbyChest: 'temple-chest', nearbyLandmark: 'temple' })

    // Ce qui ne se produit qu'une fois gagne sur un panneau qui se rouvre à
    // volonté.
    expect(currentInteraction()).toEqual({ kind: 'chest', id: 'temple-chest' })
  })
})

describe('le libellé de l invite', () => {
  it('ne promet rien quand il n y a rien', () => {
    expect(interactionLabel(null, dict)).toBe('')
  })

  it('dit la destination du portail, et non le geste', () => {
    // Depuis l'île on peut partir vers le continent ou vers le Marais : la
    // carte de départ ne permet plus de déduire laquelle.
    const toSky = interactionLabel({ kind: 'portal', to: 'sky' }, dict)
    const toRot = interactionLabel({ kind: 'portal', to: 'rot' }, dict)

    expect(toSky).toBeTruthy()
    expect(toRot).toBeTruthy()
    expect(toSky).not.toBe(toRot)
  })

  it('annonce le geste du maître, pas ce qu il déclenche', () => {
    // Le défi se refuse : une invite qui promettrait de le lancer mentirait à
    // qui veut seulement écouter.
    expect(interactionLabel({ kind: 'sensei' }, dict)).toBe(dict.ui.challenge.talk)
  })

  it('annonce la clôture de la course pendant un défi', () => {
    useGameStore.setState({ challenge: 'running' })

    expect(interactionLabel({ kind: 'sensei' }, dict)).toBe(dict.ui.challenge.stop)
  })

  it('annonce la clôture dès le décompte', () => {
    useGameStore.setState({ challenge: 'countdown' })

    expect(interactionLabel({ kind: 'sensei' }, dict)).toBe(dict.ui.challenge.stop)
  })

  it('redit « parler » une fois le panneau de résultat ouvert', () => {
    useGameStore.setState({ challenge: 'over' })

    expect(interactionLabel({ kind: 'sensei' }, dict)).toBe(dict.ui.challenge.talk)
  })

  it('propose la section du monument, et non son nom', () => {
    const label = interactionLabel({ kind: 'landmark', id: 'temple' }, dict)

    expect(label).toBeTruthy()
    expect(label).not.toBe(dict.ui.landmarks.temple)
  })

  it('annonce l ouverture du coffre', () => {
    expect(interactionLabel({ kind: 'chest', id: 'temple-chest' }, dict)).toBe(
      dict.ui.chest.action,
    )
  })

  it('a un libellé pour toute cible que la touche sait déclencher', () => {
    // C'est la divergence à empêcher : une cible que la touche traite mais que
    // l'invite laisserait muette.
    near({ nearbyChest: 'temple-chest' })
    expect(interactionLabel(currentInteraction(), dict)).toBeTruthy()

    near({ nearbyChest: null, nearbyPortal: 'sky' })
    expect(interactionLabel(currentInteraction(), dict)).toBeTruthy()

    near({ nearbyPortal: null, nearbySensei: true })
    expect(interactionLabel(currentInteraction(), dict)).toBeTruthy()

    near({ nearbySensei: false, nearbyLandmark: 'temple' })
    expect(interactionLabel(currentInteraction(), dict)).toBeTruthy()
  })
})

describe('déclencher l interaction', () => {
  it('ne fait rien sans cible', () => {
    triggerInteraction()

    expect(store().phase).toBe('playing')
    expect(store().activeLandmark).toBeNull()
  })

  it('ouvre le coffre à portée', () => {
    near({ nearbyChest: 'temple-chest' })

    triggerInteraction()

    expect(store().chestReveal).toBe('temple-chest')
  })

  it('ouvre le panneau du monument à portée', () => {
    near({ nearbyLandmark: 'temple' })

    triggerInteraction()

    expect(store().activeLandmark).toBe('temple')
  })

  it('franchit le portail à portée', () => {
    near({ nearbyPortal: 'sky' })

    triggerInteraction()

    expect(store().transit).toBe('sky')
  })

  it('engage la conversation avec le maître', () => {
    near({ nearbySensei: true })

    triggerInteraction()

    expect(store().senseiOffer).toBe(true)
  })

  it('clôt la course au lieu de parler, pendant un défi', () => {
    // La seule façon d'arrêter un mode illimité, et la seule d'abandonner une
    // course de dix minutes sans mourir ni quitter la carte.
    near({ nearbySensei: true, location: 'beyond' })
    store().acceptChallenge()
    store().beginChallenge()

    triggerInteraction()

    expect(store().challenge).toBe('over')
    expect(store().challengeFailed).toBe(false)
    expect(store().senseiOffer).toBe(false)
  })

  it('clôt aussi pendant le décompte', () => {
    near({ nearbySensei: true, location: 'beyond' })
    store().acceptChallenge()

    triggerInteraction()

    expect(store().challenge).toBe('over')
  })

  it('fait ce que l invite annonçait, dans les quatre cas', () => {
    const cases = [
      { state: { nearbyChest: 'temple-chest' as const }, check: () => store().chestReveal },
      { state: { nearbyLandmark: 'temple' as const }, check: () => store().activeLandmark },
      { state: { nearbyPortal: 'sky' as const }, check: () => store().transit },
      { state: { nearbySensei: true }, check: () => store().senseiOffer },
    ]

    for (const { state, check } of cases) {
      store().reset()
      near(state)
      const announced = interactionLabel(currentInteraction(), dict)

      triggerInteraction()

      expect(announced).toBeTruthy()
      expect(check()).toBeTruthy()
    }
  })
})

/**
 * L'arbitrage entre les anneaux d'une même carte.
 *
 * Deux cartes en portent deux — l'Île Céleste depuis qu'elle mène au Marais, le
 * Marais depuis qu'il mène à l'Outremonde — et leurs deux boucles tournent côte
 * à côte, à chaque image, sur le même champ. Ce que ces tests fixent est la
 * seule règle qui les rende compatibles : **un anneau ne parle que de lui-même.**
 *
 * Le défaut qu'ils ferment ne ressemblait pas à un défaut de portail : il
 * s'ouvrait à une *victoire* — la chute du Lynel doré, puis celle de Malenia —
 * et il retirait au joueur le chemin du retour sans rien afficher d'anormal.
 */
describe('les cartes à deux anneaux', () => {
  it('l anneau lointain n efface pas l annonce du proche', () => {
    // L'ordre est celui des `useFrame` de la carte : le proche d'abord, le
    // lointain ensuite. C'est celui qui condamnait le retour.
    store().setNearbyPortal('continent', true)
    store().setNearbyPortal('rot', false)

    expect(store().nearbyPortal).toBe('continent')
  })

  it('et il ne l efface pas davantage dans l autre ordre', () => {
    store().setNearbyPortal('rot', false)
    store().setNearbyPortal('continent', true)

    expect(store().nearbyPortal).toBe('continent')
  })

  it('un anneau retire la sienne en s éloignant', () => {
    store().setNearbyPortal('continent', true)

    store().setNearbyPortal('continent', false)

    expect(store().nearbyPortal).toBeNull()
  })

  it('le second à portée prend la main', () => {
    // Théorique — cent trente unités séparent les deux anneaux d'une carte pour
    // sept de portée — mais l'ordre de précédence doit exister quand même.
    store().setNearbyPortal('continent', true)

    store().setNearbyPortal('rot', true)

    expect(store().nearbyPortal).toBe('rot')
  })
})
