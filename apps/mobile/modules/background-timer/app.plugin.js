/**
 * Plugin de configuración de Expo para el módulo de segundo plano. En cada
 * `npx expo prebuild` hace dos cosas en la carpeta android/ (que se genera
 * y no se versiona):
 *
 * 1. Sonidos. Los avisos de la notificación suenan con los MISMOS mp3 que la
 *    app (assets/sounds). Un canal de notificación de Android solo puede
 *    usar un sonido de `res/raw`, así que se copian allí con un prefijo
 *    (para no chocar con recursos de otras librerías):
 *
 *      assets/sounds/fin.mp3    → android/app/src/main/res/raw/reloj_fin.mp3
 *      assets/sounds/cambio.mp3 → android/app/src/main/res/raw/reloj_cambio.mp3
 *
 * 2. Imagen en imagen (1.8). La actividad principal declara
 *    `android:supportsPictureInPicture="true"`: es el plan B de la ventana
 *    flotante cuando no hay permiso para dibujar encima de otras apps.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const SOUNDS = { 'fin.mp3': 'reloj_fin.mp3', 'cambio.mp3': 'reloj_cambio.mp3' };

function withSounds(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const raw = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'raw');
      fs.mkdirSync(raw, { recursive: true });
      for (const [from, to] of Object.entries(SOUNDS)) {
        fs.copyFileSync(path.join(root, 'assets', 'sounds', from), path.join(raw, to));
      }
      return cfg;
    },
  ]);
}

function withPictureInPicture(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (main) main.$['android:supportsPictureInPicture'] = 'true';
    return cfg;
  });
}

module.exports = function withBackgroundTimer(config) {
  return withPictureInPicture(withSounds(config));
};
