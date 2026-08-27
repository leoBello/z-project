import { useState } from 'react'
import { isSoundEnabled, setSoundEnabled } from '../audio/sfx'
import { useI18n } from '../i18n/useI18n'

/**
 * Bascule du son.
 *
 * L'état vit dans le module audio et non dans un store : c'est lui qui le
 * persiste et qui pilote le gain du master, et rien d'autre dans l'interface
 * n'a besoin de le lire. Le `useState` local ne sert qu'à redessiner ce bouton.
 *
 * Le son démarre **coupé**. Un portfolio qui se met à souffler du vent sans
 * prévenir est agaçant, et c'est aussi ce qui évite d'avoir à ruser avec la
 * politique d'autoplay du navigateur : quand le visiteur clique ici, le geste
 * qui autorise l'audio est précisément celui qui l'allume.
 */
export function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled)
  const { dict } = useI18n()

  const toggle = () => {
    const next = !on
    setSoundEnabled(next)
    setOn(next)
  }

  return (
    <button
      type="button"
      className="quality"
      aria-pressed={on}
      aria-label={on ? dict.ui.sound.on : dict.ui.sound.off}
      title={on ? dict.ui.sound.on : dict.ui.sound.off}
      onClick={toggle}
    >
      {/* Deux glyphes plutôt qu'un mot : la pastille est minuscule, et le
          pictogramme se lit dans les deux langues du site. */}
      <span aria-hidden="true">{on ? '♪' : '♪̸'}</span>
    </button>
  )
}
