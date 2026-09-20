import { useEffect, useRef } from 'react'
import { ROT } from '../config/rotBlight'
import { useI18n } from '../i18n/useI18n'
import { now as gameNow } from '../state/gameClock'
import { rot } from '../state/rot'

/**
 * Le bandeau de pourriture, sous les cœurs.
 *
 * Il lit `state/rot.ts` dans **sa propre boucle** et écrit directement dans le
 * style de l'élément, exactement comme la minimap dessine son canvas : un state
 * React aurait re-rendu tout le HUD soixante fois par seconde pour faire bouger
 * une barre de quelques pixels.
 *
 * Il n'existe visuellement que lorsque la jauge est entamée. Ce n'est pas de la
 * discrétion : sur les deux autres cartes elle reste à zéro pour toujours, et un
 * bandeau vide en permanence sous les cœurs apprendrait au joueur à ne pas le
 * regarder — précisément l'inverse de ce qu'on veut le jour où il se remplit.
 *
 * Trois états, et ils se distinguent **sans la couleur seule** : la barre monte,
 * puis elle pulse à l'approche du seuil, puis elle se remplit et la bordure
 * s'allume. Un joueur qui ne distingue pas le rouge du rouge sombre voit quand
 * même quelque chose changer deux fois.
 */
export function RotMeter() {
  const { dict } = useI18n()
  const root = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0

    const draw = () => {
      const box = root.current
      const bar = fill.current
      if (box && bar) {
        const level = rot.level
        const ratio = level / ROT.max
        // `hidden` plutôt qu'un démontage : l'élément garde sa place dans la
        // pile du HUD, donc les cœurs ne sautent pas d'une ligne quand la jauge
        // s'entame pour la première fois.
        box.hidden = level <= 0
        if (level > 0) {
          bar.style.width = `${(ratio * 100).toFixed(1)}%`
          const contaminated = gameNow() < rot.contaminatedUntil
          box.dataset.state = contaminated
            ? 'contaminated'
            : level >= ROT.warnAt
              ? 'warning'
              : 'rising'
          box.setAttribute(
            'aria-valuenow',
            String(Math.round(ratio * 100)),
          )
        }
      }
      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      ref={root}
      className="rot-meter"
      hidden
      role="progressbar"
      aria-label={dict.ui.hud.rotLabel}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div ref={fill} className="rot-meter__fill" />
    </div>
  )
}
