'use client'

import { Bug, GitCompareArrows, Lightbulb, Paperclip, Sparkles, SquareCode } from 'lucide-react'

interface EmptyStateProps {
  onPick: (prompt: string) => void
}

const suggestions = [
  {
    icon: SquareCode,
    title: 'Criar um componente',
    text: 'Um carrinho de compras em React com TypeScript',
    prompt: 'Crie um componente React de carrinho de compras em TypeScript, com lista de itens, quantidade e total. Explique as decisões principais.',
  },
  {
    icon: Bug,
    title: 'Resolver um bug',
    text: 'Erro de “cannot read properties of undefined”',
    prompt: 'Estou recebendo o erro "Cannot read properties of undefined (reading \'map\')" em um componente React que busca dados de uma API. Como investigar e corrigir?',
  },
  {
    icon: Lightbulb,
    title: 'Explicar um conceito',
    text: 'Programação funcional com exemplos em JS',
    prompt: 'Explique programação funcional com exemplos práticos em JavaScript, comparando com o estilo imperativo.',
  },
  {
    icon: GitCompareArrows,
    title: 'Comparar opções',
    text: 'PostgreSQL ou MongoDB para um app de chat',
    prompt: 'Compare PostgreSQL e MongoDB para armazenar o histórico de um aplicativo de chat. Traga uma tabela comparativa e uma recomendação.',
  },
]

export function EmptyState({ onPick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-8 text-center sm:py-14">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[hsl(172_66%_50%)] shadow-lg">
        <Sparkles className="h-7 w-7 text-white" />
      </div>

      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        Uma conversa, <span className="text-gradient">vários modelos</span>
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Escolha um modelo gratuito no topo, envie sua pergunta e troque de modelo quando quiser — o histórico continua aqui.
      </p>

      <div className="mt-4 flex max-w-lg flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1">
          <Paperclip className="h-3 w-3 text-primary" /> anexe arquivos
        </span>
        {['ZIP', 'APK', 'PDF', 'Imagem', 'Código', 'JSON', 'XML', 'CSV'].map((label) => (
          <span key={label} className="rounded-full bg-muted/70 px-2 py-1 font-medium">
            {label}
          </span>
        ))}
      </div>

      <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
        {suggestions.map((suggestion) => {
          const Icon = suggestion.icon
          return (
            <button
              key={suggestion.title}
              type="button"
              onClick={() => onPick(suggestion.prompt)}
              className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{suggestion.title}</span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
                  {suggestion.text}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
