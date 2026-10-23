import { describe, expect, it } from 'vitest';

import { SheetToggle } from '../src/menu/sheetToggle';

const OPEN_MS = 340;
const CLOSE_MS = 260;

describe('SheetToggle (botón del menú)', () => {
  it('el primer toque abre', () => {
    const t = new SheetToggle();
    expect(t.press(0)).toBe('show');
    expect(t.show(0, OPEN_MS)).toBe(true);
    expect(t.isOpen).toBe(true);
  });

  it('los toques de más mientras se abre no la cierran', () => {
    const t = new SheetToggle();
    t.show(0, OPEN_MS);
    for (let ms = 10; ms < OPEN_MS; ms += 30) expect(t.press(ms)).toBeNull();
    expect(t.isOpen).toBe(true);
  });

  it('abierta del todo, un toque la cierra, y mientras se cierra se ignoran', () => {
    const t = new SheetToggle();
    t.show(0, OPEN_MS);
    expect(t.press(OPEN_MS)).toBe('hide');
    t.hide(OPEN_MS, CLOSE_MS);
    expect(t.press(OPEN_MS + 100)).toBeNull();
    expect(t.press(OPEN_MS + CLOSE_MS)).toBe('show');
  });

  it('abrir dos veces o cerrar cerrada no hace nada', () => {
    const t = new SheetToggle();
    expect(t.hide(0, CLOSE_MS)).toBe(false);
    expect(t.show(0, OPEN_MS)).toBe(true);
    expect(t.show(5, OPEN_MS)).toBe(false);
  });

  it('un doble toque rápido deja la hoja abierta (no abre y cierra)', () => {
    const t = new SheetToggle();
    for (const now of [0, 120]) {
      const action = t.press(now);
      if (action === 'show') t.show(now, OPEN_MS);
      if (action === 'hide') t.hide(now, CLOSE_MS);
    }
    expect(t.isOpen).toBe(true);
  });
});
