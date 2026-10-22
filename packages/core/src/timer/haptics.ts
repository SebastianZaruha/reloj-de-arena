/**
 * Vibración (respuesta háptica): QUÉ vibra y CUÁNDO. Lógica pura.
 *
 * Aquí no se llama a ninguna API del móvil: solo se decide el tipo de
 * vibración que toca. La app (apps/mobile/src/haptics) traduce cada evento
 * a una llamada de expo-haptics. Así las reglas se testean sin dispositivo.
 *
 * Dos piezas:
 *  - `hapticForTransition`: vibración al cambiar de estado (empezar, pausar,
 *    reanudar, terminar), comparando el estado anterior con el actual.
 *  - `StepTicker`: el "clic" de rueda dentada al deslizar para elegir el
 *    tiempo: uno por cada escalón que cambia, nunca más de uno cada
 *    `minIntervalMs`.
 */
import type { TimerStatus } from './types';

/** Momentos del temporizador que producen una vibración. */
export type TimerHaptic = 'start' | 'pause' | 'resume' | 'finished' | 'flip';

/**
 * Vibración que corresponde a pasar de `previous` a `next` (o null).
 *
 * - idle/finished → running: 'start'
 * - running → paused:        'pause'
 * - paused → running:        'resume'
 * - running → finished:      'finished' (la arena se ha acabado sola)
 * - Reiniciar (→ idle) no vibra: ya lo hace el propio gesto de mantener pulsado.
 * - 'flip' (voltear el móvil) no sale de aquí: si el reloj ya corría, el
 *   estado sigue siendo 'running' y no hay transición. La pantalla lo pide
 *   aparte con `flipHaptic`.
 */
export function hapticForTransition(previous: TimerStatus, next: TimerStatus): TimerHaptic | null {
  if (previous === next) return null;
  if (next === 'running') return previous === 'paused' ? 'resume' : 'start';
  if (previous === 'running' && next === 'paused') return 'pause';
  if (previous === 'running' && next === 'finished') return 'finished';
  return null;
}

/**
 * Vibración al voltear el reloj. Si NO estaba en marcha, el paso a 'running'
 * ya produce 'start'/'resume' (mismo impacto medio): devolvemos null para no
 * vibrar dos veces.
 */
export function flipHaptic(previous: TimerStatus): TimerHaptic | null {
  return previous === 'running' ? 'flip' : null;
}

/** Intervalo mínimo por defecto entre dos "clics" al deslizar (ms). */
export const DEFAULT_TICK_INTERVAL_MS = 30;

/**
 * Decide si toca un "clic" háptico al cambiar un valor (p. ej. la duración
 * elegida al deslizar), como los dientes de una rueda.
 *
 * Reglas:
 *  1. Solo hay clic si el valor CAMBIA respecto al último visto (si el dedo
 *     se mueve sin cambiar de escalón, no vibra).
 *  2. Nunca dos clics a menos de `minIntervalMs`. Si el dedo va muy rápido y
 *     salta varios escalones en ese tiempo, los clics de en medio se
 *     descartan (no se acumulan para después: vibraría con retraso).
 *
 * No crea objetos en cada llamada (solo guarda dos números), así que se
 * puede llamar en cada evento del gesto sin generar basura en memoria.
 */
export class StepTicker {
  private lastValue: number | null = null;
  private lastTickAt = -Infinity;

  constructor(private readonly minIntervalMs: number = DEFAULT_TICK_INTERVAL_MS) {}

  /** Fija el valor de partida (al empezar el gesto) sin hacer clic. */
  reset(value: number): void {
    this.lastValue = value;
  }

  /** Informa del valor actual; devuelve true si hay que hacer clic ahora. */
  update(value: number, now: number): boolean {
    if (value === this.lastValue) return false;
    this.lastValue = value;
    if (now - this.lastTickAt < this.minIntervalMs) return false;
    this.lastTickAt = now;
    return true;
  }
}
