/**
 * Tipos del motor del temporizador.
 *
 * El estado es un objeto inmutable: cada acción (empezar, pausar...) devuelve
 * un objeto NUEVO en lugar de modificar el anterior. Es el mismo patrón que un
 * reducer de React (`useReducer`) y hace que el motor sea fácil de testear.
 */

/** Estados posibles del temporizador. */
export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

/**
 * Estado "guardado" del temporizador.
 *
 * Fíjate en que NO guardamos el tiempo restante que va bajando con cada tick.
 * Guardamos cuándo empezó a correr (`startedAt`) y cuánto tiempo acumulado
 * llevaba de tramos anteriores (`accumulatedMs`). Con eso, el tiempo
 * transcurrido se CALCULA en cualquier momento: si la app se va a segundo
 * plano 10 minutos, al volver la cuenta sigue siendo exacta.
 */
export interface TimerState {
  readonly status: TimerStatus;
  /** Duración total elegida, en milisegundos. */
  readonly durationMs: number;
  /** Marca de tiempo (ms) del último arranque/reanudación; null si no corre. */
  readonly startedAt: number | null;
  /** Milisegundos transcurridos en tramos anteriores (antes de la última pausa). */
  readonly accumulatedMs: number;
}

/** Foto del temporizador en un instante concreto (derivada del estado). */
export interface TimerSnapshot {
  readonly status: TimerStatus;
  readonly durationMs: number;
  readonly elapsedMs: number;
  readonly remainingMs: number;
  /** Progreso de 0 (recién empezado) a 1 (terminado). */
  readonly progress: number;
}
