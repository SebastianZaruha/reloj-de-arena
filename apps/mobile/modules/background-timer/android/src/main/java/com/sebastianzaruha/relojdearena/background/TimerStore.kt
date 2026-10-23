package com.sebastianzaruha.relojdearena.background

import android.content.Context
import org.json.JSONObject

/**
 * Lo último que envió la app (`BackgroundPayload` del core: sesión, textos
 * traducidos e interruptores de sonido y vibración), guardado en
 * SharedPreferences para que la notificación y las alarmas sigan
 * funcionando con la app cerrada o tras reiniciar el móvil.
 *
 * Cuando algo cambia DESDE ANDROID (un botón de la notificación), se cambia
 * solo la parte `session` y sube `seq`. La app compara `seq` con el último
 * que conoce para saber que tiene que ponerse al día.
 */
class StoredState(val payload: JSONObject, val seq: Int) {
  val session: BackgroundSession? get() = BackgroundSession.fromJson(payload.optJSONObject("session"))

  /** Avisos que calculó el core (solo valen tal cual vienen de la app). */
  val events: List<BackgroundEvent> get() = BackgroundEvent.listFromJson(payload.optJSONArray("events"))

  val sound: Boolean get() = payload.optBoolean("sound", true)
  val vibration: Boolean get() = payload.optBoolean("vibration", true)

  /** Texto traducido (o el de reserva si faltara). */
  fun text(key: String, fallback: String): String =
    payload.optJSONObject("texts")?.optString(key)?.takeIf { it.isNotEmpty() } ?: fallback

  /** Título del tramo («Trabajo 1/4», «Temporizador»...). */
  fun segmentTitle(index: Int): String =
    payload.optJSONArray("segments")?.optJSONObject(index)?.optString("title")?.takeIf { it.isNotEmpty() }
      ?: text("appName", "Reloj de Arena")

  /** Texto del aviso al empezar el tramo («A descansar: 5 minutos»). */
  fun segmentAlert(index: Int): String =
    payload.optJSONArray("segments")?.optJSONObject(index)?.optString("alert") ?: ""

  /** Copia con otra sesión (los avisos del core ya no valen: se recalculan). */
  fun withSession(session: BackgroundSession?, newSeq: Int = seq): StoredState {
    val copy = JSONObject(payload.toString())
    copy.put("session", session?.toJson() ?: JSONObject.NULL)
    copy.remove("events")
    return StoredState(copy, newSeq)
  }
}

object TimerStore {
  private const val PREFS = "reloj_segundo_plano"
  private const val KEY_PAYLOAD = "payload"
  private const val KEY_SEQ = "seq"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun load(context: Context): StoredState? {
    val prefs = prefs(context)
    val raw = prefs.getString(KEY_PAYLOAD, null) ?: return null
    return try {
      StoredState(JSONObject(raw), prefs.getInt(KEY_SEQ, 0))
    } catch (e: Exception) {
      null
    }
  }

  fun seq(context: Context): Int = prefs(context).getInt(KEY_SEQ, 0)

  /**
   * Guarda YA (commit, no apply): un receptor puede morir justo después y
   * lo guardado es lo que verá la app al abrirse.
   */
  fun save(context: Context, state: StoredState) {
    prefs(context).edit().putString(KEY_PAYLOAD, state.payload.toString()).putInt(KEY_SEQ, state.seq).commit()
  }
}
