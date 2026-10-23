package com.sebastianzaruha.relojdearena.background

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Alarma de AlarmManager para el PRÓXIMO aviso (cambio de fase o fin).
 * Despierta a `AlarmReceiver` a su hora aunque la app esté cerrada o el
 * móvil en reposo (Doze); al sonar, `BackgroundTimer.onAlarm` programa la
 * siguiente.
 *
 * 1.8.1: antes había una alarma por aviso (hasta 48) y cada cambio las
 * cancelaba y reprogramaba todas: ~150 llamadas al sistema en cada pausa o
 * volteo. Ahora son 1 o 2.
 *
 *  - Con permiso de alarmas exactas: `setExactAndAllowWhileIdle`, al segundo.
 *  - Sin él (Android 12 con el permiso quitado): `setAndAllowWhileIdle`, que
 *    Android puede retrasar unos minutos. La app avisa de ello en el menú.
 *
 * Un único PendingIntent (mismo requestCode): programarlo otra vez sustituye
 * la alarma anterior.
 */
object TimerAlarms {
  private const val REQUEST_BASE = 7400

  private fun manager(context: Context) = context.getSystemService(AlarmManager::class.java)

  /** ¿Se pueden programar alarmas exactas? (siempre antes de Android 12) */
  fun canScheduleExact(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager(context).canScheduleExactAlarms()

  /** Programa el primero de `events` (los siguientes los encadena `onAlarm`). */
  fun schedule(context: Context, events: List<BackgroundEvent>) {
    cancelLegacy(context)
    val event = events.firstOrNull()
    if (event == null) {
      cancelAll(context)
      return
    }
    val am = manager(context)
    val pi = pendingIntent(context, 0, event) ?: return
    try {
      if (canScheduleExact(context)) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.at, pi)
      } else {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.at, pi)
      }
    } catch (e: SecurityException) {
      // El permiso se quitó justo ahora: mejor tarde que nunca.
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.at, pi)
    }
  }

  fun cancelAll(context: Context) {
    cancelLegacy(context)
    pendingIntent(context, 0, null, PendingIntent.FLAG_NO_CREATE)?.let {
      manager(context).cancel(it)
      it.cancel()
    }
  }

  /**
   * Una sola vez tras actualizar desde la 1.7/1.8 (una alarma por aviso):
   * quita las que pudieran quedar en los huecos 1..47.
   */
  private fun cancelLegacy(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (prefs.getBoolean(KEY_SINGLE_ALARM, false)) return
    val am = manager(context)
    for (i in 1 until TimerModel.MAX_EVENTS) {
      pendingIntent(context, i, null, PendingIntent.FLAG_NO_CREATE)?.let {
        am.cancel(it)
        it.cancel()
      }
    }
    prefs.edit().putBoolean(KEY_SINGLE_ALARM, true).apply()
  }

  private const val PREFS = "reloj_segundo_plano"
  private const val KEY_SINGLE_ALARM = "alarma_unica"


  /** El Intent lleva la hora prevista (`at`): por si Android lo entrega un poco antes. */
  private fun pendingIntent(context: Context, slot: Int, event: BackgroundEvent?, extraFlags: Int = 0): PendingIntent? {
    val intent = Intent(context, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_ALARM)
    if (event != null) intent.putExtra(AlarmReceiver.EXTRA_AT, event.at)
    val flags = PendingIntent.FLAG_IMMUTABLE or
      (if (extraFlags == 0) PendingIntent.FLAG_UPDATE_CURRENT else extraFlags)
    return PendingIntent.getBroadcast(context, REQUEST_BASE + slot, intent, flags)
  }
}
