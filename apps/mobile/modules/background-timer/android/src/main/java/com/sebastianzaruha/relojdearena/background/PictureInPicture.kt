package com.sebastianzaruha.relojdearena.background

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Rational
import androidx.core.app.OnPictureInPictureModeChangedProvider
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import java.lang.ref.WeakReference

/**
 * Imagen en imagen (PiP): el plan B de la ventana flotante cuando no hay
 * permiso «Mostrar sobre otras apps». Al ir al inicio con el reloj en
 * marcha, Android encoge la propia app a una ventanita; la app (JS) lo sabe
 * por el evento `onPictureInPicture` y muestra solo el reloj.
 *
 *   Android 12+   → `setAutoEnterEnabled`: Android entra solo, con su animación.
 *   Android 8–11  → al salir (`onUserLeaveHint`) se pide entrar a mano.
 *
 * Hace falta `android:supportsPictureInPicture="true"` en la actividad
 * (lo pone el config plugin, app.plugin.js).
 */
object PictureInPicture {
  private val main = Handler(Looper.getMainLooper())
  private var activity: WeakReference<Activity>? = null
  @Volatile private var allowed = false

  /** Lo pone el módulo de Expo: avisa a la app al entrar o salir. */
  @Volatile var listener: ((Boolean) -> Unit)? = null

  private val modeChanged = Consumer<PictureInPictureModeChangedInfo> { info ->
    listener?.invoke(info.isInPictureInPictureMode)
  }

  /** Al crear la actividad principal (FloatingPackage). */
  fun attach(a: Activity) {
    if (activity?.get() === a) return
    (activity?.get() as? OnPictureInPictureModeChangedProvider)?.removeOnPictureInPictureModeChangedListener(modeChanged)
    activity = WeakReference(a)
    (a as? OnPictureInPictureModeChangedProvider)?.addOnPictureInPictureModeChangedListener(modeChanged)
    apply()
  }

  fun isActive(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity?.get()?.isInPictureInPictureMode == true

  /** ¿Debe entrar al salir? (`FloatingPolicy.pictureInPicture`) */
  fun update(allowed: Boolean) {
    if (this.allowed == allowed) return
    this.allowed = allowed
    main.post { apply() }
  }

  private fun apply() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val a = activity?.get() ?: return
    if (!supported(a)) return
    try {
      a.setPictureInPictureParams(params(autoEnter = allowed))
    } catch (e: Exception) {
      // APK sin supportsPictureInPicture (prebuild antiguo): sin imagen en imagen
    }
  }

  /** Android 8–11: el usuario sale de la app (inicio, recientes). */
  fun onUserLeaveHint(a: Activity) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return
    if (!allowed || !supported(a)) return
    try {
      a.enterPictureInPictureMode(params(autoEnter = false))
    } catch (e: Exception) {
      // sin imagen en imagen
    }
  }

  private fun supported(a: Activity): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      a.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

  /** Vertical, como el reloj (Android admite hasta 1:2,39). */
  private fun params(autoEnter: Boolean): PictureInPictureParams {
    val builder = PictureInPictureParams.Builder().setAspectRatio(Rational(10, 19))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(autoEnter)
      builder.setSeamlessResizeEnabled(false)
    }
    return builder.build()
  }
}
