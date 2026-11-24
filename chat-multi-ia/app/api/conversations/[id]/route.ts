import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const clientId = (new URL(request.url).searchParams.get('clientId') ?? '').trim()

  if (!id) {
    return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 })
  }

  if (!clientId) {
    return NextResponse.json({ error: 'Identificador do navegador ausente.' }, { status: 400 })
  }

  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, clientId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 200 },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        messages: (conversation.messages ?? []).map((message) => ({
          id: message.id,
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
          model: message.model,
        })),
      },
    })
  } catch (error) {
    console.error('[api/conversations/[id]] Falha ao carregar a conversa:', error)
    return NextResponse.json({ error: 'Não foi possível carregar a conversa.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  let body: Record<string, unknown> | null = null
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = null
  }

  const data: { title?: string; model?: string } = {}
  if (typeof body?.title === 'string' && body.title.trim().length > 0) {
    data.title = body.title.trim().slice(0, 120)
  }
  if (typeof body?.model === 'string' && body.model.trim().length > 0) {
    data.model = body.model.trim()
  }

  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : ''

  if (!clientId) {
    return NextResponse.json({ error: 'Identificador do navegador ausente.' }, { status: 400 })
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 })
  }

  try {
    const result = await prisma.conversation.updateMany({ where: { id, clientId }, data })
    if (result.count === 0) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    const updated = await prisma.conversation.findFirst({
      where: { id, clientId },
      select: { id: true, title: true, model: true },
    })

    return NextResponse.json({ conversation: updated })
  } catch (error) {
    console.error('[api/conversations/[id]] Falha ao atualizar a conversa:', error)
    return NextResponse.json({ error: 'Não foi possível atualizar a conversa.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const clientId = (new URL(request.url).searchParams.get('clientId') ?? '').trim()

  if (!clientId) {
    return NextResponse.json({ error: 'Identificador do navegador ausente.' }, { status: 400 })
  }

  try {
    const result = await prisma.conversation.deleteMany({ where: { id, clientId } })
    if (result.count === 0) {
      return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 })
    }

    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('[api/conversations/[id]] Falha ao apagar a conversa:', error)
    return NextResponse.json({ error: 'Não foi possível apagar a conversa.' }, { status: 500 })
  }
}
