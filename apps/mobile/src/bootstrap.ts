/**
 * Arranque en Android/iOS: registramos el componente raíz directamente.
 * (En web hace falta cargar antes CanvasKit; ver bootstrap.web.ts.)
 */
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
