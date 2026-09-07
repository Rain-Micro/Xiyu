// @ts-nocheck
import crypto from 'crypto'
import WebSocket from 'ws'

const XFYUN_APPID = process.env.IFLYTEK_APPID || ''
const XFYUN_APIKEY = process.env.IFLYTEK_APIKEY || ''
const XFYUN_APISECRET = process.env.IFLYTEK_APISECRET || ''

// 讯飞超拟人语音合成配置
const XFYUN_SUPERNATURAL_URL = process.env.XFYUN_SUPERNATURAL_URL || ''
const XFYUN_TTS_ENGINE = process.env.XFYUN_TTS_ENGINE || 'standard'  // 'supernatural' | 'standard'

// Operit TTS 配置
const TTS_ENGINE = process.env.TTS_ENGINE || 'iflytek'  // 'operit' | 'iflytek'
const OPERIT_API_URL = process.env.OPERIT_API_URL || ''  // e.g. http://192.168.1.76:8094/api/external-chat
const OPERIT_TOKEN = process.env.OPERIT_TOKEN || ''
const OPERIT_HOST = process.env.OPERIT_HOST || ''
const OPERIT_PORT = process.env.OPERIT_PORT || ''

// 超拟人音色列表
const SUPERNATURAL_VOICES = [
  { name: '聆玉昭（温柔）', id: 'x5_lingyuzhao_flow', gender: 'female', locale: 'zh-CN' },
  { name: '聆小璇（活泼）', id: 'x6_lingxiaoxuan_pro', gender: 'female', locale: 'zh-CN' },
  { name: '聆飞逸（沉稳）', id: 'x6_lingfeiyi_pro', gender: 'male', locale: 'zh-CN' },
  { name: '聆小玥（清甜）', id: 'x6_lingxiaoyue_pro', gender: 'female', locale: 'zh-CN' },
  { name: '聆玉言（知性）', id: 'x6_lingyuyan_pro', gender: 'female', locale: 'zh-CN' },
]

// 普通讯飞音色列表
const DEFAULT_VOICES = [
  { name: '小燕（女声）', id: 'xiaoyan', gender: 'female', locale: 'zh-CN' },
  { name: '小宇（男声）', id: 'xiaoyu', gender: 'male', locale: 'zh-CN' },
  { name: '小坤（男声）', id: 'xiaokun', gender: 'male', locale: 'zh-CN' },
  { name: '小怡（女声）', id: 'xiaoyi', gender: 'female', locale: 'zh-CN' },
  { name: '小轩（女声）', id: 'xiaoxuan', gender: 'female', locale: 'zh-CN' },
]

// 判断 Operit 是否可用
function isOperitEnabled(): boolean {
  return TTS_ENGINE === 'operit' && !!OPERIT_API_URL && !!OPERIT_TOKEN
}

// 判断超拟人是否可用
function isSuperNaturalEnabled(): boolean {
  return XFYUN_TTS_ENGINE === 'supernatural' && !!XFYUN_SUPERNATURAL_URL && !!XFYUN_APPID
}

// 获取 Operit 配置信息
export function getOperitConfig() {
  return {
    enabled: isOperitEnabled(),
    engine: TTS_ENGINE,
    apiUrl: OPERIT_API_URL,
    host: OPERIT_HOST,
    port: OPERIT_PORT,
  }
}

// 动态配置 Operit（运行时修改）
export function configureOperit(apiUrl: string, token: string) {
  // 运行时更新（不持久化，重启后恢复 env 值）
  ;(process.env as Record<string, string>).OPERIT_API_URL = apiUrl
  ;(process.env as Record<string, string>).OPERIT_TOKEN = token
  ;(process.env as Record<string, string>).TTS_ENGINE = 'operit'
  console.log(`[Voice] Operit TTS 已配置: ${apiUrl}`)
}

// 从 Operit 获取可用音色
async function fetchOperitVoices(): Promise<Array<{ name: string; id: string; gender: string; locale: string }>> {
  if (!isOperitEnabled()) return []

  try {
    // 尝试从 Operit 获取音色列表
    const baseUrl = OPERIT_API_URL.replace(/\/api\/external-chat$/, '')
    const resp = await fetch(`${baseUrl}/api/voices`, {
      headers: {
        'Authorization': `Bearer ${OPERIT_TOKEN}`,
      },
      signal: AbortSignal.timeout(3000),
    })
    if (resp.ok) {
      const data = await resp.json()
      if (Array.isArray(data.voices)) {
        return data.voices.map((v: Record<string, string>) => ({
          name: v.name || v.id,
          id: `operit:${v.id || v.name}`,
          gender: v.gender || 'neutral',
          locale: v.locale || 'zh-CN',
        }))
      }
    }
  } catch {
    // Operit 不可用或没有音色列表接口，返回默认 Operit 音色
  }

  // 返回默认的 Operit 音色
  return [
    { name: 'Operit 默认', id: 'operit:default', gender: 'neutral', locale: 'zh-CN' },
  ]
}

// 获取音色列表
export async function listVoices() {
  const allVoices: Array<{ name: string; id: string; gender: string; locale: string }> = []

  // 1. 超拟人音色（优先）
  if (isSuperNaturalEnabled()) {
    allVoices.push(...SUPERNATURAL_VOICES.map(v => ({
      name: `${v.name}（超拟人）`,
      id: `supernatural:${v.id}`,
      gender: v.gender,
      locale: v.locale,
    })))
  }

  // 2. Operit 音色
  if (isOperitEnabled()) {
    const operitVoices = await fetchOperitVoices()
    if (operitVoices.length > 0) {
      allVoices.push(...operitVoices)
    }
  }

  // 3. 普通讯飞音色（备选）
  allVoices.push(...DEFAULT_VOICES.map(v => ({
    name: `${v.name}（讯飞）`,
    id: `iflytek:${v.id}`,
    gender: v.gender,
    locale: v.locale,
  })))

  return allVoices.length > 0 ? allVoices : DEFAULT_VOICES
}

// Operit TTS 合成
async function synthesizeWithOperit(text: string): Promise<Buffer> {
  if (!isOperitEnabled()) {
    throw new Error('Operit TTS 未启用')
  }

  console.log(`[Voice] Operit TTS 合成: ${text.substring(0, 30)}...`)

  // 1. 发送合成请求，消息格式为 /voice_bar:say <文本>
  const response = await fetch(OPERIT_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPERIT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      message: `/voice_bar:say ${text}`,
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Operit TTS 错误: ${response.status} ${errorText}`)
  }

  const result = await response.json() as Record<string, unknown>
  console.log('[Voice] Operit 响应:', JSON.stringify(result).substring(0, 200))

  if (!result.success) {
    throw new Error(`Operit 返回错误: ${result.error || JSON.stringify(result)}`)
  }

  // 2. 从 voice_tag 中解析音频文件路径
  // voice_tag 格式: <voice src="/storage/emulated/0/Download/voice_bar_voices/v_xxx.wav"/> dur="3.0" text="..."
  const voiceTag = (result.voice_tag as string) || ''
  const srcMatch = voiceTag.match(/src="([^"]+)"/)
  if (!srcMatch) {
    throw new Error(`Operit 返回的 voice_tag 中未找到音频路径: ${voiceTag}`)
  }
  const filePath = srcMatch[1]
  console.log(`[Voice] Operit 音频路径: ${filePath}`)

  // 3. 通过 Operit HTTP 服务下载音频文件
  // 构造 URL: 基础地址 + 文件路径
  const baseUrl = OPERIT_API_URL.replace(/\/api\/external-chat$/, '')
  const audioUrl = `${baseUrl}${filePath}`
  console.log(`[Voice] 下载音频: ${audioUrl}`)

  const audioResponse = await fetch(audioUrl, {
    headers: {
      'Authorization': `Bearer ${OPERIT_TOKEN}`,
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!audioResponse.ok) {
    throw new Error(`音频下载失败: ${audioResponse.status}`)
  }

  const arrayBuffer = await audioResponse.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  console.log(`[Voice] Operit 音频大小: ${buffer.length} bytes`)

  return buffer
}

// 讯飞超拟人语音合成
function synthesizeWithSuperNatural(
  text: string,
  voiceId: string,
  options?: { speed?: number; pitch?: number; volume?: number; oral?: string }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const vcn = voiceId || 'x5_lingyuzhao_flow'
    console.log(`[Voice] 超拟人 TTS 合成: ${text.substring(0, 20)}..., 音色: ${vcn}`)
    console.log(`[Voice] 超拟人 URL: ${XFYUN_SUPERNATURAL_URL}`)

    // 使用与标准讯飞相同的鉴权方式，但连接超拟人专用地址
    const urlObj = new URL(XFYUN_SUPERNATURAL_URL)
    const host = urlObj.hostname
    const path = urlObj.pathname
    const date = new Date().toUTCString()
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
    const signatureSha = crypto.createHmac('sha256', XFYUN_APISECRET)
      .update(signatureOrigin)
      .digest('base64')
    const authorizationOrigin = `api_key="${XFYUN_APIKEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`
    const authorization = Buffer.from(authorizationOrigin).toString('base64')
    const wsUrl = `${XFYUN_SUPERNATURAL_URL}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`

    const ws = new WebSocket(wsUrl)
    const audioChunks: Buffer[] = []
    let timeout: NodeJS.Timeout

    ws.on('open', () => {
      const requestData = {
        header: {
          app_id: XFYUN_APPID,
          status: 3,
        },
        parameter: {
          tts: {
            vcn,
            speed: options?.speed ?? 50,
            volume: options?.volume ?? 70,
            pitch: options?.pitch ?? 55,
            oral: options?.oral || 'mid',
          },
        },
        payload: {
          text: {
            encoding: 'utf8',
            compress: 'raw',
            format: 'plain',
            text: Buffer.from(text).toString('base64'),
          },
        },
      }
      ws.send(JSON.stringify(requestData))
      timeout = setTimeout(() => {
        ws.close()
        reject(new Error('超拟人 TTS 超时'))
      }, 20000)
    })

    ws.on('message', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString())
        if (parsed.code !== 0) {
          reject(new Error(`超拟人错误: ${parsed.message} (code: ${parsed.code})`))
          ws.close()
          return
        }
        if (parsed.data?.audio) {
          audioChunks.push(Buffer.from(parsed.data.audio, 'base64'))
        }
        if (parsed.data?.status === 2) {
          clearTimeout(timeout)
          const pcmData = Buffer.concat(audioChunks)
          const wavData = pcmToWav(pcmData, 24000)
          console.log(`[Voice] 超拟人 WAV 大小: ${wavData.length} bytes`)
          resolve(wavData)
          ws.close()
        }
      } catch {
        // ignore parse errors
      }
    })

    ws.on('error', (err: Error) => {
      clearTimeout(timeout)
      reject(err)
    })

    ws.on('close', () => {
      clearTimeout(timeout)
      if (audioChunks.length === 0) {
        reject(new Error('超拟人连接关闭，未收到音频数据'))
      }
    })
  })
}

// 讯飞 TTS 合成
function synthesizeWithIflytek(text: string, voiceId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    console.log(`[Voice] 讯飞 TTS 合成: ${text.substring(0, 20)}..., 音色: ${voiceId}`)

    const host = 'tts-api.xfyun.cn'
    const date = new Date().toUTCString()
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v2/tts HTTP/1.1`
    const signatureSha = crypto.createHmac('sha256', XFYUN_APISECRET)
      .update(signatureOrigin)
      .digest('base64')
    const authorizationOrigin = `api_key="${XFYUN_APIKEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`
    const authorization = Buffer.from(authorizationOrigin).toString('base64')
    const wsUrl = `wss://${host}/v2/tts?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`

    const ws = new WebSocket(wsUrl)
    const audioChunks: Buffer[] = []
    let timeout: NodeJS.Timeout

    ws.on('open', () => {
      const requestData = {
        common: { app_id: XFYUN_APPID },
        business: {
          aue: 'raw',
          auf: 'audio/L16;rate=16000',
          vcn: voiceId,
          speed: 50,
          volume: 50,
          pitch: 50,
          tte: 'utf8'
        },
        data: {
          status: 2,
          text: Buffer.from(text).toString('base64')
        }
      }
      ws.send(JSON.stringify(requestData))
      timeout = setTimeout(() => {
        ws.close()
        reject(new Error('讯飞 TTS 超时'))
      }, 15000)
    })

    ws.on('message', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString())
        if (parsed.code !== 0) {
          reject(new Error(`讯飞错误: ${parsed.message} (code: ${parsed.code})`))
          ws.close()
          return
        }
        if (parsed.data?.audio) {
          audioChunks.push(Buffer.from(parsed.data.audio, 'base64'))
        }
        if (parsed.data?.status === 2) {
          clearTimeout(timeout)
          const pcmData = Buffer.concat(audioChunks)
          // 转换为 WAV 格式
          const wavData = pcmToWav(pcmData)
          console.log(`[Voice] 讯飞 WAV 大小: ${wavData.length} bytes`)
          resolve(wavData)
          ws.close()
        }
      } catch {
        // ignore parse errors
      }
    })

    ws.on('error', (err: Error) => {
      clearTimeout(timeout)
      reject(err)
    })

    ws.on('close', () => {
      clearTimeout(timeout)
      if (audioChunks.length === 0) {
        reject(new Error('讯飞连接关闭，未收到音频数据'))
      }
    })
  })
}

// 将 PCM 数据转换为 WAV 格式
function pcmToWav(pcmData: Buffer, sampleRate: number = 16000, channels: number = 1): Buffer {
  const headerSize = 44
  const totalSize = headerSize + pcmData.length

  const wavHeader = Buffer.alloc(44)
  wavHeader.write('RIFF', 0)
  wavHeader.writeUInt32LE(totalSize - 8, 4)
  wavHeader.write('WAVE', 8)
  wavHeader.write('fmt ', 12)
  wavHeader.writeUInt32LE(16, 16)
  wavHeader.writeUInt16LE(1, 20)
  wavHeader.writeUInt16LE(channels, 22)
  wavHeader.writeUInt32LE(sampleRate, 24)
  wavHeader.writeUInt32LE(sampleRate * channels * 2, 28)
  wavHeader.writeUInt16LE(channels * 2, 32)
  wavHeader.writeUInt16LE(16, 34)
  wavHeader.write('data', 36)
  wavHeader.writeUInt32LE(pcmData.length, 40)

  return Buffer.concat([wavHeader, pcmData])
}

// 判断是否是超拟人音色 ID（裸 ID 或带 supernatural: 前缀）
function isSuperNaturalVoiceId(voiceId: string): boolean {
  if (voiceId.startsWith('supernatural:')) return true
  // 裸 ID: x5_ 或 x6_ 开头的都是超拟人音色
  return /^(x5_|x6_)/.test(voiceId)
}

// 提取纯超拟人音色 ID（去除 supernatural: 前缀）
function extractSuperNaturalVcn(voiceId: string): string {
  if (voiceId.startsWith('supernatural:')) return voiceId.slice(13)
  return voiceId
}

// 语音合成主入口：超拟人优先 > Operit > 普通讯飞
export async function synthesizeSpeech(
  text: string,
  voiceName: string = 'xiaoyan',
  options?: { speed?: number; pitch?: number; volume?: number }
): Promise<Buffer> {
  console.log(`[Voice] 合成请求: voice="${voiceName}", text="${text.substring(0, 20)}..."`)

  // 1. 如果指定了超拟人音色（supernatural:xxx 或 x5_/x6_ 开头）
  if (isSuperNaturalVoiceId(voiceName)) {
    const vcn = extractSuperNaturalVcn(voiceName)
    console.log(`[Voice] → 超拟人引擎, vcn=${vcn}`)
    try {
      return await synthesizeWithSuperNatural(text, vcn, options)
    } catch (err) {
      console.warn('[Voice] 超拟人合成失败，回退到普通讯飞:', (err as Error).message)
      return synthesizeWithIflytek(text, 'xiaoyan')
    }
  }

  // 2. 如果指定了讯飞音色（iflytek:xxx）
  if (voiceName.startsWith('iflytek:')) {
    const iflytekVoiceId = voiceName.slice(8)
    console.log(`[Voice] → 讯飞引擎, vcn=${iflytekVoiceId}`)
    return synthesizeWithIflytek(text, iflytekVoiceId)
  }

  // 3. 如果超拟人启用，优先使用超拟人
  if (isSuperNaturalEnabled()) {
    console.log(`[Voice] → 超拟人引擎(默认), vcn=x5_lingyuzhao_flow`)
    try {
      return await synthesizeWithSuperNatural(text, 'x5_lingyuzhao_flow', options)
    } catch (err) {
      console.warn('[Voice] 超拟人合成失败，回退:', (err as Error).message)
    }
  }

  // 4. 如果 Operit 启用
  if (isOperitEnabled()) {
    console.log(`[Voice] → Operit 引擎`)
    try {
      return await synthesizeWithOperit(text)
    } catch (err) {
      console.warn('[Voice] Operit 合成失败，回退到讯飞 TTS:', (err as Error).message)
    }
  }

  // 5. 讯飞 TTS（默认回退）
  const voiceId = voiceName.startsWith('operit:') ? 'xiaoyan' : (voiceName || 'xiaoyan')
  console.log(`[Voice] → 讯飞引擎(回退), vcn=${voiceId}`)
  return synthesizeWithIflytek(text, voiceId)
}
