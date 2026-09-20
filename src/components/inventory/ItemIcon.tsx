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
  'madara-garb': (
    <>
      {/* Manteau fermé : une seule masse qui s'évase, là où le manteau du
          bretteur s'ouvre sur une échancrure. C'est ce plein contre ce vide qui
          sépare les deux cases d'un coup d'œil, avant la couleur. */}
      <path d="M8 5l4-1.6L16 5l3 3-2 2-1-1v11H8V9L7 10 5 8z" fill="currentColor" opacity="0.9" />
      {/* Trois lamelles du plastron, en creux. Trois et pas deux : c'est
          l'empilement qui dit « armure », deux traits font une couture. */}
      <path
        d="M9.4 10.2h5.2M9.4 12.6h5.2M9.4 15h5.2"
        stroke="#171226"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {/* Col montant, qui dépasse des épaules. */}
      <path d="M9.2 6.4 12 5.6l2.8 0.8-0.6 1.5L12 7.2l-2.2 0.7z" fill="#171226" opacity="0.75" />
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
  'dawn-cloak': (
    <>
      {/* Manteau fermé, comme celui du clan — mais il tombe droit et s'évase
          jusqu'au bas de la case, là où l'autre s'arrête aux cuisses. À 44
          pixels, c'est cette hauteur-là qui sépare les deux vêtements sombres
          avant même la couleur. */}
      <path
        d="M8.4 5.2 12 3.6 15.6 5.2 18.8 8.2 16.8 10.2 15.8 9.2 17 20.4 7 20.4 8.2 9.2 7.2 10.2 5.2 8.2z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* La ligne de fermeture, du col à l'ourlet : la seule verticale de tout
          le jeu de vignettes, et donc la signature de cette case. */}
      <path d="M12 6.6V20.4" stroke="#171226" strokeWidth="1.3" strokeLinecap="round" />
      {/* Col en V, dressé au-dessus des épaules. Deux pans écartés, pas un
          bandeau : c'est l'échancrure qui dit « Aube » plutôt que « clan ». */}
      <path d="M9.3 8.4 9.8 4.2 12 6.2 14.2 4.2 14.7 8.4 12 7.1z" fill="#171226" opacity="0.8" />
      {/* Un nuage, en creux. Un seul : deux en feraient un motif, et à cette
          taille un motif n'est plus qu'une texture. */}
      <path
        d="M9.4 14.6c0.5-0.7 1.2-0.5 1.6-0.1 0.4-0.6 1.3-0.5 1.5 0.2 0.7-0.2 1.2 0.4 0.9 1 0.4 0.4 0.2 1.1-0.5 1.1-2 0.1-3.3 0.1-3.7 0-0.7-0.2-0.8-1.1-0.3-1.4-0.2-0.3-0.1-0.6 0.5-0.8z"
        fill="#171226"
        opacity="0.8"
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
  'demon-armor': (
    <>
      {/* La capuche, en fer à cheval : l'ouverture du visage est un creux et
          non un trait. C'est la seule pièce de tête de tout le jeu de
          vignettes, et donc la signature de cette case — les quatre autres
          tenues se distinguent par la coupe du vêtement, celle-ci par le
          couvre-chef. */}
      <path
        d="M12 2.8c3.5 0 5.9 2.5 5.9 6v2.4h-2.5V8.8c0-2.1-1.4-3.7-3.4-3.7S8.6 6.7 8.6 8.8v2.4H6.1V8.8c0-3.5 2.4-6 5.9-6z"
        fill="currentColor"
      />
      {/* Trois plaques empilées : l'armure. Les largeurs décroissent vers le
          bas, sinon les barres se lisent comme un gril. */}
      {[0, 1, 2].map((row) => (
        <rect
          key={row}
          x={7.2 + row * 0.5}
          y={12.4 + row * 2.7}
          width={9.6 - row}
          height={2}
          rx={0.9}
          fill="#171226"
          opacity="0.85"
        />
      ))}
      {/* Le disque du pectoral, décentré : la seule asymétrie de la case, et
          ce qui rappelle l'épaulière unique du modèle. */}
      <circle cx="9.7" cy="13.4" r="0.95" fill="currentColor" />
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
