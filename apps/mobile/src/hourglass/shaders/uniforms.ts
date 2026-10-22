/**
 * Ayudas para trabajar con shaders de Skia (SkSL).
 *
 * Un "runtime shader" es un pequeño programa que se ejecuta en la GPU para
 * CADA píxel. Recibe parámetros llamados "uniforms". Skia los espera como
 * un array plano de números en el orden en que se declaran; estas ayudas nos
 * dejan pasarlos por NOMBRE, que es mucho menos propenso a errores.
 */
import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

export type UniformValues = Record<string, number | readonly number[]>;

/** Compila un shader SkSL y lanza un error legible si falla. */
export function compileShader(name: string, source: string): SkRuntimeEffect {
  const effect = Skia.RuntimeEffect.Make(source);
  if (!effect) {
    throw new Error(`No se pudo compilar el shader "${name}"`);
  }
  return effect;
}

interface Slot {
  readonly name: string;
  readonly offset: number;
  readonly size: number;
}

/**
 * Empaquetador de uniforms REUTILIZABLE.
 *
 * Lee una sola vez la disposición de los uniforms del shader y luego, en
 * cada fotograma, escribe los valores en el MISMO array (sin crear arrays
 * nuevos en el bucle caliente). Además valida los números: un NaN o un
 * Infinity llegando a la GPU puede producir dibujos corruptos, así que los
 * sustituimos por 0 y avisamos (solo en desarrollo).
 */
export class UniformPacker {
  private readonly slots: readonly Slot[];
  /** Array plano que se pasa a Skia. Se reutiliza en cada llamada. */
  readonly buffer: number[];

  constructor(effect: SkRuntimeEffect) {
    const slots: Slot[] = [];
    for (let i = 0; i < effect.getUniformCount(); i++) {
      const info = effect.getUniform(i);
      slots.push({ name: effect.getUniformName(i), offset: info.slot, size: info.columns * info.rows });
    }
    this.slots = slots;
    this.buffer = new Array<number>(effect.getUniformFloatCount()).fill(0);
  }

  /** Escribe los valores en `buffer` y lo devuelve. */
  pack(values: UniformValues): number[] {
    const out = this.buffer;
    for (const { name, offset, size } of this.slots) {
      const value = values[name];
      if (value === undefined) throw new Error(`Falta el uniform "${name}"`);
      if (typeof value === 'number') {
        if (size !== 1) throw new Error(`El uniform "${name}" espera ${size} valores y recibió 1`);
        out[offset] = finiteOrZero(value, name);
        continue;
      }
      if (value.length !== size) {
        throw new Error(`El uniform "${name}" espera ${size} valores y recibió ${value.length}`);
      }
      for (let k = 0; k < size; k++) out[offset + k] = finiteOrZero(value[k] as number, name);
    }
    return out;
  }
}

function finiteOrZero(v: number, name: string): number {
  if (Number.isFinite(v)) return v;
  if (__DEV__) console.warn(`[reloj] uniform "${name}" no finito (${v}); se usa 0`);
  return 0;
}

/** Versión de un solo uso (capas estáticas): empaqueta en un array nuevo. */
export function packUniforms(effect: SkRuntimeEffect, values: UniformValues): number[] {
  return [...new UniformPacker(effect).pack(values)];
}
