# Executáveis

Binários prontos para uso, versionados junto do código para download direto pelo repositório.

| Arquivo | Versão | Tamanho | O que é |
|---------|--------|---------|---------|
| `MultiChat-1.0.1-portable.exe` | 1.0.1 | 72,8 MB | Aplicativo portátil (x64). Não instala nada: execute e use. |

A 1.0.1 corrige o overlay de arrastar-e-soltar que cobria a janela inteira e travava a interface; o anexo agora é acionado só pelo botão 📎 ao lado do campo de mensagem.

Gerado com `npm run dist` em `multichat-windows/`. Para regerar:

```sh
cd multichat-windows
npm install
npm run dist
```

O instalador NSIS (`npm run dist:installer`) não é versionado aqui por tamanho; gere localmente quando precisar.

A versão web fica em `chat-multi-ia/` — veja o [README da raiz](../README.md).
