"use strict";
const electron = require("electron");
const path = require("path");
let mainWindow = null;
let petWindow = null;
function createMainWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: "hiddenInset",
    show: true
  });
  const isDev = process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(electron.app.getAppPath(), "dist/index.html"));
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12" || input.control && input.shift && input.key.toLowerCase() === "i" || input.control && input.shift && input.key.toLowerCase() === "j" || input.control && input.key.toLowerCase() === "u") {
        event.preventDefault();
      }
    });
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function createPetWindow() {
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  petWindow = new electron.BrowserWindow({
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
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const isDev = process.env.NODE_ENV === "development" || process.env.VITE_DEV_SERVER_URL;
  if (isDev) {
    petWindow.loadURL("http://localhost:5173/#/pet");
  } else {
    petWindow.loadFile(path.join(electron.app.getAppPath(), "dist/index.html"), {
      hash: "#/pet"
    });
  }
  petWindow.on("closed", () => {
    petWindow = null;
  });
}
electron.app.whenReady().then(() => {
  createMainWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.ipcMain.handle("window-minimize", () => {
  mainWindow == null ? void 0 : mainWindow.minimize();
});
electron.ipcMain.handle("window-maximize", () => {
  if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow == null ? void 0 : mainWindow.maximize();
  }
});
electron.ipcMain.handle("window-close", () => {
  mainWindow == null ? void 0 : mainWindow.close();
});
electron.ipcMain.handle("create-pet-window", () => {
  if (!petWindow) {
    createPetWindow();
  }
});
electron.ipcMain.handle("close-pet-window", () => {
  petWindow == null ? void 0 : petWindow.close();
});
electron.ipcMain.handle("set-pet-opacity", (_event, opacity) => {
  if (petWindow) {
    petWindow.setOpacity(opacity);
  }
});
electron.ipcMain.handle("set-pet-ignore-mouse", (_event, ignore) => {
  if (petWindow) {
    petWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});
//# sourceMappingURL=main.js.map
