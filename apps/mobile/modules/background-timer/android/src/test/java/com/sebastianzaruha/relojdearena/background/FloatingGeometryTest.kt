package com.sebastianzaruha.relojdearena.background

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FloatingGeometryTest {
  // Un móvil de 1080 × 2400 px con barra de estado (80) y de navegación (130).
  private val bounds = Bounds(0, 80, 1080, 2270)
  private val density = 2.75f
  private val margin = 16
  private val fling = FloatingGeometry.FLING_DP_PER_S * density

  @Test
  fun `el ancho se queda entre el minimo y el maximo`() {
    assertEquals(121, FloatingGeometry.clampWidth(10f, density, bounds)) // 44 dp
    assertEquals(160, FloatingGeometry.clampWidth(160f, density, bounds))
    assertEquals(341, FloatingGeometry.clampWidth(5000f, density, bounds)) // 124 dp
    // En una pantalla estrecha, nunca más de la mitad.
    assertEquals(300, FloatingGeometry.clampWidth(5000f, density, Bounds(0, 0, 600, 1000)))
    assertEquals(392, FloatingGeometry.heightFor(160))
  }

  @Test
  fun `al soltarla se pega al borde mas cercano`() {
    assertEquals(Side.LEFT, FloatingGeometry.sideFor(300, 160, bounds, 0f, fling))
    assertEquals(Side.RIGHT, FloatingGeometry.sideFor(500, 160, bounds, 0f, fling))
    val p = FloatingGeometry.snap(Side.RIGHT, 1000, 160, 392, bounds, margin)
    assertEquals(Placement(1080 - 160 - margin, 1000), p)
    assertEquals(Placement(margin, 1000), FloatingGeometry.snap(Side.LEFT, 1000, 160, 392, bounds, margin))
  }

  @Test
  fun `un lanzamiento fuerte elige el borde aunque no haya cruzado la mitad`() {
    assertEquals(Side.RIGHT, FloatingGeometry.sideFor(100, 160, bounds, fling + 1, fling))
    assertEquals(Side.LEFT, FloatingGeometry.sideFor(900, 160, bounds, -fling, fling))
    // Uno flojo no cuenta.
    assertEquals(Side.LEFT, FloatingGeometry.sideFor(100, 160, bounds, fling / 2, fling))
  }

  @Test
  fun `nunca se sale de la pantalla ni tapa las barras del sistema`() {
    assertEquals(Placement(margin, 80 + margin), FloatingGeometry.clamp(-500, -500, 160, 392, bounds, margin))
    assertEquals(
      Placement(1080 - 160 - margin, 2270 - 392 - margin),
      FloatingGeometry.clamp(5000, 5000, 160, 392, bounds, margin),
    )
    assertEquals(80 + margin, FloatingGeometry.snap(Side.LEFT, 0, 160, 392, bounds, margin).y)
  }

  @Test
  fun `la altura se guarda como fraccion y se recupera igual`() {
    val y = 900
    val f = FloatingGeometry.yFraction(y, 392, bounds, margin)
    assertEquals(y, FloatingGeometry.yFromFraction(f, 392, bounds, margin))
    assertEquals(0f, FloatingGeometry.yFraction(0, 392, bounds, margin), 0f)
    assertEquals(1f, FloatingGeometry.yFraction(9999, 392, bounds, margin), 0f)
    // En otra pantalla, la misma fracción cae en el mismo sitio relativo.
    val small = Bounds(0, 0, 720, 1280)
    assertEquals(0 + margin, FloatingGeometry.yFromFraction(0f, 392, small, margin))
    assertEquals(1280 - 392 - margin, FloatingGeometry.yFromFraction(1f, 392, small, margin))
  }

  @Test
  fun `al pellizcar crece o encoge sin mover el centro`() {
    val p = Placement(400, 1000)
    val bigger = FloatingGeometry.resizeAround(p, 160, 392, 240, 588, bounds, margin)
    assertEquals(400 + 80, bigger.x + 120)
    assertEquals(1000 + 196, bigger.y + 294)
    // Pegada al borde, crecer no la saca de la pantalla.
    val atEdge = FloatingGeometry.resizeAround(Placement(1080 - 160 - margin, 1000), 160, 392, 300, 735, bounds, margin)
    assertEquals(1080 - 300 - margin, atEdge.x)
  }

  @Test
  fun `la x de cerrar engancha dentro de su radio`() {
    val r = FloatingGeometry.CLOSE_RADIUS_DP * density
    assertTrue(FloatingGeometry.overCloseTarget(540f, 2100f, 540f, 2100f + r - 1, r))
    assertFalse(FloatingGeometry.overCloseTarget(540f, 1700f, 540f, 2100f, r))
  }
}
