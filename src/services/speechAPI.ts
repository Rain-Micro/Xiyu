// src/services/speechAPI.ts
const API_URL = 'http://localhost:3001/api'

export async function recognizeSpeech(audioBlob: Blob): Promise<string> {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.webm')

  const response = await fetch(`${API_URL}/speech/recognize`, {
    method: 'POST',
    body: formData,
  })

  const data = await response.json() as { text?: string; error?: string }
  if (!response.ok) {
    throw new Error(data.error || '语音识别失败')
  }
  return data.text || ''
}