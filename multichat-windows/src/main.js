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
const DEFAULT_LOCAL_BASE = 'http://127.0.0.1:8080/v1'

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
    const error = new Error(friendlyError(response.status, detail, response.headers))
    error.status = response.status
    error.detail = detail
    error.remaining = Number(response.headers.get('x-ratelimit-remaining') ?? NaN)
    error.reset = Number(response.headers.get('x-ratelimit-reset') ?? NaN)
    throw error
  }
  return response
}

function resetLabel(reset) {
  const value = Number(reset)
  if (!Number.isFinite(value) || value <= 0) return ''
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function friendlyError(status, detail, headers) {
  if (status === 401) return 'A chave do OpenRouter é inválida ou expirou.'
  if (status === 402) {
    return `Este modelo é pago e a conta do OpenRouter está sem créditos. Escolha um modelo gratuito no seletor. ${detail}`.trim()
  }
  if (status === 429) {
    const when = resetLabel(headers?.get?.('x-ratelimit-reset'))
    if (/free-models-per-day/i.test(detail)) {
      return `Limite diário de modelos gratuitos atingido (50 por dia).${when ? ` Renova em ${when}.` : ''} Adicionar 10 créditos no OpenRouter libera 1000 requisições gratuitas por dia.`
    }
    return `Muitas requisições em pouco tempo.${when ? ` Tente novamente após ${when}.` : ' Aguarde alguns segundos.'}`
  }
  if (status === 404 || status === 400) return `O modelo não aceitou a requisição (${status}). ${detail}`.trim()
  return `O OpenRouter retornou um erro (${status}). ${detail}`.trim()
}

function providerSettings() {
  const store = readStore()
  const provider = store.provider === 'local' ? 'local' : 'openrouter'
  const base = String(store.localBaseUrl ?? DEFAULT_LOCAL_BASE).trim().replace(/\/+$/, '') || DEFAULT_LOCAL_BASE
  return { provider, base, model: String(store.localModel ?? '') }
}

/** Fala com a IA local (llama.cpp, Ollama, LM Studio) ou com o OpenRouter. */
async function providerFetch(pathname, init = {}) {
  const settings = providerSettings()
  if (settings.provider !== 'local') return openRouterFetch(pathname, init)

  let response
  try {
    response = await fetch(`${settings.base}${pathname}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    })
  } catch (error) {
    const failure = new Error(
      `Não foi possível falar com a IA local em ${settings.base}. Confira se o servidor está rodando. (${error.message})`
    )
    failure.status = 0
    throw failure
  }

  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json()
      detail = payload?.error?.message ?? (typeof payload?.error === 'string' ? payload.error : '')
    } catch {
      detail = ''
    }
    const failure = new Error(`A IA local respondeu com erro (${response.status}). ${detail}`.trim())
    failure.status = response.status
    throw failure
  }
  return response
}

async function listLocalModels() {
  const settings = providerSettings()
  try {
    const response = await fetch(`${settings.base}/models`, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`status ${response.status}`)
    const payload = await response.json()
    const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : []
    const models = list
      .map((model) => {
        const id = String(model?.id ?? model?.name ?? model?.model ?? '')
        return {
          id,
          name: String(model?.name ?? id),
          context: null,
          vision: false,
          free: true,
          promptPrice: 0,
          completionPrice: 0,
        }
      })
      .filter((model) => model.id.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
    if (models.length === 0) throw new Error('o servidor não listou nenhum modelo')
    return { ok: true, models, freeCount: models.length, provider: 'local' }
  } catch (error) {
    return {
      ok: false,
      error: `IA local indisponível em ${settings.base}: ${error.message}`,
      provider: 'local',
      models: [],
    }
  }
}

ipcMain.handle('models:list', async (_event, options) => {
  const requested = options?.provider
  const provider = requested === 'local' || requested === 'openrouter' ? requested : providerSettings().provider
  if (provider === 'local') return listLocalModels()

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
    return { ok: true, models, freeCount: models.filter((model) => model.free).length, provider: 'openrouter' }
  } catch (error) {
    return { ok: false, error: error.message, provider: 'openrouter' }
  }
})

ipcMain.handle('settings:get', () => providerSettings())

ipcMain.handle('settings:save', (_event, next) => {
  const store = readStore()
  if (next?.provider === 'local' || next?.provider === 'openrouter') store.provider = next.provider
  if (typeof next?.localBaseUrl === 'string') store.localBaseUrl = next.localBaseUrl.trim()
  if (typeof next?.localModel === 'string') store.localModel = next.localModel
  writeStore(store)
  return { ok: true, ...providerSettings() }
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
    const payload = { model: model || DEFAULT_MODEL, stream: true, messages }
    let response = null
    let attempt = 0
    while (!response) {
      try {
        response = await providerFetch('/chat/completions', {
          method: 'POST',
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } catch (error) {
        // 429 com cota restante é limite por minuto: vale repetir. Cota diária zerada não.
        const retryable = error.status === 429 && error.remaining > 0 && attempt < 2
        if (!retryable) throw error
        attempt += 1
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt))
      }
    }

    const rateLimit = {
      limit: Number(response.headers.get('x-ratelimit-limit') ?? NaN),
      remaining: Number(response.headers.get('x-ratelimit-remaining') ?? NaN),
      reset: Number(response.headers.get('x-ratelimit-reset') ?? NaN),
    }

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
    return { ok: true, text, rateLimit }
  } catch (error) {
    if (error.name === 'AbortError') return { ok: true, text, aborted: true }
    return {
      ok: false,
      error: error.message,
      status: error.status ?? null,
      rateLimit:
        Number.isFinite(error.remaining) || Number.isFinite(error.reset)
          ? { remaining: error.remaining, reset: error.reset }
          : null,
    }
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