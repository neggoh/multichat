# Executáveis

Binários prontos para uso, versionados junto do código para download direto pelo repositório.

| Arquivo | Versão | Tamanho | O que é |
|---------|--------|---------|---------|
| `MultiChat-1.0.3-portable.exe` | 1.0.3 | 72,8 MB | Aplicativo portátil (x64). Não instala nada: execute e use. |

A 1.0.1 corrigiu o overlay de arrastar-e-soltar que cobria a janela inteira; o anexo agora é acionado só pelo botão 📎 ao lado do campo de mensagem.

A 1.0.2 trata os erros de requisição do OpenRouter com mensagens claras e mostra a cota diária no topo:

- **429 `free-models-per-day`** — o OpenRouter limita a 50 requisições gratuitas por dia por conta. A mensagem agora diz que o limite foi atingido, quando renova e que 10 créditos liberam 1000 requisições/dia.
- **402** — modelo pago sem créditos: a mensagem orienta a escolher um modelo gratuito no seletor.
- **429 por minuto** — repetido automaticamente até duas vezes quando ainda há cota.
- Chip **grátis hoje: N/50** ao lado do seletor, em verde quando há cota e âmbar quando zerou.

A 1.0.3 adiciona **IA local sem limite**: o seletor do topo alterna entre OpenRouter e IA local, que fala com qualquer servidor compatível com OpenAI na sua máquina (llama.cpp, Ollama, LM Studio). Sem chave, sem cota e sem internet. O script `multichat-windows/scripts/local-ai.ps1` baixa o llama.cpp e um modelo GGUF e sobe o servidor em `http://127.0.0.1:8080/v1`.

Modelos de código: o script aceita `-Model qwen2.5-coder-7b` (4,7 GB), `qwen2.5-coder-3b` (1,9 GB) e `qwen2.5-coder-1.5b` (1,1 GB). Os arquivos `.gguf` ficam apenas na máquina do usuário e não são versionados.

Gerado com `npm run dist` em `multichat-windows/`. Para regerar:

```sh
cd multichat-windows
npm install
npm run dist
```

O instalador NSIS (`npm run dist:installer`) não é versionado aqui por tamanho; gere localmente quando precisar.

A versão web fica em `chat-multi-ia/` — veja o [README da raiz](../README.md).
