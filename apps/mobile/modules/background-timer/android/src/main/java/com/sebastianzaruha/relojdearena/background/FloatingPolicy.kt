package com.sebastianzaruha.relojdearena.background

/**
 * ¿Cuándo se ve la ventana flotante? Una máquina de estados pequeña y pura
 * (sin Android: tests en la JVM). Las reglas, por orden:
 *
 *   1. Apagada en el menú, sin permiso, sin reloj o reloj terminado → oculta.
 *   2. La app a la vista → oculta (y se olvida que la quitaste).
 *   3. La quitaste llevándola a la × → oculta hasta que vuelvas a la app.
 *   4. App fuera y reloj EN MARCHA → visible.
 *   5. App fuera y reloj en pausa → se queda como estaba: si ya se veía
 *      (pausaste desde la ventana o la notificación) sigue, en pausa; si
 *      saliste con el reloj pausado, no aparece.
 *
 * Sin permiso no hay ventana: entonces, si se puede, la app entra en
 * «imagen en imagen» al salir (`pictureInPicture`).
 */
enum class TimerStatus {
  NONE,
  RUNNING,
  PAUSED,
  FINISHED;

  companion object {
    /** Estado de la sesión guardada en `now` (pasando las fases que ya acabaron). */
    fun of(session: BackgroundSession?, now: Long): TimerStatus {
      val s = session?.let { TimerModel.settle(it, now) } ?: return NONE
      return when {
        s.isRunning -> RUNNING
        s.isPaused -> PAUSED
        else -> FINISHED
      }
    }
  }
}

/** Qué ha pasado: la app sale o vuelve, cambia el reloj, o la quitas con la ×. */
enum class FloatingEvent { APP_HIDDEN, APP_VISIBLE, STATE_CHANGED, USER_CLOSED }

data class FloatingInputs(
  /** Interruptor «Ventana flotante» del menú. */
  val enabled: Boolean,
  /** Permiso «Mostrar sobre otras apps». */
  val canDraw: Boolean,
  val appVisible: Boolean,
  val status: TimerStatus,
)

/** `dismissed`: la quitaste con la ×; no vuelve hasta que abras la app. */
data class FloatingState(val shown: Boolean = false, val dismissed: Boolean = false)

object FloatingPolicy {
  private val HIDDEN = FloatingState()

  fun reduce(state: FloatingState, event: FloatingEvent, inputs: FloatingInputs): FloatingState {
    val alive = inputs.status == TimerStatus.RUNNING || inputs.status == TimerStatus.PAUSED
    return when {
      !inputs.enabled || !inputs.canDraw || !alive -> HIDDEN // regla 1
      inputs.appVisible || event == FloatingEvent.APP_VISIBLE -> HIDDEN // regla 2
      event == FloatingEvent.USER_CLOSED || state.dismissed -> FloatingState(dismissed = true) // regla 3
      inputs.status == TimerStatus.RUNNING -> FloatingState(shown = true) // regla 4
      else -> state // regla 5 (en pausa)
    }
  }

  /**
   * ¿Debe la app entrar en imagen en imagen al salir? Solo si la ventana
   * flotante está activada pero falta el permiso, y el reloj va en marcha.
   */
  fun pictureInPicture(inputs: FloatingInputs): Boolean =
    inputs.enabled && !inputs.canDraw && inputs.status == TimerStatus.RUNNING
}
