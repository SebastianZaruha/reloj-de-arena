import { describe, expect, it } from 'vitest';
import { CueDetector, ManualClock, createTimer, pause, restart, snapshot, start, tick, toggle } from '../src';

describe('CueDetector (sonido final)', () => {
  it('avisa UNA sola vez al terminar de forma natural', () => {
    const clock = new ManualClock(0);
    let state = start(createTimer(60_000), clock.now());
    const detector = new CueDetector(snapshot(state, clock.now()).status);
    const cues: string[] = [];
    // La UI consulta el estado cada 250 ms durante 70 s.
    for (let i = 0; i < 280; i++) {
      clock.advance(250);
      state = tick(state, clock.now());
      const cue = detector.update(snapshot(state, clock.now()).status);
      if (cue) cues.push(cue);
    }
    expect(cues).toEqual(['finished']);
  });

  it('no avisa al reiniciar ni al pausar a mano', () => {
    const detector = new CueDetector('idle');
    let state = start(createTimer(60_000), 0);
    expect(detector.update(state.status)).toBeNull();
    state = pause(state, 10_000);
    expect(detector.update(state.status)).toBeNull();
    state = toggle(state, 11_000); // reanudar
    expect(detector.update(state.status)).toBeNull();
    state = restart(state);
    expect(detector.update(state.status)).toBeNull();
  });

  it('vuelve a avisar en la siguiente sesión completa', () => {
    const detector = new CueDetector('idle');
    const seq = ['running', 'finished', 'finished', 'idle', 'running', 'finished'] as const;
    const cues = seq.map((s) => detector.update(s)).filter(Boolean);
    expect(cues).toEqual(['finished', 'finished']);
  });
});
