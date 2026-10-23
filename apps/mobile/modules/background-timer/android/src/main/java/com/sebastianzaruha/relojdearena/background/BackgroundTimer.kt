package com.sebastianzaruha.relojdearena.background

import android.content.Context
import org.json.JSONObject

/**
 * El «director» del segundo plano: junta el estado guardado, las alarmas y
 * las notificaciones. Lo llaman el módulo de Expo (la app), los botones de
 * la notificación, las alarmas y el reinicio del móvil.
 *
 *   app (JS) ── sync(JSON) ──▶ guarda · programa los avisos del core · notificación
 *   botón    ── onAction  ──▶ pausa/reanuda/reinicia (TimerModel) · seq+1 · avisa a la app
 *   alarma   ── onAlarm   ──▶ pasa de fase (TimerModel.settle) · notificación · aviso
 *   reinicio ── restore   ──▶ vuelve a poner alarmas y notificación
 *
 * Todo es rápido (leer/escribir unas preferencias y pintar una notificación),
 * así que se hace directamente en el receptor, sin servicios en primer plano.
 */
object BackgroundTimer {
  /**
   * ¿Está la app a la vista? Entonces los avisos los da la propia app
   * (sonido y vibración de siempre) y aquí solo se actualiza la cuenta.
   * Al morir el proceso vuelve a false, que es lo correcto.
   */
  @Volatile var appInForeground = false

  /** Un aviso que se pasó hace más de esto (móvil apagado, app forzada a parar) ya no suena. */
  private const val STALE_ALERT_MS = 15 * 60_000L

  /** Lo pone el módulo de Expo para avisar a la app de cambios hechos aquí. */
  @Volatile var listener: ((seq: Int) -> Unit)? = null

  /**
   * Lo que manda la app. Devuelve false si el envío es anterior a un cambio
   * hecho desde la notificación (la app aún no lo conocía): no se aplica y
   * la app debe leer `snapshot` y ponerse al día.
   */
  fun sync(context: Context, json: String): Boolean {
    val payload = JSONObject(json)
    val seq = TimerStore.seq(context)
    if (payload.optInt("seenSeq", 0) < seq) return false
    // Si la app avisa justo después de un cambio de fase, la alarma de ese
    // cambio aún no ha sonado y el envío la cancelaría: se atiende antes.
    TimerStore.load(context)?.let { advance(context, it, System.currentTimeMillis()) }
    val state = StoredState(payload, seq)
    TimerStore.save(context, state)
    render(context, state, state.session, state.events)
    return true
  }

  /** Un botón de la notificación (ActionReceiver). */
  fun onAction(context: Context, action: String) {
    val state = TimerStore.load(context) ?: return
    val session = state.session
    if (session == null || session.isFinished) {
      TimerNotifications.cancelCountdown(context)
      return
    }
    val now = System.currentTimeMillis()
    val next = when (action) {
      ActionReceiver.ACTION_PAUSE -> TimerModel.pause(session, now)
      ActionReceiver.ACTION_RESUME -> TimerModel.resume(session, now)
      ActionReceiver.ACTION_RESTART -> TimerModel.restart(session, now)
      else -> return
    }
    val updated = state.withSession(next, state.seq + 1)
    TimerStore.save(context, updated)
    if (next.isFinished) TimerNotifications.alertFinished(context, updated)
    render(context, updated, next, TimerModel.events(next))
    listener?.invoke(updated.seq)
  }

  /** Ha llegado la hora de un aviso (AlarmReceiver). `at` es la hora prevista. */
  fun onAlarm(context: Context, at: Long) {
    val state = TimerStore.load(context) ?: return
    // Si Android la entrega unos milisegundos antes, cuenta como a su hora.
    val updated = advance(context, state, maxOf(System.currentTimeMillis(), at))
    val session = updated.session ?: return
    // Las alarmas que faltan ya están programadas: solo cambia la notificación.
    if (session.isRunning || session.isPaused) TimerNotifications.showCountdown(context, updated, session)
  }

  /**
   * Pasa las fases que hayan acabado hasta `now` y da su aviso (si la app no
   * está a la vista y no es un aviso de hace mucho). Devuelve el estado nuevo.
   * `seq` no cambia: es el paso natural del tiempo y la app calcula lo mismo.
   */
  private fun advance(context: Context, state: StoredState, now: Long): StoredState {
    val session = state.session ?: return state
    val settled = TimerModel.settle(session, now)
    if (settled == session) return state
    val updated = state.withSession(settled)
    TimerStore.save(context, updated)
    // ¿Cuándo fue el último aviso que se ha pasado? (p. ej. el móvil estuvo apagado)
    val lastAt = TimerModel.events(session).lastOrNull { it.at <= now }?.at ?: now
    val alerts = !appInForeground && now - lastAt < STALE_ALERT_MS
    if (settled.isFinished) {
      TimerAlarms.cancelAll(context)
      TimerNotifications.cancelCountdown(context)
      if (alerts) TimerNotifications.alertFinished(context, updated)
    } else if (alerts && settled.transitions > session.transitions) {
      TimerNotifications.alertPhase(context, updated, settled.index)
    }
    return updated
  }

  /**
   * Tras reiniciar el móvil (se borran las alarmas y las notificaciones), al
   * actualizar la app o al cambiar el permiso de alarmas exactas.
   */
  fun restore(context: Context) {
    val state = advance(context, TimerStore.load(context) ?: return, System.currentTimeMillis())
    val session = state.session ?: return
    render(context, state, session, TimerModel.events(session))
  }

  /** Para la app: la sesión guardada y el último `seq`, en JSON. */
  fun snapshot(context: Context): String? {
    val state = TimerStore.load(context) ?: return null
    return JSONObject()
      .put("session", state.session?.toJson() ?: JSONObject.NULL)
      .put("seq", state.seq)
      .toString()
  }

  /** Pone alarmas y notificación de acuerdo con la sesión. */
  private fun render(context: Context, state: StoredState, session: BackgroundSession?, events: List<BackgroundEvent>) {
    when {
      session == null || session.isFinished -> {
        TimerAlarms.cancelAll(context)
        TimerNotifications.cancelCountdown(context)
      }
      session.isRunning -> {
        TimerAlarms.schedule(context, events)
        TimerNotifications.showCountdown(context, state, session)
      }
      else -> {
        TimerAlarms.cancelAll(context)
        TimerNotifications.showCountdown(context, state, session)
      }
    }
  }
}
