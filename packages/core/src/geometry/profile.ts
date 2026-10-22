/**
 * Perfil (silueta) del reloj de arena.
 *
 * Describimos la forma con una función matemática `radiusAt(u)`: dada la
 * distancia vertical normalizada desde el cuello (u = 0 en el cuello, u = 1
 * en el extremo), devuelve el radio normalizado (1 = ancho máximo).
 *
 * Cada bulbo es una elipse deformada en forma de pera (más ancha hacia el
 * extremo y afilada hacia el cuello) y el cuello es un tubo fino; los unimos
 * con un "smooth max" (máximo suavizado) que crea un estrechamiento suave,
 * como el vidrio soplado de verdad.
 *
 * IMPORTANTE: el shader de vidrio (SkSL, en la app) implementa la MISMA
 * fórmula. Si cambias algo aquí, cámbialo también allí.
 */

/** Parámetros geométricos de un modelo de reloj (todo normalizado). */
export interface HourglassProfile {
  /** Alto de cada mitad respecto al semiancho (2 → el reloj es 2 veces más alto que ancho). */
  readonly halfHeightRatio: number;
  /** Centro vertical de la elipse del bulbo (en u). */
  readonly bulbCenter: number;
  /** Semieje vertical de la elipse del bulbo (en u). */
  readonly bulbRadiusY: number;
  /** Radio del cuello (en unidades del semiancho). */
  readonly neckRadius: number;
  /** Tamaño del redondeo entre cuello y bulbo. */
  readonly fillet: number;
  /** Asimetría de "pera": >0 ensancha el bulbo hacia el extremo. */
  readonly egg: number;
  /** Afilado hacia el cuello (1 = elipse; >1 = flancos más cónicos). */
  readonly taper: number;
  /** Grosor del vidrio (en unidades del semiancho). */
  readonly wallThickness: number;
}

/** Máximo suavizado polinómico (Inigo Quilez). k = anchura de la transición. */
export function smoothMax(a: number, b: number, k: number): number {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return a * (1 - h) + b * h + k * h * (1 - h);
}

/**
 * Forma del bulbo sin normalizar, con t ∈ [-1, 1] (-1 = lado del cuello).
 * Es una elipse multiplicada por (1 + egg·t) para darle forma de pera, con
 * un exponente mayor en el lado del cuello para que los flancos sean cónicos.
 */
function bulbShape(p: HourglassProfile, t: number): number {
  if (t <= -1 || t >= 1) return 0;
  const exponent = t < 0 ? 0.5 * p.taper : 0.5;
  return Math.pow(1 - t * t, exponent) * (1 + p.egg * t);
}

/**
 * Factor que hace que el ancho máximo del bulbo valga exactamente 1.
 * El máximo de sqrt(1-t²)·(1+a·t) está en t = (√(1+8a²) - 1) / (4a).
 * (Los shaders reciben este valor como uniform para no repetir el cálculo.)
 */
export function profileNorm(p: HourglassProfile): number {
  if (p.egg <= 0) return 1;
  const t = (Math.sqrt(1 + 8 * p.egg * p.egg) - 1) / (4 * p.egg);
  return bulbShape(p, t);
}

/** Radio exterior normalizado a una distancia `u` (0..1) del cuello. */
export function radiusAt(p: HourglassProfile, u: number): number {
  const au = Math.abs(u);
  if (au > 1) return 0;
  const t = (au - p.bulbCenter) / p.bulbRadiusY;
  return smoothMax(bulbShape(p, t) / profileNorm(p), p.neckRadius, p.fillet);
}

/** Radio interior (el hueco donde cabe la arena). */
export function innerRadiusAt(p: HourglassProfile, u: number): number {
  return Math.max(0, radiusAt(p, u) - p.wallThickness);
}

/**
 * ¿Está el punto normalizado (x, y) dentro del hueco interior?
 * x ∈ [-1, 1] (horizontal), y ∈ [-1, 1] (vertical, -1 arriba, 0 cuello).
 */
export function isInside(p: HourglassProfile, x: number, y: number): boolean {
  const wallY = p.wallThickness / p.halfHeightRatio;
  if (Math.abs(y) > 1 - wallY) return false;
  return Math.abs(x) <= innerRadiusAt(p, y);
}

/**
 * Puntos del contorno (lado derecho, de arriba a abajo) en coordenadas
 * normalizadas. La app los escala a píxeles y los refleja para formar el
 * trazado completo.
 */
export function outlinePoints(
  p: HourglassProfile,
  segments = 160,
  inner = false,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const wallY = inner ? p.wallThickness / p.halfHeightRatio : 0;
  for (let i = 0; i <= segments; i++) {
    const y = -1 + wallY + ((2 - 2 * wallY) * i) / segments;
    const r = inner ? innerRadiusAt(p, y) : radiusAt(p, y);
    pts.push({ x: r, y });
  }
  return pts;
}
