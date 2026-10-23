package com.sebastianzaruha.relojdearena.background

import com.sebastianzaruha.relojdearena.background.FloatingEvent.APP_HIDDEN
import com.sebastianzaruha.relojdearena.background.FloatingEvent.APP_VISIBLE
import com.sebastianzaruha.relojdearena.background.FloatingEvent.STATE_CHANGED
import com.sebastianzaruha.relojdearena.background.FloatingEvent.USER_CLOSED
import com.sebastianzaruha.relojdearena.background.TimerStatus.FINISHED
import com.sebastianzaruha.relojdearena.background.TimerStatus.NONE
import com.sebastianzaruha.relojdearena.background.TimerStatus.PAUSED
import com.sebastianzaruha.relojdearena.background.TimerStatus.RUNNING
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FloatingPolicyTest {
  private val hidden = FloatingState()
  private val shown = FloatingState(shown = true)

  private fun inputs(
    status: TimerStatus = RUNNING,
    appVisible: Boolean = false,
    enabled: Boolean = true,
    canDraw: Boolean = true,
  ) = FloatingInputs(enabled, canDraw, appVisible, status)

  @Test
  fun `sale al dejar la app con el reloj en marcha y se va al volver`() {
    val out = FloatingPolicy.reduce(hidden, APP_HIDDEN, inputs())
    assertEquals(shown, out)
    assertEquals(hidden, FloatingPolicy.reduce(out, APP_VISIBLE, inputs(appVisible = true)))
  }

  @Test
  fun `no sale si esta apagada, sin permiso, o el reloj no va`() {
    assertEquals(hidden, FloatingPolicy.reduce(hidden, APP_HIDDEN, inputs(enabled = false)))
    assertEquals(hidden, FloatingPolicy.reduce(hidden, APP_HIDDEN, inputs(canDraw = false)))
    assertEquals(hidden, FloatingPolicy.reduce(hidden, APP_HIDDEN, inputs(status = NONE)))
    // Saliste con el reloj en pausa: no aparece.
    assertEquals(hidden, FloatingPolicy.reduce(hidden, APP_HIDDEN, inputs(status = PAUSED)))
  }

  @Test
  fun `en pausa se queda, en pausa, y se va al terminar`() {
    val paused = FloatingPolicy.reduce(shown, STATE_CHANGED, inputs(status = PAUSED))
    assertEquals(shown, paused)
    assertEquals(hidden, FloatingPolicy.reduce(paused, STATE_CHANGED, inputs(status = FINISHED)))
  }

  @Test
  fun `quitada con la x no vuelve hasta abrir la app`() {
    val closed = FloatingPolicy.reduce(shown, USER_CLOSED, inputs())
    assertFalse(closed.shown)
    assertTrue(closed.dismissed)
    // Cambia de fase o reanudas desde la notificación: sigue quitada.
    assertEquals(closed, FloatingPolicy.reduce(closed, STATE_CHANGED, inputs()))
    // Abres la app y vuelves a salir: aparece otra vez.
    val back = FloatingPolicy.reduce(closed, APP_VISIBLE, inputs(appVisible = true))
    assertEquals(shown, FloatingPolicy.reduce(back, APP_HIDDEN, inputs()))
  }

  @Test
  fun `si reanudas desde la notificacion con la app fuera, aparece`() {
    assertEquals(shown, FloatingPolicy.reduce(hidden, STATE_CHANGED, inputs(status = RUNNING)))
  }

  @Test
  fun `apagarla en el menu o quitar el permiso la oculta aunque se viera`() {
    assertEquals(hidden, FloatingPolicy.reduce(shown, STATE_CHANGED, inputs(enabled = false)))
    assertEquals(hidden, FloatingPolicy.reduce(shown, STATE_CHANGED, inputs(canDraw = false)))
  }

  @Test
  fun `imagen en imagen solo sin permiso y con el reloj en marcha`() {
    assertTrue(FloatingPolicy.pictureInPicture(inputs(canDraw = false)))
    assertFalse(FloatingPolicy.pictureInPicture(inputs(canDraw = true)))
    assertFalse(FloatingPolicy.pictureInPicture(inputs(canDraw = false, enabled = false)))
    assertFalse(FloatingPolicy.pictureInPicture(inputs(canDraw = false, status = PAUSED)))
  }

  @Test
  fun `el estado del reloj pasa las fases que ya acabaron`() {
    val s = BackgroundSession(BackgroundSession.RUNNING, listOf(1000L), false, 0, 5000L, null, 0)
    assertEquals(RUNNING, TimerStatus.of(s, 4999))
    assertEquals(FINISHED, TimerStatus.of(s, 5000))
    assertEquals(NONE, TimerStatus.of(null, 0))
    assertEquals(PAUSED, TimerStatus.of(s.copy(status = BackgroundSession.PAUSED, phaseEndsAt = null, remainingMs = 10), 0))
  }
}
