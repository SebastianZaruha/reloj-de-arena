package com.sebastianzaruha.relojdearena.background

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * 1.8.1: solo se programa la alarma del PRÓXIMO aviso (antes, una por aviso
 * y todas se reprogramaban en cada pausa o volteo).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TimerAlarmsTest {
  private val context: Context = RuntimeEnvironment.getApplication()
  private val alarms = shadowOf(context.getSystemService(AlarmManager::class.java))

  private fun events(vararg at: Long) =
    at.mapIndexed { i, t -> BackgroundEvent(BackgroundEvent.PHASE_CHANGE, t, i + 1) }

  @Test
  fun programaSoloElProximoAviso() {
    TimerAlarms.schedule(context, events(10_000, 20_000, 30_000, 40_000))
    assertEquals(1, alarms.scheduledAlarms.size)
    assertEquals(10_000L, alarms.scheduledAlarms[0].triggerAtTime)
  }

  @Test
  fun reprogramarSustituyeLaAnterior() {
    TimerAlarms.schedule(context, events(10_000, 20_000))
    TimerAlarms.schedule(context, events(15_000, 25_000))
    assertEquals(1, alarms.scheduledAlarms.size)
    assertEquals(15_000L, alarms.scheduledAlarms[0].triggerAtTime)
  }

  @Test
  fun cancelarLaQuita() {
    TimerAlarms.schedule(context, events(10_000))
    TimerAlarms.cancelAll(context)
    assertEquals(0, alarms.scheduledAlarms.size)
  }

  @Test
  fun quitaLasAlarmasDeLaVersionAnterior() {
    // Como las dejaba la 1.8: una por aviso en los huecos 7400 + i.
    val am = context.getSystemService(AlarmManager::class.java)
    for (slot in 1..3) {
      val intent = Intent(context, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_ALARM)
      val pi = PendingIntent.getBroadcast(context, 7400 + slot, intent, PendingIntent.FLAG_IMMUTABLE)
      am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, 50_000L + slot, pi)
    }
    TimerAlarms.schedule(context, events(10_000))
    assertEquals(1, alarms.scheduledAlarms.size)
  }
}
