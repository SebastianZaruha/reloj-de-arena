// Configuración de ESLint (formato "flat config") para todo el monorepo.
//
// - apps/mobile usa la configuración oficial de Expo (React, hooks, RN...).
// - packages/core usa las reglas recomendadas de TypeScript.
// - Al final desactivamos las reglas de estilo que ya cubre Prettier.
import expoConfig from 'eslint-config-expo/flat.js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**', '**/coverage/**', '**/public/**', 'docs/**'],
  },
  // App móvil (Expo).
  ...expoConfig.map((config) => ({ ...config, files: config.files ?? ['apps/mobile/**/*.{ts,tsx,js}'] })),
  // Paquete core: TypeScript puro.
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['packages/core/**/*.ts'] })),
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  prettier,
];
