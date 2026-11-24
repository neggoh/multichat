'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { Check, Code2, Copy, Download } from 'lucide-react'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface CodeBlockProps {
  code: string
  language: string
  fileName?: string | null
}

export function CodeBlock({ code, language, fileName }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [Highlighter, setHighlighter] = useState<ComponentType<any> | null>(null)

  useEffect(() => {
    let active = true
    import('react-syntax-highlighter')
      .then((mod: any) => {
        const Prism = mod?.Prism ?? mod?.default
        if (!active || typeof Prism !== 'function') return
        const Component = (props: any) => <Prism style={vscDarkPlus} {...props} />
        setHighlighter(() => Component)
      })
      .catch((error: unknown) => {
        console.error('[code-block] Falha ao carregar o destaque de sintaxe:', error)
      })
    return () => {
      active = false
    }
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code ?? '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      console.error('[code-block] Falha ao copiar o código:', error)
    }
  }

  const handleDownload = () => {
    try {
      const safeName = String(fileName ?? '').split('/').pop() || `arquivo.${language || 'txt'}`
      const blob = new Blob([code ?? ''], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = safeName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    } catch (error) {
      console.error('[code-block] Falha ao baixar o arquivo:', error)
    }
  }

  const safeLanguage = (language ?? 'text').toLowerCase()
  const displayName = String(fileName ?? '').trim()

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border/70 bg-[#0b0b14] shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] bg-white/[0.03] px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Code2 className="h-3.5 w-3.5 shrink-0" />
          {displayName ? (
            <span className="truncate font-mono text-[11px] text-foreground/80" title={displayName}>
              {displayName}
            </span>
          ) : (
            <span className="uppercase tracking-wider">{safeLanguage || 'texto'}</span>
          )}
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={copied ? 'Código copiado' : 'Copiar código'}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Baixar ${displayName || 'arquivo'}`}
            title={displayName ? `Baixar ${displayName}` : 'Baixar este arquivo'}
          >
            <Download className="h-3.5 w-3.5" />
            Baixar
          </button>
        </div>
      </div>

      {Highlighter ? (
        <Highlighter
          language={safeLanguage}
          style={vscDarkPlus}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '0.9rem 1rem',
            background: 'transparent',
            fontSize: '13px',
            lineHeight: 1.65,
          }}
          codeTagProps={{ style: { fontFamily: 'var(--font-mono), ui-monospace, monospace' } }}
        >
          {code ?? ''}
        </Highlighter>
      ) : (
        <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-foreground/90">
          <code>{code ?? ''}</code>
        </pre>
      )}
    </div>
  )
}
