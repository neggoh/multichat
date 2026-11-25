# MultiChat (Windows)

Aplicativo de desktop para Windows que reúne vários modelos de IA em uma só conversa. Fala direto com a API do OpenRouter, sem servidor intermediário: o processo principal do Electron faz as requisições e o renderer só recebe o texto.

- A chave do OpenRouter é guardada criptografada pelo Windows (DPAPI, via `safeStorage` do Electron).
- O histórico das conversas fica no `localStorage` do próprio app, neste computador.
- Anexos: arraste arquivos para a janela ou use o botão 📎. O processo principal lê e resume o conteúdo e o renderer recebe apenas o texto.

## Modelos

O seletor lista **todos** os modelos de texto do OpenRouter (hoje ~450), com os gratuitos no topo e marcados. A caixa **só grátis** (ligada por padrão) restringe a lista aos modelos de preço zero; desligue-a para usar os pagos, que aparecem com o preço por milhão de tokens de entrada no chip ao lado do seletor. Modelos com visão aceitam imagem anexada.

## Prévia de projeto e download

O botão **▤** abre o painel de projeto ao lado do chat. Ele lê os blocos de código das respostas do assistente e monta um projeto navegável:

- aba **Prévia** — o projeto completo rodando num servidor HTTP local: os arquivos são gravados em disco nas pastas corretas e o iframe carrega a URL, então CSS, JS, imagens e caminhos relativos funcionam como no site publicado; dá para clicar e testar antes de hospedar;
- abas por arquivo — o código de cada arquivo gerado (`index.html`, `styles.css`, `script.js`…), em modo VS Code: linha por linha, numerada, com contagem de linhas, linguagem e botão **Copiar**;
- **Atualizar** — relê as respostas da conversa atual;
- **Baixar ZIP** — exporta todos os arquivos com diálogo nativo de salvar.

No chat o código não aparece: cada bloco vira uma nota compacta com o nome do arquivo, o número de linhas e o botão **Ver na prévia**, que abre o painel já naquele arquivo. A conversa fica só com a descrição e os passos.

Os nomes vêm de comentários no início do bloco (`// src/App.tsx`, `<!-- index.html -->`) ou do padrão da linguagem, com sufixo `-2`, `-3` quando repetem.

O botão **🧰** lista as ferramentas disponíveis e abre a pasta de modelos ou a de scripts no Explorer.

## GPU

Com uma placa NVIDIA, marque **usar GPU** no diálogo da chave: o app sobe o `llama-server` com `-ngl 99` e usa o build CUDA. Sem NVIDIA, a caixa fica desabilitada e o processamento continua na CPU. O script também detecta sozinho:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\local-ai.ps1 -Model qwen2.5-coder-7b -Gpu
```

Uma GPU de 8 GB comporta o Coder 7B inteiro na VRAM, o que costuma multiplicar a velocidade por 5 a 15 em relação a esta CPU.

## IA local, sem limite

O seletor **OpenRouter / IA local** no topo troca a origem das respostas. No modo local o app fala com qualquer servidor compatível com OpenAI rodando na sua máquina — llama.cpp, Ollama ou LM Studio — sem chave, sem cota e sem internet.

O app lista **todos os `.gguf`** da pasta de modelos e, ao trocar de modelo no seletor, encerra o servidor anterior e sobe o novo com o contexto configurado (8 mil tokens por padrão). Servidores órfãos de execuções anteriores são encerrados antes, e o processo filho morre junto com o app.

O histórico e os anexos são cortados para caber no contexto do modelo, tanto na interface quanto no processo principal — um APK grande é resumido em vez de estourar o limite.

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

O Qwen2.5-Coder foi treinado em 5,5 trilhões de tokens de código e é bem melhor que o modelo generalista em gerar, explicar e corrigir código.

### Velocidade medida nesta máquina

Medições reais com `llama.cpp` (build de CPU), prompt fixo e 128 tokens de resposta, num i7-3770 (4 núcleos/8 threads, sem AVX2, sem GPU utilizável):

| Modelo | Threads | Tokens/s |
|--------|---------|----------|
| `qwen2.5-1.5b` | 4 | **16,7** |
| `qwen2.5-1.5b` | 8 | 14,7 |
| `qwen2.5-coder-3b` | 4 | 8,7 |
| `qwen2.5-coder-3b` | 8 | **9,0** |
| `qwen2.5-coder-7b` | 4 | 4,0 |
| `qwen2.5-coder-7b` | 8 | **4,2** |

O tamanho do modelo domina: o 1.5B é ~4x mais rápido que o 7B. Threads rendem pouco — 8 threads ajudam o 3B e o 7B (~5%) e atrapalham o 1.5B. O padrão do script é 8.

Para acelerar de verdade, nesta ordem:

1. **Modelo menor** — `-Model qwen2.5-coder-3b` dobra a velocidade em relação ao 7B, com pouca perda em código comum.
2. **Contexto menor** — `-Context 2048` em vez de 4096 reduz o custo por token.
3. **Quantização mais leve** — um GGUF `q4_0` em vez de `q4_k_m` costuma render 10–20% em CPU.
4. **GPU** — a HD 4000 não tem backend útil no llama.cpp; só uma placa dedicada mudaria o patamar.
5. **Trabalho pesado no OpenRouter** — use o modelo local para o dia a dia sem cota e o OpenRouter para tarefas grandes.

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
