'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Loader2, Menu, Package, Sparkles, Trash2, UploadCloud } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Composer } from './composer'
import { ConversationSidebar } from './conversation-sidebar'
import { EmptyState } from './empty-state'
import { MessageBubble } from './message-bubble'
import { ProjectPreview } from './project-preview'
import { ModelSelector } from './model-selector'
import {
  DEFAULT_MODEL_ID,
  FALLBACK_MODELS,
  type ChatMessage,
  type ConversationSummary,
  type ModelInfo,
} from '@/lib/chat-types'
import {
  MAX_UPLOAD_BYTES,
  buildAttachmentBlock,
  fileKindFromName,
  formatBytes,
  type FileKind,
  type ProcessedFile,
} from '@/lib/file-types'
import { dedupeCodeBlocks, extractCodeBlocks } from '@/lib/code-blocks'
import type { AttachmentStatus } from './file-preview'

const CLIENT_ID_STORAGE = 'chat-multi-ia:client-id'
const MODEL_STORAGE = 'chat-multi-ia:model'

interface PendingAttachment {
  name: string
  size: number
  kind: FileKind
  status: AttachmentStatus
  progress: number
  processed: ProcessedFile | null
  error: string | null
}

function createId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* ignora e usa o fallback abaixo */
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function uploadAndProcess(file: File, onProgress: (percent: number) => void): Promise<ProcessedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/files/process')

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(95, Math.round((event.loaded / event.total) * 95)))
      }
    }

    xhr.onload = () => {
      let payload: any = null
      try {
        payload = JSON.parse(xhr.responseText)
      } catch {
        payload = null
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload) {
        onProgress(100)
        resolve(payload as ProcessedFile)
        return
      }

      reject(new Error(typeof payload?.error === 'string' ? payload.error : `Falha ao processar o arquivo (${xhr.status}).`))
    }

    xhr.onerror = () => reject(new Error('Falha de rede ao enviar o arquivo.'))
    xhr.ontimeout = () => reject(new Error('O envio do arquivo demorou demais. Tente novamente.'))

    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

/**
 * Identidade sem login: um UUID por navegador. Roda só no cliente (o componente só é
 * renderizado depois de montado), por isso o SSR não enxerga este valor.
 */
function readClientId(): string {
  if (typeof window === 'undefined') return ''
  try {
    const stored = window.localStorage.getItem(CLIENT_ID_STORAGE) ?? ''
    if (stored) return stored
    const created = createId()
    window.localStorage.setItem(CLIENT_ID_STORAGE, created)
    return created
  } catch (error) {
    console.error('[chat-app] Não foi possível acessar o localStorage:', error)
    return createId()
  }
}

function readPreferredModel(): string {
  try {
    return window.localStorage.getItem(MODEL_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function ChatApp() {
  const [mounted, setMounted] = useState(false)
  const [clientId] = useState(readClientId)

  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsSource, setModelsSource] = useState<'openrouter' | 'fallback'>('openrouter')
  const [modelsLoading, setModelsLoading] = useState(true)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [loadingConversation, setLoadingConversation] = useState(false)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pending, setPending] = useState<PendingAttachment | null>(null)
  const [dragging, setDragging] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const shouldAutoScroll = useRef(true)
  const preferredModelRef = useRef('')

  /* ------------------------------ inicialização ----------------------------- */
  useEffect(() => {
    preferredModelRef.current = readPreferredModel()
    // Guarda de montagem: o app só renderiza depois disso para o SSR não divergir do
    // cliente (localStorage). O estado muda uma única vez, no primeiro efeito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  /* -------------------------------- modelos -------------------------------- */
  useEffect(() => {
    if (!mounted) return
    let cancelled = false

    const loadModels = async () => {
      setModelsLoading(true)
      try {
        const response = await fetch('/api/models', { cache: 'no-store' })
        const payload: any = await response.json().catch(() => null)
        const list: ModelInfo[] = Array.isArray(payload?.models) ? payload.models : []
        if (cancelled) return

        const safeList = list.length > 0 ? list : FALLBACK_MODELS
        setModels(safeList)
        setModelsSource(payload?.source === 'fallback' || list.length === 0 ? 'fallback' : 'openrouter')

        const preferred = preferredModelRef.current
        setSelectedModel((current) => {
          if (current && safeList.some((model) => model?.id === current)) return current
          if (preferred && safeList.some((model) => model?.id === preferred)) return preferred
          return safeList[0]?.id ?? DEFAULT_MODEL_ID
        })
      } catch (error) {
        console.error('[chat-app] Falha ao carregar modelos:', error)
        if (cancelled) return
        setModels(FALLBACK_MODELS)
        setModelsSource('fallback')
        setSelectedModel((current) => current || FALLBACK_MODELS[0]?.id || DEFAULT_MODEL_ID)
      } finally {
        if (!cancelled) setModelsLoading(false)
      }
    }

    loadModels()
    return () => {
      cancelled = true
    }
  }, [mounted])

  /* ------------------------------- histórico ------------------------------- */
  const refreshConversations = useCallback(async () => {
    if (!clientId) return
    setConversationsLoading(true)
    try {
      const response = await fetch(`/api/conversations?clientId=${encodeURIComponent(clientId)}`, {
        cache: 'no-store',
      })
      const payload: any = await response.json().catch(() => null)
      setConversations(Array.isArray(payload?.conversations) ? payload.conversations : [])
    } catch (error) {
      console.error('[chat-app] Falha ao carregar o histórico:', error)
    } finally {
      setConversationsLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    if (!mounted || !clientId) return
    // Busca do histórico: setState só acontece depois do await, dentro de refreshConversations.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshConversations()
  }, [mounted, clientId, refreshConversations])

  /* ------------------------------- auto scroll ----------------------------- */
  useEffect(() => {
    if (!shouldAutoScroll.current) return
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [messages, isStreaming])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    shouldAutoScroll.current = element.scrollHeight - element.scrollTop - element.clientHeight < 140
  }

  /* -------------------------------- modelo --------------------------------- */
  const handleModelChange = useCallback(
    (modelId: string) => {
      if (!modelId) return
      setSelectedModel(modelId)
      try {
        window.localStorage.setItem(MODEL_STORAGE, modelId)
      } catch (error) {
        console.error('[chat-app] Não foi possível salvar o modelo:', error)
      }
      const name = models.find((model) => model?.id === modelId)?.name ?? modelId
      toast.success(`Modelo alterado para ${name}. O histórico foi mantido.`)
    },
    [models]
  )

  const selectedModelInfo = useMemo(
    () => models.find((model) => model?.id === selectedModel) ?? null,
    [models, selectedModel]
  )

  /* ------------------------------ conversas -------------------------------- */
  const handleNewConversation = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setConversationId(null)
    setInput('')
    setPending(null)
    shouldAutoScroll.current = true
  }, [])

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (!id || id === conversationId || isStreaming) return
      setLoadingConversation(true)
      try {
        const response = await fetch(`/api/conversations/${id}?clientId=${encodeURIComponent(clientId)}`, {
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('Não foi possível carregar a conversa.')
        const payload: any = await response.json().catch(() => null)
        const loaded: any[] = Array.isArray(payload?.conversation?.messages) ? payload.conversation.messages : []

        setMessages(
          loaded.map((item) => ({
            id: String(item?.id ?? createId()),
            role: item?.role === 'assistant' ? 'assistant' : 'user',
            content: String(item?.content ?? ''),
            model: typeof item?.model === 'string' ? item.model : null,
            imageDataUrl: null,
          }))
        )
        setConversationId(id)
        setPending(null)
        shouldAutoScroll.current = true

        const conversationModel = typeof payload?.conversation?.model === 'string' ? payload.conversation.model : ''
        if (conversationModel && models.some((model) => model?.id === conversationModel)) {
          setSelectedModel(conversationModel)
        }
      } catch (error) {
        console.error('[chat-app] Falha ao abrir a conversa:', error)
        toast.error('Não foi possível carregar a conversa.')
      } finally {
        setLoadingConversation(false)
      }
    },
    [conversationId, isStreaming, models, clientId]
  )

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      if (!id) return
      try {
        const response = await fetch(`/api/conversations/${id}?clientId=${encodeURIComponent(clientId)}`, {
          method: 'DELETE',
        })
        if (!response.ok) throw new Error('Falha ao apagar')
        setConversations((previous) => previous.filter((item) => item?.id !== id))
        if (id === conversationId) {
          setMessages([])
          setConversationId(null)
        }
        toast.success('Conversa apagada.')
      } catch (error) {
        console.error('[chat-app] Falha ao apagar a conversa:', error)
        toast.error('Não foi possível apagar a conversa.')
      }
    },
    [conversationId, clientId]
  )

  /* ------------------------------- arquivos -------------------------------- */
  const processFile = useCallback(async (file: File) => {
    if (!file) return

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(`O arquivo excede o limite de ${formatBytes(MAX_UPLOAD_BYTES)}.`)
      return
    }

    const kind = fileKindFromName(file.name, file.type)
    setPending({
      name: file.name,
      size: file.size,
      kind,
      status: 'uploading',
      progress: 0,
      processed: null,
      error: null,
    })

    try {
      const processed = await uploadAndProcess(file, (percent) => {
        setPending((previous) =>
          previous
            ? {
                ...previous,
                progress: percent,
                status: percent >= 100 ? 'processing' : 'uploading',
              }
            : previous
        )
      })

      setPending((previous) =>
        previous ? { ...previous, status: 'ready', progress: 100, processed, error: null } : previous
      )
      toast.success(`Arquivo processado: ${processed?.summary ?? file.name}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao processar o arquivo.'
      console.error('[chat-app] Falha ao processar o arquivo:', error)
      setPending((previous) =>
        previous ? { ...previous, status: 'error', progress: 0, processed: null, error: message } : previous
      )
      toast.error(message)
    }
  }, [])

  const handleFiles = useCallback(
    (files: FileList | File[] | null) => {
      const list = files ? Array.from(files as ArrayLike<File>) : []
      if (list.length === 0) return
      if (list.length > 1) toast.info('Um arquivo por mensagem — usando o primeiro da lista.')
      const first = list[0]
      if (first) processFile(first)
    },
    [processFile]
  )

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(event.dataTransfer?.types ?? [])
    if (!types.includes('Files')) return
    event.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null
    if (next && event.currentTarget.contains(next)) return
    setDragging(false)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (isStreaming) {
      toast.error('Aguarde a resposta atual terminar para anexar outro arquivo.')
      return
    }
    handleFiles(event.dataTransfer?.files ?? null)
  }

  /* -------------------------------- enviar --------------------------------- */
  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const sendMessage = useCallback(
    async (rawText?: string) => {
      const text = (typeof rawText === 'string' ? rawText : input).trim()
      const attachment = pending?.status === 'ready' ? pending.processed : null

      if (pending && pending.status !== 'ready') {
        toast.error(
          pending.status === 'error'
            ? 'O arquivo anexado falhou no processamento. Remova-o para continuar.'
            : 'Aguarde o processamento do arquivo terminar.'
        )
        return
      }

      if (!text && !attachment) return
      if (isStreaming) return

      const visibleText = text || 'Analise o arquivo anexado e me diga o que encontrou.'
      let content = visibleText
      let imageDataUrl: string | null = null

      if (attachment) {
        content = `${visibleText}\n\n${buildAttachmentBlock(attachment)}`

        if (attachment.kind === 'image' && attachment.imageDataUrl) {
          if (selectedModelInfo?.supportsVision) {
            imageDataUrl = attachment.imageDataUrl
          } else {
            content = `${content}\n\n(Observação: a imagem não pôde ser enviada porque o modelo selecionado não aceita imagens. Escolha um modelo com visão para analisá-la.)`
            toast.info('O modelo selecionado não aceita imagens. O arquivo foi anexado apenas como referência.')
          }
        }
      }

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content,
        imageDataUrl,
      }
      const history = [...messages, userMessage]
      const assistantId = createId()

      setMessages([...history, { id: assistantId, role: 'assistant', content: '', model: selectedModel }])
      setInput('')
      setPending(null)
      setIsStreaming(true)
      shouldAutoScroll.current = true

      const controller = new AbortController()
      abortRef.current = controller
      let accumulated = ''

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: selectedModel,
            clientId,
            conversationId,
            messages: history.map((message, index) => ({
              role: message.role,
              content: message.content,
              imageDataUrl: index === history.length - 1 ? message.imageDataUrl ?? null : null,
            })),
          }),
        })

        if (!response.ok) {
          const payload: any = await response.json().catch(() => null)
          throw new Error(
            typeof payload?.error === 'string' ? payload.error : 'Não foi possível obter resposta do modelo.'
          )
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('A resposta do servidor veio sem corpo para leitura.')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (!data) continue

            let event: any = null
            try {
              event = JSON.parse(data)
            } catch {
              continue
            }

            if (event?.type === 'meta' && typeof event?.conversationId === 'string') {
              setConversationId(event.conversationId)
            } else if (event?.type === 'delta' && typeof event?.text === 'string') {
              accumulated += event.text
              const snapshot = accumulated
              setMessages((previous) =>
                previous.map((message) =>
                  message?.id === assistantId ? { ...message, content: snapshot } : message
                )
              )
            } else if (event?.type === 'error') {
              throw new Error(
                typeof event?.message === 'string' ? event.message : 'O modelo retornou um erro.'
              )
            } else if (event?.type === 'done' && typeof event?.conversationId === 'string') {
              setConversationId(event.conversationId)
            }
          }
        }
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError'
        if (aborted) {
          setMessages((previous) =>
            previous.map((message) =>
              message?.id === assistantId && !message.content
                ? { ...message, content: '_Geração interrompida._' }
                : message
            )
          )
        } else {
          const message = error instanceof Error ? error.message : 'Erro inesperado ao falar com o modelo.'
          console.error('[chat-app] Falha ao enviar a mensagem:', error)
          toast.error(message)
          setMessages((previous) =>
            previous.map((item) =>
              item?.id === assistantId
                ? { ...item, content: accumulated || `⚠️ ${message}` }
                : item
            )
          )
        }
      } finally {
        abortRef.current = null
        setIsStreaming(false)
        refreshConversations()
      }
    },
    [clientId, conversationId, input, isStreaming, messages, pending, refreshConversations, selectedModel, selectedModelInfo]
  )

  /* --------------------------- download do projeto -------------------------- */
  const codeBlocks = useMemo(() => {
    const blocks = (messages ?? [])
      .filter((message) => message?.role === 'assistant' && (message?.content ?? '').includes('```'))
      .flatMap((message) => extractCodeBlocks(message.content, message.id))
    return dedupeCodeBlocks(blocks)
  }, [messages])

  const handleDownloadProject = useCallback(async () => {
    const blocks = dedupeCodeBlocks(codeBlocks)
    if (blocks.length === 0) {
      toast.error('Nenhum bloco de código encontrado nesta conversa.')
      return
    }

    setDownloading(true)
    try {
      const response = await fetch('/api/files/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: blocks.map((block) => ({ path: block.fileName, content: block.code })),
          name: 'projeto-gerado',
        }),
      })

      if (!response.ok) {
        const payload: any = await response.json().catch(() => null)
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Falha ao gerar o ZIP.')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'projeto-gerado.zip'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1500)
      toast.success(`ZIP gerado com ${blocks.length} arquivos.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível gerar o ZIP.'
      console.error('[chat-app] Falha ao gerar o ZIP do projeto:', error)
      toast.error(message)
    } finally {
      setDownloading(false)
    }
  }, [codeBlocks])

  const modelNameById = useMemo(() => {
    const map = new Map<string, string>()
    ;(models ?? []).forEach((model) => {
      if (model?.id) map.set(model.id, model.name ?? model.id)
    })
    return map
  }, [models])

  /* -------------------------------- render --------------------------------- */
  if (!mounted) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Carregando o Chat Multi-IA…
        </div>
      </div>
    )
  }

  const sidebar = (
    <ConversationSidebar
      conversations={conversations}
      activeId={conversationId}
      loading={conversationsLoading}
      onSelect={(id) => {
        setSidebarOpen(false)
        handleSelectConversation(id)
      }}
      onDelete={handleDeleteConversation}
      onNew={() => {
        setSidebarOpen(false)
        handleNewConversation()
      }}
    />
  )

  const attachmentBusy = pending?.status === 'uploading' || pending?.status === 'processing'

  return (
    <div
      className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <aside className="hidden w-[280px] shrink-0 border-r border-border/60 lg:block">{sidebar}</aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[300px] border-r border-border/60 bg-card p-0">
          <SheetTitle className="sr-only">Histórico de conversas</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="z-20 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-2 px-3 sm:px-5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir histórico de conversas"
            >
              <Menu />
            </Button>

            <div className="flex items-center gap-2 lg:hidden">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[hsl(172_66%_50%)]">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
            </div>

            <ModelSelector
              models={models}
              value={selectedModel}
              onChange={handleModelChange}
              loading={modelsLoading}
              source={modelsSource}
            />

            <div className="ml-auto flex items-center gap-1.5">
              {loadingConversation ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : null}

              {codeBlocks.length >= 2 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadProject}
                  disabled={downloading}
                  className="gap-1.5 text-[12px]"
                  title="Empacotar todos os arquivos de código da conversa em um ZIP"
                >
                  {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Baixar projeto</span>
                  <Badge
                    variant="secondary"
                    className="border-transparent bg-primary/20 px-1.5 py-0 text-[10px] text-primary"
                  >
                    {codeBlocks.length}
                  </Badge>
                </Button>
              ) : null}

              <Badge
                variant="secondary"
                className="hidden border-transparent bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground md:inline-flex"
              >
                {messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}
              </Badge>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleNewConversation}
                aria-label="Limpar conversa"
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        </header>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
          <div
            className={cn(
              'mx-auto w-full max-w-[820px] px-3 py-6 sm:px-6',
              messages.length === 0 && 'flex min-h-full flex-col justify-center'
            )}
          >
            {messages.length === 0 ? (
              <EmptyState onPick={(prompt) => sendMessage(prompt)} />
            ) : (
              <div className="space-y-5">
                {messages.map((message, index) => (
                  <MessageBubble
                    key={message?.id ?? index}
                    message={message}
                    isStreaming={isStreaming && index === messages.length - 1}
                    modelName={
                      modelNameById.get(message?.model ?? selectedModel) ??
                      message?.model ??
                      selectedModel
                    }
                  />
                ))}
                <ProjectPreview
                  key={conversationId ?? 'new'}
                  files={codeBlocks}
                  isStreaming={isStreaming}
                  downloading={downloading}
                  onDownload={handleDownloadProject}
                />
              </div>
            )}
          </div>
        </div>

        {codeBlocks.length >= 2 ? (
          <div className="mx-auto w-full max-w-[820px] px-3 sm:px-6">
            <button
              type="button"
              onClick={handleDownloadProject}
              disabled={downloading}
              className="mb-1 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Baixar tudo como ZIP ({codeBlocks.length} arquivos de código)
            </button>
          </div>
        ) : null}

        <div className="shrink-0 border-t border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-[820px] px-3 py-3 sm:px-6 sm:py-4">
            <Composer
              value={input}
              onChange={setInput}
              onSend={() => sendMessage()}
              onStop={stopGeneration}
              isStreaming={isStreaming}
              disabled={modelsLoading || attachmentBusy}
              attachment={pending}
              onPickFile={(file) => processFile(file)}
              onRemoveAttachment={() => setPending(null)}
            />
          </div>
        </div>

        {dragging ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/85 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-card/90 px-10 py-8 shadow-lg">
              <UploadCloud className="h-8 w-8 text-primary" />
              <p className="text-sm font-semibold">Solte o arquivo para anexar</p>
              <p className="text-center text-[11.5px] text-muted-foreground">
                ZIP, APK, PDF, imagem, código, JSON, XML, CSV…
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
