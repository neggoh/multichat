import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { fileNameFromCode, sanitizeFileName } from '@/lib/code-blocks'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  let body: Record<string, unknown> | null = null
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = null
  }

  const rawFiles = Array.isArray(body?.files) ? (body?.files as unknown[]) : []
  if (rawFiles.length === 0) {
    return NextResponse.json({ error: 'Nenhum arquivo para baixar.' }, { status: 400 })
  }

  const zip = new JSZip()
  const used = new Set<string>()
  let added = 0

  for (const item of rawFiles) {
    const record = item as { path?: unknown; content?: unknown }
    const content = typeof record?.content === 'string' ? record.content : ''
    const rawPath = typeof record?.path === 'string' ? record.path : ''
    // O caminho vem do navegador: cada segmento é higienizado e ".." nunca sobrevive,
    // então o arquivo não escapa da raiz do ZIP.
    const cleanPath = sanitizeFileName(rawPath)
    const cleanName = sanitizeFileName(fileNameFromCode(content, ''))
    // sanitizeFileName preserva diretórios (é usado para caminhos de arquivos extraídos),
    // mas aqui o caminho é digitado pelo cliente: usa-se o caminho quando é relativo de
    // verdade (nem "." nem ".." em nenhum segmento) e, senão, só o nome do arquivo.
    const isRelative = cleanPath.length > 0 && cleanPath.split('/').every((seg) => seg !== '.' && seg !== '..')
    const safePath = (isRelative ? cleanPath : cleanName.split('/').pop() || '') || `arquivo-${added + 1}.txt`

    let finalPath = safePath
    let counter = 2
    while (used.has(finalPath)) {
      const dot = safePath.lastIndexOf('.')
      finalPath = dot > 0 ? `${safePath.slice(0, dot)}-${counter}${safePath.slice(dot)}` : `${safePath}-${counter}`
      counter += 1
    }
    used.add(finalPath)
    zip.file(finalPath, content)
    added += 1
  }

  if (added === 0) {
    return NextResponse.json({ error: 'Nenhum arquivo válido para baixar.' }, { status: 400 })
  }

  const requestedName = typeof body?.name === 'string' ? sanitizeFileName(body.name) : ''
  const zipName = requestedName ? (requestedName.endsWith('.zip') ? requestedName : `${requestedName}.zip`) : 'projeto-gerado.zip'

  try {
    const buffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName.replace(/"/g, '')}"`,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[api/files/download] Falha ao gerar o ZIP:', error)
    return NextResponse.json({ error: 'Não foi possível gerar o arquivo ZIP.' }, { status: 500 })
  }
}
