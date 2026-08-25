import { controlHints } from '../config/controls'

/**
 * Interface 2D superposée au Canvas.
 *
 * Volontairement en HTML classique (et non `<Html>` de drei) : le HUD est
 * ancré à l'écran, pas à un point 3D. C'est plus léger et ça évite de
 * reprojeter des éléments à chaque frame.
 * La jauge de vie sera ajoutée ici à l'étape "combat".
 */
export function HUD() {
  return (
    <div className="hud">
      <div className="hud__controls">
        {controlHints.map((hint) => (
          <span key={hint.keys} className="hud__hint">
            <kbd>{hint.keys}</kbd>
            {hint.label}
          </span>
        ))}
      </div>
    </div>
  )
}
