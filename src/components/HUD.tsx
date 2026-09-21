import { getControlHints } from '../config/controls'
import { isSiteId } from '../config/sites'
import { format } from '../i18n'
import { RotMeter } from './RotMeter'
import { useI18n } from '../i18n/useI18n'
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
  const revivedAt = useGameStore((state) => state.revivedAt)
  const kills = useGameStore((state) => state.kills)
  const phase = useGameStore((state) => state.phase)
  const discovered = useGameStore((state) => state.discovered)
  const heartContainers = useGameStore((state) => state.heartContainers)
  const annihilation = useGameStore((state) => state.annihilation)
  const portalOpenedAt = useGameStore((state) => state.portalOpenedAt)
  const respawn = useGameStore((state) => state.respawn)
  const { dict } = useI18n()
  // Une seule source de vérité pour « que fait la touche ici ? », partagée avec
  // le raccourci clavier et le bouton tactile : l'invite ne peut pas annoncer
  // une action que la touche ne ferait pas.
  const interaction = useInteraction()

  const capacity = maxHearts + bonusHearts

  // Seul le dernier lieu trouvé s'affiche : le bandeau annonce une découverte,
  // il ne tient pas un journal. Monuments et lieux remarquables passent par la
  // même file et le même bandeau — voir `PlaceId`.
  const lastDiscovery = discovered[discovered.length - 1]
  // Même raisonnement : le bandeau annonce le réceptacle qu'on vient de
  // prendre, pas la liste de ceux qu'on possède.
  const lastContainer = heartContainers[heartContainers.length - 1]

  /*
    On reprend là où la partie en était, pas depuis le début de la partie.

    Les deux pools hors React qui portaient le combat sont vidés — une flèche
    figée en plein vol et les fumées de mort de l'adversaire reprendraient leur
    course à la seconde où la partie repart, à l'autre bout de la carte et sans
    plus rien à toucher. Les cœurs au sol, eux, **restent** : ils sont tombés
    d'ennemis vaincus, ils appartiennent au monde, et le monde n'est plus remis à
    zéro. Ils expireront d'eux-mêmes si personne ne revient les chercher.
  */
  const resume = () => {
    clearProjectiles()
    clearDeathPuffs()
    respawn()
  }

  return (
    <div className="hud">
      {/*
        Le flash rouge est remonté par sa `key` : chaque nouveau coup encaissé
        change la clé, React recrée l'élément et l'animation CSS rejoue. Sans
        ça elle ne se déclencherait qu'une seule fois sur toute la partie.
      */}
      {Number.isFinite(lastHitAt) && <div key={lastHitAt} className="hud__damage" />}

      {/*
        Embrasement du second souffle, sur le même mécanisme de `key`.

        Il part du **centre** quand le flash de dégâts vient des bords, et c'est
        ce qui les sépare à l'instant où les deux pourraient se confondre : le
        coup fatal et son annulation tombent sur la même frame. L'un dit « ça
        vient de l'extérieur », l'autre « ça vient de vous ».
      */}
      {Number.isFinite(revivedAt) && <div key={revivedAt} className="hud__revive" />}

      {/*
        Embrasement de l'écran, sur le même mécanisme de `key` que le flash de
        dégâts. Il est monté dès le *largage* et non à l'impact, et c'est le CSS
        qui tient le calque transparent pendant les 900 ms de chute : un
        `setTimeout` aurait couru en temps réel pendant que la bombe, elle,
        tombe en temps de jeu — ouvrir l'inventaire en plein vol aurait suffi à
        désynchroniser l'éclair de l'explosion.

        Ce n'est pas un stroboscope : une seule montée, un seul effacement, et
        jamais de blanc pur — l'écran monte à 88 % d'un blanc chaud puis
        redescend en 1,4 s. Un jeu de navigateur n'a pas le droit de faire
        clignoter un plein écran.
      */}
      {annihilation && <div key={annihilation.at} className="hud__blast" />}

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
        {/* La pourriture, **sous** les cœurs et jamais à côté : ce n'est pas une
            seconde barre de vie, c'est ce qui va en manger. La mettre dans la
            même rangée l'aurait fait lire comme une ressource de plus. Elle ne
            paraît que sur le Marais, faute d'y monter ailleurs. */}
        <RotMeter />
      </div>

      {/* Même astuce de `key` que le flash de dégâts : changer la clé recrée
          l'élément, donc rejoue l'animation CSS. Sans ça, le bandeau du
          deuxième lieu découvert resterait figé sur sa dernière image. */}
      {lastDiscovery && (
        <div key={lastDiscovery} className="discovery">
          <span className="discovery__kicker">{dict.ui.discovery.kicker}</span>
          {/* Deux dictionnaires pour un seul bandeau : les monuments portent un
              objet — ils auront un jour autre chose qu'un nom — quand un lieu
              remarquable n'est qu'une chaîne, puisqu'il n'est *que* son nom. Le
              prédicat vient de la table des lieux plutôt que d'une liste
              recopiée ici, qui aurait vieilli au premier lieu ajouté. */}
          <strong className="discovery__name">
            {isSiteId(lastDiscovery)
              ? dict.ui.sites[lastDiscovery]
              : dict.ui.landmarks[lastDiscovery].name}
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

      {/*
        Ouverture du portail. Troisième bandeau et le plus bas des trois, mais
        c'est le seul qui puisse tomber en même temps qu'un autre : le dernier
        ennemi de la carte peut très bien mourir sur le parvis d'un monument
        qu'on vient de découvrir. D'où trois hauteurs et non deux.

        Il porte une ligne de plus que les autres, et elle est nécessaire : les
        deux premiers annoncent quelque chose qui se trouve *sous les yeux du
        joueur*, celui-ci annonce un objet apparu à l'autre bout de la carte. Le
        nom du lieu ne suffit pas — encore faut-il dire ce qu'on y trouvera.
      */}
      {portalOpenedAt !== null && (
        <div key="portal" className="discovery discovery--portal">
          <span className="discovery__kicker">{dict.ui.portal.kicker}</span>
          <strong className="discovery__name">{dict.ui.portal.name}</strong>
          <span className="discovery__hint">{dict.ui.portal.hint}</span>
        </div>
      )}

      {/*
        Bandeau du second souffle. Quatrième hauteur, et la plus basse : c'est
        le seul des quatre qui puisse tomber pendant un combat de boss, donc le
        seul qui ne doive rien recouvrir de ce qui se passe au centre de l'écran.

        Sa clé est l'horodatage et non un booléen : le relèvement n'arrive
        qu'une fois par partie, mais une seconde partie doit rejouer son
        animation, et `reset` remet l'horloge à zéro en même temps que l'état.
      */}
      {Number.isFinite(revivedAt) && (
        <div key={`revive-${revivedAt}`} className="discovery discovery--revive">
          <span className="discovery__kicker">{dict.ui.revive.kicker}</span>
          <strong className="discovery__name">{dict.ui.revive.name}</strong>
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
        <div
          // Le portail n'a pas d'identifiant : il n'y en a qu'un par carte, et
          // sa famille suffit donc à le distinguer de toutes les autres cibles.
          key={`prompt-${interaction.kind}-${'id' in interaction ? interaction.id : ''}`}
          className="hud__prompt"
        >
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
            {/* La ligne qui dit ce que la mort coûte, et elle est nécessaire :
                le bouton seul laisserait croire à une nouvelle partie, et
                personne ne cliquerait dessus de gaieté de cœur après une heure
                de jeu. Voir `respawn` dans le store. */}
            <p className="gameover__hint">{dict.ui.gameover.hint}</p>
            <button type="button" onClick={resume}>
              {dict.ui.gameover.resume}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
