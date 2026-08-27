import { useI18n } from '../i18n/useI18n'
import { useQualityStore } from '../store/useQualityStore'

/**
 * Bascule de qualité graphique.
 *
 * Un seul bouton et non deux comme pour la langue : il n'y a que deux niveaux
 * et ils sont ordonnés, donc l'état courant suffit à décrire le réglage. Le
 * libellé affiche **le niveau actif**, pas celui qu'on obtiendrait en cliquant
 * — c'est l'usage sur ce genre de pastille, et `aria-label` dit explicitement
 * ce que fait le clic pour lever l'ambiguïté au lecteur d'écran.
 *
 * `HD` / `ECO` plutôt que « Élevée » / « Réduite » : la pastille est minuscule,
 * et ces deux abréviations se lisent dans les deux langues du site. Le nom
 * complet est traduit et passe par `aria-label`, où la place ne manque pas.
 */
export function QualityToggle() {
  const level = useQualityStore((state) => state.level)
  const setLevel = useQualityStore((state) => state.setLevel)
  const { dict } = useI18n()

  const next = level === 'high' ? 'low' : 'high'

  return (
    <button
      type="button"
      className="quality"
      aria-label={`${dict.ui.quality.label} : ${dict.ui.quality[level]}`}
      title={dict.ui.quality[level]}
      onClick={() => setLevel(next)}
    >
      {level === 'high' ? 'HD' : 'ECO'}
    </button>
  )
}
