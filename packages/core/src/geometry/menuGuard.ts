/**
 * Zona de guarda del botón del menú (1.6).
 *
 * En Android, un toque sobre el botón del menú (un Pressable de React
 * Native) también llegaba al gesto de toque del reloj (Gesture Handler) y
 * empezaba o pausaba el tiempo. Ahora hay una zona cuadrada en la esquina
 * del botón donde los gestos del reloj (tocar, mantener, deslizar) no hacen
 * NADA; toda esa zona es el área táctil del botón, que abre el menú.
 *
 * De pie, la esquina es la de arriba a la derecha. Con el móvil volteado la
 * capa del menú gira 180°, así que la esquina pasa a ser la de abajo a la
 * izquierda de la pantalla. Coordenadas: píxeles de la ventana (como
 * `absoluteX/absoluteY` de Gesture Handler).
 */

/** Lado (px) de la zona de guarda, medido desde el borde y bajo el margen seguro. */
export const MENU_GUARD_SIZE = 84;

export interface MenuGuardLayout {
  readonly width: number;
  readonly height: number;
  /** Margen seguro de arriba y de abajo de la pantalla (muesca, barra de gestos). */
  readonly safeTop: number;
  readonly safeBottom: number;
  /** ¿Está el reloj volteado (capa del menú girada 180°)? */
  readonly flipped: boolean;
}

/** ¿Cae el punto (x, y) de la ventana en la zona del botón del menú? */
export function inMenuGuard(x: number, y: number, l: MenuGuardLayout): boolean {
  'worklet';
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const size = MENU_GUARD_SIZE;
  if (!l.flipped) return x >= l.width - size && y <= l.safeTop + size;
  return x <= size && y >= l.height - l.safeBottom - size;
}
