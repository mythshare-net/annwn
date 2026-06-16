import js from '@eslint/js';

// Flat config. The key job here is `no-undef` over the browser game source — it catches
// missed references during the monolith→module decomposition (the riskiest refactor).
export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // browser env used by the game
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', performance: 'readonly', requestAnimationFrame: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
        addEventListener: 'readonly', AudioContext: 'readonly', webkitAudioContext: 'readonly',
        Float32Array: 'readonly', Uint8ClampedArray: 'readonly', Image: 'readonly',
        Math: 'readonly', JSON: 'readonly', console: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': 'off',
      // game uses `obj.hasOwnProperty(...)` on plain object literals — safe here
      'no-prototype-builtins': 'off',
    },
  },
  {
    files: ['tools/**/*.mjs', 'test/**/*.js', 'src/levels/**/*.js', 'src/engine/rng.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
    rules: { 'no-unused-vars': ['warn', { args: 'none' }] },
  },
];
