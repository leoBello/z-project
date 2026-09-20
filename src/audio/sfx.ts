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

/** La garde qui s'ouvre : bref, sec, métallique. Distinct du coup d'épée. */
export function playParry() {
  tone('square', 880, 1320, 0.07, 0.06)
}

/**
 * La parade qui porte : l'acier contre l'acier, puis une quinte montante.
 *
 * Le seul son du jeu qui *récompense* un geste défensif. Il doit s'entendre
 * au-dessus de tout le reste, gel compris — c'est pour ça qu'il est aigu.
 */
export function playParrySuccess() {
  noiseBurst('highpass', 3200, 5200, 1.6, 0.09, 0.2)
  tone('triangle', 740, 740, 0.12, 0.16)
  tone('triangle', 1110, 1110, 0.18, 0.16, 0.07)
}

/** La charge qui finit contre l'enceinte : sourd, grave, long. */
export function playImpact() {
  noiseBurst('lowpass', 900, 120, 0.7, 0.35, 0.3)
  tone('sine', 90, 40, 0.4, 0.3)
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

/**
 * Grincement d'un couvercle de coffre.
 *
 * Un passe-bande **montant** et non descendant : une charnière qui cède monte
 * en fréquence à mesure que le couvercle se lève, c'est ce sens qui la fait
 * entendre comme une ouverture plutôt que comme un objet qui tombe. Le Q élevé
 * est ce qui donne le côté « bois qui frotte » plutôt que « souffle ».
 */
export function playChestCreak() {
  noiseBurst('bandpass', 320, 1250, 6, 0.1, 0.45)
  // Le coup sourd du couvercle qui bute en fin de course, calé sur la fin de
  // la bascule côté visuel (450 ms).
  tone('triangle', 120, 60, 0.14, 0.2, 0.42)
}

/**
 * Fanfare du trésor.
 *
 * Plus ample que `playReward` : six notes au lieu de quatre, et une tierce
 * tenue par-dessous à partir de la troisième. Le réceptacle de cœur est une
 * récompense de parcours, le coffre est la trouvaille de la partie — les deux
 * ne peuvent pas sonner pareil, sinon la seconde n'apporte rien.
 */
export function playTreasure() {
  const melody = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98]
  melody.forEach((frequency, index) => {
    tone('triangle', frequency, frequency, 0.13, 0.55, index * 0.1)
  })
  // Tierce tenue en dessous : c'est elle qui donne l'assise, sans quoi la
  // montée s'entend comme un arpège d'ascenseur.
  tone('sine', 392, 392, 0.09, 0.9, 0.2)
  tone('sine', 523.25, 523.25, 0.08, 0.8, 0.4)
}

/**
 * Second souffle : la tenue relève son porteur.
 *
 * Il devait se distinguer des deux fanfares sans leur ressembler, et le parti
 * pris est l'inverse du leur : celles du coffre et du réceptacle **montent** dès
 * la première note, celui-ci **part d'en bas**. Un coup sourd d'abord — le corps
 * qui touche — puis deux notes tenues qui remontent chacune d'une octave, et un
 * souffle clair pour finir. Une mélodie de plus se serait entendue comme une
 * récompense, alors que c'est une mort qui n'a pas eu lieu.
 */
export function playRevive() {
  // Le coup sourd, et il descend : c'est la chute, pas le relèvement.
  tone('sine', 110, 55, 0.22, 0.5)
  tone('triangle', 196, 392, 0.13, 0.85, 0.14)
  tone('triangle', 392, 784, 0.11, 1, 0.34)
  noiseBurst('highpass', 700, 2600, 0.8, 0.07, 0.5)
}

/**
 * Changement de tenue : la bouffée de fumée, et l'étoffe qui claque.
 *
 * Le souffle est filtré vers le haut puis retombe — un nuage qui se détend.
 * Aucune note : un changement d'équipement ne doit pas sonner comme une
 * récompense, sinon il entre en concurrence avec la fanfare du coffre.
 */
export function playEquip() {
  noiseBurst('highpass', 1800, 400, 0.9, 0.13, 0.3)
  noiseBurst('bandpass', 600, 1600, 1.2, 0.07, 0.12)
}

/**
 * Défaite d'un ennemi : le corps qui cède, puis le souffle du nuage.
 *
 * Plus long et plus grave que `playHit` (0,09 s), qui reste le son de l'impact
 * — les deux jouent d'affilée sur un coup fatal, l'un étant ce que l'autre
 * provoque.
 *
 * **Aucune note musicale**, et c'est le point : même raisonnement que
 * `playEquip`. Une mort qui sonne comme une récompense entrerait en
 * concurrence avec la fanfare du coffre, et c'est le coffre qui doit rester la
 * trouvaille de la partie.
 */
export function playDefeat() {
  // Le corps qui cède : passe-bas franchement descendant.
  noiseBurst('lowpass', 3000, 260, 0.9, 0.22, 0.22)
  // La chute, qui donne le poids. Sans elle l'effet n'est qu'un « pfff ».
  tone('triangle', 300, 70, 0.18, 0.3)
  // Le souffle du nuage : montant, léger, il prolonge sans alourdir.
  noiseBurst('highpass', 900, 2600, 1.0, 0.06, 0.18)
}

/**
 * Note dont le volume **monte** au lieu de décroître.
 *
 * `tone` décrit une percussion : attaque immédiate, puis extinction. Une ogive
 * qui tombe fait exactement l'inverse — elle se rapproche. Sans cette variante,
 * le sifflement s'éteindrait pendant que la bombe grossit à l'écran, et les
 * deux se contrediraient.
 *
 * La coupure en toute fin de course n'est pas un fondu : c'est l'explosion qui
 * doit prendre le relais, et une queue de sifflement par-dessus le souffle
 * s'entendrait comme un raté de montage.
 */
function approach(
  type: OscillatorType,
  from: number,
  to: number,
  peak: number,
  duration: number,
) {
  if (!ready()) return
  const t = ctx!.currentTime

  const osc = ctx!.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(from, t)
  osc.frequency.exponentialRampToValueAtTime(to, t + duration)

  const gain = ctx!.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + duration * 0.94)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)

  osc.connect(gain).connect(master!)
  osc.start(t)
  osc.stop(t + duration + 0.05)
}

/**
 * Sifflement de l'ogive qui tombe.
 *
 * Calé sur les 900 ms de `FALL_MS` — un peu moins, pour que le silence d'une
 * fraction de seconde précède le souffle. Ce silence est ce qui fait sursauter.
 *
 * Deux voix légèrement désaccordées plutôt qu'une : un sinus seul sonne comme
 * un test de tonalité, le battement entre les deux donne la matière.
 */
export function playFallingBomb() {
  approach('sawtooth', 1500, 210, 0.05, 0.86)
  approach('sine', 980, 140, 0.07, 0.86)
}

/**
 * Le souffle.
 *
 * Trois couches, dans l'ordre où l'oreille les reçoit : la déflagration (bruit
 * large qui s'effondre vers le grave), la sous-basse qui donne la masse, puis
 * un grondement long qui roule pendant que le champignon monte.
 *
 * C'est le son le plus fort du jeu, et il doit le rester : c'est un événement
 * unique par partie. Les pics restent malgré tout sous ceux de la fanfare du
 * coffre additionnée de ses six notes — un souffle qui sature n'est plus
 * qu'une bouillie, et sur un ordinateur portable il ne s'entend même pas plus
 * fort.
 */
export function playNuke() {
  // La déflagration : tout le spectre d'un coup, qui s'effondre vers le grave.
  noiseBurst('lowpass', 7000, 90, 0.7, 0.3, 1.9)
  // La masse. Sans elle, l'explosion n'est qu'un bruit blanc un peu long.
  tone('sine', 110, 22, 0.28, 1.7)
  // Le grondement qui roule sous le champignon, bien après le pic.
  noiseBurst('lowpass', 520, 70, 0.5, 0.1, 2.8)
}

/**
 * Ouverture du portail.
 *
 * Volontairement **tenu** là où toutes les autres récompenses du jeu sont
 * percussives : la fanfare du coffre et le motif du réceptacle disent « tu as
 * trouvé », le portail dit « quelque chose s'est ouvert ailleurs ». Un drone à
 * la quinte, deux voix désaccordées d'un quart de ton pour le battement, et
 * trois cloches qui montent par-dessus.
 */
export function playPortal() {
  tone('sine', 146.83, 146.83, 0.1, 2.4)
  // Désaccordée d'environ un quart de ton au-dessus du la : c'est ce battement
  // lent, et non la hauteur des notes, qui sonne « surnaturel ».
  tone('sine', 223.5, 223.5, 0.08, 2.4)
  const bells = [587.33, 880, 1174.66]
  bells.forEach((frequency, index) => {
    tone('triangle', frequency, frequency, 0.09, 1.5, 0.2 + index * 0.17)
  })
}
