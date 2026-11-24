'use client'

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fileNameFromCode } from '@/lib/code-blocks'
import { CodeBlock } from './code-block'

const components: Components = {
  h1: (props: any) => (
    <h1 className="mb-2 mt-5 font-display text-lg font-semibold tracking-tight first:mt-0">{props?.children}</h1>
  ),
  h2: (props: any) => (
    <h2 className="mb-2 mt-5 font-display text-base font-semibold tracking-tight first:mt-0">{props?.children}</h2>
  ),
  h3: (props: any) => (
    <h3 className="mb-1.5 mt-4 text-sm font-semibold first:mt-0">{props?.children}</h3>
  ),
  h4: (props: any) => (
    <h4 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{props?.children}</h4>
  ),
  p: (props: any) => <p className="mb-3 leading-relaxed last:mb-0">{props?.children}</p>,
  ul: (props: any) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{props?.children}</ul>,
  ol: (props: any) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{props?.children}</ol>,
  li: (props: any) => <li className="leading-relaxed [&>p]:mb-1">{props?.children}</li>,
  strong: (props: any) => <strong className="font-semibold text-foreground">{props?.children}</strong>,
  em: (props: any) => <em className="italic">{props?.children}</em>,
  blockquote: (props: any) => (
    <blockquote className="mb-3 border-l-2 border-primary/60 bg-primary/5 py-1 pl-3 text-muted-foreground last:mb-0">
      {props?.children}
    </blockquote>
  ),
  a: (props: any) => (
    <a
      href={props?.href ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
    >
      {props?.children}
    </a>
  ),
  hr: () => <hr className="my-4 border-border/70" />,
  table: (props: any) => (
    <div className="my-3 w-full overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full border-collapse text-left text-[13px]">{props?.children}</table>
    </div>
  ),
  thead: (props: any) => <thead className="bg-muted/60">{props?.children}</thead>,
  th: (props: any) => (
    <th className="whitespace-nowrap px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
      {props?.children}
    </th>
  ),
  td: (props: any) => <td className="border-t border-border/60 px-3 py-2 align-top">{props?.children}</td>,
  pre: (props: any) => <>{props?.children}</>,
  code: (props: any) => {
    const className = typeof props?.className === 'string' ? props.className : ''
    const raw = String(props?.children ?? '')
    const match = /language-([\w+#.-]+)/.exec(className)
    const isBlock = Boolean(match) || raw.includes('\n')

    if (isBlock) {
      const language = match?.[1] ?? 'text'
      const meta = typeof props?.node?.data?.meta === 'string' ? props.node.data.meta : ''
      const code = raw.replace(/\n$/, '')
      return <CodeBlock language={language} code={code} fileName={fileNameFromCode(code, language, meta)} />
    }

    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{raw}</code>
    )
  },
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="text-[14.5px] leading-relaxed text-foreground/90 [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content ?? ''}
      </ReactMarkdown>
    </div>
  )
}
