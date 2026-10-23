/**
 * API pública del renderizador del reloj.
 * La pantalla (y en el futuro la app de escritorio) solo importa desde aquí.
 */
export {
  Hourglass,
  type HourglassPose,
  type HourglassProps,
  type HourglassScene,
  type PauseBlur,
} from './Hourglass';
export { STILL_MOTION, type HourglassSnapshot, type MotionSource, type PhysicalInputs } from './types';
export { TURN_MS } from './useSandEngine';
export type { LayoutInsets } from './layout';
