'use strict'

/* MultiChat — renderer. Sem Node: tudo passa pela ponte window.multichat (preload). */

const api = window.multichat
const STORE_KEY = 'multichat:state'
const FALLBACK_MODELS = [
  { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 0324', context: 163840, vision: false, free: true },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct', context: 131072, vision: false, free: true },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (exp)', context: 1048576, vision: true, free: true },
  { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B A22B', context: 131072, vision: false, free: true },
]
const SYSTEM_PROMPT = [
  'Você é um assistente técnico prestativo e direto. Responda sempre em português do Brasil.',
  'Use Markdown quando ajudar (negrito, listas, tabelas) e sempre que mostrar código use blocos com a linguagem.',
  'Seja preciso e evite enrolação.',
].join('\n')

const $ = (id) => document.getElementById(id)
const els = {
  provider: $('provider'),
  model: $('model'),
  modelInfo: $('model-info'),
  quota: $('quota'),
  freeOnly: $('free-only'),
  keyChip: $('key-chip'),
  keyBtn: $('key-btn'),
  newBtn: $('new-btn'),
  clearBtn: $('clear-btn'),
  conversations: $('conversations'),
  asideHint: $('aside-hint'),
  messages: $('messages'),
  input: $('input'),
  send: $('send-btn'),
  stop: $('stop-btn'),
  status: $('status'),
  attach: $('attach-btn'),
  attachments: $('attachments'),
  dialog: $('key-dialog'),
  keyInput: $('key-input'),
  keySave: $('key-save'),
  keyError: $('key-error'),
  keysLink: $('keys-link'),
  localUrl: $('local-url'),
  localStatus: $('local-status'),
  localTest: $('local-test'),
  localGpu: $('local-gpu'),
  gpuInfo: $('gpu-info'),
  preview: $('preview'),
  previewBtn: $('preview-btn'),
  previewClose: $('preview-close'),
  previewTabs: $('preview-tabs'),
  previewFrame: $('preview-frame'),
  previewCode: $('preview-code'),
  previewEmpty: $('preview-empty'),
  previewCount: $('preview-count'),
  previewRefresh: $('preview-refresh'),
  previewZip: $('preview-zip'),
  toolsBtn: $('tools-btn'),
  toolsDialog: $('tools-dialog'),
  toolsList: $('tools-list'),
  toolsModels: $('tools-models'),
  toolsScripts: $('tools-scripts'),
}

const state = {
  models: FALLBACK_MODELS,
  selectedModel: FALLBACK_MODELS[0].id,
  conversations: [],
  currentId: null,
  streaming: false,
  requestId: 0,
  hasKey: false,
  freeOnly: true,
  provider: 'openrouter',
  localBaseUrl: 'http://127.0.0.1:8080/v1',
  attachments: [],
  attaching: false,
  previewTab: 'preview',
  projectFiles: [],
}

/* ------------------------------- persistência ------------------------------- */

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')
    state.conversations = Array.isArray(raw.conversations) ? raw.conversations : []
    state.selectedModel = typeof raw.selectedModel === 'string' ? raw.selectedModel : state.selectedModel
    state.currentId = typeof raw.currentId === 'string' ? raw.currentId : null
    state.freeOnly = typeof raw.freeOnly === 'boolean' ? raw.freeOnly : true
  } catch (error) {
    console.error('[renderer] Estado corrompido, começando do zero:', error)
  }
}

/** O data URL da imagem só existe em memória: no disco ele estouraria o localStorage. */
function stripAttachment(attachment) {
  const { imageDataUrl, ...rest } = attachment ?? {}
  return rest
}

function saveState() {
  try {
    const conversations = state.conversations.map((conversation) => ({
      ...conversation,
      messages: (conversation.messages ?? []).map((message) => ({
        ...message,
        attachments: (message.attachments ?? []).map(stripAttachment),
      })),
    }))
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        conversations,
        selectedModel: state.selectedModel,
        currentId: state.currentId,
        freeOnly: state.freeOnly,
      })
    )
  } catch (error) {
    console.error('[renderer] Não foi possível salvar o histórico:', error)
  }
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const current = () => state.conversations.find((c) => c.id === state.currentId) ?? null

/* --------------------------------- markdown -------------------------------- */

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
}

function inline(text) {
  let out = escapeHtml(text)
  out = out.replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  return out
}

/** Markdown mínimo e seguro: títulos, listas, negrito e inline code.
 *  Blocos de código não aparecem no chat: viram uma nota que abre a prévia. */
function renderMarkdown(source) {
  const parts = String(source ?? '').split(/```/)
  let html = ''
  parts.forEach((chunk, index) => {
    if (index % 2 === 1) {
      const newline = chunk.indexOf('\n')
      const rawLang = (newline >= 0 ? chunk.slice(0, newline) : '').trim().toLowerCase().split(':')[0]
      const body = newline >= 0 ? chunk.slice(newline + 1) : chunk
      const lang = CODE_LANGS[rawLang] ?? (rawLang || 'txt')
      const name = guessFileName(lang, body)
      const lines = body.trim() ? body.replace(/\n$/, '').split('\n').length : 0
      html += `<div class="code-note"><span class="code-note-icon">▤</span><span class="code-note-text"><strong>${escapeHtml(name)}</strong> · ${lines} linha${lines === 1 ? '' : 's'}</span><button class="open-preview" type="button" data-file="${escapeHtml(name)}">Ver na prévia</button></div>`
      return
    }
    for (const line of chunk.split('\n')) {
      const heading = /^(#{1,4})\s+(.*)$/.exec(line)
      if (heading) {
        html += `<div style="font-weight:650;font-size:${20 - heading[1].length * 2}px;margin:10px 0 6px">${inline(heading[2])}</div>`
      } else if (/^\s*[-*]\s+/.test(line)) {
        html += `<div style="padding-left:14px">• ${inline(line.replace(/^\s*[-*]\s+/, ''))}</div>`
      } else if (/^\s*\d+[.)]\s+/.test(line)) {
        const marker = /^\s*(\d+)[.)]\s+/.exec(line)
        html += `<div style="padding-left:14px">${marker[1]}. ${inline(line.replace(/^\s*\d+[.)]\s+/, ''))}</div>`
      } else {
        html += `${inline(line)}\n`
      }
    }
  })
  return html
}

/* --------------------------------- interface -------------------------------- */

const KIND_LABELS = {
  zip: 'ZIP', apk: 'APK', pdf: 'PDF', image: 'Imagem', code: 'Código',
  json: 'JSON', xml: 'XML', csv: 'CSV', text: 'Texto', other: 'Arquivo',
}

function formatBytes(bytes) {
  const value = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function priceLabel(model) {
  if (!model || model.free) return ''
  const perMillion = (value) => `$${(Number(value ?? 0) * 1_000_000).toFixed(2)}`
  return ` · ${perMillion(model.promptPrice)}/M tokens de entrada`
}

function modelLabel(model) {
  if (!model) return ''
  const ctx = model.context ? ` · ${model.context >= 1000000 ? Math.round(model.context / 100000) / 10 + 'M' : Math.round(model.context / 1000) + 'k'} tokens` : ''
  return `${model.name}${model.free ? ' · grátis' : priceLabel(model)}${model.vision ? ' · visão' : ''}${ctx}`
}

function visibleModels() {
  return state.freeOnly ? state.models.filter((model) => model.free) : state.models
}

function renderModels() {
  const local = state.provider === 'local'
  const freeToggle = els.freeOnly.closest('.toggle')
  if (freeToggle) freeToggle.hidden = local
  const list = local ? state.models : visibleModels()
  els.model.innerHTML = list
    .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.free && !local ? m.name : local ? m.name : `${m.name} — pago`)}</option>`)
    .join('')
  if (!list.some((m) => m.id === state.selectedModel)) state.selectedModel = list[0]?.id ?? state.models[0]?.id ?? ''
  els.model.value = state.selectedModel
  els.modelInfo.textContent = local ? 'local · sem limite' : modelLabel(state.models.find((m) => m.id === state.selectedModel))
  els.freeOnly.checked = state.freeOnly
  if (local) els.quota.hidden = true
}

function renderQuota(rateLimit) {
  const remaining = Number(rateLimit?.remaining)
  const limit = Number(rateLimit?.limit)
  if (!Number.isFinite(remaining)) {
    els.quota.hidden = true
    return
  }
  const total = Number.isFinite(limit) && limit > 0 ? limit : 50
  els.quota.hidden = false
  els.quota.textContent = `grátis hoje: ${remaining}/${total}`
  els.quota.className = `chip ${remaining > 0 ? 'ok' : 'warn'}`
  els.quota.title =
    remaining > 0
      ? 'Requisições gratuitas restantes hoje no OpenRouter'
      : 'Cota diária de modelos gratuitos esgotada; renova à meia-noite UTC'
}

function attachmentChip(attachment, onRemove) {
  const chip = document.createElement('span')
  chip.className = 'attach-chip'
  chip.title = attachment.summary ?? ''
  const kind = document.createElement('span')
  kind.className = 'kind'
  kind.textContent = KIND_LABELS[attachment.kind] ?? 'Arquivo'
  const name = document.createElement('span')
  name.className = 'name'
  name.textContent = attachment.name
  const size = document.createElement('span')
  size.className = 'size'
  size.textContent = formatBytes(attachment.size)
  chip.append(kind, name, size)
  if (onRemove) {
    const remove = document.createElement('button')
    remove.className = 'remove'
    remove.type = 'button'
    remove.textContent = '✕'
    remove.title = 'Remover anexo'
    remove.addEventListener('click', onRemove)
    chip.append(remove)
  }
  return chip
}

function renderAttachments() {
  els.attachments.hidden = state.attachments.length === 0
  els.attachments.innerHTML = ''
  state.attachments.forEach((attachment, index) => {
    els.attachments.append(
      attachmentChip(attachment, () => {
        state.attachments.splice(index, 1)
        renderAttachments()
      })
    )
  })
}

function renderConversations() {
  els.conversations.innerHTML = ''
  for (const conversation of state.conversations) {
    const li = document.createElement('li')
    li.className = conversation.id === state.currentId ? 'active' : ''
    const title = document.createElement('span')
    title.className = 'title'
    title.textContent = conversation.title
    const del = document.createElement('button')
    del.className = 'del'
    del.textContent = '✕'
    del.title = 'Apagar conversa'
    del.addEventListener('click', (event) => {
      event.stopPropagation()
      deleteConversation(conversation.id)
    })
    li.append(title, del)
    li.addEventListener('click', () => openConversation(conversation.id))
    els.conversations.append(li)
  }
  els.asideHint.hidden = state.conversations.length > 0
}

function renderMessages() {
  const conversation = current()
  els.messages.innerHTML = ''
  if (!conversation || conversation.messages.length === 0) {
    const hero = document.createElement('div')
    hero.className = 'hero'
    hero.innerHTML = `
      <h1>Vários modelos de IA em uma só conversa</h1>
      <p>Troque de modelo no meio da conversa sem perder o contexto. Tudo fica salvo neste computador.</p>
      <div class="suggestions">
        <button type="button" data-prompt="Explique a diferença entre let, const e var em JavaScript, com exemplos.">Explique a diferença entre let, const e var</button>
        <button type="button" data-prompt="Escreva uma função em TypeScript que valide um CPF e explique o algoritmo.">Validar CPF em TypeScript</button>
        <button type="button" data-prompt="Revise este texto e sugira uma versão mais clara: ">Revisar um texto meu</button>
      </div>`
    hero.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        els.input.value = button.dataset.prompt
        els.input.focus()
        autoGrow()
      })
    })
    els.messages.append(hero)
    return
  }

  for (const message of conversation.messages) {
    const row = document.createElement('div')
    row.className = `msg ${message.role === 'user' ? 'user' : 'assistant'}`
    const avatar = document.createElement('div')
    avatar.className = 'avatar'
    avatar.textContent = message.role === 'user' ? 'EU' : 'IA'
    const body = document.createElement('div')
    body.className = 'body'
    const meta = document.createElement('div')
    meta.className = 'meta'
    const modelName = state.models.find((m) => m.id === message.model)?.name ?? (message.model ?? '')
    meta.textContent = message.role === 'user' ? 'Você' : modelName || 'Assistente'
    const content = document.createElement('div')
    content.className = 'content'
    if (message.role === 'user') content.textContent = message.content
    else content.innerHTML = renderMarkdown(message.content)
    body.append(meta, content)
    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      const strip = document.createElement('div')
      strip.className = 'attachments'
      for (const attachment of message.attachments) strip.append(attachmentChip(attachment))
      body.append(strip)
    }
    row.append(avatar, body)
    els.messages.append(row)
  }
  scrollToBottom()
}

function scrollToBottom() {
  els.messages.scrollTop = els.messages.scrollHeight
}

function setStatus(text) {
  els.status.textContent = text
}

function refreshKeyChip() {
  els.keyChip.textContent = state.hasKey ? 'chave salva' : 'chave não configurada'
  els.keyChip.className = `chip ${state.hasKey ? 'ok' : 'warn'}`
}

/* ----------------------------------- ações ---------------------------------- */

function newConversation() {
  const conversation = { id: uid(), title: 'Nova conversa', model: state.selectedModel, messages: [], updatedAt: Date.now() }
  state.conversations.unshift(conversation)
  state.currentId = conversation.id
  saveState()
  renderConversations()
  renderMessages()
  els.input.focus()
}

function openConversation(id) {
  state.currentId = id
  const conversation = current()
  if (conversation?.model) {
    state.selectedModel = conversation.model
    renderModels()
  }
  saveState()
  renderConversations()
  renderMessages()
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter((c) => c.id !== id)
  if (state.currentId === id) state.currentId = state.conversations[0]?.id ?? null
  saveState()
  renderConversations()
  renderMessages()
}

function ensureConversation() {
  let conversation = current()
  if (!conversation) {
    conversation = { id: uid(), title: 'Nova conversa', model: state.selectedModel, messages: [], updatedAt: Date.now() }
    state.conversations.unshift(conversation)
    state.currentId = conversation.id
  }
  return conversation
}

function treeToText(nodes, depth = 0) {
  const list = Array.isArray(nodes) ? nodes : []
  let output = ''
  for (const node of list) {
    if (!node?.name) continue
    output += `${'  '.repeat(depth)}${node.name}${node.type === 'dir' ? '/' : ''}\n`
    if (node.children && node.children.length > 0) output += treeToText(node.children, depth + 1)
  }
  return output
}

function attachmentBlock(attachment) {
  const attributes = [
    `nome="${String(attachment.name ?? 'arquivo').replace(/"/g, '&quot;')}"`,
    `tipo="${attachment.kind ?? 'other'}"`,
    `tamanho="${Math.max(0, Math.round(Number(attachment.size ?? 0)))}"`,
  ]
  if (typeof attachment.fileCount === 'number') attributes.push(`arquivos="${attachment.fileCount}"`)
  if (attachment.technology) attributes.push(`tech="${String(attachment.technology).replace(/"/g, '&quot;')}"`)

  const parts = [`<anexo ${attributes.join(' ')}>`, `RESUMO: ${String(attachment.summary ?? '').replace(/\s+/g, ' ').trim()}`]
  if (Array.isArray(attachment.tree) && attachment.tree.length > 0) {
    parts.push('ESTRUTURA DE PASTAS:')
    parts.push(treeToText(attachment.tree).trimEnd())
  }
  const context = String(attachment.context ?? '').trim()
  if (context) {
    parts.push('CONTEUDO DOS ARQUIVOS:')
    parts.push(context)
  }
  parts.push('</anexo>')
  return parts.join('\n')
}

/** Imagens só vão como conteúdo multimodal na última mensagem do usuário. */
function messageContent(message, includeImages) {
  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  const blocks = attachments.filter((attachment) => attachment.kind !== 'image').map(attachmentBlock)
  const text = [message.content, ...blocks].filter((part) => part && part.trim().length > 0).join('\n\n')
  const images = includeImages ? attachments.filter((attachment) => attachment.imageDataUrl) : []
  if (images.length === 0) return text
  return [
    { type: 'text', text: text || 'Analise a imagem anexada.' },
    ...images.map((image) => ({ type: 'image_url', image_url: { url: image.imageDataUrl } })),
  ]
}

function messageChars(message) {
  const content = message?.content
  if (typeof content === 'string') return content.length
  if (Array.isArray(content)) {
    return content.reduce((total, part) => total + (typeof part?.text === 'string' ? part.text.length : 0), 0)
  }
  return 0
}

/** Corta o histórico e os anexos para caber no contexto do modelo. */
function trimMessages(messages, budgetChars) {
  if (messages.length <= 1) return messages
  const system = messages[0]
  const rest = messages.slice(1)
  let budget = Math.max(2000, budgetChars - system.content.length)
  const kept = []

  for (let index = rest.length - 1; index >= 0; index -= 1) {
    const message = rest[index]
    const size = messageChars(message)
    const isLast = index === rest.length - 1

    if (size <= budget) {
      kept.unshift(message)
      budget -= size
      continue
    }

    if (isLast && typeof message.content === 'string') {
      const cut = Math.max(500, budget - 200)
      kept.unshift({
        ...message,
        content: `${message.content.slice(0, cut)}\n\n[... conteúdo cortado para caber no contexto do modelo ...]`,
      })
      budget = 0
    }
    break
  }

  return [system, ...kept]
}

function buildRequestMessages(conversation) {
  const history = conversation.messages
    .filter((message) => message.content.trim().length > 0 || (message.attachments ?? []).length > 0)
    .slice(-30)
  const lastUserIndex = history.map((message) => message.role).lastIndexOf('user')
  const mapped = history.map((message, index) => ({
    role: message.role,
    content: messageContent(message, index === lastUserIndex),
  }))
  const model = state.models.find((item) => item.id === state.selectedModel)
  const contextTokens = state.provider === 'local' ? model?.context ?? 8192 : model?.context ?? 32000
  const budgetChars = Math.max(4000, Math.floor(contextTokens * 3.2) - 4000)
  return trimMessages([{ role: 'system', content: SYSTEM_PROMPT }, ...mapped], budgetChars)
}

async function send() {
  const text = els.input.value.trim()
  const attachments = state.attachments.slice()
  if ((!text && attachments.length === 0) || state.streaming) return
  if (state.provider !== 'local' && !state.hasKey) {
    openKeyDialog()
    return
  }

  const model = state.models.find((item) => item.id === state.selectedModel)
  if (state.provider !== 'local' && attachments.some((attachment) => attachment.kind === 'image') && !model?.vision) {
    setStatus('o modelo atual não aceita imagem — escolha um modelo com visão')
    return
  }

  const conversation = ensureConversation()
  conversation.model = state.selectedModel
  if (conversation.title === 'Nova conversa') {
    const title = text || attachments.map((attachment) => attachment.name).join(', ')
    conversation.title = title.slice(0, 60) + (title.length > 60 ? '...' : '')
  }
  conversation.messages.push({ role: 'user', content: text, attachments })
  conversation.updatedAt = Date.now()
  els.input.value = ''
  state.attachments = []
  renderAttachments()
  autoGrow()
  saveState()
  renderConversations()
  renderMessages()

  const assistant = { role: 'assistant', content: '', model: state.selectedModel }
  conversation.messages.push(assistant)
  renderMessages()

  const requestId = ++state.requestId
  state.streaming = true
  els.send.disabled = true
  els.stop.hidden = false
  setStatus('pensando…')

  const node = els.messages.lastElementChild?.querySelector('.content')
  if (node) node.classList.add('cursor')

  const result = await api.chat({ requestId, model: state.selectedModel, messages: buildRequestMessages(conversation) })

  state.streaming = false
  els.send.disabled = false
  els.stop.hidden = true
  els.stop.disabled = false
  setStatus('')

  if (!result.ok) {
    assistant.content = assistant.content || `⚠️ ${result.error}`
    setStatus(result.error)
  } else if (result.aborted && !assistant.content) {
    assistant.content = '*Geração interrompida.*'
  }
  if (result.rateLimit) renderQuota(result.rateLimit)
  conversation.updatedAt = Date.now()
  saveState()
  renderMessages()
  els.input.focus()
}

function stop() {
  if (!state.streaming) return
  els.stop.disabled = true
  setStatus('interrompendo...')
  api.abort(state.requestId)
}

/* ------------------------------ chave do OpenRouter ------------------------------ */

function openKeyDialog() {
  els.keyError.hidden = true
  els.keyInput.value = ''
  els.dialog.showModal()
  els.keyInput.focus()
}

async function saveKey() {
  const value = els.keyInput.value.trim()
  if (!value) {
    els.keyError.textContent = 'Cole a chave do OpenRouter.'
    els.keyError.hidden = false
    return
  }
  const result = await api.saveKey(value)
  if (!result.ok) {
    els.keyError.textContent = result.error ?? 'Não foi possível salvar.'
    els.keyError.hidden = false
    return
  }
  state.hasKey = result.hasKey
  refreshKeyChip()
  els.dialog.close()
  setStatus(result.encrypted === false ? 'chave salva sem criptografia (DPAPI indisponível)' : 'chave salva')
  await loadModels()
}

/* ----------------------------------- boot ----------------------------------- */

function autoGrow() {
  els.input.style.height = 'auto'
  els.input.style.height = `${Math.min(els.input.scrollHeight, 200)}px`
}

const MAX_ATTACHMENTS = 6

function applyProcessed(result) {
  const files = Array.isArray(result?.files) ? result.files : []
  const room = Math.max(0, MAX_ATTACHMENTS - state.attachments.length)
  state.attachments.push(...files.slice(0, room))
  if (files.length > room) setStatus(`limite de ${MAX_ATTACHMENTS} anexos por mensagem`)
  else if (result?.errors?.length) setStatus(result.errors[0])
  else if (state.attachments.length > 0) setStatus(`${state.attachments.length} anexo(s) pronto(s)`)
  renderAttachments()
}

async function attachFromDialog() {
  if (state.attaching) return
  state.attaching = true
  els.attach.disabled = true
  try {
    const result = await api.pickFiles()
    if (result?.ok === false) setStatus(result.error ?? 'não foi possível abrir o seletor')
    else applyProcessed(result)
  } catch (error) {
    setStatus(error?.message ?? 'não foi possível abrir o seletor')
  } finally {
    state.attaching = false
    els.attach.disabled = false
  }
}

async function loadModels(provider) {
  const target = provider ?? state.provider
  setStatus(target === 'local' ? 'procurando a IA local...' : 'carregando modelos...')
  const result = await api.models({ provider: target })
  if (result.ok && result.models.length > 0) {
    state.models = result.models
    state.provider = target
    els.provider.value = target
    renderModels()
    setStatus(
      target === 'local'
        ? `IA local · ${result.models.length} modelo(s) · sem limite`
        : `${result.models.length} modelos · ${result.freeCount ?? 0} gratuitos`
    )
  } else {
    if (target === 'local') {
      state.models = []
      state.provider = 'local'
      els.provider.value = 'local'
      renderModels()
      setStatus(result.error ?? 'IA local indisponível')
    } else {
      state.models = FALLBACK_MODELS
      state.provider = 'openrouter'
      els.provider.value = 'openrouter'
      renderModels()
      setStatus(result.error ?? 'usando lista local de modelos')
    }
  }
  renderMessages()
}

function bind() {
  els.send.addEventListener('click', send)
  els.stop.addEventListener('click', stop)
  els.newBtn.addEventListener('click', newConversation)
  els.keyBtn.addEventListener('click', openKeyDialog)
  els.attach.addEventListener('click', attachFromDialog)
  els.freeOnly.addEventListener('change', () => {
    state.freeOnly = els.freeOnly.checked
    renderModels()
    saveState()
  })
  els.clearBtn.addEventListener('click', () => {
    if (!state.conversations.length) return
    if (!confirm('Apagar todas as conversas deste computador?')) return
    state.conversations = []
    state.currentId = null
    saveState()
    renderConversations()
    renderMessages()
  })
  els.model.addEventListener('change', async () => {
    state.selectedModel = els.model.value
    els.modelInfo.textContent =
      state.provider === 'local' ? 'local · sem limite' : modelLabel(state.models.find((m) => m.id === state.selectedModel))
    const conversation = current()
    if (conversation) conversation.model = state.selectedModel
    saveState()
    if (state.provider === 'local') {
      await api.saveSettings({ localModel: state.selectedModel })
      setStatus(`carregando ${state.selectedModel}...`)
      const started = await api.startLocal(state.selectedModel)
      setStatus(started.ok ? `IA local · ${state.selectedModel}` : started.error ?? 'não foi possível carregar')
    }
  })
  els.provider.addEventListener('change', async () => {
    const next = els.provider.value === 'local' ? 'local' : 'openrouter'
    await api.saveSettings({ provider: next })
    await loadModels(next)
  })
  els.localTest.addEventListener('click', async () => {
    const url = els.localUrl.value.trim() || 'http://127.0.0.1:8080/v1'
    els.localStatus.className = 'local-status'
    els.localStatus.textContent = 'testando...'
    await api.saveSettings({
      provider: 'local',
      localBaseUrl: url,
      localGpuLayers: els.localGpu.checked ? 99 : 0,
    })
    const result = await api.models({ provider: 'local' })
    if (result.ok && result.models.length > 0) {
      els.localStatus.className = 'local-status ok'
      els.localStatus.textContent = `conectado · ${result.models.length} modelo(s)`
      state.localBaseUrl = url
      await loadModels('local')
      els.dialog.close()
    } else {
      els.localStatus.className = 'local-status err'
      els.localStatus.textContent = result.error ?? 'não foi possível conectar'
    }
  })
  els.localGpu.addEventListener('change', async () => {
    await api.saveSettings({ localGpuLayers: els.localGpu.checked ? 99 : 0 })
    els.gpuInfo.className = 'local-status'
    els.gpuInfo.textContent = els.localGpu.checked
      ? 'GPU ligada: o modelo será recarregado na próxima mensagem'
      : 'GPU desligada: processamento na CPU'
  })
  els.input.addEventListener('input', autoGrow)
  els.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  })
  els.messages.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]')
    if (anchor) {
      event.preventDefault()
      api.openExternal(anchor.href)
      return
    }
    const openButton = event.target.closest('button.open-preview')
    if (openButton) {
      const file = openButton.getAttribute('data-file')
      els.preview.hidden = false
      state.previewTab = file || 'preview'
      renderPreview()
      return
    }
    const copyFile = event.target.closest('button.copy-file')
    if (copyFile) {
      const active = (state.projectFiles ?? []).find((file) => file.name === state.previewTab)
      if (active) {
        navigator.clipboard.writeText(active.content).then(() => {
          copyFile.textContent = 'Copiado'
          setTimeout(() => (copyFile.textContent = 'Copiar'), 1200)
        })
      }
      return
    }
    const button = event.target.closest('button.copy')
    if (!button) return
    const code = button.parentElement.querySelector('code')?.textContent ?? ''
    navigator.clipboard.writeText(code).then(() => {
      button.textContent = 'Copiado'
      setTimeout(() => (button.textContent = 'Copiar'), 1200)
    })
  })
  els.keysLink.addEventListener('click', (event) => {
    event.preventDefault()
    api.openExternal('https://openrouter.ai/keys')
  })
  els.keySave.addEventListener('click', saveKey)
  els.keyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveKey()
    }
  })
}

/* ------------------------------ projeto/preview ----------------------------- */

const CODE_LANGS = {
  html: 'html', htm: 'html', css: 'css', scss: 'css', js: 'js', mjs: 'js', jsx: 'jsx',
  ts: 'ts', tsx: 'tsx', json: 'json', md: 'md', py: 'py', sql: 'sql', sh: 'sh', bash: 'sh',
  yml: 'yml', yaml: 'yml', xml: 'xml', svg: 'svg', txt: 'txt', vue: 'vue', svelte: 'svelte',
}

const DEFAULT_NAMES = {
  html: 'index.html', css: 'styles.css', js: 'script.js', jsx: 'App.jsx', tsx: 'App.tsx',
  ts: 'app.ts', json: 'data.json', md: 'README.md', py: 'main.py', sql: 'query.sql',
  sh: 'script.sh', yml: 'config.yml', xml: 'config.xml', svg: 'image.svg', txt: 'notes.txt',
  vue: 'App.vue', svelte: 'App.svelte',
}

function guessFileName(lang, body) {
  const firstLine = body.split('\n').slice(0, 3).join('\n')
  const comment = firstLine.match(/(?:\/\/|#|<!--|--|\/\*)\s*([\w./-]+\.(?:html|css|js|jsx|tsx|ts|json|md|py|sql|sh|yml|yaml|xml|svg|vue|svelte|txt))/i)
  if (comment) return comment[1].replace(/^\.\//, '')
  return DEFAULT_NAMES[lang] ?? 'arquivo.txt'
}

function uniqueName(name, used) {
  if (!used.has(name)) return name
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  let counter = 2
  while (used.has(`${base}-${counter}${extension}`)) counter += 1
  return `${base}-${counter}${extension}`
}

function collectProject() {
  const conversation = current()
  const files = []
  const used = new Set()
  for (const message of conversation?.messages ?? []) {
    if (message.role !== 'assistant') continue
    const pattern = /```([\w+-]*)\n([\s\S]*?)```/g
    let match
    while ((match = pattern.exec(message.content ?? '')) !== null) {
      const rawLang = (match[1] ?? '').toLowerCase().split(':')[0]
      const lang = CODE_LANGS[rawLang] ?? (rawLang || 'txt')
      const body = match[2].replace(/\s+$/, '')
      if (!body.trim()) continue
      const name = uniqueName(guessFileName(lang, body), used)
      used.add(name)
      files.push({ name, lang, content: body })
    }
  }
  return files
}

function buildPreviewDocument(files) {
  const html = files.filter((file) => file.lang === 'html').map((file) => file.content).join('\n')
  const css = files.filter((file) => file.lang === 'css').map((file) => file.content).join('\n')
  const js = files.filter((file) => file.lang === 'js').map((file) => file.content).join('\n')

  if (html) {
    let document = html
    if (css) {
      const style = `<style>\n${css}\n</style>`
      document = /<\/head>/i.test(document) ? document.replace(/<\/head>/i, `${style}\n</head>`) : `${style}\n${document}`
    }
    if (js) {
      const script = `<script>\n${js}\n</script>`
      document = /<\/body>/i.test(document) ? document.replace(/<\/body>/i, `${script}\n</body>`) : `${document}\n${script}`
    }
    return document
  }

  if (css || js) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${css}</style></head><body><div id="app"></div><script>${js}</script></body></html>`
  }

  return ''
}

function renderPreview() {
  const files = collectProject()
  state.projectFiles = files
  els.previewCount.textContent = `${files.length} arquivo${files.length === 1 ? '' : 's'}`

  const tabs = [{ id: 'preview', label: 'Prévia' }, ...files.map((file) => ({ id: file.name, label: file.name }))]
  els.previewTabs.innerHTML = ''
  for (const tab of tabs) {
    const button = document.createElement('button')
    button.className = `preview-tab${state.previewTab === tab.id ? ' active' : ''}`
    button.textContent = tab.label
    button.title = tab.label
    button.addEventListener('click', () => {
      state.previewTab = tab.id
      renderPreview()
    })
    els.previewTabs.append(button)
  }

  const active = files.find((file) => file.name === state.previewTab)
  const showCode = Boolean(active)

  els.previewEmpty.hidden = files.length > 0
  els.previewFrame.hidden = showCode || files.length === 0
  els.previewCode.hidden = !showCode

  if (showCode) {
    const lines = active.content.split('\n')
    const rows = lines
      .map((line, index) => `<div class="code-line"><span class="ln">${index + 1}</span><code>${escapeHtml(line) || ' '}</code></div>`)
      .join('')
    els.previewCode.innerHTML = `<div class="code-head"><span class="code-file">${escapeHtml(active.name)}</span><span class="code-meta">${lines.length} linha${lines.length === 1 ? '' : 's'} · ${active.lang}</span><span class="spacer"></span><button class="copy-file" type="button">Copiar</button></div><div class="code-scroll">${rows}</div>`
  } else if (files.length > 0) {
    els.previewFrame.hidden = false
    els.previewEmpty.hidden = true
    const payload = files.map((file) => ({ name: file.name, content: file.content }))
    api.servePreview({ files: payload }).then((result) => {
      if (result.ok) {
        if (els.previewFrame.getAttribute('src') !== result.url) els.previewFrame.src = result.url
        els.previewEmpty.hidden = true
        els.previewFrame.hidden = false
      } else {
        els.previewFrame.hidden = true
        els.previewEmpty.hidden = false
        els.previewEmpty.textContent = result.error ?? 'não foi possível montar a prévia'
      }
    })
  }
}

function openPreview() {
  els.preview.hidden = false
  state.previewTab = 'preview'
  renderPreview()
}

async function exportProject() {
  const files = state.projectFiles?.length ? state.projectFiles : collectProject()
  if (files.length === 0) {
    setStatus('nenhum arquivo no projeto ainda')
    return
  }
  const conversation = current()
  const result = await api.exportProject({
    name: conversation?.title ?? 'projeto',
    files: files.map((file) => ({ name: file.name, content: file.content })),
  })
  if (result.ok && !result.canceled) setStatus(`ZIP salvo com ${result.count} arquivo(s)`)
  else if (result.ok === false) setStatus(result.error ?? 'não foi possível salvar')
}

const TOOLS = [
  { icon: '🧠', title: 'Dois provedores', text: 'OpenRouter (nuvem) ou IA local sem cota, alternáveis no topo.' },
  { icon: '📎', title: 'Anexos', text: 'ZIP, APK, PDF, imagem, código, JSON, XML, CSV e texto — até 40 MB por arquivo.' },
  { icon: '▤', title: 'Prévia de projeto', text: 'Blocos de código viram uma página navegável antes de hospedar.' },
  { icon: '📦', title: 'Download do projeto', text: 'Exporta todos os arquivos gerados em um ZIP.' },
  { icon: '⚡', title: 'GPU opcional', text: 'Com uma NVIDIA, as camadas do modelo vão para a placa (CUDA).' },
  { icon: '🔒', title: 'Chave protegida', text: 'Criptografada pelo Windows (DPAPI), usada só no processo principal.' },
]

function bindPreview() {
  els.previewBtn.addEventListener('click', () => {
    if (els.preview.hidden) openPreview()
    else els.preview.hidden = true
  })
  els.previewClose.addEventListener('click', () => {
    els.preview.hidden = true
  })
  els.previewRefresh.addEventListener('click', () => {
    state.previewTab = 'preview'
    renderPreview()
  })
  els.previewZip.addEventListener('click', exportProject)
  els.previewCode.addEventListener('click', (event) => {
    const button = event.target.closest('button.copy-file')
    if (!button) return
    const active = (state.projectFiles ?? []).find((file) => file.name === state.previewTab)
    if (!active) return
    navigator.clipboard.writeText(active.content).then(() => {
      button.textContent = 'Copiado'
      setTimeout(() => (button.textContent = 'Copiar'), 1200)
    })
  })

  els.toolsBtn.addEventListener('click', async () => {
    els.toolsList.innerHTML = ''
    for (const tool of TOOLS) {
      const item = document.createElement('li')
      item.innerHTML = `<span class="tool-icon">${tool.icon}</span><div><strong>${escapeHtml(tool.title)}</strong><p>${escapeHtml(tool.text)}</p></div>`
      els.toolsList.append(item)
    }
    els.toolsDialog.showModal()
  })
  els.toolsModels.addEventListener('click', async () => {
    const settings = await api.settings()
    const result = await api.openPath(settings.dir)
    if (result.ok === false) setStatus(result.error ?? 'não foi possível abrir a pasta')
  })
  els.toolsScripts.addEventListener('click', async () => {
    const settings = await api.settings()
    const result = await api.openPath(`${settings.dir}/scripts`)
    if (result.ok === false) setStatus('pasta de scripts não encontrada')
  })
}

async function boot() {
  loadState()
  bind()
  bindPreview()
  renderModels()
  renderConversations()
  renderMessages()
  renderAttachments()

  api.onDelta(({ requestId, text }) => {
    if (requestId !== state.requestId) return
    const conversation = current()
    const last = conversation?.messages[conversation.messages.length - 1]
    if (!last || last.role !== 'assistant') return
    last.content += text
    const node = els.messages.lastElementChild?.querySelector('.content')
    if (node) node.innerHTML = renderMarkdown(last.content)
    scrollToBottom()
  })

  const status = await api.keyStatus()
  state.hasKey = status.hasKey
  refreshKeyChip()
  if (status.plain) setStatus('atenção: a chave está salva sem criptografia')

  const settings = await api.settings()
  state.provider = settings.provider === 'local' ? 'local' : 'openrouter'
  state.localBaseUrl = settings.localBaseUrl ?? state.localBaseUrl
  els.provider.value = state.provider
  els.localUrl.value = state.localBaseUrl
  els.localGpu.checked = Number(settings.gpuLayers ?? 0) > 0
  if (settings.model) state.selectedModel = settings.model

  const gpu = await api.gpu()
  els.gpuInfo.className = 'local-status'
  if (gpu.vendor === 'nvidia') {
    els.gpuInfo.textContent = `${gpu.backend} · ${gpu.name}${gpu.memory ? ` (${gpu.memory})` : ''}`
    els.localGpu.disabled = false
  } else {
    els.gpuInfo.textContent = 'nenhuma GPU NVIDIA detectada — processando na CPU'
    els.localGpu.disabled = true
    els.localGpu.checked = false
  }

  await loadModels(state.provider)

  if (state.hasKey) await loadModels('openrouter')
  else {
    renderModels()
    setStatus('configure a chave do OpenRouter')
    openKeyDialog()
  }
}

boot()
