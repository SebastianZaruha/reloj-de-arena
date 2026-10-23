package com.sebastianzaruha.relojdearena.background

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Al reiniciar el móvil Android borra las alarmas y las notificaciones; al
 * actualizar la app (un APK nuevo) también conviene repasarlas; y si se da
 * el permiso de alarmas exactas, hay que volver a programarlas (exactas).
 */
class RestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED",
      -> BackgroundTimer.restore(context)
    }
  }
}
