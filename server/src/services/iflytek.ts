import crypto from 'crypto'
import WebSocket from 'ws'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import { Readable } from 'stream'

// 设置 ffmpeg 路径（使用 ffmpeg-static 提供的二进制文件）
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as string)
  console.log('[iflytek] ffmpeg 路径已设置:', ffmpegStatic)
} else {
  console.warn('[iflytek] ffmpeg-static 未找到，语音转文字可能无法工作')
}

const APPID = process.env.IFLYTEK_APPID || ''
const APIKey = process.env.IFLYTEK_APIKEY || ''
const APISecret = process.env.IFLYTEK_APISECRET || ''

// 生成讯飞 API 签名
function buildAuthUrl(): string {
  const host = 'iat-api.xfyun.cn'
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/iat HTTP/1.1`
  const signatureSha = crypto.createHmac('sha256', APISecret).update(signatureOrigin).digest('base64')
  const authorizationOrigin = `api_key="${APIKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`
  const authorization = Buffer.from(authorizationOrigin).toString('base64')
  return `wss://${host}/v2/iat?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`
}

// 将音频 Buffer 转换为 PCM (16kHz, 16bit, 单声道)
export function convertAudioToPcm(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const readableStream = Readable.from(buffer)

    ffmpeg(readableStream)
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('s16le')
      .on('error', reject)
      .pipe()
      .on('data', (chunk: Buffer) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject)
  })
}

export function recognizeSpeech(audioBase64: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const wsUrl = buildAuthUrl()
    const ws = new WebSocket(wsUrl)
    let resultText = ''
    let timeout: NodeJS.Timeout

    ws.on('open', () => {
      // 发送音频数据
      const audioData = {
        common: {
          app_id: APPID,
        },
        business: {
          language: 'zh_cn',
          domain: 'iat',
          accent: 'mandarin',
          vad_eos: 5000,
          dwa: 'wpgs',
        },
        data: {
          status: 2, // 一次性发送整段音频
          format: 'audio/L16;rate=16000',
          encoding: 'raw',
          audio: audioBase64,
        },
      }
      ws.send(JSON.stringify(audioData))

      timeout = setTimeout(() => {
        ws.close()
        reject(new Error('讯飞语音识别超时'))
      }, 10000)
    })

    ws.on('message', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString())
        if (parsed.code !== 0) {
          reject(new Error(`讯飞错误: ${parsed.message}`))
          ws.close()
          return
        }
        if (parsed.data?.result?.ws) {
          const words = parsed.data.result.ws
          let text = ''
          for (const w of words) {
            for (const c of w.cw) {
              text += c.w
            }
          }
          // 只在最终结果时返回
          if (parsed.data.status === 2) {
            resultText = text
            clearTimeout(timeout)
            resolve(resultText)
            ws.close()
          }
        }
      } catch {
        // ignore
      }
    })

    ws.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    ws.on('close', () => {
      clearTimeout(timeout)
      if (!resultText) {
        reject(new Error('讯飞连接关闭，未收到识别结果'))
      }
    })
  })
}