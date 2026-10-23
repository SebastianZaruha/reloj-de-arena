/**
 * Punto de entrada del paquete `@reloj/core`.
 *
 * Este paquete es TypeScript puro: no sabe nada de React, React Native ni
 * Skia. Por eso puede reutilizarse en el móvil, en la web y (más adelante)
 * en la app de escritorio, y se testea con Vitest sin emuladores.
 */
export * from './timer';
export * from './session';
export * from './background';
export * from './settings';
export * from './catalog';
export * from './geometry';
export * from './physics';
export * from './sim';
export * from './persistence';
export * from './recovery';
export * from './i18n';
