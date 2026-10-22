/**
 * Shaders compilados del reloj.
 *
 * IMPORTANTE: no guardamos objetos Skia a nivel de módulo. En web, CanvasKit
 * vive en memoria WebAssembly; tras un hot reload o si el lienzo se remonta
 * por un error, un objeto "global" podría apuntar a memoria ya liberada.
 * Por eso cada <Hourglass> crea su propio juego de shaders (con
 * `createShaderSet`) y lo libera al desmontarse (con `disposeShaderSet`).
 */
import type { SkRuntimeEffect } from '@shopify/react-native-skia';

import type { SkiaDisposable } from './disposal';
import { BACKGROUND_SKSL } from './shaders/background';
import { GLASS_BODY_SKSL, GLASS_FRONT_SKSL } from './shaders/glass';
import { SAND_SKSL } from './shaders/sand';
import { compileShader } from './shaders/uniforms';

export interface ShaderSet {
  readonly background: SkRuntimeEffect;
  readonly glassBody: SkRuntimeEffect;
  readonly glassFront: SkRuntimeEffect;
  readonly sand: SkRuntimeEffect;
}

/** Compila los shaders (se llama una vez por montaje del reloj). */
export function createShaderSet(): ShaderSet {
  return {
    background: compileShader('fondo', BACKGROUND_SKSL),
    glassBody: compileShader('vidrio-cuerpo', GLASS_BODY_SKSL),
    glassFront: compileShader('vidrio-frente', GLASS_FRONT_SKSL),
    sand: compileShader('arena', SAND_SKSL),
  };
}

/** Objetos a liberar cuando el juego de shaders ya no se use. */
export function shaderSetDisposables(set: ShaderSet): SkiaDisposable[] {
  return [set.background, set.glassBody, set.glassFront, set.sand];
}
