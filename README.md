# Reloj de Arena ⏳

**Un temporizador minimalista que es, literalmente, un reloj de arena: la arena cae grano a
grano, se desliza al inclinar el móvil y empieza de nuevo al darle la vuelta.**

> **English summary.** _Reloj de Arena_ ("hourglass") is a minimalist timer app for Android
> (also runs on the web) built with Expo / React Native, React Native Skia shaders and a real
> granular sand simulation. Tilt the phone and the sand slides; lay it on its side to pause;
> flip it to restart. A discreet frosted-glass menu adds light/dark/auto themes, quick times and
> work/break cycles. TypeScript monorepo with a pure, fully tested core. Documentation is in
> Spanish. MIT licensed.

<p align="center">
  <img src="docs/capturas/13-en-marcha-claro.png" width="28%" alt="Reloj en marcha, tema claro" />
  <img src="docs/capturas/13-en-marcha-oscuro.png" width="28%" alt="Reloj en marcha, tema oscuro" />
  <img src="docs/capturas/09-inclinado-claro.png" width="28%" alt="Móvil inclinado: la arena se desliza" />
</p>

<p align="center"><sub>Capturas de la versión web (Chromium, 390×844): en marcha en claro y oscuro, e inclinado 25°.</sub></p>

<p align="center">
  <img src="docs/capturas/14-menu-claro.png" width="22%" alt="Menú de ajustes abierto, tema claro" />
  <img src="docs/capturas/14-menu-oscuro.png" width="22%" alt="Menú de ajustes abierto, tema oscuro, con ciclos" />
  <img src="docs/capturas/14-ciclo-descanso-oscuro.png" width="22%" alt="Ciclo en marcha: Descanso 2/4" />
  <img src="docs/capturas/14-intro-claro.png" width="22%" alt="Animación de entrada: el reloj gira" />
</p>

<p align="center"><sub>Versión 1.5: menú de ajustes en claro y oscuro, un ciclo en su descanso y un fotograma de la entrada.</sub></p>

## Índice

1. [Características](#características)
2. [Tecnología y por qué](#tecnología-y-por-qué)
3. [Arquitectura](#arquitectura)
4. [Cómo ejecutarlo](#cómo-ejecutarlo)
5. [Tests y calidad](#tests-y-calidad)
6. [Rendimiento y memoria](#rendimiento-y-memoria)
7. [Hoja de ruta](#hoja-de-ruta)
8. [Licencia](#licencia)
9. [Autor](#autor)

Más documentación: **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)** (cómo funciona por dentro y
dónde está cada cosa en el código) y **[CHANGELOG.md](CHANGELOG.md)** (historial de versiones).

---

## Características

La pantalla entera es el reloj: un vidrio fino y transparente con arena que cae de verdad sobre
un fondo cálido y difuso. Todo se maneja con gestos; los ajustes viven en un menú discreto:

| Gesto                       | Acción                                                        |
| --------------------------- | ------------------------------------------------------------- |
| Deslizar **arriba / abajo** | Más / menos tiempo (1 min – 3 h). La arena cambia en vivo.    |
| **Tocar**                   | Empezar · pausar · reanudar (y volver a empezar al terminar). |
| **Mantener pulsado**        | Reiniciar.                                                    |
| **Inclinar** el móvil       | La arena se desliza y la luz y la sombra se mueven.           |
| **Tumbar de lado** (≈90°)   | Pausa (reloj desenfocado y «Pausa»); de pie, sigue.           |
| **Voltear** (180°)          | Como uno real: empieza de cero y cae la arena del otro lado.  |

- **Arena simulada grano a grano** (autómata celular): montón con su ángulo de reposo, cráter
  arriba, avalanchas al inclinar, chorro de granos sueltos que acelera, salpica y rueda.
- **La arena nunca se desincroniza del tiempo:** el paso por el cuello lo marca el temporizador,
  no la física. El tiempo se calcula con marcas de tiempo, exacto aunque la app se suspenda.
- **Vidrio 2.5D con shaders:** refracción, reflejos con Fresnel, vidrio más grueso en extremos y
  cuello, granos con varios tonos y destellos de cuarzo que siguen la luz al inclinar.
- **Sensores:** la luz, los reflejos y la sombra se mueven con la inclinación (paralaje).
- **Menú de ajustes discreto** (botón de dos rayas arriba a la derecha): una hoja de vidrio
  esmerilado (desenfoque real con Skia) que sube desde abajo. Se cierra arrastrándola hacia
  abajo, tocando fuera o con «atrás» (Escape en la web).
- **Tema claro, oscuro o automático** (sigue al sistema), con un fundido suave al cambiar.
- **Tiempos rápidos:** 5, 10, 15, 25, 45 y 60 min con un toque (deslizar sigue funcionando).
- **Ciclos trabajo/descanso:** 25/5, 50/10, 15/3 y 90/15 (4 rondas) o **Personalizado**
  (1–180 min, 1–12 rondas). Al cambiar de fase el reloj **se da la vuelta solo**, suena un
  aviso suave, vibra y aparece un rótulo discreto («Trabajo 2/4», «Descanso 2/4»). Voltear el
  móvil reinicia la fase en curso.
- **Vibración** al empezar, pausar, voltear, en cada escalón al deslizar, al cambiar de fase y
  al terminar. Sonido y vibración se pueden apagar en el menú.
- **Aviso sonoro** breve al acabar (solo si la arena se acaba sola).
- **Entrada animada** al abrir la app (≈1,2 s): el reloj gira una vez y se coloca en su sitio.
  Solo al arrancar en frío, nunca al volver de segundo plano, y con «reducir movimiento» es un
  simple fundido.
- **Recuerda todo:** tema, tiempos, ciclos, sonido y vibración se guardan en el móvil.
- **Accesible:** control ajustable para TalkBack, anuncios de estado (también los cambios de
  fase), etiquetas y roles en todo el menú, zonas táctiles de 44 px o más, contraste
  comprobado en los dos temas y modo «reducir movimiento». La pantalla no se apaga mientras
  corre la arena.
- **Versión web** completa (CanvasKit), con simulador de inclinación por teclado.

## Tecnología y por qué

| Pieza                                            | Por qué                                                                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Expo SDK 58 + React Native 0.88** (TypeScript) | Una sola base de código para Android, iOS y web; _development build_ propio sin depender de Expo Go.                                           |
| **@shopify/react-native-skia** (shaders SkSL)    | Dibujo por GPU con shaders: vidrio y arena realistas a 60 fps. En web usa **CanvasKit** (Skia en WebAssembly).                                 |
| **Reanimated 4 + Gesture Handler 3**             | La arena se publica en _shared values_: el lienzo se redibuja sin re-renderizar React. Gestos nativos fluidos.                                 |
| **expo-sensors · expo-haptics · expo-audio**     | Acelerómetro (inclinación, pausa, volteo), vibración y sonido, sin código nativo propio.                                                       |
| **Núcleo en TypeScript puro** (`@reloj/core`)    | Temporizador, simulación, física y ajustes sin React ni UI: se prueba con **Vitest** en milisegundos y se reutilizará en la app de escritorio. |
| **npm workspaces** (monorepo)                    | Funciona sin configuración extra con Metro/Expo en Windows.                                                                                    |
| **ESLint + Prettier + TypeScript estricto**      | Un solo comando (`npm run check`) valida tipos, estilo, formato y tests.                                                                       |

Las decisiones con más detalle están en
[docs/ARQUITECTURA.md › Decisiones clave](docs/ARQUITECTURA.md#decisiones-clave-y-por-qué).

## Arquitectura

```
reloj-de-arena/
├── packages/
│   └── core/            @reloj/core · LÓGICA PURA (sin React, sin UI), con tests
│       └── src/         timer · sim · physics · geometry · settings · catalog · session · persistence · recovery
├── apps/
│   └── mobile/          @reloj/mobile · app Expo / React Native (Android, iOS, web)
│       ├── app.json     configuración de Expo (nombre, paquete, permisos bloqueados…)
│       ├── assets/      iconos y sonido de fin
│       └── src/
│           ├── screens/      TimerScreen: gestos, accesibilidad, diseño
│           ├── hourglass/    renderizador Skia reutilizable: <Hourglass>, pintores, shaders
│           ├── motion/       acelerómetro → fuente de movimiento; simulador web
│           ├── haptics/      vibración
│           ├── sound/        avisos de fin y de cambio de fase
│           ├── intro/        animación de entrada (solo al arrancar en frío)
│           ├── hooks/        useSession, useSettings…
│           ├── theme/        paletas clara y oscura, tema automático
│           ├── dev/          reloj acelerado para probar ciclos (solo desarrollo)
│           └── components/   tiempo y rótulo de fase, «Pausa», menú de ajustes (menu/)
└── docs/                ARQUITECTURA.md y capturas
```

```
 gestos / sensores / menú ──► useSession ──► motor de sesiones del core (fases encadenadas
                                              con marcas de tiempo, estado inmutable)
                                         │ tiempo restante
                                         ▼
 <Hourglass> ──► bucle de animación (≈60 fps, se duerme si nada se mueve)
                   1. controlador de flujo: ¿cuántos granos deben quedar arriba?
                   2. simulación granular: los granos caen, ruedan y se asientan
                   3. SandPainter → SkPicture → shared value de Reanimated
                                         ▼
 <Canvas> Skia: [fondo + sombra + vidrio] [arena + chorro] [reflejos + contorno]
```

**Regla de oro:** `core` no importa nada de la app; la app importa de `core`. La explicación
completa (temporizador, simulación, shaders, inclinación, vibración, sonido, memoria) y el mapa
archivo por archivo están en **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)**.

## Cómo ejecutarlo

### Requisitos

- **Node.js 22.13 o superior** (lo exige Expo SDK 58) y npm, que viene con Node. Comprueba con
  `node -v`.
- Para el móvil: un **Android 7+** con el _development build_ de la app instalado (ver abajo) y
  el ordenador y el móvil en la **misma red Wi‑Fi**.
- Para compilar el APK: **JDK 17** y el **SDK de Android** (con NDK 27.1). No hace falta
  Android Studio.

### Instalar y arrancar

```bash
git clone https://github.com/SebastianZaruha/reloj-de-arena.git
cd reloj-de-arena
npm install          # instala todo el monorepo (y copia canvaskit.wasm para la web)
npm run mobile       # servidor de Expo para el móvil (development build)
npm run web          # o: versión web en el navegador
```

En el móvil, abre **Reloj de Arena** (el _development build_): tu PC aparece en la lista de
servidores si estáis en la misma Wi‑Fi, o escanea el **QR** de la terminal. Si no conecta
(VPN, redes de empresa o de invitados): `cd apps/mobile` y `npx expo start --tunnel`. En la
terminal, `r` recarga, `j` abre el depurador y `m` el menú de desarrollo. La primera vez,
Windows puede preguntar si Node.js puede usar la red: acepta en **redes privadas**.

> **Por qué un _development build_ y no Expo Go:** es «tu propio Expo Go», con los módulos
> nativos exactos del proyecto, y no depende de qué versión de Expo Go tenga la Play Store.
> Como el proyecto solo usa módulos incluidos en Expo Go, también funciona con **Expo Go 58**
> (`npx expo-go download android 58`, y en la terminal pulsa `s` para cambiar a Expo Go).

### Compilar el APK de desarrollo

Solo hace falta la primera vez o cuando cambian las **dependencias nativas** (los cambios de
TypeScript se cargan desde el PC sin APK nuevo). La carpeta `android/` se **genera** a partir de
`app.json` y no se guarda en el repositorio:

```bash
cd apps/mobile
npx expo prebuild --platform android
cd android
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
# APK: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

En Windows (PowerShell) el comando es `.\gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`.
El parámetro `-PreactNativeArchitectures=arm64-v8a` compila solo para arm64 (todos los Android
de los últimos años) y tarda unas 4 veces menos; quítalo para incluir todas las arquitecturas.
Si Gradle se queda sin memoria, añade `-Dorg.gradle.jvmargs=-Xmx3g`.

Para instalarlo: copia el APK al móvil, ábrelo y permite **instalar apps de orígenes
desconocidos**. Está firmado con la clave de depuración estándar, así que Play Protect puede
avisar (_Instalar de todas formas_). **No pide permisos peligrosos:** el permiso de actividad
física que añade `expo-sensors` está bloqueado en `app.json` (`blockedPermissions`), así que
cualquier `prebuild` lo quita automáticamente.

### Simular la inclinación en el navegador

Con `npm run web` en modo desarrollo — o en cualquier versión web añadiendo `?inclinar` a la
URL — se simula el acelerómetro con el teclado (haz clic antes en la página):

| Tecla           | Efecto                                               |
| --------------- | ---------------------------------------------------- |
| `←` / `→`       | Girar el móvil 5° a izquierda / derecha              |
| `Mayús` + `←/→` | Girar 30° (dos veces + una normal ≈ 65°; tres = 90°) |
| `↑` / `↓`       | Inclinarlo hacia atrás / delante (mueve la luz)      |
| `V`             | Voltear 180° de golpe                                |
| `0`             | Volver a «de pie»                                    |
| `Alt` + ratón   | Mover el ratón con Alt pulsado gira el móvil         |

Antes de la primera tecla no se simula nada.

**Probar los ciclos sin esperar:** en desarrollo, añade `?velocidad=60` a la URL de la web y el
tiempo corre 60 veces más rápido (un 25/5 dura 30 s). Solo funciona en modo desarrollo.

Para exportar la web estática:
`cd apps/mobile && npx expo export --platform web` (sale en `dist/`).

## Tests y calidad

```bash
npm run check        # tipos + ESLint + formato (Prettier) + tests, todo seguido
npm test             # solo los tests (Vitest, paquete core)
npm run test:coverage
```

El núcleo (`packages/core`) tiene **140 tests** en 16 archivos: temporizador (incluidos casos
extremos del final de la cuenta y entradas NaN/Infinity), duraciones, avisos, vibración,
ajustes (y su migración), ciclos y motor de sesiones (fases encadenadas sin perder ni un
milisegundo, pausa, volteo, guardado), geometría, simulación de arena (avalanchas, volteo,
aterrizaje), chorro de granos, filtro del acelerómetro y máquina de estados de pausa/volteo.
La app se comprueba con tipos, ESLint (incluido React Compiler), pruebas de extremo a extremo
en la web con Playwright y pruebas manuales en Android (ver [CHANGELOG](CHANGELOG.md)).

## Rendimiento y memoria

Medido en la versión web (Chromium sin GPU, 390×844, ~25 s con el chorro activo; versión 1.4):

| Momento                                 | Memoria WASM (CanvasKit) | JS heap | FPS |
| --------------------------------------- | ------------------------ | ------- | --- |
| Al abrir                                | 128,0 MB                 | 24,2 MB | —   |
| En marcha                               | 128,0 MB                 | 24,9 MB | ~52 |
| Tras pausar, reanudar y voltear (≈25 s) | 128,0 MB                 | 25,4 MB | ~39 |

- **La memoria no crece:** no se crea ningún objeto Skia ni JS persistente por fotograma (todo
  se reutiliza o se libera con retraso). Los 128 MB son la reserva inicial de CanvasKit.
- Los FPS de la tabla son **sin GPU** (todo por software); en el móvil, con GPU, la animación
  va fluida. La simulación cuesta ~0,2 ms por fotograma; con la arena quieta el bucle se duerme.
- Detalles y mediciones de cada versión en el [CHANGELOG](CHANGELOG.md).

## Hoja de ruta

- [x] **Fase 1** — Temporizador, simulación de arena, vidrio 2.5D, temas, web (1.0–1.2).
- [x] **Fase 2** — Inclinación, pausa de lado, volteo y vibración (1.3).
- [x] **Pulido de realismo** — Tonos y destellos de los granos, imperfecciones del vidrio (1.4).
- [x] **Fase 3 — Menú discreto y ciclos:** tema claro/oscuro/automático, tiempos rápidos,
      ciclos trabajo/descanso (adelanta la antigua fase 4), sonido, vibración y entrada
      animada (1.5).
- [ ] Menú: modelo de reloj, contenido y volumen del sonido.
- [ ] **Fase 5 — Notificaciones** al terminar en segundo plano y persistencia de la cuenta en
      curso (`serializeTimer`/`parseTimer` ya existen).
- [ ] **Fase 6 — Agua:** nuevo contenido con su propia simulación de fluido.
- [ ] **Google Play:** build de producción firmada (AAB), icono y splash propios, ficha y
      política de privacidad.
- [ ] **Escritorio (Tauri):** reutiliza `<Hourglass>` y `@reloj/core` sobre la versión web.
- [ ] **iPhone:** probar en un dispositivo real (el signo del acelerómetro en iOS está sin
      verificar) y publicar en la App Store.
- [ ] Inclinar hacia delante/atrás que también mueva la arena (hoy solo mueve la luz).

## Versiones principales

| Paquete                                   | Versión                          |
| ----------------------------------------- | -------------------------------- |
| Expo SDK                                  | 58 (`expo` 58.0.17)              |
| React Native                              | 0.88.0                           |
| React                                     | 19.3.0                           |
| @shopify/react-native-skia                | 2.14.0 (CanvasKit 0.41.0 en web) |
| react-native-reanimated / worklets        | 4.7.1 / 0.13.0                   |
| react-native-gesture-handler              | 3.3.0 (API de hooks v3)          |
| @react-native-async-storage/async-storage | 2.2.0                            |
| expo-audio                                | 58.0.10 (nuevo en 1.1)           |
| expo-dev-client                           | 58.0.14 (nuevo en 1.1)           |
| expo-haptics                              | 58.0.7 (nuevo en 1.3)            |
| expo-sensors                              | 58.0.4 (nuevo en 1.3)            |
| TypeScript                                | 6.0.3                            |
| Vitest                                    | 5.0.5                            |
| ESLint / Prettier                         | 9.39 / 3.9                       |
| Node.js usado para desarrollar            | 22.23.4                          |
| APK: JDK / Gradle / NDK                   | 17 / 9.4.1 / 27.1 (solo arm64)   |

Tipografía: **Manrope** (ExtraLight para el tiempo; Light, Regular, Medium y SemiBold en el
menú y los rótulos), vía `@expo-google-fonts/manrope`.

Los avisos de licencia de las dependencias están en
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Licencia

[MIT](LICENSE) © 2026 Sebastián Zaruha.

## Autor

**Sebastián Zaruha** — [github.com/SebastianZaruha](https://github.com/SebastianZaruha)
