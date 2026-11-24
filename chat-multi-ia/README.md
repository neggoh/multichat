# multichat — Chat Multi-IA

Converse com dezenas de modelos **gratuitos** do [OpenRouter](https://openrouter.ai) em uma única interface — e troque de modelo no meio da conversa sem perder o histórico. Interface 100% em português do Brasil, tema escuro, anexos de código/APK/imagem e reconstrução de projeto em ZIP.

## Funcionalidades

- **Troca de modelo no meio da conversa**: o histórico inteiro é reenviado a cada mensagem, então você pode começar no Llama e continuar no DeepSeek.
- **Somente modelos gratuitos**: `/api/models` filtra o catálogo do OpenRouter por `pricing.prompt === "0" && pricing.completion === "0"` e por saída em texto; modelos com entrada de imagem são marcados como `supportsVision`.
- **Histórico por navegador**: um `clientId` (UUID) no `localStorage` escopa as conversas no banco — sem cadastro, sem login.
- **Anexos**: upload de arquivos e ZIPs (até 40 MB) com árvore de pastas, leitura de PDF, extração de metadados de APK (pacote, permissões, componentes, tecnologia: Flutter, React Native, Unity, Xamarin, Cordova) e imagens para modelos com visão.
- **Download do projeto gerado**: blocos de código marcados com `// arquivo: caminho` viram um ZIP com a estrutura original de pastas.
- **Streaming SSE** próprio (`meta` / `delta` / `error` / `done`) com persistência no Prisma ao final.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 16 (App Router) + React 19 |
| Estilo | Tailwind CSS 3 + shadcn/ui (Radix) |
| Dados | Prisma 6 + PostgreSQL |
| IA | OpenRouter (`/api/v1/chat/completions`, streaming) |
| Markdown | `react-markdown` + `remark-gfm` + `react-syntax-highlighter` |

## Como rodar

Pré-requisitos: **Node.js ≥ 20.9** e um **PostgreSQL** acessível.

```bash
# 1. dependências
npm install

# 2. variáveis de ambiente
cp .env.example .env      # preencha DATABASE_URL e OPENROUTER_API_KEY

# 3. banco
npm run db:push           # cria as tabelas Conversation e Message

# 4. desenvolvimento
npm run dev               # http://localhost:3000
```

Produção:

```bash
npm run build
npm start
```

## Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
|----------|-------------|----------------|
| `DATABASE_URL` | sim | Conexão PostgreSQL usada pelo Prisma. |
| `OPENROUTER_API_KEY` | sim | Chave lida **somente no servidor** em `app/api/chat`. Nunca chega ao navegador. |
| `NEXTAUTH_URL` | não | URL pública (metadados, `HTTP-Referer` do OpenRouter). Padrão `http://localhost:3000`. |
| `ALLOWED_DEV_ORIGINS` | não | Origens extras liberadas no `next dev`, separadas por vírgula. |

## Estrutura

```
app/
  api/chat/            proxy de streaming para o OpenRouter + persistência
  api/models/          catálogo de modelos gratuitos (com fallback local)
  api/conversations/   listar, carregar, renomear e apagar conversas
  api/files/process/   upload e análise de arquivos/ZIP/APK/PDF
  api/files/download/  gera ZIP do projeto a partir dos blocos de código
  layout.tsx, page.tsx, globals.css, manifest.ts
components/chat/       interface do chat (sidebar, composer, bolhas, preview)
components/ui/         shadcn/ui
lib/                   tipos, acesso ao banco, parsing de anexos e de código
prisma/schema.prisma   Conversation e Message
```

## Segurança

- A chave do OpenRouter **nunca** é gravada no banco, no `.env` do repositório ou no `localStorage` — ela só existe no servidor.
- Caminhos de arquivo vindos do navegador são higienizados antes de entrar no ZIP (`sanitizeFileName`), então `..` não escapa da raiz do arquivo gerado.
- `.env` está no `.gitignore`; use `.env.example` como modelo.
- Conversas são sempre filtradas pelo `clientId` do navegador: ler, renomear ou apagar uma conversa de outro cliente retorna 404.

## Licença

MIT.
