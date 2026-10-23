/**
 * Simulación granular de la arena (autómata celular tipo "falling sand").
 *
 * La idea:
 * - El interior del reloj se divide en una rejilla de celdas cuadradas.
 * - Cada celda está vacía (0) o contiene UN grano (valor 1..255 = su tono).
 * - En cada paso, cada grano intenta moverse en la dirección de la gravedad;
 *   si está ocupado prueba en diagonal y, a veces, se desliza de lado. Así
 *   aparecen solos los montones con su ángulo de reposo, el cráter en el
 *   bulbo superior, los deslizamientos...
 * - La gravedad es un VECTOR de entrada (por defecto hacia abajo). Desde la
 *   1.3 viene del acelerómetro (ver physics/motion.ts): al inclinar el móvil
 *   la arena se desliza hacia el nuevo "abajo".
 * - AVALANCHAS (1.3): un grano en reposo no empieza a resbalar en cuanto
 *   puede, sino con cierta probabilidad por paso (`staticFriction`, como el
 *   rozamiento estático). Uno que ya se está moviendo sigue sin freno y
 *   despierta a sus vecinos. Resultado: al inclinar, la superficie aguanta
 *   un instante y luego cae en pequeñas avalanchas que tardan un poco en
 *   asentarse, en vez de "teletransportarse" a la nueva pendiente.
 * - El cuello está "cerrado" en la rejilla: los granos solo lo cruzan con
 *   `transfer()`, que llama el controlador de flujo al ritmo exacto que marca
 *   el temporizador. Así la arena NUNCA se desincroniza del tiempo real.
 *
 * Rendimiento: usamos `Uint8Array`/`Int32Array` (memoria contigua, sin
 * objetos por grano) y recorremos los granos en orden "de abajo arriba"
 * según la gravedad para que cada uno caiga como mucho una celda por paso.
 */
import { innerRadiusAt, type HourglassProfile } from '../geometry/profile';
import { GRAVITY_DOWN, normalize, type Vec2 } from '../physics/vector';
import { createRng, hash32, type Rng } from './random';

/** Las 8 direcciones vecinas, empezando en "derecha" y girando 45° en sentido horario (Y hacia abajo). */
const DX: readonly number[] = [1, 1, 0, -1, -1, -1, 0, 1];
const DY: readonly number[] = [0, 1, 1, 1, 0, -1, -1, -1];
/** Lectura segura de DX/DY (los índices siempre están en 0..7). */
const dx = (k: number): number => DX[k] ?? 0;
const dy = (k: number): number => DY[k] ?? 0;

export type Bulb = 'top' | 'bottom';

export interface SandSimulationOptions {
  readonly profile: HourglassProfile;
  /** Columnas de la rejilla (se fuerza impar para que exista columna central). */
  readonly cols: number;
  /** Semilla aleatoria. */
  readonly seed?: number;
  /** Probabilidad de deslizamiento lateral (controla el ángulo de reposo). */
  readonly slideChance?: number;
  /** Fracción de la capacidad de un bulbo que ocupa toda la arena. */
  readonly fillRatio?: number;
  /**
   * Probabilidad (0..1) por paso de que un grano EN REPOSO empiece a rodar
   * por una pendiente. 1 = sin rozamiento (comportamiento de la 1.2);
   * valores bajos = avalanchas más lentas y "a trompicones".
   */
  readonly staticFriction?: number;
}

export interface ArrangeOptions {
  /** Pendiente del cráter en la superficie del bulbo emisor (0 = plano). */
  readonly crater?: number;
  /** Pendiente del montón en el bulbo receptor. */
  readonly mound?: number;
}

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export class SandSimulation {
  readonly cols: number;
  readonly rows: number;
  /** Fila del cuello (cerrada en la máscara). */
  readonly gateRow: number;
  /** Columnas abiertas del cuello. */
  readonly gateCols: readonly number[];
  /** 1 si la celda es interior (hueco del vidrio), 0 si es vidrio/exterior. */
  readonly mask: Uint8Array;
  /** Tono del grano en cada celda (0 = vacía). */
  readonly cells: Uint8Array;
  /** Capacidad (celdas interiores) de cada bulbo. */
  readonly capacity: { readonly top: number; readonly bottom: number };
  /** Número total de granos de arena del reloj. */
  readonly totalGrains: number;

  private readonly rng: Rng;
  private readonly seed: number;
  private readonly slideChance: number;
  private readonly staticFriction: number;
  private readonly stamp: Uint16Array;
  private stampValue = 0;
  /** Celdas interiores ordenadas de "más abajo" a "más arriba" según la gravedad. */
  private readonly order: Int32Array;
  /** Clave de orden de cada celda (buffer reutilizado al girar la gravedad). */
  private readonly orderKeys: Float64Array;
  /** Comparador fijo para ordenar `order` (se crea una vez, no en cada giro). */
  private readonly byKey: (a: number, b: number) => number;
  /** Posición de cada celda dentro de `order`. */
  private readonly rank: Int32Array;
  private orderAngle = Number.NaN;
  // Dos juegos de "despiertos" (actual y siguiente) para no reservar memoria en cada paso.
  private awakeCur: Uint8Array;
  private awakeNext: Uint8Array;
  private listCur: Int32Array;
  private listNext: Int32Array;
  private countNext = 0;
  private readonly arrangeCache = new Map<string, Int32Array>();
  private counts = { top: 0, bottom: 0 };
  private lastMoves = 0;

  constructor(options: SandSimulationOptions) {
    const { profile } = options;
    const dims = SandSimulation.dimensions(profile, options.cols);
    this.cols = dims.cols;
    this.rows = dims.rows;
    this.gateRow = (this.rows - 1) / 2;
    this.seed = options.seed ?? 1;
    this.rng = createRng(this.seed);
    this.slideChance = options.slideChance ?? 0.55;
    this.staticFriction = Math.min(1, Math.max(0.01, options.staticFriction ?? 0.3));

    const size = this.cols * this.rows;
    this.mask = new Uint8Array(size);
    this.cells = new Uint8Array(size);
    this.stamp = new Uint16Array(size);
    this.rank = new Int32Array(size);
    this.awakeCur = new Uint8Array(size);
    this.awakeNext = new Uint8Array(size);
    this.listCur = new Int32Array(size);
    this.listNext = new Int32Array(size);

    // Construimos la máscara evaluando el perfil en el centro de cada celda.
    const wallY = profile.wallThickness / profile.halfHeightRatio;
    const cellW = 2 / this.cols;
    let top = 0;
    let bottom = 0;
    const gate: number[] = [];
    for (let row = 0; row < this.rows; row++) {
      const y = ((row + 0.5) / this.rows) * 2 - 1;
      if (Math.abs(y) > 1 - wallY) continue;
      // Garantizamos al menos media celda de hueco en el cuello.
      const r = Math.max(innerRadiusAt(profile, y), cellW * 0.5);
      for (let col = 0; col < this.cols; col++) {
        const x = ((col + 0.5) / this.cols) * 2 - 1;
        if (Math.abs(x) > r) continue;
        if (row === this.gateRow) {
          gate.push(col);
          continue; // el cuello queda cerrado
        }
        this.mask[row * this.cols + col] = 1;
        if (row < this.gateRow) top++;
        else bottom++;
      }
    }
    this.gateCols = gate;
    this.capacity = { top, bottom };
    // Lista fija de celdas interiores: se reordena (en sitio) al girar la gravedad.
    this.order = new Int32Array(top + bottom);
    this.orderKeys = new Float64Array(size);
    const keys = this.orderKeys;
    this.byKey = (a, b) => (keys[b] as number) - (keys[a] as number);
    for (let i = 0, k = 0; i < size; i++) if (this.mask[i] === 1) this.order[k++] = i;
    const fill = options.fillRatio ?? 0.86;
    this.totalGrains = Math.floor(Math.min(top, bottom) * fill);
  }

  /**
   * Tamaño de la rejilla para un número de columnas deseado. Las celdas son
   * cuadradas, así que las filas salen de la proporción del reloj. Ambos se
   * fuerzan a impares para que existan una columna y una fila centrales.
   * El renderizador lo usa para que el dibujo encaje con la simulación.
   */
  static dimensions(profile: HourglassProfile, cols: number): { cols: number; rows: number } {
    const c = makeOdd(Math.max(9, Math.round(cols)));
    return { cols: c, rows: makeOdd(Math.round(c * profile.halfHeightRatio)) };
  }

  /** Granos en el bulbo superior. */
  get topCount(): number {
    return this.counts.top;
  }

  /** Granos en el bulbo inferior. */
  get bottomCount(): number {
    return this.counts.bottom;
  }

  /** True si en el último paso no se movió ningún grano (arena en reposo). */
  get isSettled(): boolean {
    return this.lastMoves === 0 && this.countNext === 0;
  }

  /** Columna central (por donde cae el chorro). */
  get centerCol(): number {
    return (this.cols - 1) / 2;
  }

  bulbOf(row: number): Bulb | null {
    if (row < this.gateRow) return 'top';
    if (row > this.gateRow) return 'bottom';
    return null;
  }

  /** Vacía el reloj. */
  clear(): void {
    this.cells.fill(0);
    this.awakeNext.fill(0);
    this.countNext = 0;
    this.counts = { top: 0, bottom: 0 };
    this.lastMoves = 0;
  }

  /**
   * Coloca directamente la arena "ya asentada": `top` granos arriba y
   * `bottom` abajo. Se usa al elegir duración (el nivel cambia al instante)
   * o al volver de segundo plano (para ponernos al día sin animar horas).
   */
  arrange(top: number, bottom: number, gravity: Vec2 = GRAVITY_DOWN, options: ArrangeOptions = {}): void {
    const g = normalize(gravity);
    const crater = options.crater ?? 0;
    const mound = options.mound ?? 0.45;
    // El bulbo "receptor" es el que está abajo según la gravedad.
    const receiving: Bulb = g.y >= 0 ? 'bottom' : 'top';
    const topSlope = receiving === 'top' ? mound : -crater;
    const bottomSlope = receiving === 'bottom' ? mound : -crater;

    this.clear();
    const nTop = clampInt(top, 0, this.capacity.top);
    const nBottom = clampInt(bottom, 0, this.capacity.bottom);
    this.fillBulb(this.sortedCells('top', g, topSlope), nTop);
    this.fillBulb(this.sortedCells('bottom', g, bottomSlope), nBottom);
    this.counts = { top: nTop, bottom: nBottom };
    // Solo despertamos la "piel" de la arena: el interior ya está asentado.
    this.wakeSurface();
  }

  /**
   * Avanza la simulación un paso.
   *
   * Optimización clave: solo procesamos granos "despiertos" (los que se han
   * movido hace poco o tienen un vecino que se ha movido). La arena en reposo
   * no cuesta nada, lo que es vital en móviles de gama media.
   *
   * @returns número de granos que se han movido.
   */
  step(gravity: Vec2 = GRAVITY_DOWN): number {
    const g = normalize(gravity);
    // Si la gravedad ha cambiado, recalculamos el orden y despertamos la
    // superficie (los granos rodeados de arena no pueden moverse igualmente).
    if (this.ensureOrder(g)) this.wakeSurface();

    // Intercambiamos las listas: lo despertado en el paso anterior se procesa ahora.
    const curFlag = this.awakeNext;
    const curList = this.listNext;
    const curCount = this.countNext;
    this.awakeNext = this.awakeCur;
    this.listNext = this.listCur;
    this.countNext = 0;
    this.awakeCur = curFlag;
    this.listCur = curList;

    if (curCount === 0) {
      this.lastMoves = 0;
      return 0;
    }

    // Elegimos las dos direcciones discretas más cercanas a la gravedad y un
    // peso entre ellas: así una gravedad inclinada 10° produce un sesgo suave.
    const a = Math.atan2(g.y, g.x) / (Math.PI / 4);
    const k0 = Math.floor(a);
    const w = a - k0;
    const d1 = ((k0 % 8) + 8) % 8;
    const d2 = (d1 + 1) & 7;

    const s = this.nextStamp();
    // Sello del paso anterior: un grano con ese sello "viene rodando".
    const prev = s === 1 ? 0xffff : s - 1;
    const friction = this.staticFriction;
    let moves = 0;

    const process = (idx: number): void => {
      curFlag[idx] = 0;
      const { cells, stamp, rng } = this;
      if (cells[idx] === 0 || stamp[idx] === s) return;
      const x = idx % this.cols;
      const y = (idx - x) / this.cols;

      // 1) Caer en la dirección principal.
      const p = rng() < w ? d2 : d1;
      if (this.moveTo(idx, x + dx(p), y + dy(p), s)) {
        moves++;
        // Si cae al VACÍO (también está libre la celda siguiente), la columna
        // que tenía encima cae con él en el MISMO paso (ver `followColumn`):
        // así una masa de arena baja entera, sin rayas. Si solo rellena un
        // hueco de una celda (un cráter que se va comiendo), no: ahí el hueco
        // debe subir poco a poco para que la ladera se ensanche como siempre.
        if (this.isFree(x + 2 * dx(p), y + 2 * dy(p))) moves += this.followColumn(x, y, p, s);
        return;
      }

      // Rozamiento estático: un grano quieto solo arranca a veces; si no le
      // toca, sigue despierto para intentarlo en el siguiente paso.
      if (stamp[idx] !== prev && rng() >= friction) {
        if (this.couldRoll(x, y, p)) this.wakeCell(idx);
        return;
      }

      // 2) Diagonales (preferimos la que está más cerca de la gravedad real).
      const towards = p === d1 ? (p + 1) & 7 : (p + 7) & 7;
      const away = p === d1 ? (p + 7) & 7 : (p + 1) & 7;
      const bias = p === d1 ? w : 1 - w;
      const first = rng() < 0.5 + 0.5 * bias ? towards : away;
      const second = first === towards ? away : towards;
      if (
        this.moveTo(idx, x + dx(first), y + dy(first), s) ||
        this.moveTo(idx, x + dx(second), y + dy(second), s)
      ) {
        moves++;
        return;
      }

      // 3) Deslizamiento lateral: dos celdas de lado y una "abajo". Suaviza la
      //    pendiente de los montones hasta un ángulo de reposo realista.
      const l = rng() < 0.5 ? (p + 2) & 7 : (p + 6) & 7;
      if (rng() < this.slideChance) {
        if (this.canSlide(x, y, l, p) && this.moveTo(idx, x + 2 * dx(l) + dx(p), y + 2 * dy(l) + dy(p), s))
          moves++;
      } else if (this.canSlide(x, y, l, p) || this.canSlide(x, y, (l + 4) & 7, p)) {
        // No ha tocado deslizar esta vez, pero podría: lo dejamos despierto.
        this.wakeCell(idx);
      }
    };

    if (curCount > this.order.length / 4) {
      // Muchos despiertos: recorremos el orden completo filtrando.
      const order = this.order;
      for (let i = 0; i < order.length; i++) {
        const idx = order[i] as number;
        if (curFlag[idx] === 1) process(idx);
      }
    } else {
      // Pocos despiertos: ordenamos solo esos por "altura" según la gravedad.
      const rank = this.rank;
      const list = curList.subarray(0, curCount);
      list.sort((u, v) => (rank[u] as number) - (rank[v] as number));
      for (let i = 0; i < curCount; i++) process(list[i] as number);
    }
    this.lastMoves = moves;
    return moves;
  }

  /**
   * Pasa hasta `count` granos por el cuello, del bulbo de arriba al de
   * abajo (según la gravedad). Cada grano se deposita donde caería: en la
   * cima del montón o en el fondo.
   * @returns granos transferidos realmente.
   */
  transfer(count: number, gravity: Vec2 = GRAVITY_DOWN): number {
    const g = normalize(gravity);
    // Con el reloj tumbado (casi horizontal) la arena no fluye.
    if (Math.abs(g.y) < 0.25) return 0;
    const dir = g.y > 0 ? 1 : -1;
    let done = 0;
    for (let n = 0; n < count; n++) {
      const src = this.findSourceGrain(dir);
      if (src < 0) break;
      const landing = this.landingIndex(g, dir, true);
      if (landing < 0) break;
      this.cells[landing] = this.cells[src] as number;
      this.cells[src] = 0;
      this.wakeAround(landing, 1);
      // La columna de arena que había encima baja una celda en bloque (como
      // en un reloj real) en lugar de dejar un hueco que "sube" burbujeando.
      this.wakeAround(this.collapseColumn(src, dir), 2);
      if (dir > 0) {
        this.counts.top--;
        this.counts.bottom++;
      } else {
        this.counts.bottom--;
        this.counts.top++;
      }
      done++;
    }
    return done;
  }

  /**
   * Pasa de golpe TODOS los granos que queden en el bulbo emisor al de
   * destino (cada uno se posa donde caería, como en `transfer`).
   *
   * Se usa al terminar una fase de un ciclo: el tiempo de esa fase ya se ha
   * acabado, así que su arena tiene que estar abajo. Al final siempre quedan
   * unas decenas de granos rezagados (resbalan despacio por las paredes del
   * embudo); si no los pasamos, al dar la vuelta al reloj quedaban colgando
   * bajo el cuello y bajaban como un «bloque» de granos en vez de caer.
   * @returns granos movidos.
   */
  flushSource(gravity: Vec2 = GRAVITY_DOWN): number {
    const g = normalize(gravity);
    if (Math.abs(g.y) < 0.25) return 0;
    const dir = g.y > 0 ? 1 : -1;
    const { cols, cells } = this;
    let done = 0;
    // Del cuello hacia fuera: primero los granos más cercanos al cuello.
    for (let d = 1; d <= this.gateRow; d++) {
      const row = this.gateRow - dir * d;
      for (let col = 0; col < cols; col++) {
        const src = row * cols + col;
        if (cells[src] === 0) continue;
        const landing = this.landingIndex(g, dir, true);
        if (landing < 0) return done;
        cells[landing] = cells[src] as number;
        cells[src] = 0;
        this.wakeAround(landing, 1);
        this.wakeAround(src, 1);
        if (dir > 0) {
          this.counts.top--;
          this.counts.bottom++;
        } else {
          this.counts.bottom--;
          this.counts.top++;
        }
        done++;
      }
    }
    return done;
  }

  /** ¿Hay arena junto al cuello lista para caer? */
  hasGrainAtNeck(gravity: Vec2 = GRAVITY_DOWN): boolean {
    const g = normalize(gravity);
    if (Math.abs(g.y) < 0.25) return false;
    return this.findSourceGrain(g.y > 0 ? 1 : -1, false) >= 0;
  }

  /** Celda donde aterrizaría el próximo grano (para dibujar el chorro). */
  landingPoint(gravity: Vec2 = GRAVITY_DOWN): Cell | null {
    const idx = this.landingCell(gravity);
    if (idx < 0) return null;
    return { col: idx % this.cols, row: Math.floor(idx / this.cols) };
  }

  /**
   * Igual que `landingPoint` pero devuelve el ÍNDICE de la celda (o -1) sin
   * crear objetos: pensado para el bucle de dibujo, que corre 60 veces/s.
   */
  landingCell(gravity: Vec2 = GRAVITY_DOWN): number {
    const len = Math.hypot(gravity.x, gravity.y);
    if (!(len > 1e-6) || Math.abs(gravity.y / len) < 0.25) return -1;
    return this.landingIndex(normalize(gravity), gravity.y > 0 ? 1 : -1);
  }

  /**
   * Da la vuelta al reloj (giro de 180°): la arena de abajo pasa arriba.
   *
   * Se usa al voltear el móvil: la pantalla gira 180° a la vez, así que la
   * arena se queda físicamente donde estaba (ahora en el bulbo de arriba) y
   * empieza a caer hacia el otro lado. La máscara es simétrica, así que basta
   * con invertir el array de celdas (sin reservar memoria).
   */
  rotateHalfTurn(): void {
    const { cells, mask } = this;
    const n = cells.length;
    for (let i = 0, j = n - 1; i < j; i++, j--) {
      const t = cells[i] as number;
      cells[i] = cells[j] as number;
      cells[j] = t;
    }
    // Por seguridad (redondeos en el borde de la máscara): un grano que
    // acabara fuera del hueco del vidrio se descarta.
    for (let i = 0; i < n; i++) if (cells[i] !== 0 && mask[i] !== 1) cells[i] = 0;
    this.counts = this.countGrains();
    this.awakeNext.fill(0);
    this.countNext = 0;
    this.wakeSurface();
  }

  /** Cuenta los granos recorriendo la rejilla (para verificación/tests). */
  countGrains(): { top: number; bottom: number } {
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === 0) continue;
      if (Math.floor(i / this.cols) < this.gateRow) top++;
      else bottom++;
    }
    return { top, bottom };
  }

  // ───────────────────────── privados ─────────────────────────

  /** ¿Tiene el grano (x, y) algún hueco hacia el que rodar (diagonal o deslizamiento)? */
  private couldRoll(x: number, y: number, p: number): boolean {
    return (
      this.isFree(x + dx((p + 1) & 7), y + dy((p + 1) & 7)) ||
      this.isFree(x + dx((p + 7) & 7), y + dy((p + 7) & 7)) ||
      this.canSlide(x, y, (p + 2) & 7, p) ||
      this.canSlide(x, y, (p + 6) & 7, p)
    );
  }

  /** ¿Puede deslizarse el grano (x, y) de lado (`dir`) y caer (`p`)? */
  private canSlide(x: number, y: number, dir: number, p: number): boolean {
    return (
      this.isFree(x + dx(dir), y + dy(dir)) && this.isFree(x + 2 * dx(dir) + dx(p), y + 2 * dy(dir) + dy(p))
    );
  }

  private isFree(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    const i = y * this.cols + x;
    return this.mask[i] === 1 && this.cells[i] === 0;
  }

  private nextStamp(): number {
    this.stampValue = (this.stampValue + 1) & 0xffff;
    if (this.stampValue === 0) {
      this.stamp.fill(0);
      this.stampValue = 1;
    }
    return this.stampValue;
  }

  /**
   * Ordena las celdas: primero las que están "más abajo" según la gravedad.
   * @returns true si el orden ha cambiado (la gravedad giró).
   */
  private ensureOrder(g: Vec2): boolean {
    const angle = Math.atan2(g.y, g.x);
    if (Math.abs(angle - this.orderAngle) < 0.01) return false;
    this.orderAngle = angle;
    const { order, orderKeys: keys, cols } = this;
    // Añadimos un pequeño desorden estable a cada clave: así las celdas de
    // una misma "altura" no se recorren siempre de izquierda a derecha, lo
    // que haría que la arena prefiriera un lado.
    for (let k = 0; k < order.length; k++) {
      const i = order[k] as number;
      const x = i % cols;
      keys[i] = x * g.x + ((i - x) / cols) * g.y + ((hash32(i) & 255) / 255) * 0.3;
    }
    // Ordenamos EN SITIO (sin crear arrays): solo ocurre al girar la gravedad.
    order.sort(this.byKey);
    for (let k = 0; k < order.length; k++) this.rank[order[k] as number] = k;
    return true;
  }

  /** Mueve el grano de `from` a (x, y) si está libre, y despierta la zona. */
  private moveTo(from: number, x: number, y: number, s: number): boolean {
    if (!this.isFree(x, y)) return false;
    const to = y * this.cols + x;
    this.cells[to] = this.cells[from] as number;
    this.cells[from] = 0;
    this.stamp[to] = s;
    this.wakeAround(from, 2);
    this.wakeAround(to, 1);
    return true;
  }

  /**
   * Cuando un grano cae en línea recta, los granos que tenía justo encima
   * (en contra de la gravedad) bajan con él en el mismo paso, como un bloque.
   *
   * Por qué: sin esto, cada grano solo se despertaba UN paso después de que
   * se moviera el de debajo, y el aviso subía más deprisa (2 filas por paso)
   * que la arena (1 fila por paso). Una masa que caía entera (al dar la
   * vuelta al reloj, con el bulbo lleno) se abría en filas alternas: las
   * rayas horizontales y el «enrejado» en V que se veían durante 1-1,5 s.
   * Es lo mismo que hace `collapseColumn` en el cuello.
   *
   * Solo arrastra granos que aún no se han movido en este paso (sello `s`)
   * y solo en línea recta: las diagonales y los deslizamientos (rozamiento,
   * avalanchas) no cambian.
   * @returns cuántos granos han bajado.
   */
  private followColumn(x: number, y: number, p: number, s: number): number {
    const { cols, rows, cells, stamp, mask } = this;
    let hx = x;
    let hy = y;
    let moved = 0;
    for (let n = 0; n < rows; n++) {
      const ax = hx - dx(p);
      const ay = hy - dy(p);
      if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) break;
      const a = ay * cols + ax;
      if (mask[a] !== 1 || cells[a] === 0 || stamp[a] === s) break;
      if (!this.moveTo(a, hx, hy, s)) break;
      moved++;
      hx = ax;
      hy = ay;
    }
    return moved;
  }

  /** Marca un grano para procesarlo en el siguiente paso. */
  private wakeCell(i: number): void {
    if (this.cells[i] === 0 || this.awakeNext[i] === 1) return;
    this.awakeNext[i] = 1;
    this.listNext[this.countNext++] = i;
  }

  /** Despierta los granos en un radio `r` alrededor de la celda `i`. */
  private wakeAround(i: number, r: number): void {
    const x0 = i % this.cols;
    const y0 = (i - x0) / this.cols;
    for (let yy = Math.max(0, y0 - r); yy <= Math.min(this.rows - 1, y0 + r); yy++) {
      for (let xx = Math.max(0, x0 - r); xx <= Math.min(this.cols - 1, x0 + r); xx++) {
        this.wakeCell(yy * this.cols + xx);
      }
    }
  }

  /** Despierta los granos que tocan alguna celda interior vacía. */
  private wakeSurface(): void {
    const { cols, rows, cells, mask } = this;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 0) continue;
      const x = i % cols;
      const y = (i - x) / cols;
      let exposed = false;
      for (let k = 0; k < 8 && !exposed; k++) {
        const nx = x + dx(k);
        const ny = y + dy(k);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        exposed = mask[j] === 1 && cells[j] === 0;
      }
      if (exposed) this.wakeCell(i);
    }
  }

  /** Celdas de un bulbo ordenadas de "más profunda" a "más alta". */
  private sortedCells(bulb: Bulb, g: Vec2, slope: number): Int32Array {
    const cacheKey = `${bulb}|${slope.toFixed(3)}|${g.x.toFixed(3)}|${g.y.toFixed(3)}`;
    const cached = this.arrangeCache.get(cacheKey);
    if (cached) return cached;
    const cx = this.centerCol;
    const cy = this.gateRow;
    const list: number[] = [];
    const keys = new Map<number, number>();
    for (let i = 0; i < this.mask.length; i++) {
      if (this.mask[i] === 0) continue;
      const col = i % this.cols;
      const row = Math.floor(i / this.cols);
      if (this.bulbOf(row) !== bulb) continue;
      // Altura contra la gravedad (menor = más profundo).
      const h = -(col * g.x + row * g.y);
      // Distancia al eje del chorro, perpendicular a la gravedad.
      const off = Math.abs((col - cx) * -g.y + (row - cy) * g.x);
      // Un poco de ruido estable para que la superficie no sea perfecta.
      const jitter = ((hash32(i * 7919 + this.seed) & 1023) / 1023) * 0.6;
      keys.set(i, h + slope * off + jitter);
      list.push(i);
    }
    list.sort((a, b) => (keys.get(a) as number) - (keys.get(b) as number));
    const result = Int32Array.from(list);
    this.arrangeCache.set(cacheKey, result);
    return result;
  }

  private fillBulb(sorted: Int32Array, n: number): void {
    for (let k = 0; k < n && k < sorted.length; k++) {
      const idx = sorted[k] as number;
      this.cells[idx] = toneFor(idx, this.seed);
    }
  }

  /**
   * Busca un grano junto al cuello en el bulbo emisor. Si no hay ninguno
   * justo encima, mira unas filas más allá (los últimos granos resbalan).
   */
  private findSourceGrain(dir: 1 | -1, random = true): number {
    const maxDepth = 4;
    for (let depth = 1; depth <= maxDepth; depth++) {
      const row = this.gateRow - dir * depth;
      if (row < 0 || row >= this.rows) break;
      const spread = depth - 1;
      const candidates: number[] = [];
      const first = (this.gateCols[0] ?? this.centerCol) - spread;
      const last = (this.gateCols[this.gateCols.length - 1] ?? this.centerCol) + spread;
      for (let col = first; col <= last; col++) {
        const i = row * this.cols + col;
        if (col >= 0 && col < this.cols && this.cells[i] !== 0) candidates.push(i);
      }
      if (candidates.length > 0) {
        if (!random) return candidates[0] as number;
        return candidates[Math.floor(this.rng() * candidates.length)] as number;
      }
    }
    return -1;
  }

  /**
   * Tras vaciar la celda `hole`, baja un puesto todos los granos contiguos
   * que hay encima (en contra de la gravedad).
   * @returns la celda que queda vacía arriba del todo.
   */
  private collapseColumn(hole: number, dir: 1 | -1): number {
    let current = hole;
    for (;;) {
      const above = current - dir * this.cols;
      if (above < 0 || above >= this.cells.length) break;
      if (this.mask[above] !== 1 || this.cells[above] === 0) break;
      this.cells[current] = this.cells[above] as number;
      this.cells[above] = 0;
      current = above;
    }
    return current;
  }

  /**
   * Recorre el camino de caída desde el cuello hasta tocar arena o vidrio.
   * Con `roll` el grano además rueda por la pendiente (solo al transferir:
   * las consultas no deben consumir aleatoriedad).
   */
  private landingIndex(g: Vec2, dir: 1 | -1, roll = false): number {
    let px = this.centerCol + 0.5;
    let py = this.gateRow + dir + 0.5;
    let current = Math.floor(py) * this.cols + Math.floor(px);
    if (this.mask[current] !== 1 || this.cells[current] !== 0) return -1;
    const maxSteps = (this.rows + this.cols) * 2;
    for (let s = 0; s < maxSteps; s++) {
      px += g.x * 0.5;
      py += g.y * 0.5;
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) break;
      const next = cy * this.cols + cx;
      if (next === current) continue;
      if (this.mask[next] !== 1 || this.cells[next] !== 0) break;
      current = next;
    }
    return roll ? this.rollDown(current, dir) : current;
  }

  /**
   * El grano que aterriza no se queda en equilibrio sobre la punta: rueda
   * por las diagonales libres hasta asentarse (como la arena real). Sin
   * esto, con pocos fotogramas por segundo caían varios granos por
   * fotograma en la misma celda y crecía una "torre" de un grano de ancho
   * que parecía un chorro sólido.
   */
  private rollDown(start: number, dir: 1 | -1): number {
    const { cols, rng } = this;
    let current = start;
    for (let n = 0; n < this.rows; n++) {
      const x = current % cols;
      const y = (current - x) / cols;
      if (this.isFree(x, y + dir)) {
        current += dir * cols;
        continue;
      }
      const first = rng() < 0.5 ? -1 : 1;
      if (this.isFree(x + first, y + dir)) current += dir * cols + first;
      else if (this.isFree(x - first, y + dir)) current += dir * cols - first;
      else break;
    }
    return current;
  }
}

/** Tono estable (1..255) para un grano según su posición inicial. */
export function toneFor(index: number, seed = 1): number {
  return (hash32(index * 2654435761 + seed) % 255) + 1;
}

function makeOdd(n: number): number {
  return n % 2 === 0 ? n + 1 : n;
}

function clampInt(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}
