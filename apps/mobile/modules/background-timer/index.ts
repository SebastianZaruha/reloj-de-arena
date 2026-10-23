/**
 * Módulo nativo de segundo plano (Android): notificación con la cuenta atrás,
 * botones y avisos con la app cerrada. El código nativo está en `android/`
 * (Kotlin) y la explicación en docs/SEGUNDO_PLANO.md.
 *
 * `requireOptionalNativeModule` devuelve null si el módulo no está compilado
 * en la app: en la web, en Expo Go o con un APK de desarrollo anterior a la
 * 1.7. Entonces `BackgroundTimer` es null y la app funciona como antes, sin
 * notificación.
 */
import { requireOptionalNativeModule, type NativeModule } from 'expo';

export interface BackgroundPermissions {
  /** ¿Se pueden mostrar notificaciones? (permiso de Android 13+ y no bloqueadas) */
  readonly notifications: boolean;
  /** ¿Se pueden programar alarmas exactas? (Android 12+: «Alarmas y recordatorios») */
  readonly exactAlarms: boolean;
}

type Events = {
  /** Se ha pausado, reanudado o reiniciado desde la notificación. */
  onChange: (event: { seq: number }) => void;
};

declare class BackgroundTimerModule extends NativeModule<Events> {
  /** Envía el estado (JSON de `BackgroundPayload`). false = envío antiguo: hay que ponerse al día. */
  sync(json: string): boolean;
  /** `{ session, seq }` en JSON, o null si nunca se guardó nada. */
  getState(): string | null;
  setForeground(active: boolean): void;
  getPermissions(): BackgroundPermissions;
  openNotificationSettings(): void;
  openExactAlarmSettings(): void;
}

export const BackgroundTimer = requireOptionalNativeModule<BackgroundTimerModule>('BackgroundTimer');
