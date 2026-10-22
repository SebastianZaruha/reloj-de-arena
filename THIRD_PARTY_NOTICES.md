# Avisos de terceros

El código del Reloj de Arena se publica con licencia [MIT](LICENSE). La app usa las siguientes
dependencias de código abierto (versiones y licencias comprobadas en el campo `license` de
cada `package.json` instalado y en sus archivos `LICENSE`). Ninguna se incluye en este
repositorio: se descargan con `npm install`.

## Dependencias de la app (se distribuyen dentro del APK / la web)

| Paquete                                               | Versión | Licencia     | Titular                                                   |
| ----------------------------------------------------- | ------- | ------------ | --------------------------------------------------------- |
| react, react-dom                                      | 19.3.0  | MIT          | Meta Platforms, Inc. and affiliates                       |
| react-native                                          | 0.88.0  | MIT          | Meta Platforms, Inc. and affiliates                       |
| react-native-web                                      | 0.21.4  | MIT          | Nicolas Gallagher                                         |
| expo                                                  | 58.0.17 | MIT          | 650 Industries, Inc. (Expo)                               |
| expo-audio, expo-dev-client, expo-font, expo-haptics, | 58.0.x  | MIT          | 650 Industries, Inc. (Expo)                               |
| expo-keep-awake, expo-sensors, expo-status-bar,       |         |              |                                                           |
| expo-system-ui                                        |         |              |                                                           |
| @shopify/react-native-skia                            | 2.14.0  | MIT          | Shopify Inc. / William Candillon                          |
| Skia (motor gráfico nativo incluido por RN Skia)      | —       | BSD-3-Clause | Google Inc.                                               |
| canvaskit-wasm (Skia para la web)                     | 0.41.0  | BSD-3-Clause | Google Inc.                                               |
| react-native-reanimated                               | 4.7.1   | MIT          | Software Mansion                                          |
| react-native-worklets                                 | 0.13.0  | MIT          | Software Mansion                                          |
| react-native-gesture-handler                          | 3.3.0   | MIT          | Software Mansion                                          |
| react-native-safe-area-context                        | 5.10.1  | MIT          | Th3rd Wave                                                |
| @react-native-async-storage/async-storage             | 2.2.0   | MIT          | Facebook, Inc. (React Native Community)                   |
| @expo-google-fonts/manrope (paquete)                  | 0.4.2   | MIT          | Expo                                                      |
| **Fuente Manrope** (ExtraLight y Regular)             | —       | SIL OFL 1.1  | The Manrope Project Authors (github.com/sharanda/manrope) |

La fuente Manrope se distribuye bajo la [SIL Open Font License 1.1](https://openfontlicense.org):
se puede usar, incluir y redistribuir con la app libremente; no se puede vender la fuente por
separado y su texto de licencia debe acompañarla si se redistribuye como archivo de fuente.

Los textos completos de cada licencia están en `node_modules/<paquete>/LICENSE` tras
`npm install`. Las licencias MIT y BSD-3-Clause exigen conservar el aviso de copyright y la
licencia; para una versión publicada (Google Play) conviene mostrarlos en una pantalla de
«Licencias» o enlazar a este archivo.

## Herramientas de desarrollo (no se distribuyen con la app)

| Paquete                                                               | Licencia   |
| --------------------------------------------------------------------- | ---------- |
| typescript                                                            | Apache-2.0 |
| vitest, @vitest/coverage-v8                                           | MIT        |
| eslint, typescript-eslint, eslint-config-expo, eslint-config-prettier | MIT        |
| prettier                                                              | MIT        |

## Recursos

| Recurso                                            | Origen                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/mobile/assets/sounds/fin.mp3` (aviso de fin) | Aportado por el autor. **Origen y licencia pendientes de confirmar.**   |
| Iconos y splash (`apps/mobile/assets/*.png`)       | Plantilla de `create-expo-app` (MIT, Expo). Se sustituirán por propios. |
| Capturas (`docs/capturas/`)                        | Generadas a partir de la propia app.                                    |
