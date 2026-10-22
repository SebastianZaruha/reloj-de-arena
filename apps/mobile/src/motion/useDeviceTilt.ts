/**
 * Hook que conecta el ACELERÓMETRO (expo-sensors) con el reloj.
 *
 * - Android / iOS: escucha el acelerómetro a ~30 Hz mientras la app está en
 *   primer plano (en segundo plano se da de baja: batería) y pasa cada
 *   muestra a `LiveMotion`, que filtra y decide pausas y volteos.
 * - Web: no hay sensor. En desarrollo (o con `?inclinar` en la URL) se puede
 *   SIMULAR con el teclado (ver tiltSimulator.ts y el README).
 *
 * Devuelve la fuente de movimiento (estable: siempre el mismo objeto) y el
 * estado de orientación que necesita React para pintar (volteado, tumbado y
 * hacia qué lado). Este estado solo cambia con los eventos, no en cada
 * muestra: la pantalla NO se re-renderiza 30 veces por segundo.
 */
import type { OrientationEvent } from '@reloj/core';
import { Accelerometer } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useLatest } from '../hooks/useLatest';
import { LiveMotion } from './liveMotion';
import { startTiltSimulator } from './tiltSimulator';

/** Intervalo del sensor (ms): ~30 Hz basta y gasta poca batería. */
const SENSOR_INTERVAL_MS = 33;

/**
 * Signo para pasar del acelerómetro a "hacia el suelo".
 * Android mide la fuerza que sujeta el móvil (de pie: y = +1, hacia ARRIBA),
 * así que el suelo está en -a. En iOS expo-sensors da la gravedad con el signo
 * contrario (de pie: y = -1). (iOS no está probado en este proyecto.)
 */
const SIGN = Platform.OS === 'ios' ? -1 : 1;

export interface DeviceTilt {
  readonly motion: LiveMotion;
  readonly flipped: boolean;
  readonly sideways: boolean;
  readonly sideSign: 1 | -1;
}

interface Options {
  readonly calm: boolean;
  readonly onEvent: (event: OrientationEvent) => void;
}

export function useDeviceTilt({ calm, onEvent }: Options): DeviceTilt {
  const [motion] = useState(() => new LiveMotion());
  const [pose, setPose] = useState({ flipped: false, sideways: false, sideSign: 1 as 1 | -1 });
  const handler = useLatest(onEvent);

  useEffect(() => motion.setCalm(calm), [motion, calm]);

  // Eventos de orientación → pantalla (y estado de React, que cambia poco).
  useEffect(() => {
    motion.setEventHandler((event) => {
      handler.current(event);
      setPose({ flipped: motion.flipped, sideways: motion.sideways, sideSign: motion.sideSign });
    });
    return () => motion.setEventHandler(null);
  }, [motion, handler]);

  // Fuente de datos: acelerómetro (nativo) o simulador de teclado (web).
  useEffect(() => {
    if (Platform.OS === 'web') return startTiltSimulator(motion);

    let subscription: { remove(): void } | null = null;
    const subscribe = () => {
      if (subscription) return;
      try {
        Accelerometer.setUpdateInterval(SENSOR_INTERVAL_MS);
        subscription = Accelerometer.addListener((a) => {
          // Convención del core: x derecha, y ABAJO, z hacia quien mira.
          motion.push(-a.x * SIGN, a.y * SIGN, -a.z * SIGN, performance.now());
        });
      } catch (error) {
        // Sin sensor (emulador, móvil raro): el reloj funciona igual, de pie.
        console.warn('[reloj] Acelerómetro no disponible:', error);
      }
    };
    const unsubscribe = () => {
      subscription?.remove();
      subscription = null;
    };
    subscribe();
    const appState = AppState.addEventListener('change', (s) =>
      s === 'active' ? subscribe() : unsubscribe(),
    );
    return () => {
      appState.remove();
      unsubscribe();
    };
  }, [motion]);

  return { motion, ...pose };
}
