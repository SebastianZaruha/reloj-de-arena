/**
 * Liberación DIFERIDA de objetos Skia.
 *
 * En web, cada objeto Skia (Paint, Shader, Picture, Path...) ocupa memoria
 * dentro de CanvasKit (WebAssembly) que el recolector de basura de JavaScript
 * NO ve. Si no se llama a `dispose()`, la memoria crece sin parar hasta que
 * CanvasKit aborta ("RuntimeError: unreachable", "memory access out of
 * bounds", "Aborted()").
 *
 * Pero liberar demasiado pronto es igual de malo: el lienzo de Skia dibuja en
 * el siguiente fotograma con la lista de órdenes que ya tenía, y si esa lista
 * apunta a un objeto borrado → "null function" o fallo de memoria.
 *
 * Solución: cuando un objeto deja de usarse lo encolamos y lo liberamos
 * pasado un margen de tiempo, cuando seguro que nadie lo dibuja ya.
 */

/** Cualquier objeto con `dispose()` (todos los objetos Skia lo tienen). */
export interface SkiaDisposable {
  dispose(): void;
}

/** Margen antes de liberar (ms). Varios fotogramas de sobra. */
export const DISPOSE_DELAY_MS = 500;

/** Libera un objeto sin propagar errores (p. ej. si CanvasKit ya cayó). */
export function safeDispose(obj: SkiaDisposable | null | undefined): void {
  if (!obj) return;
  try {
    obj.dispose();
  } catch {
    // Si CanvasKit ha abortado, liberar también falla: no hay nada que hacer.
  }
}

/** Libera los objetos pasado `DISPOSE_DELAY_MS`. */
export function disposeLater(objs: readonly (SkiaDisposable | null | undefined)[]): void {
  if (objs.length === 0) return;
  setTimeout(() => objs.forEach(safeDispose), DISPOSE_DELAY_MS);
}
