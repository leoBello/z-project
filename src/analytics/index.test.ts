import { afterEach, describe, expect, it, vi } from 'vitest'
import { linkTarget, track } from './index'

/**
 * L'émission des événements vers les deux collecteurs.
 *
 * Ce qui se teste ici n'est pas que `track()` « marche » — c'est un appel de
 * fonction — mais les trois façons dont il peut échouer **sans rien dire** :
 * un collecteur absent qui fait tomber l'autre, un paramètre abandonné en route
 * par GA4, et un événement émis depuis un chemin de jeu qui lèverait.
 */

afterEach(() => {
  delete window.umami
  delete window.gtag
})

describe('track', () => {
  it('sert les deux collecteurs avec le même événement', () => {
    const umami = vi.fn()
    const gtag = vi.fn()
    window.umami = { track: umami }
    window.gtag = gtag

    track('landmark_opened', { landmark: 'pyramid', via: 'walk' })

    expect(umami).toHaveBeenCalledWith('landmark_opened', { landmark: 'pyramid', via: 'walk' })
    expect(gtag).toHaveBeenCalledWith('event', 'landmark_opened', {
      landmark: 'pyramid',
      via: 'walk',
    })
  })

  it('ne fait rien quand aucun script n est chargé', () => {
    // Le cas de tous les jours : développement, préproduction, bloqueur de
    // publicité. Une exception ici tomberait au milieu d'une frame de jeu.
    expect(() => track('boot_complete', { ms: 1200, outcome: 'ready' })).not.toThrow()
  })

  it('sert Google même si Umami est bloqué, et l inverse', () => {
    const gtag = vi.fn()
    window.gtag = gtag
    track('sky_island_entered', { via: 'portal' })
    expect(gtag).toHaveBeenCalledOnce()

    delete window.gtag
    const umami = vi.fn()
    window.umami = { track: umami }
    expect(() => track('sky_island_entered', { via: 'portal' })).not.toThrow()
    expect(umami).toHaveBeenCalledOnce()
  })

  it('convertit les booléens en chaînes pour Google, et seulement pour lui', () => {
    // GA4 ne transporte que des chaînes et des nombres : un booléen y disparaît
    // sans erreur, et la colonne est vide des semaines plus tard.
    const umami = vi.fn()
    const gtag = vi.fn()
    window.umami = { track: umami }
    window.gtag = gtag

    track('challenge_ended', {
      score: 420,
      kills: 12,
      failed: true,
      difficulty: 'normal',
      duration: '2min',
    })

    expect(gtag.mock.calls[0][2]).toMatchObject({ failed: 'true', score: 420, kills: 12 })
    expect(umami.mock.calls[0][1]).toMatchObject({ failed: true })
  })
})

describe('linkTarget', () => {
  it('réduit une URL à son domaine, sans www', () => {
    expect(linkTarget('https://www.malt.fr/profile/leobello')).toBe('malt.fr')
    expect(linkTarget('https://github.com/leoBello')).toBe('github.com')
  })

  it('nomme le courriel plutôt que de rendre une adresse', () => {
    expect(linkTarget('mailto:quelquun@example.com')).toBe('email')
  })

  it('garde le chemin brut d un lien relatif plutôt que de perdre l événement', () => {
    expect(linkTarget('/profil/')).toBe('/profil/')
  })
})
