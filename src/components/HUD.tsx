import { controlHints } from '../config/controls'
import { clearProjectiles } from '../state/projectiles'
import { useGameStore } from '../store/useGameStore'

/** Tracé d'un cœur, dans une boîte 24×24. */
const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg className={`heart${filled ? '' : ' heart--empty'}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={HEART_PATH} />
    </svg>
  )
}

/**
 * Interface 2D superposée au Canvas.
 *
 * En HTML classique et non via `<Html>` de drei : le HUD est ancré à l'écran,
 * pas à un point 3D. C'est plus léger, et ça évite de reprojeter des éléments à
 * chaque frame.
 */
export function HUD() {
  const hearts = useGameStore((state) => state.hearts)
  const maxHearts = useGameStore((state) => state.maxHearts)
  const lastHitAt = useGameStore((state) => state.lastHitAt)
  const kills = useGameStore((state) => state.kills)
  const phase = useGameStore((state) => state.phase)
  const reset = useGameStore((state) => state.reset)

  const restart = () => {
    // Les projectiles en vol survivraient au redémarrage : ils vivent dans un
    // pool hors React, que remonter les composants ne vide pas.
    clearProjectiles()
    reset()
  }

  return (
    <div className="hud">
      {/*
        Le flash rouge est remonté par sa `key` : chaque nouveau coup encaissé
        change la clé, React recrée l'élément et l'animation CSS rejoue. Sans
        ça elle ne se déclencherait qu'une seule fois sur toute la partie.
      */}
      {Number.isFinite(lastHitAt) && <div key={lastHitAt} className="hud__damage" />}

      <div className="hud__top">
        <div className="hud__hearts" aria-label={`${hearts} cœurs sur ${maxHearts}`}>
          {Array.from({ length: maxHearts }, (_, index) => (
            <Heart key={index} filled={index < hearts} />
          ))}
        </div>
      </div>

      <div className="hud__controls">
        {controlHints.map((hint) => (
          <span key={hint.keys} className="hud__hint">
            <kbd>{hint.keys}</kbd>
            {hint.label}
          </span>
        ))}
      </div>

      {phase === 'gameover' && (
        <div className="gameover">
          <div className="gameover__panel">
            <h1>Game Over</h1>
            <p>
              {kills === 0
                ? 'Aucun ennemi vaincu.'
                : `${kills} ennemi${kills > 1 ? 's' : ''} vaincu${kills > 1 ? 's' : ''}.`}
            </p>
            <button type="button" onClick={restart}>
              Rejouer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
