import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three'

/**
 * Le ciel du Marais d'Aeonia.
 *
 * Un composant à part et non `StarrySky` reparamétré, pour une raison qui n'est
 * pas de commodité : `StarrySky` dessine des étoiles, une lune et une Voie
 * lactée, et aucune des trois n'a sa place ici. Ce n'est pas la nuit du jeu,
 * c'est un **ciel malade** — un ciel où l'on ne voit rien parce que l'air est
 * chargé, pas parce que le soleil est couché. Lui passer des teintes rouges
 * aurait donné une nuit rouge étoilée, c'est-à-dire un joli ciel, ce qu'on ne
 * veut surtout pas.
 *
 * Il en garde en revanche toute la mécanique : une sphère en `BackSide`
 * recentrée sur la caméra à chaque frame, un dégradé calculé dans le fragment
 * shader, `depthWrite` désactivé pour qu'elle ne s'écrive jamais dans le tampon
 * de profondeur.
 *
 * **La lueur est au ras du sol, et pas au-dessus de l'horizon.** C'est
 * l'inversion qui fait tout : sur les autres cartes, la bande claire est ce qui
 * reste du soleil et elle est *au-dessus* de la ligne d'horizon. Ici elle est
 * *en dessous*, parce que ce qui éclaire ce monde monte de la pourriture. Le
 * ciel est donc plus sombre en haut qu'en bas, ce qui est exactement ce qu'un
 * œil ne s'attend pas à voir et suffit à mettre mal à l'aise sans qu'on sache
 * dire pourquoi.
 */

/** Plus petit que le dôme étoilé (900) : la brume sature à 180, on ne le voit jamais entier. */
const RADIUS = 600

const SKY = {
  /** Presque noir, à peine violet. Aucune étoile ne le perce. */
  zenith: '#140a18',
  /** Sang séché — exactement la couleur de brume d'`atmosphere.ts`, en plus saturé. */
  horizon: '#5c1a22',
  /** Braise. C'est la pourriture qui éclaire, et elle est au sol. */
  glow: '#a83a30',
}

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  varying vec3 vPos;

  void main() {
    float h = normalize(vPos).y;
    // Le dégradé principal, de l'horizon au zénith. Le seuil haut est bas
    // (0,48) : le noir prend vite, et il ne reste qu'une bande rouge au bord du
    // monde plutôt qu'un beau dégradé plein cadre.
    vec3 color = mix(uHorizon, uZenith, smoothstep(-0.02, 0.48, h));
    // La lueur, **sous** la ligne d'horizon : les bornes du smoothstep sont
    // dans l'ordre décroissant, donc il vaut 1 vers le bas.
    color = mix(color, uGlow, smoothstep(0.10, -0.16, h));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

export function RotSky() {
  const mesh = useRef<Mesh>(null)
  const camera = useThree((state) => state.camera)

  const geometry = useMemo(() => new SphereGeometry(RADIUS, 32, 24), [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        // Le dôme ne prend pas la brume : il *est* le fond vers lequel la brume
        // estompe, et l'enfumer une seconde fois grisait tout le ciel.
        fog: false,
        uniforms: {
          uZenith: { value: new Color(SKY.zenith) },
          uHorizon: { value: new Color(SKY.horizon) },
          uGlow: { value: new Color(SKY.glow) },
        },
        vertexShader,
        fragmentShader,
      }),
    [],
  )

  // Recentré sur la caméra : un dôme fixe se traverserait au bout de six cents
  // unités, et le joueur peut en parcourir cent cinquante sur cette carte.
  useFrame(() => {
    mesh.current?.position.copy(camera.position)
  })

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />
}
