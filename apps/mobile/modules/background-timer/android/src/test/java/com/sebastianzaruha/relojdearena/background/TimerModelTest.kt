package com.sebastianzaruha.relojdearena.background

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Los mismos casos que packages/core/test/background.test.ts: la copia en
 * Kotlin tiene que dar exactamente los mismos números que el core.
 *
 *   cd apps/mobile/android && ./gradlew :background-timer:testDebugUnitTest
 */
class TimerModelTest {
  private val min = 60_000L
  private val t0 = 1_000_000L

  /** 3 rondas de 10 min de trabajo y 2 de descanso: T D T D T (34 min), en marcha desde t0. */
  private fun running() = BackgroundSession(
    status = BackgroundSession.RUNNING,
    durations = listOf(10, 2, 10, 2, 10).map { it * min },
    repeat = false,
    index = 0,
    phaseEndsAt = t0 + 10 * min,
    remainingMs = null,
    transitions = 0,
  )

  @Test
  fun `programa cada cambio de fase y el fin a su hora exacta`() {
    val events = TimerModel.events(running())
    assertEquals(
      listOf(
        BackgroundEvent(BackgroundEvent.PHASE_CHANGE, t0 + 10 * min, 1),
        BackgroundEvent(BackgroundEvent.PHASE_CHANGE, t0 + 12 * min, 2),
        BackgroundEvent(BackgroundEvent.PHASE_CHANGE, t0 + 22 * min, 3),
        BackgroundEvent(BackgroundEvent.PHASE_CHANGE, t0 + 24 * min, 4),
        BackgroundEvent(BackgroundEvent.FINISHED, t0 + 34 * min, 4),
      ),
      events,
    )
  }

  @Test
  fun `settle pasa las fases como el motor de sesiones`() {
    val s = TimerModel.settle(running(), t0 + 11 * min)
    assertEquals(1, s.index)
    assertEquals(1, s.transitions)
    assertEquals(t0 + 12 * min, s.phaseEndsAt)
    // Justo en el límite ya cuenta como el tramo siguiente.
    assertEquals(1, TimerModel.settle(running(), t0 + 10 * min).index)
    val done = TimerModel.settle(running(), t0 + 34 * min)
    assertTrue(done.isFinished)
    assertEquals(4, done.index)
    assertEquals(4, done.transitions)
  }

  @Test
  fun `al reanudar los avisos se retrasan lo que duro la pausa`() {
    val paused = TimerModel.pause(running(), t0 + 3 * min)
    assertEquals(7 * min, paused.remainingMs)
    assertEquals(emptyList<BackgroundEvent>(), TimerModel.events(paused))
    val resumed = TimerModel.resume(paused, t0 + 8 * min)
    assertEquals(
      listOf(15L, 17, 27, 29, 39).map { t0 + it * min },
      TimerModel.events(resumed).map { it.at },
    )
  }

  @Test
  fun `pausar a mitad del descanso guarda lo que le queda al descanso`() {
    val paused = TimerModel.pause(running(), t0 + 11 * min)
    assertEquals(1, paused.index)
    assertEquals(1 * min, paused.remainingMs)
  }

  @Test
  fun `reiniciar vuelve a la ronda 1 y sigue en marcha`() {
    val t = t0 + 13 * min
    val restarted = TimerModel.restart(TimerModel.pause(running(), t), t)
    assertTrue(restarted.isRunning)
    assertEquals(0, restarted.index)
    assertEquals(t + 10 * min, restarted.phaseEndsAt)
    assertEquals(t + 34 * min, TimerModel.events(restarted).last().at)
  }

  @Test
  fun `pausar o reanudar en el estado equivocado no cambia nada`() {
    val s = running()
    assertSame(s, TimerModel.resume(s, t0 + min))
    val paused = TimerModel.pause(s, t0 + min)
    assertSame(paused, TimerModel.pause(paused, t0 + 2 * min))
    assertSame(paused, TimerModel.settle(paused, t0 + 60 * min))
  }

  @Test
  fun `un plan que se repite no programa avisos sin fin`() {
    val s = running().copy(durations = listOf(min, min), repeat = true, phaseEndsAt = t0 + min)
    val events = TimerModel.events(s)
    assertEquals(TimerModel.MAX_EVENTS, events.size)
    assertTrue(events.none { it.isFinished })
  }

  @Test
  fun `el tiempo restante se escribe como en la app`() {
    assertEquals("04:59", TimerNotifications.formatDuration(4 * min + 58_001))
    assertEquals("1:00:00", TimerNotifications.formatDuration(60 * min))
    assertEquals("00:00", TimerNotifications.formatDuration(-5))
  }
}
