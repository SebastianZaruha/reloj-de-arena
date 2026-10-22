/**
 * Sonidos de aviso del temporizador (expo-audio, Android y web).
 *
 * - El sonido se PRECARGA una vez al montar (createAudioPlayer) y lo
 *   liberamos nosotros al desmontar (`release()`): memoria mínima.
 * - Se reproduce UNA vez cuando la arena se acaba de forma natural. Si el
 *   usuario reinicia o pausa a mano, no suena (lo decide CueDetector del
 *   core, que está testeado).
 * - Web: los navegadores bloquean el audio hasta que el usuario interactúa
 *   con la página. Como para empezar hay que tocar el reloj, el sonido final
 *   ya está permitido. Si el navegador lo bloqueara igualmente, `play()`
 *   falla en silencio (lo capturamos) y la app sigue funcionando.
 *
 * Puntos de extensión:
 *  - Fase 3: `SOUND_PREFERENCES` pasará a leerse de los ajustes (activar /
 *    desactivar, elegir sonido) y en ciclos sonará también con el aviso
 *    'phase-change'. Basta con añadir la entrada en `CUE_SOUNDS`.
 *  - Fase 4: con la app en segundo plano sonará la NOTIFICACIÓN programada;
 *    aquí habrá que no sonar si esa notificación ya se mostró.
 */
import { CueDetector, type TimerCue, type TimerStatus } from '@reloj/core';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';

/** Preferencias de sonido. Fase 3: vendrán de `Settings`. */
export interface SoundPreferences {
  readonly enabled: boolean;
  readonly volume: number;
}

export const SOUND_PREFERENCES: SoundPreferences = { enabled: true, volume: 0.9 };

/** Sonido de cada aviso (fase 3: 'phase-change' → otro archivo). */
const CUE_SOUNDS: Record<TimerCue, number> = { finished: require('../../assets/sounds/fin.mp3') };

export function useCueSound(status: TimerStatus, prefs: SoundPreferences = SOUND_PREFERENCES): void {
  const player = useRef<AudioPlayer | null>(null);
  const detector = useRef<CueDetector | null>(null);

  // Precarga al montar y liberación al desmontar.
  useEffect(() => {
    // Que suene aunque el móvil esté en modo silencio (iOS) y bajando un poco
    // el volumen de otras apps mientras suena (en vez de cortarlas).
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
    const p = createAudioPlayer(CUE_SOUNDS.finished);
    player.current = p;
    return () => {
      player.current = null;
      p.release();
    };
  }, []);

  useEffect(() => {
    detector.current ??= new CueDetector(status);
    const cue = detector.current.update(status);
    const p = player.current;
    if (cue !== 'finished' || !prefs.enabled || !p) return;
    try {
      p.volume = prefs.volume;
      p.seekTo(0).catch(() => {});
      p.play();
    } catch (error) {
      console.warn('[reloj] No se pudo reproducir el sonido final:', error);
    }
  }, [status, prefs.enabled, prefs.volume]);
}
