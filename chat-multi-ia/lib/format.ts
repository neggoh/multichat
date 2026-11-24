export function formatRelativeTime(iso: string): string {
  try {
    const timestamp = new Date(iso).getTime()
    if (!Number.isFinite(timestamp)) return ''
    const diffMinutes = Math.floor((Date.now() - timestamp) / 60000)
    if (diffMinutes < 1) return 'agora'
    if (diffMinutes < 60) return `${diffMinutes} min`
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours} h`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays} d`
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}

export function formatContextLength(value: number | null | undefined): string {
  if (!value || value <= 0) return ''
  if (value >= 1000000) return `${Math.round(value / 100000) / 10}M`
  if (value >= 1000) return `${Math.round(value / 1000)}k`
  return String(value)
}

export function providerLabel(provider: string | null | undefined): string {
  const raw = (provider ?? '').trim()
  if (!raw) return 'OpenRouter'
  return raw
    .split(/[-_]/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
}
