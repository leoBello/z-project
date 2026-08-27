import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { unlock } from './audio/sfx'

/**
 * Déverrouillage de l'audio au premier geste du visiteur.
 *
 * Un `AudioContext` créé hors d'un gestionnaire d'événement utilisateur démarre
 * `suspended` : tous les sons seraient programmés et aucun ne sortirait. Les
 * écouteurs restent posés (`unlock` est idempotent et relance un contexte
 * repassé `suspended`, ce qui arrive après un changement d'onglet ou une
 * coupure système), mais ils sont passifs et ne coûtent rien.
 */
for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) {
  window.addEventListener(type, unlock, { passive: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
