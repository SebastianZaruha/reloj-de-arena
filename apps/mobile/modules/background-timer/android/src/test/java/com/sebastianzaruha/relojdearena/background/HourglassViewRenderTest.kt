package com.sebastianzaruha.relojdearena.background

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.SystemClock
import android.view.View
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowSystemClock
import java.io.File
import java.io.FileOutputStream
import java.time.Duration
import kotlin.math.roundToInt

/**
 * Dibuja el reloj de la ventana flotante DE VERDAD (Canvas de Android en la
 * JVM, con Robolectric) y comprueba algunos píxeles: fondo transparente,
 * arena arriba al empezar y abajo al acabar, más apagado en pausa.
 *
 * Con `-Preloj.capturas=/una/carpeta` guarda además los PNG (reloj suelto en
 * claro y oscuro, a media vuelta y encima de una app de ejemplo):
 *
 *   ./gradlew :background-timer:testDebugUnitTest -Preloj.capturas=/tmp/capturas
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h914dp-xxhdpi")
class HourglassViewRenderTest {
  private val context = RuntimeEnvironment.getApplication()
  private val out: File? = System.getProperty("reloj.capturas")?.let { File(it).apply { mkdirs() } }

  /** Un tramo de 25 min al que le queda `fraction`. */
  private fun session(fraction: Double, paused: Boolean = false, transitions: Int = 0): BackgroundSession {
    val duration = 25 * 60_000L
    val left = (duration * fraction).toLong()
    val now = System.currentTimeMillis()
    return BackgroundSession(
      status = if (paused) BackgroundSession.PAUSED else BackgroundSession.RUNNING,
      durations = listOf(duration, 5 * 60_000L),
      repeat = false,
      index = 0,
      phaseEndsAt = if (paused) null else now + left,
      remainingMs = if (paused) left else null,
      transitions = transitions,
    )
  }

  private fun view(width: Int, s: BackgroundSession, dark: Boolean = false): HourglassView =
    HourglassView(context).apply {
      this.dark = dark
      session = s
      val height = FloatingGeometry.heightFor(width)
      measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
      layout(0, 0, width, height)
    }

  private fun render(v: View): Bitmap {
    val bitmap = Bitmap.createBitmap(v.width, v.height, Bitmap.Config.ARGB_8888)
    v.draw(Canvas(bitmap))
    return bitmap
  }

  private fun save(bitmap: Bitmap, name: String) {
    val dir = out ?: return
    FileOutputStream(File(dir, name)).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
  }

  /** Píxel a una altura `v` (-1 arriba, 1 abajo), algo a la derecha del centro (lejos del chorro). */
  private fun pixelAt(bitmap: Bitmap, v: Double): Int {
    val halfW = bitmap.width / 2f * 0.9f
    val halfH = halfW * HourglassShape.HALF_HEIGHT_RATIO.toFloat()
    return bitmap.getPixel((bitmap.width / 2f + halfW * 0.3f).roundToInt(), (bitmap.height / 2f + v * halfH).roundToInt())
  }

  private fun isSand(color: Int) =
    Color.alpha(color) > 200 && Color.red(color) > Color.blue(color) + 20

  @Test
  fun `fondo transparente y la arena donde toca`() {
    val start = render(view(480, session(1.0)))
    assertEquals("las esquinas no se pintan", 0, Color.alpha(start.getPixel(2, 2)))
    assertTrue("al empezar hay arena arriba", isSand(pixelAt(start, -0.55)))
    assertTrue("y abajo no", !isSand(pixelAt(start, 0.7)))
    save(start, "flotante-claro-lleno.png")

    val end = render(view(480, session(0.02)))
    assertTrue("al final la arena está abajo", isSand(pixelAt(end, 0.8)))
    assertTrue("y arriba ya no", !isSand(pixelAt(end, -0.55)))
  }

  @Test
  fun `en pausa el reloj se apaga un poco`() {
    val running = render(view(480, session(0.6)))
    val paused = render(view(480, session(0.6, paused = true)))
    val a = Color.alpha(pixelAt(running, 0.85))
    val b = Color.alpha(pixelAt(paused, 0.85))
    assertTrue("en pausa es más transparente ($b < $a)", b < a)
    save(paused, "flotante-claro-pausa.png")
  }

  @Test
  fun `capturas en claro y oscuro, y la vuelta al cambiar de fase`() {
    for (dark in listOf(false, true)) {
      val name = if (dark) "oscuro" else "claro"
      save(render(view(480, session(0.62), dark)), "flotante-$name-en-marcha.png")
    }
    // A media vuelta: se dibuja una vez en la fase 0 y luego con la fase ya cambiada.
    val v = view(480, session(0.0005))
    render(v)
    v.session = session(1.0, transitions = 1)
    render(v) // aquí empieza la vuelta
    ShadowSystemClock.advanceBy(Duration.ofMillis(HourglassView.FLIP_MS / 2))
    val mid = render(v)
    assertEquals(0, Color.alpha(mid.getPixel(2, 2)))
    save(mid, "flotante-claro-dando-la-vuelta.png")
    SystemClock.sleep(0)
  }

  @Test
  fun `capturas encima de otra app`() {
    if (out == null) return
    for (dark in listOf(false, true)) {
      val name = if (dark) "oscuro" else "claro"
      save(phoneMock(dark, dragging = false), "sobre-otra-app-$name.png")
    }
    save(phoneMock(dark = false, dragging = true), "sobre-otra-app-quitando.png")
  }

  /**
   * Una pantalla de móvil de 1080 × 2400 con una app de mensajes inventada
   * y la ventana flotante en su sitio por defecto (derecha, 32 % de alto).
   * Con `dragging`, la ventana va camino de la × de abajo.
   */
  private fun phoneMock(dark: Boolean, dragging: Boolean): Bitmap {
    val w = 1080
    val h = 2400
    val density = 3f
    val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(bitmap)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    val bg = if (dark) Color.rgb(18, 18, 20) else Color.rgb(250, 250, 252)
    val bar = if (dark) Color.rgb(32, 33, 36) else Color.rgb(233, 236, 241)
    val ink = if (dark) Color.rgb(70, 72, 78) else Color.rgb(205, 209, 216)
    val accent = Color.rgb(64, 120, 230)
    c.drawColor(bg)
    p.color = bar
    c.drawRect(0f, 0f, w.toFloat(), 300f, p)
    p.color = ink
    c.drawRoundRect(RectF(60f, 160f, 520f, 210f), 25f, 25f, p)
    // Conversaciones: avatar y dos líneas.
    for (i in 0 until 11) {
      val top = 360f + i * 180f
      p.color = if (i % 3 == 0) accent else ink
      c.drawCircle(120f, top + 60f, 52f, p)
      p.color = ink
      c.drawRoundRect(RectF(210f, top + 22f, 210f + 420f + (i * 53 % 200), top + 56f), 17f, 17f, p)
      c.drawRoundRect(RectF(210f, top + 78f, 210f + 600f - (i * 71 % 260), top + 104f), 13f, 13f, p)
    }
    p.color = accent
    c.drawRoundRect(RectF(w - 250f, h - 380f, w - 70f, h - 200f), 50f, 50f, p)

    // La ventana flotante, como la pone FloatingWindow.
    val bounds = Bounds(0, 72, w, h - 66)
    val margin = (FloatingGeometry.EDGE_MARGIN_DP * density).roundToInt()
    val width = FloatingGeometry.clampWidth(FloatingGeometry.DEFAULT_WIDTH_DP * density, density, bounds)
    val height = FloatingGeometry.heightFor(width)
    var place = FloatingGeometry.snap(Side.RIGHT, FloatingGeometry.yFromFraction(0.32f, height, bounds, margin), width, height, bounds, margin)
    if (dragging) {
      val size = (CloseTargetView.SIZE_DP * density).roundToInt()
      val target = CloseTargetView(context).apply {
        measure(View.MeasureSpec.makeMeasureSpec(size, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(size, View.MeasureSpec.EXACTLY))
        layout(0, 0, size, size)
      }
      val tx = (w - size) / 2f
      val ty = bounds.bottom - size - 24 * density
      c.save()
      c.translate(tx, ty)
      target.draw(c)
      c.restore()
      place = Placement((w / 2f + 40 - width / 2f).roundToInt(), (ty - height * 0.75f).roundToInt())
    }
    val hourglass = view(width, session(0.62), dark)
    c.save()
    c.translate(place.x.toFloat(), place.y.toFloat())
    hourglass.draw(c)
    c.restore()
    return bitmap
  }
}
