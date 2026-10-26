// Deploy GATE lint config (CI: `npm run lint:gate`).
//
// The full `eslint.config.js` still carries ~100 legacy errors (unused vars,
// hook-purity warnings) that are being burned down gradually. This file holds
// ONLY the rules whose violation means the app will crash at runtime — the
// class of bug that took Classroom down for every user on 2026-07-28
// (`GraduationCap` rendered without being imported). It must stay at zero.
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage']),
  {
    files: ['**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.vitest },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      ...Object.fromEntries(Object.keys(js.configs.recommended.rules).map((r) => [r, 'off'])),
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
])
