/**
 * ¿Está la app a la vista? (1.7)
 *
 * Con la app en segundo plano, los avisos de cambio de fase y de fin los da
 * la NOTIFICACIÓN (Android, módulo de segundo plano). La app no debe sonar
 * ni vibrar a la vez, ni repetirlos al volver: al abrirla, `tickSession` se
 * pone al día de golpe y la pantalla vería un «cambio de fase» que ya avisó
 * la notificación hace rato.
 *
 * Se escucha AppState una sola vez, al cargar el módulo (como `introPlayed`
 * en useIntro, vive mientras viva el proceso de JavaScript).
 */
import { AppState } from 'react-native';

import { backgroundAvailable } from './backgroundSync';

/** Tras volver a primer plano, durante este tiempo los avisos son «atrasados». */
export const CATCH_UP_MS = 1000;

// Al arrancar `currentState` puede ser null o 'unknown': la app se está abriendo.
let active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
let activeSince = 0;

AppState.addEventListener('change', (state) => {
  const now = Date.now();
  if (state === 'active' && !active) activeSince = now;
  active = state === 'active';
});

export function isAppActive(): boolean {
  return active;
}

/** ¿Acaba de volver a primer plano? (los avisos que se vean ahora son atrasados) */
export function justReturned(now = Date.now()): boolean {
  return active && activeSince > 0 && now - activeSince < CATCH_UP_MS;
}

/**
 * ¿Debe la APP sonar y vibrar ahora? Sí, salvo que el módulo de segundo plano
 * esté en marcha (Android 1.7) y la app no esté a la vista o acabe de volver:
 * entonces el aviso ya lo dio (o lo dará) la notificación. Sin el módulo
 * (web, Expo Go), como siempre.
 */
export function appShouldAlert(): boolean {
  return !backgroundAvailable || (isAppActive() && !justReturned());
}
