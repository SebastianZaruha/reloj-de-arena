package com.sebastianzaruha.relojdearena.background

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HourglassShapeTest {
  @Test
  fun `la silueta es la misma que la del core`() {
    // Valores de radiusAt / innerRadiusAt calculados con packages/core (modelo «Clásico»).
    val expected = mapOf(
      0.0 to (0.061116 to 0.037116),
      0.1 to (0.202323 to 0.178323),
      0.3 to (0.671225 to 0.647225),
      0.52 to (0.960683 to 0.936683),
      0.8 to (0.923538 to 0.899538),
      0.95 to (0.581900 to 0.557900),
    )
    for ((u, radii) in expected) {
      assertEquals("radio en u=$u", radii.first, HourglassShape.radiusAt(u), 1e-6)
      assertEquals("hueco en u=$u", radii.second, HourglassShape.innerRadiusAt(u), 1e-6)
      assertEquals("simétrico en u=$u", HourglassShape.radiusAt(u), HourglassShape.radiusAt(-u), 0.0)
    }
  }

  @Test
  fun `al empezar el tramo toda la arena esta arriba y al acabar toda abajo`() {
    val sand = HourglassShape.SAND_AREA
    val full = HourglassShape.levels(1.0)
    assertEquals(sand, HourglassShape.topArea(full.top), sand * 0.002)
    assertEquals(0.0, HourglassShape.bottomArea(full.bottom), sand * 0.002)
    assertEquals(0.0, full.pile, 1e-3)

    val empty = HourglassShape.levels(0.0)
    assertEquals(0.0, empty.top, 1e-3)
    assertEquals(0.0, empty.funnel, 1e-3)
    assertEquals(sand, HourglassShape.bottomArea(empty.bottom), sand * 0.002)
  }

  @Test
  fun `la arena ni se crea ni se pierde y las superficies se mueven en orden`() {
    val sand = HourglassShape.SAND_AREA
    var previous = HourglassShape.levels(1.0)
    for (i in 19 downTo 0) {
      val f = i / 20.0
      val l = HourglassShape.levels(f)
      val total = HourglassShape.topArea(l.top) + HourglassShape.bottomArea(l.bottom)
      assertEquals("total con f=$f", sand, total, sand * 0.004)
      // Arriba baja hacia el cuello; abajo, la base sube hacia el cuello.
      assertTrue("arriba baja (f=$f)", l.top <= previous.top + 1e-9)
      assertTrue("abajo sube (f=$f)", l.bottom <= previous.bottom + 1e-9)
      // Nunca se sale del hueco.
      assertTrue(l.top in 0.0..HourglassShape.INNER_END && l.bottom in 0.0..HourglassShape.INNER_END)
      assertTrue("el embudo no cruza el cuello", l.funnel <= l.top + 1e-9)
      previous = l
    }
  }

  @Test
  fun `media arena deja la superficie por encima del cuello y un monton con pico`() {
    val half = HourglassShape.levels(0.5)
    assertTrue(half.top > 0.2 && half.top < 0.9)
    assertTrue(half.funnel > 0.1)
    assertEquals(HourglassShape.PILE_HEIGHT, half.pile, 1e-9)
  }
}
