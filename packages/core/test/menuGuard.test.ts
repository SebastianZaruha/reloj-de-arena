import { describe, expect, it } from 'vitest';
import { MENU_GUARD_SIZE, inMenuGuard } from '../src';

const L = { width: 390, height: 844, safeTop: 24, safeBottom: 16, flipped: false };

describe('zona de guarda del botón del menú', () => {
  it('de pie: esquina de arriba a la derecha (con el margen seguro)', () => {
    expect(inMenuGuard(390 - 24, 24 + 24, L)).toBe(true); // el propio botón
    expect(inMenuGuard(390 - MENU_GUARD_SIZE, 24 + MENU_GUARD_SIZE, L)).toBe(true); // borde de la zona
    expect(inMenuGuard(390 - MENU_GUARD_SIZE - 1, 40, L)).toBe(false);
    expect(inMenuGuard(370, 24 + MENU_GUARD_SIZE + 1, L)).toBe(false);
    expect(inMenuGuard(195, 420, L)).toBe(false); // el reloj
    expect(inMenuGuard(20, 820, L)).toBe(false);
  });

  it('volteado: la esquina pasa a abajo a la izquierda', () => {
    const F = { ...L, flipped: true };
    expect(inMenuGuard(20, 844 - 16 - 20, F)).toBe(true);
    expect(inMenuGuard(370, 30, F)).toBe(false);
    expect(inMenuGuard(MENU_GUARD_SIZE + 1, 830, F)).toBe(false);
  });

  it('datos raros: fuera de la zona', () => {
    expect(inMenuGuard(Number.NaN, 10, L)).toBe(false);
  });
});
