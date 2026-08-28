import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useGameStore } from '../../store/useGameStore'

/**
 * Pastille ronde d'accès à l'inventaire, sous les réglages.
 *
 * Ronde et non ovale comme ses voisines, et c'est délibéré : les trois
 * pastilles du dessus sont des *réglages* de la page (son, qualité, langue),
 * celle-ci ouvre une partie du **jeu**. Une forme différente évite qu'on la
 * lise comme un quatrième réglage et qu'on ne la clique jamais.
 *
 * Un point doré apparaît quand un objet jamais consulté s'y trouve. Sans lui,
 * on peut ramasser la tenue au coffre, refermer la carte, et ne jamais deviner
 * qu'il faut rouvrir un menu pour l'enfiler.
 *
 * **À monter avec `key={runId}`** — voir `App.tsx`. Le compteur `seen` ci-dessous
 * est un état local, qui survivrait donc au redémarrage d'une partie alors que
 * `reset()` vide `items` : un joueur ayant consulté son sac puis perdu voyait
 * `seen` rester à 1 pendant que `items` repartait à zéro, et le point ne
 * reparaissait plus jamais quand il retrouvait la tenue. La `key` remonte le
 * composant à chaque partie, ce qui remet le compteur à zéro sans logique de
 * réinitialisation à écrire — le même mécanisme que le joueur et les ennemis.
 */
export function InventoryButton() {
  const { dict } = useI18n()
  const phase = useGameStore((state) => state.phase)
  const items = useGameStore((state) => state.items)
  const inventoryOpen = useGameStore((state) => state.inventoryOpen)
  const openInventory = useGameStore((state) => state.openInventory)

  /**
   * Nombre d'objets au dernier passage dans l'inventaire.
   *
   * Local et non dans le store : c'est une information d'interface — « le sac
   * a-t-il été rouvert depuis ? » — sans aucun effet sur la partie, et que rien
   * d'autre ne lit.
   */
  const [seen, setSeen] = useState(0)
  const wasOpen = useRef(false)

  useEffect(() => {
    // Marqué à la *fermeture* et non à l'ouverture : la pastille doit rester
    // visible pendant que le panneau est à l'écran, sinon elle s'éteint sous
    // les doigts du joueur à l'instant précis où elle le renseigne.
    if (wasOpen.current && !inventoryOpen) setSeen(items.length)
    wasOpen.current = inventoryOpen
  }, [inventoryOpen, items.length])

  const unseen = items.length > seen

  return (
    <button
      type="button"
      className="inventory-button"
      aria-label={dict.ui.inventory.open}
      aria-expanded={inventoryOpen}
      // Désactivée plutôt que démontée à l'écran de fin : une pastille qui
      // disparaît ferait sauter la mise en page des réglages juste au-dessus.
      disabled={phase !== 'playing'}
      onClick={openInventory}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {/* Besace : le corps, le rabat, et la sangle qui la ferme. */}
        <path
          d="M6 9h12l1.2 9.2a1.6 1.6 0 0 1-1.6 1.8H6.4a1.6 1.6 0 0 1-1.6-1.8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M8.6 9V6.8a3.4 3.4 0 0 1 6.8 0V9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M9.4 13h5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {unseen && <span className="inventory-button__dot" aria-hidden="true" />}
    </button>
  )
}
