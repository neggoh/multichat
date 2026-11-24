'use client'

import { AlertCircle, Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBytes, kindLabel, type FileKind } from '@/lib/file-types'
import { FileKindIcon } from './file-icon'

export type AttachmentStatus = 'uploading' | 'processing' | 'ready' | 'error'

interface FilePreviewProps {
  name: string
  size: number
  kind: FileKind
  status: AttachmentStatus
  progress: number
  error?: string | null
  onRemove: () => void
}

export function FilePreview({ name, size, kind, status, progress, error, onRemove }: FilePreviewProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(Number(progress ?? 0))))
  const busy = status === 'uploading' || status === 'processing'

  return (
    <div className="rounded-xl border border-border/60 bg-card p-2.5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <FileKindIcon kind={kind ?? 'other'} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[12.5px] font-medium text-foreground">{name ?? 'arquivo'}</p>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              {kindLabel(kind ?? 'other')}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{formatBytes(size)}</span>
            <span aria-hidden>·</span>
            {status === 'ready' ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <Check className="h-3 w-3" /> pronto para enviar
              </span>
            ) : status === 'error' ? (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="h-3 w-3" /> falhou
              </span>
            ) : (
              <span className="flex items-center gap-1 text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
                {status === 'uploading' ? `enviando ${safeProgress}%` : 'processando conteúdo…'}
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover arquivo anexado"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {busy ? (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full bg-gradient-to-r from-primary to-[hsl(172_66%_50%)] transition-all duration-300',
              status === 'processing' && 'animate-pulse'
            )}
            style={{ width: `${status === 'processing' ? 100 : safeProgress}%` }}
          />
        </div>
      ) : null}

      {error ? <p className="mt-1.5 text-[11px] leading-snug text-destructive">{error}</p> : null}
    </div>
  )
}
