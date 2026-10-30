
import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

// Keep AI requests inside Electron's main process.
ipcMain.handle(
  'ghost:ask',
  async (_event, payload: { question: string; code: string; language?: string }) => {
    const question = typeof payload?.question === 'string'
      ? payload.question.trim().slice(0, 4000)
      : ''

    const code = typeof payload?.code === 'string'
      ? payload.code.slice(0, 12000)
      : ''

    const language = typeof payload?.language === 'string'
      ? payload.language.slice(0, 80)
      : 'unknown'

    if (!question) {
      throw new Error('Enter a question for the Ghost first.')
    }

    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5-coder:1.5b',
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              'You are the Ghost inside PHANTOM IDE, a careful coding assistant. ' +
              'Analyze only the supplied code. Never claim you executed code. ' +
              'For bug investigations, return ONLY valid JSON with this shape: ' +
              '{"summary":"brief summary","findings":[{"title":"short bug title",' +
              '"severity":"error|warning|info","line":1,"explanation":"why it matters",' +
              '"fix":"suggested correction"}]}. ' +
              'Use 1-based line numbers from the supplied code. ' +
              'If there are no likely bugs, return {"summary":"No likely bugs found",' +
              '"findings":[]}. Do not wrap JSON in Markdown fences. ' +
              'For other requests, answer in concise plain text.',
          },
          {
            role: 'user',
            content:
              `Programming language: ${language}\n\n` +
              `User question: ${question}\n\n` +
              `Editor code:\n${code || '(No code supplied)'}`,
          },
        ],

        options: {
          num_ctx: 2048,
          temperature: 0.3,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(
        `Ollama returned HTTP ${response.status}. Make sure Ollama is running and the model is installed.`,
      )
    }

    const data = await response.json() as {
      message?: { content?: string }
    }

    const answer = data.message?.content?.trim()

    if (!answer) {
      throw new Error('The local model returned an empty response.')
    }

    return answer
  },
)

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
