/**
 * La pourriture écarlate : ses cotes.
 *
 * Une jauge sur cent. Elle monte quand le joueur marche dans le marais, quand
 * une flaque s'ouvre sous lui, et à chaque coup encaissé en phase II. Elle ne
 * fait **rien** tant qu'elle n'est pas pleine — et quand elle l'est, elle ne se
 * négocie plus.
 *
 * Tous les nombres ci-dessous répondent à une seule question : *combien de
 * temps peut-on rester dans l'eau ?* La réponse voulue est « assez pour
 * traverser une flaque en courant, jamais assez pour y livrer un combat ». À
 * 8 par seconde pour un maximum de 100, ça fait douze secondes et demie de
 * marche continue — soit une bonne trentaine d'unités à la vitesse du jeu, ce
 * qui couvre largement le plus large écart entre deux racines.
 */
export const ROT = {
  /** Le plein. Cent, parce que le bandeau du HUD se lit en pourcentage. */
  max: 100,

  /**
   * Montée par seconde passée dans l'eau du marais.
   *
   * Douze secondes et demie pour remplir la jauge depuis zéro. C'est court, et
   * c'est voulu : le marais doit être une menace permanente, pas un décor avec
   * un malus. Un joueur qui décide de couper au court doit faire un calcul, pas
   * un haussement d'épaules.
   */
  perSecondInWater: 8,

  /**
   * Montée par touche encaissée en phase II.
   *
   * Huit, donc douze coups pour une contamination — descendu de douze après la
   * première partie. À douze, les trois fantômes et les deux coups de la fauche
   * ailée suffisaient presque à remplir la jauge en une rotation, et la
   * pourriture cessait d'être une accumulation qu'on surveille pour devenir un
   * second compteur de dégâts.
   */
  perHit: 8,

  /**
   * Montée par seconde dans une flaque laissée par son plongeon.
   *
   * Plus fort que le marais, parce qu'une flaque est petite et qu'on en sort en
   * un pas : à intensité égale, elle ne coûterait rien et ne rétrécirait donc
   * pas l'arène, ce qui est sa seule raison d'exister.
   */
  perSecondInPuddle: 22,

  /**
   * Reflux, par seconde, une fois hors de toute source.
   *
   * Plus lent que la montée (6 contre 8) : une jauge qui redescend plus vite
   * qu'elle ne monte n'est pas une jauge, c'est un délai. L'asymétrie fait que
   * les allers-retours dans l'eau s'accumulent, ce qui est exactement le
   * comportement qu'on veut décourager.
   */
  refluxPerSecond: 6,

  /**
   * Délai sans versement avant que le reflux ne commence.
   *
   * Trois secondes. Sans lui, traverser une flaque redeviendrait gratuit dès le
   * pas suivant, et la jauge ne mesurerait plus que l'instant présent.
   */
  refluxDelayMs: 3000,

  /**
   * Durée de la contamination, une fois la jauge pleine.
   *
   * Dix secondes, et **rien ne l'interrompt** sauf un cœur ramassé. Sortir de
   * l'eau n'y change rien : c'est la seule mécanique du jeu où l'erreur est
   * déjà commise au moment où on la voit.
   */
  contaminationMs: 10000,

  /**
   * Intervalle entre deux cœurs prélevés pendant la contamination.
   *
   * Deux secondes et demie. Le premier part **au franchissement du seuil** et
   * les suivants à 2,5, 5 et 7,5 secondes : **quatre cœurs en tout**, mesuré et
   * non déduit — le compte naïf en donne cinq, parce qu'on oublie que le tic de
   * la dixième seconde tombe hors de la fenêtre.
   *
   * Quatre sur les cinq d'une barre de base : il en reste un. C'est délibéré, et
   * c'est la limite à ne pas franchir — une contamination doit pouvoir être
   * survécue par un joueur qui réagit, sinon elle cesse d'être une jauge qu'on
   * surveille pour devenir une mort différée de douze secondes.
   */
  tickMs: 2500,

  /**
   * Seuil d'alerte du bandeau, en points de jauge.
   *
   * Quatre-vingt-dix : il clignote pendant la seconde et quart qui précède, ce
   * qui laisse le temps de sortir de l'eau en courant mais pas celui d'hésiter.
   */
  warnAt: 90,
} as const
