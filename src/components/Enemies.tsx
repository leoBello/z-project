import { useMemo } from 'react'
import { generateEnemySpawns } from '../config/enemies'
import { Enemy } from './Enemy'

/**
 * Peuplement de la carte en ennemis.
 *
 * Les positions sont tirées une fois, avec la même graine à chaque partie : la
 * carte reste reconnaissable d'une session à l'autre. Chaque ennemi gère ensuite
 * sa propre physique et sa propre IA.
 */
export function Enemies() {
  const spawns = useMemo(generateEnemySpawns, [])

  return (
    <>
      {spawns.map((spawn) => (
        <Enemy key={spawn.id} spawn={spawn} />
      ))}
    </>
  )
}
