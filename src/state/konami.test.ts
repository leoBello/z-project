import { describe, expect, it } from 'vitest'
import { createKonamiTracker, SEQUENCE, type Keystroke } from './konami'

/**
 * Le code de triche est l'outil de test du jeu : c'est lui qui vide les trois
 * cartes pour vérifier ce qui s'ouvre à la fin. Un code qui ne répond qu'une
 * fois sur deux rend donc suspect tout ce qu'il sert à vérifier — d'où ces
 * tests, qui portent sur la seule chose qui ait jamais cloché : ce qui précède
 * la saisie.
 */

/** Un appui de clavier QWERTY, la disposition de référence de la séquence. */
function stroke(key: string): Keystroke {
  return key.startsWith('Arrow')
    ? { key, code: key }
    : { key, code: `Key${key.toUpperCase()}` }
}

const CODE = [...SEQUENCE]

/** Rend le nombre de frappes déclenchées par cette suite d'appuis. */
function type(...keys: string[]) {
  const tracker = createKonamiTracker()
  let fired = 0
  for (const key of keys) {
    if (tracker.push(stroke(key))) fired++
  }
  return fired
}

describe('createKonamiTracker', () => {
  it('reconnaît le code tapé proprement', () => {
    expect(type(...CODE)).toBe(1)
  })

  it('ne reconnaît rien tant que la séquence est incomplète', () => {
    expect(type(...CODE.slice(0, -1))).toBe(0)
  })

  /**
   * La régression qui a motivé le module. ↑ est la touche pour avancer : un
   * joueur qui marche vers le nord avant de taper le code arrivait avec un
   * appui d'avance, et l'ancien compteur d'avancement perdait tout le code.
   */
  it('reconnaît le code même si le joueur venait de marcher vers le nord', () => {
    expect(type('ArrowUp', ...CODE)).toBe(1)
  })

  it('reconnaît le code après un ↑ hésitant au milieu de la saisie', () => {
    expect(type('ArrowUp', 'ArrowUp', 'ArrowUp', ...CODE.slice(2))).toBe(1)
  })

  it("survit à n'importe quelle marche avant la saisie", () => {
    for (const walk of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
      expect(type(walk, ...CODE), `après ${walk}`).toBe(1)
    }
  })

  it('ne déclenche pas deux fois sur un code suivi de touches en trop', () => {
    expect(type(...CODE, 'a', 'a')).toBe(1)
  })

  it('déclenche deux fois si le code est tapé deux fois', () => {
    expect(type(...CODE, ...CODE)).toBe(2)
  })

  it('refuse une séquence fausse', () => {
    expect(type(...CODE.slice(0, 8), 'a', 'b')).toBe(0)
  })

  /**
   * En AZERTY, la lettre A sort de la touche physique `KeyQ` et la lettre B de
   * `KeyB`. C'est la disposition qui fait foi, pas la position — sinon le
   * joueur devrait finir son code sur la touche marquée Q.
   */
  it('accepte le B et le A tels que les produit un clavier AZERTY', () => {
    const tracker = createKonamiTracker()
    let fired = false
    for (const key of CODE.slice(0, 8)) tracker.push(stroke(key))
    tracker.push({ key: 'b', code: 'KeyB' })
    fired = tracker.push({ key: 'a', code: 'KeyQ' })
    expect(fired).toBe(true)
  })

  /**
   * Le dernier recours de `matches` : une disposition où ni B ni A ne sortent
   * nulle part laisse encore la position physique du clavier US.
   */
  it('accepte la position physique quand la lettre ne sort pas', () => {
    const tracker = createKonamiTracker()
    for (const key of CODE.slice(0, 8)) tracker.push(stroke(key))
    tracker.push({ key: 'Unidentified', code: 'KeyB' })
    expect(tracker.push({ key: 'Unidentified', code: 'KeyA' })).toBe(true)
  })
})
