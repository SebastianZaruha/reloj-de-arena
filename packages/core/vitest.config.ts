import { defineConfig } from 'vitest/config';

// Configuración de Vitest para el paquete core.
// La cobertura se mide con V8 y falla si baja de los umbrales indicados.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/types.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
