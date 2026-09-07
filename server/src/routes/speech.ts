import { Router, Request, Response } from 'express'
import multer from 'multer'
import { convertAudioToPcm, recognizeSpeech } from '../services/iflytek'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// 定义带 file 的 Request 类型
interface RequestWithFile extends Request {
  file?: Express.Multer.File
}

router.post('/recognize', upload.single('audio'), async (req: RequestWithFile, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '缺少音频数据' })
    }

    console.log('[Speech] 收到音频:', req.file.originalname, req.file.size, 'bytes')

    // 将音频转换为 PCM 格式
    const pcmBuffer = await convertAudioToPcm(req.file.buffer)
    console.log('[Speech] PCM 转换完成:', pcmBuffer.length, 'bytes')

    // 转为 base64 调用讯飞
    const audioBase64 = pcmBuffer.toString('base64')
    const text = await recognizeSpeech(audioBase64)
    console.log('[Speech] 识别结果:', text)

    res.json({ text })
  } catch (err) {
    console.error('[Speech] 识别失败:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : '语音识别失败' })
  }
})

export default router