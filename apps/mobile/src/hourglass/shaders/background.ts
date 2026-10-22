/**
 * Shader del fondo: degradado cálido, una luz suave difusa (como una ventana
 * fuera de foco, igual que en la foto de referencia), viñeta y un grano muy
 * fino que evita las "bandas" de los degradados en pantallas de 8 bits.
 * Por debajo de la base del reloj se insinúa una mesa muy difusa.
 */
export const BACKGROUND_SKSL = /* glsl */ `
uniform float2 uSize;
uniform float2 uOffset;     // desplazamiento de paralaje (px)
uniform float3 uTop;
uniform float3 uBottom;
uniform float3 uGlow;
uniform float2 uGlowPos;    // posición de la luz (0..1)
uniform float3 uVignette;
uniform float uHorizon;     // altura (px) donde la "mesa" se une a la pared

float hash(float2 p) {
  float3 p3 = fract(float3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

half4 main(float2 pos) {
  float2 p = (pos + uOffset) / uSize;
  float3 col = mix(uTop, uBottom, smoothstep(0.0, 1.0, p.y));

  // Luz principal: mancha alargada y muy difusa arriba a la izquierda.
  float2 d = (p - uGlowPos) * float2(1.15, 0.75);
  col = mix(col, uGlow, 0.9 * exp(-dot(d, d) * 4.0));
  // Luz rebotada, más débil, abajo a la derecha.
  float2 d2 = (p - float2(0.85, 0.78)) * float2(1.3, 1.0);
  col = mix(col, uGlow, 0.18 * exp(-dot(d2, d2) * 6.0));

  // Mesa: por debajo del horizonte la superficie es un pelín más clara y
  // se oscurece hacia el borde inferior. La transición es muy difusa.
  float table = smoothstep(uHorizon - uSize.y * 0.05, uHorizon + uSize.y * 0.12, pos.y + uOffset.y);
  col = mix(col, col * 1.035, table * (1.0 - smoothstep(0.0, 1.0, (pos.y - uHorizon) / (uSize.y * 0.6))));

  // Viñeta suave.
  float2 v = (p - float2(0.5, 0.48)) * float2(1.0, 0.8);
  col = mix(col, uVignette, 0.5 * smoothstep(0.25, 0.85, length(v)));

  // Grano fino (dither).
  col += (hash(pos) - 0.5) * (1.6 / 255.0);
  return half4(half3(col), 1.0);
}
`;
