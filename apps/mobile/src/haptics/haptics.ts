/**
 * Vibración (respuesta háptica) de la app: ÚNICO sitio que habla con
 * expo-haptics. El resto de la app llama a estas funciones y no sabe nada
 * de la API nativa.
 *
 * Qué vibración usa cada momento (cámbialo aquí si quieres probar otras):
 *
 * | Momento               | Android / iOS                                          |
 * | --------------------- | ------------------------------------------------------ |
 * | Empezar / reanudar    | impacto MEDIO   (`ImpactFeedbackStyle.Medium`)          |
 * | Voltear el móvil      | impacto MEDIO   (`ImpactFeedbackStyle.Medium`)          |
 * | Pausar (toque o al    | impacto FUERTE  (`ImpactFeedbackStyle.Heavy`): distinto |
 * |   tumbar el móvil)    |                                                        |
 * | Clic al deslizar      | Android: `AndroidHaptics.Clock_Tick` (el "clic" de los  |
 * |                       | selectores de hora del sistema); iOS: `selectionAsync`  |
 * | Fin del tiempo        | aviso de éxito  (`NotificationFeedbackType.Success`)    |
 *
 * Reglas:
 *  - En la web no hace nada (los navegadores de escritorio no vibran y en
 *    móvil `navigator.vibrate` es poco fiable): sale al instante.
 *  - Nunca lanza errores: si el móvil no tiene vibrador o la llamada falla,
 *    se ignora en silencio. La vibración es un extra, no puede romper nada.
 *  - Respeta el ajuste `haptics` (de `Settings`): `setHapticsEnabled`.
 *  - Llamar SIEMPRE desde el hilo de JavaScript. Los gestos de TimerScreen
 *    ya usan `runOnJS: true`; desde un worklet habría que usar `scheduleOnRN`.
 */
import type { TimerHaptic } from '@reloj/core';
import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  impactAsync,
  NotificationFeedbackType,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from 'expo-haptics';
import { Platform } from 'react-native';

/** true en Android e iOS; false en la web (y en cualquier otra plataforma). */
const SUPPORTED = Platform.OS === 'android' || Platform.OS === 'ios';

/** Interruptor general (lo controla el ajuste `haptics`). */
let enabled = true;

/** Activa o desactiva toda la vibración de la app. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

/** Ignora el error de una vibración (función fija: no se crea en cada llamada). */
function ignore(): void {}

/**
 * Ejecuta una vibración sin que un fallo pueda propagarse:
 *  - try/catch para errores síncronos (p. ej. módulo nativo ausente),
 *  - `.catch` para errores asíncronos (la promesa rechazada).
 */
function safely(run: () => Promise<void>): void {
  if (!SUPPORTED || !enabled) return;
  try {
    run().catch(ignore);
  } catch {
    // Sin vibración: no pasa nada.
  }
}

// Cada vibración es una función fija definida una sola vez (no se crean
// funciones nuevas en cada clic del gesto).
const impactMedium = () => impactAsync(ImpactFeedbackStyle.Medium);
const impactHeavy = () => impactAsync(ImpactFeedbackStyle.Heavy);
const success = () => notificationAsync(NotificationFeedbackType.Success);
const tick =
  Platform.OS === 'android'
    ? // performHapticFeedback del sistema: clic corto y nítido, ideal para
      // muchos clics seguidos (el `selectionAsync` de Android dura 50 ms y
      // a ritmo rápido se notaría como un zumbido continuo).
      () => performAndroidHapticsAsync(AndroidHaptics.Clock_Tick)
    : selectionAsync;

/** Vibración de un cambio de estado del temporizador (ver tabla de arriba). */
export function playTimerHaptic(event: TimerHaptic): void {
  switch (event) {
    case 'start':
    case 'resume':
    case 'flip':
      safely(impactMedium);
      break;
    case 'pause':
      safely(impactHeavy);
      break;
    case 'finished':
      safely(success);
      break;
  }
}

/** "Clic" de rueda dentada al cambiar de escalón deslizando. */
export function playSelectionTick(): void {
  safely(tick);
}
