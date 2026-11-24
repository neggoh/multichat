'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, Loader2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { formatContextLength, providerLabel } from '@/lib/format'
import type { ModelInfo } from '@/lib/chat-types'

interface ModelSelectorProps {
  models: ModelInfo[]
  value: string
  onChange: (modelId: string) => void
  loading: boolean
  source: 'openrouter' | 'fallback'
}

export function ModelSelector({ models, value, onChange, loading, source }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const safeModels = Array.isArray(models) ? models : []
  const current = safeModels.find((model) => model?.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 rounded-full border border-border/70 bg-card/80 py-1.5 pl-3 pr-2.5 text-left shadow-sm transition-all hover:border-primary/50 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Selecionar modelo de IA"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : (
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="min-w-0 truncate text-[13px] font-medium">
            {current?.name ?? (value || 'Selecionar modelo')}
          </span>
          <Badge
            variant="secondary"
            className="hidden shrink-0 border-transparent bg-[hsl(172_66%_50%)]/15 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-[hsl(172_66%_45%)] sm:inline-flex dark:text-[hsl(172_66%_60%)]"
          >
            Grátis
          </Badge>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[min(92vw,430px)] p-0">
        <Command>
          <CommandInput placeholder="Buscar modelo gratuito…" />
          <CommandList className="max-h-[330px]">
            <CommandEmpty>Nenhum modelo encontrado.</CommandEmpty>
            <CommandGroup heading={source === 'fallback' ? 'Modelos (lista local)' : 'Modelos gratuitos do OpenRouter'}>
              {safeModels.map((model) => (
                <CommandItem
                  key={model?.id}
                  value={`${model?.name ?? ''} ${model?.id ?? ''}`}
                  onSelect={() => {
                    onChange(model?.id ?? '')
                    setOpen(false)
                  }}
                  className="flex items-start gap-2"
                >
                  <Check
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 text-primary',
                      value === model?.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{model?.name ?? model?.id}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {providerLabel(model?.provider)} · {model?.id}
                    </span>
                  </span>
                  {model?.context_length ? (
                    <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {formatContextLength(model.context_length)}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
