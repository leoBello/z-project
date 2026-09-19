import { enemySpawns } from '../config/enemies'
import { Enemy } from './Enemy'

/**
 * Peuplement de la carte en ennemis.
 *
 * Les positions sont tirées une fois, avec la même graine à chaque partie : la
 * carte reste reconnaissable d'une session à l'autre. Chaque ennemi gère ensuite
 * sa propre physique et sa propre IA.
 *
 * Le tirage est mémoïsé dans `config/enemies.ts` et non plus ici : le store en
 * a besoin lui aussi, pour savoir combien d'ennemis il faut abattre avant que
 * le portail ne s'ouvre. Un `useMemo` local n'aurait pas pu le lui donner.
 */
export function Enemies() {
  return (
    <>
      {enemySpawns().map((spawn) => (
        <Enemy key={spawn.id} spawn={spawn} />
      ))}
    </>
  )
}
