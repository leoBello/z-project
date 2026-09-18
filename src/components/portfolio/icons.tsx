/*
  Glyphes tracés plutôt que typographiés.

  Les caractères `×`, `←` et `→` n'occupent pas le centre de leur cadratin et
  varient d'une police système à l'autre : dans un bouton rond, ils tombent
  toujours un peu haut et un peu à gauche, et aucun réglage de `line-height` ne
  rattrape ça de façon portable. Un tracé SVG, lui, est centré par construction.

  Sortis du panneau le jour où le carrousel photo est arrivé : la figure et le
  plein écran en avaient besoin aussi, et trois copies d'un même chemin SVG sont
  trois occasions d'en corriger une seule.
*/

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={direction === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Quatre coins écartés.
 *
 * Dit « ça s'ouvre en grand » sans mot, et ne ressemble à aucun autre bouton du
 * panneau — surtout pas aux chevrons, qui déplacent au lieu d'agrandir.
 */
export function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9 4H4v5M15 4h5v5M15 20h5v-5M9 20H4v-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
