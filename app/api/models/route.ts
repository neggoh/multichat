import { NextResponse } from 'next/server'
import { FALLBACK_MODELS, type ModelInfo } from '@/lib/chat-types'

export const dynamic = 'force-dynamic'

interface RawOpenRouterModel {
  id?: string
  name?: string
  description?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  architecture?: { input_modalities?: string[]; output_modalities?: string[] }
}

function isChatModel(model: RawOpenRouterModel): boolean {
  const architecture = model?.architecture
  const outputModalities = Array.isArray(architecture?.output_modalities) ? architecture.output_modalities : []
  const inputModalities = Array.isArray(architecture?.input_modalities) ? architecture.input_modalities : []

  // Só interessa saída em texto (descarta modelos de imagem, áudio e música).
  if (outputModalities.length > 0) {
    if (!outputModalities.includes('text')) return false
    if (outputModalities.includes('image') || outputModalities.includes('audio')) return false
  }
  // Modelos de visão entram na lista: são necessários para analisar imagens anexadas.
  if (inputModalities.length > 0 && !inputModalities.includes('text')) return false

  const id = String(model?.id ?? '').toLowerCase()
  if (id.includes('lyria') || id.includes('whisper') || id.includes('tts')) return false

  return true
}

function supportsVision(model: RawOpenRouterModel): boolean {
  const inputModalities = Array.isArray(model?.architecture?.input_modalities)
    ? model.architecture.input_modalities
    : []
  return inputModalities.includes('image')
}

export async function GET() {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`OpenRouter respondeu com status ${response.status}`)
    }

    const payload: unknown = await response.json()
    const rawList: RawOpenRouterModel[] =
      payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
        ? ((payload as { data: RawOpenRouterModel[] }).data ?? [])
        : []

    const models: ModelInfo[] = rawList
      .filter((model) => {
        const promptPrice = Number(model?.pricing?.prompt ?? '1')
        const completionPrice = Number(model?.pricing?.completion ?? '1')
        return promptPrice === 0 && completionPrice === 0 && isChatModel(model)
      })
      .map((model) => {
        const id = String(model?.id ?? '')
        return {
          id,
          name: String(model?.name ?? id),
          provider: id.split('/')[0] ?? '',
          context_length: typeof model?.context_length === 'number' ? model.context_length : null,
          description: typeof model?.description === 'string' ? model.description : null,
          supportsVision: supportsVision(model),
        }
      })
      .filter((model) => model.id.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))

    if (models.length === 0) {
      throw new Error('Nenhum modelo gratuito retornado pelo OpenRouter')
    }

    return NextResponse.json({ models, source: 'openrouter', count: models.length })
  } catch (error) {
    console.error('[api/models] Falha ao buscar modelos do OpenRouter:', error)
    return NextResponse.json({ models: FALLBACK_MODELS, source: 'fallback', count: FALLBACK_MODELS.length })
  }
}
