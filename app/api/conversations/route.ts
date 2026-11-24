import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const clientId = (searchParams.get('clientId') ?? '').trim()

  if (!clientId) {
    return NextResponse.json({ conversations: [] })
  }

  try {
    const rows = await prisma.conversation.findMany({
      where: { clientId },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        title: true,
        model: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    })

    return NextResponse.json({
      conversations: rows.map((row) => ({
        id: row.id,
        title: row.title,
        model: row.model,
        updatedAt: row.updatedAt.toISOString(),
        messageCount: row._count?.messages ?? 0,
      })),
    })
  } catch (error) {
    console.error('[api/conversations] Falha ao listar conversas:', error)
    return NextResponse.json({ conversations: [], error: 'Não foi possível carregar o histórico.' })
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const clientId = (searchParams.get('clientId') ?? '').trim()

  if (!clientId) {
    return NextResponse.json({ error: 'Identificador do navegador ausente.' }, { status: 400 })
  }

  try {
    const result = await prisma.conversation.deleteMany({ where: { clientId } })
    return NextResponse.json({ deleted: result.count })
  } catch (error) {
    console.error('[api/conversations] Falha ao apagar conversas:', error)
    return NextResponse.json({ error: 'Não foi possível apagar o histórico.' }, { status: 500 })
  }
}
