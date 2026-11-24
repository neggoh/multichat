// Flat ESLint config for `yarn lint` (`eslint .`). Next.js 16 removed `next lint`,
// so this file is the lint entry point; eslint-config-next 16 ships flat configs.
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  globalIgnores(['.next/**', '.build/**', 'node_modules/**', 'out/**', 'build/**', 'next-env.d.ts']),
  ...nextVitals,
  ...nextTs,
  {
    // Arquivos de configuração CommonJS (next.config.js) usam require por definição.
    files: ['next.config.js', 'postcss.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      // O app renderiza no cliente depois de `mounted` (padrão deliberado para evitar
      // mismatch de hidratação com o localStorage) e escolhe ícones por mapa em tempo de
      // render — dois padrões que o React Compiler sinaliza, mas que aqui são intencionais.
      'react-hooks/static-components': 'off',
    },
  },
]);
