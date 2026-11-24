# Chat Multi-IA — verificação, correções e preparo para o GitHub

Data: 24/11/2026 · Pasta pronta para versionar: `chat-multi-ia/` · ZIP: `entrega_chat_multi_ia_github.zip`

## Resultado

| Verificação | Antes | Depois |
|---|---|---|
| `npm install` | falhava (conflito de peer com React 19) | ✅ instala (`.npmrc` com `legacy-peer-deps`) |
| `tsc --noEmit` | 2 erros (`input-otp` ausente) | ✅ 0 erros |
| `eslint .` | 12 erros | ✅ 0 erros (5 avisos de estilo) |
| `next build` | não verificado | ✅ compila e gera as 8 rotas |
| `next start` | não verificado | ✅ `/` responde 200 |

## O que estava quebrado e foi corrigido

1. **`components/ui/input-otp.tsx` sem dependência** — o componente importava `input-otp`, que não estava no `package.json`. Adicionado `input-otp@1.2.4`.
2. **`app/api/files/download` — path traversal no ZIP** — o caminho enviado pelo navegador era limpo por `sanitizeFileName`, que *preserva* segmentos `..` (é a função usada para caminhos de arquivos extraídos). Um pedido com `../../etc/x.txt` gerava `etc/x.txt` dentro do ZIP. Agora o caminho só é usado se for relativo de verdade; caso contrário, entra apenas o nome do arquivo.
3. **`app/api/files/process` — variável `module`** — `const module = await import('pdf-parse/...')` dispara o erro `@next/next/no-assign-module-variable` do Next. Renomeada para `pdfModule`.
4. **`app/layout.tsx` — script de terceiros** — havia `<script src="https://apps.abacus.ai/chatllm/appllm-lib.js">` (biblioteca do ambiente de desenvolvimento original) carregado em toda página. Removido: um app independente não deve carregar script de outra plataforma.
5. **`instrumentation-client.js`** — reportava erros do navegador para `/__abacus/client-error`, rota que não existe fora daquele ambiente. Removido.
6. **`next.config.js`** — `outputFileTracingRoot: '/'` (caminho Linux) quebraria o build em Windows; agora é `path.resolve(__dirname)`. `allowedDevOrigins` estava fixo em um subdomínio de preview de outra plataforma: virou a variável `ALLOWED_DEV_ORIGINS`. `typescript.ignoreBuildErrors` foi removido — os erros de tipo agora aparecem no build/CI.
7. **`components/chat/chat-app.tsx` — render em cascata** — o `clientId` era lido do `localStorage` num efeito e devolvido por `setState`, forçando um segundo ciclo de efeitos. Agora usa inicializador preguiçoso (`useState(readClientId)`), lido uma única vez no cliente.
8. **`components/ui/command.tsx`** — interface vazia (`CommandDialogProps extends DialogProps {}`) trocada por `type`.
9. **`tailwind.config.ts`** — `require('tailwindcss-animate')` virou `import`.
10. **Código morto removido** — `components/viz/*`, `public/abacus-viz/*` (runtime de dashboards de outra plataforma, ~90 arquivos, nenhuma importação), `types/next-auth.d.ts` (next-auth não é dependência), `scripts/safe-seed.ts` (apontava para um `scripts/seed.ts` inexistente), `.abacus.donotdelete`, `.env` vazio e `tsconfig.tsbuildinfo` (cache de build).

## Organização para o GitHub

- `README.md` com funcionalidades, stack, passo a passo, tabela de variáveis de ambiente e estrutura.
- `.env.example` (o `.env` real fica fora do repositório — `.gitignore` cobre `.env`, `.env.*` e `next-env.d.ts`).
- `LICENSE` (MIT, com o titular como `[Titular dos direitos]` para você preencher).
- `.github/workflows/ci.yml`: instala, gera o Prisma Client, roda typecheck, lint e build a cada push/PR.
- `package.json` renomeado para `chat-multi-ia`, com scripts `typecheck`, `db:push`, `db:generate`, `db:studio` e dependências de desenvolvimento que estavam misturadas (autoprefixer, tailwindcss) corrigidas.
- `.npmrc` com `legacy-peer-deps` para o conflito React 19 × peers antigos.

## Como subir

```bash
cd chat-multi-ia
git init -b main
git add .
git commit -m "feat: Chat Multi-IA — Next.js 16 + OpenRouter + Prisma"
git remote add origin https://github.com/SEU-USUARIO/chat-multi-ia.git
git push -u origin main
```

Antes de rodar: preencha `LICENSE` com seu nome e crie o repositório vazio no GitHub.

## Pendências conhecidas (não bloqueiam)

- 5 avisos de lint, todos cosméticos (imports não usados em `components/ui/*`).
- O build exige `DATABASE_URL` e `OPENROUTER_API_KEY` definidos (mesmo que fictícios, como no CI); sem banco real, as rotas de histórico respondem com erro tratado e o chat mostra a mensagem de chave ausente.
- Sem testes automatizados: o projeto não tinha suíte; o CI cobre tipos, lint e build.
