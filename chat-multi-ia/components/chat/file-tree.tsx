'use client'

import { useState } from 'react'
import { ChevronRight, FileCode2, FileText, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBytes, type FileTreeNode } from '@/lib/file-types'

function TreeRow({ node, depth }: { node: FileTreeNode; depth: number }) {
  const isDir = node?.type === 'dir'
  const children = Array.isArray(node?.children) ? node.children : []
  const [open, setOpen] = useState(depth < 1)

  const label = (
    <span className="truncate font-mono text-[12px] text-foreground/85">{node?.name ?? ''}</span>
  )

  if (!isDir) {
    return (
      <div
        className="flex items-center gap-1.5 rounded px-1.5 py-[3px] hover:bg-white/[0.04]"
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        {label}
        {typeof node?.size === 'number' && node.size > 0 ? (
          <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] text-muted-foreground/60">
            {formatBytes(node.size)}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-[3px] text-left hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn('h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform', open && 'rotate-90')}
        />
        {open ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        )}
        <span className="truncate font-mono text-[12px] font-medium text-foreground">{node?.name ?? ''}</span>
        <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] text-muted-foreground/60">
          {children.length}
        </span>
      </button>

      {open && children.length > 0 ? (
        <div>
          {children.map((child, index) => (
            <TreeRow key={`${child?.path ?? index}-${index}`} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function FileTree({ nodes, className }: { nodes: FileTreeNode[] | null | undefined; className?: string }) {
  const list = Array.isArray(nodes) ? nodes : []

  if (list.length === 0) {
    return (
      <p className="flex items-center gap-1.5 px-2 py-2 text-[11.5px] text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        Estrutura não disponível.
      </p>
    )
  }

  return (
    <div className={cn('max-h-[260px] overflow-auto rounded-lg bg-black/25 p-1.5', className)}>
      {list.map((node, index) => (
        <TreeRow key={`${node?.path ?? index}-${index}`} node={node} depth={0} />
      ))}
    </div>
  )
}
