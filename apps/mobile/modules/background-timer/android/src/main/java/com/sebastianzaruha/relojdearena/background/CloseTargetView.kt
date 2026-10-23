package com.sebastianzaruha.relojdearena.background

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import android.view.animation.OvershootInterpolator

/**
 * La × de abajo que aparece al arrastrar la ventana flotante: si la sueltas
 * encima, se quita. Un círculo de vidrio oscuro con una × fina; cuando el
 * reloj está encima crece un poco y se aclara.
 */
@SuppressLint("ViewConstructor")
class CloseTargetView(context: Context) : View(context) {
  var dark = false

  var active = false
    set(value) {
      if (field == value) return
      field = value
      val s = if (value) 1.18f else 1f
      animate().scaleX(s).scaleY(s).setDuration(160).setInterpolator(OvershootInterpolator()).start()
      invalidate()
    }

  private val disc = Paint(Paint.ANTI_ALIAS_FLAG)
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
  private val cross = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
  }

  override fun onDraw(canvas: Canvas) {
    val d = resources.displayMetrics.density
    val cx = width / 2f
    val cy = height / 2f
    val r = DISC_DP * d / 2
    disc.color = if (active) Color.argb(235, 92, 78, 64) else Color.argb(185, 32, 27, 23)
    canvas.drawCircle(cx, cy, r, disc)
    ring.color = Color.argb(if (active) 170 else 90, 255, 238, 214)
    ring.strokeWidth = 1f * d
    canvas.drawCircle(cx, cy, r, ring)
    cross.color = Color.argb(240, 255, 248, 238)
    cross.strokeWidth = 1.6f * d
    val a = r * 0.36f
    canvas.drawLine(cx - a, cy - a, cx + a, cy + a, cross)
    canvas.drawLine(cx - a, cy + a, cx + a, cy - a, cross)
  }

  companion object {
    /** Tamaño de la ventana de la × (con aire para crecer) y del círculo. */
    const val SIZE_DP = 96f
    private const val DISC_DP = 58f
  }
}
