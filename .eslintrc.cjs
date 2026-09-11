module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  ignorePatterns: ['dist', 'dist-electron', 'release', 'node_modules', 'server/dist', 'server/node_modules', '*.cjs'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'off',
    'react-refresh/only-export-components': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-require-imports': 'error',
    'no-undef': 'off',
    // 跨平台纪律：渲染进程代码禁止 Node 专属全局（盘符路径检查由 CI grep 承担，见 .gitea/workflows）
    'no-restricted-globals': ['error', { name: 'process', message: '渲染进程禁止使用 process（经 preload/IPC 暴露的能力除外）' }, { name: '__dirname', message: '渲染进程禁止使用 __dirname' }, { name: 'require', message: '渲染进程禁止使用 require' }],
  },
  overrides: [
    {
      // Node 侧代码（Electron 主进程 + server）允许 Node 全局
      files: ['electron/**/*.ts', 'server/src/**/*.ts', 'vite.config.ts'],
      env: { node: true, browser: true },
      rules: {
        'no-restricted-globals': 'off',
      },
    },
    {
      files: ['*.tsx'],
      parserOptions: { jsx: true },
    },
  ],
};
