# Executáveis

Binários prontos para uso, versionados junto do código para download direto pelo repositório.

| Arquivo | Versão | Tamanho | O que é |
|---------|--------|---------|---------|
| `MultiChat-1.1.2-portable.exe` | 1.1.2 | 72,8 MB | Aplicativo portátil (x64). Não instala nada: execute e use. |

A 1.0.1 corrigiu o overlay de arrastar-e-soltar que cobria a janela inteira; o anexo agora é acionado só pelo botão 📎 ao lado do campo de mensagem.

A 1.0.2 trata os erros de requisição do OpenRouter com mensagens claras e mostra a cota diária no topo:

- **429 `free-models-per-day`** — o OpenRouter limita a 50 requisições gratuitas por dia por conta. A mensagem agora diz que o limite foi atingido, quando renova e que 10 créditos liberam 1000 requisições/dia.
- **402** — modelo pago sem créditos: a mensagem orienta a escolher um modelo gratuito no seletor.
- **429 por minuto** — repetido automaticamente até duas vezes quando ainda há cota.
- Chip **grátis hoje: N/50** ao lado do seletor, em verde quando há cota e âmbar quando zerou.

A 1.0.3 adiciona **IA local sem limite**: o seletor do topo alterna entre OpenRouter e IA local, que fala com qualquer servidor compatível com OpenAI na sua máquina (llama.cpp, Ollama, LM Studio). Sem chave, sem cota e sem internet. O script `multichat-windows/scripts/local-ai.ps1` baixa o llama.cpp e um modelo GGUF e sobe o servidor em `http://127.0.0.1:8080/v1`.

Modelos de código: o script aceita `-Model qwen2.5-coder-7b` (4,7 GB), `qwen2.5-coder-3b` (1,9 GB) e `qwen2.5-coder-1.5b` (1,1 GB). Os arquivos `.gguf` ficam apenas na máquina do usuário e não são versionados.

A 1.0.4 corrige dois problemas do modo local:

- **Todos os modelos aparecem no seletor.** O app varre a pasta de modelos (`.gguf`) em vez de listar só o que o servidor já carregou. Ao trocar de modelo, ele encerra o servidor anterior e sobe o novo com o contexto configurado.
- **Fim do erro de contexto.** O histórico e os anexos são cortados para caber no contexto do modelo (8 mil tokens por padrão), tanto na interface quanto no processo principal. Um APK de 22 MB que gerava 121 mil caracteres agora é resumido e enviado sem o erro 400 `exceed_context_size_error`.
- Servidores `llama-server` órfãos de execuções anteriores são encerrados antes de subir um novo, e o processo filho é finalizado ao fechar o app.

A 1.1.0 melhora a tela e adiciona prévia de projeto:

- **Prévia de projeto** (botão ▤): lê os blocos de código das respostas e renderiza a página num iframe isolado, com abas por arquivo. Dá para clicar e testar o site antes de hospedar.
- **Baixar ZIP**: exporta os arquivos do projeto com diálogo nativo de salvar.
- **Ferramentas** (botão 🧰): lista o que o app faz e abre a pasta de modelos ou de scripts.
- **GPU opcional**: com NVIDIA, o modelo vai para a placa via CUDA (`-ngl 99`); sem ela, a caixa fica desabilitada e tudo roda na CPU.
- Cabeçalho e rodapé reorganizados: chips sem quebra, sem sobreposição de texto.

A 1.1.1 tira o código do chat e melhora a leitura na prévia:

- **Chat sem código.** Cada bloco gerado vira uma nota compacta (`index.html · 12 linhas` + **Ver na prévia**). No chat ficam só a descrição e os passos do que está sendo feito.
- **Visualização estilo VS Code.** Na aba de um arquivo, o código aparece linha por linha, com números, cabeçalho com nome, contagem de linhas, linguagem e botão **Copiar**.
- Botão **Copiar** do código não sobrepõe mais o texto; compositor e cabeçalho não se comprimem com o painel aberto.

A 1.1.2 troca a prévia por um servidor real do projeto:

- **Motor de prévia.** Os arquivos gerados são gravados em disco nas pastas corretas (`index.html`, `styles.css`, `script.js`, `src/…`) e servidos por um servidor HTTP local em `127.0.0.1`. O iframe carrega a URL, então caminhos relativos, CSS, JS, imagens e navegação funcionam como no site publicado.
- **Projeto completo, não arquivo isolado.** A aba **Prévia** mostra o site rodando de verdade, com clique e interação, para achar bugs antes de hospedar.
- A pasta da prévia fica no disco com espaço livre (ao lado dos modelos) e é recriada a cada atualização.

Gerado com `npm run dist` em `multichat-windows/`. Para regerar:

```sh
cd multichat-windows
npm install
npm run dist
```

O instalador NSIS (`npm run dist:installer`) não é versionado aqui por tamanho; gere localmente quando precisar.

A versão web fica em `chat-multi-ia/` — veja o [README da raiz](../README.md).
