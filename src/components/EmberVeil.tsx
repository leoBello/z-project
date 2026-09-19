import type { CSSProperties } from 'react'
import { EMBER_OFFSETS } from '../config/embers'

/**
 * Le voile de braises : ce que le jeu montre quand il déplace le joueur.
 *
 * Il existait déjà, enfermé dans `TeleportOverlay`. Le voyage entre les deux
 * cartes avait d'abord reçu un voile violet à lui, au motif que les deux gestes
 * ne disent pas la même chose — les braises déplacent *dans* une carte, le
 * violet en *change*. **C'était une erreur, et pour une raison qu'on ne voit
 * qu'à l'écran** : un aplat immobile posé pendant que le jeu travaille ne se lit
 * pas comme une transition, il se lit comme un plantage. Les braises bougent ;
 * l'attente devient donc une attente, et non un gel.
 *
 * Il sert maintenant les deux, et le vocabulaire visuel du déplacement est
 * commun — ce qu'il aurait toujours dû être.
 *
 * **Deux phases plutôt qu'une seule animation.** Celle de `TeleportOverlay` est
 * une ligne de temps fermée : couvrir, déplacer, découvrir, le tout en 1 800 ms
 * connues d'avance. Le voyage entre cartes ne peut pas fonctionner ainsi — il
 * doit rester couvert *aussi longtemps qu'il faut* pour que le fragment de l'île
 * arrive et que la carte se monte, ce qu'aucune durée écrite d'avance ne sait.
 * D'où une phase qui couvre et s'arrête, et une seconde que React déclenche en
 * changeant la classe.
 */

interface EmberVeilProps {
  /** `covering` couvre l'écran et s'y tient ; `revealing` le dégage. */
  phase: 'covering' | 'revealing'
  /** Durée de la phase courante, en millisecondes de temps réel. */
  durationMs: number
}

export function EmberVeil({ phase, durationMs }: EmberVeilProps) {
  return (
    <div
      className={`ember-veil ember-veil--${phase}`}
      aria-hidden="true"
      style={{ '--ember-phase': `${durationMs}ms` } as CSSProperties}
    >
      <div className="ember-veil__veil" />
      {EMBER_OFFSETS.map(([dx, dy]) => (
        <span
          key={`${dx}-${dy}`}
          className="ember-veil__ember"
          style={{ '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties}
        />
      ))}
    </div>
  )
}
