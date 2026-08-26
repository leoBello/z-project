import { getControlHints } from '../config/controls'
import { format } from '../i18n'
import { useI18n } from '../i18n/useI18n'
import { clearPickups } from '../state/pickups'
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
  const discovered = useGameStore((state) => state.discovered)
  const nearbyLandmark = useGameStore((state) => state.nearbyLandmark)
  const reset = useGameStore((state) => state.reset)
  const { dict } = useI18n()

  // Seul le dernier lieu trouvé s'affiche : le bandeau annonce une découverte,
  // il ne tient pas un journal.
  const lastDiscovery = discovered[discovered.length - 1]

  const restart = () => {
    // Projectiles en vol et cœurs au sol survivraient au redémarrage : ils
    // vivent dans des pools hors React, que remonter les composants ne vide pas.
    clearProjectiles()
    clearPickups()
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

      {/* Même astuce de `key` que le flash de dégâts : changer la clé recrée
          l'élément, donc rejoue l'animation CSS. Sans ça, le bandeau du
          deuxième lieu découvert resterait figé sur sa dernière image. */}
      {lastDiscovery && (
        <div key={lastDiscovery} className="discovery">
          <span className="discovery__kicker">{dict.ui.discovery.kicker}</span>
          <strong className="discovery__name">
            {dict.ui.landmarks[lastDiscovery].name}
          </strong>
        </div>
      )}

      {/* L'invite ne s'affiche qu'en jeu : à portée du temple au moment d'un
          Game Over, elle resterait sinon posée sur l'écran de fin. */}
      {phase === 'playing' && nearbyLandmark && (
        <div className="hud__prompt">
          <kbd>F</kbd>
          {dict.ui.landmarks[nearbyLandmark].action}
        </div>
      )}

      <div className="hud__controls">
        {getControlHints(dict).map((hint) => (
          <span key={hint.keys} className="hud__hint">
            <kbd>{hint.keys}</kbd>
            {hint.label}
          </span>
        ))}
      </div>

      {phase === 'gameover' && (
        <div className="gameover">
          <div className="gameover__panel">
            <h1>{dict.ui.gameover.title}</h1>
            {/* Le pluriel a sa propre clé plutôt qu'une règle : « 1 ennemi
                vaincu » et « 2 ennemis vaincus » n'accordent pas seulement le
                nom, et toutes les langues ne coupent pas au même endroit. */}
            <p>
              {kills === 0
                ? dict.ui.gameover.noKills
                : format(kills === 1 ? dict.ui.gameover.killsOne : dict.ui.gameover.killsMany, {
                    count: kills,
                  })}
            </p>
            <button type="button" onClick={restart}>
              {dict.ui.gameover.restart}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
