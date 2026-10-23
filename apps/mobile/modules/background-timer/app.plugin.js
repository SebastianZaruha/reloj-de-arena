/**
 * Plugin de configuración de Expo para el módulo de segundo plano.
 *
 * Los avisos de la notificación suenan con los MISMOS mp3 que la app
 * (assets/sounds). Un canal de notificación de Android solo puede usar un
 * sonido de `res/raw`, así que en cada `npx expo prebuild` este plugin los
 * copia allí con un prefijo (para no chocar con recursos de otras librerías):
 *
 *   assets/sounds/fin.mp3    → android/app/src/main/res/raw/reloj_fin.mp3
 *   assets/sounds/cambio.mp3 → android/app/src/main/res/raw/reloj_cambio.mp3
 *
 * La carpeta android/ se genera y no se versiona: la única copia de los
 * sonidos sigue siendo la de assets/sounds.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const SOUNDS = { 'fin.mp3': 'reloj_fin.mp3', 'cambio.mp3': 'reloj_cambio.mp3' };

module.exports = function withBackgroundTimerSounds(config) {
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
};
