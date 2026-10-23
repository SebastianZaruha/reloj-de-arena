import { describe, expect, it } from 'vitest';
import {
  backgroundEvents,
  backgroundPayload,
  createSession,
  cyclePlan,
  en,
  es,
  flipSession,
  MAX_BACKGROUND_EVENTS,
  parseBackgroundSession,
  pauseBackground,
  pauseSession,
  planForCycle,
  restartBackground,
  restartSession,
  resumeBackground,
  resumeSession,
  sessionFromBackground,
  sessionSnapshot,
  settleBackground,
  singleSegmentPlan,
  startSession,
  TIME_TOKEN,
  toBackgroundSession,
  upcomingEvents,
  type BackgroundSession,
  type SessionState,
} from '../src';

const MIN = 60_000;
/** 3 rondas de 10 min de trabajo y 2 de descanso: T D T D T (34 min). */
const plan = planForCycle({ workMin: 10, breakMin: 2, rounds: 3 });
const T0 = 1_000_000;

function running(): SessionState {
  return startSession(createSession(plan), T0);
}

/** Resumen nativo de una sesión (falla el test si no lo hay). */
function bgOf(state: SessionState, now: number): BackgroundSession {
  const bg = toBackgroundSession(state, now);
  if (!bg) throw new Error('sin resumen');
  return bg;
}

/** Lo que importa de una foto para comparar la app y el módulo nativo. */
function view(state: SessionState | null, now: number) {
  if (!state) throw new Error('sin sesión');
  const s = sessionSnapshot(state, now);
  return { status: s.status, index: s.index, remainingMs: s.remainingMs, transitions: s.transitions };
}

describe('segundo plano: avisos que hay que programar', () => {
  it('un ciclo en marcha programa cada cambio de fase y el fin, a su hora exacta', () => {
    expect(upcomingEvents(running(), T0)).toEqual([
      { kind: 'phase-change', at: T0 + 10 * MIN, index: 1 },
      { kind: 'phase-change', at: T0 + 12 * MIN, index: 2 },
      { kind: 'phase-change', at: T0 + 22 * MIN, index: 3 },
      { kind: 'phase-change', at: T0 + 24 * MIN, index: 4 },
      { kind: 'finished', at: T0 + 34 * MIN, index: 4 },
    ]);
  });

  it('a mitad del ciclo solo quedan los avisos que faltan', () => {
    // 11 min: ya en el descanso de la ronda 1 (sin que nadie llamara a tick).
    const events = upcomingEvents(running(), T0 + 11 * MIN);
    expect(events.map((e) => e.at - T0)).toEqual([12, 22, 24, 34].map((m) => m * MIN));
    expect(events[0]).toMatchObject({ kind: 'phase-change', index: 2 });
  });

  it('una sesión única solo tiene el aviso de fin', () => {
    const s = startSession(createSession(singleSegmentPlan(5 * MIN)), T0);
    expect(upcomingEvents(s, T0 + MIN)).toEqual([{ kind: 'finished', at: T0 + 5 * MIN, index: 0 }]);
  });

  it('en reposo, en pausa o terminada no hay nada que programar', () => {
    expect(upcomingEvents(createSession(plan), T0)).toEqual([]);
    expect(upcomingEvents(pauseSession(running(), T0 + MIN), T0 + 2 * MIN)).toEqual([]);
    expect(upcomingEvents(running(), T0 + 40 * MIN)).toEqual([]);
  });

  it('al reanudar, los avisos se retrasan exactamente lo que duró la pausa', () => {
    const paused = pauseSession(running(), T0 + 3 * MIN);
    const resumed = resumeSession(paused, T0 + 8 * MIN); // 5 min de pausa
    expect(upcomingEvents(resumed, T0 + 8 * MIN).map((e) => e.at - T0)).toEqual(
      [15, 17, 27, 29, 39].map((m) => m * MIN),
    );
  });

  it('voltear reinicia la fase actual y recalcula sus avisos', () => {
    const flipped = flipSession(running(), T0 + 11 * MIN); // en el descanso 1
    expect(upcomingEvents(flipped, T0 + 11 * MIN)[0]).toEqual({
      kind: 'phase-change',
      at: T0 + 13 * MIN,
      index: 2,
    });
  });

  it('un plan que se repite no programa avisos sin fin', () => {
    const s = startSession(createSession(cyclePlan(MIN, MIN, 2, true)), T0);
    const events = upcomingEvents(s, T0);
    expect(events).toHaveLength(MAX_BACKGROUND_EVENTS);
    expect(events.every((e) => e.kind === 'phase-change')).toBe(true);
  });
});

describe('segundo plano: resumen para el módulo nativo', () => {
  it('en marcha guarda cuándo acaba el tramo; en pausa, lo que le queda', () => {
    expect(bgOf(running(), T0 + MIN)).toEqual({
      status: 'running',
      durations: [10, 2, 10, 2, 10].map((m) => m * MIN),
      repeat: false,
      index: 0,
      phaseEndsAt: T0 + 10 * MIN,
      remainingMs: null,
      transitions: 0,
    });
    const paused = bgOf(pauseSession(running(), T0 + 4 * MIN), T0 + 9 * MIN);
    expect(paused).toMatchObject({ status: 'paused', phaseEndsAt: null, remainingMs: 6 * MIN });
  });

  it('en reposo o terminada no hay resumen (se quita la notificación)', () => {
    expect(toBackgroundSession(createSession(plan), T0)).toBeNull();
    expect(toBackgroundSession(running(), T0 + 34 * MIN)).toBeNull();
  });

  it('el fin de un tramo reanudado cuenta lo que ya llevaba', () => {
    const s = resumeSession(pauseSession(running(), T0 + 4 * MIN), T0 + 20 * MIN);
    expect(bgOf(s, T0 + 20 * MIN).phaseEndsAt).toBe(T0 + 26 * MIN);
  });
});

describe('segundo plano: el módulo nativo hace lo mismo que el motor de sesiones', () => {
  const times = [0, 1, 9.99, 10, 11, 12, 23, 33.5, 34, 50].map((m) => T0 + m * MIN);

  it('settleBackground recorre las fases igual que settle', () => {
    const bg = bgOf(running(), T0);
    for (const t of times) {
      const settled = settleBackground(bg, t);
      expect(view(sessionFromBackground(settled, plan, t), t), `t=${t - T0}`).toEqual(view(running(), t));
    }
    expect(settleBackground(bg, T0 + 34 * MIN)).toMatchObject({
      status: 'finished',
      index: 4,
      transitions: 4,
    });
  });

  it('pausar desde la notificación = pausar en la app', () => {
    for (const t of times.slice(0, -2)) {
      const native = pauseBackground(bgOf(running(), T0), t);
      const app = pauseSession(running(), t);
      expect(native.status).toBe('paused');
      expect(view(sessionFromBackground(native, plan, t + MIN), t + MIN)).toEqual(view(app, t + MIN));
    }
  });

  it('reanudar desde la notificación = reanudar en la app', () => {
    const app = resumeSession(pauseSession(running(), T0 + 11 * MIN), T0 + 15 * MIN);
    const native = resumeBackground(pauseBackground(bgOf(running(), T0), T0 + 11 * MIN), T0 + 15 * MIN);
    expect(backgroundEvents(native)).toEqual(upcomingEvents(app, T0 + 15 * MIN));
    for (const t of [15, 16, 18, 30, 40].map((m) => T0 + m * MIN)) {
      expect(view(sessionFromBackground(native, plan, t), t)).toEqual(view(app, t));
    }
  });

  it('reiniciar desde la notificación vuelve a la ronda 1 y sigue en marcha', () => {
    const t = T0 + 13 * MIN;
    const native = restartBackground(pauseBackground(bgOf(running(), T0), t), t);
    const app = startSession(restartSession(pauseSession(running(), t)), t);
    expect(native).toMatchObject({ status: 'running', index: 0, phaseEndsAt: t + 10 * MIN });
    expect(backgroundEvents(native)).toEqual(upcomingEvents(app, t));
    expect(view(sessionFromBackground(native, plan, t + MIN), t + MIN)).toEqual(view(app, t + MIN));
  });

  it('pausar o reanudar en el estado equivocado no cambia nada', () => {
    const bg = bgOf(running(), T0);
    expect(resumeBackground(bg, T0 + MIN)).toBe(bg);
    const paused = pauseBackground(bg, T0 + MIN);
    expect(pauseBackground(paused, T0 + 2 * MIN)).toBe(paused);
    expect(settleBackground(paused, T0 + 60 * MIN)).toBe(paused);
    expect(backgroundEvents(paused)).toEqual([]);
  });
});

describe('segundo plano: vuelta a la app', () => {
  it('rehace una sesión terminada con la app cerrada', () => {
    const finished = settleBackground(bgOf(running(), T0), T0 + 40 * MIN);
    const s = sessionFromBackground(finished, plan, T0 + 40 * MIN);
    expect(view(s, T0 + 40 * MIN)).toEqual({ status: 'finished', index: 4, remainingMs: 0, transitions: 4 });
  });

  it('si el plan ya no coincide (otro ciclo), no rehace nada', () => {
    const bg = bgOf(running(), T0);
    expect(sessionFromBackground(bg, planForCycle({ workMin: 25, breakMin: 5, rounds: 3 }), T0)).toBeNull();
    expect(sessionFromBackground(bg, singleSegmentPlan(10 * MIN), T0)).toBeNull();
    expect(sessionFromBackground({ ...bg, repeat: true }, plan, T0)).toBeNull();
  });

  it('un fin en el futuro lejano (reloj cambiado) se recorta a la duración del tramo', () => {
    const bg = { ...bgOf(running(), T0), phaseEndsAt: T0 + 500 * MIN };
    expect(view(sessionFromBackground(bg, plan, T0), T0).remainingMs).toBe(10 * MIN);
  });

  it('valida lo guardado por el módulo nativo', () => {
    const bg = bgOf(running(), T0);
    expect(parseBackgroundSession(JSON.stringify(bg))).toEqual(bg);
    expect(parseBackgroundSession(bgOf(pauseSession(running(), T0 + MIN), T0 + MIN))).toMatchObject({
      status: 'paused',
      remainingMs: 9 * MIN,
    });
    expect(parseBackgroundSession('{no es json')).toBeNull();
    expect(parseBackgroundSession(null)).toBeNull();
    expect(parseBackgroundSession({ ...bg, status: 'idle' })).toBeNull();
    expect(parseBackgroundSession({ ...bg, durations: [] })).toBeNull();
    expect(parseBackgroundSession({ ...bg, durations: [10, 'x'] })).toBeNull();
    expect(parseBackgroundSession({ ...bg, index: 9 })).toBeNull();
    expect(parseBackgroundSession({ ...bg, index: 1.5 })).toBeNull();
    expect(parseBackgroundSession({ ...bg, phaseEndsAt: null })).toBeNull();
    expect(parseBackgroundSession({ ...bg, status: 'paused' })).toBeNull();
    expect(parseBackgroundSession({ ...bg, transitions: 'x' })?.transitions).toBe(0);
  });
});

describe('segundo plano: lo que se envía al módulo nativo', () => {
  const options = { sound: true, vibration: false, seenSeq: 3 };

  it('lleva los títulos de cada fase y los avisos, traducidos', () => {
    const p = backgroundPayload(running(), T0, es, options);
    expect(p.segments.map((s) => s.title)).toEqual([
      'Trabajo 1/3',
      'Descanso 1/3',
      'Trabajo 2/3',
      'Descanso 2/3',
      'Trabajo 3/3',
    ]);
    expect(p.segments[1]?.alert).toBe('A descansar: 2 minutos');
    expect(p.events).toHaveLength(5);
    expect(p.texts.finishedTitle).toBe('Ciclos terminados');
    expect(p.texts.until).toBe(`Hasta las ${TIME_TOKEN}`);
    expect(p).toMatchObject({ sound: true, vibration: false, seenSeq: 3 });

    const pEn = backgroundPayload(running(), T0, en, options);
    expect(pEn.segments[0]?.title).toBe('Work 1/3');
    expect(pEn.segments[2]?.alert).toBe('Time to work: 10 minutes');
    expect(pEn.texts.pausedLeft).toBe(`Paused · ${TIME_TOKEN} left`);
  });

  it('en sesión única el título es «Temporizador» / «Timer»', () => {
    const s = startSession(createSession(singleSegmentPlan(5 * MIN)), T0);
    expect(backgroundPayload(s, T0, es, options).segments).toEqual([{ title: 'Temporizador', alert: '' }]);
    expect(backgroundPayload(s, T0, en, options).texts.finishedTitle).toBe("Time's up");
  });

  it('ventana flotante (1.8): apagada y tema automático si no se dice; si no, lo elegido', () => {
    const off = backgroundPayload(running(), T0, es, options);
    expect(off).toMatchObject({ floating: false, theme: 'system' });
    const on = backgroundPayload(running(), T0, en, { ...options, floating: true, theme: 'dark' });
    expect(on).toMatchObject({ floating: true, theme: 'dark' });
    expect(on.texts.floatingLabel).toBe('Floating hourglass');
    expect(off.texts.floatingClose).toBe('Quitar la ventana flotante');
  });

  it('en reposo no lleva sesión ni avisos (el módulo lo quita todo)', () => {
    const p = backgroundPayload(createSession(plan), T0, es, options);
    expect(p.session).toBeNull();
    expect(p.events).toEqual([]);
  });
});
