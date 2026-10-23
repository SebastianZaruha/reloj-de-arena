package com.sebastianzaruha.relojdearena.background

import android.content.Context

/**
 * Lo que recuerda la ventana flotante (aparte de la sesión): si se ve o la
 * quitaste, en qué borde y a qué altura estaba y su tamaño. Se guarda para
 * que tras morir el proceso (Android lo cierra para ahorrar memoria) la
 * siguiente alarma la vuelva a poner donde estaba.
 */
object FloatingStore {
  private const val PREFS = "reloj_flotante"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun state(context: Context): FloatingState {
    val p = prefs(context)
    return FloatingState(shown = p.getBoolean("shown", false), dismissed = p.getBoolean("dismissed", false))
  }

  fun saveState(context: Context, state: FloatingState) {
    if (state == state(context)) return
    prefs(context).edit().putBoolean("shown", state.shown).putBoolean("dismissed", state.dismissed).apply()
  }

  /** Por defecto, a la derecha y algo por encima del centro. */
  fun side(context: Context): Side = if (prefs(context).getString("side", "right") == "left") Side.LEFT else Side.RIGHT

  fun yFraction(context: Context): Float = prefs(context).getFloat("y", 0.32f)

  fun widthDp(context: Context): Float = prefs(context).getFloat("width", FloatingGeometry.DEFAULT_WIDTH_DP)

  fun savePlace(context: Context, side: Side, yFraction: Float, widthDp: Float) {
    prefs(context).edit()
      .putString("side", if (side == Side.LEFT) "left" else "right")
      .putFloat("y", yFraction)
      .putFloat("width", widthDp)
      .apply()
  }
}
