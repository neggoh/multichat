import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import {
  CODE_EXTENSIONS,
  IMAGE_EXTENSIONS,
  TEXT_EXTENSIONS,
  extensionOf,
  fileKindFromName,
  formatBytes,
  type FileTreeNode,
  type ProcessedFile,
} from '@/lib/file-types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024
const MAX_CONTEXT_CHARS = 120_000
const MAX_FILE_CHARS = 40_000
const MAX_CONTENT_FILES = 80
const MAX_TREE_ENTRIES = 900
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const SKIP_SEGMENTS = [
  'node_modules/',
  '.git/',
  '__MACOSX/',
  '.gradle/',
  '.idea/',
  '.next/',
  '.dart_tool/',
  'pods/',
  'coverage/',
  'dist/',
  'build/',
  'vendor/',
  '.vscode/',
  'venv/',
  '__pycache__/',
]

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'tiff', 'psd',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  'so', 'dylib', 'dll', 'a', 'o', 'obj', 'class', 'dex', 'jar', 'aar', 'zip', 'gz', 'tar', '7z', 'rar', 'xz', 'bz2',
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'avi', 'mkv', 'flac',
  'pdf', 'arsc', 'bin', 'dat', 'pak', 'exe', 'apk', 'aab', 'keystore', 'jks', 'p12', 'der', 'pyc', 'wasm', 'hprof', 'prof',
])

const PRIORITY_FILES = new Set([
  'package.json', 'androidmanifest.xml', 'pubspec.yaml', 'build.gradle', 'build.gradle.kts',
  'settings.gradle', 'settings.gradle.kts', 'podfile', 'requirements.txt', 'cargo.toml', 'go.mod',
  'composer.json', 'pom.xml', 'app.json', 'tsconfig.json', 'readme.md', 'dockerfile', 'makefile',
  'cmakelists.txt', 'index.html', 'main.dart', 'main.py', 'main.go', 'main.rs', 'main.ts', 'main.js',
  'app.tsx', 'app.ts', 'app.js', 'app.jsx', 'app.vue', 'index.ts', 'index.js', 'index.tsx', 'index.jsx',
  'server.js', 'server.ts', 'next.config.js', 'vite.config.ts', 'manifest.json', 'info.plist',
])

function isSkippedPath(path: string): boolean {
  const lower = String(path ?? '').toLowerCase()
  return SKIP_SEGMENTS.some((segment) => lower.includes(segment))
}

function isTextLikeExtension(extension: string): boolean {
  if (BINARY_EXTENSIONS.has(extension)) return false
  return (
    CODE_EXTENSIONS.includes(extension) ||
    TEXT_EXTENSIONS.includes(extension) ||
    ['json', 'xml', 'csv', 'tsv', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'plist', 'svg', 'txt'].includes(extension)
  )
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  let control = 0
  for (const byte of sample) {
    if (byte === 0) return true
    if (byte < 7 || (byte > 14 && byte < 32)) control += 1
  }
  return sample.length > 0 && control / sample.length > 0.1
}

function relevanceScore(path: string, size: number): number {
  const lower = path.toLowerCase()
  const base = lower.split('/').pop() ?? ''
  const extension = extensionOf(base)
  const depth = path.split('/').length
  let score = 0

  if (PRIORITY_FILES.has(base)) score += 120
  if (/^(index|main|app|server|routes?|api)\./.test(base)) score += 70
  if (CODE_EXTENSIONS.includes(extension)) score += 50
  else if (isTextLikeExtension(extension)) score += 30
  if (lower.includes('readme')) score += 40
  score -= Math.min(30, depth * 3)
  score -= Math.min(25, Math.floor(size / 20000))
  return score
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  const list = Array.isArray(nodes) ? nodes : []
  list.sort((a, b) => {
    if (a?.type !== b?.type) return a?.type === 'dir' ? -1 : 1
    return String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
  })
  for (const node of list) {
    if (node?.children && node.children.length > 0) sortTree(node.children)
  }
  return list
}

function insertPath(root: FileTreeNode, path: string, size: number): void {
  const segments = String(path ?? '').split('/').filter(Boolean)
  let current = root

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    const fullPath = segments.slice(0, index + 1).join('/')
    current.children = current.children ?? []

    let next = current.children.find((child) => child?.name === segment)
    if (!next) {
      next = {
        name: segment,
        path: fullPath,
        type: isLast ? 'file' : 'dir',
        size: isLast ? size : undefined,
        children: isLast ? undefined : [],
      }
      current.children.push(next)
    }

    current = next
  })
}

function entrySize(entry: JSZip.JSZipObject): number {
  const data = (entry as unknown as { _data?: { uncompressedSize?: number } })?._data
  const size = data?.uncompressedSize
  return typeof size === 'number' && Number.isFinite(size) ? size : 0
}

function detectApkTechnology(paths: string[]): string {
  const lower = paths.map((path) => String(path ?? '').toLowerCase())
  const has = (fragment: string) => lower.some((path) => path.includes(fragment))

  if (has('libflutter.so') || has('libapp.so') || has('flutter_assets/')) return 'Flutter (Dart)'
  if (has('libhermes.so') || has('index.android.bundle') || has('libreactnativejni.so')) return 'React Native'
  if (has('libmonodroid.so') || has('assemblies/') || has('libmonosgen')) return 'Xamarin / .NET MAUI'
  if (has('libunity.so')) return 'Unity'
  if (has('libcordova.so') || has('assets/www/')) return 'Cordova / Ionic'
  if (has('libnative-lib.so') && has('classes.dex')) return 'Android nativo (Java/Kotlin com NDK)'
  if (has('classes.dex')) return 'Android nativo (Java/Kotlin)'
  return 'Android (não identificado)'
}

function extractAxmStrings(buffer: Buffer): string[] {
  const found = new Set<string>()
  let current = ''

  for (let index = 0; index + 1 < buffer.length; index += 2) {
    const code = buffer.readUInt16LE(index)
    if (code >= 32 && code < 0x2fff && code !== 0xfffd) {
      current += String.fromCharCode(code)
    } else {
      if (current.length >= 4) found.add(current)
      current = ''
    }
  }
  if (current.length >= 4) found.add(current)

  // Alguns trechos do AXML guardam strings em UTF-8 puro.
  const utf8 = buffer.toString('latin1')
  const utf8Matches = utf8.match(/[\x20-\x7e]{5,}/g) ?? []
  for (const candidate of utf8Matches) {
    if (candidate.length >= 5) found.add(candidate)
  }

  return Array.from(found)
}

function summarizeManifest(buffer: Buffer): string {
  const strings = extractAxmStrings(buffer)
  const packageCandidates = strings.filter(
    (value) =>
      /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*){1,}$/.test(value) &&
      !value.startsWith('android.') &&
      !value.startsWith('com.android.') &&
      !value.includes('schemas') &&
      !value.includes('http')
  )
  const permissions = Array.from(new Set(strings.filter((value) => value.startsWith('android.permission.'))))
  const components = Array.from(
    new Set(strings.filter((value) => /^[a-zA-Z][\w]*(\.[\w]+){2,}(Activity|Service|Receiver|Provider|Application)$/.test(value)))
  )
  const activities = Array.from(new Set(strings.filter((value) => /Activity$/.test(value) && value.includes('.'))))

  const lines: string[] = []
  lines.push('AndroidManifest.xml está em formato binário (AXML). Strings extraídas:')
  lines.push(`- Pacote provável: ${packageCandidates[0] ?? 'não identificado'}`)
  if (permissions.length > 0) {
    lines.push(`- Permissões (${permissions.length}):`)
    permissions.slice(0, 40).forEach((permission) => lines.push(`  · ${permission}`))
  } else {
    lines.push('- Permissões: nenhuma string android.permission.* encontrada')
  }
  if (components.length > 0) {
    lines.push(`- Componentes declarados (${components.length}):`)
    components.slice(0, 40).forEach((component) => lines.push(`  · ${component}`))
  }
  if (activities.length > 0) {
    lines.push(`- Activities (${activities.length}):`)
    activities.slice(0, 30).forEach((activity) => lines.push(`  · ${activity}`))
  }
  const sdk = strings.filter((value) => /^(\d{1,2})$/.test(value)).slice(0, 0)
  if (sdk.length > 0) lines.push(`- SDKs: ${sdk.join(', ')}`)

  return lines.join('\n')
}

async function processArchive(
  buffer: Buffer,
  name: string,
  kind: 'zip' | 'apk'
): Promise<ProcessedFile> {
  const zip = await JSZip.loadAsync(buffer)
  const entries = Object.values(zip.files ?? {}).filter((entry) => !isSkippedPath(entry?.name ?? ''))

  const root: FileTreeNode = { name: '', path: '', type: 'dir', children: [] }
  let treeCount = 0
  const textCandidates: Array<{ path: string; size: number; entry: JSZip.JSZipObject }> = []
  const dexFiles: string[] = []
  const nativeLibs: string[] = []
  let manifestEntry: JSZip.JSZipObject | null = null
  let totalSize = 0
  let fileCount = 0

  for (const entry of entries) {
    const path = String(entry?.name ?? '').replace(/\\/g, '/')
    if (!path) continue
    const size = entrySize(entry)

    if (entry?.dir) {
      if (treeCount < MAX_TREE_ENTRIES) {
        insertPath(root, path.replace(/\/$/, ''), 0)
        treeCount += 1
      }
      continue
    }

    fileCount += 1
    totalSize += size

    if (treeCount < MAX_TREE_ENTRIES) {
      insertPath(root, path, size)
      treeCount += 1
    }

    const lower = path.toLowerCase()
    const base = lower.split('/').pop() ?? ''
    const extension = extensionOf(base)

    if (kind === 'apk') {
      if (extension === 'dex') dexFiles.push(`${path} (${formatBytes(size)})`)
      if (extension === 'so') nativeLibs.push(`${path} (${formatBytes(size)})`)
      if (base === 'androidmanifest.xml' && !manifestEntry) manifestEntry = entry
    }

    if (isTextLikeExtension(extension) && size > 0 && size <= 900_000) {
      textCandidates.push({ path, size, entry })
    }
  }

  sortTree(root.children ?? [])

  textCandidates.sort((a, b) => relevanceScore(b.path, b.size) - relevanceScore(a.path, a.size))

  const sections: string[] = []
  let usedChars = 0
  let truncated = false
  let includedFiles = 0

  if (kind === 'apk' && manifestEntry) {
    try {
      const manifestBuffer = Buffer.from(await manifestEntry.async('uint8array'))
      const manifestSummary = summarizeManifest(manifestBuffer)
      sections.push(`--- AndroidManifest.xml ---\n${manifestSummary}`)
      usedChars += manifestSummary.length
    } catch (error) {
      console.error('[api/files/process] Falha ao ler o AndroidManifest.xml:', error)
    }
  }

  for (const candidate of textCandidates) {
    if (includedFiles >= MAX_CONTENT_FILES) {
      truncated = true
      break
    }
    if (usedChars >= MAX_CONTEXT_CHARS) {
      truncated = true
      break
    }

    let content = ''
    try {
      const raw = Buffer.from(await candidate.entry.async('uint8array'))
      if (looksBinary(raw)) continue
      content = raw.toString('utf8')
    } catch (error) {
      console.error(`[api/files/process] Falha ao extrair ${candidate.path}:`, error)
      continue
    }

    let body = content
    let cut = false
    if (body.length > MAX_FILE_CHARS) {
      body = `${body.slice(0, MAX_FILE_CHARS)}\n… (conteúdo truncado)`
      cut = true
    }
    const remaining = MAX_CONTEXT_CHARS - usedChars
    if (body.length > remaining) {
      body = `${body.slice(0, Math.max(0, remaining))}\n… (conteúdo truncado)`
      cut = true
      truncated = true
    }

    sections.push(`--- ${candidate.path} (${formatBytes(candidate.size)}${cut ? ', truncado' : ''}) ---\n${body}`)
    usedChars += body.length
    includedFiles += 1
  }

  const technology = kind === 'apk' ? detectApkTechnology(entries.map((entry) => entry?.name ?? '')) : null
  const notes: string[] = []
  if (truncated) {
    notes.push(
      `O conteúdo foi resumido: ${includedFiles} de ${textCandidates.length} arquivos de texto foram incluídos para caber no limite de contexto.`
    )
  }
  if (kind === 'apk') {
    notes.push('O APK é um pacote ZIP: o código compilado (.dex) não é legível como texto, mas a estrutura, os recursos e o manifesto foram extraídos.')
  }

  const summaryParts = [
    kind === 'apk' ? 'APK Android' : 'Arquivo ZIP',
    `${fileCount} arquivos`,
    formatBytes(totalSize),
  ]
  if (technology) summaryParts.push(`tecnologia: ${technology}`)
  if (includedFiles > 0) summaryParts.push(`${includedFiles} arquivos de texto lidos`)
  if (truncated) summaryParts.push('conteúdo resumido para caber no contexto')

  return {
    name,
    size: buffer.length,
    kind,
    extension: extensionOf(name),
    mime: kind === 'apk' ? 'application/vnd.android.package-archive' : 'application/zip',
    summary: summaryParts.join(' · '),
    context: sections.join('\n\n'),
    tree: root.children ?? [],
    fileCount,
    technology,
    truncated,
    notes,
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Importa o arquivo interno: o index.js do pdf-parse roda código de debug quando module.parent é indefinido.
  const pdfModule = await import('pdf-parse/lib/pdf-parse.js')
  const pdfParse = (pdfModule as unknown as { default?: (data: Buffer) => Promise<{ text?: string; numpages?: number }> }).default ??
    (pdfModule as unknown as (data: Buffer) => Promise<{ text?: string; numpages?: number }>)
  const result = await pdfParse(buffer)
  return String(result?.text ?? '').trim()
}

function summarizeCsv(text: string): { summary: string; body: string } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const header = lines[0] ?? ''
  const separator = header.includes(';') && !header.includes(',') ? ';' : ','
  const columns = header.split(separator).length
  const preview = lines.slice(0, 40).join('\n')
  return {
    summary: `CSV com ${Math.max(0, lines.length - 1)} linhas de dados e ${columns} colunas.`,
    body: `Cabeçalho: ${header}\n\nPrimeiras ${Math.min(40, lines.length)} linhas:\n${preview}`,
  }
}

function summarizeJson(text: string): { summary: string; body: string } {
  try {
    const parsed: unknown = JSON.parse(text)
    const pretty = JSON.stringify(parsed, null, 2)
    const isArray = Array.isArray(parsed)
    const keys = parsed && typeof parsed === 'object' && !isArray ? Object.keys(parsed as Record<string, unknown>) : []
    return {
      summary: isArray
        ? `JSON válido com ${(parsed as unknown[]).length} itens na raiz.`
        : `JSON válido com ${keys.length} chaves na raiz.`,
      body: pretty.length > MAX_FILE_CHARS ? `${pretty.slice(0, MAX_FILE_CHARS)}\n… (conteúdo truncado)` : pretty,
    }
  } catch {
    return { summary: 'JSON inválido ou incompleto (não foi possível interpretar).', body: text.slice(0, MAX_FILE_CHARS) }
  }
}

function processSingleText(name: string, buffer: Buffer, kind: ProcessedFile['kind']): ProcessedFile {
  const text = buffer.toString('utf8')
  const extension = extensionOf(name)
  const lineCount = text.split('\n').length
  let summary = `Arquivo ${extension ? extension.toUpperCase() : 'de texto'} com ${lineCount} linhas (${formatBytes(buffer.length)}).`
  let body = text

  if (kind === 'json') {
    const result = summarizeJson(text)
    summary = result.summary
    body = result.body
  } else if (kind === 'csv') {
    const result = summarizeCsv(text)
    summary = result.summary
    body = result.body
  }

  if (body.length > MAX_FILE_CHARS) {
    body = `${body.slice(0, MAX_FILE_CHARS)}\n… (conteúdo truncado)`
  }

  return {
    name,
    size: buffer.length,
    kind,
    extension,
    mime: 'text/plain',
    summary,
    context: `--- ${name} (${formatBytes(buffer.length)}) ---\n${body}`,
    tree: null,
    fileCount: 1,
    technology: null,
    truncated: body.includes('conteúdo truncado'),
    notes: [],
  }
}

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch (error) {
    console.error('[api/files/process] Falha ao ler o formulário:', error)
    return NextResponse.json({ error: 'Não foi possível ler o arquivo enviado.' }, { status: 400 })
  }

  const uploaded = form.get('file')
  if (!(uploaded instanceof File)) {
    return NextResponse.json({ error: 'Nenhum arquivo foi recebido.' }, { status: 400 })
  }

  if (uploaded.size === 0) {
    return NextResponse.json({ error: 'O arquivo está vazio.' }, { status: 400 })
  }

  if (uploaded.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `O arquivo excede o limite de ${formatBytes(MAX_UPLOAD_BYTES)}.` },
      { status: 413 }
    )
  }

  const name = String(uploaded.name ?? 'arquivo')
  const extension = extensionOf(name)
  const kind = fileKindFromName(name, uploaded.type)

  let buffer: Buffer
  try {
    buffer = Buffer.from(await uploaded.arrayBuffer())
  } catch (error) {
    console.error('[api/files/process] Falha ao ler os bytes do arquivo:', error)
    return NextResponse.json({ error: 'Não foi possível ler o conteúdo do arquivo.' }, { status: 400 })
  }

  try {
    if (kind === 'zip' || kind === 'apk') {
      const processed = await processArchive(buffer, name, kind)
      return NextResponse.json(processed)
    }

    if (kind === 'pdf') {
      let text = ''
      try {
        text = await extractPdfText(buffer)
      } catch (error) {
        console.error('[api/files/process] Falha ao extrair texto do PDF:', error)
        return NextResponse.json(
          { error: 'Não foi possível extrair o texto deste PDF. Ele pode estar protegido ou corrompido.' },
          { status: 422 }
        )
      }

      const body = text.length > MAX_FILE_CHARS * 2 ? `${text.slice(0, MAX_FILE_CHARS * 2)}\n… (conteúdo truncado)` : text
      return NextResponse.json({
        name,
        size: buffer.length,
        kind: 'pdf',
        extension,
        mime: 'application/pdf',
        summary: `PDF com ${body.length} caracteres de texto extraído (${formatBytes(buffer.length)}).`,
        context: `--- ${name} (${formatBytes(buffer.length)}) ---\n${body || '(nenhum texto extraído — o PDF pode ser digitalizado)'}`,
        tree: null,
        fileCount: 1,
        technology: null,
        truncated: body.includes('conteúdo truncado'),
        notes: text ? [] : ['O PDF não retornou texto — provavelmente é digitalizado (imagem).'],
      } satisfies ProcessedFile)
    }

    if (kind === 'image') {
      const mime = uploaded.type && uploaded.type.startsWith('image/') ? uploaded.type : `image/${extension || 'png'}`
      const canInline = buffer.length <= MAX_IMAGE_BYTES
      return NextResponse.json({
        name,
        size: buffer.length,
        kind: 'image',
        extension,
        mime,
        summary: `Imagem ${extension.toUpperCase()} (${formatBytes(buffer.length)})${canInline ? '' : ' — grande demais para envio direto ao modelo'}.`,
        context: `--- ${name} (${formatBytes(buffer.length)}) ---\nImagem anexada pelo usuário. Analise o conteúdo visual enviado junto com esta mensagem.`,
        tree: null,
        fileCount: 1,
        technology: null,
        imageDataUrl: canInline ? `data:${mime};base64,${buffer.toString('base64')}` : null,
        truncated: false,
        notes: canInline ? [] : ['A imagem é grande e não foi enviada ao modelo; descreva-a no texto se precisar de análise.'],
      } satisfies ProcessedFile)
    }

    if (kind === 'other' && looksBinary(buffer)) {
      return NextResponse.json(
        { error: 'Este tipo de arquivo é binário e não pode ser lido como texto. Envie código, ZIP, APK, PDF, imagem ou texto.' },
        { status: 415 }
      )
    }

    const textKind = kind === 'other' ? 'text' : kind
    const processed = processSingleText(name, buffer, textKind)
    return NextResponse.json(processed)
  } catch (error) {
    console.error('[api/files/process] Erro inesperado ao processar o arquivo:', error)
    return NextResponse.json(
      { error: 'Erro inesperado ao processar o arquivo. Verifique se ele não está corrompido.' },
      { status: 500 }
    )
  }
}
