package com.sebastianzaruha.relojdearena.background

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.ComponentCallbacks
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Display
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowInsets
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * La ventana flotante: el reloj encima de las demás apps (permiso «Mostrar
 * sobre otras apps», ventana `TYPE_APPLICATION_OVERLAY`).
 *
 * Quién decide si se ve es `FloatingPolicy`; aquí solo se pone o se quita
 * la ventana y se atienden los gestos:
 *
 *   tocar             → abre la app
 *   mantener pulsado  → pausa / sigue (como el botón de la notificación)
 *   arrastrar         → se mueve; al soltar se pega al borde más cercano
 *   pellizcar         → más grande o más pequeña
 *   arrastrar a la ×  → se quita (hasta la próxima vez que salgas de la app)
 *
 * Todo pasa en el hilo principal (WindowManager lo exige): `update` se puede
 * llamar desde cualquier sitio y se encarga de cambiar de hilo.
 */
object FloatingWindow {
  private val main = Handler(Looper.getMainLooper())

  private var view: HourglassView? = null
  private var params: WindowManager.LayoutParams? = null
  private var windowManager: WindowManager? = null
  private var closeTarget: CloseTargetView? = null
  private var snapAnimator: ValueAnimator? = null
  private var configWatcher: ComponentCallbacks? = null

  /** Algo ha cambiado (la app sale o vuelve, el reloj, el menú...): ¿se ve o no? */
  fun update(context: Context, event: FloatingEvent) {
    val app = context.applicationContext
    if (Looper.myLooper() == Looper.getMainLooper()) apply(app, event) else main.post { apply(app, event) }
  }

  fun canDraw(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

  private fun apply(context: Context, event: FloatingEvent) {
    val stored = TimerStore.load(context)
    val inputs = FloatingInputs(
      enabled = stored?.floating == true,
      canDraw = canDraw(context),
      appVisible = AppVisibility.visible,
      status = TimerStatus.of(stored?.session, System.currentTimeMillis()),
    )
    val next = FloatingPolicy.reduce(FloatingStore.state(context), event, inputs)
    FloatingStore.saveState(context, next)
    PictureInPicture.update(FloatingPolicy.pictureInPicture(inputs))
    if (next.shown && stored != null) show(context, stored) else hide()
  }

  // ─── Poner y quitar ─────────────────────────────────────────────────────

  private fun show(context: Context, state: StoredState) {
    val existing = view
    if (existing != null) {
      bind(existing, state, context)
      return
    }
    val windowContext = windowContext(context)
    val wm = windowContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val v = HourglassView(windowContext)
    bind(v, state, context)
    val density = context.resources.displayMetrics.density
    val bounds = bounds(wm, context)
    val width = FloatingGeometry.clampWidth(FloatingStore.widthDp(context) * density, density, bounds)
    val height = FloatingGeometry.heightFor(width)
    val margin = margin(context)
    val savedY = FloatingGeometry.yFromFraction(FloatingStore.yFraction(context), height, bounds, margin)
    val place = FloatingGeometry.snap(FloatingStore.side(context), savedY, width, height, bounds, margin)
    val lp = WindowManager.LayoutParams(
      width,
      height,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = place.x
      y = place.y
    }
    v.setOnTouchListener(Gestures(context, v))
    setUpAccessibility(v, context)
    v.alpha = 0f
    v.scaleX = 0.85f
    v.scaleY = 0.85f
    try {
      wm.addView(v, lp)
    } catch (e: Exception) {
      return // sin permiso (lo han quitado justo ahora) o ventana no válida
    }
    v.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(DecelerateInterpolator()).start()
    view = v
    params = lp
    windowManager = wm
    watchConfiguration(context)
  }

  private fun hide() {
    snapAnimator?.cancel()
    hideCloseTarget()
    val v = view ?: return
    view = null
    try {
      windowManager?.removeView(v)
    } catch (e: Exception) {
      // ya no estaba
    }
    params = null
  }

  /** Sesión, tema y textos de accesibilidad del almacén. */
  private fun bind(v: HourglassView, state: StoredState, context: Context) {
    v.session = state.session
    v.dark = isDark(state.theme, context)
    v.reduceMotion = animationsOff(context)
    v.contentDescription = state.text("floatingLabel", "Reloj de arena flotante")
    describe(v, state)
  }

  /** «Trabajo 1/4», o «Pausa · Trabajo 1/4» (lo que lee TalkBack además del nombre). */
  private fun describe(v: HourglassView, state: StoredState) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val title = state.session?.let { state.segmentTitle(it.index) }
      v.stateDescription = if (state.session?.isPaused == true) "${state.text("paused", "Pausa")} · $title" else title
    }
  }

  /** «Automático» sigue al modo oscuro del sistema. */
  private fun isDark(theme: String, context: Context): Boolean = when (theme) {
    "dark" -> true
    "light" -> false
    else -> (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
  }

  /** «Quitar animaciones» del sistema (la escala de animación a 0). */
  private fun animationsOff(context: Context): Boolean =
    Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

  /** Si cambia el tema del sistema o la pantalla (girar), se recoloca y se repinta. */
  private fun watchConfiguration(context: Context) {
    if (configWatcher != null) return
    val watcher = object : ComponentCallbacks {
      override fun onConfigurationChanged(newConfig: Configuration) {
        main.post {
          val v = view ?: return@post
          TimerStore.load(context)?.let { bind(v, it, context) }
          settle(context, velocityX = 0f, animate = false)
        }
      }

      @Deprecated("Deprecated in Java")
      override fun onLowMemory() = Unit
    }
    context.registerComponentCallbacks(watcher)
    configWatcher = watcher
  }

  // ─── Pantalla ───────────────────────────────────────────────────────────

  /** Android 11+: las ventanas que no son de una actividad van en un «contexto de ventana». */
  private fun windowContext(context: Context): Context {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return context
    val display = context.getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
    return context.createDisplayContext(display).createWindowContext(overlayType(), null)
  }

  @Suppress("DEPRECATION")
  private fun overlayType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else WindowManager.LayoutParams.TYPE_PHONE

  /** La pantalla menos la barra de estado y la de navegación (y la muesca). */
  @Suppress("DEPRECATION")
  private fun bounds(wm: WindowManager, context: Context): Bounds {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val metrics = wm.currentWindowMetrics
      val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
      )
      val b = metrics.bounds
      return Bounds(b.left + insets.left, b.top + insets.top, b.right - insets.right, b.bottom - insets.bottom)
    }
    val real = android.util.DisplayMetrics()
    wm.defaultDisplay.getRealMetrics(real)
    val res = context.resources
    fun dimen(name: String): Int {
      val id = res.getIdentifier(name, "dimen", "android")
      return if (id > 0) res.getDimensionPixelSize(id) else 0
    }
    return Bounds(0, dimen("status_bar_height"), real.widthPixels, real.heightPixels - dimen("navigation_bar_height"))
  }

  private fun margin(context: Context): Int =
    (FloatingGeometry.EDGE_MARGIN_DP * context.resources.displayMetrics.density).roundToInt()

  // ─── Mover, pegar al borde y cambiar de tamaño ─────────────────────────

  private fun moveTo(x: Int, y: Int) {
    val v = view ?: return
    val lp = params ?: return
    lp.x = x
    lp.y = y
    try {
      windowManager?.updateViewLayout(v, lp)
    } catch (e: Exception) {
      // la ventana ya no está
    }
  }

  /** Al soltar: se pega al borde con un pequeño rebote y se guarda la posición. */
  private fun settle(context: Context, velocityX: Float, animate: Boolean = true) {
    val lp = params ?: return
    val wm = windowManager ?: return
    val density = context.resources.displayMetrics.density
    val bounds = bounds(wm, context)
    val margin = margin(context)
    val side = FloatingGeometry.sideFor(lp.x, lp.width, bounds, velocityX, FloatingGeometry.FLING_DP_PER_S * density)
    val target = FloatingGeometry.snap(side, lp.y, lp.width, lp.height, bounds, margin)
    FloatingStore.savePlace(context, side, FloatingGeometry.yFraction(target.y, lp.height, bounds, margin), lp.width / density)
    snapAnimator?.cancel()
    if (!animate) {
      moveTo(target.x, target.y)
      return
    }
    val fromX = lp.x
    val fromY = lp.y
    snapAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 320
      interpolator = OvershootInterpolator(0.7f)
      addUpdateListener {
        val t = it.animatedValue as Float
        moveTo((fromX + (target.x - fromX) * t).roundToInt(), (fromY + (target.y - fromY) * t).roundToInt())
      }
      start()
    }
  }

  private fun resize(context: Context, factor: Float) {
    val lp = params ?: return
    val wm = windowManager ?: return
    val density = context.resources.displayMetrics.density
    val bounds = bounds(wm, context)
    val newWidth = FloatingGeometry.clampWidth(lp.width * factor, density, bounds)
    if (newWidth == lp.width) return
    val newHeight = FloatingGeometry.heightFor(newWidth)
    val place = FloatingGeometry.resizeAround(Placement(lp.x, lp.y), lp.width, lp.height, newWidth, newHeight, bounds, margin(context))
    lp.width = newWidth
    lp.height = newHeight
    moveTo(place.x, place.y)
  }

  // ─── La × de quitar ─────────────────────────────────────────────────────

  private fun showCloseTarget(context: Context) {
    if (closeTarget != null) return
    val wm = windowManager ?: return
    val density = context.resources.displayMetrics.density
    val size = (CloseTargetView.SIZE_DP * density).roundToInt()
    val bounds = bounds(wm, context)
    val target = CloseTargetView(view?.context ?: context)
    val lp = WindowManager.LayoutParams(
      size,
      size,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = bounds.left + (bounds.width - size) / 2
      y = bounds.bottom - size - (24 * density).roundToInt()
    }
    target.dark = view?.dark ?: false
    target.alpha = 0f
    target.translationY = size * 0.3f
    try {
      wm.addView(target, lp)
    } catch (e: Exception) {
      return
    }
    target.animate().alpha(1f).translationY(0f).setDuration(180).setInterpolator(DecelerateInterpolator()).start()
    closeTarget = target
    closeTargetCenter = Pair(lp.x + size / 2f, lp.y + size / 2f)
  }

  private var closeTargetCenter = Pair(0f, 0f)

  private fun hideCloseTarget() {
    val target = closeTarget ?: return
    closeTarget = null
    val wm = windowManager
    target.animate().alpha(0f).setDuration(140).withEndAction {
      try {
        wm?.removeView(target)
      } catch (e: Exception) {
        // ya no estaba
      }
    }.start()
  }

  /** La has soltado encima de la ×: se encoge, se va y no vuelve hasta que salgas de la app otra vez. */
  private fun dismiss(context: Context) {
    val v = view ?: return
    v.animate().alpha(0f).scaleX(0.4f).scaleY(0.4f).setDuration(180).withEndAction {
      update(context, FloatingEvent.USER_CLOSED)
    }.start()
    hideCloseTarget()
  }

  // ─── Acciones ───────────────────────────────────────────────────────────

  /** Abre la app (si ya estaba abierta, la trae delante tal como estaba). */
  private fun openApp(context: Context) {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    try {
      context.startActivity(intent)
    } catch (e: Exception) {
      // Android no la ha dejado abrir (raro con una ventana a la vista)
    }
  }

  /** Pausa o sigue, igual que el botón de la notificación. */
  private fun togglePause(context: Context) {
    val session = TimerStore.load(context)?.session ?: return
    val running = TimerModel.settle(session, System.currentTimeMillis()).isRunning
    BackgroundTimer.onAction(context, if (running) ActionReceiver.ACTION_PAUSE else ActionReceiver.ACTION_RESUME)
  }

  /** TalkBack: tocar dos veces abre la app; mantener pausa; y una acción para quitarla. */
  private fun setUpAccessibility(v: HourglassView, context: Context) {
    v.isClickable = true
    v.isLongClickable = true
    v.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
    v.accessibilityDelegate = object : View.AccessibilityDelegate() {
      override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(host, info)
        val texts = TimerStore.load(context)
        info.hintText(texts?.text("floatingHint", "") ?: "")
        info.addAction(AccessibilityNodeInfo.AccessibilityAction(R_ID_CLOSE, texts?.text("floatingClose", "Quitar") ?: "Quitar"))
      }

      override fun performAccessibilityAction(host: View, action: Int, args: Bundle?): Boolean = when (action) {
        AccessibilityNodeInfo.ACTION_CLICK -> {
          openApp(context)
          true
        }
        AccessibilityNodeInfo.ACTION_LONG_CLICK -> {
          togglePause(context)
          true
        }
        R_ID_CLOSE -> {
          update(context, FloatingEvent.USER_CLOSED)
          true
        }
        else -> super.performAccessibilityAction(host, action, args)
      }
    }
  }

  private fun AccessibilityNodeInfo.hintText(text: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && text.isNotEmpty()) hintText = text
  }

  /** Identificador de la acción «Quitar» (cualquier número que no use Android). */
  private const val R_ID_CLOSE = 0x52454C4F

  /**
   * Los gestos. Se distinguen así:
   *   - dos dedos → pellizco (tamaño), y ya no cuenta como toque ni arrastre;
   *   - el dedo se mueve más que el «touch slop» → arrastre;
   *   - se levanta antes del tiempo de pulsación larga sin moverse → toque;
   *   - pasa ese tiempo sin moverse → pulsación larga (pausa/sigue).
   */
  private class Gestures(private val context: Context, private val view: View) : View.OnTouchListener {
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private val longPressMs = ViewConfiguration.getLongPressTimeout().toLong()
    private val handler = Handler(Looper.getMainLooper())
    private var downX = 0f
    private var downY = 0f
    private var startX = 0
    private var startY = 0
    private var dragging = false
    private var scaling = false
    private var longPressed = false
    private var overTarget = false
    private var velocity: VelocityTracker? = null

    private val longPress = Runnable {
      longPressed = true
      view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
      togglePause(context)
    }

    private val scale = ScaleGestureDetector(context, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
      override fun onScale(detector: ScaleGestureDetector): Boolean {
        resize(context, detector.scaleFactor)
        return true
      }
    })

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouch(v: View, event: MotionEvent): Boolean {
      scale.onTouchEvent(event)
      velocity?.addMovement(event)
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          snapAnimator?.cancel()
          downX = event.rawX
          downY = event.rawY
          startX = params?.x ?: 0
          startY = params?.y ?: 0
          dragging = false
          scaling = false
          longPressed = false
          overTarget = false
          velocity = VelocityTracker.obtain().also { it.addMovement(event) }
          handler.postDelayed(longPress, longPressMs)
        }
        MotionEvent.ACTION_POINTER_DOWN -> {
          // Segundo dedo: es un pellizco.
          scaling = true
          handler.removeCallbacks(longPress)
          if (dragging) hideCloseTarget()
        }
        MotionEvent.ACTION_MOVE -> {
          if (scaling || longPressed) return true
          val dx = event.rawX - downX
          val dy = event.rawY - downY
          if (!dragging && (abs(dx) > slop || abs(dy) > slop)) {
            dragging = true
            handler.removeCallbacks(longPress)
            showCloseTarget(context)
          }
          if (dragging) drag(dx, dy)
        }
        MotionEvent.ACTION_UP -> {
          handler.removeCallbacks(longPress)
          velocity?.computeCurrentVelocity(1000)
          val vx = velocity?.xVelocity ?: 0f
          when {
            longPressed -> Unit
            scaling -> settle(context, 0f)
            dragging && overTarget -> dismiss(context)
            dragging -> {
              hideCloseTarget()
              settle(context, vx)
            }
            else -> openApp(context)
          }
          recycle()
        }
        MotionEvent.ACTION_CANCEL -> {
          handler.removeCallbacks(longPress)
          hideCloseTarget()
          settle(context, 0f)
          recycle()
        }
      }
      return true
    }

    /** Sigue al dedo; cerca de la × se engancha a ella (como las burbujas de chat). */
    private fun drag(dx: Float, dy: Float) {
      val lp = params ?: return
      val x = startX + dx.roundToInt()
      val y = startY + dy.roundToInt()
      val (tx, ty) = closeTargetCenter
      val radius = FloatingGeometry.CLOSE_RADIUS_DP * context.resources.displayMetrics.density
      val near = closeTarget != null &&
        FloatingGeometry.overCloseTarget(x + lp.width / 2f, y + lp.height / 2f, tx, ty, radius)
      if (near != overTarget) {
        overTarget = near
        closeTarget?.active = near
        if (near) view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
      }
      if (near) moveTo((tx - lp.width / 2f).roundToInt(), (ty - lp.height / 2f).roundToInt()) else moveTo(x, y)
    }

    private fun recycle() {
      velocity?.recycle()
      velocity = null
    }
  }
}
