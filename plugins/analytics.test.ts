import { describe, expect, it } from 'vitest'
import { gaMeasurementId, googleTag, trackingTags, umamiTag, umamiWebsiteId } from './analytics.ts'

/**
 * Les balises de mesure, telles qu'elles partent dans le HTML.
 *
 * Tout ce qui est vérifié ici a déjà coûté, ou coûterait, la même chose : un
 * tableau de bord vide sans un mot dans la console. Le script se charge, il ne
 * lève pas, et les événements sont abandonnés en silence — c'est arrivé une
 * fois côté Umami, sur un `www` manquant (voir `DOMAINS`).
 */

const GA = 'G-ABC123XYZ'

describe('l identifiant de mesure Google', () => {
  it('se lit d abord sous son nom propre', () => {
    expect(gaMeasurementId({ VITE_GA_MEASUREMENT_ID: GA })).toBe(GA)
  })

  it('retombe sur celui de Firebase, qui porte le même flux', () => {
    expect(gaMeasurementId({ VITE_FIREBASE_MEASUREMENT_ID: GA })).toBe(GA)
  })

  it('préfère le nom propre quand les deux sont posés', () => {
    expect(
      gaMeasurementId({ VITE_GA_MEASUREMENT_ID: GA, VITE_FIREBASE_MEASUREMENT_ID: 'G-AUTRE' }),
    ).toBe(GA)
  })

  it('refuse une clé absente, vide ou d une autre époque', () => {
    expect(gaMeasurementId({})).toBeUndefined()
    expect(gaMeasurementId({ VITE_GA_MEASUREMENT_ID: '' })).toBeUndefined()
    // Une propriété Universal Analytics : acceptée, elle ne collecterait rien.
    expect(gaMeasurementId({ VITE_GA_MEASUREMENT_ID: 'UA-123456-1' })).toBeUndefined()
  })
})

describe('la balise Google', () => {
  it('pose le consentement avant la configuration', () => {
    // L'ordre *est* la fonctionnalité : passé le `config`, un défaut de
    // consentement arrive trop tard et le premier relevé part avec un cookie.
    const html = googleTag(GA)
    expect(html.indexOf("gtag('consent','default'")).toBeGreaterThan(-1)
    expect(html.indexOf("gtag('consent','default'")).toBeLessThan(html.indexOf("gtag('config'"))
  })

  it('refuse le stockage, donc ne dépose aucun cookie', () => {
    expect(googleTag(GA)).toContain("analytics_storage:'denied'")
    expect(googleTag(GA)).toContain("ad_storage:'denied'")
  })

  it('n émet que depuis les domaines de production', () => {
    const html = googleTag(GA)
    expect(html).toContain('leobello.dev')
    expect(html).toContain('www.leobello.dev')
    // Le garde sort **avant** de créer la balise : sur une préproduction
    // Vercel, gtag.js n'est même pas téléchargé.
    expect(html.indexOf('indexOf(location.hostname)')).toBeLessThan(
      html.indexOf('createElement'),
    )
  })

  it('ne rend rien sans identifiant', () => {
    expect(googleTag(undefined)).toBe('')
  })
})

describe('les balises des pages texte', () => {
  it('portent les deux collecteurs quand les deux sont configurés', () => {
    const html = trackingTags({ VITE_UMAMI_WEBSITE_ID: 'umami-id', VITE_GA_MEASUREMENT_ID: GA })
    expect(html).toContain('cloud.umami.is/script.js')
    expect(html).toContain(GA)
  })

  it('n en éteignent qu un quand une seule variable manque', () => {
    const sansGoogle = trackingTags({ VITE_UMAMI_WEBSITE_ID: 'umami-id' })
    expect(sansGoogle).toContain('cloud.umami.is/script.js')
    expect(sansGoogle).not.toContain('googletagmanager')

    const sansUmami = trackingTags({ VITE_GA_MEASUREMENT_ID: GA })
    expect(sansUmami).toContain('googletagmanager')
    expect(sansUmami).not.toContain('cloud.umami.is')
  })

  it('ne rendent rien du tout sur un dépôt fraîchement cloné', () => {
    expect(trackingTags({})).toBe('')
  })
})

describe('la balise Umami', () => {
  it('reste inchangée par l arrivée de Google', () => {
    expect(umamiWebsiteId({ VITE_UMAMI_WEBSITE_ID: 'umami-id' })).toBe('umami-id')
    expect(umamiTag('umami-id')).toContain('data-domains="leobello.dev,www.leobello.dev"')
  })
})
