/**
 * Web Speech API 语音识别工具
 * 使用浏览器内置的 SpeechRecognition API 进行实时语音转文字
 */

// 扩展 Window 类型以支持 webkitSpeechRecognition
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}

interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  length: number
  isFinal: boolean
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

export interface SpeechRecognitionOptions {
  lang?: string
  continuous?: boolean
  interimResults?: boolean
  onResult?: (text: string, isFinal: boolean) => void
  onError?: (error: string) => void
  onEnd?: () => void
}

export class SpeechRecognitionManager {
  private recognition: SpeechRecognition | null = null
  private isSupported: boolean
  private finalText: string = ''
  private shouldRestart: boolean = false

  constructor() {
    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition
    this.isSupported = !!SpeechRecognitionClass
  }

  static isSupported(): boolean {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  }

  start(options: SpeechRecognitionOptions = {}): boolean {
    if (!this.isSupported) {
      console.warn('[SpeechRecognition] 浏览器不支持语音识别')
      return false
    }

    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionClass) return false

    this.recognition = new SpeechRecognitionClass()
    this.finalText = ''
    this.shouldRestart = true

    this.recognition.lang = options.lang || 'zh-CN'
    this.recognition.continuous = options.continuous ?? true
    this.recognition.interimResults = options.interimResults ?? true
    this.recognition.maxAlternatives = 1

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          this.finalText += result[0].transcript
        } else {
          interimText += result[0].transcript
        }
      }
      if (options.onResult) {
        const fullText = this.finalText + interimText
        options.onResult(fullText, false)
      }
    }

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[SpeechRecognition] 错误:', event.error)
      if (options.onError) {
        options.onError(event.error)
      }
      // 'no-speech' 和 'aborted' 不需要重启
      if (event.error === 'no-speech' || event.error === 'aborted') {
        this.shouldRestart = false
      }
    }

    this.recognition.onend = () => {
      // 如果还需要继续（continuous 模式下浏览器可能自动停止），尝试重启
      if (this.shouldRestart) {
        try {
          this.recognition?.start()
        } catch {
          // 重启失败，忽略
        }
      } else if (options.onEnd) {
        options.onEnd()
      }
    }

    try {
      this.recognition.start()
      return true
    } catch (err) {
      console.error('[SpeechRecognition] 启动失败:', err)
      return false
    }
  }

  stop(): string {
    this.shouldRestart = false
    if (this.recognition) {
      try {
        this.recognition.stop()
      } catch {
        // ignore
      }
    }
    return this.finalText
  }

  abort(): void {
    this.shouldRestart = false
    if (this.recognition) {
      try {
        this.recognition.abort()
      } catch {
        // ignore
      }
    }
  }

  getFinalText(): string {
    return this.finalText.trim()
  }
}
