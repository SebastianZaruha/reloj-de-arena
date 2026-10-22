/**
 * Devuelve una ref que siempre contiene el ÚLTIMO valor recibido.
 *
 * Sirve para leer valores actuales desde callbacks de larga vida (gestos,
 * bucles de animación) sin tener que recrearlos en cada render. La ref se
 * actualiza en un efecto de layout, nunca durante el render (regla de React).
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';

export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
