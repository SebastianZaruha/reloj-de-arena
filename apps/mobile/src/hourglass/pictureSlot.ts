/**
 * Un "hueco" para un SkPicture que cambia con el tiempo (arena, vidrio...).
 *
 * El picture se publica en un shared value de Reanimated: el Canvas lo pinta
 * en el hilo de UI sin re-renderizar React. El que se sustituye NO se libera
 * en el acto (el lienzo aún podría estar pintándolo): va a un anillo de
 * tamaño fijo y se libera unos fotogramas después. El anillo nunca crece, así
 * que la memoria se queda plana aunque se publique en cada fotograma.
 */
import { Skia, type SkPicture } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

import { disposeLater, safeDispose } from './disposal';

/** Fotogramas que esperamos antes de liberar un SkPicture antiguo. */
export const DISPOSE_DELAY_FRAMES = 8;

/** Picture vacío (uno por reloj montado, nunca global). */
export function recordEmptyPicture(): SkPicture {
  const recorder = Skia.PictureRecorder();
  recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  const picture = recorder.finishRecordingAsPicture();
  recorder.dispose();
  return picture;
}

export class PictureSlot {
  private readonly trash = new Array<SkPicture | null>(DISPOSE_DELAY_FRAMES).fill(null);
  private trashIndex = 0;

  constructor(
    readonly value: SharedValue<SkPicture>,
    /** Picture vacío: no se libera nunca (por si se remonta el componente). */
    private readonly empty: SkPicture,
  ) {}

  /** Publica un picture nuevo y manda el anterior al anillo. */
  publish(next: SkPicture): void {
    const previous = this.value.value;
    this.value.value = next;
    // Liberamos el de hace DISPOSE_DELAY_FRAMES publicaciones y guardamos el
    // que acabamos de sustituir en su hueco.
    const slot = this.trashIndex;
    safeDispose(this.trash[slot]);
    this.trash[slot] = previous === this.empty || previous === next ? null : previous;
    this.trashIndex = (slot + 1) % DISPOSE_DELAY_FRAMES;
  }

  /** ¿Hay algo publicado (distinto del picture vacío)? */
  get hasContent(): boolean {
    return this.value.value !== this.empty;
  }

  /**
   * Al desmontar: deja el picture vacío en el shared value (para no apuntar
   * nunca a un objeto liberado) y libera todo con margen.
   */
  release(): void {
    const current = this.value.value;
    this.value.value = this.empty;
    disposeLater([...this.trash, current === this.empty ? null : current]);
    this.trash.fill(null);
  }
}
