/**
 * Hook que hace vibrar el móvil cuando el temporizador cambia de estado
 * (empezar, pausar, reanudar, terminar).
 *
 * Mira el estado en vez de engancharse a cada botón o gesto: así vibra igual
 * si se empieza con un toque, con TalkBack o (en el futuro) desde otro sitio.
 * Qué transición vibra lo decide `hapticForTransition` del core (testeado).
 */
import { hapticForTransition, type TimerStatus } from '@reloj/core';
import { useEffect, useRef } from 'react';

import { playTimerHaptic, setHapticsEnabled } from './haptics';

export function useTimerHaptics(status: TimerStatus, enabled: boolean): void {
  // Aplica el ajuste `haptics` (también afecta a los clics al deslizar).
  useEffect(() => {
    setHapticsEnabled(enabled);
  }, [enabled]);

  // Estado anterior: empieza con el actual para no vibrar al abrir la app.
  const previous = useRef(status);
  useEffect(() => {
    const event = hapticForTransition(previous.current, status);
    previous.current = status;
    if (event) playTimerHaptic(event);
  }, [status]);
}
