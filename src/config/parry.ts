/**
 * Les cinq durées de la parade.
 *
 * Elles se tiennent les unes les autres, et c'est pour ça qu'elles vivent
 * ensemble : la fenêtre doit être assez courte pour que réussir compte, assez
 * longue pour être humaine, et la récupération doit être assez longue pour que
 * marteler la touche ne puisse jamais tomber juste par accident.
 */
export const PARRY = {
  /**
   * Durée de la garde ouverte par un appui.
   *
   * Le signal paraît `cueLeadMs` avant l'impact, donc il faut appuyer entre 180
   * et 500 ms après l'avoir vu. Le temps de réaction simple médian est d'environ
   * 250 ms : la fenêtre est *centrée* dessus, elle ne le frôle pas. C'est
   * difficile, jamais injuste.
   */
  windowMs: 320,
  /**
   * Immobilisation de la parade après la fin d'une garde qui n'a rien arrêté.
   *
   * La pièce maîtresse de tout l'équilibrage. Un appui qui part trop tôt ne rate
   * pas la parade : il la *consomme*. 450 ms de récupération après 320 ms de
   * garde, c'est 770 ms sans défense — plus que le télégraphe du balayage, qui
   * est le coup sur lequel la parade s'apprend. Un appui anticipé ne peut donc pas couvrir le coup qu'il anticipait.
   *
   * Et un appui *pendant* la récupération la relance (voir `pressParry`) : qui
   * martèle reste verrouillé tant qu'il martèle. C'est la seule règle qui rende
   * la mécanique incontournable plutôt que décorative.
   */
  recoveryMs: 450,
  /**
   * Avance du signal sur l'impact.
   *
   * 500 ms pour une fenêtre de 320 : la bande réactive utile est
   * `[impact − 320, impact]`, atteinte en réagissant entre 180 et 500 ms.
   *
   * Premier réglage : 420 pour 260, soit une exigence de 160 à 420 ms. Sur le
   * papier c'était centré sur le temps de réaction médian ; à l'essai, personne
   * n'y arrivait — parce qu'il ne s'agit pas de réagir à un signal *attendu*,
   * mais de le repérer dans une mêlée en mouvement, ce qui coûte de deux à trois
   * cents millisecondes de plus. Desserré d'autant.
   */
  cueLeadMs: 500,
  /** Ouverture offerte par une parade réussie. Deux coups d'épée y rentrent. */
  punishMs: 1300,
  /**
   * Gel du monde sur une parade réussie.
   *
   * Le jeu gèle déjà 80 ms sur la mort d'un ennemi (`HIT_STOP_MS`). Une parade
   * doit taper plus fort que la mort d'un Octorok, sans quoi le geste le plus
   * difficile du jeu est celui qui se sent le moins.
   */
  hitStopMs: 110,
} as const
