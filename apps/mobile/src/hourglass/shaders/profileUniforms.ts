/**
 * Uniforms de geometría comunes a todos los shaders que usan PROFILE_SKSL.
 */
import { profileNorm, type HourglassModel } from '@reloj/core';

import type { HourglassLayout } from '../layout';

export function profileUniforms(layout: HourglassLayout, model: HourglassModel) {
  const p = model.profile;
  return {
    uCenter: [layout.cx, layout.cy],
    uHalf: [layout.halfW, layout.halfH],
    uProfile: [p.bulbCenter, p.bulbRadiusY, p.neckRadius, p.fillet],
    uShape: [p.egg, p.taper, profileNorm(p)],
  };
}
