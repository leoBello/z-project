import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { seo } from './plugins/seo.ts'

/**
 * Découpage du bundle.
 *
 * Le jeu partait en **un seul fichier de 3,6 Mo** : moteur 3D, physique,
 * post-traitement et code du jeu fondus ensemble. Le total téléchargé ne change
 * pas — une scène 3D a besoin de tout dès la première frame, il n'y a rien à
 * charger paresseusement ici — mais le découpage apporte deux choses réelles :
 *
 *  - **le cache du navigateur survit aux mises à jour.** Le code du jeu bouge à
 *    chaque commit, `three` et Rapier une ou deux fois par an. Fondus ensemble,
 *    la moindre retouche de gameplay forçait un nouveau téléchargement des
 *    trois mégaoctets de moteur ;
 *  - le téléchargement et le parsing se parallélisent entre les chunks.
 *
 * Deux choses apprises en le faisant, et qui coûteraient à retrouver :
 *
 *  - `manualChunks` est bien **appelé** par Rolldown, mais son verdict n'est
 *    qu'une indication : `three` y était correctement assigné au groupe
 *    « three » et se retrouvait quand même fondu dans le chunk de physique, qui
 *    pesait alors 3,1 Mo à lui seul. `advancedChunks` fait des groupes fermes ;
 *  - **l'ordre des groupes compte, et pas dans le sens attendu.** Un groupe
 *    `three` écrit `/(three|@react-three)/` et placé après `physics` faisait
 *    repartir tout le moteur dans le chunk de physique. La règle qui marche est
 *    de cibler `node_modules/three/` seul, et de le placer en premier.
 */
export default defineConfig({
  plugins: [react(), seo()],
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[/\\]three[/\\]/ },
            // Rapier embarque son WebAssembly en base64 : à lui seul, il pèse
            // plus que tout le reste réuni, et c'est ce qui bouge le moins.
            { name: 'physics', test: /node_modules[/\\](@dimforge|@react-three[/\\]rapier)/ },
            { name: 'postfx', test: /node_modules[/\\](@react-three[/\\])?postprocessing[/\\]/ },
            { name: 'react', test: /node_modules[/\\](react|react-dom|scheduler)[/\\]/ },
          ],
        },
      },
    },
  },
})
