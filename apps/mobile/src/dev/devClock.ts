/**
 * Reloj acelerado SOLO para desarrollo en la web (1.5).
 *
 * Probar unos ciclos de 25/5 × 4 a mano llevaría dos horas. Con
 * `?velocidad=60` en la URL (en `npm run web`, modo desarrollo) el tiempo de
 * la app corre 60 veces más deprisa: un minuto pasa en un segundo. Lo usan
 * las pruebas automáticas (Playwright) para ver trabajo → descanso →
 * siguiente ronda en pocos segundos.
 *
 * En producción, en Android/iOS o sin el parámetro, devuelve el reloj real
 * del sistema: no cambia nada.
 */
import { systemClock, type Clock } from '@reloj/core';
import { Platform } from 'react-native';

/** Velocidad máxima permitida (para no romper la simulación). */
const MAX_SPEED = 600;

function readSpeed(): number {
  if (!__DEV__ || Platform.OS !== 'web' || typeof location === 'undefined') return 1;
  const raw = new URLSearchParams(location.search).get('velocidad');
  const speed = raw === null ? 1 : Number(raw);
  return Number.isFinite(speed) && speed > 1 ? Math.min(MAX_SPEED, speed) : 1;
}

function createClock(): Clock {
  const speed = readSpeed();
  if (speed === 1) return systemClock;
  const origin = Date.now();
  console.info(`[reloj] Reloj de desarrollo ×${speed}`);
  return { now: () => origin + (Date.now() - origin) * speed };
}

/** Reloj de la app (el del sistema salvo `?velocidad=N` en desarrollo web). */
export const appClock: Clock = createClock();
