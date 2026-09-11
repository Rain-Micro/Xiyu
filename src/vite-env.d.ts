/// <reference types="vite/client" />

import { ElectronAPI } from '../electron/preload'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
  /** 由 vite.config.ts define 注入，来源为根 package.json 的 version */
  const __APP_VERSION__: string
}

export {}
