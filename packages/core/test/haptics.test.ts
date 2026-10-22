import { describe, expect, it } from 'vitest';
import { DEFAULT_TICK_INTERVAL_MS, flipHaptic, hapticForTransition, StepTicker } from '../src';

describe('hapticForTransition (vibración al cambiar de estado)', () => {
  it('vibra al empezar, pausar, reanudar y terminar', () => {
    expect(hapticForTransition('idle', 'running')).toBe('start');
    expect(hapticForTransition('finished', 'running')).toBe('start');
    expect(hapticForTransition('running', 'paused')).toBe('pause');
    expect(hapticForTransition('paused', 'running')).toBe('resume');
    expect(hapticForTransition('running', 'finished')).toBe('finished');
  });

  it('no vibra si no cambia el estado ni al reiniciar', () => {
    expect(hapticForTransition('running', 'running')).toBeNull();
    expect(hapticForTransition('idle', 'idle')).toBeNull();
    expect(hapticForTransition('running', 'idle')).toBeNull();
    expect(hapticForTransition('paused', 'idle')).toBeNull();
    expect(hapticForTransition('finished', 'idle')).toBeNull();
  });
});

describe('StepTicker (clics al deslizar)', () => {
  it('hace clic solo cuando cambia el valor', () => {
    const ticker = new StepTicker();
    ticker.reset(5);
    expect(ticker.update(5, 0)).toBe(false); // mismo escalón: nada
    expect(ticker.update(6, 100)).toBe(true);
    expect(ticker.update(6, 200)).toBe(false);
    expect(ticker.update(6, 300)).toBe(false);
    expect(ticker.update(5, 400)).toBe(true);
  });

  it(`nunca hace dos clics a menos de ${DEFAULT_TICK_INTERVAL_MS} ms`, () => {
    const ticker = new StepTicker(30);
    ticker.reset(1);
    expect(ticker.update(2, 1000)).toBe(true);
    expect(ticker.update(3, 1010)).toBe(false); // demasiado pronto: se descarta
    expect(ticker.update(3, 1050)).toBe(false); // y no se recupera después
    expect(ticker.update(4, 1050)).toBe(true);
    expect(ticker.update(5, 1079)).toBe(false);
    expect(ticker.update(6, 1080)).toBe(true);
  });

  it('el primer cambio siempre hace clic, aunque no se haya llamado a reset', () => {
    const ticker = new StepTicker();
    expect(ticker.update(10, 0)).toBe(true);
  });
});

describe('flipHaptic (voltear)', () => {
  it('solo vibra aparte si el reloj ya estaba en marcha', () => {
    expect(flipHaptic('running')).toBe('flip');
    expect(flipHaptic('idle')).toBeNull();
    expect(flipHaptic('paused')).toBeNull();
    expect(flipHaptic('finished')).toBeNull();
  });
});
