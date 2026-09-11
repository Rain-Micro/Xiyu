// server/src/routes/voice.ts
import { Router, Request, Response } from 'express';
import { synthesizeSpeech, listVoices, getOperitConfig } from '../services/voiceService';

const router = Router();

// 获取音色列表
router.get('/voices', async (req: Request, res: Response) => {
    try {
        const voices = await listVoices();
        res.json({ voices });
    } catch (err) {
        console.error('[Voice API] 获取音色列表失败:', err);
        res.status(500).json({ error: '获取音色列表失败' });
    }
});

// 语音合成接口
router.post('/synthesize', async (req: Request, res: Response) => {
    try {
        const { text, voice, speed, pitch, volume } = req.body;
        if (!text) {
            return res.status(400).json({ error: '缺少文本内容' });
        }

        const audioBuffer = await synthesizeSpeech(text, voice, { speed, pitch, volume });

        // 检测音频格式：检查 WAV 头部
        const isWav = audioBuffer.length > 4 &&
            audioBuffer[0] === 0x52 && audioBuffer[1] === 0x49 &&
            audioBuffer[2] === 0x46 && audioBuffer[3] === 0x46; // "RIFF"

        if (isWav) {
            res.setHeader('Content-Type', 'audio/wav');
        } else {
            // 默认当作 mp3
            res.setHeader('Content-Type', 'audio/mpeg');
        }

        res.send(audioBuffer);
    } catch (err) {
        console.error('[Voice API] 合成失败:', err);
        res.status(500).json({ error: `语音合成失败: ${(err as Error).message}` });
    }
});

// 获取 TTS 引擎状态
router.get('/status', (req: Request, res: Response) => {
    const config = getOperitConfig();
    res.json({
        engine: config.engine,
        operitEnabled: config.enabled,
        operitHost: config.host,
        operitPort: config.port,
        supernaturalEnabled: process.env.XFYUN_TTS_ENGINE === 'supernatural',
        supernaturalUrl: process.env.XFYUN_SUPERNATURAL_URL || '',
    });
});

// 获取 Operit 配置（只读；运行时改写配置的 POST 端点已移除——配置一律经 env，防未授权 SSRF）
router.get('/operit/config', (req: Request, res: Response) => {
    res.json(getOperitConfig());
});

export default router;
