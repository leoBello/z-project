import type { ItemId } from '../../types/game'

/**
 * Illustrations des objets, **tracées en SVG**.
 *
 * Aucune image bitmap, pour la même raison que `ProjectIllustration` : le jeu
 * tient en un seul bundle, rien ne se télécharge, et la palette reste sous
 * contrôle. Un PNG de tenue aurait aussi imposé une seconde direction
 * artistique — un rendu peint à côté d'un monde en cel-shading facetté.
 *
 * Le tracé décrit l'objet **tel qu'il est porté dans le jeu** : mêmes teintes
 * que la palette de `HeroPlaceholder`, mêmes lamelles, même ligature. La carte
 * doit montrer ce qu'on va voir courir dans l'herbe, pas une variante
 * d'illustrateur.
 */

/** Teintes partagées avec la silhouette 3D. Voir `OUTFITS.zoro`. */
const ZORO = {
  coat: '#1f6b3c',
  coatShade: '#17532e',
  sash: '#57a544',
  sashShade: '#3f8231',
  saya: '#1b1822',
  gold: '#d8a93f',
  grip: '#f4efe2',
  hair: '#6fa83c',
  skin: '#efbb86',
  scar: '#c98a5e',
  trouser: '#2b2733',
} as const

/**
 * Tenue du Chasseur de Pirates.
 *
 * Cadrée **en pied**, sur un format portrait (320 × 300), comme la carte du
 * katana : la colonne d'illustration prend la hauteur du texte à côté, pas celle
 * du dessin, et un cadre paysage laissait un bandeau vide sous les pieds.
 *
 * Le fond monte du sombre au clair et porte un halo doré derrière les épaules.
 * Il est resté doré alors que la tenue est passée du prune au vert, et c'est
 * volontaire : un halo vert derrière un manteau vert aurait effacé l'épaule, qui
 * est justement l'endroit où la silhouette est la plus large.
 *
 * Trois choses portent la reconnaissance, et elles sont dessinées dans cet
 * ordre de priorité : le **manteau ouvert** sur un torse balafré, le **haramaki**
 * qui coupe la figure à la taille, et les **deux fourreaux** qui pendent au
 * côté. Le visage vient après — à 320 pixels de large il ne pèse presque rien.
 */
function ZoroGarb() {
  return (
    <svg viewBox="0 0 320 300" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="garb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#241f3a" />
          <stop offset="100%" stopColor="#56507a" />
        </linearGradient>
        <radialGradient id="garb-halo" cx="0.5" cy="0.38" r="0.55">
          <stop offset="0%" stopColor="#c9a04a" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#c9a04a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="320" height="300" fill="url(#garb-sky)" />
      <circle cx="160" cy="115" r="140" fill="url(#garb-halo)" />

      {/* Crête sous les pieds : ancre la silhouette au sol plutôt que de la
          laisser flotter au milieu du cadre. */}
      <path d="M0 276 L86 258 L160 268 L240 254 L320 272 L320 300 L0 300 Z" fill="#241f38" />

      {/*
        Coupe verte, dessinée avant la tête : elle passe derrière le crâne.

        Courte, et c'est tout l'écart avec la crinière qui occupait ce cadre
        avant elle — les pointes partent vers l'arrière et aucune ne descend
        sous la mâchoire. Leurs longueurs sont inégales : une couronne régulière
        se lit comme un oursin, pas comme une chevelure.
      */}
      <path
        d="M160 22 C126 22 112 44 114 66 L108 48 L106 72 L98 60 L102 82
           C104 92 108 98 114 102 L114 62 L206 62 L206 102
           C212 98 216 92 218 82 L222 60 L214 72 L212 48 L206 66
           C208 44 194 22 160 22 Z"
        fill={ZORO.hair}
      />

      {/* Visage. */}
      <path d="M137 46 h46 v46 a23 23 0 0 1 -46 0 Z" fill={ZORO.skin} />
      {/* Frange, ramenée en arrière : le front reste dégagé, sinon le regard
          disparaît et avec lui la cicatrice. */}
      <path d="M133 42 h54 v18 l-18 -7 l-18 7 l-18 -7 Z" fill={ZORO.hair} />
      {/* Œil ouvert d'un côté, simple trait fermé de l'autre. C'est le
          contraste entre les deux, pas le relief, qui se lit à cette taille. */}
      <path d="M143 72 h13 v6 h-13 Z" fill="#241d2c" />
      <path d="M164 72 h14 v3.5 h-14 Z" fill="#241d2c" />
      {/* La balafre qui traverse l'œil clos. */}
      <path d="M171 50 h4.5 v40 h-4.5 Z" fill={ZORO.scar} />
      {/* Trois anneaux à l'oreille. */}
      {[72, 80, 88].map((cy) => (
        <circle key={cy} cx={188} cy={cy} r={3.4} fill={ZORO.gold} />
      ))}

      {/* Bras, sous le manteau : ils sont nus, et sans eux les fourreaux
          flotteraient dans le vide à côté du torse. */}
      <path d="M100 138 h24 v72 h-24 Z" fill={ZORO.skin} />
      <path d="M196 138 h24 v72 h-24 Z" fill={ZORO.skin} />
      {/* Bandana noué au biceps. */}
      <path d="M100 160 h24 v14 h-24 Z" fill={ZORO.trouser} />

      {/* Torse nu, et la grande balafre de l'épaule à la hanche. Elle est
          tracée avant le manteau : ce sont les pans qui la coupent, exactement
          comme en 3D. */}
      <path d="M140 120 h40 v104 h-40 Z" fill={ZORO.skin} />
      <path
        d="M137 132 L184 214"
        stroke={ZORO.scar}
        strokeWidth="9"
        strokeLinecap="round"
      />

      {/* Jambes, dans l'échancrure du manteau. */}
      <path d="M142 214 h16 v54 h-16 Z M162 214 h16 v54 h-16 Z" fill={ZORO.trouser} />

      {/* Les deux sabres au fourreau, posés avant le haramaki : c'est la
          ceinture qui doit avoir l'air de les tenir, pas l'inverse. */}
      {[0, 1].map((i) => (
        <g key={i} transform={`translate(${i * 15} ${i * 4}) rotate(${6 + i * 3} 224 240)`}>
          <path d="M218 212 h12 v74 h-12 Z" fill={ZORO.saya} />
          <circle cx="224" cy="208" r="9" fill={ZORO.gold} />
          <path d="M219 172 h10 v32 h-10 Z" fill={i === 0 ? ZORO.grip : ZORO.saya} />
        </g>
      ))}

      {/* Manteau : deux pans évasés, franchement ouverts. L'échancrure fait
          40 pixels de large sur 320 — en dessous, le torse et sa balafre
          disparaissaient derrière le tissu. */}
      <path d="M124 128 L146 128 L142 200 L138 268 L96 268 L118 150 Z" fill={ZORO.coat} />
      <path d="M174 128 L196 128 L222 150 L226 268 L182 268 L178 200 Z" fill={ZORO.coatShade} />

      {/* Haramaki : large, et il déborde des deux pans. C'est la pièce qui
          coupe la figure en deux et lui donne sa taille. */}
      <path d="M118 198 h84 v34 h-84 Z" fill={ZORO.sash} />
      <path d="M118 224 h84 v8 h-84 Z" fill={ZORO.sashShade} />

      {/* Bottes sombres : elles ferment la silhouette par le bas, là où le
          pantalon s'arrêtait dans le vide. */}
      <path d="M136 258 h26 v16 h-30 Z M162 258 h26 v16 h-30 Z" fill={ZORO.trouser} />
    </svg>
  )
}

/** Teintes partagées avec la lame 3D. Voir `Katana` dans `HeroPlaceholder`. */
const KATANA = {
  blade: '#dde6ef',
  bladeShade: '#a9b8c9',
  edge: '#f6fbff',
  guard: '#d0a53c',
  grip: '#3a2a1e',
  cord: '#2f4f66',
  jade: '#4fc9a3',
} as const

/**
 * Katana de Kusanagi.
 *
 * Même format portrait que la tenue, et la lame le remplit **en diagonale** :
 * posée à la verticale, elle ne fait qu'un trait au milieu d'un cadre vide ; à
 * plat, elle perd toute la hauteur de la case. La diagonale est le seul cadrage
 * qui donne à une arme longue sa longueur dans un rectangle debout.
 *
 * Le halo est de jade et non d'or, pour la même raison que l'accent de l'objet :
 * l'or est déjà la couleur du trésor dans tout le jeu, et une lame légendaire
 * dorée se serait lue comme un butin de plus.
 */
function KusanagiKatana() {
  return (
    <svg viewBox="0 0 320 300" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="katana-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16232c" />
          <stop offset="100%" stopColor="#3c5462" />
        </linearGradient>
        <radialGradient id="katana-halo" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor={KATANA.jade} stopOpacity="0.42" />
          <stop offset="100%" stopColor={KATANA.jade} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="320" height="300" fill="url(#katana-sky)" />
      <circle cx="160" cy="150" r="150" fill="url(#katana-halo)" />

      {/* Trois traits d'ombre derrière la lame : ils donnent le mouvement du
          coup, et empêchent la diagonale de se lire comme un décor rayé. */}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${44 + i * 14} ${252 - i * 8} L${236 + i * 14} ${52 - i * 8}`}
          stroke={KATANA.jade}
          strokeWidth="2"
          strokeLinecap="round"
          opacity={0.14 - i * 0.035}
        />
      ))}

      {/* Poignée, du coin bas-gauche jusqu'à la garde. */}
      <path d="M46 262 L82 226 L94 238 L58 274 Z" fill={KATANA.grip} />
      {/* Ligature : sept losanges alternés, la signature d'un tsuka-ito. */}
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={`wrap-${i}`}
          d={`M${52 + i * 8} ${268 - i * 8} l10 -10 l6 6 l-10 10 z`}
          fill={KATANA.cord}
        />
      ))}
      {/* Pommeau. */}
      <path d="M40 268 h14 v10 h-14 z" fill={KATANA.cord} transform="rotate(-45 47 273)" />

      {/* Tsuba : le disque de garde, vu de trois quarts, donc une ellipse. */}
      <ellipse cx="99" cy="209" rx="9" ry="21" fill={KATANA.guard} transform="rotate(-45 99 209)" />

      {/* Lame : un long quadrilatère à peine courbe. Le dos est plus sombre, le
          tranchant presque blanc — c'est ce contraste, et non un contour, qui
          fait qu'on voit de quel côté ça coupe. */}
      <path d="M104 204 L246 56 L258 62 L116 216 Z" fill={KATANA.bladeShade} />
      <path d="M110 210 L252 60 L258 62 L116 216 Z" fill={KATANA.blade} />
      <path d="M113 213 L255 61 L258 62 L116 216 Z" fill={KATANA.edge} />

      {/* Kissaki : la pointe, coupée en biais. */}
      <path d="M246 56 L272 40 L262 68 L258 62 Z" fill={KATANA.blade} />
      <path d="M258 62 L272 40 L266 60 Z" fill={KATANA.edge} />

      {/* Éclat de jade au ras du tranchant : la seule chose qui dise que la lame
          n'est pas une lame ordinaire. */}
      <path
        d="M118 214 L258 64"
        stroke={KATANA.jade}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  )
}

const ILLUSTRATIONS: Record<ItemId, () => React.JSX.Element> = {
  'zoro-garb': ZoroGarb,
  kusanagi: KusanagiKatana,
}

export function ItemIllustration({ id }: { id: ItemId }) {
  const Drawing = ILLUSTRATIONS[id]
  return (
    <div className="item-card__illustration">
      <Drawing />
    </div>
  )
}
