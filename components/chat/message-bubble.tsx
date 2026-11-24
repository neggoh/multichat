'use client'

import { useState } from 'react'
import { Check, Copy, Sparkles, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/chat-types'
import { parseAttachmentContent } from '@/lib/file-types'
import { AttachmentCard } from './attachment-card'
import { MarkdownContent } from './markdown-content'

interface MessageBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
  modelName?: string
}

export function MessageBubble({ message, isStreaming = false, modelName }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message?.role === 'user'
  const rawContent = message?.content ?? ''
  const parsed = isUser ? parseAttachmentContent(rawContent) : { text: rawContent, attachment: null }
  const content = parsed?.text ?? rawContent
  const attachment = parsed?.attachment ?? null
  const showTyping = !isUser && isStreaming && content.trim().length === 0

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      console.error('[message-bubble] Falha ao copiar a mensagem:', error)
    }
  }

  return (
    <div className={cn('flex w-full gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[hsl(172_66%_50%)] shadow-sm">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}

      <div className={cn('group min-w-0 max-w-[88%] sm:max-w-[82%]')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 shadow-sm',
            isUser
              ? 'rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-bl-md border border-border/60 bg-card text-card-foreground'
          )}
        >
          {isUser ? (
            <div>
              {attachment ? <AttachmentCard attachment={attachment} /> : null}
              {content.trim().length > 0 ? (
                <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed [overflow-wrap:anywhere]">
                  {content}
                </p>
              ) : null}
            </div>
          ) : showTyping ? (
            <div className="flex items-center gap-1.5 py-0.5" aria-label="O modelo está digitando">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: '0.15s' }} />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-primary" style={{ animationDelay: '0.3s' }} />
              <span className="ml-1.5 text-xs text-muted-foreground">digitando…</span>
            </div>
          ) : (
            <div className={cn(isStreaming && 'stream-caret')}>
              <MarkdownContent content={content} />
            </div>
          )}
        </div>

        <div
          className={cn(
            'mt-1 flex items-center gap-2 px-1 text-[11px] text-muted-foreground',
            isUser ? 'justify-end' : 'justify-start'
          )}
        >
          {!isUser && modelName ? <span className="truncate">{modelName}</span> : null}
          {!isUser && content.trim().length > 0 ? (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 rounded px-1 py-0.5 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="Copiar resposta"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          ) : null}
          {isUser ? (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" /> você
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
