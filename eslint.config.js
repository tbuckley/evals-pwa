import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  ...ts.configs.stylisticTypeChecked,
  prettier,
  {
    // TODO: Maybe don't ignore top level ts/js files?
    ignores: ['build/', '.svelte-kit/', 'dist/', '*.ts', '*.js', '*.mjs', 'examples/'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        // Ignore variables that start with _ or $$ (used by shadcn-svelte)
        { argsIgnorePattern: '^(_|\\$\\$)', varsIgnorePattern: '^(_|\\$\\$)' },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowBoolean: true,
          allowNumber: true,
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.ts', '**/*.svelte'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.nodeBuiltin,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
  },
  ...svelte.configs['flat/recommended'],
  ...svelte.configs['flat/prettier'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
);
