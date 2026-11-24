'use client'

import { useState } from 'react'
import { ChevronDown, FolderTree, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBytes, kindLabel, type ParsedAttachment } from '@/lib/file-types'
import { FileKindIcon } from './file-icon'
import { FileTree } from './file-tree'

export function AttachmentCard({ attachment }: { attachment: ParsedAttachment }) {
  const [open, setOpen] = useState(false)
  const tree = Array.isArray(attachment?.tree) ? attachment.tree : []
  const hasTree = tree.length > 0

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-white/15 bg-black/20">
      <div className="flex items-center gap-2.5 p-2.5">
        <FileKindIcon kind={attachment?.kind ?? 'other'} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-[12.5px] font-semibold text-primary-foreground">
              {attachment?.name ?? 'arquivo'}
            </p>
            <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-primary-foreground/90">
              {kindLabel(attachment?.kind ?? 'other')}
            </span>
            {attachment?.technology ? (
              <span className="shrink-0 rounded bg-emerald-400/20 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-200">
                {attachment.technology}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-primary-foreground/70">
            {formatBytes(attachment?.size)}
            {typeof attachment?.fileCount === 'number' ? ` · ${attachment.fileCount} arquivos` : ''}
          </p>
        </div>

        {hasTree ? (
          <button
            type="button"
            onClick={() => setOpen((previous) => !previous)}
            className="flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium text-primary-foreground/90 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-expanded={open}
          >
            <FolderTree className="h-3.5 w-3.5" />
            {open ? 'Ocultar' : 'Estrutura'}
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </button>
        ) : null}
      </div>

      {attachment?.summary ? (
        <p className="flex items-start gap-1.5 border-t border-white/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-primary-foreground/75">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
          <span>{attachment.summary}</span>
        </p>
      ) : null}

      {open && hasTree ? (
        <div className="border-t border-white/10 bg-black/30 p-2">
          <FileTree nodes={tree} />
        </div>
      ) : null}
    </div>
  )
}
