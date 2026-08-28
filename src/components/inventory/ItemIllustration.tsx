import type { ItemId } from '../../types/game'

/**
 * Illustrations des objets, **tracées en SVG**.
 *
 * Aucune image bitmap, pour la même raison que `ProjectIllustration` : le jeu
 * tient en un seul bundle, rien ne se télécharge, et la palette reste sous
 * contrôle. Un PNG de tenue aurait aussi imposé une seconde direction
 * artistique — un rendu peint à côté d'un monde en cel-shading facetté.
 *
 * Le tracé décrit la tenue **telle qu'elle est portée dans le jeu** : mêmes
 * teintes que la palette `ninja` de `HeroPlaceholder`, mêmes lamelles, même
 * crinière. La carte doit montrer ce qu'on va voir courir dans l'herbe, pas
 * une variante d'illustrateur.
 */

/** Teintes partagées avec la silhouette 3D. Voir `OUTFITS.ninja`. */
const NINJA = {
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
 * Cadrée **en pied**, sur un format portrait (320 × 300).
 *
 * Le premier jet était au format paysage : la figure s'y tassait dans la moitié
 * haute et la case laissait un bandeau vide sous ses pieds, parce que la
 * colonne d'illustration de la carte prend la hauteur du texte à côté, pas
 * celle du dessin. Un cadre portrait règle les deux à la fois — la silhouette a
 * la place de se déployer, et le rapport de forme tombe juste.
 *
 * Le fond monte du sombre au clair et porte un halo doré derrière les épaules :
 * sans lui, le manteau prune et la crinière noire se découpaient sur le fond de
 * la carte comme un autocollant.
 */
function NinjaGarb() {
  return (
    <svg viewBox="0 0 320 300" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="garb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a2440" />
          <stop offset="100%" stopColor="#5b5178" />
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
        fill={NINJA.hair}
      />

      {/* Bras, sous le manteau : ils portent les bandages. Sans eux, les
          rectangles de lin flottaient dans le vide de part et d'autre du
          torse — un bandage ne se lit que s'il entoure quelque chose. */}
      <path d="M96 148 h26 v58 h-26 Z" fill={NINJA.coatShade} />
      <path d="M198 148 h26 v58 h-26 Z" fill={NINJA.coatShade} />

      {/* Manteau : deux longs pans évasés, ouverts sur le devant. */}
      <path
        d="M122 132 L198 132 L222 268 L188 268 L176 186 L160 268 L144 186 L132 268 L98 268 Z"
        fill={NINJA.coat}
      />
      <path d="M160 132 L198 132 L222 268 L188 268 L176 186 L160 268 Z" fill={NINJA.coatShade} />

      {/* Visage, juste assez pour qu'on lise une personne sous l'armure. */}
      <path d="M137 46 h46 v46 a23 23 0 0 1 -46 0 Z" fill={NINJA.skin} />
      <path d="M143 72 h13 v6 h-13 Z M164 72 h13 v6 h-13 Z" fill={NINJA.hair} />
      {/* Frange : elle donne le regard bas et le côté fermé. */}
      <path d="M133 42 h54 v24 l-15 -11 l-12 13 l-12 -13 l-15 11 Z" fill={NINJA.hair} />

      {/* Col montant : la pièce qui, plus que tout le reste, dit « clan ». */}
      <path d="M124 132 L160 122 L196 132 L189 146 L160 136 L131 146 Z" fill={NINJA.plateShade} />

      {/* Plastron : lamelles laquées, empilées et lacées d'or. */}
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect
            x={126}
            y={144 + row * 18}
            width={68}
            height={15}
            rx={3}
            fill={row % 2 === 0 ? NINJA.plate : NINJA.plateShade}
          />
          <rect x={145} y={144 + row * 18} width={4} height={15} fill={NINJA.lace} />
          <rect x={173} y={144 + row * 18} width={4} height={15} fill={NINJA.lace} />
        </g>
      ))}

      {/* Épaulières : les mêmes lamelles, débordant sur les bras. */}
      {[0, 1, 2].map((row) => (
        <g key={`pauldron-${row}`}>
          <path
            d={`M${92 - row * 6} ${136 + row * 19} h38 v16 h-${38 - row * 4} Z`}
            fill={row % 2 === 0 ? NINJA.plate : NINJA.plateShade}
          />
          <path
            d={`M190 ${136 + row * 19} h${38 - row * 4} l${row * 6} 16 h-38 Z`}
            fill={row % 2 === 0 ? NINJA.plate : NINJA.plateShade}
          />
        </g>
      ))}

      {/* Bandages d'avant-bras, puis de mollets. */}
      <rect x="92" y="200" width="34" height="34" rx="8" fill={NINJA.wrap} />
      <rect x="194" y="200" width="34" height="34" rx="8" fill={NINJA.wrap} />
      <rect x="136" y="236" width="22" height="30" rx="5" fill={NINJA.wrap} />
      <rect x="162" y="236" width="22" height="30" rx="5" fill={NINJA.wrap} />

      {/* Sandales sombres : elles ferment la silhouette par le bas, là où les
          bandages s'arrêtaient dans le vide. */}
      <path d="M130 264 h30 v9 h-34 Z M160 264 h30 v9 h-34 Z" fill="#2f2a3d" />
    </svg>
  )
}

const ILLUSTRATIONS: Record<ItemId, () => React.JSX.Element> = {
  'ninja-garb': NinjaGarb,
}

export function ItemIllustration({ id }: { id: ItemId }) {
  const Drawing = ILLUSTRATIONS[id]
  return (
    <div className="item-card__illustration">
      <Drawing />
    </div>
  )
}
