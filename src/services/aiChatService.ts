import { api } from './apiClient'

interface DocumentContent {
  fileType: 'docx' | 'pdf' | 'txt'
  base64: string
}

interface ImageContent {
  base64: string
  mimeType: string
}

export interface CharacterProfileData {
  name: string
  personality: string[]
  tone: string
  background: string
  hobbies?: string[]
  greeting?: string
  characterSayings?: string[]
  relationship?: string
  likedFoods?: string[]
  dislikedThings?: string[]
  oocBehaviors?: string[]
}

export async function getAIResponse(
  characterId: string,
  _userId: string,
  message: string,
  documentContent?: DocumentContent,
  imageContent?: ImageContent,
  ocrText?: string,
  signal?: AbortSignal,
  characterProfile?: CharacterProfileData
): Promise<string> {
  const body: Record<string, unknown> = { characterId, message }
  if (documentContent) body.documentContent = documentContent
  if (imageContent) body.imageContent = imageContent
  if (ocrText) body.ocrText = ocrText
  if (characterProfile) body.characterProfile = characterProfile

  const data = await api<{ reply: string }>({
    method: 'POST',
    path: '/api/chat/completion',
    body,
    signal,
    timeoutMs: 120000, // AI 生成耗时较长
  })
  return data.reply
}

export async function getAssistantResponse(
  _userId: string,
  message: string,
  assistantName?: string,
  assistantPersonality?: string,
  signal?: AbortSignal
): Promise<string> {
  const data = await api<{ reply: string }>({
    method: 'POST',
    path: '/api/chat/assistant',
    body: { message, assistantName, assistantPersonality },
    signal,
    timeoutMs: 120000,
  })
  return data.reply
}
