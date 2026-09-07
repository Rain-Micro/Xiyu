const API_URL = 'http://localhost:3001/api'

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
  userId: string,
  message: string,
  documentContent?: DocumentContent,
  imageContent?: ImageContent,
  ocrText?: string,
  signal?: AbortSignal,
  characterProfile?: CharacterProfileData
): Promise<string> {
  const body: Record<string, unknown> = { characterId, userId, message }
  if (documentContent) body.documentContent = documentContent
  if (imageContent) body.imageContent = imageContent
  if (ocrText) body.ocrText = ocrText
  if (characterProfile) body.characterProfile = characterProfile

  const response = await fetch(`${API_URL}/chat/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'AI 回复失败')
  }

  const data = await response.json()
  return data.reply
}

export async function getAssistantResponse(
  userId: string,
  message: string,
  assistantName?: string,
  assistantPersonality?: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(`${API_URL}/chat/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, message, assistantName, assistantPersonality }),
    signal,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '助手回复失败')
  }

  const data = await response.json()
  return data.reply
}
