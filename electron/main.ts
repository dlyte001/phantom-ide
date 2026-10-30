
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
const OLLAMA_URL = 'http://127.0.0.1:11434'
const MODEL_NAME = 'qwen2.5-coder:1.5b'

ipcMain.handle('ghost:health', async () => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)

  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal,
    })

    if (!response.ok) return { status: 'offline' as const }

    const data = await response.json() as {
      models?: Array<{ name?: unknown; model?: unknown }>
    }
    const modelAvailable = Array.isArray(data.models) && data.models.some((model) =>
      [model.name, model.model].some((name) =>
        typeof name === 'string' &&
        (name === MODEL_NAME || name.startsWith(`${MODEL_NAME}:`)),
      ),
    )

    return { status: modelAvailable ? 'connected' as const : 'model-not-found' as const }
  } catch {
    return { status: 'offline' as const }
  } finally {
    clearTimeout(timeout)
  }
})

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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000)
    let response: Response
    try {
      response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_NAME,
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
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('The local model request timed out. Try again or check Ollama.')
      }
      throw new Error('Ollama is unreachable at 127.0.0.1:11434. Check that it is running.')
    } finally {
      clearTimeout(timeout)
    }

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
