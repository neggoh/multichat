# MultiChat (Windows)

Aplicativo de desktop para Windows que reúne vários modelos de IA em uma só conversa. Fala direto com a API do OpenRouter, sem servidor intermediário: o processo principal do Electron faz as requisições e o renderer só recebe o texto.

- A chave do OpenRouter é guardada criptografada pelo Windows (DPAPI, via `safeStorage` do Electron).
- O histórico das conversas fica no `localStorage` do próprio app, neste computador.
- Anexos: arraste arquivos para a janela ou use o botão 📎. O processo principal lê e resume o conteúdo e o renderer recebe apenas o texto.

## Modelos

O seletor lista **todos** os modelos de texto do OpenRouter (hoje ~450), com os gratuitos no topo e marcados. A caixa **só grátis** (ligada por padrão) restringe a lista aos modelos de preço zero; desligue-a para usar os pagos, que aparecem com o preço por milhão de tokens de entrada no chip ao lado do seletor. Modelos com visão aceitam imagem anexada.

## IA local, sem limite

O seletor **OpenRouter / IA local** no topo troca a origem das respostas. No modo local o app fala com qualquer servidor compatível com OpenAI rodando na sua máquina — llama.cpp, Ollama ou LM Studio — sem chave, sem cota e sem internet.

Para montar tudo com um comando (baixa o llama.cpp e um modelo GGUF pequeno):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\local-ai.ps1
```

Depois, no app: seletor do topo → **IA local** → **Testar e usar**. O endereço padrão é `http://127.0.0.1:8080/v1` e pode ser trocado no diálogo da chave.

Modelos disponíveis no script:

| Nome | Tamanho | Para quê |
|------|---------|----------|
| `qwen2.5-0.5b` | 0,4 GB | respostas rápidas em máquina fraca |
| `qwen2.5-1.5b` | 1,1 GB | uso geral (padrão) |
| `qwen2.5-3b` | 1,9 GB | uso geral com mais qualidade |
| `qwen2.5-coder-1.5b` | 1,1 GB | código, rápido |
| `qwen2.5-coder-3b` | 1,9 GB | código, equilíbrio |
| `qwen2.5-coder-7b` | 4,7 GB | **código, o mais forte** — criação e correção de projetos |

Para programar, use o Coder 7B:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\local-ai.ps1 -Model qwen2.5-coder-7b
```

O Qwen2.5-Coder foi treinado em 5,5 trilhões de tokens de código e é bem melhor que o modelo generalista em gerar, explicar e corrigir código. Em CPU sem AVX2, como um i7-3770, o 7B roda em ~4 threads e responde devagar (alguns tokens por segundo), mas funciona; o 3B é o meio-termo para máquinas assim.

Se você já usa Ollama, basta apontar para `http://127.0.0.1:11434/v1`; no LM Studio, `http://127.0.0.1:1234/v1`.


## Anexos

| Tipo | O que é extraído |
|------|------------------|
| ZIP | árvore de pastas + conteúdo dos arquivos de texto mais relevantes (até 120 mil caracteres) |
| APK / AAB | estrutura, manifesto (pacote, permissões, componentes), tecnologia detectada e arquivos de texto |
| PDF | texto extraído (PDFs digitalizados não têm texto) |
| Imagem | enviada ao modelo como conteúdo multimodal (PNG, JPG, WEBP, GIF, BMP, SVG, AVIF) |
| Código, JSON, XML, CSV, texto | conteúdo, com resumo de linhas/colunas e truncamento seguro |

Limites: 40 MB por arquivo, 6 arquivos por mensagem, 8 MB por imagem enviada ao modelo. `node_modules`, `.git`, `dist`, `build` e pastas equivalentes são ignorados dentro de ZIP/APK. O data URL da imagem fica só em memória — depois de fechar o app o anexo continua listado, mas a imagem não é reenviada.

## Requisitos

- Node.js 20 ou superior
- Windows 10 ou 11 (x64)

## Como rodar

```sh
npm install
npm start
```

## Como gerar o executável

```sh
npm run dist
```

Gera a versão portable em `dist/` (`MultiChat-<versão>-portable.exe`).

```sh
npm run dist:installer
```

Gera o instalador NSIS em `dist/` (`MultiChat-Setup-<versão>.exe`).

## Onde obter a chave

Crie uma chave gratuita em <https://openrouter.ai/keys> e cole no diálogo do app (botão da chave, no topo). A lista de modelos aparece mesmo antes de configurar a chave, porque o catálogo do OpenRouter é público.

## Segurança

- A chave nunca entra no renderer: ela é lida e usada apenas no processo principal.
- A janela usa uma Content-Security-Policy restritiva (`default-src 'none'`, sem `connect-src`).
- `contextIsolation` e `sandbox` ativados, com `nodeIntegration` desligado; o renderer só acessa o que o preload expõe.
- Os anexos são lidos no processo principal a partir do caminho do arquivo; o renderer nunca recebe o arquivo bruto, só o texto resumido.
