import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chat Multi-IA',
    short_name: 'Chat Multi-IA',
    description:
      'Converse com dezenas de modelos gratuitos do OpenRouter em uma única interface, trocando de modelo sem perder o contexto.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0a14',
    theme_color: '#0b0a14',
    lang: 'pt-BR',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
