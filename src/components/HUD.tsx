import { getControlHints } from '../config/controls'
import { format } from '../i18n'
import { useI18n } from '../i18n/useI18n'
import { clearPickups } from '../state/pickups'
import { clearProjectiles } from '../state/projectiles'
import { clearDeathPuffs } from '../state/deathPuffs'
import { interactionLabel, useInteraction } from '../store/interaction'
import { useGameStore } from '../store/useGameStore'

/** Tracé d'un cœur, dans une boîte 24×24. */
const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'

/**
 * Une case de la barre de vie.
 *
 * `bonus` ne change que la couleur, jamais le tracé : les cœurs jaunes de la
 * tenue sont des cœurs, et leur donner une autre forme les aurait fait lire
 * comme une seconde jauge posée à côté de la vie plutôt que comme sa suite.
 */
function Heart({ filled, bonus }: { filled: boolean; bonus?: boolean }) {
  return (
    <svg
      className={`heart${filled ? '' : ' heart--empty'}${bonus ? ' heart--bonus' : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
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
  const bonusHearts = useGameStore((state) => state.bonusHearts)
  const lastHitAt = useGameStore((state) => state.lastHitAt)
  const kills = useGameStore((state) => state.kills)
  const phase = useGameStore((state) => state.phase)
  const discovered = useGameStore((state) => state.discovered)
  const heartContainers = useGameStore((state) => state.heartContainers)
  const reset = useGameStore((state) => state.reset)
  const { dict } = useI18n()
  // Une seule source de vérité pour « que fait la touche ici ? », partagée avec
  // le raccourci clavier et le bouton tactile : l'invite ne peut pas annoncer
  // une action que la touche ne ferait pas.
  const interaction = useInteraction()

  const capacity = maxHearts + bonusHearts

  // Seul le dernier lieu trouvé s'affiche : le bandeau annonce une découverte,
  // il ne tient pas un journal.
  const lastDiscovery = discovered[discovered.length - 1]
  // Même raisonnement : le bandeau annonce le réceptacle qu'on vient de
  // prendre, pas la liste de ceux qu'on possède.
  const lastContainer = heartContainers[heartContainers.length - 1]

  const restart = () => {
    // Projectiles en vol, cœurs au sol et fumées en cours survivraient au
    // redémarrage : ils vivent dans des pools hors React, que remonter les
    // composants ne vide pas.
    clearProjectiles()
    clearPickups()
    clearDeathPuffs()
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
        {/*
          Une seule rangée pour les deux couleurs : les cases jaunes prolongent
          les rouges, elles ne forment pas une barre à part. C'est ce qui rend
          lisible d'un coup d'œil que les dégâts les entament en premier — elles
          sont simplement au bout du chemin.
        */}
        <div
          className="hud__hearts"
          aria-label={format(dict.ui.hud.heartsLabel, { current: hearts, total: capacity })}
        >
          {Array.from({ length: capacity }, (_, index) => (
            <Heart key={index} filled={index < hearts} bonus={index >= maxHearts} />
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

      {/*
        Bandeau du réceptacle, sur le même mécanisme de `key` que la découverte.
        Il est placé après elle dans le DOM parce que les deux se déclenchent à
        quelques secondes d'intervalle au temple : celui du réceptacle, plus
        récent, doit passer devant.
      */}
      {lastContainer && (
        <div key={`container-${lastContainer}`} className="discovery discovery--reward">
          <span className="discovery__kicker">{dict.ui.heartContainer.kicker}</span>
          <strong className="discovery__name">{dict.ui.heartContainer.name}</strong>
        </div>
      )}

      {/* L'invite ne s'affiche qu'en jeu — la garde est dans `useInteraction`,
          qui rend `null` hors de la phase `playing` : à portée du temple au
          moment d'un Game Over, elle resterait sinon posée sur l'écran de fin.
          La `key` rejoue l'animation d'entrée quand la cible change, sinon
          passer d'un coffre à un monument échangerait le texte sans un
          mouvement. Elle est **préfixée**, et ce n'est pas cosmétique : le
          bandeau de découverte, juste au-dessus, est un frère du même parent et
          se donne déjà pour clé l'identifiant du lieu. Sans préfixe, arriver à
          la pyramide produisait deux enfants portant la clé `pyramid` — React
          le signalait, et se réservait le droit d'en omettre un. */}
      {interaction && (
        <div key={`prompt-${interaction.kind}-${interaction.id}`} className="hud__prompt">
          <kbd>F</kbd>
          {interactionLabel(interaction, dict)}
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
