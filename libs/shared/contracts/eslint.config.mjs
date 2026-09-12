import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            // Specs are not part of the published surface, so what they import
            // must not land in this package's `dependencies`. The .ts specs
            // never tripped this only because vitest globals are enabled; a
            // plain-JavaScript spec has to import the runner by name.
            '{projectRoot}/src/**/*.spec.{ts,tsx,js,mjs}',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
