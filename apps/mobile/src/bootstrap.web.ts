/**
 * Arranque en web.
 *
 * En web, Skia funciona gracias a CanvasKit (Skia compilado a WebAssembly).
 * Hay que descargar `canvaskit.wasm` ANTES de importar cualquier componente
 * que use Skia; por eso importamos App de forma dinámica, después de cargarlo.
 *
 * El archivo .wasm se copia a `public/` con el script `setup-skia-web`
 * (se ejecuta solo en `postinstall`). Esta misma configuración servirá
 * para la app de escritorio (Tauri), que mostrará la versión web.
 */
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { registerRootComponent } from 'expo';

LoadSkiaWeb({ locateFile: (file: string) => `/${file}` })
  .then(async () => {
    const { default: App } = await import('./App');
    registerRootComponent(App);
  })
  .catch((error: unknown) => {
    console.error('No se pudo cargar CanvasKit (Skia web):', error);
  });
