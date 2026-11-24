import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface SanitizedMessage {
  role: 'user' | 'assistant'
  content: string | ContentPart[]
}

const SYSTEM_PROMPT = [
  'Você é um assistente técnico prestativo e direto. Responda sempre em português do Brasil.',
  'Use Markdown quando ajudar (negrito, listas, tabelas) e sempre que mostrar código use blocos de código',
  'com a linguagem indicada após as três crases. Seja preciso e evite enrolação.',
  '',
  'ARQUIVOS ANEXADOS:',
  'Quando o usuário anexar um arquivo, o conteúdo vem dentro de um bloco <anexo> na mensagem dele,',
  'com a estrutura de pastas e o conteúdo dos arquivos mais relevantes. Analise esse material antes de responder.',
  'Você pode identificar bugs, apontar riscos, sugerir melhorias, refatorar, explicar a arquitetura e reescrever arquivos inteiros.',
  'Se o conteúdo estiver truncado, diga o que falta em vez de inventar.',
  '',
  'FORMATO OBRIGATÓRIO DOS BLOCOS DE CÓDIGO:',
  'Sempre que o bloco de código representar um arquivo do projeto, a PRIMEIRA linha do bloco deve ser um comentário',
  'com o caminho do arquivo, no formato da linguagem:',
  '  // arquivo: src/components/Button.tsx   (JS/TS/Java/Kotlin/Swift/C/C++/C#/Go/Rust/Dart/JSON5)',
  '  # arquivo: scripts/build.py            (Python/Ruby/Shell/YAML)',
  '  <!-- arquivo: index.html -->           (HTML/XML/Markdown)',
  '  -- arquivo: query.sql                  (SQL)',
  'Mantenha exatamente a estrutura de pastas original informada no <anexo> quando estiver corrigindo um projeto.',
  'Assim o aplicativo consegue reconstruir o projeto para download. Nunca invente caminhos diferentes dos originais.',
  'Se o código não representa um arquivo (um trecho solto, um comando), não coloque o comentário de caminho.',
].join('\n')

function sanitizeMessages(input: unknown): SanitizedMessage[] {
  if (!Array.isArray(input)) return []

  const result: SanitizedMessage[] = []
  for (const raw of input as Array<Record<string, unknown>>) {
    const role = raw?.role === 'assistant' ? 'assistant' : raw?.role === 'user' ? 'user' : null
    if (!role) continue

    const text = typeof raw?.content === 'string' ? raw.content : ''
    const image = typeof raw?.imageDataUrl === 'string' ? raw.imageDataUrl : ''

    if (text.trim().length === 0 && !image) continue

    if (image.startsWith('data:image/') && role === 'user') {
      const parts: ContentPart[] = []
      if (text.trim().length > 0) parts.push({ type: 'text', text })
      parts.push({ type: 'image_url', image_url: { url: image } })
      result.push({ role, content: parts })
      continue
    }

    if (text.trim().length === 0) continue
    result.push({ role, content: text })
  }

  return result
}

function plainTextOf(message: SanitizedMessage): string {
  if (typeof message?.content === 'string') return message.content
  const parts = Array.isArray(message?.content) ? message.content : []
  return parts
    .filter((part) => part?.type === 'text')
    .map((part) => (part as { text: string }).text)
    .join('\n')
}

function buildTitle(messages: SanitizedMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user')
  const raw = plainTextOf(firstUser ?? { role: 'user', content: '' })
    .replace(/<anexo[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return 'Nova conversa'
  return raw.length > 60 ? `${raw.slice(0, 60)}…` : raw
}

export async function POST(request: Request) {
  let body: Record<string, unknown> | null = null
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = null
  }

  const apiKey = (process.env.OPENROUTER_API_KEY ?? '').trim()
  const model = typeof body?.model === 'string' ? body.model.trim() : ''
  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''
  const messages = sanitizeMessages(body?.messages)
  let conversationId =
    typeof body?.conversationId === 'string' && body.conversationId.trim().length > 0
      ? body.conversationId.trim()
      : null

  if (!apiKey) {
    return NextResponse.json(
      { error: 'A chave do OpenRouter não está configurada no servidor. Avise o responsável pelo aplicativo.' },
      { status: 500 }
    )
  }
  if (!model) {
    return NextResponse.json({ error: 'Selecione um modelo antes de enviar a mensagem.' }, { status: 400 })
  }
  if (messages.length === 0) {
    return NextResponse.json({ error: 'Envie uma mensagem para começar a conversa.' }, { status: 400 })
  }

  // Garante que a conversa exista no banco antes de iniciar o streaming.
  let createdNow = false
  if (clientId) {
    try {
      if (conversationId) {
        const existing = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { id: true },
        })
        if (!existing) conversationId = null
      }

      if (conversationId) {
        await prisma.conversation.update({ where: { id: conversationId }, data: { model } })
      } else {
        const created = await prisma.conversation.create({
          data: { clientId, title: buildTitle(messages), model },
          select: { id: true },
        })
        conversationId = created.id
        createdNow = true
      }
    } catch (error) {
      console.error('[api/chat] Falha ao preparar a conversa no banco:', error)
      conversationId = null
    }
  }

  let upstream: Response
  try {
    upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXTAUTH_URL ?? 'https://chat-multi-ia.app',
        'X-Title': 'Chat Multi-IA',
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      }),
    })
  } catch (error) {
    console.error('[api/chat] Falha de rede ao chamar o OpenRouter:', error)
    return NextResponse.json(
      { error: 'Não foi possível conectar ao OpenRouter. Verifique sua conexão e tente novamente.' },
      { status: 502 }
    )
  }

  if (!upstream.ok) {
    let detail = ''
    try {
      const raw = await upstream.text()
      const parsed: unknown = JSON.parse(raw)
      const maybeError = (parsed as { error?: { message?: string } })?.error
      detail = typeof maybeError?.message === 'string' ? maybeError.message : raw.slice(0, 300)
    } catch {
      detail = ''
    }

    const friendly =
      upstream.status === 401
        ? 'A chave do OpenRouter configurada no servidor é inválida ou expirou.'
        : upstream.status === 402
          ? 'A conta do OpenRouter não tem créditos disponíveis para este modelo.'
          : upstream.status === 429
            ? 'Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo.'
            : upstream.status === 404 || upstream.status === 400
              ? `O modelo não aceitou esta requisição (${upstream.status}).${detail ? ` ${detail}` : ''}`
              : `O OpenRouter retornou um erro (${upstream.status}).${detail ? ` ${detail}` : ''}`

    // Não deixa conversas vazias no histórico quando a requisição falha.
    if (createdNow && conversationId) {
      try {
        await prisma.conversation.delete({ where: { id: conversationId } })
      } catch (cleanupError) {
        console.error('[api/chat] Falha ao limpar conversa vazia:', cleanupError)
      }
    }

    return NextResponse.json({ error: friendly }, { status: upstream.status })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let accumulated = ''
      let buffer = ''
      let streamError: string | null = null

      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      send({ type: 'meta', conversationId, model })

      try {
        const reader = upstream.body?.getReader()
        if (!reader) throw new Error('Resposta do OpenRouter sem corpo para leitura')

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
            if (!data || data === '[DONE]') continue

            let parsed: any = null
            try {
              parsed = JSON.parse(data)
            } catch {
              continue
            }

            const upstreamError = parsed?.error
            if (upstreamError) {
              streamError =
                typeof upstreamError?.message === 'string'
                  ? upstreamError.message
                  : 'O modelo retornou um erro durante a geração.'
              break
            }

            const delta = parsed?.choices?.[0]?.delta?.content
            if (typeof delta === 'string' && delta.length > 0) {
              accumulated += delta
              send({ type: 'delta', text: delta })
            }
          }

          if (streamError) break
        }
      } catch (error) {
        console.error('[api/chat] Erro durante o streaming:', error)
        streamError = 'A conexão com o modelo foi interrompida. Tente novamente.'
      }

      if (streamError) {
        send({ type: 'error', message: streamError })
      }

      // Persiste a conversa no banco (best effort, nunca derruba o streaming).
      let savedMessageId: string | null = null
      if (conversationId && accumulated.trim().length === 0 && createdNow) {
        try {
          await prisma.conversation.delete({ where: { id: conversationId } })
        } catch (cleanupError) {
          console.error('[api/chat] Falha ao limpar conversa vazia:', cleanupError)
        }
        conversationId = null
      }

      if (conversationId && accumulated.trim().length > 0) {
        try {
          const lastUser = [...messages].reverse().find((message) => message.role === 'user')
          const lastUserText = lastUser ? plainTextOf(lastUser) : ''
          const previous = await prisma.message.findFirst({
            where: { conversationId },
            orderBy: { createdAt: 'desc' },
            select: { role: true, content: true },
          })

          if (lastUserText && !(previous?.role === 'user' && previous?.content === lastUserText)) {
            await prisma.message.create({
              data: { conversationId, role: 'user', content: lastUserText },
            })
          }

          const saved = await prisma.message.create({
            data: { conversationId, role: 'assistant', content: accumulated, model },
            select: { id: true },
          })
          savedMessageId = saved.id
        } catch (error) {
          console.error('[api/chat] Falha ao salvar mensagens no banco:', error)
        }
      }

      send({ type: 'done', conversationId, messageId: savedMessageId })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
