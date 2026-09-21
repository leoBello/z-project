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
  'vader-armor': (
    <>
      {/* Le casque, et lui seul en pièce de tête : c'est la seule vignette du
          jeu dont la silhouette se reconnaisse **sans le corps**. Dôme large,
          deux joues qui tombent, et un menton carré — le fer à cheval de la
          capuche du Dieu Démon s'ouvre en haut, celui-ci est fermé. */}
      <path
        d="M12 2.2c3.6 0 5.8 2.6 5.8 6.3 0 2-0.5 3.4-0.5 4.6l1 2.6-2.6 0.6L15 14.2h-6l-0.7 2-2.6-0.6 1-2.6c0-1.2-0.5-2.6-0.5-4.6 0-3.7 2.2-6.3 5.8-6.3z"
        fill="currentColor"
      />
      {/* Les deux lentilles, en creux : c'est leur pente vers le nez qui fait
          un regard qui vise plutôt qu'un regard inquiet. */}
      <path d="M9 7.6 11.2 7v2.2L9 9.8z M15 7.6 12.8 7v2.2L15 9.8z" fill="#171226" />
      {/* La grille de bouche, en creux elle aussi : les deux seules marques de
          la case, et ce qui empêche le casque d'être un galet. */}
      <path d="M10.6 11h2.8v2h-2.8z" fill="#171226" />
      {/* Le plastron de commande, sous le casque : la seule pièce qui dise
          « armure » plutôt que « masque ». */}
      <rect x="8.6" y="17" width="6.8" height="4.6" rx="1" fill="currentColor" opacity="0.75" />
      <path d="M9.8 18.6h1.4M12.2 18.6h1.6M10.4 20.2h3" stroke="#171226" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  'vader-saber': (
    <>
      {/* La même diagonale que les deux autres armes — c'est elle qui dit
          « arme » à 44 pixels — mais **sans pointe et sans garde** : une barre
          de lumière à bouts ronds, plus longue et plus fine que les deux
          lames d'acier. Les trois cases doivent se distinguer d'un coup d'œil,
          les trois armes s'excluant deux à deux. */}
      <path
        d="M19.6 3.6 9.4 13.8"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Le cœur blanc, dans le halo : c'est ce dégradé du centre au bord qui
          fait lire une source de lumière, pas un bâton peint. */}
      <path
        d="M19.6 3.6 9.4 13.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* La poignée, tracée **en creux** et non dans l'accent de l'objet.

          C'est le seul glyphe d'arme dont la lame soit une source de lumière :
          peinte de la même teinte que le halo, la poignée s'y fondait et la
          case entière n'était plus qu'un trait rouge. Le creux la sépare, comme
          il sépare déjà les ébréchures de Kitetsu et les lamelles du clan. */}
      <path
        d="M8.6 14.6 5 18.2"
        stroke="#171226"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Les deux bagues, et l'émetteur qui ferme la poignée : trois entailles
          qui suffisent à dire « objet » plutôt que « bâton ». */}
      <path
        d="M7.6 15.6 6.4 16.8M9.4 13.8 8.2 15"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M10 13.2 8.8 14.4"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
        opacity="0.85"
      />
    </>
  ),

  'meruem-garb': (
    <>
      {/*
        Le casque et ses deux cornes — **c'est lui qui identifie le personnage**,
        et le glyphe précédent ne montrait que son tronc. Une carapace lisse sur
        un crâne est une bosse ; ce sont les cornes balayées vers l'arrière qui
        en font un casque, et elles seules débordent assez pour se voir à
        quarante-quatre pixels.
      */}
      <path
        d="M12 2.2C8.6 2.2 7 4.4 7.1 6.6L7.2 8h9.6l.1-1.4c.1-2.2-1.5-4.4-4.9-4.4z"
        fill="currentColor"
      />
      <path d="M7.1 6.4 2.2 4.6l2.6 2.6-3-.3 5.1 1.5z" fill="currentColor" />
      <path d="M16.9 6.4 21.8 4.6l-2.6 2.6 3-.3-5.1 1.5z" fill="currentColor" />

      {/* Le tronc : une chitine conique, épaules larges et taille étroite. Pas
          d'échancrure, pas de pans — c'est un corps, pas un vêtement, et c'est ce
          qui sépare cette case des cinq autres tenues. */}
      <path d="M12 8.4 16.4 10.4l.8 4.8-1.2 5.2h-8l-1.2-5.2.8-4.8z" fill="currentColor" opacity="0.9" />
      {/* Les deux rainures du ventre : la seule chose qui dise « segmenté ». */}
      <path
        d="M10 14.4h4M10.3 16.6h3.4"
        stroke="#0d1512"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* La queue et son dard, qui sortent du cadre de la silhouette. C'est le
          seul glyphe de la grille dont la forme déborde par la droite — et à
          quarante-quatre pixels, déborder est ce qui se remarque en premier. */}
      <path
        d="M16.4 18c3.2.4 4.6-1.8 4.2-4.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M20.6 14 21.9 9.6 18.7 11.8z" fill="currentColor" />
    </>
  ),
  'kuroro-garb': (
    <>
      {/* Le manteau : fermé et évasé, comme celui du clan. Ce qui les sépare est
          au-dessus. */}
      <path d="M12 6.4 16.8 8l1.6 12H5.6L7.2 8z" fill="currentColor" opacity="0.88" />
      {/* La fourrure — **la pièce qui fait la case**. Une bande dentelée plus
          large que les épaules, et le seul glyphe de la grille qui en porte
          une. C'est elle qui empêche cette silhouette de se confondre avec les
          trois autres manteaux sombres. */}
      <path
        d="M5.4 7.6 7 5.4l1.8 1.8L10.6 5l1.4 2.2L13.4 5l1.8 2.2L17 5.4l1.6 2.2-1.2 1.6H6.6z"
        fill="currentColor"
      />
      {/* La croix inversée : barre longue en haut, barre courte **en bas**, et
          c'est cette position basse qui la distingue d'une croix ordinaire. */}
      <path
        d="M12 1.2v3.2M10.6 3.6h2.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </>
  ),
  'konami-papyrus': (
    <>
      {/* Un rouleau **couché**, et c'est tout le glyphe : les onze autres cases
          sont debout — silhouettes de vêtements, lames en diagonale. Une
          horizontale franche ne ressemble à aucune d'elles, ce qui est
          exactement ce qu'on demande à une case reconnaissable du coin de
          l'œil. */}
      <path d="M5.5 8.5h13v7h-13z" fill="currentColor" opacity="0.9" />
      {/* Les deux tambours enroulés aux extrémités. Ce sont eux qui disent
          « rouleau » plutôt que « plaque » : sans eux, le rectangle se lit
          comme une tablette. */}
      <ellipse cx="5.5" cy="12" rx="1.7" ry="3.5" fill="currentColor" />
      <ellipse cx="18.5" cy="12" rx="1.7" ry="3.5" fill="currentColor" />
      {/* Trois lignes d'écriture en creux, inégales : trois traits de même
          longueur auraient fait des rayures, et c'est la dernière, plus
          courte, qui fait lire « texte ». */}
      <path
        d="M8.2 10.4h7.4M8.2 12h7.4M8.2 13.6h4.6"
        stroke="#171226"
        strokeWidth="1.1"
        strokeLinecap="round"
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
