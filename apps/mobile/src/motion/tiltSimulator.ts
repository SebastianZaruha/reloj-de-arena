/**
 * Simulador de inclinación para el NAVEGADOR (solo para probar).
 *
 * En un ordenador no hay acelerómetro. Para probar la fase 2 sin móvil,
 * en desarrollo (`npm run web`) o añadiendo `?inclinar` a la URL:
 *
 *   ← / →        girar el móvil 5° (con Mayús: 30°) a izquierda / derecha
 *   ↑ / ↓        inclinarlo hacia atrás / hacia delante 5° (mueve la luz)
 *   V            voltear (180°) de golpe
 *   0            volver a "de pie"
 *   Alt + ratón  mover el ratón con Alt pulsado gira el móvil con el ratón
 *
 * El simulador "fabrica" muestras de acelerómetro a 30 Hz con ese ángulo y
 * se las pasa a LiveMotion por el mismo camino que el sensor real (filtro,
 * pausas, volteo...). Antes de la primera tecla no hace nada: la web se
 * comporta exactamente igual que antes.
 */
import type { LiveMotion } from './liveMotion';

const STEP_DEG = 5;
const BIG_STEP_DEG = 30;
const INTERVAL_MS = 33;
const RAD = Math.PI / 180;

/** ¿Está activado el simulador? (desarrollo o `?inclinar` en la URL) */
function enabled(): boolean {
  if (typeof window === 'undefined') return false;
  return __DEV__ || /[?&]inclinar\b/.test(window.location?.search ?? '');
}

/** Arranca el simulador. Devuelve la función para pararlo. */
export function startTiltSimulator(motion: LiveMotion): () => void {
  if (!enabled()) return () => undefined;
  let roll = 0;
  let pitch = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const emit = () => {
    // Vector "hacia el suelo" en ejes de pantalla para ese giro/inclinación.
    const c = Math.cos(pitch * RAD);
    motion.push(
      Math.sin(roll * RAD) * c,
      Math.cos(roll * RAD) * c,
      -Math.sin(pitch * RAD),
      performance.now(),
    );
  };
  const ensureRunning = () => {
    if (timer === null) timer = setInterval(emit, INTERVAL_MS);
  };

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? BIG_STEP_DEG : STEP_DEG;
    switch (e.key) {
      case 'ArrowLeft':
        roll -= step;
        break;
      case 'ArrowRight':
        roll += step;
        break;
      case 'ArrowUp':
        pitch = Math.min(80, pitch + step);
        break;
      case 'ArrowDown':
        pitch = Math.max(-80, pitch - step);
        break;
      case 'v':
      case 'V':
        roll += 180;
        break;
      case '0':
        roll = Math.round(roll / 360) * 360;
        pitch = 0;
        break;
      default:
        return;
    }
    e.preventDefault();
    ensureRunning();
  };

  const onMouse = (e: MouseEvent) => {
    if (!e.altKey) return;
    // Centro de la ventana = de pie; los bordes = ±100°.
    roll = ((e.clientX / window.innerWidth) * 2 - 1) * 100;
    pitch = ((e.clientY / window.innerHeight) * 2 - 1) * -40;
    ensureRunning();
  };

  window.addEventListener('keydown', onKey);
  window.addEventListener('mousemove', onMouse);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('mousemove', onMouse);
    if (timer !== null) clearInterval(timer);
  };
}
