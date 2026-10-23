package com.sebastianzaruha.relojdearena.background

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ComposeShader
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.Shader
import android.os.SystemClock
import android.view.View
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

/**
 * El reloj de la ventana flotante, dibujado a mano con Canvas: SIN
 * JavaScript, para que funcione con la app en segundo plano o cerrada.
 *
 * No es la simulación grano a grano de la app (eso sería caro para una
 * ventanita que está siempre encendida); es una imitación barata con el
 * mismo aspecto:
 *   - la silueta exacta de la app (`HourglassShape`),
 *   - la arena con los tonos de la app y una textura de granos,
 *   - arriba la superficie en «V» (embudo), abajo un montón con pico,
 *   - un chorro fino con granos cayendo, mientras corre.
 *
 * El nivel sale del tiempo real (`TimerModel.settle` con la sesión
 * guardada), así que nunca se desincroniza. Se redibuja ~12 veces por
 * segundo solo mientras corre o gira; en pausa no gasta nada.
 *
 * Al cambiar de fase, el reloj DA LA VUELTA (como uno de verdad): la arena
 * que había caído queda arriba para la fase nueva.
 */
@SuppressLint("ViewConstructor")
class HourglassView(context: Context) : View(context) {
  /** La sesión a dibujar (la del almacén). null = vacío. */
  var session: BackgroundSession? = null
    set(value) {
      // Un reinicio o un cambio de plan no es «pasar de fase»: no gira.
      val continuing = value != null && field != null && value.durations == field?.durations &&
        value.transitions >= (field?.transitions ?: 0)
      if (!continuing) lastTransitions = -1
      field = value
      invalidate()
    }

  var dark: Boolean = false
    set(value) {
      if (field != value) {
        field = value
        palette = if (value) HourglassPalette.DARK else HourglassPalette.LIGHT
        grains = null
        invalidate()
      }
    }

  /** Sin animación (ajuste del sistema «Quitar animaciones»): sin chorro animado ni vuelta. */
  var reduceMotion: Boolean = false

  private var palette = HourglassPalette.LIGHT

  // Medidas en píxeles (se calculan al cambiar de tamaño).
  private var cx = 0f
  private var cy = 0f
  private var halfW = 0f
  private var halfH = 0f
  private val outer = Path()
  private val inner = Path()
  private val sandTop = Path()
  private val sandBottom = Path()

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val sandPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val streamPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeCap = Paint.Cap.ROUND }
  private var grains: Shader? = null
  private var shine: Shader? = null

  // Vuelta al cambiar de fase.
  private var lastTransitions = -1
  // «Hace mucho»: sin vuelta pendiente al empezar (aunque el móvil acabe de arrancar).
  private var flipStartedAt = Long.MIN_VALUE / 2

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    cx = w / 2f
    cy = h / 2f
    // El reloj mide 2·halfW de ancho y 2·halfH de alto; deja aire para el borde.
    halfW = min(w / 2f * 0.9f, h / 2f / HourglassShape.HALF_HEIGHT_RATIO.toFloat() * 0.93f)
    halfH = halfW * HourglassShape.HALF_HEIGHT_RATIO.toFloat()
    buildOutline(outer, innerWall = false)
    buildOutline(inner, innerWall = true)
    grains = null
    shine = null
  }

  /**
   * Contorno cerrado: lado derecho de arriba abajo y el izquierdo de vuelta.
   * Los extremos se cierran en redondo (`outlineRadiusAt`). Los puntos se
   * reparten más juntos cerca de los extremos, donde la curva gira deprisa.
   */
  private fun buildOutline(path: Path, innerWall: Boolean) {
    path.reset()
    val end = HourglassShape.OUTLINE_END
    val n = 160
    fun v(i: Int): Double {
      val t = -1.0 + 2.0 * i / n // -1..1
      return end * sin(t * Math.PI / 2) // más denso en los extremos
    }
    fun x(v: Double, sign: Int) = cx + sign * (HourglassShape.outlineRadiusAt(v, innerWall) * halfW).toFloat()
    for (i in 0..n) {
      val y = cy + (v(i) * halfH).toFloat()
      if (i == 0) path.moveTo(x(v(i), 1), y) else path.lineTo(x(v(i), 1), y)
    }
    for (i in n downTo 0) path.lineTo(x(v(i), -1), cy + (v(i) * halfH).toFloat())
    path.close()
  }

  override fun onDraw(canvas: Canvas) {
    val s = session ?: return
    if (halfW <= 0f) return
    val now = System.currentTimeMillis()
    val settled = TimerModel.settle(s, now)

    // ¿Ha cambiado de fase desde el último dibujo? → da la vuelta.
    if (lastTransitions >= 0 && settled.transitions > lastTransitions && !reduceMotion) {
      flipStartedAt = SystemClock.uptimeMillis()
    }
    lastTransitions = settled.transitions
    val flip = ((SystemClock.uptimeMillis() - flipStartedAt) / FLIP_MS.toFloat()).coerceIn(0f, 1f)
    val flipping = flip < 1f

    val paused = settled.isPaused
    if (paused) canvas.saveLayerAlpha(0f, 0f, width.toFloat(), height.toFloat(), PAUSED_ALPHA)

    if (flipping) {
      // Media vuelta con el reloj de la fase que acaba (toda la arena abajo).
      // Se encoge un poco al pasar por horizontal para que quepa.
      val eased = (1 - cos(Math.PI * flip)).toFloat() / 2
      val angle = 180f * eased
      val rad = Math.toRadians(angle.toDouble())
      val spanW = abs(cos(rad)) * 2 * halfW + abs(sin(rad)) * 2 * halfH
      val spanH = abs(sin(rad)) * 2 * halfW + abs(cos(rad)) * 2 * halfH
      val scale = min(1.0, min(width * 0.96 / spanW, height * 0.96 / spanH)).toFloat()
      canvas.save()
      canvas.rotate(angle, cx, cy)
      canvas.scale(scale, scale, cx, cy)
      drawHourglass(canvas, fraction = 0.0, stream = false, now = now)
      canvas.restore()
    } else {
      val fraction = remainingFraction(settled, now)
      val running = settled.isRunning
      drawHourglass(canvas, fraction, stream = running && fraction > 0.002, now = now)
    }

    if (paused) canvas.restore()

    // Siguiente fotograma solo si algo se mueve: corriendo (~12 fps) o girando (más fluido).
    if (flipping) postInvalidateOnAnimation()
    else if (settled.isRunning) postInvalidateDelayed(if (reduceMotion) SLOW_FRAME_MS else FRAME_MS)
  }

  /** Lo que queda del tramo actual (1 = recién empezado, 0 = acabado). */
  private fun remainingFraction(s: BackgroundSession, now: Long): Double {
    val duration = s.durations[s.index].toDouble()
    val remaining = when {
      s.isRunning -> (s.phaseEndsAt!! - now).toDouble()
      s.isPaused -> s.remainingMs!!.toDouble()
      else -> 0.0
    }
    return (remaining / duration).coerceIn(0.0, 1.0)
  }

  private fun drawHourglass(canvas: Canvas, fraction: Double, stream: Boolean, now: Long) {
    val p = palette
    val unit = halfW / 30f // 1/30 del semiancho: base de grosores

    // 1. Halo muy suave alrededor: separa el reloj de cualquier fondo (otra app).
    stroke.shader = null
    stroke.color = p.halo
    stroke.strokeWidth = unit * 3.2f
    canvas.drawPath(outer, stroke)

    // 2. Vidrio por detrás: un velo casi transparente.
    fill.shader = null
    fill.color = p.glassFill
    canvas.drawPath(outer, fill)

    // 3. Arena, recortada al hueco del vidrio.
    val levels = HourglassShape.levels(fraction)
    buildSand(levels)
    canvas.save()
    canvas.clipPath(inner)
    sandPaint.shader = grainShader()
    if (fraction > 0.001) canvas.drawPath(sandTop, sandPaint)
    if (fraction < 0.999) canvas.drawPath(sandBottom, sandPaint)
    if (stream) drawStream(canvas, levels, now, unit)
    canvas.restore()

    // 4. Reflejos: una franja de luz a la izquierda de cada bulbo.
    fill.shader = shineShader()
    canvas.save()
    canvas.clipPath(outer)
    canvas.drawRect(cx - halfW * 0.78f, cy - halfH, cx - halfW * 0.48f, cy + halfH, fill)
    canvas.restore()

    // 5. Bordes del vidrio: el contorno y un brillo fino por dentro.
    stroke.color = p.edge
    stroke.strokeWidth = max(1f, unit * 0.9f)
    canvas.drawPath(outer, stroke)
    stroke.color = p.edgeHighlight
    stroke.strokeWidth = max(0.75f, unit * 0.6f)
    canvas.drawPath(inner, stroke)
  }

  /**
   * Las dos manchas de arena. Arriba: de la superficie en «V» al cuello.
   * Abajo: del montón al fondo. Los lados se dejan anchos a propósito: el
   * recorte con el hueco del vidrio (`clipPath(inner)`) les da la forma.
   */
  private fun buildSand(l: SandLevels) {
    val wide = halfW * 1.2f
    val n = 28

    sandTop.reset()
    val rTop = max(HourglassShape.innerRadiusAt(l.top), 1e-3)
    for (i in 0..n) {
      val x = -1.0 + 2.0 * i / n // -1..1 a lo ancho de la superficie
      val dip = l.funnel * (1 - abs(x)).pow(1.25) + roughness(x, 1) * (0.25 + l.funnel)
      val u = (l.top - dip).coerceAtLeast(0.0)
      val px = cx + (x * rTop * halfW * 1.04).toFloat()
      val py = cy - (u * halfH).toFloat()
      if (i == 0) sandTop.moveTo(cx - wide, py)
      sandTop.lineTo(px, py)
    }
    sandTop.lineTo(cx + wide, cy - (l.top * halfH).toFloat())
    sandTop.lineTo(cx + wide, cy)
    sandTop.lineTo(cx - wide, cy)
    sandTop.close()

    sandBottom.reset()
    val rBottom = max(HourglassShape.innerRadiusAt(l.bottom), 1e-3)
    for (i in 0..n) {
      val x = -1.0 + 2.0 * i / n
      val rise = l.pile * (1 - abs(x).pow(1.15)) + roughness(x, 2) * 0.6 * l.pile
      val u = l.bottom - rise
      val px = cx + (x * rBottom * halfW * 1.04).toFloat()
      val py = cy + (u * halfH).toFloat()
      if (i == 0) sandBottom.moveTo(cx - wide, py)
      sandBottom.lineTo(px, py)
    }
    sandBottom.lineTo(cx + wide, cy + (l.bottom * halfH).toFloat())
    sandBottom.lineTo(cx + wide, cy + halfH * 1.02f)
    sandBottom.lineTo(cx - wide, cy + halfH * 1.02f)
    sandBottom.close()
  }

  /** Irregularidad pequeña y fija de la superficie (no tiembla entre fotogramas). */
  private fun roughness(x: Double, seed: Int): Double =
    0.012 * (sin(x * 17.0 + seed * 1.3) * 0.6 + sin(x * 41.0 + seed * 2.1) * 0.4)

  /** Chorro fino del cuello al montón, con unos granos bajando. */
  private fun drawStream(canvas: Canvas, l: SandLevels, now: Long, unit: Float) {
    val top = cy - halfH * 0.01f
    val bottom = cy + ((l.bottom - l.pile) * halfH).toFloat()
    if (bottom <= top) return
    streamPaint.color = palette.stream
    streamPaint.strokeWidth = max(1f, unit * 0.7f)
    canvas.drawLine(cx, top, cx, bottom, streamPaint)
    if (reduceMotion) return
    // Granos: puntos que bajan por el chorro (posición según la hora: sin estado).
    streamPaint.strokeWidth = max(1.2f, unit * 1.1f)
    val phase = (now % GRAIN_PERIOD_MS) / GRAIN_PERIOD_MS.toFloat()
    for (i in 0 until GRAINS) {
      val t = (phase + i / GRAINS.toFloat()) % 1f
      val y = top + (bottom - top) * t * t // aceleran al caer
      val wobble = sin((i * 2.3 + t * 9).toDouble()).toFloat() * unit * 0.35f
      canvas.drawPoint(cx + wobble, y, streamPaint)
    }
  }

  /**
   * Textura de granos: un mosaico pequeño con los tonos de la arena de la
   * app (y alguna mota oscura), multiplicado por un sombreado que la hace
   * redonda (más oscura en los lados, como un cilindro).
   */
  private fun grainShader(): Shader {
    grains?.let { return it }
    val size = 64
    val random = Random(7)
    val tones = palette.grainTones
    val pixels = IntArray(size * size) {
      if (random.nextFloat() < palette.speckRatio) palette.speck else tones[random.nextInt(tones.size)]
    }
    val bitmap = Bitmap.createBitmap(pixels, size, size, Bitmap.Config.ARGB_8888)
    val texture = BitmapShader(bitmap, Shader.TileMode.REPEAT, Shader.TileMode.REPEAT)
    val grain = max(1f, halfW / 110f)
    texture.setLocalMatrix(Matrix().apply { setScale(grain, grain) })
    val roundness = LinearGradient(
      cx - halfW, 0f, cx + halfW, 0f,
      intArrayOf(palette.sandSide, Color.WHITE, Color.WHITE, palette.sandSide),
      floatArrayOf(0f, 0.38f, 0.55f, 1f),
      Shader.TileMode.CLAMP,
    )
    return ComposeShader(texture, roundness, PorterDuff.Mode.MULTIPLY).also { grains = it }
  }

  private fun shineShader(): Shader = shine ?: LinearGradient(
    cx - halfW * 0.78f, 0f, cx - halfW * 0.48f, 0f,
    intArrayOf(Color.TRANSPARENT, palette.shine, Color.TRANSPARENT),
    floatArrayOf(0f, 0.45f, 1f),
    Shader.TileMode.CLAMP,
  ).also { shine = it }

  companion object {
    /** ~12 fotogramas por segundo mientras corre (la arena baja despacio). */
    const val FRAME_MS = 83L
    private const val SLOW_FRAME_MS = 1000L
    const val FLIP_MS = 700L
    private const val GRAINS = 5
    private const val GRAIN_PERIOD_MS = 900L

    /** Opacidad en pausa (de 255): el reloj se queda quieto y algo apagado. */
    private const val PAUSED_ALPHA = 150
  }
}

/**
 * Colores de la ventana flotante: los de la app (apps/mobile/src/theme/theme.ts
 * y la arena de packages/core/src/catalog/contents.ts), con un halo y un
 * velo algo más marcados para que se vea sobre cualquier otra app.
 */
data class HourglassPalette(
  val glassFill: Int,
  val halo: Int,
  val edge: Int,
  val edgeHighlight: Int,
  val shine: Int,
  val stream: Int,
  val grainTones: IntArray,
  val speck: Int,
  val speckRatio: Float,
  val sandSide: Int,
) {
  companion object {
    private fun rgb(r: Int, g: Int, b: Int) = Color.rgb(r, g, b)

    val LIGHT = HourglassPalette(
      glassFill = Color.argb(56, 255, 252, 246),
      halo = Color.argb(46, 255, 255, 255),
      edge = Color.argb(110, 92, 78, 64),
      edgeHighlight = Color.argb(190, 255, 252, 246),
      shine = Color.argb(110, 255, 255, 255),
      stream = Color.argb(242, 176, 148, 112),
      grainTones = intArrayOf(rgb(214, 192, 158), rgb(204, 179, 141), rgb(224, 205, 174), rgb(196, 170, 131), rgb(230, 214, 188)),
      speck = rgb(150, 124, 96),
      speckRatio = 0.025f,
      sandSide = rgb(196, 184, 170),
    )

    val DARK = HourglassPalette(
      glassFill = Color.argb(84, 32, 27, 23),
      halo = Color.argb(60, 0, 0, 0),
      edge = Color.argb(92, 255, 238, 214),
      edgeHighlight = Color.argb(60, 255, 238, 214),
      shine = Color.argb(56, 255, 238, 214),
      stream = Color.argb(242, 170, 142, 106),
      grainTones = intArrayOf(rgb(186, 160, 124), rgb(172, 146, 110), rgb(198, 175, 141), rgb(160, 134, 100), rgb(206, 186, 155)),
      speck = rgb(112, 92, 70),
      speckRatio = 0.025f,
      sandSide = rgb(150, 140, 128),
    )
  }
}
