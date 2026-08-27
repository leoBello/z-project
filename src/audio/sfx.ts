/**
 * Sons du jeu, **entièrement synthétisés** dans le navigateur.
 *
 * Aucun fichier audio : c'est la même promesse que la végétation, le ciel et
 * les illustrations du portfolio — rien à télécharger, palette maîtrisée, et
 * le jeu reste un seul bundle. Un pas, un coup d'épée et une vague ne sont de
 * toute façon que du bruit filtré et une enveloppe ; les échantillonner
 * coûterait quelques centaines de kilooctets pour un résultat qui ne serait
 * pas plus juste dans ce registre.
 *
 * Trois contraintes ont façonné ce module :
 *
 *  - **la politique d'autoplay.** Un `AudioContext` créé au chargement démarre
 *    `suspended` et reste muet. Il est donc créé *au premier geste* du
 *    visiteur, pas à l'import — d'où `unlock()`, appelé sur le premier
 *    `keydown` ou `pointerdown` de la page ;
 *  - **le coût par son.** Chaque effet crée ses nœuds, les branche, les
 *    programme et les laisse mourir. Web Audio libère un nœud dès qu'il a fini
 *    de jouer et qu'il n'est plus référencé — pas de pool à tenir ;
 *  - **le silence par défaut n'est pas une option, la coupure oui.** Un
 *    portfolio qui se met à souffler du vent dans les oreilles sans prévenir
 *    est agaçant, donc le son démarre **coupé** et le visiteur l'allume. C'est
 *    aussi ce qui évite d'avoir à ruser avec l'autoplay.
 */

const STORAGE_KEY = 'z-project:sound'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

let enabled = readPreference()

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on'
  } catch {
    // Stockage indisponible : on retombe sur le silence, qui est le défaut sûr.
    return false
  }
}

/**
 * Bruit blanc de deux secondes, réutilisé par tous les effets.
 *
 * Deux secondes et non dix : à ce niveau de filtrage, l'oreille n'entend pas la
 * boucle, et un buffer plus long ne ferait qu'occuper de la mémoire.
 */
function makeNoise(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/**
 * Nappe de vent : du bruit passé au filtre passe-bas, dont le volume respire.
 *
 * Le souffle vient d'un LFO très lent sur le gain, pas d'une modulation du
 * filtre : moduler la coupure donne un effet « balayage » qui s'entend comme un
 * effet, alors qu'un vent réel varie surtout en intensité.
 */
function startAmbience(context: AudioContext, output: GainNode) {
  const source = context.createBufferSource()
  source.buffer = noiseBuffer
  source.loop = true

  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 420
  filter.Q.value = 0.4

  const gain = context.createGain()
  gain.gain.value = 0.05

  const lfo = context.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = context.createGain()
  lfoGain.gain.value = 0.035
  lfo.connect(lfoGain).connect(gain.gain)

  source.connect(filter).connect(gain).connect(output)
  source.start()
  lfo.start()
  return gain
}

/**
 * Crée le contexte audio. À appeler depuis un gestionnaire d'événement
 * utilisateur, sinon le navigateur le laisse suspendu.
 */
export function unlock() {
  if (ctx) {
    // Un contexte peut repasser `suspended` (changement d'onglet, coupure
    // système) : on le relance à chaque geste plutôt qu'une seule fois.
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }

  try {
    ctx = new AudioContext()
  } catch {
    // Pas d'audio disponible : le jeu se joue très bien sans.
    return
  }

  noiseBuffer = makeNoise(ctx)
  master = ctx.createGain()
  master.gain.value = enabled ? 1 : 0
  master.connect(ctx.destination)
  // La nappe de vent est unique, bouclée, et vit aussi longtemps que le
  // contexte : on ne garde pas sa référence, plus rien ne la touche ensuite.
  // Sa coupure passe par le gain du master, comme celle des effets.
  startAmbience(ctx, master)
}

export function isSoundEnabled() {
  return enabled
}

/**
 * Allume ou coupe le son.
 *
 * La coupure passe par le gain du master et non par une suspension du
 * contexte : la nappe de vent doit garder sa phase, sinon la rallumer produit
 * un à-coup audible.
 */
export function setSoundEnabled(next: boolean) {
  enabled = next
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    // Non persisté, mais appliqué.
  }
  if (!ctx) {
    // Premier allumage avant tout geste : `unlock` est de toute façon appelé
    // par le clic qui vient de déclencher cette bascule.
    unlock()
  }
  if (ctx && master) {
    // Rampe courte plutôt qu'affectation directe : un saut de gain se traduit
    // par un clic dans les haut-parleurs.
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.setTargetAtTime(next ? 1 : 0, ctx.currentTime, 0.05)
  }
}

/**
 * Contexte prêt et son allumé ? Sert de garde à tous les effets.
 *
 * Elle ne peut pas être un prédicat de type : TypeScript ne sait restreindre
 * que des paramètres, pas une variable de module. D'où les `!` qui suivent
 * chaque appel — ils sont adossés à ce test, pas à un espoir.
 */
function ready() {
  return enabled && ctx !== null && master !== null && ctx.state === 'running'
}

/** Enveloppe percussive : attaque immédiate, décroissance exponentielle. */
function envelope(gain: GainNode, peak: number, attack: number, decay: number) {
  const t = ctx!.currentTime
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

/** Salve de bruit filtrée : la brique de tous les sons « matière ». */
function noiseBurst(
  type: BiquadFilterType,
  from: number,
  to: number,
  q: number,
  peak: number,
  duration: number,
) {
  if (!ready()) return
  const t = ctx!.currentTime

  const source = ctx!.createBufferSource()
  source.buffer = noiseBuffer
  // Départ aléatoire dans le buffer : sans ça, deux pas consécutifs rejouent
  // exactement le même échantillon et s'entendent comme une répétition.
  const offset = Math.random() * 1.5

  const filter = ctx!.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(from, t)
  filter.frequency.exponentialRampToValueAtTime(to, t + duration)
  filter.Q.value = q

  const gain = ctx!.createGain()
  envelope(gain, peak, 0.008, duration)

  source.connect(filter).connect(gain).connect(master!)
  source.start(t, offset, duration + 0.1)
  source.stop(t + duration + 0.1)
}

/** Note simple : la brique de tous les sons « signal ». */
function tone(
  type: OscillatorType,
  from: number,
  to: number,
  peak: number,
  duration: number,
  delay = 0,
) {
  if (!ready()) return
  const t = ctx!.currentTime + delay

  const osc = ctx!.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(from, t)
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + duration)

  const gain = ctx!.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)

  osc.connect(gain).connect(master!)
  osc.start(t)
  osc.stop(t + duration + 0.05)
}

// --- Effets -----------------------------------------------------------------

/** Pas : une salve courte et sourde, dont la hauteur varie légèrement. */
export function playFootstep() {
  const pitch = 0.85 + Math.random() * 0.3
  noiseBurst('bandpass', 900 * pitch, 300 * pitch, 1.4, 0.12, 0.09)
}

/** Coup d'épée dans l'air : un balayage descendant, sans impact. */
export function playSwing() {
  noiseBurst('bandpass', 1600, 420, 2.2, 0.16, 0.18)
}

/** Impact d'un coup qui porte : la salve, plus un corps grave. */
export function playHit() {
  noiseBurst('lowpass', 2400, 500, 0.8, 0.2, 0.09)
  tone('triangle', 190, 90, 0.16, 0.14)
}

/** Saut : un souffle très court, juste de quoi accuser l'impulsion. */
export function playJump() {
  noiseBurst('highpass', 500, 1400, 0.8, 0.06, 0.12)
}

/** Coup encaissé : descente franche, la seule dissonance du jeu. */
export function playDamage() {
  tone('sawtooth', 200, 70, 0.2, 0.35)
}

/** Cœur ramassé : deux notes montantes, une quinte. */
export function playPickup() {
  tone('sine', 660, 660, 0.16, 0.12)
  tone('sine', 990, 990, 0.16, 0.18, 0.09)
}

/** Réceptacle de cœur : le même motif, prolongé — c'est la récompense du lieu. */
export function playReward() {
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((frequency, index) => {
    tone('triangle', frequency, frequency, 0.14, 0.5, index * 0.11)
  })
}
