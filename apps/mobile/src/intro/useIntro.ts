/**
 * Introducción al abrir la app (1.5), hecha en código (≈1,25 s):
 *
 *   0      ms  el reloj aparece (fundido de 0,3 s), un 12 % más grande y
 *              centrado en la pantalla, «en el aire» (sin sombra)
 *   0–900  ms  da UNA vuelta completa (360°) con ease-in-out: arranca
 *              despacio, acelera y frena poco a poco, como un objeto real
 *   900–1250   baja a su sitio y a su tamaño; aparece su sombra
 *   950–1350   aparecen el tiempo y el botón de menú
 *
 * Solo en el ARRANQUE EN FRÍO: `introPlayed` vive a nivel de módulo, así
 * que volver de segundo plano (la app sigue en memoria) no la repite.
 * Con «reducir movimiento» no hay giro ni escala: solo un fundido corto.
 *
 * Todo son shared values animados en el hilo de UI (withTiming): React solo
 * se re-renderiza al terminar (`active` → false, para quitar las capas de
 * opacidad del reloj, que cuestan GPU).
 *
 * Al girar, el reloj (alto y estrecho) se pondría horizontal y no cabría a
 * lo ancho: <Hourglass> lo encoge lo justo según el ángulo (ver `fit`).
 */
import { useEffect, useState } from 'react';
import { Easing, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { HourglassPose } from '../hourglass';

/** Tiempos de la introducción (ms). */
export const INTRO = {
  fadeIn: 300,
  spin: 900,
  settle: 350,
  chromeDelay: 950,
  chromeFade: 400,
  /** Escala inicial (un poco más grande). */
  startScale: 1.12,
  /** Con «reducir movimiento»: solo fundido. */
  reducedFade: 250,
} as const;

/** ¿Ya se ha mostrado en este proceso? (se reinicia solo en un arranque en frío) */
let introPlayed = false;

export interface Intro {
  readonly pose: HourglassPose;
  /** true mientras la introducción se está animando. */
  readonly active: boolean;
  /** Opacidad del tiempo y del botón de menú (0 → 1 al final). */
  readonly chrome: SharedValue<number>;
}

export function useIntro(reduceMotion: boolean): Intro {
  // Se decide UNA vez al montar: si ya se mostró, todo empieza en su sitio.
  const [play] = useState(() => !introPlayed);
  const animate = play && !reduceMotion;
  const [active, setActive] = useState(play);

  const rotate = useSharedValue(0);
  const scale = useSharedValue(animate ? INTRO.startScale : 1);
  const centered = useSharedValue(animate ? 1 : 0);
  const opacity = useSharedValue(play ? 0 : 1);
  const shadow = useSharedValue(animate ? 0 : 1);
  const chrome = useSharedValue(play ? 0 : 1);

  useEffect(() => {
    if (!play) return;
    introPlayed = true;
    // Al terminar, avisamos a React (en el hilo de JS) para quitar las capas.
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(setActive, false);
    };
    if (!animate) {
      opacity.set(withTiming(1, { duration: INTRO.reducedFade }, done));
      chrome.set(withTiming(1, { duration: INTRO.reducedFade }));
      return;
    }
    const settle = { duration: INTRO.settle, easing: Easing.out(Easing.cubic) };
    opacity.set(withTiming(1, { duration: INTRO.fadeIn, easing: Easing.out(Easing.quad) }));
    rotate.set(withTiming(2 * Math.PI, { duration: INTRO.spin, easing: Easing.inOut(Easing.cubic) }));
    scale.set(withDelay(INTRO.spin, withTiming(1, settle)));
    centered.set(withDelay(INTRO.spin, withTiming(0, settle)));
    shadow.set(withDelay(INTRO.spin, withTiming(1, settle, done)));
    chrome.set(withDelay(INTRO.chromeDelay, withTiming(1, { duration: INTRO.chromeFade })));
  }, [play, animate, rotate, scale, centered, opacity, shadow, chrome]);

  return { pose: { rotate, scale, centered, opacity, shadow }, active, chrome };
}
