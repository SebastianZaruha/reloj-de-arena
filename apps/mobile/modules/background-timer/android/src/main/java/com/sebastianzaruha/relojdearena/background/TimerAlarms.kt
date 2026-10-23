package com.sebastianzaruha.relojdearena.background

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Alarmas de AlarmManager: una por aviso (cada cambio de fase y el fin).
 * Despiertan a `AlarmReceiver` a su hora aunque la app esté cerrada o el
 * móvil en reposo (Doze).
 *
 *  - Con permiso de alarmas exactas: `setExactAndAllowWhileIdle`, al segundo.
 *  - Sin él (Android 12 con el permiso quitado): `setAndAllowWhileIdle`, que
 *    Android puede retrasar unos minutos. La app avisa de ello en el menú.
 *
 * Cada aviso tiene su PendingIntent (requestCode = posición en la lista);
 * cancelar es recorrer los MAX_EVENTS posibles.
 */
object TimerAlarms {
  private const val REQUEST_BASE = 7400

  private fun manager(context: Context) = context.getSystemService(AlarmManager::class.java)

  /** ¿Se pueden programar alarmas exactas? (siempre antes de Android 12) */
  fun canScheduleExact(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager(context).canScheduleExactAlarms()

  /** Cambia todas las alarmas por las de `events`. */
  fun schedule(context: Context, events: List<BackgroundEvent>) {
    cancelAll(context)
    val am = manager(context)
    val exact = canScheduleExact(context)
    events.take(TimerModel.MAX_EVENTS).forEachIndexed { i, event ->
      val pi = pendingIntent(context, i, event) ?: return@forEachIndexed
      try {
        if (exact) {
          am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.at, pi)
        } else {
          am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.at, pi)
        }
      } catch (e: SecurityException) {
        // El permiso se quitó justo ahora: mejor tarde que nunca.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, event.at, pi)
      }
    }
  }

  fun cancelAll(context: Context) {
    val am = manager(context)
    for (i in 0 until TimerModel.MAX_EVENTS) {
      pendingIntent(context, i, null, PendingIntent.FLAG_NO_CREATE)?.let {
        am.cancel(it)
        it.cancel()
      }
    }
  }

  /** El Intent lleva la hora prevista (`at`): por si Android lo entrega un poco antes. */
  private fun pendingIntent(context: Context, slot: Int, event: BackgroundEvent?, extraFlags: Int = 0): PendingIntent? {
    val intent = Intent(context, AlarmReceiver::class.java).setAction(AlarmReceiver.ACTION_ALARM)
    if (event != null) intent.putExtra(AlarmReceiver.EXTRA_AT, event.at)
    val flags = PendingIntent.FLAG_IMMUTABLE or
      (if (extraFlags == 0) PendingIntent.FLAG_UPDATE_CURRENT else extraFlags)
    return PendingIntent.getBroadcast(context, REQUEST_BASE + slot, intent, flags)
  }
}
