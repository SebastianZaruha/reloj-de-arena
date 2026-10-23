/**
 * Hook de segundo plano (1.7, Android): mantiene la notificación y las
 * alarmas al día con la sesión, y la sesión al día con lo que se haga desde
 * la notificación. También pide los permisos (una vez) y dice si falta
 * alguno, para mostrarlo en el menú.
 *
 * Cuándo se envía el estado al módulo nativo: cada vez que cambia la sesión
 * (empezar, pausar, reanudar, voltear, reiniciar, cambio de fase, otro plan
 * desde el menú) o el idioma, el sonido, la vibración, la ventana flotante o
 * el tema. No en cada refresco:
 * el cronómetro de la notificación lo cuenta Android solo.
 */
import type { Messages, Settings } from '@reloj/core';
import { useEffect, useState } from 'react';
import { Alert, AppState, PermissionsAndroid, Platform } from 'react-native';

import { BackgroundTimer, type BackgroundPermissions } from '../../modules/background-timer';
import { countNative } from '../dev/diagnostics';
import { appClock } from '../dev/devClock';
import type { UseSession } from '../hooks/useSession';
import { useLatest } from '../hooks/useLatest';
import { pendingNativeChange, syncBackground } from './backgroundSync';

type SettingsPatch = Partial<Omit<Settings, 'version' | 'updatedAt'>>;

/** Aviso del menú cuando falta un permiso: texto y qué hacer al tocarlo. */
export interface AlertsNotice {
  readonly text: string;
  readonly onPress: () => void;
}

const ALL_GRANTED: BackgroundPermissions = { notifications: true, exactAlarms: true, overlay: true };

/** El permiso de notificaciones se pide en tiempo de ejecución desde Android 13. */
const NEEDS_RUNTIME_PERMISSION = Platform.OS === 'android' && Number(Platform.Version) >= 33;

export function readPermissions(): BackgroundPermissions {
  try {
    countNative('getPermissions');
    return BackgroundTimer?.getPermissions() ?? ALL_GRANTED;
  } catch {
    return ALL_GRANTED;
  }
}

/** Pide el permiso de notificaciones. true si queda concedido. */
async function requestNotifications(): Promise<boolean> {
  if (!NEEDS_RUNTIME_PERMISSION) return readPermissions().notifications;
  try {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

interface Options {
  readonly session: UseSession;
  readonly settings: Settings;
  readonly update: (patch: SettingsPatch) => void;
  readonly tr: Messages;
}

export function useBackgroundTimer({ session, settings, update, tr }: Options): AlertsNotice | null {
  const [permissions, setPermissions] = useState(readPermissions);
  const latest = useLatest({ session, settings, tr, permissions });

  // Acciones estables: se crean una vez y leen siempre lo último de `latest`.
  const [actions] = useState(() => {
    /** Aplica lo que se haya hecho desde la notificación (pausar, reanudar, reiniciar). */
    const catchUp = () => {
      const s = latest.current.session;
      const next = pendingNativeChange(s.state.plan, appClock.now());
      if (next && next !== 'stale') s.adopt(next);
    };
    /** Envía el estado actual; si el módulo lo rechaza, primero se pone al día. */
    const send = (force = false) => {
      const { session: s, settings: p, tr: t } = latest.current;
      const options = {
        sound: p.sound,
        vibration: p.haptics,
        floating: p.floatingWindow,
        theme: p.theme,
        force,
      };
      if (syncBackground(s.state, appClock.now(), t, options)) return;
      catchUp();
      // Con la sesión de la notificación (o, si no se pudo aplicar, la de la app).
      syncBackground(latest.current.session.state, appClock.now(), t, { ...options, force: true });
    };
    /** Relee los permisos (pueden haberse cambiado en Ajustes) y vuelve a pintar la notificación. */
    const refresh = () => {
      const now = readPermissions();
      const old = latest.current.permissions;
      if (
        now.notifications !== old.notifications ||
        now.exactAlarms !== old.exactAlarms ||
        now.overlay !== old.overlay
      ) {
        setPermissions(now);
      }
      // Forzado: en Android 14+ la notificación se puede descartar deslizando y así vuelve.
      send(true);
    };
    return { catchUp, send, refresh };
  });

  useEffect(() => {
    if (!BackgroundTimer) return;
    const native = BackgroundTimer;
    // Botones de la notificación con la app abierta (o en segundo plano, viva).
    const change = native.addListener('onChange', () => {
      actions.catchUp();
      actions.send();
    });
    // A la vista o no: decide quién avisa, la app o la notificación. Al volver,
    // nos ponemos al día, releemos los permisos y repintamos la notificación.
    countNative('setForeground');
    native.setForeground(AppState.currentState !== 'background');
    const visibility = AppState.addEventListener('change', (state) => {
      countNative('setForeground');
      native.setForeground(state === 'active');
      if (state !== 'active') return;
      actions.catchUp();
      actions.refresh();
    });
    return () => {
      change.remove();
      visibility.remove();
    };
  }, [actions]);

  // Cada cambio de la sesión, del idioma, de los interruptores o del tema →
  // notificación (y ventana flotante).
  // (Va después del efecto de arriba: al arrancar, el módulo ya sabe que la
  // app está a la vista y no repite avisos atrasados.)
  useEffect(() => {
    actions.send();
  }, [session.state, tr, settings.sound, settings.haptics, settings.floatingWindow, settings.theme, actions]);

  // Al empezar el PRIMER reloj se explica y se pide el permiso (una sola vez).
  const askNow =
    BackgroundTimer !== null && session.view.status === 'running' && !settings.alertsPermissionAsked;
  useEffect(() => {
    if (!askNow) return;
    update({ alertsPermissionAsked: true });
    const current = readPermissions();
    if (!current.notifications && NEEDS_RUNTIME_PERMISSION) {
      Alert.alert(tr.permissionTitle, tr.permissionBody, [
        { text: tr.permissionNotNow, style: 'cancel' },
        { text: tr.permissionAllow, onPress: () => void requestNotifications().then(actions.refresh) },
      ]);
    } else if (current.notifications && !current.exactAlarms) {
      Alert.alert(tr.exactAlarmTitle, tr.exactAlarmBody, [
        { text: tr.permissionNotNow, style: 'cancel' },
        { text: tr.openSystemSettings, onPress: () => BackgroundTimer?.openExactAlarmSettings() },
      ]);
    }
    // Solo al pasar a «hay que preguntar» (los textos o `update` no cuentan).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askNow]);

  if (!BackgroundTimer) return null;
  const native = BackgroundTimer;
  if (!permissions.notifications) {
    return {
      text: tr.alertsBlocked,
      onPress: () => {
        // Primero el diálogo del sistema; si ya no sale (denegado dos veces),
        // los ajustes de notificaciones de la app.
        void requestNotifications().then((granted) => {
          if (!granted) native.openNotificationSettings();
          actions.refresh();
        });
      },
    };
  }
  if (!permissions.exactAlarms) {
    return { text: tr.exactAlarmsBlocked, onPress: () => native.openExactAlarmSettings() };
  }
  return null;
}
