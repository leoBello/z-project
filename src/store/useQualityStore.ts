import { create } from 'zustand'

/**
 * Réglage de qualité graphique.
 *
 * La cible du jeu est le navigateur, donc souvent un GPU intégré ou un
 * portable. Trois postes dominent le coût de la frame, et ce sont les trois que
 * ce réglage débranche :
 *
 *  1. **la densité de végétation** — ~7 600 instances, le poste principal ;
 *  2. **la résolution de la shadow map** — 2048² par frame ;
 *  3. **le post-traitement** — bloom, tilt-shift et vignette, soit trois passes
 *     plein écran, plus le multisampling du composer.
 *
 * S'y ajoute la lumière ponctuelle du cristal du temple, seule de la scène :
 * elle force une passe d'éclairage supplémentaire dans *tous* les shaders,
 * végétation instanciée comprise. C'est le premier candidat à sauter, et la
 * retirer ne change rien à la lisibilité du lieu.
 *
 * **Non mesuré sur GPU intégré** : le réglage existe et agit, mais le seuil à
 * partir duquel il devient nécessaire n'a pas été relevé sur une vraie machine
 * modeste. Le rendu logiciel headless du poste de développement tourne à ~1 fps
 * quel que soit le niveau, ce qui ne dit rien d'utile ici.
 */

export type QualityLevel = 'high' | 'low'

const STORAGE_KEY = 'z-project:quality'

export interface QualitySettings {
  /** Fraction des props de végétation semés. */
  vegetationDensity: number
  /** Côté de la shadow map, en pixels. */
  shadowMapSize: number
  /** Chaîne de post-traitement active. */
  postProcessing: boolean
  /** Lumière ponctuelle du cristal du temple. */
  pointLights: boolean
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: {
    vegetationDensity: 1,
    shadowMapSize: 2048,
    postProcessing: true,
    pointLights: true,
  },
  // 55 % de végétation et non 0 % : c'est elle qui donne au monde son échelle,
  // une carte rase serait un autre jeu. Le curseur a été remonté de 0,45 à
  // 0,55 après relecture — c'est le poste où l'on récupère le plus de frames,
  // mais éclaircir la jungle au point qu'elle cesse d'être une jungle coûterait
  // plus au projet que ne lui rapporteraient les frames gagnées.
  low: {
    vegetationDensity: 0.55,
    shadowMapSize: 1024,
    postProcessing: false,
    pointLights: false,
  },
}

/**
 * Niveau de départ : le choix précédent du visiteur, sinon une estimation.
 *
 * L'estimation ne cherche pas à être juste, seulement à ne pas être absurde :
 * un appareil tactile ou une machine à peu de cœurs part en qualité réduite.
 * Le visiteur peut basculer d'un clic, ce qui vaut mieux qu'une détection
 * savante qui se tromperait sans recours.
 */
function initialLevel(): QualityLevel {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'high' || stored === 'low') return stored
  } catch {
    // Stockage indisponible : on retombe sur l'estimation.
  }

  const cores = navigator.hardwareConcurrency ?? 4
  const touch = matchMedia('(hover: none)').matches
  return touch || cores <= 4 ? 'low' : 'high'
}

interface QualityState {
  level: QualityLevel
  settings: QualitySettings
  setLevel: (level: QualityLevel) => void
}

export const useQualityStore = create<QualityState>((set) => {
  const level = initialLevel()
  return {
    level,
    settings: QUALITY[level],
    setLevel: (next) => {
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Non persisté, mais appliqué : le réglage change quand même.
      }
      set({ level: next, settings: QUALITY[next] })
    },
  }
})
