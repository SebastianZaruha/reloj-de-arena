# Segundo plano en Android: notificación y avisos

Desde la 1.7, en Android el reloj **sigue contando con la app en segundo plano o cerrada**:

- Una **notificación fija** muestra la cuenta atrás («Trabajo 1/4 · hasta las 10:25» y el
  tiempo que queda corriendo solo) con los botones **Pausar / Reanudar** y **Reiniciar**.
- Al **cambiar de fase** y al **terminar** suena el aviso (`cambio.mp3` / `fin.mp3`) y vibra
  igual que dentro de la app (doble toque en el cambio de fase), aunque la app esté cerrada.

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

| Permiso                  | Cuándo                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `POST_NOTIFICATIONS`     | Android 13+. Se pide **una vez**, la primera vez que empieza un reloj, tras explicar para qué. |
| `USE_EXACT_ALARM`        | Android 13+. Se concede solo (es para apps de temporizador).                                   |
| `SCHEDULE_EXACT_ALARM`   | Solo Android 12. Viene concedido, pero se puede quitar en Ajustes → «Alarmas y recordatorios». |
| `RECEIVE_BOOT_COMPLETED` | Reprogramar los avisos tras reiniciar el móvil.                                                |

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

## Pensado para la parte 2 (ventana flotante)

La ventana flotante con el reloj encima de otras apps (y PiP como alternativa) podrá leer el
mismo estado nativo (`TimerStore`, `TimerModel.snapshot`) y reaccionar a los mismos cambios
(`seq`). No hace falta tocar el core ni el protocolo: solo añadir otra vista.

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
  sin notificación).
