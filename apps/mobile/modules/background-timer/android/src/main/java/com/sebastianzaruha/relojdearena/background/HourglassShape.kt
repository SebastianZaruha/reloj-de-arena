package com.sebastianzaruha.relojdearena.background

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * La silueta del reloj y el nivel de la arena, para la ventana flotante.
 *
 * Es la MISMA silueta que dibuja la app: copia de `radiusAt` de
 * packages/core/src/geometry/profile.ts con los números del modelo
 * «Clásico» (packages/core/src/catalog/hourglassModels.ts). Si cambias el
 * modelo allí, cámbialo aquí (hay un test que compara valores).
 *
 * Coordenadas normalizadas, como en el core:
 *   - x en semianchos: -1 = borde izquierdo, 1 = borde derecho.
 *   - u = distancia vertical al cuello, en semialtos: 0 = cuello, 1 = extremo.
 *
 * Aquí no hay nada de Android: solo cuentas (y tests en la JVM).
 */
object HourglassShape {
  /** Alto de cada mitad respecto al semiancho: el reloj mide 2,3 veces su ancho. */
  const val HALF_HEIGHT_RATIO = 2.3
  private const val BULB_CENTER = 0.52
  private const val BULB_RADIUS_Y = 0.49
  private const val NECK_RADIUS = 0.045
  private const val FILLET = 0.14
  private const val EGG = 0.3
  private const val TAPER = 1.9

  /** Grosor del vidrio (en semianchos). */
  const val WALL = 0.024

  /** Grosor del vidrio en vertical (en semialtos): la arena no llega a los extremos. */
  const val WALL_U = WALL / HALF_HEIGHT_RATIO

  /** Hasta dónde llega el hueco de cada bulbo (en u). */
  const val INNER_END = 1 - WALL_U

  /** Fracción de un bulbo que ocupa toda la arena (como `fillRatio` de la arena del core). */
  const val FILL_RATIO = 0.86

  /** Hondura máxima del embudo de arriba (la «V» de la superficie), en u. */
  const val FUNNEL_DEPTH = 0.16

  /** Altura máxima del montón de abajo, en u. */
  const val PILE_HEIGHT = 0.13

  /** Máximo suavizado (Inigo Quilez): une el bulbo y el cuello sin esquina. */
  private fun smoothMax(a: Double, b: Double, k: Double): Double {
    val h = min(1.0, max(0.0, 0.5 + 0.5 * (b - a) / k))
    return a * (1 - h) + b * h + k * h * (1 - h)
  }

  /** Forma de pera del bulbo (t de -1, lado del cuello, a 1, extremo). */
  private fun bulbShape(t: Double): Double {
    if (t <= -1 || t >= 1) return 0.0
    val exponent = if (t < 0) 0.5 * TAPER else 0.5
    return (1 - t * t).pow(exponent) * (1 + EGG * t)
  }

  /** Para que el ancho máximo valga exactamente 1. */
  private val NORM: Double = run {
    val t = (sqrt(1 + 8 * EGG * EGG) - 1) / (4 * EGG)
    bulbShape(t)
  }

  /** Radio exterior a una distancia `u` del cuello. */
  fun radiusAt(u: Double): Double {
    val au = abs(u)
    if (au > 1) return 0.0
    val t = (au - BULB_CENTER) / BULB_RADIUS_Y
    return smoothMax(bulbShape(t) / NORM, NECK_RADIUS, FILLET)
  }

  /** Radio del hueco (donde cabe la arena). */
  fun innerRadiusAt(u: Double): Double = max(0.0, radiusAt(u) - WALL)

  // ─── Cuánta arena cabe: áreas acumuladas ────────────────────────────────
  // La arena de la app es una simulación 2D (granos en una rejilla), así que
  // aquí también contamos ÁREA de la silueta, no volumen.

  private const val STEPS = 400
  private const val DU = INNER_END / STEPS

  /** `cumulative[i]` = área del hueco entre el cuello y u = i·DU. */
  private val cumulative: DoubleArray = DoubleArray(STEPS + 1).also { c ->
    for (i in 1..STEPS) {
      val mid = (i - 0.5) * DU
      c[i] = c[i - 1] + 2 * innerRadiusAt(mid) * DU
    }
  }

  /** Área del hueco entre el cuello y `u` (interpolada). */
  fun areaFromNeck(u: Double): Double {
    val x = min(max(u, 0.0), INNER_END) / DU
    val i = min(x.toInt(), STEPS - 1)
    return cumulative[i] + (cumulative[i + 1] - cumulative[i]) * (x - i)
  }

  /** Área de un bulbo entero. */
  val BULB_AREA: Double get() = cumulative[STEPS]

  /** Área de toda la arena. */
  val SAND_AREA: Double get() = FILL_RATIO * BULB_AREA

  /** Hondura del embudo para una superficie a `u` (más plano cuanto menos arena). */
  fun funnelAt(u: Double): Double = min(FUNNEL_DEPTH, 0.7 * u)

  /** Altura del montón con la base a `u` (crece con la arena que ha caído). */
  fun pileAt(u: Double): Double = min(PILE_HEIGHT, 0.9 * (INNER_END - u))

  /**
   * Área de la arena de arriba si la superficie toca las paredes a `u`. La
   * «V» del embudo le quita un triángulo: base 2·r y altura la hondura.
   */
  fun topArea(u: Double): Double = max(0.0, areaFromNeck(u) - innerRadiusAt(u) * funnelAt(u))

  /** Área de la arena de abajo si la base del montón está a `u`. El pico le suma un triángulo. */
  fun bottomArea(u: Double): Double = BULB_AREA - areaFromNeck(u) + innerRadiusAt(u) * pileAt(u)

  /**
   * Dónde están las superficies cuando queda `fraction` (0..1) del tramo:
   * arriba queda esa parte de la arena y abajo el resto.
   */
  fun levels(fraction: Double): SandLevels {
    val f = min(max(fraction, 0.0), 1.0)
    // topArea crece con u y bottomArea decrece: se busca con bisección.
    val top = solve(f * SAND_AREA, increasing = true) { topArea(it) }
    val bottom = solve((1 - f) * SAND_AREA, increasing = false) { bottomArea(it) }
    return SandLevels(top = top, funnel = funnelAt(top), bottom = bottom, pile = pileAt(bottom))
  }

  /** Busca `u` en [0, INNER_END] tal que `area(u)` = `target` (40 pasos: de sobra). */
  private inline fun solve(target: Double, increasing: Boolean, area: (Double) -> Double): Double {
    var lo = 0.0
    var hi = INNER_END
    repeat(40) {
      val mid = (lo + hi) / 2
      val below = area(mid) < target
      if (below == increasing) lo = mid else hi = mid
    }
    return (lo + hi) / 2
  }
}

/**
 * Las superficies de la arena (todo en u, distancia al cuello):
 *   - `top`: donde la arena de arriba toca las paredes; en el centro baja `funnel`.
 *   - `bottom`: donde el montón de abajo toca las paredes; en el centro sube `pile`.
 */
data class SandLevels(val top: Double, val funnel: Double, val bottom: Double, val pile: Double)
