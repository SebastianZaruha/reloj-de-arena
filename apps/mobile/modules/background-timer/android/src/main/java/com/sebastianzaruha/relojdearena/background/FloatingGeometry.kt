package com.sebastianzaruha.relojdearena.background

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Cuentas de la ventana flotante: tamaño, a qué borde se pega y si está
 * encima de la × de cerrar. Todo en píxeles y sin Android (tests en la JVM).
 *
 * La ventana es un rectángulo de `width × height` cuya esquina de arriba a
 * la izquierda está en (x, y) dentro de la pantalla. `Bounds` es la zona
 * permitida: la pantalla sin la barra de estado ni la de navegación.
 */
data class Bounds(val left: Int, val top: Int, val right: Int, val bottom: Int) {
  val width get() = right - left
  val height get() = bottom - top
}

data class Placement(val x: Int, val y: Int)

enum class Side { LEFT, RIGHT }

object FloatingGeometry {
  /** Alto / ancho de la ventana: el reloj (2,3) más un poco de aire para el borde. */
  const val ASPECT = 2.45f

  /** Anchos permitidos (dp): pequeña por defecto; se cambia pellizcando. */
  const val MIN_WIDTH_DP = 44f
  const val DEFAULT_WIDTH_DP = 58f
  const val MAX_WIDTH_DP = 124f

  /** Separación con el borde de la pantalla al pegarse (dp). */
  const val EDGE_MARGIN_DP = 6f

  /** A partir de esta velocidad (dp/s), un lanzamiento elige el borde aunque no haya cruzado la mitad. */
  const val FLING_DP_PER_S = 900f

  /** Distancia (dp) entre el centro del reloj y el de la × a la que se «engancha». */
  const val CLOSE_RADIUS_DP = 72f

  fun heightFor(width: Int): Int = (width * ASPECT).roundToInt()

  /** Ancho dentro de los límites (y nunca más que la mitad de la pantalla). */
  fun clampWidth(width: Float, density: Float, bounds: Bounds): Int {
    val maxByScreen = min(MAX_WIDTH_DP * density, bounds.width / 2f)
    return min(max(width, MIN_WIDTH_DP * density), max(maxByScreen, MIN_WIDTH_DP * density)).roundToInt()
  }

  /** Mete la ventana dentro de los límites (con el margen). */
  fun clamp(x: Int, y: Int, width: Int, height: Int, bounds: Bounds, margin: Int): Placement {
    val maxX = max(bounds.left + margin, bounds.right - width - margin)
    val maxY = max(bounds.top + margin, bounds.bottom - height - margin)
    return Placement(x.coerceIn(bounds.left + margin, maxX), y.coerceIn(bounds.top + margin, maxY))
  }

  /**
   * Borde al que se pega al soltarla: el más cercano a su centro, salvo que
   * se lance con fuerza hacia un lado (entonces gana la dirección).
   */
  fun sideFor(x: Int, width: Int, bounds: Bounds, velocityX: Float, flingThreshold: Float): Side {
    if (abs(velocityX) >= flingThreshold) return if (velocityX < 0) Side.LEFT else Side.RIGHT
    val center = x + width / 2f
    return if (center < bounds.left + bounds.width / 2f) Side.LEFT else Side.RIGHT
  }

  /** Dónde queda al pegarse a `side`, a la altura `y` (dentro de los límites). */
  fun snap(side: Side, y: Int, width: Int, height: Int, bounds: Bounds, margin: Int): Placement {
    val x = if (side == Side.LEFT) bounds.left + margin else bounds.right - width - margin
    return clamp(x, y, width, height, bounds, margin)
  }

  /**
   * La altura se guarda como fracción (0 = arriba del todo, 1 = abajo del
   * todo) para que valga aunque cambie la pantalla (otro tamaño, girar).
   */
  fun yFraction(y: Int, height: Int, bounds: Bounds, margin: Int): Float {
    val range = bounds.height - height - 2 * margin
    if (range <= 0) return 0f
    return ((y - bounds.top - margin).toFloat() / range).coerceIn(0f, 1f)
  }

  fun yFromFraction(fraction: Float, height: Int, bounds: Bounds, margin: Int): Int {
    val range = max(0, bounds.height - height - 2 * margin)
    return bounds.top + margin + (fraction.coerceIn(0f, 1f) * range).roundToInt()
  }

  /** Cambia el tamaño SIN mover el centro (al pellizcar), y la mete en pantalla. */
  fun resizeAround(p: Placement, width: Int, height: Int, newWidth: Int, newHeight: Int, bounds: Bounds, margin: Int): Placement {
    val cx = p.x + width / 2f
    val cy = p.y + height / 2f
    return clamp((cx - newWidth / 2f).roundToInt(), (cy - newHeight / 2f).roundToInt(), newWidth, newHeight, bounds, margin)
  }

  /** ¿Está el centro del reloj lo bastante cerca de la × para quitarlo al soltar? */
  fun overCloseTarget(centerX: Float, centerY: Float, targetX: Float, targetY: Float, radius: Float): Boolean =
    hypot(centerX - targetX, centerY - targetY) <= radius
}
