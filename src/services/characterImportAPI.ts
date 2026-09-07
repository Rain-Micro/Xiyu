const API_URL = 'http://localhost:3001/api/chat/parse-character'

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
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'AI 解析失败')
  return result.data || {}
}
