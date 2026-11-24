'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Eye, Monitor, RotateCcw, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ExtractedCodeBlock } from '@/lib/code-blocks'
import { buildProjectPreview, type PreviewDocument } from '@/lib/project-preview'

interface ProjectPreviewProps {
  files: ExtractedCodeBlock[]
  isStreaming: boolean
  downloading: boolean
  onDownload: () => void
}

export function ProjectPreview({ files, isStreaming, downloading, onDownload }: ProjectPreviewProps) {
  const [open, setOpen] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [entry, setEntry] = useState('')
  const [revision, setRevision] = useState(0)
  const [preview, setPreview] = useState<PreviewDocument | null>(null)
  const [error, setError] = useState('')
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([])
  const frame = useRef<HTMLIFrameElement>(null)
  const pages = useMemo(() => files.filter((file) => /\.html?$/i.test(file.fileName)), [files])
  const selected = pages.some((page) => page.fileName === entry)
    ? entry
    : (pages.find((page) => /(^|\/)index\.html?$/i.test(page.fileName)) ?? pages[0])?.fileName ?? ''

  // Sincroniza a prévia com a revisão atual dos arquivos; o setState é o resultado
  // do buildProjectPreview, não um ciclo de render.
  useEffect(() => {
    if (!open || isStreaming) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(null)
    setError('')
    setRuntimeErrors([])
    if (!selected) return
    try {
      setPreview(buildProjectPreview(files, selected))
    } catch (cause) {
      console.error('[project-preview] Falha ao preparar a prévia:', cause)
      setError(cause instanceof Error ? cause.message : 'Não foi possível preparar a prévia.')
    }
  }, [files, selected, open, isStreaming, revision])

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow || event.data?.type !== 'project-preview-error') return
      const message = String(event.data.message ?? '').slice(0, 1000)
      console.error('[project-preview]', message)
      setRuntimeErrors((previous) => previous.includes(message) ? previous : [...previous, message].slice(-8))
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  if (!files.length) return null

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-primary/25 bg-card shadow-lg" aria-label="Pré-visualização do projeto">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <Button variant="secondary" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <X /> : <Eye />}{open ? 'Fechar prévia' : 'Pré-visualizar projeto'}
        </Button>
        <span className="text-xs text-muted-foreground">Confira antes de baixar</span>
      </div>
      {open && (
        <div className="border-t border-border/60">
          <p className="px-3 pt-3 text-xs leading-relaxed text-muted-foreground">
            Prévia dos arquivos gerados nesta conversa, usando a última versão de cada nome de arquivo.
            Executa HTML, CSS e JavaScript simples em ambiente isolado. Não executa APKs, backend ou projetos React/TypeScript que precisam de compilação.
            APIs, recursos externos e arquivos originais não incluídos nas respostas não são carregados.
          </p>
          {isStreaming ? <p className="p-3 text-sm text-muted-foreground" role="status">Aguarde a resposta terminar para atualizar a prévia.</p> : null}
          {!selected ? (
            <p className="p-4 text-sm text-foreground">Nenhuma página HTML disponível. Peça à IA: “Crie uma versão de demonstração em HTML, CSS e JavaScript puro para pré-visualização”.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 p-3">
                <select aria-label="Página para visualizar" value={selected} onChange={(event) => setEntry(event.target.value)} disabled={isStreaming} className="h-9 min-w-0 max-w-full flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground">
                  {pages.map((page) => <option key={page.fileName} value={page.fileName}>{page.fileName}</option>)}
                </select>
                <Button variant={mobile ? 'ghost' : 'secondary'} size="icon-sm" onClick={() => setMobile(false)} aria-label="Visualização ampla" aria-pressed={!mobile}><Monitor /></Button>
                <Button variant={mobile ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setMobile(true)} aria-label="Visualização de celular" aria-pressed={mobile}><Smartphone /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setRevision((value) => value + 1)} disabled={isStreaming} aria-label="Reiniciar prévia"><RotateCcw /></Button>
              </div>
              {error ? <p role="alert" className="px-3 pb-3 text-sm text-destructive">{error}</p> : null}
              {preview?.warnings.length ? <div className="px-3 pb-3 text-xs text-muted-foreground">{preview.warnings.map((warning) => <p key={warning} className="break-words">{warning}</p>)}</div> : null}
              {preview && !isStreaming ? (
                <div className="overflow-auto bg-muted p-2 sm:p-3">
                  <iframe
                    key={`${selected}-${revision}`}
                    ref={frame}
                    title="Resultado do projeto gerado"
                    sandbox="allow-scripts"
                    referrerPolicy="no-referrer"
                    srcDoc={preview.html}
                    className="mx-auto block h-[480px] max-w-full rounded-md border-0 bg-white"
                    style={{ width: mobile ? 390 : '100%' }}
                  />
                </div>
              ) : null}
              {runtimeErrors.length ? <div role="status" className="p-3 text-xs text-destructive"><p className="mb-1 font-semibold">Avisos de execução</p>{runtimeErrors.map((message, index) => <p className="break-words" key={index}>{message}</p>)}</div> : null}
            </>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3">
            <span className="text-xs text-muted-foreground">A prévia não altera os arquivos. O histórico continua sendo salvo automaticamente.</span>
            <Button size="sm" onClick={onDownload} disabled={downloading || isStreaming}><Download />{downloading ? 'Preparando…' : 'Baixar projeto ZIP'}</Button>
          </div>
        </div>
      )}
    </section>
  )
}
