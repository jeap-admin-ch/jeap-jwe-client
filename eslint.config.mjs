import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'out-tsc/**', 'coverage/**', '**/*.d.ts'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.spec.ts', '**/testing/**/*.ts'],
    rules: {
      /**
       * Test code may use non-null assertions and broader typing for brevity.
       */
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  }
);
