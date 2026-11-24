'use client'

import { Loader2, MessageSquare, Plus, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/format'
import type { ConversationSummary } from '@/lib/chat-types'

interface ConversationSidebarProps {
  conversations: ConversationSummary[]
  activeId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNew: () => void
}

export function ConversationSidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onDelete,
  onNew,
}: ConversationSidebarProps) {
  const items = Array.isArray(conversations) ? conversations : []

  return (
    <div className="flex h-full flex-col bg-card/40">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[hsl(172_66%_50%)] shadow-md">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold tracking-tight">Chat Multi-IA</p>
          <p className="truncate text-[11px] text-muted-foreground">Modelos gratuitos do OpenRouter</p>
        </div>
      </div>

      <div className="px-3">
        <Button className="w-full justify-start gap-2" onClick={onNew}>
          <Plus className="h-4 w-4" />
          Nova conversa
        </Button>
      </div>

      <div className="mt-5 flex-1 overflow-y-auto px-3 pb-3">
        <p className="px-1 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Histórico
        </p>

        {loading && items.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando conversas…
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
            Nenhuma conversa salva ainda. Envie a primeira mensagem para começar o histórico.
          </p>
        ) : (
          <div className="space-y-1">
            {items.map((conversation) => {
              const active = conversation?.id === activeId
              return (
                <div
                  key={conversation?.id}
                  className={cn(
                    'group flex items-center rounded-lg transition-colors',
                    active ? 'bg-accent' : 'hover:bg-accent/60'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(conversation?.id ?? '')}
                    className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-left"
                  >
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">
                        {conversation?.title ?? 'Conversa'}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {conversation?.messageCount ?? 0} msg · {formatRelativeTime(conversation?.updatedAt ?? '')}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(conversation?.id ?? '')}
                    aria-label={`Apagar conversa ${conversation?.title ?? ''}`}
                    className="mr-1.5 shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 p-3">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-[hsl(172_66%_50%)]" />
            Chave protegida no servidor
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            A chave do OpenRouter fica no servidor e nunca é exposta no navegador.
          </p>
        </div>
      </div>
    </div>
  )
}
