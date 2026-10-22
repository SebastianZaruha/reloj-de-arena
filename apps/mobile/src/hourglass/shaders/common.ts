/**
 * Fragmentos SkSL compartidos por varios shaders.
 *
 * `PROFILE_SKSL` reproduce EXACTAMENTE la función `radiusAt` de
 * `@reloj/core` (geometry/profile.ts). Así el vidrio y la arena que dibuja
 * la GPU encajan con la máscara de la simulación que corre en JavaScript.
 */
export const PROFILE_SKSL = /* glsl */ `
uniform float2 uCenter;   // centro del reloj en píxeles
uniform float2 uHalf;     // semiancho (x) y semialto (y) en píxeles
uniform float4 uProfile;  // bulbCenter, bulbRadiusY, neckRadius, fillet
uniform float3 uShape;    // egg, taper, norm (ver profileNorm en el core)

float smax(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(a, b, h) + k * h * (1.0 - h);
}

// Forma de pera del bulbo (t = -1 lado del cuello, 1 extremo).
float bulbShape(float t) {
  if (t <= -1.0 || t >= 1.0) return 0.0;
  float ex = t < 0.0 ? 0.5 * uShape.y : 0.5;
  return pow(max(1.0 - t * t, 0.0), ex) * (1.0 + uShape.x * t);
}

// Radio normalizado (1 = ancho máximo) a una altura normalizada u (0 = cuello).
float radiusAt(float u) {
  float au = abs(u);
  if (au > 1.0) return 0.0;
  float t = (au - uProfile.x) / uProfile.y;
  return smax(bulbShape(t) / uShape.z, uProfile.z, uProfile.w);
}

// Normal 3D aproximada de la superficie de revolución en el punto q
// (q relativo al centro, en píxeles). s = posición horizontal relativa (-1..1).
float3 surfaceNormal(float2 q, out float s) {
  float u = q.y / uHalf.y;
  float r = max(radiusAt(u), 1e-3);
  s = clamp(q.x / (r * uHalf.x), -0.999, 0.999);
  float nz = sqrt(1.0 - s * s);
  // Pendiente del perfil (dr/dy en píxeles) para inclinar la normal arriba/abajo.
  float e = 0.004;
  float dr = (radiusAt(u + e) - radiusAt(u - e)) / (2.0 * e) * (uHalf.x / uHalf.y);
  return normalize(float3(s, -dr * nz, nz));
}

float hash12(float2 p) {
  float3 p3 = fract(float3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Ondulación suave del vidrio soplado (1.4): dos valores -1..1 que cambian
// despacio con la posición (s = horizontal relativa, u = altura). Son senos
// con frecuencias "raras" y oblicuas para que no se vea un patrón regular;
// mucho más barato que un ruido con hash (importante: se evalúa por píxel
// en cada fotograma, así que solo usamos dos senos).
float2 glassWave(float s, float u) {
  float a = sin(u * 9.3 + s * 2.1 + 1.7 + 0.8 * sin(u * 3.1));
  float b = sin(u * 6.7 - s * 3.7 + 0.4);
  return float2(a, b);
}

// Grosor extra del vidrio (0..1) a una altura normalizada u: el vidrio
// soplado es más grueso en los extremos (donde se une a las tapas) y en el
// cuello (donde se estrecha). En el resto vale 0.
float glassThickness(float u) {
  float au = abs(u);
  float ends = smoothstep(0.84, 0.985, au);
  float neck = 1.0 - smoothstep(0.02, 0.16, au);
  return max(ends, neck);
}
`;
