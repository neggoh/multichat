'use client'

import { useEffect, useRef } from 'react'
import { ArrowUp, CornerDownLeft, Paperclip, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCEPT_ATTRIBUTE } from '@/lib/file-types'
import { FilePreview, type AttachmentStatus } from './file-preview'
import type { FileKind } from '@/lib/file-types'

interface ComposerAttachment {
  name: string
  size: number
  kind: FileKind
  status: AttachmentStatus
  progress: number
  error?: string | null
}

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  isStreaming: boolean
  disabled: boolean
  attachment?: ComposerAttachment | null
  onPickFile: (file: File) => void
  onRemoveAttachment: () => void
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  disabled,
  attachment,
  onPickFile,
  onRemoveAttachment,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`
  }, [value])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (!isStreaming && !disabled) onSend()
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onPickFile(file)
    event.target.value = ''
  }

  const canSend = (value.trim().length > 0 || attachment?.status === 'ready') && !isStreaming && !disabled

  return (
    <div className="space-y-2">
      {attachment ? (
        <FilePreview
          name={attachment?.name ?? 'arquivo'}
          size={attachment?.size ?? 0}
          kind={attachment?.kind ?? 'other'}
          status={attachment?.status ?? 'ready'}
          progress={attachment?.progress ?? 0}
          error={attachment?.error ?? null}
          onRemove={onRemoveAttachment}
        />
      ) : null}

      <div className="flex items-end gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-md transition-colors focus-within:border-primary/50">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isStreaming}
          aria-label="Anexar arquivo"
          title="Anexar arquivo (ZIP, APK, PDF, imagem, código…)"
          className={cn(
            'mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
            isStreaming
              ? 'cursor-not-allowed text-muted-foreground/40'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Pergunte qualquer coisa ou anexe um arquivo para analisar…"
          aria-label="Mensagem"
          className="max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-1.5 py-2.5 text-[14.5px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Parar geração"
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Enviar mensagem"
            className={cn(
              'mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all',
              canSend
                ? 'bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-95'
                : 'cursor-not-allowed bg-muted text-muted-foreground'
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <CornerDownLeft className="h-3 w-3" />
        <span>
          <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd> envia ·{' '}
          <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Shift + Enter</kbd> quebra linha ·{' '}
          arraste arquivos para a janela
        </span>
      </p>
    </div>
  )
}
