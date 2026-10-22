/**
 * Capas del VIDRIO (fondo, sombra y reflejos): se graban en SkPictures (listas
 * de órdenes de dibujo que Skia reproduce muy rápido).
 *
 *   capa trasera:  fondo → sombra en la mesa → cuerpo del vidrio (refracción)
 *   capa frontal:  reflejos del vidrio → contorno
 *
 * Desde la 1.3 la luz, los reflejos y la sombra se mueven con la inclinación
 * del móvil, así que estas capas se vuelven a grabar cuando la inclinación
 * cambia (como mucho una vez por fotograma; lo decide useSandEngine).
 * Para que regrabar sea BARATO, `GlassPainter` crea UNA vez todo lo que se
 * puede reutilizar (Paints, filtros de desenfoque, el grabador, los arrays de
 * uniforms) y en cada grabación solo nacen los 3 shaders (Skia no deja
 * cambiar los uniforms de un shader ya creado), que se liberan nada más
 * terminar: el SkPicture guarda sus propias referencias.
 *
 * Los pictures que se sustituyen los libera useSandEngine (en diferido).
 * `dispose()` libera los objetos persistentes al desmontar o cambiar de
 * tamaño/tema.
 */
import type { HourglassModel, Vec2 } from '@reloj/core';
import {
  BlendMode,
  BlurStyle,
  PaintStyle,
  Skia,
  type SkCanvas,
  type SkMaskFilter,
  type SkPaint,
  type SkPicture,
  type SkPictureRecorder,
  type SkRect,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia';

import type { HourglassTheme } from '../theme/theme';
import { safeDispose } from './disposal';
import type { HourglassLayout } from './layout';
import type { ShaderSet } from './resources';
import { profileUniforms } from './shaders/profileUniforms';
import { UniformPacker, type UniformValues } from './shaders/uniforms';

/** Radio de desenfoque válido (Skia falla con radios <= 0 o NaN). */
function blurRadius(r: number): number {
  return Number.isFinite(r) && r > 0.1 ? r : 0.1;
}

/**
 * Desplazamientos (px) por unidad de inclinación, de fondo a frente. Que
 * cada capa se mueva distinto da sensación de profundidad (paralaje).
 */
export const PARALLAX = { background: -10, shadow: 9, front: 2.5 } as const;

export class GlassPainter {
  private readonly recorder: SkPictureRecorder;
  private readonly bounds: SkRect;
  // Paints persistentes (uno por cosa que se dibuja).
  private readonly bgPaint: SkPaint;
  private readonly bodyPaint: SkPaint;
  private readonly frontPaint: SkPaint;
  private readonly edgePaint: SkPaint;
  private readonly innerPaint: SkPaint;
  private readonly widePaint: SkPaint;
  private readonly contactPaint: SkPaint;
  private readonly causticPaint: SkPaint;
  /** Filtros de desenfoque (los paints los usan; los liberamos nosotros). */
  private readonly masks: SkMaskFilter[];
  // Shaders compilados (del ShaderSet de la instancia) y sus empaquetadores.
  private readonly background: SkRuntimeEffect;
  private readonly glassBody: SkRuntimeEffect;
  private readonly glassFront: SkRuntimeEffect;
  private readonly bgPacker: UniformPacker;
  private readonly bodyPacker: UniformPacker;
  private readonly frontPacker: UniformPacker;
  /** Valores de uniforms: arrays fijos que se rellenan en sitio. */
  private readonly bgU: UniformValues & { uOffset: number[] };
  private readonly bodyU: UniformValues & { uLight: number[] };
  private readonly frontU: UniformValues & { uLight: number[]; uParallax: number[] };
  private disposed = false;

  constructor(
    shaders: ShaderSet,
    private readonly layout: HourglassLayout,
    model: HourglassModel,
    theme: HourglassTheme,
  ) {
    this.recorder = Skia.PictureRecorder();
    this.bounds = Skia.XYWHRect(0, 0, layout.width, layout.height);
    this.background = shaders.background;
    this.glassBody = shaders.glassBody;
    this.glassFront = shaders.glassFront;
    this.bgPacker = new UniformPacker(this.background);
    this.bodyPacker = new UniformPacker(this.glassBody);
    this.frontPacker = new UniformPacker(this.glassFront);

    const bg = theme.background;
    this.bgU = {
      uSize: [layout.width, layout.height],
      uOffset: [0, 0],
      uTop: bg.top,
      uBottom: bg.bottom,
      uGlow: bg.glow,
      uGlowPos: bg.glowPos,
      uVignette: bg.vignette,
      uHorizon: layout.cy + layout.halfH * 0.97,
    };
    const profile = profileUniforms(layout, model);
    this.bodyU = {
      ...profile,
      uRefraction: model.glass.refraction,
      uTint: theme.glass.tint,
      uTintAmount: model.glass.tint,
      uLight: [0, 0],
      uReflection: theme.glass.reflection,
    };
    this.frontU = {
      ...profile,
      uLight: [0, 0],
      uParallax: [0, 0],
      uReflection: theme.glass.reflection,
      uRim: model.glass.rimStrength,
      uSpecular: model.glass.specularStrength,
    };

    this.bgPaint = Skia.Paint();
    this.bodyPaint = Skia.Paint();
    this.bodyPaint.setAntiAlias(true);
    this.frontPaint = Skia.Paint();
    this.frontPaint.setAntiAlias(true);

    // Contorno: una línea oscura finísima por fuera y un brillo por dentro,
    // como el canto de un vidrio real visto de lado.
    this.edgePaint = Skia.Paint();
    this.edgePaint.setAntiAlias(true);
    this.edgePaint.setStyle(PaintStyle.Stroke);
    this.edgePaint.setStrokeWidth(1.1); // 1.4: canto algo más grueso (antes 0.9)
    this.edgePaint.setColor(Skia.Color(theme.glass.edge));

    const w = layout.halfW;
    const innerBlur = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 0.4, true);
    const wideBlur = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blurRadius(w * 0.16), true);
    const contactBlur = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blurRadius(3.5), true);
    const causticBlur = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blurRadius(w * 0.08), true);
    this.masks = [innerBlur, wideBlur, contactBlur, causticBlur];

    this.innerPaint = Skia.Paint();
    this.innerPaint.setAntiAlias(true);
    this.innerPaint.setStyle(PaintStyle.Stroke);
    this.innerPaint.setStrokeWidth(1.0); // 1.4: antes 0.8
    this.innerPaint.setColor(Skia.Color(theme.glass.edgeHighlight));
    this.innerPaint.setMaskFilter(innerBlur);

    this.widePaint = Skia.Paint();
    this.widePaint.setAntiAlias(true);
    this.widePaint.setColor(Skia.Color(theme.shadow.color));
    this.widePaint.setMaskFilter(wideBlur);

    this.contactPaint = Skia.Paint();
    this.contactPaint.setAntiAlias(true);
    this.contactPaint.setColor(Skia.Color(theme.shadow.contact));
    this.contactPaint.setMaskFilter(contactBlur);

    this.causticPaint = Skia.Paint();
    this.causticPaint.setAntiAlias(true);
    this.causticPaint.setBlendMode(BlendMode.Screen);
    this.causticPaint.setColor(Skia.Color(theme.shadow.caustic));
    this.causticPaint.setMaskFilter(causticBlur);
  }

  /** Graba la capa trasera: fondo, sombra y cuerpo del vidrio. */
  recordBack(tilt: Vec2): SkPicture {
    this.assertAlive();
    const { layout } = this;
    const canvas = this.recorder.beginRecording(this.bounds);

    // 1) Fondo (con un poco de paralaje: se mueve al revés que el vidrio).
    const bgU = this.bgU;
    bgU.uOffset[0] = tilt.x * PARALLAX.background;
    bgU.uOffset[1] = tilt.y * PARALLAX.background;
    const bgShader = this.background.makeShader(this.bgPacker.pack(bgU));
    this.bgPaint.setShader(bgShader);
    canvas.drawRect(this.bounds, this.bgPaint);

    // 2) Sombra sobre la "mesa" (se desplaza con la inclinación).
    this.drawShadow(canvas, tilt);

    // 3) Cuerpo del vidrio: refracta el fondo (que recibe como shader hijo).
    const bodyU = this.bodyU;
    bodyU.uLight[0] = tilt.x;
    bodyU.uLight[1] = tilt.y;
    const bodyShader = this.glassBody.makeShaderWithChildren(this.bodyPacker.pack(bodyU), [bgShader]);
    this.bodyPaint.setShader(bodyShader);
    canvas.drawPath(layout.outerPath, this.bodyPaint);

    const picture = this.recorder.finishRecordingAsPicture();
    // El picture ya guarda sus referencias: soltamos las nuestras.
    this.bgPaint.setShader(null);
    this.bodyPaint.setShader(null);
    safeDispose(bodyShader);
    safeDispose(bgShader);
    return picture;
  }

  /** Graba la capa frontal: reflejos y contorno. */
  recordFront(tilt: Vec2): SkPicture {
    this.assertAlive();
    const { layout } = this;
    const canvas = this.recorder.beginRecording(this.bounds);

    // 1) Reflejos (shader), recortados al contorno del vidrio.
    const u = this.frontU;
    u.uLight[0] = tilt.x;
    u.uLight[1] = tilt.y;
    u.uParallax[0] = tilt.x * PARALLAX.front;
    u.uParallax[1] = tilt.y * PARALLAX.front;
    const shader = this.glassFront.makeShader(this.frontPacker.pack(u));
    this.frontPaint.setShader(shader);
    canvas.drawPath(layout.outerPath, this.frontPaint);

    // 2) Contorno exterior y brillo interior.
    canvas.drawPath(layout.outerPath, this.edgePaint);
    canvas.drawPath(layout.innerPath, this.innerPaint);

    const picture = this.recorder.finishRecordingAsPicture();
    this.frontPaint.setShader(null);
    safeDispose(shader);
    return picture;
  }

  /** Libera los objetos persistentes. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    [
      this.bgPaint,
      this.bodyPaint,
      this.frontPaint,
      this.edgePaint,
      this.innerPaint,
      this.widePaint,
      this.contactPaint,
      this.causticPaint,
      ...this.masks,
      this.recorder,
    ].forEach(safeDispose);
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('GlassPainter usado después de dispose()');
  }

  /**
   * Sombra suave del reloj sobre la mesa. La luz viene de arriba a la
   * izquierda, así que cae a la derecha; al inclinar el móvil se desplaza
   * un poco (la luz "se mueve" respecto al reloj).
   */
  private drawShadow(canvas: SkCanvas, tilt: Vec2): void {
    const { layout } = this;
    const baseY = layout.cy + layout.halfH;
    const ox = tilt.x * PARALLAX.shadow;
    const oy = tilt.y * PARALLAX.shadow * 0.5;
    const w = layout.halfW;
    // La sombra se alarga un poco hacia el lado al que se inclina.
    const stretch = 1 + Math.min(0.25, Math.abs(tilt.x) * 0.25);

    // Sombra amplia y difusa, desplazada a la derecha (luz desde la izquierda).
    canvas.drawOval(
      Skia.XYWHRect(
        layout.cx - w * 0.75 + w * 0.22 + ox - (tilt.x < 0 ? w * 1.75 * (stretch - 1) : 0),
        baseY - w * 0.1 + oy,
        w * 1.75 * stretch,
        w * 0.26,
      ),
      this.widePaint,
    );
    // Sombra de contacto: pequeña y más oscura justo debajo de la base.
    canvas.drawOval(
      Skia.XYWHRect(layout.cx - w * 0.3 + ox * 0.2, baseY - w * 0.035, w * 0.6, w * 0.07),
      this.contactPaint,
    );
    // Cáustica: la luz que atraviesa el vidrio se concentra en la sombra.
    canvas.drawOval(
      Skia.XYWHRect(layout.cx + w * 0.25 + ox * 1.3, baseY - w * 0.02 + oy, w * 0.55, w * 0.1),
      this.causticPaint,
    );
  }
}
