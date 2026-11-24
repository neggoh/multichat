export interface ExtractedCodeBlock {
  id: string
  language: string
  code: string
  fileName: string
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ts: 'ts',
  typescript: 'ts',
  tsx: 'tsx',
  js: 'js',
  javascript: 'js',
  jsx: 'jsx',
  mjs: 'mjs',
  cjs: 'cjs',
  py: 'py',
  python: 'py',
  java: 'java',
  kt: 'kt',
  kotlin: 'kt',
  kts: 'kts',
  swift: 'swift',
  c: 'c',
  h: 'h',
  cpp: 'cpp',
  'c++': 'cpp',
  cs: 'cs',
  csharp: 'cs',
  go: 'go',
  rb: 'rb',
  ruby: 'rb',
  php: 'php',
  rs: 'rs',
  rust: 'rs',
  dart: 'dart',
  sh: 'sh',
  bash: 'sh',
  shell: 'sh',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  xml: 'xml',
  yaml: 'yml',
  yml: 'yml',
  md: 'md',
  markdown: 'md',
  gradle: 'gradle',
  toml: 'toml',
  ini: 'ini',
  txt: 'txt',
  text: 'txt',
  vue: 'vue',
  svelte: 'svelte',
  lua: 'lua',
  r: 'r',
  pl: 'pl',
  smali: 'smali',
}

const FILE_COMMENT_PATTERNS = [
  /^\s*\/\/\s*(?:arquivo|file|filename|caminho|path)\s*:\s*(.+)$/i,
  /^\s*#\s*(?:arquivo|file|filename|caminho|path)\s*:\s*(.+)$/i,
  /^\s*\/\*\s*(?:arquivo|file|filename|caminho|path)\s*:\s*(.+?)\s*\*\//i,
  /^\s*<!--\s*(?:arquivo|file|filename|caminho|path)\s*:\s*(.+?)\s*-->/i,
  /^\s*--\s*(?:arquivo|file|filename|caminho|path)\s*:\s*(.+)$/i,
]

const BARE_PATH_PATTERN = /^\s*(?:\/\/|#|--)\s*([\w./@-]+\.[A-Za-z0-9]{1,8})\s*$/

export function sanitizeFileName(value: string): string {
  const raw = String(value ?? '').trim().replace(/^["'`]+|["'`]+$/g, '')
  const withoutRoot = raw.replace(/^[./\\]+/, '')
  const segments = withoutRoot
    .split(/[\\/]+/)
    .map((segment) => segment.replace(/[^\w.\-@()+ ]/g, '').trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
  if (segments.length === 0) return ''
  return segments.join('/')
}

export function fileNameFromCode(code: string, language: string, meta?: string | null): string {
  const metaText = String(meta ?? '')
  const metaMatch = /(?:title|filename|file|name)="([^"]+)"/i.exec(metaText) ?? /(?:title|filename|file|name)=([^\s]+)/i.exec(metaText)
  if (metaMatch?.[1]) {
    const fromMeta = sanitizeFileName(metaMatch[1])
    if (fromMeta) return fromMeta
  }

  const firstLines = String(code ?? '').split('\n').slice(0, 3)
  for (const line of firstLines) {
    for (const pattern of FILE_COMMENT_PATTERNS) {
      const match = pattern.exec(line)
      if (match?.[1]) {
        const candidate = sanitizeFileName(match[1])
        if (candidate && candidate.includes('.')) return candidate
      }
    }
    const bare = BARE_PATH_PATTERN.exec(line)
    if (bare?.[1]) {
      const candidate = sanitizeFileName(bare[1])
      if (candidate && candidate.includes('.')) return candidate
    }
  }

  const extension = LANGUAGE_EXTENSIONS[String(language ?? '').toLowerCase()] ?? 'txt'
  return `arquivo.${extension}`
}

export function extractCodeBlocks(markdown: string, messageId: string): ExtractedCodeBlock[] {
  const source = String(markdown ?? '')
  const blocks: ExtractedCodeBlock[] = []
  const fence = /```([^\n`]*)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null = fence.exec(source)
  let index = 0

  while (match) {
    const info = String(match[1] ?? '').trim()
    const body = String(match[2] ?? '').replace(/\n$/, '')
    const language = (info.split(/\s+/)[0] ?? '').toLowerCase()
    const meta = info.slice(language.length).trim()

    if (body.trim().length > 0) {
      blocks.push({
        id: `${messageId}-${index}`,
        language: language || 'text',
        code: body,
        fileName: fileNameFromCode(body, language, meta),
      })
      index += 1
    }

    match = fence.exec(source)
  }

  return blocks
}

export function dedupeCodeBlocks(blocks: ExtractedCodeBlock[]): ExtractedCodeBlock[] {
  const map = new Map<string, ExtractedCodeBlock>()
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block?.fileName) continue
    map.set(block.fileName, block)
  }
  return Array.from(map.values())
}
