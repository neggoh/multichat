'use client'

import {
  Braces,
  File as FileIcon,
  FileArchive,
  FileCode2,
  FileCode,
  FileText,
  Image as ImageIcon,
  Smartphone,
  Table2,
} from 'lucide-react'
import type { FileKind } from '@/lib/file-types'
import { cn } from '@/lib/utils'

const KIND_STYLES: Record<FileKind, { color: string; background: string }> = {
  zip: { color: 'text-amber-300', background: 'bg-amber-400/10' },
  apk: { color: 'text-emerald-300', background: 'bg-emerald-400/10' },
  pdf: { color: 'text-rose-300', background: 'bg-rose-400/10' },
  image: { color: 'text-sky-300', background: 'bg-sky-400/10' },
  code: { color: 'text-violet-300', background: 'bg-violet-400/10' },
  json: { color: 'text-yellow-300', background: 'bg-yellow-400/10' },
  xml: { color: 'text-orange-300', background: 'bg-orange-400/10' },
  csv: { color: 'text-teal-300', background: 'bg-teal-400/10' },
  text: { color: 'text-slate-300', background: 'bg-slate-400/10' },
  other: { color: 'text-muted-foreground', background: 'bg-muted' },
}

function iconFor(kind: FileKind) {
  switch (kind) {
    case 'zip':
      return FileArchive
    case 'apk':
      return Smartphone
    case 'pdf':
      return FileText
    case 'image':
      return ImageIcon
    case 'code':
      return FileCode2
    case 'json':
      return Braces
    case 'xml':
      return FileCode
    case 'csv':
      return Table2
    case 'text':
      return FileText
    default:
      return FileIcon
  }
}

export function FileKindIcon({
  kind,
  className,
  withBackground = true,
}: {
  kind: FileKind
  className?: string
  withBackground?: boolean
}) {
  const Icon = iconFor(kind ?? 'other')
  const style = KIND_STYLES[kind ?? 'other'] ?? KIND_STYLES.other

  if (!withBackground) {
    return <Icon className={cn('h-4 w-4', style.color, className)} />
  }

  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
        style.background,
        className
      )}
    >
      <Icon className={cn('h-4 w-4', style.color)} />
    </span>
  )
}

export function kindAccent(kind: FileKind): string {
  return (KIND_STYLES[kind ?? 'other'] ?? KIND_STYLES.other).color
}
