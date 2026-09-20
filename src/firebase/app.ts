import type { FirebaseApp } from 'firebase/app'

/**
 * L'application Firebase du projet — **chargée à la demande, et jamais au
 * démarrage**.
 *
 * Deux règles tiennent ce fichier, et les deux viennent de contraintes qui
 * existaient avant lui :
 *
 *  - **le SDK ne doit pas entrer dans le bundle de démarrage.** Le jeu mesure
 *    son taux d'abandon pendant le téléchargement (voir `boot_complete` dans
 *    `analytics/`), et Firestore pèse quelques centaines de kilo-octets pour une
 *    fonctionnalité que la plupart des visiteurs n'atteindront jamais — il faut
 *    finir le jeu, passer le portail, arriver dans l'Outremonde et relever un
 *    défi. Tout ce qui touche à Firebase passe donc par un `import()`
 *    dynamique, résolu au premier affichage du classement et pas avant ;
 *  - **l'absence de configuration n'est pas une panne.** Un `.env` manquant —
 *    en test, sur une machine fraîchement clonée, dans une CI — doit donner un
 *    jeu complet sans classement, pas un écran noir. `isConfigured()` est donc
 *    interrogé avant tout appel, et l'interface se contente de masquer ce
 *    qu'elle ne peut pas servir.
 *
 * Les identifiants Firebase côté client sont **publics par construction** : ils
 * désignent le projet, ils ne l'autorisent pas. C'est aux règles de sécurité
 * Firestore de le faire, et elles sont dans `firestore.rules` à la racine.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/**
 * Vrai si le `.env` porte de quoi joindre un projet.
 *
 * Les deux seules clés qui comptent pour Firestore : le projet dit *où*, la clé
 * d'API dit *au nom de qui*. Le reste de la configuration sert à des services
 * que le jeu n'utilise pas, et exiger leur présence aurait rendu le classement
 * indisponible pour une variable de stockage vide.
 */
export function isConfigured(): boolean {
  return Boolean(config.projectId && config.apiKey)
}

let pending: Promise<FirebaseApp> | null = null

/**
 * L'application, initialisée au premier appel et **une seule fois**.
 *
 * La promesse est mémorisée plutôt que l'application : deux panneaux ouverts
 * coup sur coup demandent le module pendant que le premier `import()` est encore
 * en vol, et sans ça le second repartirait pour un tour. `getApps()` est vérifié
 * malgré tout parce qu'un rechargement à chaud de Vite réexécute ce module sans
 * vider le registre du SDK, et qu'`initializeApp` lève sur un doublon.
 */
export function firebaseApp(): Promise<FirebaseApp> {
  pending ??= import('firebase/app').then(({ getApp, getApps, initializeApp }) =>
    getApps().length > 0 ? getApp() : initializeApp(config),
  )
  return pending
}
