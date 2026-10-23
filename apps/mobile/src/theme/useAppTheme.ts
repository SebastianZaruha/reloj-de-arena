/**
 * Tema efectivo de la app (1.5) y su transición suave.
 *
 * - `preference` es lo que guardan los ajustes: 'light' | 'dark' | 'system'
 *   (Automático). En automático seguimos a `useColorScheme()`, que avisa
 *   en vivo cuando el sistema cambia de claro a oscuro.
 * - `progress` es un shared value que va de 0 (claro) a 1 (oscuro) con una
 *   animación de ~0,5 s. Lo usan los colores del menú (interpolateColor) y
 *   el vidrio de la hoja, que así cambian de tono sin saltos. El reloj
 *   (Skia) hace su propio fundido: ver `useThemeCrossfade` en hourglass/.
 */
import type { ThemePreference } from '@reloj/core';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { resolveScheme, themeFor, type ColorSchemeName, type HourglassTheme } from './theme';

/** Duración del cambio de tema (ms). */
export const THEME_TRANSITION_MS = 520;

export interface AppTheme {
  readonly theme: HourglassTheme;
  readonly scheme: ColorSchemeName;
  /** 0 = claro, 1 = oscuro (animado). */
  readonly progress: SharedValue<number>;
}

export function useAppTheme(preference: ThemePreference, reduceMotion = false): AppTheme {
  const scheme = resolveScheme(preference, useColorScheme());
  const progress = useSharedValue(scheme === 'dark' ? 1 : 0);

  useEffect(() => {
    const target = scheme === 'dark' ? 1 : 0;
    progress.value = reduceMotion
      ? target
      : withTiming(target, { duration: THEME_TRANSITION_MS, easing: Easing.inOut(Easing.quad) });
  }, [scheme, reduceMotion, progress]);

  return { theme: themeFor(scheme), scheme, progress };
}
