# MultiChat (Windows)

Aplicativo de desktop para Windows que reúne vários modelos de IA em uma só conversa. Fala direto com a API do OpenRouter, sem servidor intermediário: o processo principal do Electron faz as requisições e o renderer só recebe o texto.

- A chave do OpenRouter é guardada criptografada pelo Windows (DPAPI, via `safeStorage` do Electron).
- O histórico das conversas fica no `localStorage` do próprio app, neste computador.

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

Crie uma chave gratuita em <https://openrouter.ai/keys> e cole no diálogo do app (botão da chave, no topo). Os modelos gratuitos aparecem no seletor de modelo.

## Segurança

- A chave nunca entra no renderer: ela é lida e usada apenas no processo principal.
- A janela usa uma Content-Security-Policy restritiva (`default-src 'none'`, sem `connect-src`).
- `contextIsolation` e `sandbox` ativados, com `nodeIntegration` desligado; o renderer só acessa o que o preload expõe.
