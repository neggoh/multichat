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
const os = require('node:os')
const http = require('node:http')
const { spawn } = require('node:child_process')
const {
  processFile,
  ACCEPTED_EXTENSIONS,
  MAX_FILES_PER_MESSAGE,
} = require('./files')

const OPENROUTER = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324:free'
const DEFAULT_LOCAL_BASE = 'http://127.0.0.1:8080/v1'
const DEFAULT_LOCAL_CONTEXT = 8192

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
  return {
    provider,
    base,
    model: String(store.localModel ?? ''),
    dir: String(store.localDir ?? defaultLocalDir()),
    context: Number(store.localContext ?? DEFAULT_LOCAL_CONTEXT) || DEFAULT_LOCAL_CONTEXT,
    gpuLayers: Number.isFinite(Number(store.localGpuLayers)) ? Number(store.localGpuLayers) : 0,
  }
}

/** Detecta GPU utilizável pelo llama.cpp: NVIDIA (CUDA) ou Vulkan. */
function detectGpu() {
  const { execFileSync } = require('node:child_process')
  try {
    const output = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000,
    })
    const line = output.split(/\r?\n/).find((item) => item.trim().length > 0)
    if (line) {
      const [name, memory] = line.split(',').map((part) => part.trim())
      return { vendor: 'nvidia', name, memory, backend: 'CUDA' }
    }
  } catch {
    // sem NVIDIA
  }
  return { vendor: 'none', name: '', memory: '', backend: 'CPU' }
}

function defaultLocalDir() {
  const candidates = ['D:/chat/local-ai', path.join(os.homedir(), 'MultiChatLocalAI'), path.join(app.getPath('userData'), 'models')]
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch {
      // ignora
    }
  }
  return candidates[1]
}

/** Lista os .gguf da pasta configurada — o servidor só carrega um por vez. */
function scanLocalModels(dir) {
  const folder = dir || defaultLocalDir()
  let entries = []
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gguf'))
    .map((entry) => {
      let size = 0
      try {
        size = fs.statSync(path.join(folder, entry.name)).size
      } catch {
        size = 0
      }
      return { id: entry.name, name: entry.name.replace(/\.gguf$/i, ''), path: path.join(folder, entry.name), size }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function findServerBinary(dir, gpuLayers) {
  const folders = gpuLayers > 0 ? ['llama-cuda', 'llama-vulkan', 'llama'] : ['llama', 'llama-cuda', 'llama-vulkan']
  const candidates = []
  for (const folder of folders) {
    candidates.push(path.join(dir, folder, 'llama-server.exe'))
    candidates.push(path.join(dir, `${folder}-server.exe`))
  }
  candidates.push(path.join(dir, 'llama-server.exe'))
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

const localServer = { proc: null, model: '', port: 0, starting: null }

function stopLocalServer() {
  if (localServer.proc) {
    try {
      localServer.proc.kill()
    } catch {
      // já encerrado
    }
  }
  localServer.proc = null
  localServer.model = ''
  localServer.starting = null
}

/** Mata um llama-server órfão que ficou segurando a porta depois de fechar o app. */
function killPortOwner(port) {
  try {
    const { execFileSync } = require('node:child_process')
    const output = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true })
    const pids = new Set()
    for (const line of output.split(/\r?\n/)) {
      if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue
      const parts = line.trim().split(/\s+/)
      const pid = Number(parts[parts.length - 1])
      if (Number.isFinite(pid) && pid > 0) pids.add(pid)
    }
    for (const pid of pids) {
      let image = ''
      try {
        image = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
      } catch {
        image = ''
      }
      if (!/llama-server/i.test(image)) continue
      execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true })
    }
  } catch {
    // sem permissão ou porta livre
  }
}

/** Confere qual modelo o servidor em execução está servindo. */
async function servedModel(base) {
  try {
    const response = await fetch(`${base}/models`, { signal: AbortSignal.timeout(2000) })
    if (!response.ok) return ''
    const payload = await response.json()
    const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : []
    const first = list[0]
    return String(first?.id ?? first?.model ?? first?.name ?? '')
  } catch {
    return ''
  }
}

async function waitForServer(base, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${base}/models`, { signal: AbortSignal.timeout(1500) })
      if (response.ok) return true
    } catch {
      // ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 700))
  }
  return false
}

/** Rede de segurança: corta o payload para caber no contexto do modelo local. */
function trimForContext(messages, contextTokens) {
  const list = Array.isArray(messages) ? messages : []
  if (list.length === 0) return list
  const budget = Math.max(2000, Math.floor(contextTokens * 3.2) - 4000)
  const size = (message) => (typeof message?.content === 'string' ? message.content.length : 0)
  const system = list[0]?.role === 'system' ? list[0] : null
  const rest = system ? list.slice(1) : list
  let left = budget - (system ? size(system) : 0)
  const kept = []

  for (let index = rest.length - 1; index >= 0; index -= 1) {
    const message = rest[index]
    const length = size(message)
    if (length <= left) {
      kept.unshift(message)
      left -= length
      continue
    }
    if (index === rest.length - 1 && typeof message.content === 'string') {
      const cut = Math.max(500, left - 200)
      kept.unshift({
        ...message,
        content: `${message.content.slice(0, cut)}\n\n[... conteúdo cortado para caber no contexto do modelo ...]`,
      })
    }
    break
  }

  return system ? [system, ...kept] : kept
}

/** Sobe o llama-server para o modelo pedido, se ainda não estiver no ar com ele. */
async function ensureLocalServer(modelId) {
  const settings = providerSettings()
  const wanted = String(modelId ?? settings.model ?? '').trim()
  if (!wanted) return { ok: true }

  if (localServer.proc && localServer.model === wanted && (await waitForServer(settings.base, 2000))) {
    return { ok: true, model: wanted }
  }

  const models = scanLocalModels(settings.dir)
  const target = models.find((model) => model.id === wanted || model.name === wanted)
  if (!target) {
    return { ok: false, error: `O modelo ${wanted} não está em ${settings.dir}.` }
  }

  const binary = findServerBinary(settings.dir, settings.gpuLayers)
  if (!binary) {
    return { ok: false, error: `llama-server.exe não encontrado em ${settings.dir}. Rode scripts/local-ai.ps1 uma vez.` }
  }

  if (localServer.starting) await localServer.starting.catch(() => undefined)
  stopLocalServer()

  const port = Number(new URL(settings.base).port || 8080)

  // Sempre limpa a porta: um servidor órfão de execução anterior serviria outro modelo.
  killPortOwner(port)
  await new Promise((resolve) => setTimeout(resolve, 1500))

  const proc = spawn(
    binary,
    [
      '-m', target.path,
      '--host', '127.0.0.1',
      '--port', String(port),
      '-c', String(settings.context),
      '-t', String(Math.max(4, os.cpus().length)),
      '-ngl', String(settings.gpuLayers),
      '--no-warmup',
    ],
    { cwd: settings.dir, stdio: 'ignore', windowsHide: true }
  )
  localServer.proc = proc
  localServer.model = target.id
  localServer.port = port

  localServer.starting = waitForServer(settings.base, 180000)
  const ready = await localServer.starting
  localServer.starting = null
  if (!ready) {
    stopLocalServer()
    return { ok: false, error: `O modelo ${target.name} não terminou de carregar.` }
  }

  const served = await servedModel(settings.base)
  if (served && !served.toLowerCase().includes(target.id.toLowerCase())) {
    stopLocalServer()
    return { ok: false, error: `A porta ${port} está ocupada por outro modelo (${served}). Feche o outro servidor e tente de novo.` }
  }
  return { ok: true, model: target.id }
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
  const scanned = scanLocalModels(settings.dir)
  const models = scanned.map((model) => ({
    id: model.id,
    name: model.name,
    context: settings.context,
    vision: false,
    free: true,
    promptPrice: 0,
    completionPrice: 0,
    size: model.size,
  }))

  if (models.length === 0) {
    return {
      ok: false,
      provider: 'local',
      models: [],
      error: `Nenhum .gguf em ${settings.dir}. Rode scripts/local-ai.ps1 ou aponte a pasta dos modelos.`,
    }
  }

  const running = localServer.proc && (await waitForServer(settings.base, 1500)) ? localServer.model : null
  return { ok: true, models, freeCount: models.length, provider: 'local', running, dir: settings.dir }
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
  if (typeof next?.localDir === 'string') store.localDir = next.localDir.trim()
  if (Number.isFinite(Number(next?.localContext)) && Number(next.localContext) > 0) store.localContext = Number(next.localContext)
  if (Number.isFinite(Number(next?.localGpuLayers)) && Number(next.localGpuLayers) >= 0) store.localGpuLayers = Number(next.localGpuLayers)
  writeStore(store)
  return { ok: true, ...providerSettings() }
})

ipcMain.handle('local:start', async (_event, model) => {
  const result = await ensureLocalServer(model)
  return { ...result, ...providerSettings() }
})

ipcMain.handle('local:stop', () => {
  stopLocalServer()
  return { ok: true }
})

ipcMain.handle('local:gpu', () => detectGpu())

ipcMain.handle('project:export', async (event, payload) => {
  const files = Array.isArray(payload?.files) ? payload.files : []
  if (files.length === 0) return { ok: false, error: 'Nenhum arquivo para exportar.' }

  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showSaveDialog(win, {
    title: 'Salvar projeto',
    defaultPath: `${String(payload?.name ?? 'projeto').replace(/[^\w.-]+/g, '-')}.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  })
  if (result.canceled || !result.filePath) return { ok: true, canceled: true }

  try {
    const JSZip = require('jszip')
    const zip = new JSZip()
    for (const file of files) {
      const name = String(file?.name ?? '').replace(/^[/\\]+/, '').replace(/\.\./g, '')
      if (!name) continue
      zip.file(name, String(file?.content ?? ''))
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    await fs.promises.writeFile(result.filePath, buffer)
    return { ok: true, path: result.filePath, count: files.length }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('app:openPath', async (_event, target) => {
  const value = String(target ?? '')
  if (!value) return { ok: false }
  try {
    const error = await shell.openPath(value)
    return error ? { ok: false, error } : { ok: true }
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

/* ------------------------------ prévia do projeto --------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
}

const previewState = { server: null, port: 0, root: '' }

/** Pasta da prévia: usa o disco dos modelos (com espaço) e cai para o temp. */
function previewRoot() {
  const candidates = [
    path.join(path.dirname(defaultLocalDir()), '.preview'),
    path.join(os.tmpdir(), 'multichat-preview'),
  ]
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true })
      return candidate
    } catch {
      // tenta o próximo
    }
  }
  return path.join(os.tmpdir(), 'multichat-preview')
}

/** Caminho relativo seguro: sem `..`, sem absoluto, sem unidade de disco. */
function safeRelative(name) {
  const cleaned = String(name ?? '')
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:/, '')
    .replace(/^\/+/, '')
  if (!cleaned || cleaned.split('/').includes('..')) return null
  return cleaned
}

function startPreviewServer() {
  if (previewState.server) return Promise.resolve(previewState.port)
  const root = previewRoot()
  previewState.root = root

  const server = http.createServer((request, response) => {
    let pathname = '/'
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
    } catch {
      pathname = '/'
    }
    let relative = pathname.replace(/^\/+/, '')
    if (!relative || relative.endsWith('/')) relative += 'index.html'
    const target = path.join(root, relative)
    if (!target.startsWith(root)) {
      response.writeHead(403).end('fora da raiz')
      return
    }
    fs.readFile(target, (error, data) => {
      if (error) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('não encontrado')
        return
      }
      const type = MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream'
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(data)
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      previewState.server = server
      previewState.port = server.address().port
      resolve(previewState.port)
    })
  })
}

ipcMain.handle('preview:serve', async (event, payload) => {
  try {
    const files = Array.isArray(payload?.files) ? payload.files : []
    if (files.length === 0) return { ok: false, error: 'nenhum arquivo para visualizar' }

    const root = previewRoot()
    previewState.root = root
    fs.rmSync(root, { recursive: true, force: true })
    fs.mkdirSync(root, { recursive: true })

    let written = 0
    for (const file of files) {
      const relative = safeRelative(file?.name)
      if (!relative) continue
      const target = path.join(root, relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, String(file?.content ?? ''), 'utf8')
      written += 1
    }
    if (written === 0) return { ok: false, error: 'nenhum arquivo válido' }

    const port = await startPreviewServer()
    return { ok: true, url: `http://127.0.0.1:${port}/`, count: written, root }
  } catch (error) {
    return { ok: false, error: error.message }
  }
})

ipcMain.handle('preview:open', async () => {
  if (!previewState.server) return { ok: false, error: 'prévia não iniciada' }
  await shell.openExternal(`http://127.0.0.1:${previewState.port}/`)
  return { ok: true }
})

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
    if (providerSettings().provider === 'local') {
      const started = await ensureLocalServer(model)
      if (!started.ok) {
        const failure = new Error(started.error)
        failure.status = 0
        throw failure
      }
    }
    const settings = providerSettings()
    const safeMessages = settings.provider === 'local' ? trimForContext(messages, settings.context) : messages
    const payload = { model: model || DEFAULT_MODEL, stream: true, messages: safeMessages }
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

app.on('will-quit', () => {
  stopLocalServer()
})

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