import { defineConfig } from 'vitest/config'

/**
 * Configuration des tests unitaires.
 *
 * Séparée de `vite.config.ts` et non fondue dedans : la config de build charge
 * le plugin React, le plugin SEO et celui de la mesure d'audience, dont aucun
 * n'a de rôle ici — et les deux derniers écrivent dans `index.html` au build.
 * Une config de test qui les embarque fait tourner du code de déploiement à
 * chaque `npm test`.
 *
 * **`happy-dom` et non `node`.** Plusieurs modules du jeu touchent à `window` au
 * moment de l'import : les crochets de développement (`__store`, `__parry`,
 * `__projectiles`…) et la lecture de la préférence de son dans `localStorage`.
 * Le second est déjà protégé par un `try`, mais pas les premiers — et les
 * neutraliser en passant `--mode production` ferait tester un code différent de
 * celui qui tourne. Un DOM léger coûte quelques dizaines de millisecondes et
 * teste le module tel qu'il est écrit.
 */
export default defineConfig({
  test: {
    environment: 'happy-dom',
    // `plugins/` en plus de `src/` : les scripts de mesure d'audience qu'ils
    // écrivent échouent sans un mot quand ils sont mal formés — un tableau de
    // bord vide, aucune erreur en console. Ce sont leurs *tests* qui entrent
    // ici, pas les plugins eux-mêmes : la remarque ci-dessus tient toujours,
    // aucune config de test ne les charge.
    include: ['src/**/*.test.ts', 'plugins/**/*.test.ts'],
    restoreMocks: true,
  },
})
