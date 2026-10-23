/**
 * Fondo del vidrio esmerilado del menú (1.8.2): una FOTO pequeña y ya
 * desenfocada de la escena (fondo, sombra y reloj).
 *
 * ¿Por qué una foto y no desenfocar en cada fotograma?
 *  - Con un BackdropBlur la GPU tiene que leer la pantalla ya dibujada (en
 *    los móviles eso parte cada fotograma en dos).
 *  - Volviendo a dibujar el reloj dentro de la hoja (1.8.1), la GPU tenía
 *    que preparar al abrir versiones nuevas de los shaders del vidrio (con
 *    el recorte de la hoja), y en un Samsung A55 la hoja tardaba ~2 s en
 *    salir y a veces se veía el reloj encima del menú un momento.
 *
 * Aquí la escena se dibuja aparte (en una superficie pequeña de GPU del hilo
 * de JavaScript, no la del lienzo), a 1/4 del tamaño (1/16 de los píxeles),
 * se desenfoca a esa escala (mismo radio visual: 26 px de pantalla) y el
 * lienzo solo pinta esa imagen estirada dentro de la forma de la hoja: lo
 * más barato que hay para una GPU. Cada foto cuesta ~2 ms. Desenfocada se ve igual que a tamaño
 * completo. Se renueva unas 4 veces por segundo mientras la hoja está a la
 * vista (la arena se mueve despacio) y una vez, en reposo, al poco de montar
 * el reloj, para que al abrir ya esté lista.
 */
import {
  Skia,
  TileMode,
  type SkImage,
  type SkPaint,
  type SkPicture,
  type SkSurface,
} from '@shopify/react-native-skia';
import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { useLatest } from '../hooks/useLatest';
import { disposeLater, safeDispose } from './disposal';

/** Escala de la foto respecto a la pantalla. */
export const BACKDROP_SCALE = 0.25;
/** Desenfoque del vidrio en píxeles de pantalla (como el BackdropBlur de antes). */
export const BACKDROP_BLUR = 26;
/** Cada cuánto se renueva la foto con la hoja a la vista. */
export const BACKDROP_REFRESH_MS = 250;

/** Lo que hay que dibujar: los pictures actuales y la pose del reloj. */
export interface BackdropScene {
  readonly background: SkPicture;
  readonly shadow: SkPicture;
  readonly body: SkPicture;
  readonly sand: SkPicture;
  readonly front: SkPicture;
  /** Centro del reloj (el cuello), en píxeles de pantalla. */
  readonly cx: number;
  readonly cy: number;
  /** Escala y giro (radianes) del reloj alrededor de su centro. */
  readonly scale: number;
  readonly angle: number;
}

/**
 * Superficie pequeña de GPU, propia de este hilo (no la del lienzo): la GPU
 * del hilo de UI no compila ni dibuja nada nuevo. Si no hay GPU, de CPU.
 */
function makeSurface(w: number, h: number): SkSurface | null {
  return Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
}

export class FrostedBackdrop {
  private readonly w: number;
  private readonly h: number;
  private scene: SkSurface | null = null;
  private blurred: SkSurface | null = null;
  private readonly blurPaint: SkPaint;

  constructor(
    width: number,
    height: number,
    /** Donde se publica la foto (la lee el lienzo en el hilo de UI). */
    private readonly target: SharedValue<SkImage | null>,
  ) {
    this.w = Math.max(1, Math.ceil(width * BACKDROP_SCALE));
    this.h = Math.max(1, Math.ceil(height * BACKDROP_SCALE));
    const sigma = BACKDROP_BLUR * BACKDROP_SCALE;
    this.blurPaint = Skia.Paint();
    this.blurPaint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, null));
  }

  /** Dibuja la escena, la desenfoca y publica la foto nueva. */
  render(s: BackdropScene): void {
    this.scene ??= makeSurface(this.w, this.h);
    this.blurred ??= makeSurface(this.w, this.h);
    if (!this.scene || !this.blurred) return;

    const c = this.scene.getCanvas();
    c.save();
    c.scale(BACKDROP_SCALE, BACKDROP_SCALE);
    c.drawPicture(s.background);
    c.drawPicture(s.shadow);
    c.save();
    c.translate(s.cx, s.cy);
    c.scale(s.scale, s.scale);
    c.rotate((s.angle * 180) / Math.PI, 0, 0);
    c.translate(-s.cx, -s.cy);
    c.drawPicture(s.body);
    c.drawPicture(s.sand);
    c.drawPicture(s.front);
    c.restore();
    c.restore();
    const sharp = this.scene.makeImageSnapshot();

    const b = this.blurred.getCanvas();
    b.drawImage(sharp, 0, 0, this.blurPaint);
    this.blurred.flush();
    // La foto pasa a memoria normal: así la puede pintar el lienzo, que vive
    // en otro hilo (y otro contexto de GPU). Son ~80 KB.
    const gpu = this.blurred.makeImageSnapshot();
    const next = gpu.makeNonTextureImage();
    gpu.dispose();
    sharp.dispose();

    const previous = this.target.value;
    this.target.value = next;
    // La anterior se libera con retraso: el lienzo aún podría estar pintándola.
    if (previous) disposeLater([previous]);
  }

  dispose(): void {
    const current = this.target.value;
    this.target.value = null;
    disposeLater([current, this.scene, this.blurred]);
    this.scene = null;
    this.blurred = null;
    safeDispose(this.blurPaint);
  }
}

/** Tras montar (o cambiar de tema o tamaño), cuándo se preparan las primeras fotos. */
const WARM_UP_MS = [1200, 3000];

interface BackdropOptions {
  readonly width: number;
  readonly height: number;
  /** ¿Está la hoja a la vista (abierta o moviéndose)? */
  readonly active: boolean;
  /** Devuelve la escena actual (se llama solo al hacer la foto). */
  readonly read: () => BackdropScene;
  /** Cambia cuando cambia lo que se dibuja (tema, modelo, tamaño). */
  readonly version: unknown;
}

/**
 * Mantiene la foto del vidrio: una al poco de montar (lista para el primer
 * toque al menú), otra en cuanto la hoja empieza a abrirse y luego cada
 * BACKDROP_REFRESH_MS mientras se ve. Con la hoja cerrada no hace nada.
 */
export function useFrostedBackdrop({ width, height, active, read, version }: BackdropOptions) {
  const image = useSharedValue<SkImage | null>(null);
  const backdrop = useMemo(() => new FrostedBackdrop(width, height, image), [width, height, image]);
  useEffect(() => () => backdrop.dispose(), [backdrop]);
  const readRef = useLatest(read);

  const shoot = useCallback(() => {
    try {
      backdrop.render(readRef.current());
    } catch {
      // Sin foto el vidrio solo lleva el tinte: nunca rompe la pantalla.
    }
  }, [backdrop, readRef]);

  // Dos fotos de calentamiento (la primera vez la GPU de este hilo prepara
  // sus shaders: mejor en reposo que al tocar el menú).
  useEffect(() => {
    const ids = WARM_UP_MS.map((ms) => setTimeout(shoot, ms));
    return () => ids.forEach(clearTimeout);
  }, [shoot, version]);

  // useLayoutEffect: la foto se renueva ANTES del primer fotograma de la hoja.
  useLayoutEffect(() => {
    if (!active) return;
    shoot();
    const id = setInterval(shoot, BACKDROP_REFRESH_MS);
    return () => clearInterval(id);
  }, [active, shoot]);

  return image;
}
