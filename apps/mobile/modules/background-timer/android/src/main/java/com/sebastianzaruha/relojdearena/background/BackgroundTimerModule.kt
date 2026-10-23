package com.sebastianzaruha.relojdearena.background

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Puente con JavaScript (Expo Modules API). La app lo usa a través de
 * `apps/mobile/modules/background-timer/index.ts`; aquí solo se reparte el
 * trabajo a `BackgroundTimer`, `TimerNotifications` y `TimerAlarms`.
 *
 * Todas las funciones son síncronas y rápidas (no hace falta AsyncFunction).
 */
class BackgroundTimerModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "Sin contexto de Android" }

  override fun definition() = ModuleDefinition {
    Name("BackgroundTimer")

    // { seq }: se ha pausado, reanudado o reiniciado desde la notificación
    // (o desde la ventana flotante). { active }: entra o sale de imagen en imagen.
    Events("onChange", "onPictureInPicture")

    OnCreate {
      BackgroundTimer.listener = { seq -> sendEvent("onChange", mapOf("seq" to seq)) }
      PictureInPicture.listener = { active -> sendEvent("onPictureInPicture", mapOf("active" to active)) }
    }
    OnDestroy {
      BackgroundTimer.listener = null
      PictureInPicture.listener = null
    }
    OnActivityEntersForeground {
      BackgroundTimer.appInForeground = true
    }
    OnActivityEntersBackground {
      BackgroundTimer.appInForeground = false
    }

    /** Estado de la app → notificación y alarmas. false = envío antiguo (ver BackgroundTimer.sync). */
    Function("sync") { json: String ->
      BackgroundTimer.sync(context, json)
    }

    /** Sesión guardada y `seq` (JSON), o null si nunca se ha guardado nada. */
    Function("getState") {
      BackgroundTimer.snapshot(context)
    }

    /** La app dice si está a la vista; al volver, quita los avisos ya vistos. */
    Function("setForeground") { active: Boolean ->
      BackgroundTimer.appInForeground = active
      if (active) TimerNotifications.dismissAlerts(context)
    }

    Function("getPermissions") {
      mapOf(
        "notifications" to TimerNotifications.enabled(context),
        "exactAlarms" to TimerAlarms.canScheduleExact(context),
        "overlay" to FloatingWindow.canDraw(context),
      )
    }

    /** ¿Está la app ahora mismo en imagen en imagen? */
    Function("isInPictureInPicture") {
      PictureInPicture.isActive()
    }

    /** Ajustes del sistema → «Mostrar sobre otras apps» de esta app (1.8). */
    Function("openOverlaySettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        start(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
      }
    }

    /** Ajustes del sistema → Notificaciones de esta app. */
    Function("openNotificationSettings") {
      val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      start(intent)
    }

    /** Ajustes del sistema → «Alarmas y recordatorios» (Android 12+). */
    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        start(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")))
      }
    }
  }

  private fun start(intent: Intent) {
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
