import type { ItemId } from '../types/game'

/**
 * Objets ramassables et leurs effets.
 *
 * Ce fichier ne décrit que ce qu'un objet **fait** et de quoi il a l'air. Son
 * nom, son type affiché et sa description vivent dans `src/i18n/*.json` sous
 * `ui.items`, comme les noms de monuments : le jeu est bilingue, et une chaîne
 * écrite ici ne pourrait pas l'être. Quatre systèmes lisent cette table sans se
 * connaître — l'inventaire, la carte d'objet, le store pour appliquer bonus de
 * cœurs et dégâts, et le rig du personnage pour choisir sa silhouette, son arme et ses aptitudes.
 */

/**
 * Familles d'objets.
 *
 * Elles pilotent le libellé de type sur la carte **et servent d'emplacement
 * d'équipement** : on porte au plus un objet par famille. C'est ce qui permet
 * de porter le katana *et* la tenue du clan — les faire partager un
 * emplacement unique aurait obligé à choisir entre l'apparence et l'arme, et
 * transformé une trouvaille en renoncement.
 */
export type ItemKind = 'outfit' | 'trinket' | 'weapon'

/** Emplacement d'équipement. Une famille d'objet, un emplacement. */
export type ItemSlot = ItemKind

/**
 * Silhouette du joueur associée à un skin. Voir `HeroPlaceholder`.
 *
 * Le premier est celui du départ de partie : c'est lui que `outfitOf` renvoie
 * quand l'emplacement est vide, et il n'existe donc aucun objet qui le donne.
 */
export type OutfitId = 'luffy' | 'zoro'

/**
 * Ce que le personnage tient en main droite. Voir `HeroPlaceholder`.
 *
 * `fists` n'est pas l'absence d'arme, c'en est une : le premier skin se bat à
 * mains nues, et c'est `StrikeArc` qui en tire les conséquences — une onde
 * d'impact au bout du poing plutôt qu'une traînée de lame.
 */
export type WeaponId = 'fists' | 'sword' | 'katana' | 'cursed'

/**
 * Aptitude de déplacement propre à un skin.
 *
 * Elle vit ici, et pas dans la table des objets, parce que **le skin de départ
 * n'a pas d'objet** : aucun coffre ne le donne, il est ce qu'on est quand on n'a
 * rien trouvé. Une aptitude portée par l'objet aurait donc laissé le début de
 * partie sans aucune, et le second skin aurait été un gain sec au lieu d'un
 * échange.
 *
 * Ce sont des multiplicateurs de `PLAYER.speed` et `PLAYER.jumpSpeed`, jamais
 * des valeurs absolues : le réglage de base reste dans `gameplay.ts`, seul
 * endroit où on l'ajuste.
 *
 * L'échange est volontairement net. La hauteur d'un saut varie comme le **carré**
 * de la vitesse initiale : ×1,2 sur `jumpSpeed`, ce sont 44 % de hauteur en
 * plus, pas 20. C'est ce qu'il faut pour que le franchissement change vraiment,
 * là où les 18 % de vitesse au sol du second skin se sentent surtout sur la
 * longueur d'une traversée.
 */
export interface SkinTraits {
  speed: number
  jump: number
  /**
   * Multiplie `PLAYER.waterSpeedFactor`, et lui seul.
   *
   * Un multiplicateur du ralentissement et non une vitesse aquatique absolue :
   * le réglage de base reste dans `gameplay.ts`, comme pour les deux autres.
   * `Player` borne le produit à 1 — on ne nage jamais plus vite qu'on ne court,
   * quel que soit le nombre d'objets aquatiques portés.
   */
  water: number
}

/**
 * Aptitudes neutres.
 *
 * Portées par tout objet qui ne touche pas au déplacement. Un objet neutre le
 * déclare au lieu de l'omettre : même règle que `attackMultiplier`, et pour la
 * même raison — un multiplicateur absent vaudrait `undefined`, et un
 * `undefined` dans une multiplication sort un `NaN` de vitesse.
 */
export const NEUTRAL_TRAITS: SkinTraits = { speed: 1, jump: 1, water: 1 }

const SKIN_TRAITS: Record<OutfitId, SkinTraits> = {
  luffy: { speed: 1, jump: 1.2, water: 1 },
  zoro: { speed: 1.18, jump: 1, water: 1 },
}

export interface Item {
  id: ItemId
  kind: ItemKind
  /**
   * Cœurs **jaunes** accordés par le port de l'objet.
   *
   * Zéro pour tout ce qui n'est pas une tenue. Le store n'a donc pas à savoir
   * quels objets sont des armures : il additionne ce champ pour l'objet équipé.
   */
  bonusHearts: number
  /**
   * Multiplicateur appliqué aux dégâts du coup d'épée.
   *
   * Un pour tout ce qui n'est pas une arme, exactement pour la même raison que
   * `bonusHearts` vaut zéro ailleurs : le store multiplie sans avoir à
   * reconnaître les armes. Neutre par défaut plutôt qu'optionnel — un
   * multiplicateur absent vaudrait `undefined`, et c'est le genre de valeur qui
   * finit par sortir un `NaN` de dégâts.
   */
  attackMultiplier: number
  /**
   * Multiplicateur appliqué aux dégâts **reçus** par le joueur.
   *
   * Miroir exact d'`attackMultiplier`, et neutre par défaut pour la même
   * raison. C'est le champ qui permet à un objet de se payer : une arme peut
   * frapper trois fois plus fort en laissant le porteur encaisser double,
   * plutôt que d'être un gain sec.
   */
  damageMultiplier: number
  /**
   * Ce que l'objet fait au déplacement, en multiplicateurs.
   *
   * `NEUTRAL_TRAITS` pour tout ce qui n'y touche pas. Ces facteurs se
   * composent avec ceux du skin (voir `traitsOf`) : le skin dit ce qu'est le
   * corps, l'objet ce qu'on lui ajoute.
   */
  traits: SkinTraits
  /**
   * Silhouette prise par le joueur quand l'objet est porté.
   *
   * `undefined` pour un objet qui ne change pas l'apparence — on ne veut pas
   * qu'une babiole ait à déclarer le skin de départ pour ne rien faire.
   */
  outfit?: OutfitId
  /** Arme prise par le joueur quand l'objet est porté. Même règle que `outfit`. */
  weapon?: WeaponId
  /** Teinte d'accent : carte, icône d'inventaire, éclat du coffre. */
  accent: string
}

/**
 * Tenue du Chasseur de Pirates — le second skin.
 *
 * Le seul objet du jeu qui change le personnage lui-même, et pas seulement ses
 * vêtements : manteau, haramaki, deux fourreaux, coupe verte et œil clos. C'est
 * assumé — une simple tenue de rechange ne se serait pas vue à cette échelle de
 * silhouette, et l'objet doit valoir la montée jusqu'au Temple.
 *
 * Il donne des cœurs **et** de la vitesse, mais ce n'est pas un gain sec : le
 * skin de départ saute nettement plus haut, et cette détente-là se perd en
 * l'équipant. Voir `SkinTraits`.
 *
 * L'accent est un vert franc, et c'est le point le plus discutable de la table.
 * Le vert est partout dans le monde, contrairement au prune et au cramoisi qu'il
 * remplace ; mais l'accent ne sert qu'à l'interface — carte, icône d'inventaire,
 * éclat du coffre — où il n'a que le jade de Kusanagi pour voisin. Les deux se
 * séparent par la température : celui-ci tire vers le jaune, le jade vers le
 * bleu.
 */
export const ZORO_GARB: Item = {
  id: 'zoro-garb',
  kind: 'outfit',
  bonusHearts: 2,
  attackMultiplier: 1,
  damageMultiplier: 1,
  // La vitesse de cette tenue n'est pas ici mais dans `SKIN_TRAITS` : elle
  // vient du skin qu'elle donne, pas du vêtement. Voir `SkinTraits`.
  traits: NEUTRAL_TRAITS,
  outfit: 'zoro',
  accent: '#6fa83c',
}

/**
 * Katana de Kusanagi — la lame du temple de Nakano.
 *
 * Le seul objet du jeu qui touche au combat, et son effet est volontairement
 * brutal : les dégâts doublés font tomber l'octorok en un coup au lieu de deux
 * et le moblin en deux au lieu de trois. Un bonus plus fin — un tiers de dégât
 * de plus, un peu d'allonge — n'aurait rien changé au ressenti, puisque les
 * points de vie des ennemis sont des entiers de deux et trois.
 *
 * L'accent est un vert de jade, seule teinte froide et saturée de l'inventaire.
 * Il ne pouvait pas être doré : l'or est déjà la couleur de « il y a quelque
 * chose à prendre » (braise des coffres, ferrures, flèche de la pagode), et une
 * arme légendaire de la même teinte se serait lue comme un trésor de plus.
 */
export const KUSANAGI: Item = {
  id: 'kusanagi',
  kind: 'weapon',
  bonusHearts: 0,
  attackMultiplier: 2,
  damageMultiplier: 1,
  traits: NEUTRAL_TRAITS,
  weapon: 'katana',
  accent: '#4fc9a3',
}

/**
 * Lame maudite — l'arme qui se paie.
 *
 * Trois fois les dégâts, et c'est le premier palier qui change quelque chose
 * que Kusanagi ne change pas déjà : l'octorok a deux points de vie, le moblin
 * trois, donc ×3 les couche **tous les deux d'un seul coup** là où ×2 laisse le
 * moblin debout. À ×2,5 les deux armes auraient été le même objet, l'un maudit.
 *
 * Le prix est le seul qui se lise à la seconde où il se paie : les dégâts reçus
 * doublent, et cinq cœurs ne laissent plus que deux fautes. Trois autres formes
 * de malédiction ont été écartées — retirer un cœur rouge se bat avec le modèle
 * de la barre (`maxHearts` est un acquis définitif de la partie), et couper les
 * cœurs lâchés fait payer trois minutes plus tard, sans que le joueur puisse
 * relier la cause à l'effet.
 *
 * Une synergie en sort seule, et elle est voulue : les cœurs jaunes de la tenue
 * se posent en **fin** de barre, donc ils encaissent le premier coup doublé.
 * Porter les deux, c'est acheter une faute de plus. Rien n'a été écrit pour ça —
 * c'est le modèle de barre unique qui le produit.
 *
 * L'accent est un rouge de sang séché, seule teinte chaude et sourde de
 * l'inventaire. Il voisine avec le rouge des cœurs du HUD, mais les deux ne se
 * rencontrent jamais : l'accent ne vit que sur la carte, la pastille et l'éclat
 * du coffre, et il est trop sombre et trop peu saturé pour qu'on l'y confonde
 * avec une case de vie.
 */
export const CURSED_BLADE: Item = {
  id: 'cursed-blade',
  kind: 'weapon',
  bonusHearts: 0,
  attackMultiplier: 3,
  damageMultiplier: 2,
  traits: NEUTRAL_TRAITS,
  weapon: 'cursed',
  accent: '#b03a3a',
}

/**
 * Écailles de l'Homme-Poisson — la première babiole du jeu.
 *
 * La famille `trinket` existait depuis le début sans un seul objet pour
 * l'occuper. Elle est ici, et c'est ce qui fait enfin exister le système à trois
 * emplacements : les écailles et la lame se portent **ensemble**, le joueur
 * compose un équipement au lieu d'en changer.
 *
 * Elles annulent le ralentissement en mer — `water: 2` contre un
 * `waterSpeedFactor` de 0,55, borné à 1 côté joueur. Deux et non `1 / 0.55` :
 * la valeur n'a pas à connaître le réglage qu'elle corrige, et la borne protège
 * le jour où un second objet aquatique existera.
 *
 * Le prix est de 15 % de vitesse au sol. C'est le seul objet du jeu qui ne
 * touche pas au combat : il change la **carte**, pas les échanges de coups —
 * l'île et les longs bords de mer cessent d'être une corvée.
 *
 * L'accent est une nacre pâle. Il voisine avec le jade de Kusanagi, seule autre
 * teinte froide de l'inventaire ; les deux se séparent par la saturation, la
 * nacre étant presque blanche là où le jade est franc.
 */
export const FISHMAN_SCALES: Item = {
  id: 'fishman-scales',
  kind: 'trinket',
  bonusHearts: 0,
  attackMultiplier: 1,
  damageMultiplier: 1,
  traits: { speed: 0.85, jump: 1, water: 2 },
  accent: '#7fd4e8',
}

export const ITEMS: readonly Item[] = [ZORO_GARB, KUSANAGI, CURSED_BLADE, FISHMAN_SCALES]

/** Retrouve un objet par son identifiant. */
export function itemById(id: ItemId): Item | undefined {
  return ITEMS.find((item) => item.id === id)
}

/**
 * L'objet a-t-il un effet à annoncer ?
 *
 * Ici et non dans la carte d'objet, et c'est le but : la carte n'affiche sa
 * ligne d'effet que si ce test passe, et il a déjà failli coûter cher. Tant que
 * le test vivait dans le composant, il listait les deux seuls effets qui
 * existaient alors — cœurs et dégâts d'épée — et le premier objet qui n'aurait
 * touché ni l'un ni l'autre se serait affiché **sans aucun effet visible**,
 * alors que son texte était écrit et traduit.
 *
 * Un champ d'effet ajouté à `Item` doit donc être ajouté ici, et nulle part
 * ailleurs.
 */
export function hasEffect(item: Item): boolean {
  return (
    item.bonusHearts > 0 ||
    item.attackMultiplier !== 1 ||
    item.damageMultiplier !== 1 ||
    item.traits.speed !== 1 ||
    item.traits.jump !== 1 ||
    item.traits.water !== 1
  )
}

/**
 * Objets équipés, indexés par emplacement.
 *
 * Le type vit ici et non dans le store parce que c'est la table des objets qui
 * décide de ce qu'est un emplacement — le store ne fait que tenir le registre.
 */
export type Equipment = Partial<Record<ItemSlot, ItemId>>

/**
 * Silhouette à afficher pour l'équipement courant.
 *
 * Centralisée ici plutôt que dans le composant du joueur : c'est la table des
 * objets qui décide de ce qu'une tenue fait, pas le rig qui devine.
 */
export function outfitOf(equipment: Equipment): OutfitId {
  const id = equipment.outfit
  if (!id) return 'luffy'
  return itemById(id)?.outfit ?? 'luffy'
}

/**
 * Ce que le personnage tient, pour l'équipement courant.
 *
 * Contrairement à `outfitOf`, le défaut n'est pas constant : **il dépend du
 * skin**. Un bretteur qui porte deux sabres à la hanche et cogne du poing aurait
 * été une incohérence gratuite, et un homme-caoutchouc qui dégaine une épée
 * aussi. L'arme trouvée, elle, reste équipable par les deux — c'est tout
 * l'intérêt d'avoir un emplacement par famille.
 */
export function weaponOf(equipment: Equipment, outfit: OutfitId): WeaponId {
  const id = equipment.weapon
  const equipped = id ? itemById(id)?.weapon : undefined
  return equipped ?? (outfit === 'zoro' ? 'sword' : 'fists')
}

/**
 * Aptitudes de déplacement de l'équipement courant.
 *
 * Part du skin — c'est lui qui dit ce qu'est le corps — puis multiplie par ce
 * que chaque objet porté déclare. Multiplication et non addition : les
 * aptitudes du skin sont déjà des multiplicateurs de `PLAYER.speed` et
 * `PLAYER.jumpSpeed`, et des facteurs se composent sans que l'ordre compte.
 *
 * Ici et non dans le store, comme `outfitOf` et `weaponOf` : c'est la table des
 * objets qui décide de ce qu'un objet fait, pas le contrôleur du joueur ni le
 * rig qui le devinent.
 *
 * Elle construit un objet neuf à chaque appel. Un sélecteur zustand qui
 * l'appellerait directement re-rendrait son abonné à **chaque** notification du
 * store, la référence changeant toujours. Les deux appelants s'abonnent donc à
 * `equipped`, dont la référence est stable entre deux changements d'équipement,
 * et mémoïsent — voir `Player.tsx`.
 */
export function traitsOf(equipment: Equipment, outfit: OutfitId): SkinTraits {
  const base = SKIN_TRAITS[outfit]
  const traits = { speed: base.speed, jump: base.jump, water: base.water }

  for (const id of Object.values(equipment)) {
    const item = itemById(id)
    if (!item) continue
    traits.speed *= item.traits.speed
    traits.jump *= item.traits.jump
    traits.water *= item.traits.water
  }

  return traits
}
