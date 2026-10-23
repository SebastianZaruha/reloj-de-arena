/**
 * Diagnóstico oculto (1.8.3): mide en el propio móvil qué pasa al abrir el
 * menú, y permite cambiar en vivo la forma de dibujar el vidrio.
 *
 * Se enciende y se apaga con una PULSACIÓN LARGA en el título «Ajustes» de
 * la hoja. Encendido:
 *   - un recuadro arriba a la izquierda (DiagnosticsOverlay) con los fps de
 *     JavaScript y de la interfaz y los tiempos de la última apertura;
 *   - al final de la hoja, una sección «Diagnóstico» con los modos de prueba.
 *
 * Apagado no cuesta nada: `mark` y `countNative` solo guardan un número.
 *
 * Tiempos: todo en `Date.now()` (milisegundos del reloj del sistema), que
 * vale igual en el hilo de JS y en el de la interfaz; las marcas del hilo de
 * la interfaz se toman ALLÍ (el valor viaja después a JS, así que un hilo de
 * JS ocupado no las retrasa).
 *
 * Las opciones se guardan aparte de los ajustes (clave propia en
 * AsyncStorage): así sobreviven a reiniciar la app (para medir la primera
 * apertura) y no tocan el formato de los ajustes del core.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * Cómo se dibuja el vidrio de la hoja:
 *   - `live`: BackdropBlur montado al abrir (lo normal, como la 1.6);
 *   - `premounted`: BackdropBlur montado desde el arranque (cerrado queda
 *     fuera de la pantalla y Skia no dibuja nada);
 *   - `flat`: sin leer la pantalla: un panel del color del tema con un
 *     degradado suave, sin desenfoque.
 */
export type GlassMode = 'live' | 'premounted' | 'flat';

export interface DiagnosticsOptions {
  readonly enabled: boolean;
  readonly glass: GlassMode;
  /** La hoja aparece de golpe (sin animación de Reanimated). */
  readonly noAnimation: boolean;
  /** La arena no se mueve mientras la hoja está a la vista (libera el hilo de JS). */
  readonly freezeSand: boolean;
}

const KEY = 'reloj-de-arena/diagnostico';
const DEFAULTS: DiagnosticsOptions = { enabled: false, glass: 'live', noAnimation: false, freezeSand: false };

let options: DiagnosticsOptions = DEFAULTS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function isGlass(v: unknown): v is GlassMode {
  return v === 'live' || v === 'premounted' || v === 'flat';
}

/** Se lee una vez al arrancar (sin esperar a nada: hasta entonces, apagado). */
void AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (!raw) return;
    const r = JSON.parse(raw) as Partial<Record<keyof DiagnosticsOptions, unknown>>;
    options = {
      enabled: r.enabled === true,
      glass: isGlass(r.glass) ? r.glass : 'live',
      noAnimation: r.noAnimation === true,
      freezeSand: r.freezeSand === true,
    };
    emit();
  })
  .catch(() => {});

export function getDiagnostics(): DiagnosticsOptions {
  return options;
}

export function setDiagnostics(patch: Partial<DiagnosticsOptions>): void {
  options = { ...options, ...patch };
  emit();
  void AsyncStorage.setItem(KEY, JSON.stringify(options)).catch(() => {});
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useDiagnostics(): DiagnosticsOptions {
  return useSyncExternalStore(subscribe, getDiagnostics, getDiagnostics);
}

// ─── Mediciones de una apertura ──────────────────────────────────────────

/**
 * Marcas de una apertura, por orden:
 *   pressIn    el toque llega a JS (Pressable onPressIn)
 *   pressOut   se levanta el dedo (llega a JS)
 *   onPress    se ejecuta el manejador del botón
 *   show       useSheet.show(): estado y animación pedidos
 *   render     empieza el render de la pantalla con la hoja abierta
 *   commit     primer render de la hoja abierta ya aplicado (useLayoutEffect)
 *   panel      el vidrio (FrostedPanel) montado en el lienzo (solo modo `live`)
 *   uiFirst    hilo de la interfaz: primer fotograma con la hoja movida
 *              (en ese fotograma la dibujan React Native y Skia)
 *   uiOpen     hilo de la interfaz: hoja del todo arriba (el valor animado)
 *   uiMoved    hilo de la interfaz: el árbol de vistas YA tiene la hoja movida
 *              (measure() de Reanimated); si llega mucho después de uiFirst,
 *              Reanimated está esperando para aplicar el movimiento a la vista
 *   animEnd    fin de la animación (callback de withTiming)
 */
export type MarkName =
  | 'pressIn'
  | 'pressOut'
  | 'onPress'
  | 'show'
  | 'render'
  | 'commit'
  | 'panel'
  | 'uiFirst'
  | 'uiMoved'
  | 'uiOpen'
  | 'animEnd';

export interface Stall {
  /** Cuándo terminó la parada (Date.now) y cuánto duró (ms). */
  readonly at: number;
  readonly ms: number;
}

export interface OpenRecord {
  readonly marks: Partial<Record<MarkName, number>>;
  /** Del evento nativo del toque a su llegada a JS (ms), si se puede saber. */
  readonly touchToJs: number | null;
  /** Llamadas al módulo nativo propio durante la apertura. */
  readonly nativeCalls: Readonly<Record<string, number>>;
  readonly uiStalls: readonly Stall[];
  readonly jsStalls: readonly Stall[];
  readonly glass: GlassMode;
  readonly noAnimation: boolean;
  readonly freezeSand: boolean;
}

interface Pending {
  marks: Partial<Record<MarkName, number>>;
  touchToJs: number | null;
  calls: Record<string, number>;
  closing: boolean;
}
let current: Pending | null = null;
const history: OpenRecord[] = [];
const uiStalls: Stall[] = [];
const jsStalls: Stall[] = [];
/** Las paradas se guardan si duran más de esto. */
export const STALL_MS = 50;
const KEEP = 40;

/** Empieza una medición nueva (cada toque del botón del menú). */
export function beginPress(nativeTimestamp: number | undefined): void {
  if (!options.enabled) return;
  const now = Date.now();
  // `performance.now()` y la marca del evento nativo comparten origen en
  // Android (reloj monótono); si no cuadran, no se muestra.
  let touchToJs: number | null = null;
  if (typeof nativeTimestamp === 'number' && typeof performance !== 'undefined') {
    const d = performance.now() - nativeTimestamp;
    if (d >= 0 && d < 10_000) touchToJs = Math.round(d);
  }
  current = { marks: { pressIn: now }, touchToJs, calls: {}, closing: false };
}

/** Anota una marca de la apertura en curso (la primera de cada tipo). */
export function mark(name: MarkName, at: number = Date.now()): void {
  if (!options.enabled || !current) return;
  const c = current;
  if (c.marks[name] === undefined) c.marks[name] = at;
  // Por si la hoja no llega a abrirse del todo: se cierra igual a los 8 s.
  if (name === 'show') setTimeout(() => finish(c), 8000);
  const animated = c.marks.animEnd !== undefined || options.noAnimation;
  if (c.marks.uiOpen !== undefined && animated) finish(c);
}

/** Cuenta una llamada al módulo nativo (`BackgroundTimer.*`). */
export function countNative(name: string): void {
  if (!options.enabled || !current) return;
  current.calls[name] = (current.calls[name] ?? 0) + 1;
}

export function reportStall(thread: 'ui' | 'js', at: number, ms: number): void {
  const list = thread === 'ui' ? uiStalls : jsStalls;
  list.push({ at, ms: Math.round(ms) });
  if (list.length > KEEP) list.shift();
}

function finish(c: Pending): void {
  if (c.closing || c.marks.show === undefined) return;
  c.closing = true;
  // Se cierra un poco después para recoger las marcas y paradas que lleguen
  // tarde a JS.
  setTimeout(() => {
    if (current === c) current = null;
    const from = c.marks.pressIn ?? 0;
    const to = Math.max(...Object.values(c.marks).map((v) => v ?? 0)) + 100;
    const within = (s: Stall) => s.at >= from && s.at - s.ms <= to;
    history.unshift({
      marks: { ...c.marks },
      touchToJs: c.touchToJs,
      nativeCalls: { ...c.calls },
      uiStalls: uiStalls.filter(within),
      jsStalls: jsStalls.filter(within),
      glass: options.glass,
      noAnimation: options.noAnimation,
      freezeSand: options.freezeSand,
    });
    if (history.length > 3) history.pop();
    emit();
  }, 400);
}

/** Las últimas aperturas medidas, la más reciente primero. */
export function openHistory(): readonly OpenRecord[] {
  return history;
}

export function clearHistory(): void {
  history.length = 0;
  emit();
}
