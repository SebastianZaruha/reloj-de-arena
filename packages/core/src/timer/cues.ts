/**
 * "Avisos" del temporizador: momentos en los que la app debe sonar,
 * vibrar o (en el futuro) lanzar una notificación.
 *
 * Es lógica pura: recibe la secuencia de estados que va viendo la UI y dice
 * cuándo ocurre un aviso. Así se testea sin audio ni React.
 *
 * Fase 1: solo 'finished' (la arena se ha acabado de forma NATURAL).
 * Fase 3 (ciclos trabajo/descanso): el aviso 'phase-change' lo detecta
 *   `sessionCue` (session/session.ts), que mira también el cambio de tramo.
 * Fase 4 (segundo plano): la notificación programada usará el mismo aviso
 *   para no sonar dos veces (si la app está en primer plano suena aquí; si
 *   no, suena la notificación).
 */
import type { TimerStatus } from './types';

export type TimerCue = 'finished';

/**
 * Detecta avisos comparando el estado anterior con el actual.
 *
 * - running → finished: aviso 'finished' (una sola vez: después el estado
 *   anterior ya es 'finished' y no vuelve a dispararse).
 * - Reiniciar o pausar a mano NO es terminar: running → idle/paused no avisa.
 */
export class CueDetector {
  private last: TimerStatus;

  constructor(initial: TimerStatus) {
    this.last = initial;
  }

  /** Informa del estado actual; devuelve el aviso que toca (o null). */
  update(status: TimerStatus): TimerCue | null {
    const previous = this.last;
    this.last = status;
    if (previous === 'running' && status === 'finished') return 'finished';
    return null;
  }
}
