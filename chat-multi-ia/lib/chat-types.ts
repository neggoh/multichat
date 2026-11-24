export interface ModelInfo {
  id: string
  name: string
  provider: string
  context_length: number | null
  description: string | null
  supportsVision?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  model?: string | null
  imageDataUrl?: string | null
}

export interface ConversationSummary {
  id: string
  title: string
  model: string
  updatedAt: string
  messageCount: number
}

export const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'deepseek/deepseek-chat-v3-0324:free',
    name: 'DeepSeek V3 0324',
    provider: 'deepseek',
    context_length: 163840,
    description: 'Modelo generalista forte em código e raciocínio.',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B Instruct',
    provider: 'meta-llama',
    context_length: 131072,
    description: 'Modelo aberto da Meta, equilibrado e conversacional.',
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash (exp)',
    provider: 'google',
    context_length: 1048576,
    description: 'Respostas rápidas com janela de contexto enorme.',
  },
  {
    id: 'qwen/qwen3-235b-a22b:free',
    name: 'Qwen3 235B A22B',
    provider: 'qwen',
    context_length: 131072,
    description: 'Modelo grande com bom desempenho em código.',
  },
  {
    id: 'mistralai/mistral-7b-instruct:free',
    name: 'Mistral 7B Instruct',
    provider: 'mistralai',
    context_length: 32768,
    description: 'Leve e rápido para tarefas simples.',
  },
]

export const DEFAULT_MODEL_ID = FALLBACK_MODELS[0].id
