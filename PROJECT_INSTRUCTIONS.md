# Chat Multi-IA

## Objetivo
Chat multi-modelo via OpenRouter (openrouter.ai), com troca de modelo no meio da conversa sem perder o histórico. Interface 100% em português do Brasil.

## Decisões de arquitetura
- **Chave de API do OpenRouter vive apenas no `localStorage`** do navegador (`chat-multi-ia:api-key`). Nunca gravar a chave no banco, em `.env` ou no código. O client envia a chave no corpo do POST para `/api/chat`, que a repassa ao OpenRouter.
- Identidade sem login: `clientId` (UUID) gerado no navegador e salvo em `chat-multi-ia:client-id`; escopa as conversas no banco.
- Modelo escolhido persistido em `chat-multi-ia:model`.
- `/api/models` busca `https://openrouter.ai/api/v1/models`, filtra `pricing.prompt === "0" && pricing.completion === "0"` e apenas modelos texto→texto (usa `architecture.output_modalities`); fallback em `FALLBACK_MODELS` (`lib/chat-types.ts`).
- `/api/chat` faz proxy com streaming SSE próprio (`data: {"type":"meta"|"delta"|"error"|"done"}`), acumula o texto e persiste user+assistant no Prisma ao final. Conversas criadas e não concluídas são apagadas para não deixar histórico vazio.
- Prisma: `Conversation` (clientId, title, model, updatedAt) e `Message` (conversationId, role, content, model). Índices em `[clientId, updatedAt]` e `[conversationId, createdAt]`.

## Design
- Dark theme fixo (`<html class="dark">`, ThemeProvider `defaultTheme="dark"`, `enableSystem={false}`).
- Paleta: fundo `245 26% 5%`, card `245 22% 10.5%`, primária violeta `264 84% 67%`, acento teal `172 66% 50%` (usado em gradientes e badges "Grátis").
- Fontes: DM Sans (corpo), Plus Jakarta Sans (display), JetBrains Mono (código).
- Layout: sidebar de histórico 280px (Sheet no mobile) + header sticky com seletor de modelo + área de chat `max-w-[820px]` + composer fixo.
- Markdown com `react-markdown` + `remark-gfm`; código com `react-syntax-highlighter` (Prism, tema `vscDarkPlus`) importado dinamicamente no client, com botão "Copiar".
- Todo o app renderiza após `mounted` (skeleton no SSR) para evitar mismatch de hidratação com localStorage.

## Arquitetura e decisões duráveis

- **Chave do OpenRouter é server-side**: lida de `process.env.OPENROUTER_API_KEY` em `/api/chat`. Não existe mais Key Gate nem armazenamento de chave no `localStorage` (os componentes `api-key-gate.tsx` e `api-key-dialog.tsx` foram removidos). Nunca reintroduzir campo de chave no cliente.
- **Anexos persistidos no conteúdo da mensagem**: o texto do usuário é seguido por um bloco `<anexo nome="…" tipo="…" tamanho="…" arquivos="…" tech="…">` contendo `RESUMO:`, `ESTRUTURA DE PASTAS:` e `CONTEUDO DOS ARQUIVOS:`. `lib/file-types.ts` expõe `buildAttachmentBlock` / `parseAttachmentContent` (o parse reconstrói a árvore a partir do texto indentado, então o tree view sobrevive ao reload).
- **Convenção de nome de arquivo nos blocos de código**: o system prompt exige que a primeira linha de cada bloco seja `// arquivo: caminho`, `# arquivo: …`, `<!-- arquivo: … -->` ou `-- arquivo: …`. `lib/code-blocks.ts` (`extractCodeBlocks`, `fileNameFromCode`, `dedupeCodeBlocks`) usa isso para montar o ZIP do projeto. Sem esse comentário, o arquivo cai no fallback `arquivo.<ext>`.
- **Rotas de arquivos**: `POST /api/files/process` (multipart, campo `file`) devolve `ProcessedFile`; `POST /api/files/download` recebe `{ files: [{path, content}], name }` e devolve ZIP com caminhos sanitizados. Limite de upload: 40 MB. Contexto enviado à IA: até ~120k caracteres, priorizando arquivos de entrada (package.json, manifest, index/main/app).
- **`pdf-parse` é dependência externa do servidor**: declarada em `next.config.user.json` (`serverExternalPackages` + `outputFileTracingIncludes` para `/api/files/process`). Importar sempre por `pdf-parse/lib/pdf-parse.js` (o `index.js` roda código de debug quando `module.parent` é indefinido).
- **APK**: tratado como ZIP; `AndroidManifest.xml` é AXML binário, então as strings são extraídas heuristicamente (pacote, permissões, componentes) e a tecnologia é detectada por bibliotecas nativas (Flutter, React Native, Xamarin, Unity, Cordova).
- **Modelos**: `/api/models` mantém apenas modelos gratuitos com saída em texto, mas inclui modelos com entrada de imagem e expõe `supportsVision`. Imagens só são enviadas ao modelo quando `supportsVision` é verdadeiro; caso contrário o anexo vai apenas como referência textual.
- **Design**: dark theme existente (tokens `card`, `muted`, `primary` roxo + verde-água). Cards de anexo usam `bg-black/20` sobre a bolha roxa do usuário; badges de tipo por arquivo em `components/chat/file-icon.tsx`.
