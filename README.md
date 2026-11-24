# MultiChat

Dois clientes para conversar com os modelos **gratuitos** do [OpenRouter](https://openrouter.ai) em uma única interface — e trocar de modelo no meio da conversa sem perder o histórico. Interface em português do Brasil, tema escuro.

| Pasta | O que é | Como rodar |
|-------|---------|-----------|
| [`chat-multi-ia/`](chat-multi-ia/README.md) | Aplicativo web: Next.js 16 + React 19 + Prisma/PostgreSQL. Chave no servidor, histórico no banco, anexos de código/ZIP/APK/PDF/imagem e download do projeto gerado em ZIP. | `npm install` · `npm run db:push` · `npm run dev` |
| [`multichat-windows/`](multichat-windows/README.md) | Aplicativo desktop Windows (Electron): fala direto com o OpenRouter, sem servidor. Chave guardada criptografada pelo Windows (DPAPI) e histórico local. | `npm install` · `npm start` · `npm run dist` |

## Site

A versão web serve uma página de apresentação em `/` com dois caminhos: **Acessar a versão web**
(`/chat`, o aplicativo) e **Baixar para Windows** (Releases do GitHub). O aplicativo em si fica em
`/chat`; o `manifest.webmanifest` também aponta para lá.

O executável é publicado pelo workflow [`release.yml`](.github/workflows/release.yml): ao empurrar
uma tag `v*`, o runner do Windows roda `npm run dist` e anexa o `.exe` portátil à release.

```bash
git tag v1.0.0
git push origin v1.0.0
```


## Qual escolher

- **Web** — quer o histórico em um banco, vários navegadores apontando para a mesma instalação, anexos grandes e a chave compartilhada sem expô-la ao navegador.
- **Desktop** — quer usar sem instalar servidor nem PostgreSQL; a chave fica só na sua máquina, criptografada pelo Windows.

## Requisitos

- Node.js ≥ 20.9 (o desktop pede ≥ 20).
- Uma chave do OpenRouter ([openrouter.ai/keys](https://openrouter.ai/keys)) — os modelos listados são apenas os de preço zero.
- PostgreSQL acessível, somente para a versão web.

## Segurança

- A chave do OpenRouter nunca vai para o navegador: na versão web ela fica em `OPENROUTER_API_KEY` no servidor; na versão desktop, criptografada pelo DPAPI e usada apenas no processo principal do Electron.
- Conversas são sempre filtradas pelo `clientId` do navegador — ler, renomear ou apagar a conversa de outro cliente responde 404.
- Nenhum `.env` é versionado; use `chat-multi-ia/.env.example` como modelo.

## Licença

MIT — veja [`chat-multi-ia/LICENSE`](chat-multi-ia/LICENSE).
