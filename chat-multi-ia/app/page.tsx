import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  Download,
  Github,
  HardDrive,
  Layers,
  Monitor,
  Paperclip,
  Server,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

const RELEASES_URL = 'https://github.com/neggoh/multichat/releases/latest'
const REPO_URL = 'https://github.com/neggoh/multichat'
const KEYS_URL = 'https://openrouter.ai/keys'

export const metadata: Metadata = {
  title: 'MultiChat — baixe para Windows ou use no navegador',
  description:
    'Converse com dezenas de modelos gratuitos do OpenRouter em uma única interface e troque de modelo no meio da conversa sem perder o contexto. Versão web e aplicativo para Windows.',
  alternates: { canonical: '/' },
}

const features = [
  {
    icon: Layers,
    title: 'Troca de modelo no meio da conversa',
    text: 'Comece no DeepSeek, continue no Llama, termine no Qwen. O histórico vai junto e cada resposta mostra qual modelo a escreveu.',
  },
  {
    icon: Zap,
    title: 'Só modelos de preço zero',
    text: 'A lista é filtrada pelo OpenRouter para trazer apenas modelos gratuitos de texto — nada de surpresa na fatura.',
  },
  {
    icon: Paperclip,
    title: 'Anexos de verdade',
    text: 'ZIP, APK, PDF, imagem, JSON, XML, CSV e arquivos de código são lidos e resumidos antes de entrar no contexto.',
  },
  {
    icon: HardDrive,
    title: 'Histórico que fica',
    text: 'Na web as conversas vão para o PostgreSQL da sua instalação; no desktop ficam no seu computador.',
  },
  {
    icon: ShieldCheck,
    title: 'Chave fora do navegador',
    text: 'A chave do OpenRouter nunca chega ao JavaScript da página: fica no servidor ou criptografada pelo Windows.',
  },
  {
    icon: Monitor,
    title: 'Interface em português',
    text: 'Tema escuro, Markdown com realce de código e botão de copiar. Sem menu em inglês e sem login.',
  },
]

const steps = [
  {
    title: 'Pegue uma chave gratuita',
    text: 'Crie a chave em openrouter.ai/keys. Ela é o único cadastro necessário.',
  },
  {
    title: 'Escolha onde conversar',
    text: 'Abra a versão web no navegador ou instale o aplicativo para Windows.',
  },
  {
    title: 'Converse e troque de modelo',
    text: 'Envie a pergunta, mude o modelo no seletor do topo e continue de onde parou.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[hsl(172_66%_50%)] shadow-md">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="font-display text-sm font-semibold tracking-tight">MultiChat</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-5 text-[13px] text-muted-foreground sm:flex">
            <a href="#recursos" className="transition-colors hover:text-foreground">
              Recursos
            </a>
            <a href="#como-funciona" className="transition-colors hover:text-foreground">
              Como funciona
            </a>
            <a href="#seguranca" className="transition-colors hover:text-foreground">
              Segurança
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Repositório no GitHub"
              className="hidden rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:block"
            >
              <Github className="h-4 w-4" />
            </a>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/chat">
                Abrir o chat
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11.5px] font-medium text-primary">
              <Zap className="h-3 w-3" />
              Modelos gratuitos do OpenRouter
            </span>

            <h1 className="mt-5 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Uma conversa, <span className="text-gradient">vários modelos de IA</span>
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Converse no navegador ou no aplicativo para Windows, troque de modelo no meio da conversa e mantenha o
              contexto. Sem login, sem assinatura e sem custo por mensagem.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
            <div className="flex flex-col rounded-2xl border border-primary/40 bg-card p-5 shadow-lg">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Monitor className="h-4 w-4" />
              </span>
              <h2 className="mt-3 font-display text-base font-semibold">Versão web</h2>
              <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
                Roda direto no navegador, sem instalar nada. Histórico no banco da instalação e anexos até 40 MB.
              </p>
              <Button asChild className="mt-4 w-full gap-1.5">
                <Link href="/chat">
                  Acessar a versão web
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            <div className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(172_66%_50%)]/15 text-[hsl(172_66%_50%)]">
                <Download className="h-4 w-4" />
              </span>
              <h2 className="mt-3 font-display text-base font-semibold">Aplicativo para Windows</h2>
              <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
                Executável portátil (x64), sem servidor e sem PostgreSQL. A chave fica criptografada pelo Windows.
              </p>
              <Button asChild variant="secondary" className="mt-4 w-full gap-1.5">
                <a href={RELEASES_URL} target="_blank" rel="noreferrer">
                  <Download className="h-3.5 w-3.5" />
                  Baixar para Windows
                </a>
              </Button>
            </div>
          </div>

          <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
            O executável é publicado em{' '}
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
              Releases
            </a>{' '}
            a cada versão. Precisa de uma chave gratuita em{' '}
            <a href={KEYS_URL} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">
              openrouter.ai/keys
            </a>
            .
          </p>
        </section>

        <section id="recursos" className="border-t border-border/60 bg-card/30 py-16">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">O que vem junto</h2>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              Os dois clientes compartilham a mesma experiência; o que muda é onde a chave e o histórico ficam.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon
                return (
                  <div key={feature.title} className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="mt-3 text-[13px] font-semibold">{feature.title}</h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{feature.text}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="py-16">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Como funciona</h2>

            <ol className="mt-8 grid gap-3 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="rounded-xl border border-border/60 bg-card p-4">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <h3 className="mt-3 text-[13px] font-semibold">{step.title}</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="seguranca" className="border-t border-border/60 bg-card/30 py-16">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Onde ficam seus dados</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Nenhum dos dois clientes manda sua chave para o navegador. Na web ela é lida do ambiente do servidor; no
                desktop, do armazenamento criptografado do Windows (DPAPI) e usada apenas no processo principal.
              </p>

              <ul className="mt-5 space-y-2.5">
                {[
                  'Conversas filtradas pelo identificador do navegador: a conversa de outro cliente responde 404.',
                  'Nenhum .env é versionado; o modelo está em chat-multi-ia/.env.example.',
                  'O desktop roda com contextIsolation, sandbox e Content-Security-Policy restritiva.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(172_66%_50%)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <h3 className="flex items-center gap-2 text-[13px] font-semibold">
                <Server className="h-4 w-4 text-primary" />
                Rodar a versão web na sua máquina
              </h3>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-muted/60 p-3 text-[11.5px] leading-relaxed">
                <code>{`cd chat-multi-ia
npm install
cp .env.example .env
npm run db:push
npm run dev`}</code>
              </pre>
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
                Precisa de Node.js 20 ou superior e de um PostgreSQL acessível. O aplicativo para Windows não precisa de
                nenhum dos dois.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-[11.5px] text-muted-foreground sm:flex-row sm:px-6">
          <p>MultiChat — modelos gratuitos do OpenRouter em uma só conversa.</p>
          <div className="flex items-center gap-4">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
              GitHub
            </a>
            <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
              Releases
            </a>
            <Link href="/chat" className="transition-colors hover:text-foreground">
              Abrir o chat
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
