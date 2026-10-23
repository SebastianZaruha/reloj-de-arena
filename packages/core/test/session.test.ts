import { describe, expect, it } from 'vitest';
import {
  createSession,
  flipSession,
  parseSession,
  pauseSession,
  planForCycle,
  replacePlan,
  restartSession,
  resumeSession,
  serializeSession,
  sessionCue,
  sessionSnapshot,
  setSessionPlan,
  singleSegmentPlan,
  startSession,
  tickSession,
  toggleSession,
  type SessionState,
} from '../src';

const MIN = 60_000;
/** 3 rondas de 10 min de trabajo y 2 de descanso: T D T D T. */
const plan = planForCycle({ workMin: 10, breakMin: 2, rounds: 3 });
const T0 = 1_000_000;

function running(): SessionState {
  return startSession(createSession(plan), T0);
}

describe('motor de sesión: ciclos trabajo/descanso', () => {
  it('empieza en reposo, en el trabajo de la ronda 1', () => {
    const s = sessionSnapshot(createSession(plan), T0);
    expect(s).toMatchObject({ status: 'idle', kind: 'focus', round: 1, rounds: 3, index: 0, isCycle: true });
    expect(s.segmentCount).toBe(5);
    expect(s.remainingMs).toBe(10 * MIN);
  });

  it('pasa a descanso justo al acabar el trabajo, sin perder tiempo', () => {
    const s = running();
    expect(sessionSnapshot(s, T0 + 10 * MIN - 1)).toMatchObject({ kind: 'focus', transitions: 0 });
    const snap = sessionSnapshot(s, T0 + 10 * MIN + 30_000);
    expect(snap).toMatchObject({ status: 'running', kind: 'break', round: 1, index: 1, transitions: 1 });
    // El descanso empezó en el instante exacto del fin del trabajo.
    expect(snap.elapsedMs).toBe(30_000);
    expect(snap.remainingMs).toBe(2 * MIN - 30_000);
  });

  it('tras el descanso empieza la ronda siguiente', () => {
    const snap = sessionSnapshot(running(), T0 + 12 * MIN + 1);
    expect(snap).toMatchObject({ kind: 'focus', round: 2, index: 2, transitions: 2 });
  });

  it('la última ronda no tiene descanso y la sesión termina', () => {
    const total = 3 * 10 * MIN + 2 * 2 * MIN;
    expect(sessionSnapshot(running(), T0 + total - 1)).toMatchObject({ status: 'running', round: 3 });
    const end = sessionSnapshot(running(), T0 + total);
    expect(end).toMatchObject({ status: 'finished', round: 3, kind: 'focus', remainingMs: 0 });
  });

  it('volver de segundo plano recorre varios tramos de golpe y con exactitud', () => {
    // 10 + 2 + 10 + 1,5 min → descanso de la ronda 2, a 30 s de acabar.
    const later = T0 + (10 + 2 + 10 + 1.5) * MIN;
    const s = tickSession(running(), later);
    expect(s.index).toBe(3);
    expect(s.transitions).toBe(3);
    expect(s.timer.startedAt).toBe(T0 + 22 * MIN);
    expect(sessionSnapshot(s, later).remainingMs).toBe(30_000);
  });

  it('pausar congela el tramo actual y reanudar sigue donde iba', () => {
    let s = pauseSession(running(), T0 + 11 * MIN); // 1 min dentro del descanso
    expect(sessionSnapshot(s, T0 + 60 * MIN)).toMatchObject({
      status: 'paused',
      kind: 'break',
      elapsedMs: MIN,
    });
    s = resumeSession(s, T0 + 60 * MIN);
    expect(sessionSnapshot(s, T0 + 60 * MIN + 30_000)).toMatchObject({ kind: 'break', remainingMs: 30_000 });
    expect(sessionSnapshot(s, T0 + 61 * MIN)).toMatchObject({ kind: 'focus', round: 2 });
  });

  it('toggle: empezar, pausar, reanudar y, al terminar, volver al reposo', () => {
    let s = createSession(plan);
    s = toggleSession(s, T0);
    expect(s.timer.status).toBe('running');
    s = toggleSession(s, T0 + MIN);
    expect(s.timer.status).toBe('paused');
    s = toggleSession(s, T0 + 2 * MIN);
    expect(s.timer.status).toBe('running');
    const finished = tickSession(s, T0 + 10 * 60 * MIN);
    expect(finished.timer.status).toBe('finished');
    const again = toggleSession(finished, T0 + 11 * 60 * MIN);
    expect(again).toMatchObject({ index: 0 });
    expect(again.timer.status).toBe('idle');
  });

  it('voltear el móvil reinicia de cero la FASE actual (no la sesión)', () => {
    const s = flipSession(running(), T0 + 11 * MIN); // en el descanso de la ronda 1
    const snap = sessionSnapshot(s, T0 + 11 * MIN);
    expect(snap).toMatchObject({ status: 'running', kind: 'break', round: 1, remainingMs: 2 * MIN });
    // Voltear no es un cambio de fase natural.
    expect(snap.transitions).toBe(1);
  });

  it('voltear con la sesión terminada empieza otra desde el principio', () => {
    const done = tickSession(running(), T0 + 99 * MIN);
    const s = flipSession(done, T0 + 100 * MIN);
    expect(sessionSnapshot(s, T0 + 100 * MIN)).toMatchObject({ status: 'running', index: 0, round: 1 });
  });

  it('reiniciar vuelve al primer tramo pero no baja el contador de cambios', () => {
    const s = restartSession(tickSession(running(), T0 + 13 * MIN));
    expect(s.index).toBe(0);
    expect(s.timer.status).toBe('idle');
    expect(s.transitions).toBe(2);
  });

  it('setSessionPlan no interrumpe una cuenta en marcha; replacePlan sí', () => {
    const other = singleSegmentPlan(5 * MIN);
    const s = running();
    expect(setSessionPlan(s, other)).toBe(s);
    expect(replacePlan(s, other)).toMatchObject({ plan: other, index: 0 });
    expect(setSessionPlan(pauseSession(s, T0 + MIN), other).plan).toBe(other);
  });

  it('una sesión simple es un único tramo', () => {
    const s = startSession(createSession(singleSegmentPlan(5 * MIN)), T0);
    expect(sessionSnapshot(s, T0)).toMatchObject({ isCycle: false, rounds: 1, round: 1 });
    expect(sessionSnapshot(s, T0 + 5 * MIN)).toMatchObject({ status: 'finished', transitions: 0 });
  });

  it('rechaza un plan vacío', () => {
    expect(() => createSession({ segments: [], repeat: false })).toThrow(RangeError);
  });
});

describe('avisos de sesión', () => {
  it('cambio de fase al subir el contador; fin al acabar la última', () => {
    const a = { status: 'running' as const, transitions: 0 };
    expect(sessionCue(a, { status: 'running', transitions: 1 })).toBe('phase-change');
    expect(sessionCue(a, { status: 'finished', transitions: 4 })).toBe('finished');
    expect(sessionCue(a, { status: 'running', transitions: 0 })).toBeNull();
  });

  it('reiniciar, pausar o empezar no avisan', () => {
    expect(sessionCue({ status: 'running', transitions: 2 }, { status: 'idle', transitions: 2 })).toBeNull();
    expect(
      sessionCue({ status: 'running', transitions: 2 }, { status: 'paused', transitions: 2 }),
    ).toBeNull();
    expect(sessionCue({ status: 'idle', transitions: 2 }, { status: 'running', transitions: 2 })).toBeNull();
  });
});

describe('guardar y recuperar la sesión', () => {
  it('ida y vuelta conserva todo', () => {
    const s = tickSession(running(), T0 + 11 * MIN);
    expect(parseSession(serializeSession(s), T0 + 11 * MIN)).toEqual(s);
  });

  it('rechaza datos corruptos', () => {
    expect(parseSession('{', T0)).toBeNull();
    expect(parseSession({ plan: { segments: [] }, index: 0 }, T0)).toBeNull();
    const s = running();
    expect(parseSession({ ...s, index: 9 }, T0)).toBeNull();
    expect(parseSession({ ...s, plan: { segments: [{ kind: 'siesta', durationMs: MIN }] } }, T0)).toBeNull();
    // El temporizador debe corresponder al tramo actual.
    expect(parseSession({ ...s, index: 1 }, T0)).toBeNull();
  });
});
