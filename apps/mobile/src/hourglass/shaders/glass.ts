/**
 * Shaders del vidrio.
 *
 * Se dibujan en dos pasadas para imitar un vidrio real:
 *
 * 1. CUERPO (debajo de la arena): lo que se ve A TRAVÉS del vidrio. Toma el
 *    fondo como "shader hijo" y lo muestrea con un pequeño desplazamiento
 *    que depende de la curvatura → refracción. Cerca del borde el vidrio
 *    absorbe un poco más (se oscurece y tiñe ligeramente).
 *
 * 2. FRENTE (encima de la arena): reflejos. Calculamos la normal de la
 *    superficie de revolución, reflejamos el rayo de la cámara y miramos
 *    qué "ve" en un entorno sencillo: dos ventanas luminosas y un techo
 *    claro. Multiplicado por el término de Fresnel (el vidrio refleja más
 *    cuanto más de canto lo miras), da brillos que siguen la forma del
 *    bulbo, como en una foto.
 *
 * `uLight` desplaza la dirección de la luz (viene de la inclinación del
 * móvil) y `uParallax` desplaza los reflejos unos píxeles respecto al
 * cuerpo para dar sensación de profundidad.
 *
 * IMPERFECCIONES (1.4), todas muy sutiles para que el vidrio parezca soplado
 * a mano y no un dibujo perfecto:
 *  - Grosor: el vidrio es más grueso en los extremos y en el cuello
 *    (`glassThickness`, en common.ts). Ahí absorbe más (más oscuro y teñido)
 *    y el canto brilla más.
 *  - Ondulaciones: un ondulación suave (`glassWave`) tuerce un poco la refracción y
 *    los reflejos, para que las ventanas reflejadas no tengan bordes rectos
 *    perfectos ni la misma intensidad en todo el bulbo.
 *  - Lente: dentro de los bulbos el fondo se ve ligeramente ampliado.
 */
import { PROFILE_SKSL } from './common';

export const GLASS_BODY_SKSL = /* glsl */ `
uniform shader uBackground;
${PROFILE_SKSL}
uniform float uRefraction;  // desplazamiento máximo (px)
uniform float3 uTint;       // color del vidrio
uniform float uTintAmount;  // 0..1
uniform float2 uLight;      // inclinación de la luz (-1..1)
uniform float uReflection;  // intensidad global de reflejos

half4 main(float2 pos) {
  float2 q = pos - uCenter;
  float s;
  float3 n = surfaceNormal(q, s);
  float edge = 1.0 - n.z;              // 0 en el centro, 1 en el canto

  float u = q.y / uHalf.y;
  float thick = glassThickness(u);
  float bulbMask = smoothstep(0.08, 0.3, abs(u));

  // Refracción: el vidrio curvo "encoge" lo que hay detrás hacia el centro.
  float2 offset = -n.xy * uRefraction * (0.3 + 1.6 * edge * edge + 0.8 * thick);
  // Lente: dentro del bulbo el fondo se ve un 3 % más grande (muestreamos
  // más cerca del centro de cada bulbo).
  float2 bulbCenter = float2(0.0, sign(u) * uProfile.x * uHalf.y);
  offset -= (q - bulbCenter) * 0.03 * bulbMask;
  // Ondulaciones del vidrio soplado: desvío lento de ±0.4 × uRefraction.
  offset += glassWave(s, u) * uRefraction * 0.4;
  float3 c = uBackground.eval(pos + offset).rgb;

  // Absorción: cerca del canto la luz atraviesa más vidrio → banda grisácea.
  // Más ancha y marcada donde el vidrio es más grueso (extremos y cuello).
  float band = smoothstep(0.74 - 0.12 * thick, 0.995, abs(s));
  c = mix(c, c * uTint, uTintAmount + 0.55 * band + 0.18 * thick);
  c *= 1.0 - 0.07 * band - 0.03 * thick;

  // Reflejo tenue de la pared trasera (opuesto a la luz principal).
  float back = exp(-pow((s - 0.6 - uLight.x * 0.15) / 0.1, 2.0));
  c += 0.045 * uReflection * back * bulbMask;
  // Luz que se concentra dentro del bulbo (efecto lente): centro algo más claro.
  c += 0.025 * uReflection * (1.0 - abs(s)) * bulbMask;

  return half4(half3(c), 1.0);
}
`;

export const GLASS_FRONT_SKSL = /* glsl */ `
${PROFILE_SKSL}
uniform float2 uLight;       // inclinación de la luz (-1..1)
uniform float2 uParallax;    // desplazamiento de reflejos (px)
uniform float uReflection;   // intensidad global de reflejos
uniform float uRim;          // intensidad del brillo de borde
uniform float uSpecular;     // intensidad especular

// Rectángulo suave en el espacio de direcciones (una "ventana" luminosa).
float softBox(float2 p, float2 lo, float2 hi, float blur) {
  float2 a = smoothstep(lo - blur, lo + blur, p);
  float2 b = 1.0 - smoothstep(hi - blur, hi + blur, p);
  return a.x * a.y * b.x * b.y;
}

half4 main(float2 pos) {
  float2 q = pos - uCenter - uParallax;
  float s;
  float3 n = surfaceNormal(q, s);
  float3 v = float3(0.0, 0.0, 1.0);
  float3 r = reflect(-v, n);            // dirección reflejada
  float bulb = smoothstep(0.06, 0.22, abs(q.y / uHalf.y));

  // Fresnel (aproximación de Schlick para vidrio, n ≈ 1.5).
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(n.z, 0.0, 1.0), 5.0);

  // Entorno: ventana principal arriba-izquierda (con un parteluz), otra
  // débil a la derecha y un techo ligeramente luminoso.
  float2 sh = uLight * 0.25;
  // Ondulaciones: el vidrio no es perfecto, así que lo reflejado se tuerce
  // un poco y su intensidad varía a lo largo del bulbo.
  float u = q.y / uHalf.y;
  float2 wave = glassWave(s, u);
  r.xy += wave * 0.03;
  float uneven = 1.0 + 0.18 * wave.x * wave.y + 0.1 * wave.y;
  float win = softBox(r.xy, float2(-0.80, -0.78) + sh, float2(-0.50, 0.10) + sh, 0.05);
  win *= 1.0 - 0.75 * softBox(r.xy, float2(-0.67, -0.78) + sh, float2(-0.63, 0.10) + sh, 0.015);
  float win2 = softBox(r.xy, float2(0.50, -0.60) + sh * 0.8, float2(0.64, 0.05) + sh * 0.8, 0.06) * 0.5;
  float ceiling = smoothstep(0.2, -0.95, r.y) * 0.12;

  float env = (uSpecular * (win + win2) * bulb + ceiling) * uneven;
  float refl = env * (0.45 + 0.55 * fres) + uRim * fres * 0.6;

  // Línea brillante fina junto al canto izquierdo (luz atrapada en el grosor del vidrio).
  float rimLine = exp(-pow((s + 0.955 - uLight.x * 0.02) / 0.018, 2.0)) * 0.55 * bulb;
  float rimLine2 = exp(-pow((s - 0.96) / 0.015, 2.0)) * 0.22 * bulb;
  // Vidrio más grueso (extremos y cuello): el canto se ve como una banda
  // con un filo claro por dentro y algo más oscura junto al borde.
  float thick = glassThickness(u);
  float as = abs(s);
  float thickLine = exp(-pow((as - 0.9) / 0.03, 2.0)) * 0.3 * thick;
  float thickDark = smoothstep(0.9, 0.99, as) * 0.16 * thick;

  // Pequeño destello puntual (sol) para dar "chispa".
  float3 l = normalize(float3(-0.55 + uLight.x * 0.4, -0.6 + uLight.y * 0.4, 0.58));
  float spark = pow(max(dot(n, normalize(l + v)), 0.0), 260.0) * uSpecular;

  float a = clamp((refl + rimLine + rimLine2 + thickLine + spark) * uReflection, 0.0, 0.92);
  // Banda oscura del vidrio grueso (marrón cálido muy tenue).
  float d = clamp(thickDark, 0.0, 0.3) * (1.0 - a);
  // Salida premultiplicada: blanco cálido (reflejo) + marrón oscuro (grosor).
  return half4(half3(1.0, 0.988, 0.965) * a + half3(0.24, 0.2, 0.16) * d, a + d);
}
`;
