import type { ItemId } from '../../types/game'

/**
 * Vignette d'un objet dans la grille de l'inventaire.
 *
 * Volontairement plus schématique que `ItemIllustration` : à 44 pixels de côté,
 * un dessin détaillé devient une tache. On garde la silhouette et la seule
 * couleur qui identifie l'objet — c'est ce qui rend une case reconnaissable du
 * coin de l'œil, pas la finesse du tracé.
 */

const GLYPHS: Record<ItemId, React.JSX.Element> = {
  'ninja-garb': (
    <>
      {/* Manteau : épaules larges, deux pans qui s'écartent. */}
      <path
        d="M8 6l4-2 4 2 3 3-2 2-1-1v10l-4-4-4 4V10L7 11 5 9z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Deux lamelles du plastron, en creux. */}
      <path d="M9.5 9.5h5M9.5 12h5" stroke="#1b1626" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  kusanagi: (
    <>
      {/* Lame en diagonale : à 44 pixels, c'est l'inclinaison qui distingue une
          arme d'une barre, et la diagonale occupe toute la case. */}
      <path
        d="M19.6 3.2 9.9 12.9l1.4 1.4 9.7-9.7a1 1 0 0 0 0-1.4z"
        fill="currentColor"
      />
      {/* Tsuba et poignée : le disque, seule silhouette qui dise « katana ». */}
      <circle cx="9.2" cy="13.6" r="2.4" fill="currentColor" opacity="0.55" />
      <path
        d="M8 14.8 4.4 18.4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.75"
      />
    </>
  ),
}

export function ItemIcon({ id, accent }: { id: ItemId; accent: string }) {
  return (
    <svg className="item-icon" viewBox="0 0 24 24" aria-hidden="true" style={{ color: accent }}>
      {GLYPHS[id]}
    </svg>
  )
}
