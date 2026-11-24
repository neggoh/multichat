'use strict'

/**
 * Processo principal do MultiChat (Electron).
 *
 * - Sem servidor: as chamadas ao OpenRouter são feitas aqui, no processo main, com a
 *   chave lida do armazenamento criptografado do Windows (safeStorage). A chave nunca
 *   entra no renderer nem em arquivo de texto puro.
 * - A janela usa uma Content-Security-Policy restritiva e não tem integração com Node.
 */

const { app, BrowserWindow, ipcMain, shell, safeStorage, Menu, nativeTheme, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const {
  processFile,
  ACCEPTED_EXTENSIONS,
  MAX_FILES_PER_MESSAGE,
} = require('./files')

const OPENROUTER = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324:free'

const dataDir = () => app.getPath('userData')
const storePath = () => path.join(dataDir(), 'multichat.json')

const activeRequests = new Map()

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(storePath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeStore(next) {
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify(next, null, 2), 'utf8')
}

/* -------------------------------- chave de API ------------------------------- */

function saveApiKey(rawKey) {
  const key = String(rawKey ?? '').trim()
  if (!key) {
    const store = readStore()
    delete store.apiKey
    delete store.apiKeyPlain
    writeStore(store)
    return { ok: true, hasKey: false }
  }
  if (key.length < 20 || key.length > 400) return { ok: false, error: 'A chave parece inválida.' }

  const store = readStore()
  if (safeStorage.isEncryptionAvailable()) {
    store.apiKey = safeStorage.encryptString(key).toString('base64')
    delete store.apiKeyPlain
  } else {
    // Sem DPAPI (raro no Windows) guarda em texto puro, mas avisa a interface.
    store.apiKeyPlain = key
    delete store.apiKey
  }
  writeStore(store)
  return { ok: true, hasKey: true, encrypted: safeStorage.isEncryptionAvailable() }
}

function loadApiKey() {
  const store = readStore()
  try {
    if (store.apiKey && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(store.apiKey, 'base64'))
    }
  } catch (error) {
    console.error('[main] Não foi possível decifrar a chave salva:', error)
  }
  return store.apiKeyPlain ?? ''
}

/* --------------------------------- OpenRouter -------------------------------- */

async function openRouterFetch(pathname, init = {}) {
  const key = loadApiKey()
  if (!key) {
    const error = new Error('Configure sua chave do OpenRouter para começar.')
    error.status = 401
    throw error
  }
  const response = await fetch(`${OPENROUTER}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/neggoh/multichat',
      'X-Title': 'MultiChat Windows',
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      detail = payload?.error?.message ?? ''
    } catch {
      detail = ''
    }
    const error = new Error(friendlyError(response.status, detail))
    error.status = response.status
    throw error
  }
  return response
}

function friendlyError(status, detail) {
  if (status === 401) return 'A chave do OpenRouter é inválida ou expirou.'
  if (status === 402) return 'A conta do OpenRouter está sem créditos para este modelo.'
  if (status === 429) return 'Muitas requisições em pouco tempo. Aguarde alguns segundos.'
  if (status === 404 || status === 400) return `O modelo não aceitou a requisição (${status}). ${detail}`.trim()
  return `O OpenRouter retornou um erro (${status}). ${detail}`.trim()
}

ipcMain.handle('models:list', async () => {
  try {
    // O catálogo do OpenRouter é público: a lista aparece antes de configurar a chave.
    const response = await fetch(`${OPENROUTER}/models`, {
      headers: { Accept: 'application/json', 'HTTP-Referer': 'https://github.com/neggoh/multichat', 'X-Title': 'MultiChat Windows' },
    })
    if (!response.ok) throw new Error(`O OpenRouter respondeu com status ${response.status}.`)
    const payload = await response.json()
    const list = Array.isArray(payload?.data) ? payload.data : []
    const models = list
      .filter((model) => {
        const output = Array.isArray(model?.architecture?.output_modalities) ? model.architecture.output_modalities : []
        if (output.length > 0 && (!output.includes('text') || output.includes('image') || output.includes('audio'))) return false
        const id = String(model?.id ?? '').toLowerCase()
        return !id.includes('lyria') && !id.includes('whisper') && !id.includes('tts')
      })
      .map((model) => {
        const promptPrice = Number(model?.pricing?.prompt ?? '1')
        const completionPrice = Number(model?.pricing?.completion ?? '1')
        const free = promptPrice === 0 && completionPrice === 0
        return {
          id: String(model.id),
          name: String(model.name ?? model.id),
          context: typeof model.context_length === 'number' ? model.context_length : null,
          vision: Array.isArray(model?.architecture?.input_modalities) && model.architecture.input_modalities.includes('image'),
          free,
          promptPrice: free ? 0 : promptPrice,
          completionPrice: free ? 0 : completionPrice,
        }
      })
      .sort((a, b) => (a.free === b.free ? a.name.localeCompare(b.name) : a.free ? -1 : 1))

    if (models.length === 0) throw new Error('O OpenRouter não retornou nenhum modelo de texto.')
    return { ok: true, models, freeCount: models.filter((model) => model.free).length }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

/* ---------------------------------- anexos ---------------------------------- */

async function processPaths(paths) {
  const files = []
  const errors = []
  for (const filePath of paths.slice(0, MAX_FILES_PER_MESSAGE)) {
    try {
      files.push(await processFile(filePath))
    } catch (error) {
      errors.push(error.message)
    }
  }
  if (paths.length > MAX_FILES_PER_MESSAGE) {
    errors.push(`Só é possível anexar ${MAX_FILES_PER_MESSAGE} arquivos por mensagem.`)
  }
  return { ok: true, files, errors }
}

ipcMain.handle('files:pick', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win, {
    title: 'Anexar arquivos',
    buttonLabel: 'Anexar',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Arquivos suportados', extensions: ACCEPTED_EXTENSIONS },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return { ok: true, files: [], errors: [] }
  return processPaths(result.filePaths)
})

ipcMain.handle('files:process', async (_event, paths) => {
  const list = Array.isArray(paths) ? paths.filter((item) => typeof item === 'string' && item.length > 0) : []
  if (list.length === 0) return { ok: false, files: [], errors: ['Nenhum arquivo recebido.'] }
  return processPaths(list)
})


ipcMain.handle('chat:stream', async (event, request) => {
  const { requestId, model, messages } = request ?? {}
  const controller = new AbortController()
  activeRequests.set(requestId, controller)
  let text = ''
  try {
    const response = await openRouterFetch('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: model || DEFAULT_MODEL, stream: true, messages }),
      signal: controller.signal,
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        let parsed = null
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }
        if (parsed?.error) throw new Error(parsed.error.message ?? 'Erro durante a geração.')
        const delta = parsed?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta) {
          text += delta
          if (!event.sender.isDestroyed()) event.sender.send('chat:delta', { requestId, text: delta })
        }
      }
    }
    return { ok: true, text }
  } catch (error) {
    if (error.name === 'AbortError') return { ok: true, text, aborted: true }
    return { ok: false, error: error.message }
  } finally {
    activeRequests.delete(requestId)
  }
})

ipcMain.handle('chat:abort', (_event, requestId) => {
  activeRequests.get(requestId)?.abort()
  return { ok: true }
})

ipcMain.handle('key:status', () => {
  const store = readStore()
  return {
    hasKey: Boolean(store.apiKey || store.apiKeyPlain),
    encrypted: Boolean(store.apiKey) && safeStorage.isEncryptionAvailable(),
    plain: Boolean(store.apiKeyPlain),
  }
})

ipcMain.handle('key:save', (_event, key) => saveApiKey(key))

ipcMain.handle('app:openExternal', (_event, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(url)
})

/* ---------------------------------- janela ---------------------------------- */

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: '#0b0a14',
    title: 'MultiChat',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  win.loadFile(path.join(__dirname, 'index.html'))
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'MultiChat',
        submenu: [
          { role: 'reload', label: 'Recarregar' },
          { role: 'toggleDevTools', label: 'Ferramentas de desenvolvedor' },
          { type: 'separator' },
          { role: 'quit', label: 'Sair' },
        ],
      },
      { role: 'editMenu', label: 'Editar' },
      { role: 'viewMenu', label: 'Ver' },
    ])
  )
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})