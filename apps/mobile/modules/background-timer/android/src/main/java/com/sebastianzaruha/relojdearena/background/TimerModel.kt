package com.sebastianzaruha.relojdearena.background

import org.json.JSONArray
import org.json.JSONObject

/**
 * La sesión vista desde Android: el MISMO resumen que `BackgroundSession`
 * del core (packages/core/src/background/schedule.ts).
 *
 *   en marcha → `phaseEndsAt`  (cuándo acaba el tramo actual, ms como Date.now())
 *   en pausa  → `remainingMs`  (cuánto le queda al tramo actual)
 *
 * Aquí no hay lógica de ciclos: solo duraciones y sumas. Las funciones de
 * `TimerModel` son una copia en Kotlin de `settleBackground`,
 * `pauseBackground`, `resumeBackground`, `restartBackground` y
 * `backgroundEvents`, que tienen tests en el core. Si cambias una, cambia la
 * otra.
 */
data class BackgroundSession(
  val status: String,
  val durations: List<Long>,
  val repeat: Boolean,
  val index: Int,
  val phaseEndsAt: Long?,
  val remainingMs: Long?,
  val transitions: Int,
) {
  val isRunning get() = status == RUNNING && phaseEndsAt != null
  val isPaused get() = status == PAUSED && remainingMs != null
  val isFinished get() = status == FINISHED

  fun toJson(): JSONObject = JSONObject().apply {
    put("status", status)
    put("durations", JSONArray(durations))
    put("repeat", repeat)
    put("index", index)
    put("phaseEndsAt", phaseEndsAt ?: JSONObject.NULL)
    put("remainingMs", remainingMs ?: JSONObject.NULL)
    put("transitions", transitions)
  }

  companion object {
    const val RUNNING = "running"
    const val PAUSED = "paused"
    const val FINISHED = "finished"

    /** Lee el JSON que manda la app (o el guardado). null si no cuadra. */
    fun fromJson(json: JSONObject?): BackgroundSession? {
      if (json == null) return null
      return try {
        val status = json.getString("status")
        if (status != RUNNING && status != PAUSED && status != FINISHED) return null
        val array = json.getJSONArray("durations")
        val durations = (0 until array.length()).map { array.getLong(it) }
        val index = json.getInt("index")
        if (durations.isEmpty() || durations.any { it <= 0 } || index !in durations.indices) return null
        BackgroundSession(
          status = status,
          durations = durations,
          repeat = json.optBoolean("repeat", false),
          index = index,
          phaseEndsAt = json.optLongOrNull("phaseEndsAt"),
          remainingMs = json.optLongOrNull("remainingMs"),
          transitions = json.optInt("transitions", 0),
        ).takeIf { it.isRunning || it.isPaused || it.isFinished }
      } catch (e: Exception) {
        null
      }
    }
  }
}

/** Un aviso programado: cambio de fase (empieza el tramo `index`) o fin. */
data class BackgroundEvent(val kind: String, val at: Long, val index: Int) {
  val isFinished get() = kind == FINISHED

  companion object {
    const val PHASE_CHANGE = "phase-change"
    const val FINISHED = "finished"

    fun listFromJson(array: JSONArray?): List<BackgroundEvent> {
      if (array == null) return emptyList()
      return (0 until array.length()).mapNotNull { i ->
        val e = array.optJSONObject(i) ?: return@mapNotNull null
        val kind = e.optString("kind")
        if (kind != PHASE_CHANGE && kind != FINISHED) return@mapNotNull null
        BackgroundEvent(kind, e.optLong("at"), e.optInt("index"))
      }
    }
  }
}

/** Aritmética de la sesión (copia de packages/core/src/background/schedule.ts). */
object TimerModel {
  /** Igual que MAX_BACKGROUND_EVENTS del core. */
  const val MAX_EVENTS = 48
  private const val MAX_SETTLE_STEPS = 10_000

  /** Tramo siguiente, o null si se acabó el plan. */
  private fun nextIndex(s: BackgroundSession, index: Int): Int? {
    val next = index + 1
    if (next < s.durations.size) return next
    return if (s.repeat) 0 else null
  }

  /** Pasa los tramos que hayan acabado hasta `now` (cada uno empieza al acabar el anterior). */
  fun settle(s: BackgroundSession, now: Long): BackgroundSession {
    if (!s.isRunning) return s
    var index = s.index
    var transitions = s.transitions
    var end = s.phaseEndsAt!!
    var steps = 0
    while (now >= end && steps++ < MAX_SETTLE_STEPS) {
      val next = nextIndex(s, index)
        ?: return s.copy(status = BackgroundSession.FINISHED, index = index, phaseEndsAt = null, remainingMs = 0, transitions = transitions)
      index = next
      transitions++
      end += s.durations[next]
    }
    return s.copy(index = index, transitions = transitions, phaseEndsAt = end)
  }

  fun pause(s: BackgroundSession, now: Long): BackgroundSession {
    val settled = settle(s, now)
    if (!settled.isRunning) return settled
    return settled.copy(status = BackgroundSession.PAUSED, phaseEndsAt = null, remainingMs = settled.phaseEndsAt!! - now)
  }

  fun resume(s: BackgroundSession, now: Long): BackgroundSession {
    if (!s.isPaused) return s
    return s.copy(status = BackgroundSession.RUNNING, phaseEndsAt = now + s.remainingMs!!, remainingMs = null)
  }

  /** Desde la notificación, reiniciar vuelve a la ronda 1 y SIGUE en marcha. */
  fun restart(s: BackgroundSession, now: Long): BackgroundSession =
    s.copy(status = BackgroundSession.RUNNING, index = 0, phaseEndsAt = now + s.durations[0], remainingMs = null)

  /** Avisos que faltan (ninguno si no está en marcha). */
  fun events(s: BackgroundSession): List<BackgroundEvent> {
    if (!s.isRunning) return emptyList()
    val events = mutableListOf<BackgroundEvent>()
    var index = s.index
    var at = s.phaseEndsAt!!
    while (events.size < MAX_EVENTS) {
      val next = nextIndex(s, index)
      if (next == null) {
        events.add(BackgroundEvent(BackgroundEvent.FINISHED, at, index))
        break
      }
      events.add(BackgroundEvent(BackgroundEvent.PHASE_CHANGE, at, next))
      index = next
      at += s.durations[next]
    }
    return events
  }
}

private fun JSONObject.optLongOrNull(key: String): Long? =
  if (!has(key) || isNull(key)) null else optLong(key)
