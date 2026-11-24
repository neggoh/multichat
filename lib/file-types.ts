export type FileKind = 'zip' | 'apk' | 'pdf' | 'image' | 'code' | 'json' | 'xml' | 'csv' | 'text' | 'other'

export interface FileTreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  size?: number
  children?: FileTreeNode[]
}

export interface ProcessedFile {
  name: string
  size: number
  kind: FileKind
  extension: string
  mime: string
  summary: string
  context: string
  tree?: FileTreeNode[] | null
  fileCount?: number | null
  technology?: string | null
  imageDataUrl?: string | null
  truncated?: boolean
  notes?: string[]
}

export const CODE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'java', 'kt', 'kts', 'swift', 'c', 'h', 'cpp', 'cc', 'hpp',
  'cs', 'go', 'rb', 'php', 'rs', 'dart', 'scala', 'sh', 'bash', 'sql', 'lua', 'pl', 'r', 'vue', 'svelte',
  'gradle', 'groovy', 'm', 'mm', 'asm', 'smali', 'proto', 'graphql', 'gql', 'toml', 'ini', 'env', 'bat', 'ps1',
]

export const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'log', 'yml', 'yaml', 'cfg', 'conf', 'properties', 'gitignore', 'editorconfig', 'lock',
]

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif']

export const ACCEPTED_EXTENSIONS = [
  'zip', 'apk', 'aab', 'jar', 'pdf',
  ...IMAGE_EXTENSIONS,
  ...CODE_EXTENSIONS,
  ...TEXT_EXTENSIONS,
  'json', 'xml', 'csv', 'html', 'htm', 'css', 'scss', 'sass', 'less',
]

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(',')

export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024

export function extensionOf(name: string): string {
  const safe = String(name ?? '')
  const base = safe.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function fileKindFromName(name: string, mime?: string | null): FileKind {
  const extension = extensionOf(name)
  const safeMime = String(mime ?? '').toLowerCase()

  if (extension === 'zip') return 'zip'
  if (extension === 'apk' || extension === 'aab') return 'apk'
  if (extension === 'pdf') return 'pdf'
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image'
  if (safeMime.startsWith('image/')) return 'image'
  if (extension === 'json') return 'json'
  if (extension === 'xml' || extension === 'plist' || extension === 'svg') return 'xml'
  if (extension === 'csv' || extension === 'tsv') return 'csv'
  if (CODE_EXTENSIONS.includes(extension)) return 'code'
  if (extension === 'html' || extension === 'htm' || extension === 'css' || extension === 'scss' || extension === 'less') return 'code'
  if (TEXT_EXTENSIONS.includes(extension)) return 'text'
  if (safeMime.startsWith('text/')) return 'text'
  return 'other'
}

export function kindLabel(kind: FileKind): string {
  switch (kind) {
    case 'zip':
      return 'ZIP'
    case 'apk':
      return 'APK'
    case 'pdf':
      return 'PDF'
    case 'image':
      return 'Imagem'
    case 'code':
      return 'Código'
    case 'json':
      return 'JSON'
    case 'xml':
      return 'XML'
    case 'csv':
      return 'CSV'
    case 'text':
      return 'Texto'
    default:
      return 'Arquivo'
  }
}

export function formatBytes(bytes?: number | null): string {
  const value = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function treeToText(nodes: FileTreeNode[] | null | undefined, depth = 0): string {
  const list = Array.isArray(nodes) ? nodes : []
  let output = ''
  for (const node of list) {
    if (!node?.name) continue
    output += `${'  '.repeat(depth)}${node.name}${node.type === 'dir' ? '/' : ''}\n`
    if (node.children && node.children.length > 0) {
      output += treeToText(node.children, depth + 1)
    }
  }
  return output
}

export function textToTree(text: string): FileTreeNode[] {
  const roots: FileTreeNode[] = []
  const stack: Array<{ node: FileTreeNode; depth: number }> = []
  const lines = String(text ?? '').split('\n')

  for (const line of lines) {
    if (!line.trim()) continue
    const indent = line.length - line.trimStart().length
    const depth = Math.max(0, Math.floor(indent / 2))
    const raw = line.trim()
    const isDir = raw.endsWith('/')
    const name = isDir ? raw.slice(0, -1) : raw
    if (!name) continue

    const node: FileTreeNode = { name, path: name, type: isDir ? 'dir' : 'file' }

    while (stack.length > 0 && (stack[stack.length - 1]?.depth ?? 0) >= depth) stack.pop()

    const parent = stack[stack.length - 1]
    if (!parent) {
      roots.push(node)
    } else {
      const parentNode = parent.node
      parentNode.children = [...(parentNode.children ?? []), node]
      node.path = `${parentNode.path}/${name}`
    }

    if (isDir) stack.push({ node, depth })
  }

  return roots
}

export interface ParsedAttachment {
  name: string
  kind: FileKind
  size: number
  fileCount: number | null
  technology: string | null
  summary: string
  tree: FileTreeNode[] | null
}

export function buildAttachmentBlock(file: ProcessedFile): string {
  const attributes = [
    `nome="${escapeAttribute(file?.name ?? 'arquivo')}"`,
    `tipo="${file?.kind ?? 'other'}"`,
    `tamanho="${Math.max(0, Math.round(Number(file?.size ?? 0)))}"`,
  ]
  if (typeof file?.fileCount === 'number') attributes.push(`arquivos="${file.fileCount}"`)
  if (file?.technology) attributes.push(`tech="${escapeAttribute(file.technology)}"`)

  const parts: string[] = [`<anexo ${attributes.join(' ')}>`]
  parts.push(`RESUMO: ${String(file?.summary ?? '').replace(/\s+/g, ' ').trim()}`)

  const tree = Array.isArray(file?.tree) ? file.tree : []
  if (tree.length > 0) {
    parts.push('ESTRUTURA DE PASTAS:')
    parts.push(treeToText(tree).trimEnd())
  }

  const context = String(file?.context ?? '').trim()
  if (context) {
    parts.push('CONTEUDO DOS ARQUIVOS:')
    parts.push(context)
  }

  parts.push('</anexo>')
  return parts.join('\n')
}

function escapeAttribute(value: string): string {
  return String(value ?? '').replace(/"/g, '&quot;').replace(/[<>]/g, '')
}

export function parseAttachmentContent(content: string): { text: string; attachment: ParsedAttachment | null } {
  const raw = String(content ?? '')
  const openMatch = /<anexo\s([^>]*)>/i.exec(raw)
  if (!openMatch || typeof openMatch.index !== 'number') {
    return { text: raw, attachment: null }
  }

  const startIndex = openMatch.index
  const visible = raw.slice(0, startIndex).trimEnd()
  const closeIndex = raw.lastIndexOf('</anexo>')
  const inner = closeIndex > startIndex ? raw.slice(startIndex + openMatch[0].length, closeIndex) : raw.slice(startIndex + openMatch[0].length)

  const attributes: Record<string, string> = {}
  const attributeRegex = /([\w-]+)="([^"]*)"/g
  let attributeMatch: RegExpExecArray | null = attributeRegex.exec(openMatch[1] ?? '')
  while (attributeMatch) {
    attributes[attributeMatch[1]] = attributeMatch[2]
    attributeMatch = attributeRegex.exec(openMatch[1] ?? '')
  }

  const summaryMatch = /RESUMO:\s*([^\n]*)/i.exec(inner)
  const structureMatch = /ESTRUTURA DE PASTAS:\s*\n([\s\S]*?)(?:\nCONTEUDO DOS ARQUIVOS:|$)/i.exec(inner)

  const kindRaw = String(attributes.tipo ?? 'other')
  const allowedKinds: FileKind[] = ['zip', 'apk', 'pdf', 'image', 'code', 'json', 'xml', 'csv', 'text', 'other']
  const kind: FileKind = allowedKinds.includes(kindRaw as FileKind) ? (kindRaw as FileKind) : 'other'

  return {
    text: visible,
    attachment: {
      name: String(attributes.nome ?? 'arquivo'),
      kind,
      size: Number(attributes.tamanho ?? 0) || 0,
      fileCount: attributes.arquivos ? Number(attributes.arquivos) || null : null,
      technology: attributes.tech ?? null,
      summary: String(summaryMatch?.[1] ?? '').trim(),
      tree: structureMatch?.[1] ? textToTree(structureMatch[1]) : null,
    },
  }
}
