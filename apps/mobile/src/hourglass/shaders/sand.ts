/**
 * Shader de la arena.
 *
 * La simulación (en JS) produce una imagen diminuta: un píxel por celda,
 * con el color del grano (o transparente si está vacía). Este shader la
 * "amplía" de forma inteligente:
 *
 *  - Cada celda ocupada se dibuja como 2×2 "microgranos" (solo visuales,
 *    no cuestan nada a la CPU) para que el grano sea fino como arena real.
 *  - Cada micrograno es una esferita con posición, tamaño y tono
 *    ligeramente aleatorios, con luz difusa, un brillo de cuarzo y
 *    oclusión en el borde. Los solapes se resuelven quedándonos con la
 *    esfera más "alta" (un pequeño z-buffer).
 *  - Los huecos entre granos se ven como poros en sombra.
 *  - Un sombreado cilíndrico global (los lados del bulbo reciben menos luz)
 *    hace que el volumen se lea en 3D.
 *  - Celdas con alfa parcial (esquinas de los escalones de la superficie,
 *    ver SandPainter.compose): solo se dibujan algunos de sus microgranos,
 *    lo que suaviza el borde del montón.
 *  - Destellos (1.4): las celdas con alfa 254 (SPARKLE_ALPHA, ~5 % de los
 *    granos, siempre los mismos) tienen una "cara" de cuarzo con su propia
 *    orientación. Cuando la luz (que se mueve al inclinar el móvil) se
 *    alinea con esa cara, el grano brilla un instante. Con el móvil quieto
 *    el brillo no cambia: no parpadea.
 */
import { PROFILE_SKSL } from './common';

export const SAND_SKSL = /* glsl */ `
uniform shader uGrid;       // imagen de la simulación (1 píxel = 1 celda)
${PROFILE_SKSL}
uniform float2 uOrigin;     // esquina superior izquierda de la rejilla (px)
uniform float uCell;        // tamaño de celda (px)
uniform float2 uGridSize;   // columnas, filas
uniform float2 uLight;      // inclinación de la luz (-1..1)
uniform float2 uGravity;    // gravedad (para iluminar la superficie)
uniform float uExposure;

half4 cellAt(float2 c) {
  if (c.x < 0.0 || c.y < 0.0 || c.x >= uGridSize.x || c.y >= uGridSize.y) return half4(0.0);
  return uGrid.eval(c + 0.5);
}

half4 main(float2 pos) {
  float2 g = (pos - uOrigin) / uCell;   // coordenadas de celda
  float2 m = g * 2.0;                   // coordenadas de micrograno
  float2 mc = floor(m);
  half4 own = cellAt(floor(g));

  float3 lightDir = normalize(float3(-0.45 + uLight.x * 0.5, -0.8 + uLight.y * 0.5, 0.95));

  // Luz de los destellos: se mueve MÁS con la inclinación que la luz
  // principal, así unos pocos grados bastan para encender/apagar destellos.
  float3 glintDir = normalize(float3(-0.45 + uLight.x * 1.8, -0.8 + uLight.y * 1.8, 0.9));

  float bestH = -1.0;
  float bestSparkle = 0.0;
  float3 bestN = float3(0.0, 0.0, 1.0);
  float3 bestCol = float3(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      float2 nm = mc + float2(float(i), float(j));
      half4 col = cellAt(floor(nm * 0.5));
      if (col.a < 0.01) continue;
      float h1 = hash12(nm * 1.37 + 11.0);
      float h2 = hash12(nm * 2.11 + 3.0);
      float h3 = hash12(nm * 0.73 + 7.0);
      // Celda de borde (alfa parcial): solo algunos microgranos.
      if (col.a < 0.99 && hash12(nm * 3.17 + 5.0) > float(col.a)) continue;
      // Desplazamiento aleatorio amplio: rompe la rejilla regular.
      float2 center = nm + 0.5 + (float2(h1, h2) - 0.5) * 0.85;
      float radius = 0.58 + 0.27 * h3;
      float2 d = m - center;
      float dd = dot(d, d);
      if (dd > radius * radius) continue;
      float z = sqrt(radius * radius - dd);
      float h = z + h2 * 0.3;
      if (h > bestH) {
        bestH = h;
        bestN = normalize(float3(d, z));
        // Variación de tono por micrograno y alguna mota más oscura o clara.
        float v = 0.9 + 0.2 * h3;
        float speck = h1 > 0.965 ? 0.72 : (h1 < 0.03 ? 1.12 : 1.0);
        // Skia entrega el color premultiplicado por alfa: lo deshacemos para
        // que los granos de borde (alfa parcial) no salgan más oscuros.
        bestCol = float3(col.rgb) / max(float(col.a), 0.01) * v * speck;
        // ¿Grano con destello? (alfa 254: entre 0.99 y 0.999)
        bestSparkle = (col.a > 0.99 && col.a < 0.999) ? 1.0 : 0.0;
      }
    }
  }

  if (bestH < 0.0) {
    // Hueco entre granos: si la celda está llena, sombra de poro.
    if (own.a < 0.99) return half4(0.0);
    return half4(own.rgb * 0.76 * uExposure, 1.0);
  }

  // Luz difusa suave + ambiente + brillo de cuarzo.
  float diff = max(dot(bestN, lightDir), 0.0);
  float spec = pow(max(dot(reflect(-lightDir, bestN), float3(0.0, 0.0, 1.0)), 0.0), 30.0);
  float light = 0.8 + 0.27 * diff;

  // Sombreado cilíndrico global.
  float2 q = pos - uCenter;
  float r = max(radiusAt(q.y / uHalf.y), 1e-3);
  float s = clamp(q.x / (r * uHalf.x), -1.0, 1.0);
  float cyl = 1.0 - 0.3 * pow(abs(s), 2.4) - 0.05 * s;

  // Los granos de la superficie (sin vecino "encima") reciben algo más de luz.
  float2 up = float2(sign(uGravity.x) * step(0.5, abs(uGravity.x)), sign(uGravity.y) * step(0.5, abs(uGravity.y)));
  float surface = cellAt(floor(g) - up).a < 0.99 ? 1.06 : 1.0;

  float3 col = bestCol * light * cyl * surface * uExposure + spec * 0.1;
  if (bestSparkle > 0.5) {
    // Orientación de su cara de cuarzo: sale del color del grano (estable:
    // el mismo grano siempre tiene la misma cara).
    float p1 = fract(bestCol.r * 37.1 + bestCol.g * 19.7);
    float p2 = fract(p1 * 7.31 + bestCol.b * 3.3);
    float3 facet = normalize(bestN + float3(p1 - 0.5, p2 - 0.5, 0.1) * 1.4);
    // pow(x, 16) con multiplicaciones (más barato que pow en algunos móviles).
    float g = max(dot(reflect(-glintDir, facet), float3(0.0, 0.0, 1.0)), 0.0);
    g *= g; g *= g; g *= g; g *= g;
    col += float3(1.0, 0.97, 0.9) * g * 0.6 * uExposure;
  }
  col *= mix(0.88, 1.0, smoothstep(0.0, 0.5, bestN.z));
  return half4(half3(col), 1.0);
}
`;
