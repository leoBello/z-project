import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  type Group,
} from 'three'
import { now as gameNow } from '../../state/gameClock'

/**
 * Le ciel de l'Outremonde — et c'est lui qui porte l'effet d'arrivée.
 *
 * Trois ciels existaient : le firmament étoilé du continent et de l'île, et le
 * ciel malade du Marais. Celui-ci est le premier qui doive produire un
 * **sentiment** plutôt qu'une heure de la journée, parce que c'est la première
 * chose que le joueur voit en sortant de l'anneau, avant même d'avoir bougé.
 *
 * Il tient en trois couches, de la plus lointaine à la plus proche :
 *
 *  1. **un dégradé violet**, qui n'appartient à aucune des deux familles de
 *     couleurs du jeu — ni les ors du bâti, ni les verts du monde. C'est le
 *     violet des portails, c'est-à-dire la seule teinte qui, dans ce jeu, ait
 *     toujours voulu dire « ailleurs ». Ici elle occupe le ciel entier ;
 *  2. **une aurore**, deux bandes qui ondulent lentement au-dessus de
 *     l'horizon nord. Elles sont dans le shader et non en géométrie : une
 *     aurore en mesh demande de la transparence triée, et il y a déjà l'eau et
 *     le voile du portail dans cette scène ;
 *  3. **une planète annelée**, basse sur l'horizon nord, exactement dans l'axe
 *     du regard à l'arrivée. C'est le seul objet du ciel qui ait une silhouette,
 *     donc le seul qui donne une échelle — et une échelle est ce qui transforme
 *     un joli fond en un endroit.
 *
 * Mécanique reprise telle quelle de `RotSky` : une sphère en `BackSide`
 * recentrée sur la caméra à chaque frame, `depthWrite` désactivé, `fog` désactivé
 * — le dôme *est* le fond vers lequel la brume estompe, l'enfumer une seconde
 * fois grise tout le ciel.
 */

/**
 * Rayon du dôme.
 *
 * Plus grand que celui du Marais (600) parce que la brume de cette carte sature
 * à 300 au lieu de 180 : le monde visible est presque deux fois plus profond, et
 * un dôme trop serré se traverserait. Toujours sous le `far` de la caméra
 * (2000), sans quoi le ciel serait clippé.
 */
const RADIUS = 900

const SKY = {
  /** Violet profond du zénith. Presque noir, mais jamais gris. */
  zenith: '#241546',
  /** Lilas de l'horizon : la couleur de brume d'`atmosphere.ts`, en plus dense. */
  horizon: '#9b8ede',
  /** L'or bas du soleil, au sud — c'est-à-dire derrière le joueur qui arrive. */
  glow: '#ffcf96',
  /** Les deux teintes de l'aurore. Cyan froid, magenta chaud. */
  auroraA: '#7fe8ff',
  auroraB: '#ff9ad5',
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
  uniform vec3 uAuroraA;
  uniform vec3 uAuroraB;
  uniform float uTime;
  varying vec3 vPos;

  void main() {
    vec3 dir = normalize(vPos);
    float h = dir.y;

    // Le dégradé principal. Le seuil haut est franc (0,62) : le violet sombre
    // occupe la majorité du dôme, et la bande claire reste une bande.
    vec3 color = mix(uHorizon, uZenith, smoothstep(-0.05, 0.62, h));

    /*
      La lueur du soleil, au sud et basse.

      Le soleil de cette carte est à l'offset (26 ; 48 ; 62), c'est-à-dire au
      sud-est et bas sur l'horizon. La lueur suit cette direction plutôt que
      d'être un halo centré : un dégradé symétrique se lit comme un studio
      photo, un dégradé décalé se lit comme une heure de la journée.
    */
    float sun = max(0.0, dot(dir, normalize(vec3(0.34, 0.30, 0.89))));
    color = mix(color, uGlow, pow(sun, 3.0) * 0.72 * smoothstep(-0.25, 0.10, h));

    /*
      L'aurore : deux bandes au nord, ondulées par deux sinusoïdes non
      harmoniques pour que le motif ne se répète pas visiblement.

      Elle n'existe que dans l'hemisphere nord du dome (dir.z < 0) et
      seulement au-dessus de l'horizon : c'est ce qui la garde **dans le cadre**
      à l'arrivée — le joueur regarde le nord — sans jamais passer derrière lui,
      où elle ne servirait qu'à éclairer un ciel que personne ne regarde.
    */
    float north = smoothstep(0.0, -0.45, dir.z);
    float sweep = dir.x * 2.1 + uTime * 0.045;
    float bandA = 1.0 - smoothstep(0.0, 0.085, abs(h - (0.30 + sin(sweep) * 0.06)));
    float bandB = 1.0 - smoothstep(0.0, 0.055, abs(h - (0.44 + sin(sweep * 1.7 + 2.0) * 0.05)));
    float veil = north * smoothstep(0.04, 0.22, h);
    color += uAuroraA * bandA * veil * 0.34;
    color += uAuroraB * bandB * veil * 0.20;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * La planète annelée du nord.
 *
 * Elle est **dans le groupe du ciel**, donc recentrée sur la caméra à chaque
 * frame comme le dôme : elle ne se rapproche jamais, quelle que soit la distance
 * parcourue. C'est la seule façon honnête de faire un objet céleste sans
 * parallaxe — la traiter comme un décor posé à cinq cents unités l'aurait fait
 * grossir en marchant vers le nord, ce qui est exactement ce qu'un corps céleste
 * ne fait pas.
 *
 * Matériaux **basiques** et non toon : elle est plus loin que toutes les sources
 * de lumière de la scène, donc rien ne peut l'éclairer. Un matériau qui répond à
 * la lumière serait noir d'un côté sans raison visible.
 *
 * Sa teinte est au-dessus du seuil de bloom du post-traitement : le halo autour
 * du disque n'est pas peint, c'est le bloom qui le fait.
 */
function Planet() {
  const geometry = useMemo(
    () => ({
      globe: new SphereGeometry(58, 28, 20),
      // Un tore très aplati plutôt qu'un anneau plat : de trois quarts, un
      // anneau sans épaisseur disparaît dès qu'on le regarde par la tranche.
      ring: new TorusGeometry(96, 13, 3, 60),
    }),
    [],
  )

  return (
    <group position={[-120, 120, -580]} rotation={[0, 0.5, 0.42]}>
      <mesh geometry={geometry.globe}>
        <meshBasicMaterial color="#d9c6ff" fog={false} />
      </mesh>
      <mesh geometry={geometry.ring} rotation={[Math.PI / 2 - 0.34, 0, 0]}>
        <meshBasicMaterial color="#b49cf0" fog={false} transparent opacity={0.85} />
      </mesh>
    </group>
  )
}

export function BeyondSky() {
  const root = useRef<Group>(null)
  const dome = useRef<Mesh>(null)
  const camera = useThree((state) => state.camera)

  const geometry = useMemo(() => new SphereGeometry(RADIUS, 40, 28), [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uZenith: { value: new Color(SKY.zenith) },
          uHorizon: { value: new Color(SKY.horizon) },
          uGlow: { value: new Color(SKY.glow) },
          uAuroraA: { value: new Color(SKY.auroraA) },
          uAuroraB: { value: new Color(SKY.auroraB) },
          uTime: { value: 0 },
        },
        vertexShader,
        fragmentShader,
      }),
    [],
  )

  useFrame(() => {
    root.current?.position.copy(camera.position)
    // Horloge de **jeu** : l'aurore doit se figer avec le reste du monde quand
    // l'inventaire s'ouvre. Une aurore qui continue d'onduler derrière un
    // panneau de pause est le genre de détail qui trahit deux temps distincts.
    material.uniforms.uTime.value = gameNow() / 1000
  })

  return (
    <group ref={root}>
      <mesh ref={dome} geometry={geometry} material={material} frustumCulled={false} />
      <Planet />
    </group>
  )
}
