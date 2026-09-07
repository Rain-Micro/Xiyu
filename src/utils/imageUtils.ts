import { createWorker } from 'tesseract.js'

export interface OCRResult {
  text: string
  success: boolean
  timedOut: boolean
  cancelled: boolean
}

export interface OCROptions {
  timeout?: number
  onProgress?: (progress: number) => void
  shouldCancel?: () => boolean
}

/**
 * 压缩图片：限制最大宽度 1200px，质量 0.7，大小不超过 1MB
 */
export async function compressImage(
  source: string | File,
  maxWidth = 1200,
  quality = 0.7
): Promise<string> {
  let input: string
  if (source instanceof File) {
    input = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(source)
    })
  } else {
    input = source
  }

  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = input
  })

  let { width, height } = img
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width)
    width = maxWidth
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)

  let dataUrl = canvas.toDataURL('image/jpeg', quality)

  // 如果仍超过 1MB，逐步降低质量
  while (dataUrl.length > 1_400_000 && quality > 0.3) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }

  return dataUrl
}

/**
 * OCR 识别图片文字，支持超时、取消、进度回调
 */
export async function recognizeImage(
  dataUrl: string,
  options: OCROptions = {}
): Promise<OCRResult> {
  const { timeout = 30000, onProgress, shouldCancel } = options

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null
  let timedOut = false
  let cancelled = false

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      timedOut = true
      reject(new Error('OCR_TIMEOUT'))
    }, timeout)
  })

  try {
    // 将 logger 回调传递给 createWorker，而非 recognize
    // 避免传递不可克隆的函数给 Worker（DataCloneError）
    worker = await createWorker(['chi_sim', 'eng'], 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100))
        }
      },
    })

    // 发送前检查取消
    if (shouldCancel && shouldCancel()) {
      cancelled = true
      return { text: '', success: false, timedOut: false, cancelled: true }
    }

    const recognizePromise = (async () => {
      // recognize 不接受回调参数，避免 DataCloneError
      const { data } = await worker!.recognize(dataUrl)

      // 识别完成后检查取消
      if (shouldCancel && shouldCancel()) {
        cancelled = true
        return ''
      }

      return data.text || ''
    })()

    const text = await Promise.race([recognizePromise, timeoutPromise])
    return { text, success: true, timedOut: false, cancelled: false }
  } catch (err) {
    if (cancelled) {
      return { text: '', success: false, timedOut: false, cancelled: true }
    }
    if (timedOut) {
      return { text: '', success: false, timedOut: true, cancelled: false }
    }
    console.error('[OCR] 识别失败:', err)
    return { text: '', success: false, timedOut: false, cancelled: false }
  } finally {
    if (worker) {
      try { await worker.terminate() } catch { /* ignore */ }
    }
  }
}

/**
 * 从粘贴事件中提取图片文件
 */
export function getImageFromPasteEvent(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }
  return null
}
