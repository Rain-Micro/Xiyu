import { api } from './apiClient'

export interface ParsedCharacterData {
  name?: string
  age?: string
  birthday?: string
  gender?: string
  relationship?: string
  userTitle?: string
  userNote?: string
  anniversary?: string
  likedFoods?: string[]
  dislikedFoods?: string[]
  hobbies?: string[]
  dislikedThings?: string[]
  personalityTraits?: string[]
  characterSayings?: string[]
  greeting?: string
  userDislikes?: string[]
  oocBehaviors?: string[]
  unmatched?: string
}

export async function parseCharacterWithAI(text: string): Promise<ParsedCharacterData> {
  const result = await api<{ data?: ParsedCharacterData }>({
    method: 'POST',
    path: '/api/chat/parse-character',
    body: { text },
    timeoutMs: 120000,
  })
  return result.data || {}
}
