/**
 * `LiveMotion`: la fuente de movimiento que lee el reloj (MotionSource).
 *
 * Envuelve el `MotionProcessor` del core (filtro, escalones, orientación) y
 * añade lo que necesita la app:
 *  - un contador de volteos (`flips`) para que el motor de arena gire la
 *    arena en el mismo fotograma que el dibujo,
 *  - suscriptores (el motor se despierta cuando el móvil se mueve),
 *  - un callback de eventos (pausa de lado, reanudar, voltear) para la
 *    pantalla.
 *
 * Se crea UNA vez por pantalla. `push` no crea objetos: se llama 30 veces
 * por segundo desde el sensor.
 */
import { MotionProcessor, type OrientationEvent, type Vec2 } from '@reloj/core';

import type { MotionSource } from '../hourglass';

export type MotionEventHandler = (event: OrientationEvent) => void;

export class LiveMotion implements MotionSource {
  private readonly processor = new MotionProcessor();
  private readonly listeners = new Set<() => void>();
  private flipCount = 0;
  /** Recibe los eventos de orientación (lo fija la pantalla). */
  private onEvent: MotionEventHandler | null = null;

  get gravity(): Vec2 {
    return this.processor.gravity;
  }
  get simGravity(): Vec2 {
    return this.processor.simGravity;
  }
  get tilt(): Vec2 {
    return this.processor.tilt;
  }
  get flipped(): boolean {
    return this.processor.flipped;
  }
  get flips(): number {
    return this.flipCount;
  }
  get sideways(): boolean {
    return this.processor.sideways;
  }
  get sideSign(): 1 | -1 {
    return this.processor.sideSign;
  }

  /** Fija quién recibe los eventos de orientación (null = nadie). */
  setEventHandler(handler: MotionEventHandler | null): void {
    this.onEvent = handler;
  }

  setCalm(calm: boolean): void {
    this.processor.setCalm(calm);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Muestra del sensor ya en la convención del core ("hacia el suelo" en ejes
   * de pantalla: x derecha, y abajo, z hacia quien mira).
   */
  push(x: number, y: number, z: number, nowMs: number): void {
    const event = this.processor.push(x, y, z, nowMs);
    if (event === 'flip') this.flipCount++;
    // Primero la pantalla (p. ej. reinicia el temporizador al voltear) y
    // después el motor de arena, que ya leerá el estado nuevo.
    if (event) this.onEvent?.(event);
    if (this.processor.changed) this.listeners.forEach(notify);
  }
}

function notify(listener: () => void): void {
  listener();
}
