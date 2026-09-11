import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import electron from 'vite-plugin-electron'
import { readFileSync } from 'node:fs'

// UI 版本号唯一来源：根 package.json（经 __APP_VERSION__ 注入，SettingsPanel 展示）
const appVersion = JSON.parse(readFileSync('./package.json', 'utf8')).version as string

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart: (options) => options.startup(),
        vite: {
          build: {
            sourcemap: true,
            minify: false,
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart: (options) => options.reload(),
        vite: {
          build: {
            sourcemap: true,
            minify: false,
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    ])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  optimizeDeps: {
    include: [
      'pixi.js',
      'pixi-live2d-display/cubism4',
      '@pixi/core',
      '@pixi/display',
      '@pixi/app',
      '@pixi/ticker',
      '@pixi/math',
      '@pixi/runner',
      '@pixi/settings',
      '@pixi/utils',
    ]
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500
  }
})
