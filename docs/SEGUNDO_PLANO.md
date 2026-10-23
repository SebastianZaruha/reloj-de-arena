# Segundo plano en Android: notificación, avisos y ventana flotante

Desde la 1.7, en Android el reloj **sigue contando con la app en segundo plano o cerrada**:

- Una **notificación fija** muestra la cuenta atrás («Trabajo 1/4 · hasta las 10:25» y el
  tiempo que queda corriendo solo) con los botones **Pausar / Reanudar** y **Reiniciar**.
- Al **cambiar de fase** y al **terminar** suena el aviso (`cambio.mp3` / `fin.mp3`) y vibra
  igual que dentro de la app (doble toque en el cambio de fase), aunque la app esté cerrada.
- Desde la 1.8, una **ventana flotante** opcional deja el reloj de arena, pequeño y sin
  fondo, encima de las demás apps. Sin permiso, la app pasa a **imagen en imagen** (PiP).

Este documento explica cómo está hecho y por qué. El resto de la arquitectura está en
[ARQUITECTURA.md](ARQUITECTURA.md).

## Por qué un módulo nativo propio y no `expo-notifications`

`expo-notifications` sabe programar notificaciones a una hora, pero le faltan dos cosas que
aquí son el núcleo:

1. **Cuenta atrás nativa.** Android puede pintar él mismo un cronómetro descendente en la
   notificación (`setUsesChronometer(true)` + `setChronometerCountDown(true)`): cero trabajo
   para la app, exacto al segundo y sin despertar el móvil cada segundo. `expo-notifications`
   no expone esas dos opciones.
2. **Botones que funcionan con la app muerta.** Pausar desde la notificación tiene que
   cancelar las alarmas pendientes y reanudar tiene que volver a programarlas. Con
   `expo-notifications` el botón abre o despierta la parte JavaScript, que puede no estar
   viva. Aquí un `BroadcastReceiver` en Kotlin lo resuelve en milisegundos sin arrancar
   React Native.

Por eso hay un **módulo local de Expo** en Kotlin (`apps/mobile/modules/background-timer/`).
Se enlaza solo (autolinking de la carpeta `modules/`), no añade dependencias y no necesita
servicio en primer plano.

## Cómo funciona

```
 JavaScript (app abierta)                         Android (siempre)
 ────────────────────────                         ─────────────────
 useSession ──► useBackgroundTimer ──sync(payload)──► BackgroundTimer.sync
   ▲              (backgroundSync.ts)                 ├─ TimerStore      (guarda en SharedPreferences)
   │                                                  ├─ TimerNotifications (notificación fija con cronómetro)
   │                                                  └─ TimerAlarms     (una alarma exacta por aviso)
   │
   │   onChange{seq} / getState()      AlarmReceiver  ──► avanza de fase, aviso con sonido, nueva notificación
   └──────────────────────────────── ActionReceiver ──► pausar / reanudar / reiniciar (seq + 1)
                                     RestoreReceiver ──► reinicio del móvil o actualización: reprograma
```

1. **El core calcula; Kotlin solo ejecuta.** `packages/core/src/background/` convierte la
   sesión en un modelo mínimo (`BackgroundSession`: duraciones de los tramos, tramo actual,
   cuándo acaba —si corre— o cuánto queda —si está en pausa—) y calcula **todos los avisos
   futuros** por marcas de tiempo (`backgroundEvents`, máximo 48). También prepara los textos
   ya traducidos (`backgroundPayload`), así Kotlin no necesita i18n.
2. **`TimerModel.kt` es un espejo del core.** Pausar, reanudar, reiniciar y «ponerse al día»
   están escritos dos veces: en TypeScript (con tests que comprueban que coinciden con el motor
   de sesiones) y en Kotlin (con tests JUnit de los mismos casos). Así los botones de la
   notificación funcionan sin JavaScript.
3. **Alarmas exactas.** Cada aviso es una alarma `setExactAndAllowWhileIdle` (suena aunque el
   móvil esté en reposo). Cualquier cambio (pausa, reinicio, otro plan, volteo, cambio de
   ajustes) cancela todas y programa las nuevas. Sin permiso de alarmas exactas se usa
   `setAndAllowWhileIdle`: suena igual, pero Android puede retrasarlo unos minutos.
4. **Quién manda: el número de secuencia (`seq`).** Cada botón de la notificación sube `seq`.
   Cuando la app vuelve, lee el estado nativo y, si `seq` es nuevo, **adopta** esa sesión
   (`sessionFromBackground`). Un `sync` que llega de JS con un `seenSeq` viejo se descarta:
   así un estado antiguo de la app nunca pisa una pausa hecha desde la notificación.
5. **Sin avisos dobles.** Con la app en primer plano, la app ya suena y vibra por su cuenta:
   el módulo sabe si la app está delante y entonces no avisa (pero sí mantiene la
   notificación al día). Al volver de segundo plano, la app no repite durante 1 s los avisos
   que ya dio la notificación (`appShouldAlert`, `CATCH_UP_MS`).
6. **Reinicio del móvil.** Android borra las alarmas al reiniciar; `RestoreReceiver` las
   vuelve a poner. Los avisos que se perdieron hace más de 15 min no se dan (`STALE_ALERT_MS`).

## Canales, sonidos y vibración

Android fija el sonido y la vibración **por canal**, y no deja cambiarlos después de crearlo.
Por eso hay un canal por combinación de los interruptores Sonido/Vibración del menú:

| Canal                    | Para qué                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| `reloj.cuenta`           | La notificación fija (importancia baja: no suena ni vibra).               |
| `reloj.fin.{sv,s,v}.v1`  | Fin: sonido `fin.mp3`, vibración `[0, 40, 100, 40]`.                      |
| `reloj.fase.{sv,s,v}.v1` | Cambio de fase: sonido `cambio.mp3`, vibración `[0, 43, 77, 43]` (doble). |

`sv` = sonido y vibración, `s` = solo sonido, `v` = solo vibración. Con los dos apagados el
aviso sale **en silencio**. Los patrones son los de `expo-haptics` que usa la app. Los mp3 los
copia el _config plugin_ (`app.plugin.js`) a `res/raw` al hacer `prebuild`. Si cambias un
sonido o un patrón, sube `CHANNEL_VERSION` en `TimerNotifications.kt` (crea canales nuevos).

## Permisos

| Permiso                  | Cuándo                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `POST_NOTIFICATIONS`     | Android 13+. Se pide **una vez**, la primera vez que empieza un reloj, tras explicar para qué.  |
| `USE_EXACT_ALARM`        | Android 13+. Se concede solo (es para apps de temporizador).                                    |
| `SCHEDULE_EXACT_ALARM`   | Solo Android 12. Viene concedido, pero se puede quitar en Ajustes → «Alarmas y recordatorios».  |
| `RECEIVE_BOOT_COMPLETED` | Reprogramar los avisos tras reiniciar el móvil.                                                 |
| `SYSTEM_ALERT_WINDOW`    | 1.8, solo con «Ventana flotante» activada. Lo concede el usuario en «Mostrar sobre otras apps». |

Si falta un permiso, el menú muestra un aviso que abre los ajustes del sistema. Rechazarlo no
rompe nada: el reloj sigue funcionando con la app abierta, como antes.

## Decisiones (se pueden cambiar)

- **«Reiniciar» en la notificación vuelve a la ronda 1 y sigue contando.** Dentro de la app,
  la pulsación larga deja el reloj listo para empezar; desde la notificación sería raro que
  la notificación desapareciera. Está en `restartBackground` / `TimerModel.restart`.
- **Sin servicio en primer plano.** No hace falta: el cronómetro lo pinta Android y las
  alarmas despiertan el receptor. Gasta menos batería y evita las restricciones de Android 14.
- **En la web y en Expo Go no hace nada** (`requireOptionalNativeModule`): la app funciona
  como en la 1.6.

## Ventana flotante (1.8)

Con **«Ventana flotante»** activada en el menú, al salir de la app con un reloj en marcha
aparece el reloj de arena **solo** (vidrio y arena, fondo transparente) encima de las demás
apps. Al volver a la app o al terminar el reloj, desaparece.

### Por qué una vista nativa (Canvas) y no React Native

La ventana tiene que seguir viva con la app en segundo plano y hasta con la parte JavaScript
muerta (tras un aviso, un reinicio del móvil…). Por eso es una `View` de Kotlin dibujada con
`Canvas` (`HourglassView.kt`) dentro de una ventana `TYPE_APPLICATION_OVERLAY`, y lee el mismo
estado nativo que la notificación (`TimerStore` + `TimerModel.settle`). Cero JS, cero Skia.

- **La silueta** es la del modelo «Clásico» del core (`profile.ts`), copiada en
  `HourglassShape.kt`.
- **El nivel de la arena** sale del tiempo que queda de verdad: se integra el área del vidrio
  y se busca por bisección la altura que deja esa cantidad de arena arriba (con el embudo en V)
  y abajo (con su montoncito). La paleta de granos es la de la app.
- **Un chorro fino** de cinco granos cae por el cuello.
- **Frecuencia:** ~12 fps en marcha, nada en pausa (la vista no se redibuja). Con las
  animaciones del sistema desactivadas, va más lenta y sin volteo.
- **Temas:** claro, oscuro o el del sistema, según el menú.
- **Pausa:** el reloj se ve atenuado (`saveLayerAlpha`).
- **Cambio de fase:** da la vuelta (700 ms) y la arena se rellena arriba.

### Gestos

| Gesto                      | Acción                                                                |
| -------------------------- | --------------------------------------------------------------------- |
| **Arrastrar**              | Se mueve; al soltar se acomoda suave en el borde izquierdo o derecho. |
| **Pellizcar** (dos dedos)  | Más grande o más pequeño (44–124 dp de ancho; por defecto 58 dp).     |
| **Tocar**                  | Abre la app.                                                          |
| **Mantener pulsado**       | Pausa o reanuda.                                                      |
| **Llevar a la × de abajo** | Lo quita hasta la próxima vez que salgas de la app (estilo burbuja).  |

Con TalkBack, las mismas acciones están en el menú de acciones (tocar, mantener y «Quitar»).
La posición (lado y altura relativa) y el tamaño se guardan (`FloatingStore.kt`).

### Cuándo se ve: `FloatingPolicy`

Una máquina de estados pura (`FloatingPolicy.kt`, con tests) decide a partir del interruptor,
el permiso, si la app está a la vista y el estado del reloj:

1. Interruptor apagado, sin permiso o sin reloj vivo → oculta.
2. App a la vista → oculta (y se olvida que la quitaste).
3. La quitaste con la × → oculta hasta que vuelvas a la app.
4. App en segundo plano y reloj en marcha → visible.
5. En pausa → se queda como estaba (si se veía, sigue atenuada; si saliste en pausa, no
   aparece).

Si la app está a la vista lo sabe `AppVisibility.kt` (cuenta las actividades iniciadas, con
400 ms de margen para que un diálogo o un giro no la hagan parpadear). Cada cambio del reloj
(sync desde JS, botón de la notificación, alarma, reinicio del móvil) vuelve a evaluar la
política, así que la ventana también se actualiza con la app muerta.

### Sin permiso: imagen en imagen

Si «Ventana flotante» está activada pero falta «Mostrar sobre otras apps», al ir a inicio con
un reloj en marcha la app entra en **imagen en imagen** (proporción 10:19) y muestra solo el
reloj sobre el fondo del tema: sin tiempo, sin menú. En Android 12+ entra sola
(`setAutoEnterEnabled`); en 8–11, con `onUserLeaveHint`. El _config plugin_ añade
`supportsPictureInPicture` a la actividad.

### Permiso y explicación

La primera vez que se activa sin permiso, la app enseña una pantalla con el mismo estilo que
«Gestos» (`FloatingHelp.tsx`): qué hace, los gestos y por qué Android pide el permiso. «Dar
permiso» abre «Mostrar sobre otras apps» para esta app. Al volver, la app lo vuelve a
comprobar; si sigue faltando, el menú lo avisa.

### Probar el dibujo sin móvil

`HourglassViewRenderTest` (Robolectric, gráficos nativos) dibuja la vista en la JVM y comprueba
la arena, el chorro, los temas y la pausa. Para guardar las imágenes:

```bash
cd apps/mobile/android
./gradlew :background-timer:testDebugUnitTest -Preloj.capturas=/ruta/a/capturas
```

## Límites conocidos

- **Fabricantes que matan apps** (Xiaomi/MIUI/HyperOS, Huawei, Oppo, Vivo, algunos Samsung):
  pueden borrar las alarmas o bloquear el receptor. En esos móviles hay que permitir el
  **inicio automático** y quitar la **optimización de batería** de la app.
- **«Forzar detención»** en Ajustes cancela las alarmas por diseño de Android; vuelven al
  abrir la app.
- **Android 14+** deja descartar las notificaciones «fijas» deslizando. El reloj sigue y los
  avisos suenan; la notificación vuelve en el siguiente cambio de fase o al abrir la app.
- **Sin permiso de alarmas exactas** (Android 12 si lo quitas) los avisos pueden llegar
  unos minutos tarde.
- `USE_EXACT_ALARM` está permitido en Google Play para temporizadores, pero Play revisa su uso
  al publicar.
- Hay que **instalar el APK nuevo**: el de la 1.3 no tiene el módulo (la app funciona, pero
  sin notificación). El de la 1.7 no tiene la ventana flotante.
- **Ventana flotante:**
  - Si cierras la app desde «Recientes» y el sistema mata el proceso, la ventana se va con él;
    vuelve en el siguiente aviso (cambio de fase) o al abrir la app.
  - En Xiaomi/HyperOS hace falta, además, permitir «Mostrar ventanas emergentes mientras se
    ejecuta en segundo plano».
  - No se ve sobre la pantalla de bloqueo.
  - `SYSTEM_ALERT_WINDOW`: Google Play lo revisa al publicar; aquí solo se usa si lo activas.
- **Imagen en imagen:** sin botones propios (Android pone los suyos); al terminar el reloj se
  queda mostrando el reloj vacío hasta que la cierras.
- La primera vez, los tests de dibujo (Robolectric) descargan sus librerías: necesitan red.
