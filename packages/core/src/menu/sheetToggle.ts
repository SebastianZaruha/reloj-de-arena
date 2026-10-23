/**
 * Qué hace un toque en el botón del menú (1.8.2).
 *
 * En la 1.8.1, en un Samsung A55 la hoja tardaba en salir y cada toque de
 * más la cerraba o la abría otra vez: había que tocar muchas veces. Ahora:
 *  - abrir con la hoja ya abierta (o abriéndose) no hace nada, y cerrar con
 *    la hoja cerrada tampoco;
 *  - mientras la hoja se mueve, el botón ignora los toques.
 * Cerrar tocando fuera, arrastrando o con «atrás» no pasa por aquí: siempre
 * funciona.
 */
export type SheetAction = 'show' | 'hide' | null;

export class SheetToggle {
  private open = false;
  private movingUntil = 0;

  /** ¿Está abierta (o abriéndose)? Al momento, sin esperar a React. */
  get isOpen(): boolean {
    return this.open;
  }

  /** Abre; devuelve false si ya estaba abierta. `moveMs`: lo que dura la animación. */
  show(now: number, moveMs: number): boolean {
    if (this.open) return false;
    this.open = true;
    this.movingUntil = now + moveMs;
    return true;
  }

  /** Cierra; devuelve false si ya estaba cerrada. */
  hide(now: number, moveMs: number): boolean {
    if (!this.open) return false;
    this.open = false;
    this.movingUntil = now + moveMs;
    return true;
  }

  /** Toque en el botón: qué toca hacer (null = ignorarlo, la hoja se está moviendo). */
  press(now: number): SheetAction {
    if (now < this.movingUntil) return null;
    return this.open ? 'hide' : 'show';
  }
}
