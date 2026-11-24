import type { ExtractedCodeBlock } from './code-blocks'

export interface PreviewDocument {
  html: string
  warnings: string[]
}

// Called only in a client effect: DOMParser must never run during SSR.
export function buildProjectPreview(files: ExtractedCodeBlock[], entry: string): PreviewDocument {
  const warnings = new Set<string>()
  const source = files.find((file) => file.fileName === entry)
  if (!source) throw new Error('Selecione um arquivo HTML para visualizar.')
  if (files.reduce((size, file) => size + file.code.length, 0) > 1_000_000) {
    throw new Error('O projeto é grande demais para esta prévia. Visualize uma versão menor.')
  }
  const doc = new DOMParser().parseFromString(source.code, 'text/html')
  const used = new Set<string>()
  const resolve = (reference: string) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference)) return undefined
    const parts = reference.startsWith('/') ? [] : entry.split('/').slice(0, -1)
    for (const part of reference.split(/[?#]/)[0].split('/')) {
      if (part === '..') parts.pop()
      else if (part && part !== '.') parts.push(part)
    }
    return files.find((file) => file.fileName === parts.join('/'))
  }
  doc.querySelectorAll('base, meta[http-equiv], iframe, object, embed').forEach((node) => node.remove())
  const styleLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
  for (const link of styleLinks) {
    const reference = link.getAttribute('href') || ''
    const file = resolve(reference)
    if (file) {
      const style = doc.createElement('style')
      style.textContent = file.code
      link.replaceWith(style)
      used.add(file.fileName)
    } else {
      warnings.add(`Estilo indisponível ou externo: ${reference}`)
      link.remove()
    }
  }
  const scriptLinks = Array.from(doc.querySelectorAll('script[src]'))
  for (const script of scriptLinks) {
    const reference = script.getAttribute('src') || ''
    const file = resolve(reference)
    if (file && /\.(?:js|mjs)$/i.test(file.fileName)) {
      script.removeAttribute('src')
      script.removeAttribute('integrity')
      script.removeAttribute('crossorigin')
      script.textContent = file.code.replace(/<\/script/gi, '<\\/script')
      used.add(file.fileName)
    } else {
      warnings.add(`Script indisponível ou que exige compilação: ${reference}`)
      script.remove()
    }
  }
  // Standalone HTML/CSS/JS blocks often have no explicit references.
  for (const file of files) {
    if (used.has(file.fileName)) continue
    if (/\.css$/i.test(file.fileName) && styleLinks.length === 0) {
      const style = doc.createElement('style')
      style.textContent = file.code
      doc.head.appendChild(style)
    }
    if (/\.(?:js|mjs)$/i.test(file.fileName) && scriptLinks.length === 0) {
      if (/\b(?:import|export|require)\b/.test(file.code)) {
        warnings.add('Módulos e dependências que exigem compilação não são executados nesta prévia.')
        continue
      }
      const script = doc.createElement('script')
      script.textContent = file.code.replace(/<\/script/gi, '<\\/script')
      doc.body.appendChild(script)
    }
  }
  if (doc.querySelector('script[type="module"]')) {
    warnings.add('Imports de módulos e pacotes externos não são resolvidos nesta prévia.')
  }
  if (!doc.querySelector('meta[name="viewport"]')) {
    const viewport = doc.createElement('meta')
    viewport.name = 'viewport'
    viewport.content = 'width=device-width, initial-scale=1'
    doc.head.prepend(viewport)
  }
  const bridge = doc.createElement('script')
  bridge.textContent = `(() => {
    const report = (message) => parent.postMessage({type:'project-preview-error',message:String(message).slice(0,1000)}, '*');
    addEventListener('error', e => report(e.message || 'Erro ao executar o projeto.'));
    addEventListener('unhandledrejection', e => report(e.reason?.message || e.reason || 'Falha assíncrona.'));
    const original = console.error;
    console.error = (...args) => { original.apply(console,args); report(args.map(String).join(' ')); };
    addEventListener('click', e => { const link = e.target.closest?.('a'); if(link && !(link.getAttribute('href') || '').startsWith('#')) { e.preventDefault(); report('Navegação desativada na prévia. Escolha a página no seletor.'); } }, true);
  })();`
  doc.head.prepend(bridge)
  const policy = doc.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"
  doc.head.prepend(policy)
  return { html: '<!DOCTYPE html>\n' + doc.documentElement.outerHTML, warnings: Array.from(warnings) }
}
