/**
 * Error boundary del reloj.
 *
 * Un "error boundary" es un componente de clase de React que captura los
 * errores lanzados al renderizar a sus hijos. Si Skia falla, en vez de
 * quedarse la pantalla en blanco:
 *
 *  1. Mostramos el fondo liso (el tiempo digital sigue visible y el
 *     temporizador sigue contando: vive FUERA de este componente y se
 *     calcula con marcas de tiempo, así que no se pierde nada).
 *  2. Pasado un momento, volvemos a montar el lienzo (con un `key` nuevo,
 *     lo que crea shaders, paths y simulación desde cero).
 *  3. Si el motor gráfico está muerto (web: CanvasKit abortado), remontar no
 *     sirve: guardamos el temporizador y recargamos la página (una vez).
 *
 * La decisión la toma `decideRecovery` del core (testeada), que aplica
 * esperas crecientes para no entrar nunca en un bucle de errores.
 */
import { decideRecovery } from '@reloj/core';
import { Skia } from '@shopify/react-native-skia';
import { Component, type ReactNode } from 'react';
import { View } from 'react-native';

import { canReloadForRecovery, lastRecoveryReloadAt } from '../recovery/sessionRecovery';

interface Props {
  readonly children: ReactNode;
  /** Se llama cuando hay que recargar la app (guardar estado + recargar). */
  readonly onReload: () => void;
}

interface State {
  readonly failed: boolean;
  /** Cambia en cada remontaje para que React cree el lienzo desde cero. */
  readonly attempt: number;
}

/** ¿Sigue vivo Skia? Creamos y liberamos un objeto mínimo. */
function isSkiaAlive(): boolean {
  try {
    const paint = Skia.Paint();
    paint.setAlphaf(1);
    paint.dispose();
    return true;
  } catch {
    return false;
  }
}

export class HourglassBoundary extends Component<Props, State> {
  override state: State = { failed: false, attempt: 0 };
  private failures: number[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    const now = Date.now();
    this.failures = [...this.failures, now].slice(-10);
    const action = decideRecovery({
      failures: this.failures,
      now,
      engineAlive: isSkiaAlive(),
      canReload: canReloadForRecovery,
      lastReloadAt: lastRecoveryReloadAt(),
    });
    console.warn(`[reloj] Fallo al dibujar el reloj (${action.type}):`, error);
    if (action.type === 'reload') {
      this.props.onReload();
    } else if (action.type === 'remount') {
      this.clearTimer();
      this.timer = setTimeout(() => {
        this.timer = null;
        this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
      }, action.delayMs);
    }
    // 'give-up': nos quedamos con el fondo liso.
  }

  override componentWillUnmount(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  override render(): ReactNode {
    if (this.state.failed) return <View style={{ flex: 1 }} />;
    return (
      <View key={this.state.attempt} style={{ flex: 1 }}>
        {this.props.children}
      </View>
    );
  }
}
