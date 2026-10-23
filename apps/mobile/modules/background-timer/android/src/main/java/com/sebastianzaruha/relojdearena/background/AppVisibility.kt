package com.sebastianzaruha.relojdearena.background

import android.app.Activity
import android.app.Application
import android.os.Bundle
import android.os.Handler
import android.os.Looper

/**
 * ¿Se ve alguna pantalla de la app? Cuenta las actividades «empezadas»
 * (onStart/onStop): un diálogo del sistema encima (pedir un permiso) no la
 * para, así que la ventana flotante no aparece por error. Imagen en imagen
 * también cuenta como «a la vista».
 *
 * Al salir se espera un poco antes de avisar: girar la pantalla o pasar de
 * una actividad a otra para y empieza en un instante.
 */
object AppVisibility : Application.ActivityLifecycleCallbacks {
  @Volatile var visible = false
    private set

  private const val HIDE_DELAY_MS = 400L
  private var started = 0
  private var registered = false
  private var app: Application? = null
  private val main = Handler(Looper.getMainLooper())

  private val notifyHidden = Runnable {
    if (started == 0) app?.let { FloatingWindow.update(it, FloatingEvent.APP_HIDDEN) }
  }

  /** Se llama al crear la actividad (FloatingPackage), antes de su onStart. */
  fun register(application: Application) {
    if (registered) return
    registered = true
    app = application
    application.registerActivityLifecycleCallbacks(this)
  }

  override fun onActivityStarted(activity: Activity) {
    started++
    if (started == 1) {
      visible = true
      main.removeCallbacks(notifyHidden)
      FloatingWindow.update(activity, FloatingEvent.APP_VISIBLE)
    }
  }

  override fun onActivityStopped(activity: Activity) {
    started = maxOf(0, started - 1)
    if (started == 0) {
      visible = false
      main.postDelayed(notifyHidden, HIDE_DELAY_MS)
    }
  }

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
  override fun onActivityResumed(activity: Activity) = Unit
  override fun onActivityPaused(activity: Activity) = Unit
  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
  override fun onActivityDestroyed(activity: Activity) = Unit
}
