package com.sebastianzaruha.relojdearena.background

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Lo despierta AlarmManager en cada cambio de fase y al final (ver TimerAlarms). */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_ALARM) return
    BackgroundTimer.onAlarm(context, intent.getLongExtra(EXTRA_AT, 0L))
  }

  companion object {
    const val ACTION_ALARM = "com.sebastianzaruha.relojdearena.background.ALARM"
    const val EXTRA_AT = "at"
  }
}
