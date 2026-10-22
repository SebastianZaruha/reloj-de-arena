/**
 * Controlador de flujo: conecta el TEMPORIZADOR con la SIMULACIÓN.
 *
 * El temporizador dice cuánto tiempo queda; de ahí sale cuántos granos
 * deberían seguir arriba. El controlador hace que la simulación alcance ese
 * número: pasa unos pocos granos por fotograma (animación suave) o, si la
 * diferencia es enorme (volvemos de segundo plano), recoloca la arena de
 * golpe.
 */
import { GRAVITY_DOWN, normalize, type Vec2 } from '../physics/vector';
import type { SandSimulation } from './sandSimulation';

/**
 * Granos que deberían quedar en el bulbo emisor.
 * @param initialGrains granos que había arriba al empezar
 * @param remainingMs tiempo restante
 * @param durationMs duración total
 */
export function targetSourceGrains(initialGrains: number, remainingMs: number, durationMs: number): number {
  // Entradas no válidas (NaN, Infinity, duración 0): nada que mostrar arriba.
  // Un NaN aquí acabaría en la geometría de Skia, así que lo cortamos ya.
  if (!(durationMs > 0) || !Number.isFinite(durationMs) || !(initialGrains > 0)) return 0;
  if (Number.isNaN(remainingMs)) return 0;
  const f = Math.min(1, Math.max(0, remainingMs / durationMs));
  // Redondeamos hacia arriba: el último grano cae justo al llegar a 0.
  return Math.max(0, Math.ceil(initialGrains * f - 1e-9));
}

/** Componente vertical mínima de la gravedad para que pase arena por el cuello. */
export const MIN_FLOW_GRAVITY_Y = 0.25;

export interface SyncOptions {
  /** Máximo de granos que pasan por fotograma en modo animado. */
  readonly maxPerFrame?: number;
  /** Diferencia a partir de la cual se recoloca todo de golpe. */
  readonly teleportThreshold?: number;
  /** Pendiente del cráter al recolocar. */
  readonly crater?: number;
}

export type SyncResult = 'idle' | 'flowing' | 'teleported';

/**
 * Acerca la simulación al número de granos objetivo en el bulbo emisor.
 */
export function syncSandToTarget(
  sim: SandSimulation,
  target: number,
  gravity: Vec2 = GRAVITY_DOWN,
  options: SyncOptions = {},
): SyncResult {
  const g = normalize(gravity);
  // El bulbo emisor es SIEMPRE el de arriba de la pantalla: al voltear el
  // móvil la pantalla gira 180° y la rejilla también (`rotateHalfTurn`), así
  // que "arriba" vuelve a ser arriba. Inclinar no cambia de bulbo emisor.
  const source = sim.topCount;
  // Si la simulación está vacía (recién creada, p. ej. tras un cambio de
  // tamaño con el tiempo corriendo) usamos su cantidad nominal de arena:
  // si no, "recolocaríamos" cero granos y el reloj se vería vacío.
  const current = sim.topCount + sim.bottomCount;
  const total = current > 0 ? current : sim.totalGrains;
  const deficit = source - target;
  const threshold = options.teleportThreshold ?? Math.max(40, Math.round(total * 0.04));

  if (deficit === 0) return 'idle';
  // Si el objetivo pide MÁS arena arriba (p. ej. reinicio) o la diferencia es
  // muy grande, recolocamos directamente.
  if (deficit < 0 || deficit > threshold) {
    const t = Math.max(0, Math.min(total, target));
    sim.arrange(t, total - t, g, { crater: options.crater ?? 0.35 });
    return 'teleported';
  }
  // Con el reloj muy tumbado (más de ~75°) o boca abajo la arena no cae por
  // el cuello. (Al llegar a 90° el temporizador se pausa: ver OrientationTracker.)
  if (g.y < MIN_FLOW_GRAVITY_Y) return 'idle';
  const moved = sim.transfer(Math.min(deficit, options.maxPerFrame ?? 6), g);
  return moved > 0 ? 'flowing' : 'idle';
}
