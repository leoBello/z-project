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
  'zoro-garb': (
    <>
      {/* Manteau ouvert : épaules larges, deux pans qui s'écartent sur une
          échancrure centrale. C'est l'échancrure qui distingue cette case de
          n'importe quelle autre silhouette de vêtement. */}
      <path
        d="M8 5l4-1.6L16 5l3 3-2 2-1-1v11h-3.4V9.5h-1.2V20H8V9L7 10 5 8z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Le haramaki, qui coupe la figure à la taille. */}
      <path d="M7.4 13h9.2" stroke="#171226" strokeWidth="2.2" strokeLinecap="round" />
      {/* Deux fourreaux au côté : la seule asymétrie de la case, et ce qui
          dit « bretteur » avant même le manteau. */}
      <path
        d="M16.4 13.5 19.4 20M18 13 21 19.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      />
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
  'cursed-blade': (
    <>
      {/* Même diagonale que le katana — c'est elle qui dit « arme » à 44 pixels
          — mais une lame deux fois plus courte et plus large, et une garde
          droite au lieu du disque. Les deux cases doivent se distinguer d'un
          coup d'œil : les deux armes s'excluent, le joueur choisit entre elles. */}
      <path d="M17.6 5.4 11.2 11.8l2 2 6.4-6.4z" fill="currentColor" />
      {/* Les trois ébréchures du dos, en creux dans la lame. */}
      <path
        d="M15.6 5.6 14.4 6.8M13.4 7.8 12.2 9M11.2 10 10 11.2"
        stroke="#171226"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* Garde droite, en travers : la barre est la signature de cette lame,
          comme le disque est celle du katana. */}
      <path
        d="M8.2 11.4 12.6 15.8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* Poignée courte, à une main. */}
      <path
        d="M9.2 14.4 6.4 17.2"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.75"
      />
    </>
  ),
  'fishman-scales': (
    <>
      {/* Trois écailles en quinconce, chacune une goutte pointe en bas. La
          quinconce est ce qui distingue la case : trois formes alignées se
          seraient lues comme des pétales, donc comme une plante. */}
      {[
        [12, 5.2],
        [8.4, 11],
        [15.6, 11],
      ].map(([cx, cy]) => (
        <path
          key={`${cx}-${cy}`}
          d={`M${cx} ${cy} c3 0 4.6 2.2 4.6 4.2 0 2.4-2 4.2-4.6 4.2 s-4.6-1.8-4.6-4.2 c0-2 1.6-4.2 4.6-4.2 z`}
          fill="currentColor"
          opacity="0.85"
        />
      ))}
      {/* Nervure centrale sur l'écaille du haut, la seule assez grande pour la
          porter : sans elle, les trois formes restent des galets. */}
      <path d="M12 6.6v6.4" stroke="#171226" strokeWidth="1.4" strokeLinecap="round" />
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
