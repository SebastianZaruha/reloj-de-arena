/**
 * Lo que la app envía al módulo nativo de segundo plano (fase 4, Android).
 *
 * El módulo nativo no sabe nada de ciclos ni de idiomas: recibe un JSON con
 *   - la sesión resumida (`BackgroundSession`) y los avisos que faltan,
 *   - los textos ya traducidos: el título de cada tramo («Trabajo 1/4»,
 *     «Descanso 1/4» o «Temporizador»), el aviso de cada cambio de fase, el
 *     de fin, los botones y los nombres de los canales de notificación,
 *   - los interruptores «Sonido» y «Vibración» del menú,
 *   - la ventana flotante (1.8): si está activada y el tema elegido.
 *
 * Algunos textos llevan la hora o el tiempo restante, que solo se sabe en el
 * momento de mostrarlos (p. ej. tras pausar desde la notificación con la app
 * cerrada). Por eso van como PLANTILLAS con la marca `TIME_TOKEN`, y el
 * módulo nativo la sustituye: «Hasta las {t}» → «Hasta las 17:25».
 */
import type { Messages } from '../i18n/messages';
import type { ThemePreference } from '../settings/settings';
import { roundOfSegment, roundsInPlan } from '../session/cycles';
import type { SessionState } from '../session/session';
import {
  backgroundEvents,
  toBackgroundSession,
  type BackgroundEvent,
  type BackgroundSession,
} from './schedule';

/** Marca que el módulo nativo sustituye por una hora o un tiempo. */
export const TIME_TOKEN = '{t}';

/** Textos de un tramo. */
export interface SegmentTexts {
  /** Título de la notificación mientras dura el tramo. */
  readonly title: string;
  /** Texto del aviso cuando EMPIEZA este tramo (cambio de fase). */
  readonly alert: string;
}

export interface BackgroundTexts {
  readonly finishedTitle: string;
  readonly finishedBody: string;
  readonly pause: string;
  readonly resume: string;
  readonly restart: string;
  /** Plantilla «Hasta las {t}». */
  readonly until: string;
  /** Plantilla «En pausa · quedan {t}». */
  readonly pausedLeft: string;
  readonly channelCountdown: string;
  readonly channelFinished: string;
  readonly channelPhase: string;
  readonly channelSoundOnly: string;
  readonly channelVibrationOnly: string;
  /** Ventana flotante, para el lector de pantalla (1.8). */
  readonly floatingLabel: string;
  readonly floatingHint: string;
  readonly floatingClose: string;
}

export interface BackgroundPayload {
  /** null: no hay nada que seguir (en reposo o terminada) → se quita todo. */
  readonly session: BackgroundSession | null;
  readonly events: readonly BackgroundEvent[];
  readonly segments: readonly SegmentTexts[];
  readonly texts: BackgroundTexts;
  readonly sound: boolean;
  readonly vibration: boolean;
  /** ¿Mostrar la ventana flotante al salir de la app con el reloj en marcha? (1.8) */
  readonly floating: boolean;
  /** Tema para la ventana flotante: Android resuelve «Automático» con el del sistema. */
  readonly theme: ThemePreference;
  /**
   * Último cambio hecho desde la notificación que la app ya conoce. Si el
   * módulo nativo tiene uno más nuevo, rechaza este envío (es de antes).
   */
  readonly seenSeq: number;
}

export interface BackgroundOptions {
  readonly sound: boolean;
  readonly vibration: boolean;
  readonly seenSeq: number;
  /** Ventana flotante (1.8); sin decir nada, apagada y con el tema automático. */
  readonly floating?: boolean;
  readonly theme?: ThemePreference;
}

/** Monta el envío al módulo nativo para la sesión en `now`. */
export function backgroundPayload(
  state: SessionState,
  now: number,
  tr: Messages,
  options: BackgroundOptions,
): BackgroundPayload {
  const session = toBackgroundSession(state, now);
  const { plan } = state;
  const isCycle = plan.segments.length > 1;
  const rounds = roundsInPlan(plan);
  const segments = plan.segments.map((seg, i): SegmentTexts => {
    if (!isCycle) return { title: tr.notifTimer, alert: '' };
    return {
      title: tr.phaseLabel(seg.kind, roundOfSegment(plan, i), rounds),
      alert: tr.notifPhaseAlert(seg.kind, tr.duration(seg.durationMs)),
    };
  });
  return {
    session,
    events: session ? backgroundEvents(session) : [],
    segments,
    texts: backgroundTexts(tr, isCycle),
    sound: options.sound,
    vibration: options.vibration,
    floating: options.floating ?? false,
    theme: options.theme ?? 'system',
    seenSeq: options.seenSeq,
  };
}

function backgroundTexts(tr: Messages, isCycle: boolean): BackgroundTexts {
  return {
    finishedTitle: isCycle ? tr.cyclesDone : tr.timeUp,
    finishedBody: tr.notifFinishedBody,
    pause: tr.pause,
    resume: tr.notifResume,
    restart: tr.restart,
    until: tr.notifUntil(TIME_TOKEN),
    pausedLeft: tr.notifPausedLeft(TIME_TOKEN),
    channelCountdown: tr.channelCountdown,
    channelFinished: tr.channelFinished,
    channelPhase: tr.channelPhase,
    channelSoundOnly: tr.channelSoundOnly,
    channelVibrationOnly: tr.channelVibrationOnly,
    floatingLabel: tr.floatingLabel,
    floatingHint: tr.floatingHint,
    floatingClose: tr.floatingClose,
  };
}
