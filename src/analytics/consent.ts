/**
 * Ce qu'on dit à Google quand le visiteur a répondu.
 *
 * Séparé de `index.ts` pour une raison de dépendances : ce module est appelé
 * par le store de consentement, qui est lui-même lu par un composant ; `track()`
 * est appelé depuis partout, y compris depuis des boucles de jeu. Les garder
 * dans le même fichier ne casserait rien aujourd'hui, mais mélangerait deux
 * choses qui n'ont ni la même fréquence ni les mêmes appelants.
 *
 * **Le mode consentement de Google en deux commandes.** Le script du `<head>`
 * pose un `default` — refusé, sauf si une visite précédente a déjà dit oui —, et
 * ce module envoie l'`update` qui suit la réponse. La bibliothèque garde en
 * réserve ce qui s'est passé entre les deux et le renvoie si l'accord arrive.
 */

/**
 * Le visiteur accepte : GA4 peut poser son cookie et compter pour de vrai.
 *
 * `ad_storage` et les deux paramètres publicitaires restent refusés, et ce
 * n'est pas un oubli : ce site ne fait pas de publicité, personne ne lui
 * achètera d'audience, et demander plus que ce dont on se sert est exactement
 * ce qui rend ces bandeaux détestables.
 *
 * **La page vue est renvoyée à la main.** Celle du chargement est partie en
 * relevé anonyme, que GA4 ne compte pas ; sans cette ligne, un visiteur qui
 * accepte serait vu pour la première fois au deuxième événement du jeu, et les
 * sessions commenceraient toutes au milieu de nulle part.
 */
export function grantAnalytics(): void {
  window.gtag?.('consent', 'update', { analytics_storage: 'granted' })
  window.gtag?.('event', 'page_view')
}

/**
 * Le visiteur refuse : rien ne change, et c'est bien le but.
 *
 * L'appel paraît inutile — le défaut est déjà `denied` — mais il couvre le seul
 * cas où il ne l'est pas : celui qui avait accepté puis rouvre le bandeau pour
 * se rétracter. Sans cet `update`, le cookie déjà posé continuerait de servir
 * jusqu'à la fin de la session.
 */
export function revokeAnalytics(): void {
  window.gtag?.('consent', 'update', { analytics_storage: 'denied' })
}
