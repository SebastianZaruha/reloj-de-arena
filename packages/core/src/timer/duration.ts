/**
 * Utilidades de duración: rango permitido, "escalones" de ajuste al deslizar,
 * formato del texto y nivel de arena asociado a cada duración.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/**
 * Escalones (en minutos) entre los que se mueve el gesto de deslizar.
 * Son más finos al principio (donde importa cada minuto) y más gruesos al
 * final: 1–10 de 1 en 1, 15–60 de 5 en 5 y 75–180 de 15 en 15.
 */
export const DURATION_STEPS_MIN: readonly number[] = [
  ...range(1, 10, 1),
  ...range(15, 60, 5),
  ...range(75, 180, 15),
];

export const MIN_DURATION_MS = (DURATION_STEPS_MIN[0] as number) * MINUTE_MS;
export const MAX_DURATION_MS = (DURATION_STEPS_MIN[DURATION_STEPS_MIN.length - 1] as number) * MINUTE_MS;
export const DEFAULT_DURATION_MS = 5 * MINUTE_MS;

/** Índice del escalón más cercano a una duración cualquiera. */
export function nearestStepIndex(durationMs: number): number {
  let best = 0;
  let bestDiff = Infinity;
  DURATION_STEPS_MIN.forEach((min, i) => {
    const diff = Math.abs(min * MINUTE_MS - durationMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

/** Ajusta (snap) una duración al escalón más cercano. */
export function snapDuration(durationMs: number): number {
  return stepToDuration(nearestStepIndex(durationMs));
}

/** Duración en ms del escalón `index` (se limita al rango válido). */
export function stepToDuration(index: number): number {
  const i = clampInt(index, 0, DURATION_STEPS_MIN.length - 1);
  return (DURATION_STEPS_MIN[i] as number) * MINUTE_MS;
}

/**
 * Duración resultante de arrastrar el dedo verticalmente.
 *
 * @param startDurationMs duración al empezar el gesto
 * @param dragUpPx distancia arrastrada HACIA ARRIBA en píxeles (negativa si es hacia abajo)
 * @param pxPerStep píxeles necesarios para avanzar un escalón
 */
export function durationFromDrag(startDurationMs: number, dragUpPx: number, pxPerStep = 16): number {
  const startIndex = nearestStepIndex(startDurationMs);
  const delta = Math.trunc(dragUpPx / pxPerStep);
  return stepToDuration(startIndex + delta);
}

/**
 * Fracción de la arena total que debe estar en el bulbo superior al elegir
 * una duración. Usa una escala logarítmica: así 1 minuto ya se ve como un
 * montoncito y 3 horas llenan el bulbo, con transiciones agradables.
 */
export function sandLevelForDuration(durationMs: number, minLevel = 0.1): number {
  const d = Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, durationMs));
  const t = Math.log(d / MIN_DURATION_MS) / Math.log(MAX_DURATION_MS / MIN_DURATION_MS);
  return minLevel + (1 - minLevel) * t;
}

/**
 * Formatea milisegundos como "mm:ss" o "h:mm:ss".
 * Redondea hacia arriba los segundos: un temporizador que muestra "00:00"
 * debe haber terminado de verdad.
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Texto natural para lectores de pantalla, p. ej. "1 hora y 5 minutos"
 * (o, en inglés, "1 hour and 5 minutes").
 */
export function describeDuration(ms: number, language: 'es' | 'en' = 'es'): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  const w = language === 'en' ? WORDS_EN : WORDS_ES;
  if (h > 0) parts.push(`${h} ${h === 1 ? w.hour : w.hours}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? w.minute : w.minutes}`);
  if (s > 0 || parts.length === 0) parts.push(`${s} ${s === 1 ? w.second : w.seconds}`);
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(', ')} ${w.and} ${parts[parts.length - 1]}`;
}

const WORDS_ES = {
  hour: 'hora',
  hours: 'horas',
  minute: 'minuto',
  minutes: 'minutos',
  second: 'segundo',
  seconds: 'segundos',
  and: 'y',
};
const WORDS_EN: typeof WORDS_ES = {
  hour: 'hour',
  hours: 'hours',
  minute: 'minute',
  minutes: 'minutes',
  second: 'second',
  seconds: 'seconds',
  and: 'and',
};

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}
