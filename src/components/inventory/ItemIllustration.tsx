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

/** Teintes partagées avec la silhouette 3D. Voir `OUTFITS.madara`. */
const CLAN = {
  coat: '#4b4062',
  coatShade: '#3a3150',
  plate: '#a8302f',
  plateShade: '#7d1f22',
  lace: '#d8a93f',
  wrap: '#ece4d4',
  hair: '#1a1723',
  skin: '#f0c39c',
} as const

/**
 * Tenue du Clan.
 *
 * Même cadrage en pied que la tenue du bretteur, et même fond : les deux
 * occupent le même emplacement d'équipement, le joueur les compare, et deux
 * mises en page différentes auraient rendu la comparaison plus difficile que la
 * décision.
 *
 * Trois choses portent la reconnaissance, dans cet ordre : la **crinière**, qui
 * déborde des épaules et que rien d'autre dans l'inventaire ne possède ; le
 * **plastron lacé d'or**, dessiné avant le manteau parce que c'est lui qu'on
 * regarde ; et les **bandages de lin**, seules taches claires de la figure, qui
 * ferment les avant-bras et les mollets.
 *
 * Le halo doré derrière les épaules n'est pas décoratif : sans lui, le manteau
 * prune et la crinière noire se découpaient sur le fond de la carte comme un
 * autocollant.
 */
function MadaraGarb() {
  return (
    <svg viewBox="0 0 320 300" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="clan-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2440" />
          <stop offset="100%" stopColor="#5b5178" />
        </linearGradient>
        <radialGradient id="clan-halo" cx="0.5" cy="0.38" r="0.55">
          <stop offset="0%" stopColor="#c9a04a" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#c9a04a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="320" height="300" fill="url(#clan-sky)" />
      <circle cx="160" cy="115" r="140" fill="url(#clan-halo)" />

      {/* Crête sous les pieds : ancre la silhouette au sol plutôt que de la
          laisser flotter au milieu du cadre. */}
      <path d="M0 276 L86 258 L160 268 L240 254 L320 272 L320 300 L0 300 Z" fill="#241f38" />

      {/*
        Crinière, dessinée avant le corps : elle passe derrière les épaules.
        Le contour est volontairement irrégulier — les pointes n'ont ni la même
        longueur ni le même écartement. Une couronne régulière se lit comme un
        oursin, pas comme une chevelure ; c'est le même raisonnement que pour la
        crinière du modèle 3D.
      */}
      <path
        d="M160 24 C104 24 84 60 90 104 C93 138 80 164 60 196
           C92 182 112 162 120 138 C116 172 106 190 86 212
           C124 202 146 178 154 152 L166 152 C174 178 196 202 234 212
           C214 190 204 172 200 138 C208 162 228 182 260 196
           C240 164 227 138 230 104 C236 60 216 24 160 24 Z"
        fill={CLAN.hair}
      />

      {/* Bras, sous le manteau : ils portent les bandages. Sans eux, les
          rectangles de lin flottaient dans le vide de part et d'autre du
          torse — un bandage ne se lit que s'il entoure quelque chose. */}
      <path d="M96 148 h26 v58 h-26 Z" fill={CLAN.coatShade} />
      <path d="M198 148 h26 v58 h-26 Z" fill={CLAN.coatShade} />

      {/* Manteau : deux longs pans évasés, ouverts sur le devant. */}
      <path
        d="M122 132 L198 132 L222 268 L188 268 L176 186 L160 268 L144 186 L132 268 L98 268 Z"
        fill={CLAN.coat}
      />
      <path d="M160 132 L198 132 L222 268 L188 268 L176 186 L160 268 Z" fill={CLAN.coatShade} />

      {/* Visage, juste assez pour qu'on lise une personne sous l'armure. */}
      <path d="M137 46 h46 v46 a23 23 0 0 1 -46 0 Z" fill={CLAN.skin} />
      <path d="M143 72 h13 v6 h-13 Z M164 72 h13 v6 h-13 Z" fill={CLAN.hair} />
      {/* Frange : elle donne le regard bas et le côté fermé. */}
      <path d="M133 42 h54 v24 l-15 -11 l-12 13 l-12 -13 l-15 11 Z" fill={CLAN.hair} />

      {/* Col montant : la pièce qui, plus que tout le reste, dit « clan ». */}
      <path d="M124 132 L160 122 L196 132 L189 146 L160 136 L131 146 Z" fill={CLAN.plateShade} />

      {/* Plastron : lamelles laquées, empilées et lacées d'or. */}
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect
            x={126}
            y={144 + row * 18}
            width={68}
            height={15}
            rx={3}
            fill={row % 2 === 0 ? CLAN.plate : CLAN.plateShade}
          />
          <rect x={145} y={144 + row * 18} width={4} height={15} fill={CLAN.lace} />
          <rect x={173} y={144 + row * 18} width={4} height={15} fill={CLAN.lace} />
        </g>
      ))}

      {/* Épaulières : les mêmes lamelles, débordant sur les bras. */}
      {[0, 1, 2].map((row) => (
        <g key={`pauldron-${row}`}>
          <path
            d={`M${92 - row * 6} ${136 + row * 19} h38 v16 h-${38 - row * 4} Z`}
            fill={row % 2 === 0 ? CLAN.plate : CLAN.plateShade}
          />
          <path
            d={`M190 ${136 + row * 19} h${38 - row * 4} l${row * 6} 16 h-38 Z`}
            fill={row % 2 === 0 ? CLAN.plate : CLAN.plateShade}
          />
        </g>
      ))}

      {/* Bandages d'avant-bras, puis de mollets. */}
      <rect x="92" y="200" width="34" height="34" rx="8" fill={CLAN.wrap} />
      <rect x="194" y="200" width="34" height="34" rx="8" fill={CLAN.wrap} />
      <rect x="136" y="236" width="22" height="30" rx="5" fill={CLAN.wrap} />
      <rect x="162" y="236" width="22" height="30" rx="5" fill={CLAN.wrap} />

      {/* Sandales sombres : elles ferment la silhouette par le bas, là où les
          bandages s'arrêtaient dans le vide. */}
      <path d="M130 264 h30 v9 h-34 Z M160 264 h30 v9 h-34 Z" fill="#2f2a3d" />
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

/** Teintes partagées avec la lame 3D. Voir `CursedBlade` dans `HeroPlaceholder`. */
const KITETSU = {
  steel: '#2e2630',
  steelShade: '#1d1823',
  edge: '#b03a3a',
  edgeGlow: '#e0645c',
  guard: '#3b3340',
  grip: '#4a3325',
  cord: '#241a20',
  notch: '#17121d',
} as const

/**
 * Lame de Kitetsu.
 *
 * Elle reprend la **diagonale** du katana, et c'est délibéré : c'est le seul
 * cadrage qui donne sa longueur à une arme dans un rectangle debout, et les deux
 * cartes doivent pouvoir se comparer. Tout le reste s'en écarte, parce que les
 * deux armes occupent le même emplacement et s'excluent — le joueur choisit
 * entre elles, il faut donc qu'une image suffise à les distinguer.
 *
 * La lame s'arrête aux deux tiers du cadre là où le katana le traverse d'un coin
 * à l'autre. Elle est deux fois plus large, presque noire au lieu du blanc
 * bleuté, coupée droit à la pointe au lieu du biseau, et sa garde est une barre
 * et non un disque. Reste le fil, en rouge sourd : la seule chose qui accroche
 * la lumière sur toute l'arme, et la seule qui dise qu'elle n'est pas simplement
 * abîmée.
 *
 * Le halo est du même rouge, et non doré : l'or est la couleur du trésor dans
 * tout le jeu, et cette lame n'est pas un butin — c'est un marché.
 */
function KitetsuBlade() {
  // Trois ébréchures sur le dos, à des hauteurs inégales : régulières, elles
  // auraient fait une scie, donc un outil.
  const notches: ReadonlyArray<[number, number, number]> = [
    [127.6, 166, -18],
    [151.6, 142, 8],
    [173.7, 119.9, -6],
  ]

  return (
    <svg viewBox="0 0 320 300" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="kitetsu-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b1016" />
          <stop offset="100%" stopColor="#4d2f36" />
        </linearGradient>
        <radialGradient id="kitetsu-halo" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor={KITETSU.edgeGlow} stopOpacity="0.34" />
          <stop offset="100%" stopColor={KITETSU.edgeGlow} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="320" height="300" fill="url(#kitetsu-sky)" />
      <circle cx="160" cy="150" r="150" fill="url(#kitetsu-halo)" />

      {/* Deux traits d'ombre seulement, et épais, là où le katana en porte trois
          fins : celui-ci ne file pas, il tombe. */}
      {[0, 1].map((i) => (
        <path
          key={i}
          d={`M${64 + i * 22} ${244 - i * 14} L${218 + i * 22} ${90 - i * 14}`}
          stroke={KITETSU.edge}
          strokeWidth="4"
          strokeLinecap="round"
          opacity={0.16 - i * 0.06}
        />
      ))}

      {/* Poignée courte, à une main : elle tient dans le coin, sans la longue
          remontée à deux mains du katana. */}
      <path d="M50 262 L82 230 L96 244 L64 276 Z" fill={KITETSU.grip} />
      {[0, 1, 2].map((i) => (
        <path
          key={`wrap-${i}`}
          d={`M${56 + i * 11} ${270 - i * 11} l12 -12 l5 5 l-12 12 z`}
          fill={KITETSU.cord}
        />
      ))}

      {/* Garde : une barre droite en travers, l'écart le plus lisible avec le
          disque du katana. */}
      <path d="M82 194 L118 230 L110 238 L74 202 Z" fill={KITETSU.guard} />

      {/* Lame, large et courte. Le dos est plus sombre encore que le corps :
          c'est ce dégradé, et non un contour, qui lui donne son épaisseur. */}
      <path d="M98.8 194.8 L194.8 98.8 L213.2 117.2 L117.2 213.2 Z" fill={KITETSU.steel} />
      <path d="M98.8 194.8 L194.8 98.8 L201 105 L105 201 Z" fill={KITETSU.steelShade} />

      {/* Pointe coupée droit : la lame est brisée net, elle n'est pas effilée. */}
      <path d="M194.8 98.8 L206 87.6 L224.4 106 L213.2 117.2 Z" fill={KITETSU.steel} />

      {/* Le fil, plaqué sur la tranche. Volontairement fin : c'est le contraste
          qui le fait exister, et l'élargir aurait fait une arme de lave. */}
      <path d="M117.2 213.2 L213.2 117.2 L218.4 122.4 L122.4 218.4 Z" fill={KITETSU.edge} />
      <path
        d="M120 216 L216 120"
        stroke={KITETSU.edgeGlow}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Les ébréchures, en creux dans le dos. Peintes en presque noir plutôt
          qu'à la couleur du fond : celui-ci est un dégradé, aucune teinte fixe
          ne s'y confondrait sur toute la hauteur de la lame. */}
      {notches.map(([x, y, angle]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y} l14 -14 l4 12 z`}
          fill={KITETSU.notch}
          transform={`rotate(${angle} ${x} ${y})`}
        />
      ))}
    </svg>
  )
}

/** Teintes de la nacre. Aucun équivalent 3D : l'objet ne se porte pas à vue. */
const SCALES = {
  body: '#dff4f8',
  shade: '#9fd0de',
  deep: '#5aa6bb',
  ridge: '#ffffff',
  cord: '#6b533c',
  accent: '#7fd4e8',
} as const

/**
 * Écailles de l'Homme-Poisson.
 *
 * Le seul objet du jeu qui **ne se voit pas sur le personnage** : une babiole
 * nouée à la ceinture n'a pas de silhouette à montrer. La carte est donc le seul
 * endroit où le joueur le regardera vraiment, et elle doit porter toute la
 * lecture à elle seule.
 *
 * Six écailles en pyramide 3–2–1, largement débordantes les unes sur les autres.
 * L'empilement compte autant que la forme : trois écailles posées côte à côte se
 * lisent comme des pétales, donc comme une plante ; recouvertes, elles
 * redeviennent une peau.
 *
 * La lumière vient d'en haut à gauche et s'arrête net au bord de chaque écaille,
 * sans dégradé le long de la surface. C'est la convention de cel-shading du jeu,
 * et c'est aussi ce qui fait lire la nacre : une matière qui renvoie par
 * plaques, pas par reflets doux.
 */
function FishmanScales() {
  /** Centres des six écailles, de la rangée du fond à celle de devant. */
  const layout: ReadonlyArray<[number, number, number]> = [
    [92, 84, 1],
    [160, 76, 1.08],
    [228, 84, 1],
    [126, 132, 1.06],
    [194, 132, 1.06],
    [160, 186, 1.14],
  ]

  return (
    <svg viewBox="0 0 320 300" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="scales-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f2733" />
          <stop offset="100%" stopColor="#2f6577" />
        </linearGradient>
        <radialGradient id="scales-halo" cx="0.5" cy="0.42" r="0.58">
          <stop offset="0%" stopColor={SCALES.accent} stopOpacity="0.4" />
          <stop offset="100%" stopColor={SCALES.accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="320" height="300" fill="url(#scales-sky)" />
      <circle cx="160" cy="126" r="145" fill="url(#scales-halo)" />

      {/* Trois rais de lumière obliques : ils disent « sous l'eau » sans qu'on
          ait à dessiner une surface ni une ligne d'horizon, qui auraient l'une
          comme l'autre imposé un point de vue au cadre. */}
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${-40 + i * 96} 0 L${30 + i * 96} 0 L${-60 + i * 96} 300 L${-120 + i * 96} 300 Z`}
          fill={SCALES.accent}
          opacity={0.07}
        />
      ))}

      {/* La lanière qui les tient, passée derrière la rangée du fond : sans
          elle, les écailles flottent, et « nouées à la ceinture » ne se lit plus
          nulle part. */}
      <path
        d="M36 74 C110 42 210 42 284 74"
        stroke={SCALES.cord}
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      />

      {layout.map(([x, y, scale]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${scale})`}>
          {/* Corps de l'écaille : arrondie en haut, pointe en bas. */}
          <path
            d="M-30 0 c0 -16 13 -25 30 -25 s30 9 30 25 c0 22 -15 40 -30 52 c-15 -12 -30 -30 -30 -52 z"
            fill={SCALES.body}
            stroke={SCALES.deep}
            strokeWidth="2.5"
          />
          {/* Ombre portée sur le tiers droit, coupée net. */}
          <path d="M6 -24 c14 2 24 10 24 24 c0 22 -15 40 -30 52 l0 -76 z" fill={SCALES.shade} />
          {/* Nervure centrale, du sommet à la pointe. */}
          <path
            d="M0 -18 L0 22"
            stroke={SCALES.deep}
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.55"
          />
          {/* L'éclat, en haut à gauche : deux plaques et rien entre les deux. */}
          <path d="M-20 -10 c2 -8 9 -12 16 -13 l-3 9 c-6 1 -10 4 -13 8 z" fill={SCALES.ridge} />
        </g>
      ))}

      {/* Fond de sable : la même crête que sous la tenue, pour que l'objet soit
          posé quelque part et non suspendu au milieu du cadre. */}
      <path d="M0 268 L92 252 L160 262 L244 248 L320 266 L320 300 L0 300 Z" fill="#12313d" />
    </svg>
  )
}

const ILLUSTRATIONS: Record<ItemId, () => React.JSX.Element> = {
  'zoro-garb': ZoroGarb,
  'madara-garb': MadaraGarb,
  kusanagi: KusanagiKatana,
  'cursed-blade': KitetsuBlade,
  'fishman-scales': FishmanScales,
}

export function ItemIllustration({ id }: { id: ItemId }) {
  const Drawing = ILLUSTRATIONS[id]
  return (
    <div className="item-card__illustration">
      <Drawing />
    </div>
  )
}
