package com.sebastianzaruha.relojdearena.background

import android.app.Activity
import android.content.Context
import android.os.Bundle
import expo.modules.core.BasePackage
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * Engancha la ventana flotante y la imagen en imagen al ciclo de vida de la
 * actividad principal. El autolinking de Expo encuentra esta clase solo
 * (un archivo `*Package.kt` que importa BasePackage).
 */
class FloatingPackage : BasePackage() {
  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(Listener)

  private object Listener : ReactActivityLifecycleListener {
    override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
      AppVisibility.register(activity.application)
      PictureInPicture.attach(activity)
    }

    override fun onResume(activity: Activity) {
      PictureInPicture.attach(activity)
    }

    override fun onUserLeaveHint(activity: Activity) {
      PictureInPicture.onUserLeaveHint(activity)
    }
  }
}
