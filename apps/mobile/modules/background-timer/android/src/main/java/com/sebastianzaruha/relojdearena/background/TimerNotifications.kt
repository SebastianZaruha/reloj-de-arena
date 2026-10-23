package com.sebastianzaruha.relojdearena.background

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.text.format.DateFormat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.util.Date
import java.util.Locale
import kotlin.math.ceil

/**
 * Las notificaciones del reloj:
 *
 *  1. CUENTA ATRÁS (fija mientras corre o está en pausa): título «Trabajo 1/4»
 *     o «Temporizador» y, en marcha, un cronómetro NATIVO en cuenta atrás
 *     (`setUsesChronometer` + `setChronometerCountDown`): Android lo pinta
 *     cada segundo él solo, sin despertar a JavaScript. Botones: Pausar o
 *     Reanudar, y Reiniciar. Canal silencioso (importancia baja).
 *  2. AVISO DE CAMBIO DE FASE: suena `cambio.mp3` y vibra dos veces.
 *  3. AVISO DE FIN: suena `fin.mp3` y vibra como el «éxito» de la app.
 *
 * Sonido y vibración de un aviso los decide su CANAL, y un canal no se puede
 * cambiar después de creado (Android 8+). Por eso hay un canal por
 * combinación de los interruptores del menú: «sonido y vibración», «solo
 * sonido» y «solo vibración». Con los dos apagados el aviso sale en
 * silencio (`setSilent`). Los canales se crean solo cuando hacen falta.
 */
object TimerNotifications {
  const val ID_COUNTDOWN = 7301
  private const val ID_PHASE = 7302
  private const val ID_FINISHED = 7303

  private const val CHANNEL_COUNTDOWN = "reloj.cuenta"
  /** Color de acento (arena), como el de la app. */
  private const val SAND = 0xFFB08850.toInt()

  /**
   * Los dos tipos de aviso. Las vibraciones copian las de la app
   * (expo-haptics en Android): dos impactos medios (43 ms) separados
   * 120 ms en el cambio de fase, y el «éxito» (40 ms, pausa, 40 ms) al final.
   * Si cambias un sonido o una vibración, sube `CHANNEL_VERSION`: Android no
   * deja cambiar un canal que ya existe.
   */
  enum class Alert(val key: String, val sound: String, val pattern: LongArray, val nameKey: String, val fallback: String) {
    PHASE("fase", "reloj_cambio", longArrayOf(0, 43, 77, 43), "channelPhase", "Cambio de fase"),
    FINISHED("fin", "reloj_fin", longArrayOf(0, 40, 100, 40), "channelFinished", "Fin del tiempo"),
  }

  private const val CHANNEL_VERSION = 1

  private fun manager(context: Context) = context.getSystemService(NotificationManager::class.java)

  /** ¿Se pueden mostrar notificaciones? (Android 13+: permiso concedido y no bloqueadas.) */
  fun enabled(context: Context): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled()

  // ─── Canales ─────────────────────────────────────────────────────────────

  private fun alertChannelId(alert: Alert, sound: Boolean, vibration: Boolean): String {
    val variant = when {
      sound && vibration -> "sv"
      sound -> "s"
      else -> "v"
    }
    return "reloj.${alert.key}.$variant.v$CHANNEL_VERSION"
  }

  /** Canal de un aviso según los interruptores. Con los dos apagados vale cualquiera: va en silencio. */
  private fun currentAlertChannel(alert: Alert, state: StoredState): String {
    val silent = !state.sound && !state.vibration
    return alertChannelId(alert, state.sound || silent, state.vibration)
  }

  /**
   * Crea los canales que hacen falta ahora y actualiza el nombre (idioma) de
   * los que ya existían. Crear un canal que ya existe solo cambia su nombre.
   */
  /** Con qué textos y ajustes se crearon los canales (para no repetirlo en cada envío). */
  @Volatile private var channelsKey: String? = null

  fun ensureChannels(context: Context, state: StoredState) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    // Crear canales son varias llamadas al sistema: solo si cambian los
    // textos (idioma) o el canal de aviso que toca (sonido/vibración).
    val key = listOf(
      state.text("channelCountdown", ""),
      state.text("channelFinished", ""),
      state.text("channelPhase", ""),
      state.text("channelSoundOnly", ""),
      state.text("channelVibrationOnly", ""),
      Alert.values().joinToString { currentAlertChannel(it, state) },
    ).joinToString("|")
    if (key == channelsKey) return
    val nm = manager(context)
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_COUNTDOWN, state.text("channelCountdown", "Cuenta atrás"), NotificationManager.IMPORTANCE_LOW).apply {
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
      },
    )
    for (alert in Alert.values()) {
      for ((sound, vibration) in listOf(true to true, true to false, false to true)) {
        val id = alertChannelId(alert, sound, vibration)
        if (id == currentAlertChannel(alert, state) || nm.getNotificationChannel(id) != null) {
          nm.createNotificationChannel(alertChannel(context, state, alert, id, sound, vibration))
        }
      }
    }
    channelsKey = key
  }

  private fun alertChannel(
    context: Context,
    state: StoredState,
    alert: Alert,
    id: String,
    sound: Boolean,
    vibration: Boolean,
  ): NotificationChannel {
    val base = state.text(alert.nameKey, alert.fallback)
    val name = when {
      sound && vibration -> base
      sound -> "$base · ${state.text("channelSoundOnly", "solo sonido")}"
      else -> "$base · ${state.text("channelVibrationOnly", "solo vibración")}"
    }
    return NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH).apply {
      if (sound) {
        val attributes = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
        setSound(soundUri(context, alert), attributes)
      } else {
        setSound(null, null)
      }
      enableVibration(vibration)
      vibrationPattern = if (vibration) alert.pattern else null
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    }
  }

  /** Los mp3 de la app, copiados a res/raw por el plugin (app.plugin.js). */
  private fun soundUri(context: Context, alert: Alert): Uri =
    Uri.parse("android.resource://${context.packageName}/raw/${alert.sound}")

  // ─── Cuenta atrás ────────────────────────────────────────────────────────

  /** Muestra o actualiza la notificación fija de la cuenta. */
  @SuppressLint("MissingPermission")
  fun showCountdown(context: Context, state: StoredState, session: BackgroundSession) {
    if (!enabled(context)) return
    ensureChannels(context, state)
    val builder = NotificationCompat.Builder(context, CHANNEL_COUNTDOWN)
      .setSmallIcon(R.drawable.reloj_notificacion)
      .setColor(SAND)
      .setContentTitle(state.segmentTitle(session.index))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(openAppIntent(context))

    if (session.isRunning) {
      val endsAt = session.phaseEndsAt!!
      val time = DateFormat.getTimeFormat(context).format(Date(endsAt))
      builder
        .setContentText(state.text("until", "Hasta las {t}").replace(TIME_TOKEN, time))
        // El cronómetro cuenta hacia `when`: el instante en que acaba el tramo.
        .setWhen(endsAt)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        .addAction(0, state.text("pause", "Pausar"), ActionReceiver.pendingIntent(context, ActionReceiver.ACTION_PAUSE))
    } else {
      val left = formatDuration(session.remainingMs ?: 0)
      builder
        .setContentText(state.text("pausedLeft", "En pausa · quedan {t}").replace(TIME_TOKEN, left))
        .setShowWhen(false)
        .setUsesChronometer(false)
        .addAction(0, state.text("resume", "Reanudar"), ActionReceiver.pendingIntent(context, ActionReceiver.ACTION_RESUME))
    }
    builder.addAction(0, state.text("restart", "Reiniciar"), ActionReceiver.pendingIntent(context, ActionReceiver.ACTION_RESTART))
    notify(context, ID_COUNTDOWN, builder)
  }

  fun cancelCountdown(context: Context) {
    NotificationManagerCompat.from(context).cancel(ID_COUNTDOWN)
  }

  // ─── Avisos ──────────────────────────────────────────────────────────────

  /** Aviso de cambio de fase: «Descanso 1/4 · A descansar: 5 minutos». */
  fun alertPhase(context: Context, state: StoredState, index: Int) {
    alert(context, state, Alert.PHASE, ID_PHASE, state.segmentTitle(index), state.segmentAlert(index))
  }

  /** Aviso de fin: «Tiempo terminado» o «Ciclos terminados». */
  fun alertFinished(context: Context, state: StoredState) {
    NotificationManagerCompat.from(context).cancel(ID_PHASE)
    alert(
      context,
      state,
      Alert.FINISHED,
      ID_FINISHED,
      state.text("finishedTitle", "Tiempo terminado"),
      state.text("finishedBody", ""),
    )
  }

  /** Quita los avisos (al abrir la app ya no hacen falta). */
  fun dismissAlerts(context: Context) {
    val nm = NotificationManagerCompat.from(context)
    nm.cancel(ID_PHASE)
    nm.cancel(ID_FINISHED)
  }

  @SuppressLint("MissingPermission")
  private fun alert(context: Context, state: StoredState, alert: Alert, id: Int, title: String, body: String) {
    if (!enabled(context)) return
    ensureChannels(context, state)
    val silent = !state.sound && !state.vibration
    val builder = NotificationCompat.Builder(context, currentAlertChannel(alert, state))
      .setSmallIcon(R.drawable.reloj_notificacion)
      .setColor(SAND)
      .setContentTitle(title)
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setContentIntent(openAppIntent(context))
      .setSilent(silent)
    if (body.isNotEmpty()) builder.setContentText(body)
    notify(context, id, builder)
  }

  @SuppressLint("MissingPermission")
  private fun notify(context: Context, id: Int, builder: NotificationCompat.Builder) {
    try {
      NotificationManagerCompat.from(context).notify(id, builder.build())
    } catch (e: SecurityException) {
      // Sin permiso de notificaciones: no se muestra nada (la cuenta sigue igual).
    }
  }

  /** Tocar la notificación abre la app (la misma tarea si ya estaba abierta). */
  private fun openAppIntent(context: Context): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
    } ?: return null
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Marca de las plantillas de texto (`TIME_TOKEN` del core). */
  private const val TIME_TOKEN = "{t}"

  /** «04:59» o «1:04:59», como `formatDuration` del core (redondea hacia arriba). */
  fun formatDuration(ms: Long): String {
    val total = ceil(maxOf(0L, ms) / 1000.0).toLong()
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) String.format(Locale.ROOT, "%d:%02d:%02d", h, m, s) else String.format(Locale.ROOT, "%02d:%02d", m, s)
  }
}
