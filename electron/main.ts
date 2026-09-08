import { app, BrowserWindow, ipcMain, screen, crashReporter } from 'electron'
import path from 'path'
import fs from 'fs'

crashReporter.start({ submitURL: '', uploadToServer: false })
// 不再禁用硬件加速：Live2D/WebGL 需 GPU 渲染，软件模拟会导致动画严重卡顿；
// GPU 进程异常有下方 gpu-process-crashed 日志兜底

const logFile = path.join(app.getPath('userData'), 'app-debug.log')
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  fs.appendFileSync(logFile, line)
}

let mainWindow: BrowserWindow | null = null
let petWindow: BrowserWindow | null = null

function createMainWindow() {
  log('Creating main window')
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    },
    titleBarStyle: 'hiddenInset',
    show: true
  })

  const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL

  mainWindow.webContents.on('console-message', (_e, level, message, lineNum, sourceId) => {
    log(`[Renderer ${level}] ${message} (${sourceId}:${lineNum})`)
  })

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log(`did-fail-load: code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`render-process-gone: reason=${details.reason} exitCode=${details.exitCode}`)
  })

  mainWindow.on('unresponsive', () => {
    log('Window unresponsive')
  })

  mainWindow.webContents.on('did-finish-load', () => {
    log('did-finish-load: page loaded successfully')
    mainWindow?.webContents.executeJavaScript(`
      window.__errors = [];
      window.addEventListener('error', (e) => {
        window.__errors.push('Error: ' + (e.error ? e.error.stack : e.message) + ' at ' + e.filename + ':' + e.lineno);
      });
      window.addEventListener('unhandledrejection', (e) => {
        window.__errors.push('UnhandledRejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason)));
      });
      const root = document.getElementById('root');
      const rootContent = root ? root.innerHTML.substring(0, 500) : 'NO ROOT ELEMENT';
      JSON.stringify({ rootContent, location: window.location.href, errors: window.__errors });
    `).then((result: string) => {
      log(`DOM check: ${result}`)
    }).catch((err: Error) => {
      log(`DOM check failed: ${err.message}`)
    })

    setInterval(() => {
      mainWindow?.webContents.executeJavaScript(`
        JSON.stringify({
          errors: window.__errors || [],
          rootChildCount: document.getElementById('root') ? document.getElementById('root').childElementCount : -1,
          bodyChildCount: document.body.childElementCount,
          mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : 'n/a',
          url: window.location.href,
          inputs: document.querySelectorAll('input').length,
          buttons: document.querySelectorAll('button').length
        })
      `).then((result: string) => {
        log(`Renderer monitor: ${result}`)
      }).catch((err: Error) => {
        log(`Renderer monitor failed: ${err.message}`)
      })
    }, 5000)
  })

  mainWindow.webContents.on('dom-ready', () => {
    log('dom-ready: DOM is ready')
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    const distPath = path.join(app.getAppPath(), 'dist/index.html')
    log(`Loading file: ${distPath}`)
    log(`App path: ${app.getAppPath()}`)
    mainWindow.loadFile(distPath)

    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.shift && input.key.toLowerCase() === 'j') ||
        (input.control && input.key.toLowerCase() === 'u')
      ) {
        event.preventDefault()
      }
    })
  }

  mainWindow.on('closed', () => {
    log('Main window closed')
    mainWindow = null
  })
}

function createPetWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  petWindow = new BrowserWindow({
    width: 200,
    height: 250,
    x: width - 220,
    y: height - 270,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  const isDev = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL

  if (isDev) {
    petWindow.loadURL('http://localhost:5173/#/pet')
  } else {
    petWindow.loadFile(path.join(app.getAppPath(), 'dist/index.html'), {
      hash: '#/pet'
    })
  }

  petWindow.on('closed', () => {
    petWindow = null
  })
}

app.whenReady().then(() => {
  log('App ready, creating main window')
  createMainWindow()

  setInterval(() => {
    const wins = BrowserWindow.getAllWindows()
    log(`Heartbeat: ${wins.length} windows, main=${!!mainWindow}`)
  }, 5000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  log('window-all-closed event')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  log('before-quit event')
})

app.on('will-quit', () => {
  log('will-quit event')
})

app.on('gpu-process-crashed', () => {
  log('gpu-process-crashed event')
})

app.on('child-process-gone', (_e, details) => {
  log(`child-process-gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`)
})

process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err.stack || err.message}`)
})

process.on('exit', (code) => {
  log(`Process exit: code=${code}`)
})

ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})

ipcMain.handle('window-close', () => {
  mainWindow?.close()
})

ipcMain.handle('create-pet-window', () => {
  if (!petWindow) {
    createPetWindow()
  }
})

ipcMain.handle('close-pet-window', () => {
  petWindow?.close()
})

ipcMain.handle('set-pet-opacity', (_event, opacity: number) => {
  if (petWindow) {
    petWindow.setOpacity(opacity)
  }
})

ipcMain.handle('set-pet-ignore-mouse', (_event, ignore: boolean) => {
  if (petWindow) {
    petWindow.setIgnoreMouseEvents(ignore, { forward: true })
  }
})
