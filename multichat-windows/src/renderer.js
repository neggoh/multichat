'use strict'

/* MultiChat — renderer. Sem Node: tudo passa pela ponte window.multichat (preload). */

const api = window.multichat
const STORE_KEY = 'multichat:state'
const FALLBACK_MODELS = [
  { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 0324', context: 163840, vision: false },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct', context: 131072, vision: false },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (exp)', context: 1048576, vision: true },
  { id: 'qwen/qwen3-235b-a22b:free', name: 'Qwen3 235B A22B', context: 131072, vision: false },
]
const SYSTEM_PROMPT = [
  'Você é um assistente técnico prestativo e direto. Responda sempre em português do Brasil.',
  'Use Markdown quando ajudar (negrito, listas, tabelas) e sempre que mostrar código use blocos com a linguagem.',
  'Seja preciso e evite enrolação.',
].join('\n')

const $ = (id) => document.getElementById(id)
const els = {
  model: $('model'),
  modelInfo: $('model-info'),
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
  dialog: $('key-dialog'),
  keyInput: $('key-input'),
  keySave: $('key-save'),
  keyError: $('key-error'),
  keysLink: $('keys-link'),
}

const state = {
  models: FALLBACK_MODELS,
  selectedModel: FALLBACK_MODELS[0].id,
  conversations: [],
  currentId: null,
  streaming: false,
  requestId: 0,
  hasKey: false,
}

/* ------------------------------- persistência ------------------------------- */

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')
    state.conversations = Array.isArray(raw.conversations) ? raw.conversations : []
    state.selectedModel = typeof raw.selectedModel === 'string' ? raw.selectedModel : state.selectedModel
    state.currentId = typeof raw.currentId === 'string' ? raw.currentId : null
  } catch (error) {
    console.error('[renderer] Estado corrompido, começando do zero:', error)
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        conversations: state.conversations,
        selectedModel: state.selectedModel,
        currentId: state.currentId,
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

/** Markdown mínimo e seguro: blocos de código, títulos, listas, negrito e inline code. */
function renderMarkdown(source) {
  const parts = String(source ?? '').split(/```/)
  let html = ''
  parts.forEach((chunk, index) => {
    if (index % 2 === 1) {
      const newline = chunk.indexOf('\n')
      const body = newline >= 0 ? chunk.slice(newline + 1) : chunk
      html += `<pre><button class="copy" type="button">Copiar</button><code>${escapeHtml(body.replace(/\n$/, ''))}</code></pre>`
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

function modelLabel(model) {
  if (!model) return ''
  const ctx = model.context ? ` · ${model.context >= 1000000 ? Math.round(model.context / 100000) / 10 + 'M' : Math.round(model.context / 1000) + 'k'} tokens` : ''
  return `${model.name}${model.vision ? ' · visão' : ''}${ctx}`
}

function renderModels() {
  els.model.innerHTML = state.models.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join('')
  if (!state.models.some((m) => m.id === state.selectedModel)) state.selectedModel = state.models[0]?.id ?? ''
  els.model.value = state.selectedModel
  els.modelInfo.textContent = modelLabel(state.models.find((m) => m.id === state.selectedModel))
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

function buildRequestMessages(conversation) {
  const history = conversation.messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-30)
    .map((message) => ({ role: message.role, content: message.content }))
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...history]
}

async function send() {
  const text = els.input.value.trim()
  if (!text || state.streaming) return
  if (!state.hasKey) {
    openKeyDialog()
    return
  }

  const conversation = ensureConversation()
  conversation.model = state.selectedModel
  if (conversation.title === 'Nova conversa') conversation.title = text.slice(0, 60) + (text.length > 60 ? '…' : '')
  conversation.messages.push({ role: 'user', content: text })
  conversation.updatedAt = Date.now()
  els.input.value = ''
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

async function loadModels() {
  setStatus('carregando modelos…')
  const result = await api.models()
  if (result.ok && result.models.length > 0) {
    state.models = result.models
    renderModels()
    setStatus(`${result.models.length} modelos gratuitos`)
  } else {
    state.models = FALLBACK_MODELS
    renderModels()
    setStatus(result.error ?? 'usando lista local de modelos')
  }
  renderMessages()
}

function bind() {
  els.send.addEventListener('click', send)
  els.stop.addEventListener('click', stop)
  els.newBtn.addEventListener('click', newConversation)
  els.keyBtn.addEventListener('click', openKeyDialog)
  els.clearBtn.addEventListener('click', () => {
    if (!state.conversations.length) return
    if (!confirm('Apagar todas as conversas deste computador?')) return
    state.conversations = []
    state.currentId = null
    saveState()
    renderConversations()
    renderMessages()
  })
  els.model.addEventListener('change', () => {
    state.selectedModel = els.model.value
    els.modelInfo.textContent = modelLabel(state.models.find((m) => m.id === state.selectedModel))
    const conversation = current()
    if (conversation) conversation.model = state.selectedModel
    saveState()
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

async function boot() {
  loadState()
  bind()
  renderModels()
  renderConversations()
  renderMessages()

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

  if (state.hasKey) await loadModels()
  else {
    renderModels()
    setStatus('configure a chave do OpenRouter')
    openKeyDialog()
  }
}

boot()
