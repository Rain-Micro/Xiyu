// src/services/speechAPI.ts
import { api } from './apiClient'

export async function recognizeSpeech(audioBlob: Blob): Promise<string> {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.webm')

  const data = await api<{ text?: string }>({
    method: 'POST',
    path: '/api/speech/recognize',
    formData,
    timeoutMs: 60000, // 含 ffmpeg 转码与讯飞识别
  })
  return data.text || ''
}
