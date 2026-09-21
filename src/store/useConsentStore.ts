import { create } from 'zustand'
import { grantAnalytics, revokeAnalytics } from '../analytics/consent'

/**
 * Le choix du visiteur sur la mesure d'audience avec cookie.
 *
 * **Pourquoi ce store existe.** Google Analytics est chargé en mode consentement
 * refusé (voir `plugins/analytics.ts`), et dans cet état il n'envoie que des
 * relevés sans identifiant. GA4 ne sait rien en faire : pas de session, pas de
 * temps réel, pas un chiffre dans les rapports — seulement de la matière à
 * modélisation, qui demande mille utilisateurs consentants par jour pour
 * s'activer. Autrement dit, sans un accord explicite quelque part, la propriété
 * reste vide indéfiniment. C'est ce que ce store va chercher.
 *
 * **Trois états et non deux.** `null` n'est pas « refusé » : c'est « on n'a pas
 * encore demandé », et c'est lui qui fait apparaître le bandeau. Les confondre
 * reviendrait soit à ne jamais demander, soit à redemander à chaque visite.
 *
 * **Le refus ne coupe rien.** Umami continue de compter tout le monde, sans
 * cookie et sans identifiant — c'est pour ça que le bandeau peut dire la vérité
 * en deux lignes sans ressembler à un marché. Ce qui se joue ici n'est pas la
 * mesure, c'est le cookie.
 */

export type Consent = 'granted' | 'denied'

/**
 * Même préfixe que la langue (`z-project:locale`), et c'est volontaire : ces
 * deux clés sont les seules traces que le site laisse sur la machine du
 * visiteur, et un préfixe commun les rend reconnaissables à l'inspecteur.
 *
 * **Elle est lue à deux endroits**, et le second n'est pas dans ce fichier :
 * le script d'amorçage du `<head>` la relit pour poser le consentement par
 * défaut avant le premier relevé (voir `plugins/analytics.ts`). Changer ce nom
 * ici sans l'y changer ferait repartir tous les visiteurs déjà consentants à
 * zéro — sans erreur, sans trace, juste des chiffres qui s'arrêtent.
 */
export const STORAGE_KEY = 'z-project:consent'

/** Le choix déjà fait, ou `null` si le visiteur n'a jamais répondu. */
function storedConsent(): Consent | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'granted' || stored === 'denied' ? stored : null
  } catch {
    // Navigation privée, stockage bloqué : on redemandera. Un bandeau qui
    // revient est désagréable ; une exception au démarrage est pire.
    return null
  }
}

interface ConsentState {
  choice: Consent | null
  /**
   * Vrai quand le monde est jouable et qu'on peut se permettre de demander.
   *
   * Posé par `BootScreen` au moment où il efface l'écran de chargement. Le
   * bandeau ne doit pas paraître **devant** cet écran : c'est la première image
   * du portfolio, celle qui décide si le visiteur reste, et une boîte de
   * dialogue posée par-dessus coûterait plus de visiteurs que la mesure n'en
   * explique.
   */
  ready: boolean
  /** Le bandeau a été rouvert à la demande, pour changer d'avis. */
  reopened: boolean
  markReady: () => void
  decide: (choice: Consent) => void
  reopen: () => void
}

export const useConsentStore = create<ConsentState>((set) => ({
  choice: storedConsent(),
  ready: false,
  reopened: false,

  markReady: () => set({ ready: true }),

  /**
   * Enregistre le choix, puis l'applique à Google.
   *
   * Dans cet ordre : l'appel à `gtag` peut ne rien faire du tout — script
   * bloqué, domaine de préproduction, développement — alors que le choix, lui,
   * doit être retenu dans tous les cas. L'inverse aurait fait dépendre la
   * disparition du bandeau de la présence d'un script tiers.
   */
  decide: (choice) => {
    try {
      localStorage.setItem(STORAGE_KEY, choice)
    } catch {
      // Non persisté, mais appliqué : le choix vaut pour cette visite, et le
      // bandeau reviendra à la suivante. C'est le bon sens du compromis —
      // redemander est légal, présumer l'accord ne l'est pas.
    }
    set({ choice, reopened: false })
    if (choice === 'granted') grantAnalytics()
    else revokeAnalytics()
  },

  reopen: () => set({ reopened: true }),
}))
