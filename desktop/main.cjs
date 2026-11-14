const { app, BrowserWindow, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

let mainWindow = null
let httpServer = null

function resolvePaths() {
  const packaged = app.isPackaged
  const base = packaged ? process.resourcesPath : path.resolve(__dirname, '..')
  return {
    serverFile: packaged
      ? path.join(base, 'server', 'server.cjs')
      : path.join(base, 'web-panel', 'server-dist', 'server.cjs'),
    distDir: packaged ? path.join(base, 'dist') : path.join(base, 'web-panel', 'dist'),
    dataDir: path.join(app.getPath('userData'), 'data'),
  }
}

/**
 * Loads KEY=VALUE pairs from <userData>/.env so API keys and ALLOWED_HOSTS can
 * be configured on an installed copy, where the user has no shell environment.
 * Existing process env wins, so `HOST`, `PORT`, etc. stay under our control.
 */
function loadUserEnv() {
  const envFile = path.join(app.getPath('userData'), '.env')
  let raw
  try {
    raw = fs.readFileSync(envFile, 'utf8')
  } catch {
    return
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function startPanelServer() {
  loadUserEnv()
  const { serverFile, distDir, dataDir } = resolvePaths()
  if (!fs.existsSync(serverFile)) {
    throw new Error(
      `Sunucu derlemesi bulunamadı: ${serverFile}\nÖnce "bun run build:server" çalıştırın.`,
    )
  }
  process.env.DIST_DIR = distDir
  process.env.DATA_DIR = dataDir
  process.env.ENOUGH_NO_AUTOSTART = '1'
  // Loopback only: avoids the Windows Firewall prompt and keeps the local
  // proxy off the LAN.
  process.env.HOST = '127.0.0.1'
  const mod = require(serverFile)
  const start = mod.startServer || (mod.default && mod.default.startServer)
  if (typeof start !== 'function') throw new Error('startServer export bulunamadı.')
  const server = start(0)
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve(server))
    server.once('error', reject)
  })
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#05080f',
    title: 'Enough V2 Panel',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.loadURL(`http://127.0.0.1:${port}/`)
  mainWindow.on('closed', () => { mainWindow = null })
}

function setupAutoUpdater() {
  // Nothing to check against when running from source.
  if (!app.isPackaged) return
  let autoUpdater
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch {
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  autoUpdater.on('error', (err) => {
    console.error('[updater] hata:', err?.message || err)
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] yeni sürüm bulundu:', info?.version)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] güncel sürüm kullanılıyor')
  })

  // Sessiz güncelleme: indirme tamamlanınca kullanıcıya sorulmadan kur ve yeniden başlat.
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] güncelleme indirildi, sessiz kurulum başlıyor:', info?.version)
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(true, true)
      } catch (e) {
        console.error('[updater] sessiz kurulum hatası:', e?.message || e)
      }
    })
  })

  autoUpdater.checkForUpdates().catch((e) => {
    console.error('[updater] kontrol başarısız:', e?.message || e)
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // A second launch just focuses the window that is already open.
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  if (!gotLock) return
  try {
    httpServer = await startPanelServer()
  } catch (e) {
    dialog.showErrorBox('Panel başlatılamadı', String(e?.message || e))
    app.quit()
    return
  }
  const address = httpServer.address()
  const port = typeof address === 'object' && address ? address.port : 8787
  createWindow(port)
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (httpServer) {
    try { httpServer.close() } catch { /* ignore */ }
  }
})