import { useMemo } from 'react'
import { Outlines } from '@react-three/drei'
import { Color, MeshToonMaterial } from 'three'
import { toonGradient } from '../models/toonGradient'
import type { EnemyKind } from '../../types/game'

/**
 * Jeu de matériaux propre à **un** ennemi.
 *
 * Chaque instance a les siens plutôt que de partager des matériaux globaux :
 * c'est ce qui permet de faire flasher en blanc uniquement l'ennemi touché.
 * Le surcoût est nul côté GPU — le programme shader reste partagé, seules les
 * uniformes de couleur diffèrent.
 */
export interface EnemyMaterials {
  body: MeshToonMaterial
  dark: MeshToonMaterial
  accent: MeshToonMaterial
  /** Couleurs d'origine, pour restaurer après le flash blanc. */
  base: { body: Color; dark: Color; accent: Color }
}

const PALETTES: Record<EnemyKind, { body: string; dark: string; accent: string }> = {
  octorok: { body: '#d9534a', dark: '#8f3630', accent: '#f6e7c9' },
  moblin: { body: '#9a6b3f', dark: '#5d3f27', accent: '#e4d8bd' },
  /*
    Le Lynel passe par le même hook que les deux autres, et ce n'est pas une
    contrainte de typage qu'on subit : c'est le flash blanc qu'on récupère
    gratuitement. `Enemy.tsx` fait clignoter un ennemi touché en écrasant
    `materials.body.color` et `materials.dark.color` ; en tenant son pelage, ses
    marques et sa crinière dans ces trois matériaux-là, le Lynel encaisse
    visuellement comme tout le monde sans une ligne de plus.

    Le reste de sa matière — or, métal, corne, acier, sabot, cuir — vit dans
    `lynelMaterials.ts`, et ne flashe pas. C'est correct : ce qui doit blanchir
    sous le coup, c'est la chair.
  */
  lynel: { body: '#dfe4ee', dark: '#5a6378', accent: '#f4f6fb' },
}

/**
 * Jeu de matériaux d'un ennemi, éventuellement repeint.
 *
 * L'`override` sert un seul cas et pourrait être une quatrième entrée de
 * `PALETTES` : ce serait faux. La table dit les **espèces**, et le Lynel doré
 * n'en est pas une — il partage le registre, les statistiques de base, le
 * modèle et la couleur de minimap du Lynel. Lui donner une ligne à lui, c'est
 * accepter qu'un réglage du Lynel cesse un jour de s'appliquer aux deux.
 */
export function useEnemyMaterials(
  kind: EnemyKind,
  override?: { body: string; dark: string; accent: string },
): EnemyMaterials {
  return useMemo(() => {
    const palette = override ?? PALETTES[kind]
    const make = (color: string) =>
      new MeshToonMaterial({ color: new Color(color), gradientMap: toonGradient })

    return {
      body: make(palette.body),
      dark: make(palette.dark),
      accent: make(palette.accent),
      base: {
        body: new Color(palette.body),
        dark: new Color(palette.dark),
        accent: new Color(palette.accent),
      },
    }
    // `override` est une constante de module chez son unique appelant, donc sa
    // référence est stable : la dépendance ne provoque aucune reconstruction.
  }, [kind, override])
}

const OUTLINE = 0.03
const OUTLINE_COLOR = '#20160f'

interface ModelProps {
  materials: EnemyMaterials
}

/**
 * Octorok : bestiole trapue et bulbeuse, museau en tube, yeux sur le dessus.
 * Inspiration Zelda, géométrie originale — aucun asset sous licence.
 * L'avant du modèle est +Z, comme le joueur.
 */
export function OctorokModel({ materials }: ModelProps) {
  return (
    <group>
      {/* corps */}
      <mesh castShadow position={[0, 0.42, 0]} scale={[1, 0.82, 1.08]} material={materials.body}>
        <sphereGeometry args={[0.44, 16, 14]} />
        <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
      </mesh>

      {/* museau : c'est de là que part le projectile */}
      <mesh
        castShadow
        position={[0, 0.44, 0.44]}
        rotation={[Math.PI / 2, 0, 0]}
        material={materials.dark}
      >
        <cylinderGeometry args={[0.09, 0.13, 0.3, 8]} />
      </mesh>

      {/* yeux sur le dessus */}
      {[-0.16, 0.16].map((x) => (
        <group key={x} position={[x, 0.72, 0.16]}>
          <mesh castShadow material={materials.accent}>
            <sphereGeometry args={[0.13, 12, 12]} />
          </mesh>
          <mesh position={[0, 0.02, 0.1]}>
            <sphereGeometry args={[0.055, 10, 10]} />
            <meshBasicMaterial color="#241a14" />
          </mesh>
        </group>
      ))}

      {/* pattes */}
      {[
        [-0.26, 0.2],
        [0.26, 0.2],
        [-0.24, -0.24],
        [0.24, -0.24],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} castShadow position={[x, 0.1, z]} material={materials.dark}>
          <sphereGeometry args={[0.11, 8, 8]} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Moblin : brute massive, groin, défenses et gourdin.
 * L'avant du modèle est +Z.
 */
export function MoblinModel({ materials }: ModelProps) {
  return (
    <group>
      {/* jambes */}
      {[-0.16, 0.16].map((x) => (
        <mesh key={x} castShadow position={[x, 0.24, 0]} material={materials.dark}>
          <capsuleGeometry args={[0.11, 0.2, 4, 8]} />
        </mesh>
      ))}

      {/* torse */}
      <mesh castShadow position={[0, 0.72, 0]} scale={[1.1, 1, 0.9]} material={materials.body}>
        <capsuleGeometry args={[0.3, 0.36, 4, 12]} />
        <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
      </mesh>

      {/* ceinture */}
      <mesh castShadow position={[0, 0.5, 0]} material={materials.dark}>
        <cylinderGeometry args={[0.33, 0.34, 0.09, 12]} />
      </mesh>

      {/* tête */}
      <group position={[0, 1.15, 0]}>
        <mesh castShadow scale={[1, 0.92, 1]} material={materials.body}>
          <sphereGeometry args={[0.27, 14, 12]} />
          <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
        </mesh>

        {/* groin */}
        <mesh castShadow position={[0, -0.04, 0.26]} rotation={[Math.PI / 2, 0, 0]} material={materials.dark}>
          <cylinderGeometry args={[0.11, 0.12, 0.14, 8]} />
        </mesh>

        {/* défenses */}
        {[-0.09, 0.09].map((x) => (
          <mesh key={x} castShadow position={[x, 0.02, 0.26]} rotation={[-0.5, 0, 0]} material={materials.accent}>
            <coneGeometry args={[0.035, 0.16, 6]} />
          </mesh>
        ))}

        {/* oreilles */}
        {[-0.26, 0.26].map((x) => (
          <mesh key={x} castShadow position={[x, 0.06, 0]} rotation={[0, 0, x > 0 ? -0.9 : 0.9]} material={materials.body}>
            <coneGeometry args={[0.08, 0.2, 6]} />
          </mesh>
        ))}

        {/* yeux */}
        {[-0.11, 0.11].map((x) => (
          <mesh key={x} position={[x, 0.07, 0.23]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshBasicMaterial color="#1d1510" />
          </mesh>
        ))}
      </group>

      {/* bras */}
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} castShadow position={[x, 0.78, 0]} rotation={[0, 0, x > 0 ? -0.25 : 0.25]} material={materials.body}>
          <capsuleGeometry args={[0.1, 0.28, 4, 8]} />
        </mesh>
      ))}

      {/* gourdin, dans la main droite (côté -X, l'avant étant +Z) */}
      <group position={[-0.42, 0.62, 0.1]} rotation={[-0.45, 0, -0.2]}>
        <mesh castShadow position={[0, 0.22, 0]} material={materials.dark}>
          <cylinderGeometry args={[0.055, 0.07, 0.5, 6]} />
        </mesh>
        <mesh castShadow position={[0, 0.52, 0]} material={materials.dark}>
          <dodecahedronGeometry args={[0.15, 0]} />
          <Outlines thickness={OUTLINE} color={OUTLINE_COLOR} />
        </mesh>
      </group>
    </group>
  )
}
