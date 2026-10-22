/**
 * Guardar y recuperar el estado del temporizador.
 *
 * Como el estado son solo marcas de tiempo, basta con guardarlo tal cual
 * para que, al recuperarlo (tras recargar la página por un fallo gráfico,
 * o en el futuro tras cerrar la app), la cuenta siga siendo exacta.
 */
import { MAX_DURATION_MS, MIN_DURATION_MS } from './duration';
import type { TimerState, TimerStatus } from './types';

const STATUSES: readonly TimerStatus[] = ['idle', 'running', 'paused', 'finished'];

/** Convierte el estado en texto (JSON). */
export function serializeTimer(state: TimerState): string {
  return JSON.stringify(state);
}

/**
 * Valida un estado leído de fuera (texto JSON u objeto). Devuelve `null` si
 * no es válido: nunca confiamos en datos guardados sin comprobarlos.
 */
export function parseTimer(input: unknown, now: number): TimerState | null {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const status = r.status as TimerStatus;
  const durationMs = r.durationMs;
  const accumulatedMs = r.accumulatedMs;
  const startedAt = r.startedAt;
  if (!STATUSES.includes(status)) return null;
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return null;
  if (durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) return null;
  if (typeof accumulatedMs !== 'number' || !Number.isFinite(accumulatedMs)) return null;
  if (accumulatedMs < 0 || accumulatedMs > durationMs) return null;
  if (status === 'running') {
    // Debe tener un inicio válido y no estar en el futuro.
    if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt > now) return null;
    return { status, durationMs, accumulatedMs, startedAt };
  }
  return { status, durationMs, accumulatedMs, startedAt: null };
}
