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
   * Le signal paraît `cueLeadMs` avant l'impact, donc il faut appuyer entre 160
   * et 420 ms après l'avoir vu. Le temps de réaction simple médian est d'environ
   * 250 ms : la fenêtre est *centrée* dessus, elle ne le frôle pas. C'est
   * difficile, jamais injuste.
   */
  windowMs: 260,
  /**
   * Immobilisation de la parade après la fin d'une garde qui n'a rien arrêté.
   *
   * La pièce maîtresse de tout l'équilibrage. Un appui qui part trop tôt ne rate
   * pas la parade : il la *consomme*. 450 ms de récupération après 260 ms de
   * garde, c'est 710 ms sans défense — plus que le plus long télégraphe du
   * Lynel. Un appui anticipé ne peut donc pas couvrir le coup qu'il anticipait.
   *
   * Et un appui *pendant* la récupération la relance (voir `pressParry`) : qui
   * martèle reste verrouillé tant qu'il martèle. C'est la seule règle qui rende
   * la mécanique incontournable plutôt que décorative.
   */
  recoveryMs: 450,
  /**
   * Avance du signal sur l'impact.
   *
   * 420 ms pour une fenêtre de 260 : la bande réactive utile est
   * `[impact − 260, impact]`, atteinte en réagissant entre 160 et 420 ms.
   */
  cueLeadMs: 420,
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
