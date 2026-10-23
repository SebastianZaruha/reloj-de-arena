/**
 * Textos de la app en español e inglés (1.6).
 *
 * Un diccionario es un objeto plano: textos fijos o funciones pequeñas para
 * los que llevan números. `es` define la forma (`Messages`) y `en` tiene que
 * cumplirla: si falta o sobra una clave, TypeScript no compila (y un test
 * lo comprueba también en tiempo de ejecución).
 *
 * Los nombres de los idiomas del selector no se traducen: «Español» y
 * «English» se escriben siempre en su propio idioma.
 */
import { describeDuration } from '../timer/duration';

export type Language = 'es' | 'en';
export const LANGUAGES: readonly Language[] = ['es', 'en'];

/** Nombre de cada idioma en su propio idioma (selector). */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = { es: 'Español', en: 'English' };

/** Fase de un ciclo. */
export type PhaseKindName = 'focus' | 'break';

const roundsEs = (n: number) => `${n} ${n === 1 ? 'ronda' : 'rondas'}`;
const roundsEn = (n: number) => `${n} ${n === 1 ? 'round' : 'rounds'}`;
const minutesEs = (n: number) => `${n} ${n === 1 ? 'minuto' : 'minutos'}`;
const minutesEn = (n: number) => `${n} ${n === 1 ? 'minute' : 'minutes'}`;

export const es = {
  // ─── Pantalla del reloj ───
  hourglass: 'Reloj de arena',
  hourglassHint:
    'Desliza hacia arriba o hacia abajo para cambiar el tiempo. Toca dos veces para empezar o pausar.',
  moreTime: 'Más tiempo',
  lessTime: 'Menos tiempo',
  start: 'Empezar',
  pause: 'Pausar',
  restart: 'Reiniciar',
  /** Rótulo grande de la pausa. */
  paused: 'Pausa',
  work: 'Trabajo',
  break: 'Descanso',
  phaseLabel: (kind: PhaseKindName, round: number, rounds: number) =>
    `${kind === 'focus' ? 'Trabajo' : 'Descanso'} ${round}/${rounds}`,
  phaseSpoken: (kind: PhaseKindName, round: number, rounds: number) =>
    `${kind === 'focus' ? 'Trabajo' : 'Descanso'}, ronda ${round} de ${rounds}`,
  hintIdle: 'desliza para elegir · toca para empezar',
  hintPaused: 'mantén pulsado para reiniciar',
  hintFinished: 'toca para volver a empezar',
  hintCyclesFinished: 'ciclos completados · toca para empezar',
  duration: (ms: number) => describeDuration(ms, 'es'),
  readyToStart: (duration: string) => `${duration}. Listo para empezar`,
  remaining: (duration: string) => `Quedan ${duration}`,
  pausedRemaining: (duration: string) => `En pausa. Quedan ${duration}`,
  timeUp: 'Tiempo terminado',
  cyclesDone: 'Ciclos terminados',
  // ─── Menú ───
  settings: 'Ajustes',
  openSettings: 'Abre el menú de ajustes',
  closeSettingsHint: 'Cierra el menú de ajustes',
  closeSettings: 'Cerrar ajustes',
  theme: 'Tema',
  themeLight: 'Claro',
  themeDark: 'Oscuro',
  automatic: 'Automático',
  language: 'Idioma',
  quickTimes: 'Tiempos rápidos',
  quickTimesMin: 'Tiempos rápidos · min',
  minutes: minutesEs,
  session: 'Sesión',
  sessionType: 'Tipo de sesión',
  single: 'Sesión única',
  cycles: 'Ciclos',
  cycle: 'Ciclo',
  custom: 'Personalizado',
  presetSpoken: (work: number, rest: number) => `${work} minutos de trabajo y ${rest} de descanso`,
  rounds: 'Rondas',
  roundsCount: roundsEs,
  summaryCycles: (work: number, rest: number, rounds: number) =>
    `Ciclos · ${work}/${rest} · ${roundsEs(rounds)}`,
  summarySingle: (duration: string) => `Sesión única · ${duration}`,
  cycleSummary: (work: number, rest: number, rounds: number) =>
    `Trabajo ${work} min · Descanso ${rest} min · ${roundsEs(rounds)}`,
  sound: 'Sonido',
  vibration: 'Vibración',
  more: 'Más',
  less: 'Menos',
};

export type Messages = typeof es;

export const en: Messages = {
  hourglass: 'Hourglass',
  hourglassHint: 'Swipe up or down to change the time. Double-tap to start or pause.',
  moreTime: 'More time',
  lessTime: 'Less time',
  start: 'Start',
  pause: 'Pause',
  restart: 'Restart',
  paused: 'Paused',
  work: 'Work',
  break: 'Break',
  phaseLabel: (kind, round, rounds) => `${kind === 'focus' ? 'Work' : 'Break'} ${round}/${rounds}`,
  phaseSpoken: (kind, round, rounds) => `${kind === 'focus' ? 'Work' : 'Break'}, round ${round} of ${rounds}`,
  hintIdle: 'swipe to choose · tap to start',
  hintPaused: 'press and hold to restart',
  hintFinished: 'tap to start again',
  hintCyclesFinished: 'cycles complete · tap to start',
  duration: (ms) => describeDuration(ms, 'en'),
  readyToStart: (duration) => `${duration}. Ready to start`,
  remaining: (duration) => `${duration} left`,
  pausedRemaining: (duration) => `Paused. ${duration} left`,
  timeUp: "Time's up",
  cyclesDone: 'Cycles finished',
  settings: 'Settings',
  openSettings: 'Opens the settings menu',
  closeSettingsHint: 'Closes the settings menu',
  closeSettings: 'Close settings',
  theme: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  automatic: 'Automatic',
  language: 'Language',
  quickTimes: 'Quick times',
  quickTimesMin: 'Quick times · min',
  minutes: minutesEn,
  session: 'Session',
  sessionType: 'Session type',
  single: 'Single session',
  cycles: 'Cycles',
  cycle: 'Cycle',
  custom: 'Custom',
  presetSpoken: (work, rest) => `${work} minutes of work and ${rest} of break`,
  rounds: 'Rounds',
  roundsCount: roundsEn,
  summaryCycles: (work, rest, rounds) => `Cycles · ${work}/${rest} · ${roundsEn(rounds)}`,
  summarySingle: (duration) => `Single session · ${duration}`,
  cycleSummary: (work, rest, rounds) => `Work ${work} min · Break ${rest} min · ${roundsEn(rounds)}`,
  sound: 'Sound',
  vibration: 'Vibration',
  more: 'More',
  less: 'Less',
};

export const MESSAGES: Readonly<Record<Language, Messages>> = { es, en };

/** Lo que se guarda en ajustes: un idioma fijo o 'system' (Automático). */
export type LanguagePreference = 'system' | Language;

/**
 * Idioma a usar. «Automático» sigue al del dispositivo: cualquier variante
 * del español (es, es-ES, es-419...) → español; cualquier otro → inglés.
 * Si no se sabe el idioma del dispositivo, español (el de siempre).
 */
export function resolveLanguage(pref: LanguagePreference, deviceLocale: string | null | undefined): Language {
  if (pref === 'es' || pref === 'en') return pref;
  if (typeof deviceLocale !== 'string' || deviceLocale.trim() === '') return 'es';
  return /^es(?:[-_]|$)/i.test(deviceLocale.trim()) ? 'es' : 'en';
}

/** Textos del idioma elegido. */
export function messagesFor(pref: LanguagePreference, deviceLocale: string | null | undefined): Messages {
  return MESSAGES[resolveLanguage(pref, deviceLocale)];
}
