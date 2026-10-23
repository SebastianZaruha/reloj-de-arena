/**
 * Sonidos de aviso (expo-audio, Android y web).
 *
 * | Aviso          | Archivo                    | Cuándo                                    |
 * | -------------- | -------------------------- | ----------------------------------------- |
 * | 'finished'     | assets/sounds/fin.mp3      | se acaba la arena de verdad (sesión única |
 * |                |                            | o la última ronda de los ciclos)          |
 * | 'phase-change' | assets/sounds/cambio.mp3   | trabajo ↔ descanso en los ciclos (1.5)    |
 *
 * - Cada sonido se PRECARGA una vez al montar (createAudioPlayer) y lo
 *   liberamos nosotros al desmontar (`release()`): memoria mínima.
 * - QUÉ aviso toca lo decide `sessionCue` del core (testeado): reiniciar,
 *   pausar o voltear a mano no suena.
 * - `useCueSound` devuelve una función `play(cue)`; la pantalla la llama.
 *   Si el ajuste «Sonido» está desactivado, no suena nada.
 * - Web: los navegadores bloquean el audio hasta que el usuario interactúa
 *   con la página. Como para empezar hay que tocar el reloj, ya está
 *   permitido. Si aun así fallara, `play()` falla en silencio.
 *
 * Fase 4 (segundo plano): con la app en segundo plano sonará la
 * NOTIFICACIÓN programada; aquí habrá que no sonar si ya se mostró.
 */
import type { SessionCue } from '@reloj/core';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';

/** Volumen de cada aviso (el cambio de fase, más discreto). */
const CUE_VOLUME: Record<SessionCue, number> = { finished: 0.9, 'phase-change': 0.6 };

/** Sonido de cada aviso. */
const CUE_SOUNDS: Record<SessionCue, number> = {
  finished: require('../../assets/sounds/fin.mp3'),
  'phase-change': require('../../assets/sounds/cambio.mp3'),
};

export function useCueSound(enabled: boolean): (cue: SessionCue) => void {
  const players = useRef<Partial<Record<SessionCue, AudioPlayer>>>({});

  // Precarga al montar y liberación al desmontar.
  useEffect(() => {
    // Que suene aunque el móvil esté en modo silencio (iOS) y bajando un poco
    // el volumen de otras apps mientras suena (en vez de cortarlas).
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
    const created: Partial<Record<SessionCue, AudioPlayer>> = {};
    (Object.keys(CUE_SOUNDS) as SessionCue[]).forEach((cue) => {
      try {
        created[cue] = createAudioPlayer(CUE_SOUNDS[cue]);
      } catch (error) {
        console.warn(`[reloj] No se pudo cargar el sonido «${cue}»:`, error);
      }
    });
    players.current = created;
    return () => {
      players.current = {};
      Object.values(created).forEach((p) => p?.release());
    };
  }, []);

  return useCallback(
    (cue: SessionCue) => {
      const p = players.current[cue];
      if (!enabled || !p) return;
      try {
        p.volume = CUE_VOLUME[cue];
        p.seekTo(0).catch(() => {});
        p.play();
      } catch (error) {
        console.warn('[reloj] No se pudo reproducir el sonido:', error);
      }
    },
    [enabled],
  );
}
