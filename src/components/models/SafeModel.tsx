import { Component, Suspense, type ReactNode } from 'react'

interface Props {
  /** Rendu si le .glb est absent ou illisible. */
  fallback: ReactNode
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Frontière d'erreur pour les modèles glTF.
 *
 * `useGLTF` suspend pendant le chargement puis *throw* si le fichier est
 * absent (404, ou HTML renvoyé par le fallback SPA de Vite). On encapsule donc
 * chaque modèle : tant que le .glb n'est pas dans /public/models, on affiche
 * la primitive de remplacement — le jeu reste jouable pendant l'intégration
 * des assets.
 */
export class SafeModel extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) {
      console.info('[SafeModel] modèle non chargé, placeholder utilisé.', error)
    }
  }

  render() {
    if (this.state.failed) return this.props.fallback
    return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>
  }
}
